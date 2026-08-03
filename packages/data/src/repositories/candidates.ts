import { err, ok } from '@relayflow/core';
import {
  candidateEntity,
  interviewEntity,
  poolEntryEntity,
  taskAssignmentEntity,
  taskTemplateEntity,
} from '@relayflow/entities';
import type {
  CandidatePort,
  InterviewPort,
  PoolEntryWithCandidate,
  TaskPort,
} from '@relayflow/ports';
import type { RlsClient } from '../client';
import { fromPostgrest } from '../errors';
import { run, runMaybe, runSingle } from '../repository';
import { callRpc } from '../transaction';

/** Candidates, the pools they sit in, interviews, and take-home tasks. */

/**
 * A pool entry always travels with its candidate.
 *
 * Every screen that shows a pool shows the person, so fetching them separately
 * would be one query per row for a list whose whole purpose is to be scanned.
 * The embed is `candidates!inner` so an entry whose candidate the actor may not
 * read disappears entirely rather than arriving half-populated.
 */
const POOL_WITH_CANDIDATE = '*, candidates!inner(*)';

interface PoolRow {
  readonly candidates: unknown;
  readonly [key: string]: unknown;
}

function toPoolEntries(rows: readonly unknown[]): PoolEntryWithCandidate[] {
  return rows.map((row) => {
    const { candidates, ...entry } = row as PoolRow;
    return { entry: poolEntryEntity.parse(entry), candidate: candidateEntity.parse(candidates) };
  });
}

export function candidatesRepository(client: RlsClient): CandidatePort {
  return {
    findById: (id) =>
      runMaybe(
        client.from('candidates').select('*').eq('id', id).maybeSingle(),
        candidateEntity.parse,
        { table: 'candidates', candidateId: id },
      ),

    listForCycle: (cycleId) =>
      run(
        client
          .from('candidates')
          .select('*')
          .eq('cycle_id', cycleId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1000),
        candidateEntity.parseMany,
        { table: 'candidates', cycleId },
      ),

    listPool: async (positionId) => {
      const { data, error } = await client
        .from('pool_entries')
        .select(POOL_WITH_CANDIDATE)
        .eq('position_id', positionId);
      if (error) return err(fromPostgrest(error, { table: 'pool_entries', positionId }));
      return ok(toPoolEntries(data ?? []));
    },

    /**
     * Every pool entry in the cycle, in one query.
     *
     * The QSTP board asks "how far has each of thirty startups got?" — without
     * this it is one query per position, which is a screen's layout dictating a
     * database's access pattern.
     */
    listPoolForCycle: async (cycleId) => {
      const { data, error } = await client
        .from('pool_entries')
        .select(`${POOL_WITH_CANDIDATE}, positions!inner(cycle_id)`)
        .eq('positions.cycle_id', cycleId)
        .limit(5000);
      if (error) return err(fromPostgrest(error, { table: 'pool_entries', cycleId }));
      return ok(toPoolEntries(data ?? []));
    },

    findPoolEntry: (id) =>
      runMaybe(
        client.from('pool_entries').select('*').eq('id', id).maybeSingle(),
        poolEntryEntity.parse,
        { table: 'pool_entries', poolEntryId: id },
      ),

    /**
     * Availability cascades: someone who has become unavailable is withdrawn
     * from every pool and their live claims are released, in one transaction.
     * Leaving them is how a startup interviews a person who took another job.
     */
    setAvailability: (id, availability) =>
      callRpc(
        client,
        'set_candidate_availability',
        { p_candidate_id: id, p_availability: availability },
        candidateEntity.parse,
      ),

    importMany: async (input) => {
      // De-duplicated before sending, so the count below means what it says.
      // Two identical rows in one CSV are one candidate and one duplicate, not
      // one candidate and nothing.
      const byEmail = new Map(
        input.rows.map((row) => [
          row.email.trim().toLowerCase(),
          {
            fullName: row.fullName,
            email: row.email.trim().toLowerCase(),
            skills: row.skills,
            cvUrl: row.cvUrl,
            source: input.source,
          },
        ]),
      );

      const result = await callRpc(
        client,
        'import_candidates',
        { p_cycle_id: input.cycleId, p_candidates: [...byEmail.values()] },
        (value) => candidateEntity.parseMany(value as readonly unknown[]),
      );
      if (!result.ok) return result;

      // `import_candidates` upserts on (cycle_id, email) and returns every row
      // it touched, so "how many were already here" is counted rather than
      // inferred from the returned length.
      const existing = await client
        .from('candidates')
        .select('email')
        .eq('cycle_id', input.cycleId)
        .in('email', [...byEmail.keys()]);
      const before = new Set((existing.data ?? []).map((row) => row.email));
      const created = result.data.filter((candidate) => !before.has(candidate.email));

      return ok({
        imported: created.length,
        duplicates: result.data.length - created.length,
        candidates: result.data,
      });
    },

    shareWithPosition: async (input) => {
      const shared = await callRpc(
        client,
        'share_pool',
        { p_position_id: input.positionId, p_candidate_ids: [...input.candidateIds] },
        (value) => (value as readonly unknown[]).length,
      );
      if (!shared.ok) return shared;
      // `on conflict do nothing`, so anyone already in the pool is absent from
      // the return. Re-sharing is a no-op and says so rather than erroring —
      // operators will click twice.
      return ok({
        added: shared.data,
        skipped: input.candidateIds.length - shared.data,
      });
    },

    /**
     * Bookkeeping about one startup's own review pipeline.
     *
     * Deliberately not a claim on the person: this status is advisory and
     * private to one startup, while `selections.reserve` is exclusive and
     * races. Conflating them is how two startups end up believing they hired
     * the same intern.
     */
    updatePoolEntry: (input) =>
      runSingle(
        client
          .from('pool_entries')
          .update({ status: input.status, reviewed_at: input.reviewedAt })
          .eq('id', input.poolEntryId)
          .select('*')
          .single(),
        poolEntryEntity.parse,
        { table: 'pool_entries', poolEntryId: input.poolEntryId },
      ),
  };
}

