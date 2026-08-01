import { z } from 'zod';
import { err, notFound, ok, validation } from '@relayflow/core';
import {
  deriveStartupCycleStage,
  effectiveDeadline,
  isProtected,
  isSelectable,
  positionId,
  reservesHours,
  startupCycleFlags,
  totalWeeklyHours,
  type BoardFlag,
  type Candidate,
  type CandidateDocument,
  type Position,
  type Selection,
  type Startup,
  type StartupCycleFacts,
  type StartupCycleStage,
  type StartupId,
} from '@relayflow/entities';
import { defineUseCase, requireActor } from '../use-case';

/**
 * The three remaining QSTP screens: startups, positions and candidates.
 *
 * Each is a queue view rather than a browser — the question is never "show me
 * everything" but "who is behind, what needs reviewing, who has not been sent
 * anywhere yet". The read models answer those directly.
 */

// ─── Startups ────────────────────────────────────────────────────────────────

export interface StartupSummary {
  readonly startup: Startup;
  readonly allocatedHours: number;
  readonly positionCount: number;
  readonly positionHours: number;
  readonly selectionCount: number;
  readonly hasApprovedException: boolean;
  /** Deadline in force for them, after any approved extension. */
  readonly selectionDeadline: string;
  readonly overdue: boolean;
  /** Nothing submitted despite holding hours. */
  readonly silent: boolean;
  readonly score: number | null;
  readonly poolSize: number;
  readonly documentsOutstanding: number;
  readonly documentsTotal: number;
  /** Which board column they sit in — derived, never stored. */
  readonly stage: StartupCycleStage;
  readonly flags: readonly BoardFlag[];
  /**
   * The raw facts the stage and flags were computed from.
   *
   * Sent to the browser so the board can refuse an illegal drag on the spot
   * instead of after a round trip. The server recomputes them from storage
   * before acting on any move — this copy is for responsiveness, never for
   * authority.
   */
  readonly facts: StartupCycleFacts;
}

/**
 * One read behind both the startups table and the startup-cycle board.
 *
 * They are two renderings of the same question — the table sorts and filters
 * it, the board groups it by stage — so they must not drift by being fed from
 * two different queries. Loading pools and documents here costs a little more
 * than the table alone needs, and buys a board that cannot contradict it.
 */
