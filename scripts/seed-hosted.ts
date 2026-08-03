/**
 * Write the demo world into the hosted Supabase project.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm seed:hosted
 *
 * A script rather than `supabase/seed.sql` or a seed migration, for three
 * reasons that all point the same way:
 *
 *   It imports the actual fixture module, so the world in Postgres is by
 *   construction the world `packages/fixtures/src/repositories.test.ts` asserts
 *   against. A hand-transcribed SQL copy would drift the first time either side
 *   changed, and nobody would notice until a demo.
 *
 *   `auth.users` cannot be seeded with SQL. A valid password needs a bcrypt
 *   hash and a matching `auth.identities` row, and only GoTrue writes those.
 *   `auth.admin.createUser` accepts an explicit `id`, which is what makes
 *   `public.users.id = auth.users.id` hold — and that equality is what makes
 *   every `auth.uid()` comparison in the RLS policies work.
 *
 *   Demo data does not belong in the append-only migration chain, which also
 *   runs against production.
 *
 * Idempotent: every table is upserted on its primary key and existing auth
 * users are skipped, so re-running refreshes rather than duplicates.
 *
 * Uses the service-role client, which bypasses RLS. That is correct here and
 * nowhere else: seeding writes rows on behalf of seven different people, and no
 * single caller could do it under their own policies. The web app is forbidden
 * from importing this client at all — see apps/web/eslint.config.mjs.
 */

import { createAdminClient } from '@relayflow/data/admin';
import { createStore, ids, users, DEV_ACTORS } from '@relayflow/fixtures';
import type { FixtureStore } from '@relayflow/fixtures';

/** One password for every seeded account, matching apps/web/src/server/auth.ts. */
const DEMO_PASSWORD = 'Pass123';

const admin = createAdminClient({
  reason: 'One-off seed of the demo cohort into the hosted project.',
});

type Row = Record<string, unknown>;

async function upsert(table: string, rows: Row[], onConflict = 'id'): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin.from(table as never).upsert(rows as never, { onConflict });
  if (error) {
    throw new Error(`${table}: ${error.message}${error.details ? ` — ${error.details}` : ''}`);
  }
  process.stdout.write(`  ${table.padEnd(34)} ${String(rows.length).padStart(4)}\n`);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Every seeded account's auth id, by email.
 *
 * Paged, because `listUsers` returns 50 at a time and a project that has been
 * signed into by hand has more than the seven people in here.
 */