export function interviewsRepository(client: RlsClient): InterviewPort {
  return {
    findById: (id) =>
      runMaybe(
        client.from('interviews').select('*').eq('id', id).maybeSingle(),
        interviewEntity.parse,
        { table: 'interviews', interviewId: id },
      ),

    listForPosition: (positionId) =>
      run(
        client.from('interviews').select('*').eq('position_id', positionId).order('scheduled_for'),
        interviewEntity.parseMany,
        { table: 'interviews', positionId },
      ),

    listForCandidate: (candidateId) =>
      run(
        client.from('interviews').select('*').eq('candidate_id', candidateId).order('scheduled_for'),
        interviewEntity.parseMany,
        { table: 'interviews', candidateId },
      ),

    // Every interview method is a single-table write, and `interviews_write`
    // already scopes it to the position's startup. No function required.
    schedule: (input) =>
      runSingle(
        client
          .from('interviews')
          .insert({
            position_id: input.positionId,
            candidate_id: input.candidateId,
            mode: input.mode,
            status: 'scheduled',
            scheduled_for: input.scheduledFor,
            duration_minutes: input.durationMinutes,
            location: input.location,
            interviewer_id: input.interviewerId,
          })
          .select('*')
          .single(),
        interviewEntity.parse,
        { table: 'interviews', positionId: input.positionId },
      ),

    request: (input) =>
      runSingle(
        client
          .from('interviews')
          .insert({
            position_id: input.positionId,
            candidate_id: input.candidateId,
            mode: input.mode,
            status: 'requested',
            interviewer_id: input.interviewerId,
          })
          .select('*')
          .single(),
        interviewEntity.parse,
        { table: 'interviews', positionId: input.positionId },
      ),

    transition: (input) =>
      runSingle(
        client
          .from('interviews')
          .update({
            status: input.status,
            ...(input.scheduledFor === undefined ? {} : { scheduled_for: input.scheduledFor }),
            ...(input.durationMinutes === undefined
              ? {}
              : { duration_minutes: input.durationMinutes }),
            ...(input.location === undefined ? {} : { location: input.location }),
          })
          .eq('id', input.interviewId)
          .select('*')
          .single(),
        interviewEntity.parse,
        { table: 'interviews', interviewId: input.interviewId },
      ),

    /**
     * Attaches a recording and moves transcription to `processing`.
     *
     * The fixtures adapter returns a finished transcript synchronously, which
     * is the one place it is *less* honest than this one: transcription takes
     * minutes and fails. Nothing here writes `transcript` — a worker does, and
     * until then the UI reads `transcriptStatus` rather than inferring success
     * from the presence of text.
     */
    attachRecording: (input) =>
      runSingle(
        client
          .from('interviews')
          .update({
            status: 'completed',
            recording_url: input.recordingUrl,
            transcript_status: 'processing',
          })
          .eq('id', input.interviewId)
          .select('*')
          .single(),
        interviewEntity.parse,
        { table: 'interviews', interviewId: input.interviewId },
      ),

    saveFeedback: (input) =>
      runSingle(
        client
          .from('interviews')
          .update({ feedback: input.feedback, recommendation: input.recommendation })
          .eq('id', input.interviewId)
          .select('*')
          .single(),
        interviewEntity.parse,
        { table: 'interviews', interviewId: input.interviewId },
      ),
  };
}