export const listStartupSummaries = defineUseCase({
  name: 'qstp.listStartups',
  input: z.object({}),
  authorize: { capability: 'startup:read_all' as const },

  execute: async (ctx) => {
    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [startups, allocations, positions, selections, exceptions, pool] = await Promise.all([
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.allocations.listForCycle(cycle.id),
      ctx.repos.positions.listForCycle(cycle.id),
      ctx.repos.selections.listForCycle(cycle.id),
      ctx.repos.exceptions.listForCycle(cycle.id),
      ctx.repos.candidates.listPoolForCycle(cycle.id),
    ]);
    if (!startups.ok) return err(startups.error);
    if (!allocations.ok) return err(allocations.error);
    if (!positions.ok) return err(positions.error);
    if (!selections.ok) return err(selections.error);
    if (!exceptions.ok) return err(exceptions.error);
    if (!pool.ok) return err(pool.error);

    // Paperwork, but only for people who actually reached onboarding — reading
    // every candidate's documents to render a board would be indefensible.
    const documentsByStartup = new Map<StartupId, CandidateDocument[]>();
    for (const selection of selections.data.filter((s) => s.status === 'confirmed')) {
      const theirs = await ctx.repos.documents.listForCandidate(selection.candidateId);
      if (!theirs.ok) return err(theirs.error);
      const list = documentsByStartup.get(selection.startupId) ?? [];
      list.push(...theirs.data);
      documentsByStartup.set(selection.startupId, list);
    }

    const now = ctx.clock.now().toISOString();

    const summaries: StartupSummary[] = startups.data.map((startup) => {
      const allocation = allocations.data.find((a) => a.startupId === startup.id);
      const allocatedHours =
        allocation?.status === 'confirmed' ? allocation.weeklyHours : 0;

      const theirPositions = positions.data.filter(
        (p) => p.startupId === startup.id && reservesHours(p.status),
      );
      const positionIds = new Set(
        positions.data.filter((p) => p.startupId === startup.id).map((p) => p.id),
      );
      const theirPool = pool.data.filter((row) => positionIds.has(row.entry.positionId));

      const theirs = exceptions.data.filter((e) => e.startupId === startup.id);
      const deadline = effectiveDeadline(
        cycle.deadlines.candidateSelection,
        theirs,
        'candidate_selection',
      );
      const theirSelections = selections.data.filter(
        (s) => s.startupId === startup.id && s.status !== 'released',
      );
      const documents = documentsByStartup.get(startup.id) ?? [];

      const facts: StartupCycleFacts = {
        evaluated: allocation !== undefined,
        allocatedHours,
        positionsSubmitted: theirPositions.length,
        positionsApproved: theirPositions.filter(
          (p) => p.status === 'approved' || p.status === 'filled',
        ).length,
        poolSize: theirPool.length,
        poolReviewed: theirPool.filter((row) => row.entry.status !== 'pending').length,
        activeSelections: theirSelections.filter(
          (s) => s.status === 'reserved' || s.status === 'confirmed',
        ).length,
        confirmedSelections: theirSelections.filter((s) => s.status === 'confirmed').length,
        documentsTotal: documents.length,
        documentsOutstanding: documents.filter((d) => d.status !== 'verified').length,
        documentsAwaitingQstp: documents.filter((d) => d.status === 'submitted').length,
        positionsAwaitingReview: theirPositions.filter((p) => p.status === 'submitted').length,
        pendingExceptions: theirs.filter((e) => e.status === 'pending').length,
        approvedException: isProtected(theirs, 'candidate_selection'),
        overdue: now > deadline,
      };

      return {
        startup,
        allocatedHours,
        positionCount: theirPositions.length,
        positionHours: theirPositions.reduce((total, p) => total + totalWeeklyHours(p), 0),
        selectionCount: theirSelections.length,
        hasApprovedException: facts.approvedException,
        selectionDeadline: deadline,
        overdue: allocatedHours > 0 && now > deadline && theirSelections.length === 0,
        silent: allocatedHours > 0 && theirPositions.length === 0,
        score: allocation?.score ?? null,
        poolSize: facts.poolSize,
        documentsOutstanding: facts.documentsOutstanding,
        documentsTotal: facts.documentsTotal,
        stage: deriveStartupCycleStage(facts),
        flags: startupCycleFlags(facts),
        facts,
      };
    });

    // Problems first, then by allocation. A list sorted alphabetically buries
    // the two startups that need chasing.
    return ok(
      summaries.sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          Number(b.silent) - Number(a.silent) ||
          b.allocatedHours - a.allocatedHours,
      ),
    );
  },
});

// ─── Positions tracker ───────────────────────────────────────────────────────

export interface PositionRow {
  readonly position: Position;
  readonly startup: Startup | null;
  readonly poolSize: number;
  readonly selectionCount: number;
}

export interface PositionTracker {
  readonly rows: readonly PositionRow[];
  /** Startups holding hours that have submitted nothing at all. */
  readonly notStarted: readonly { startup: Startup; allocatedHours: number }[];
  readonly submissionDeadline: string;
  readonly deadlinePassed: boolean;
}