async function existingAuthUsers(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth.users list: ${error.message}`);
    for (const user of data.users) {
      if (user.email) found.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < 200) return found;
  }
}

/**
 * The demo cohort, with `auth.users.id` equal to the fixture id.
 *
 * That equality is load-bearing rather than tidy: `public.users.id` is a
 * foreign key onto `auth.users (id)`, and every RLS policy in the schema
 * compares against `auth.uid()`. An account created any other way — the
 * sign-up form, `scripts/seed-auth-users.mjs`, a colleague clicking "Add user"
 * in the dashboard — gets a random id instead, and then two things happen:
 * this seed fails on the foreign key, and if it somehow did not, the person
 * would sign in successfully and resolve to nobody.
 *
 * So an account whose id is wrong is deleted and recreated rather than skipped.
 * That is destructive, and it is the only destructive thing this script does,
 * which is why it is limited to the seven fictional demo emails and says out
 * loud which ones it replaced. Their `public` rows go with them by cascade and
 * are written again moments later by `seedDomain`.
 */
async function seedAuthUsers(): Promise<void> {
  const existing = await existingAuthUsers();
  const replaced: string[] = [];

  for (const user of users) {
    const current = existing.get(user.email.toLowerCase());

    if (current === user.id) continue;

    if (current) {
      const { error } = await admin.auth.admin.deleteUser(current);
      if (error) {
        throw new Error(
          `auth.users ${user.email}: exists with id ${current}, which is not the seeded id ` +
            `${user.id}, and could not be replaced — ${error.message}`,
        );
      }
      replaced.push(user.email);
    }

    const { error } = await admin.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: DEMO_PASSWORD,
      // No confirmation mail and no invite flow. These are fictional people in
      // a demo project; there is nobody to confirm.
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (error) throw new Error(`auth.users ${user.email}: ${error.message}`);
  }

  process.stdout.write(`  ${'auth.users'.padEnd(34)} ${String(users.length).padStart(4)}\n`);
  if (replaced.length > 0) {
    process.stdout.write(
      `  ${'  replaced (id did not match)'.padEnd(34)} ${String(replaced.length).padStart(4)}` +
        `  ${replaced.join(', ')}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Domain → row
// ---------------------------------------------------------------------------

const nullable = <T>(value: T | undefined): T | null => value ?? null;

async function seedDomain(store: FixtureStore): Promise<void> {
  await upsert(
    'users',
    users.map((user) => ({ id: user.id, email: user.email, full_name: user.fullName })),
  );

  // The three QSTP personas exist only in `DEV_ACTORS`; there is no fixture
  // table for them, because on fixtures the actor IS the staff record.
  await upsert(
    'qstp_staff',
    (['manager', 'operations', 'auditor'] as const).map((persona) => {
      const actor = DEV_ACTORS[persona]();
      if (actor.kind !== 'qstp') throw new Error(`${persona} is not a QSTP actor`);
      return { user_id: actor.userId, role: actor.role };
    }),
    'user_id',
  );

  await upsert(
    'startups',
    store.startups.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      contact_email: row.contactEmail,
      sector: row.sector,
    })),
  );

  await upsert(
    'startup_members',
    store.startupMembers.map((row) => ({
      id: row.id,
      startup_id: row.startupId,
      user_id: row.userId,
      role: row.role,
      status: row.status,
    })),
  );

  /**
   * `cycles_single_active_idx` permits one live cycle; `createStore()` builds
   * two — Spring in `completion` and an Autumn one in `allocation`.
   *
   * The second is seeded as `draft` rather than relaxing the index. The index
   * is what lets `findActive()` be a `maybeSingle` instead of an ordered guess,
   * and a product where "which cycle am I in" has two answers is a product
   * where every query is subtly wrong. Two concurrent cycles is open decision 1
   * in the PRD; until it is settled, the database keeps its opinion.
   */
  const [primary, ...rest] = [...store.cycles].sort((a, b) =>
    a.id === ids.cycle ? -1 : b.id === ids.cycle ? 1 : 0,
  );
  if (!primary) throw new Error('the fixture store has no cycles');

  await upsert('cycles', [primary, ...rest].map((row, index) => ({
    id: row.id,
    name: row.name,
    stage: index === 0 ? row.stage : 'draft',
    starts_on: row.startsOn,
    ends_on: row.endsOn,
    funded_weekly_hours: row.fundedWeeklyHours,
    selection_mode: row.selectionMode,
    deadlines: row.deadlines,
    archived_at: row.archivedAt,
  })));

  await upsert(
    'cycle_participations',
    store.participations.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      startup_id: row.startupId,
      status: row.status,
      requested_total_hours: row.requestedTotalHours,
      requested_intern_count: row.requestedInternCount,
      disciplines: row.disciplines,
      operator_score: row.operatorScore,
      internal_notes: row.internalNotes,
      startup_justification: row.startupJustification,
      allocation_acknowledged_at: row.allocationAcknowledgedAt,
      allocation_acknowledged_by: row.allocationAcknowledgedBy,
    })),
  );

  await upsert(
    'allocations',
    store.allocations.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      startup_id: row.startupId,
      weekly_hours: row.weeklyHours,
      status: row.status,
      score: row.score,
      justification: row.justification,
      override_reason: row.overrideReason,
      from_redistribution: row.fromRedistribution,
      revision: row.revision,
      supersedes_allocation_id: row.supersedesAllocationId,
      redistribution_round_id: row.redistributionRoundId,
      decided_by: row.decidedBy,
      decided_at: row.decidedAt,
    })),
  );

  await upsert(
    'positions',
    store.positions.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      startup_id: row.startupId,
      title: row.title,
      description: row.description,
      required_skills: row.requiredSkills,
      work_arrangement: row.workArrangement,
      additional_requirements: row.additionalRequirements,
      intern_count: row.internCount,
      hours_per_intern: row.hoursPerIntern,
      duration_weeks: row.durationWeeks,
      supervisor_id: row.supervisorId,
      supervisor_name: row.supervisorName,
      status: row.status,
      review_note: row.reviewNote,
    })),
  );

  /**
   * The candidate's user id, which the fixture actor carries and the candidate
   * row does not. Without it `owns_candidate()` is false for Layla and her
   * whole portal is empty — the single most confusing possible outcome of a
   * successful seed.
   */
  const candidateActor = DEV_ACTORS.candidate();
  const candidateUserId = candidateActor.kind === 'candidate' ? candidateActor.userId : null;

  await upsert(
    'candidates',
    store.candidates.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      user_id: row.id === ids.canLayla ? candidateUserId : null,
      full_name: row.fullName,
      email: row.email,
      phone: nullable(row.phone),
      skills: row.skills,
      cv_url: row.cvUrl,
      availability: row.availability,
      availability_confirmed_at: row.availabilityConfirmedAt,
      source: row.source,
    })),
  );

  await upsert(
    'pool_entries',
    store.poolEntries.map((row) => ({
      id: row.id,
      position_id: row.positionId,
      candidate_id: row.candidateId,
      status: row.status,
      shared_at: row.sharedAt,
      reviewed_at: row.reviewedAt,
    })),
  );

  await upsert(
    'selections',
    store.selections.map((row) => ({
      id: row.id,
      position_id: row.positionId,
      startup_id: row.startupId,
      candidate_id: row.candidateId,
      status: row.status,
      reserved_at: row.reservedAt,
      offered_at: row.offeredAt,
      accepted_at: row.acceptedAt,
      confirmed_at: row.confirmedAt,
      released_at: row.releasedAt,
      selected_by: row.selectedBy,
      override_reason: row.overrideReason,
      overridden_by: row.overriddenBy,
    })),
  );

  await upsert(
    'interviews',
    store.interviews.map((row) => ({
      id: row.id,
      position_id: row.positionId,
      candidate_id: row.candidateId,
      mode: row.mode,
      status: row.status,
      scheduled_for: row.scheduledFor,
      duration_minutes: row.durationMinutes,
      location: row.location,
      recording_url: row.recordingUrl,
      transcript_status: row.transcriptStatus,
      transcript: row.transcript,
      ai_summary: row.aiSummary,
      feedback: row.feedback,
      recommendation: row.recommendation,
      interviewer_id: row.interviewerId,
    })),
  );

  await upsert(
    'exception_requests',
    store.exceptions.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      startup_id: row.startupId,
      kind: row.kind,
      status: row.status,
      reason: row.reason,
      requested_deadline: row.requestedDeadline,
      granted_deadline: row.grantedDeadline,
      decision_note: row.decisionNote,
      requested_by: row.requestedBy,
      decided_by: row.decidedBy,
      decided_at: row.decidedAt,
    })),
  );

  await upsert(
    'placements',
    store.placements.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      selection_id: row.selectionId,
      candidate_id: row.candidateId,
      startup_id: row.startupId,
      position_id: row.positionId,
      committed_weekly_hours: row.committedWeeklyHours,
      starts_on: row.startsOn,
      ends_on: row.endsOn,
      supervisor_id: row.supervisorId,
      supervisor_name: row.supervisorName,
      status: row.status,
      candidate_ready_at: row.candidateReadyAt,
      startup_ready_at: row.startupReadyAt,
      details_finalized_at: row.detailsFinalizedAt,
      qstp_approved_at: row.qstpApprovedAt,
      cancelled_at: row.cancelledAt,
      cancellation_reason: row.cancellationReason,
      replacement_for_placement_id: row.replacementForPlacementId,
    })),
  );

  await upsert(
    'document_requirement_templates',
    store.requirementTemplates.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      title: row.title,
      owner: row.owner,
      required: row.required,
      position_id: row.positionId,
      active: row.active,
    })),
  );

  await upsert(
    'placement_requirements',
    store.placementRequirements.map((row) => ({
      id: row.id,
      placement_id: row.placementId,
      template_id: row.templateId,
      title: row.title,
      owner: row.owner,
      required: row.required,
      status: row.status,
      amendment_reason: row.amendmentReason,
    })),
  );

  // Composite domain objects fan out to child tables. `extractedFields` is not
  // a jsonb column on the submission — it is `requirement_submission_fields`,
  // which has its own policy precisely because it holds bank details.
  await upsert(
    'requirement_submissions',
    store.requirementSubmissions.map((row) => ({
      id: row.id,
      requirement_id: row.requirementId,
      revision: row.revision,
      file_name: row.fileName,
      storage_path: row.storagePath,
      submitted_by: row.submittedBy,
      submitted_at: row.submittedAt,
      correction_reason: row.correctionReason,
    })),
  );

  await upsert(
    'requirement_submission_fields',
    store.requirementSubmissions.flatMap((submission) =>
      submission.extractedFields.map((field) => ({
        submission_id: submission.id,
        key: field.key,
        extracted: field.extracted,
        confirmed: field.confirmed,
      })),
    ),
    'submission_id,key',
  );

  await upsert(
    'candidate_documents',
    store.documents.map((row) => ({
      id: row.id,
      candidate_id: row.candidateId,
      startup_id: row.startupId,
      kind: row.kind,
      status: row.status,
      file_name: row.fileName,
      storage_path: row.storagePath,
      rejection_reason: row.rejectionReason,
      verified_by: row.verifiedBy,
      verified_at: row.verifiedAt,
    })),
  );

  await upsert(
    'candidate_document_fields',
    store.documents.flatMap((document) =>
      document.fields.map((field) => ({
        document_id: document.id,
        key: field.key,
        label: field.label,
        extracted: field.extracted,
        confirmed: field.confirmed,
        confidence: field.confidence,
      })),
    ),
    'document_id,key',
  );

  await upsert(
    'recovery_cases',
    store.recoveryCases.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      startup_id: row.startupId,
      placement_id: row.placementId,
      recoverable_hours: row.recoverableHours,
      status: row.status,
      protected_until: row.protectedUntil,
      reason: row.reason,
      confirmed_by: row.confirmedBy,
      redistribution_round_id: row.redistributionRoundId,
    })),
  );

  await upsert(
    'redistribution_rounds',
    store.redistributionRounds.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      number: row.number,
      status: row.status,
      available_hours: row.availableHours,
      position_deadline: row.positionDeadline,
      selection_deadline: row.selectionDeadline,
      created_by: row.createdBy,
      closed_at: row.closedAt,
    })),
  );

  await upsert(
    'redistribution_invitations',
    store.redistributionRounds.flatMap((round) =>
      round.invitations.map((invitation) => ({
        round_id: round.id,
        startup_id: invitation.startupId,
        status: invitation.status,
        proposed_hours: invitation.proposedHours,
        responded_at: invitation.respondedAt,
      })),
    ),
    'round_id,startup_id',
  );

  await upsert(
    'startup_ratings',
    store.startupRatings.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      startup_id: row.startupId,
      status: row.status,
      rated_by: row.ratedBy,
      supersedes_id: row.supersedesId,
      revision_reason: row.revisionReason,
      submitted_at: row.submittedAt,
    })),
  );

  await upsert(
    'startup_rating_items',
    store.startupRatings.flatMap((rating) =>
      rating.items.map((item) => ({
        rating_id: rating.id,
        dimension: item.dimension,
        value: item.value,
        rationale: item.rationale,
      })),
    ),
    'rating_id,dimension',
  );

  await upsert(
    'activity_events',
    store.activityEvents.map((row) => ({
      id: row.id,
      cycle_id: row.cycleId,
      entity_type: row.entityType,
      entity_id: row.entityId,
      action: row.action,
      actor_id: row.actorId,
      actor_role: row.actorRole,
      before: row.before,
      after: row.after,
      reason: row.reason,
      occurred_at: row.occurredAt,
    })),
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  process.stdout.write('Seeding the hosted project.\n\n');
  await seedAuthUsers();
  await seedDomain(createStore());
  process.stdout.write(
    `\nDone. Sign in as any seeded email with the password "${DEMO_PASSWORD}".\n` +
      'Files are not seeded: uploads land in storage the first time somebody uploads one.\n',
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