export function tasksRepository(client: RlsClient): TaskPort {
  return {
    listTemplates: (positionId) =>
      run(
        client.from('task_templates').select('*').eq('position_id', positionId),
        taskTemplateEntity.parseMany,
        { table: 'task_templates', positionId },
      ),

    saveTemplate: (input) =>
      runSingle(
        client
          .from('task_templates')
          .insert({
            cycle_id: input.cycleId,
            position_id: input.positionId,
            title: input.title,
            instructions: input.instructions,
            created_by: input.createdBy,
          })
          .select('*')
          .single(),
        taskTemplateEntity.parse,
        { table: 'task_templates', positionId: input.positionId },
      ),

    listAssignments: (candidateId) =>
      run(
        client.from('task_assignments').select('*').eq('candidate_id', candidateId),
        taskAssignmentEntity.parseMany,
        { table: 'task_assignments', candidateId },
      ),

    listForCycle: (cycleId) =>
      run(
        client.from('task_assignments').select('*').eq('cycle_id', cycleId).limit(2000),
        taskAssignmentEntity.parseMany,
        { table: 'task_assignments', cycleId },
      ),

    assign: (input) =>
      runSingle(
        client
          .from('task_assignments')
          .insert({
            cycle_id: input.cycleId,
            template_id: input.templateId,
            position_id: input.positionId,
            candidate_id: input.candidateId,
            status: 'assigned',
            due_at: input.dueAt,
          })
          .select('*')
          .single(),
        taskAssignmentEntity.parse,
        { table: 'task_assignments', candidateId: input.candidateId },
      ),

    /**
     * `late_accepted` is computed from the deadline, not taken from the caller.
     *
     * A late submission that was accepted anyway is a decision somebody made,
     * and the deadline report should still show it — which it cannot if the
     * client gets to say whether its own submission was late.
     */
    submit: async (assignmentId, candidateId, fileName, linkUrl, occurredAt) => {
      const current = await client
        .from('task_assignments')
        .select('due_at')
        .eq('id', assignmentId)
        .eq('candidate_id', candidateId)
        .maybeSingle();
      if (current.error) {
        return err(fromPostgrest(current.error, { table: 'task_assignments', assignmentId }));
      }
      if (!current.data) {
        return err(fromPostgrest({ code: 'PGRST116' } as never, { assignmentId }));
      }

      return runSingle(
        client
          .from('task_assignments')
          .update({
            status: 'submitted',
            submitted_at: occurredAt,
            late_accepted: occurredAt > current.data.due_at,
            file_name: fileName,
            link_url: linkUrl,
          })
          .eq('id', assignmentId)
          .eq('candidate_id', candidateId)
          .select('*')
          .single(),
        taskAssignmentEntity.parse,
        { table: 'task_assignments', assignmentId },
      );
    },

    review: (assignmentId, reviewerId, notes) =>
      runSingle(
        client
          .from('task_assignments')
          .update({ status: 'reviewed', review_notes: notes, reviewed_by: reviewerId })
          .eq('id', assignmentId)
          .select('*')
          .single(),
        taskAssignmentEntity.parse,
        { table: 'task_assignments', assignmentId },
      ),

    withdraw: (assignmentId) =>
      runSingle(
        client
          .from('task_assignments')
          .update({ status: 'withdrawn' })
          .eq('id', assignmentId)
          .select('*')
          .single(),
        taskAssignmentEntity.parse,
        { table: 'task_assignments', assignmentId },
      ),
  };
}