export const getPositionTracker = defineUseCase({
  name: 'qstp.positionTracker',
  input: z.object({}),
  authorize: { capability: 'position:read_all' as const },

  execute: async (ctx) => {
    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [startups, allocations, positions, selections] = await Promise.all([
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.allocations.listForCycle(cycle.id),
      ctx.repos.positions.listForCycle(cycle.id),
      ctx.repos.selections.listForCycle(cycle.id),
    ]);
    if (!startups.ok) return err(startups.error);
    if (!allocations.ok) return err(allocations.error);
    if (!positions.ok) return err(positions.error);
    if (!selections.ok) return err(selections.error);

    const rows: PositionRow[] = [];
    for (const position of positions.data) {
      const pool = await ctx.repos.candidates.listPool(position.id);
      if (!pool.ok) return err(pool.error);

      rows.push({
        position,
        startup: startups.data.find((s) => s.id === position.startupId) ?? null,
        poolSize: pool.data.length,
        selectionCount: selections.data.filter(
          (s: Selection) => s.positionId === position.id && s.status !== 'released',
        ).length,
      });
    }

    const withPositions = new Set(positions.data.map((p) => p.startupId));
    const notStarted: { startup: Startup; allocatedHours: number }[] = [];
    for (const allocation of allocations.data) {
      if (allocation.status !== 'confirmed') continue;
      if (allocation.weeklyHours === 0) continue;
      if (withPositions.has(allocation.startupId)) continue;
      const startup = startups.data.find((s) => s.id === allocation.startupId);
      if (startup) notStarted.push({ startup, allocatedHours: allocation.weeklyHours });
    }

    // Awaiting review first — that is the only group with an action on it.
    const rank = (status: Position['status']) =>
      status === 'submitted' ? 0 : status === 'changes_requested' ? 1 : 2;

    return ok<PositionTracker>({
      rows: rows.sort((a, b) => rank(a.position.status) - rank(b.position.status)),
      notStarted,
      submissionDeadline: cycle.deadlines.positionSubmission,
      deadlinePassed: ctx.clock.now().toISOString() > cycle.deadlines.positionSubmission,
    });
  },
});

/** Approve a submitted role, or send it back with a note. */
export const reviewPosition = defineUseCase({
  name: 'qstp.reviewPosition',

  input: z
    .object({
      positionId,
      decision: z.enum(['approved', 'changes_requested']),
      note: z.string().trim().max(2000).nullable().default(null),
    })
    .refine((input) => input.decision === 'approved' || !!input.note?.trim(), {
      // Sending a role back without saying why leaves the startup guessing.
      message: 'Say what needs changing.',
      path: ['note'],
    }),

  authorize: { capability: 'position:review' as const },

  execute: async (ctx, input) => {
    const position = await ctx.repos.positions.findById(input.positionId);
    if (!position.ok) return position;
    if (!position.data) return err(notFound('Position not found.'));

    if (position.data.status !== 'submitted' && position.data.status !== 'changes_requested') {
      return err(validation('That position is not awaiting review.'));
    }

    const updated = await ctx.repos.positions.updateStatus(
      input.positionId,
      input.decision,
      input.note,
    );
    if (!updated.ok) return updated;

    ctx.logger.info('position reviewed', {
      positionId: input.positionId,
      decision: input.decision,
    });

    return ok(updated.data);
  },
});

// ─── Candidates ──────────────────────────────────────────────────────────────

export interface CandidateRow {
  readonly candidate: Candidate;
  /** Positions this person has been shared with. */
  readonly pools: readonly { positionId: string; positionTitle: string; startupName: string }[];
  readonly selection: Selection | null;
  readonly heldBy: string | null;
}

export interface CandidateAdminView {
  readonly rows: readonly CandidateRow[];
  /** Approved roles a pool can be shared with. */
  readonly shareablePositions: readonly {
    id: string;
    title: string;
    startupName: string;
    startupId: StartupId;
    poolSize: number;
  }[];
  readonly unassigned: number;
  readonly unconfirmed: number;
}

export const getCandidateAdminView = defineUseCase({
  name: 'qstp.candidates',
  input: z.object({}),
  authorize: { capability: 'candidate:read_all' as const },

  execute: async (ctx) => {
    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [candidates, positions, startups, selections] = await Promise.all([
      ctx.repos.candidates.listForCycle(cycle.id),
      ctx.repos.positions.listForCycle(cycle.id),
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.selections.listForCycle(cycle.id),
    ]);
    if (!candidates.ok) return err(candidates.error);
    if (!positions.ok) return err(positions.error);
    if (!startups.ok) return err(startups.error);
    if (!selections.ok) return err(selections.error);

    const nameOf = (id: StartupId) => startups.data.find((s) => s.id === id)?.name ?? 'Unknown';

    // One pool read per position, joined into a candidate-keyed map.
    const poolsByCandidate = new Map<string, CandidateRow['pools'][number][]>();
    const shareable: {
      id: string;
      title: string;
      startupName: string;
      startupId: StartupId;
      poolSize: number;
    }[] = [];

    for (const position of positions.data) {
      const pool = await ctx.repos.candidates.listPool(position.id);
      if (!pool.ok) return err(pool.error);

      if (position.status === 'approved' || position.status === 'submitted') {
        shareable.push({
          id: position.id,
          title: position.title,
          startupName: nameOf(position.startupId),
          startupId: position.startupId,
          poolSize: pool.data.length,
        });
      }

      for (const row of pool.data) {
        const list = poolsByCandidate.get(row.candidate.id) ?? [];
        list.push({
          positionId: position.id,
          positionTitle: position.title,
          startupName: nameOf(position.startupId),
        });
        poolsByCandidate.set(row.candidate.id, list);
      }
    }

    const rows: CandidateRow[] = candidates.data.map((candidate) => {
      const held =
        selections.data.find(
          (s) =>
            s.candidateId === candidate.id &&
            (s.status === 'reserved' || s.status === 'confirmed'),
        ) ?? null;

      return {
        candidate,
        pools: poolsByCandidate.get(candidate.id) ?? [],
        selection: held,
        heldBy: held ? nameOf(held.startupId) : null,
      };
    });

    return ok<CandidateAdminView>({
      // Unassigned and still selectable first: those are the ones QSTP can act on.
      rows: rows.sort(
        (a, b) =>
          Number(b.pools.length === 0 && isSelectable(b.candidate.availability)) -
          Number(a.pools.length === 0 && isSelectable(a.candidate.availability)),
      ),
      shareablePositions: shareable,
      unassigned: rows.filter((row) => row.pools.length === 0).length,
      unconfirmed: rows.filter((row) => row.candidate.availability === 'unconfirmed').length,
    });
  },
});

/** Import a batch of candidates from Deema or a CSV. */
export const importCandidates = defineUseCase({
  name: 'qstp.importCandidates',

  input: z.object({
    source: z.enum(['deema', 'csv', 'manual']),
    rows: z
      .array(
        z.object({
          fullName: z.string().trim().min(1).max(200),
          email: z.email(),
          skills: z.array(z.string().trim().max(60)).default([]),
          cvUrl: z.url().nullable().default(null),
          githubUrl: z.url().nullable().default(null),
        }),
      )
      .min(1, 'Nothing to import.')
      .max(500, 'Import in batches of 500 or fewer.'),
  }),

  authorize: { capability: 'candidate:import' as const },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const result = await ctx.repos.candidates.importMany({
      cycleId: cycle.id,
      source: input.source,
      rows: input.rows,
      importedAt: ctx.clock.now().toISOString(),
    });
    if (!result.ok) return result;

    ctx.logger.info('candidates imported', {
      source: input.source,
      imported: result.data.imported,
      duplicates: result.data.duplicates,
    });

    return ok(result.data);
  },
});

/** Hand a set of candidates to a startup for one position. */
export const sharePool = defineUseCase({
  name: 'qstp.sharePool',

  input: z.object({
    positionId,
    candidateIds: z.array(z.uuid()).min(1, 'Choose at least one candidate.'),
  }),

  authorize: { capability: 'candidate:share_pool' as const },

  execute: async (ctx, input) => {
    const position = await ctx.repos.positions.findById(input.positionId);
    if (!position.ok) return position;
    if (!position.data) return err(notFound('Position not found.'));

    // Sharing against a role that has not been approved would let a startup
    // start interviewing for something QSTP has not agreed to fund.
    if (position.data.status !== 'approved' && position.data.status !== 'submitted') {
      return err(validation('That position is not open to receive candidates.'));
    }

    const shared = await ctx.repos.candidates.shareWithPosition({
      positionId: input.positionId,
      // Validated as uuids above; the brand is a compile-time distinction only.
      candidateIds: input.candidateIds as unknown as Parameters<
        typeof ctx.repos.candidates.shareWithPosition
      >[0]['candidateIds'],
      sharedAt: ctx.clock.now().toISOString(),
    });
    if (!shared.ok) return shared;

    ctx.logger.info('pool shared', {
      positionId: input.positionId,
      added: shared.data.added,
      skipped: shared.data.skipped,
    });

    return ok(shared.data);
  },
});
