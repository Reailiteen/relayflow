import { cycleEntity, cycleParticipationEntity } from '@relayflow/entities';
import type { CyclePort, ParticipationPort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { run, runMaybe, runSingle } from '../repository';
import { callRpc } from '../transaction';
import { asJson } from './shared/json';

/**
 * Cycles and participation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Two divergences from the fixtures adapter apply to every file in this
 * directory, and are stated once here rather than repeated twenty times.
 *
 * **Actor and time are server-derived.** The port commands carry `decidedBy`,
 * `confirmedBy`, `occurredAt` and friends, and the fixtures honour them. The
 * RPCs read the actor from `auth.uid()` and the moment from `now()`, so those
 * fields are ignored here. That is the correct behaviour — a client that can
 * set the audit timestamp defeats the audit log — but a test asserting an exact
 * timestamp will pass on fixtures and fail here.
 *
 * **A denied read looks like an empty one.** RLS `select` policies filter, they
 * do not raise. So a `runSingle` on a row the actor may not see returns
 * `not_found`, not `forbidden`. Every call below passes enough context for the
 * log line to say which table and which id, because "this does not exist" about
 * something that plainly does is the most confusing failure in this adapter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CYCLE = '*';

export function cyclesRepository(client: RlsClient): CyclePort {
  return {
    findById: (id) =>
      runMaybe(
        client.from('cycles').select(CYCLE).eq('id', id).maybeSingle(),
        cycleEntity.parse,
        { table: 'cycles', cycleId: id },
      ),

    /**
     * The one cycle currently being operated.
     *
     * `cycles_single_active_idx` guarantees at most one row matches, so this is
     * a `maybeSingle` rather than an ordered `limit(1)`. If a second live cycle
     * ever existed this should fail loudly rather than quietly pick one — the
     * whole product is cycle-scoped, and picking the wrong one silently is how
     * a startup ends up looking at last season's allocation.
     */
    findActive: () =>
      runMaybe(
        client
          .from('cycles')
          .select(CYCLE)
          .is('archived_at', null)
          .not('stage', 'in', '("draft","closed")')
          .maybeSingle(),
        cycleEntity.parse,
        { table: 'cycles' },
      ),

    list: () =>
      run(
        client.from('cycles').select(CYCLE).order('starts_on', { ascending: false }),
        cycleEntity.parseMany,
        { table: 'cycles' },
      ),

    create: (input) =>
      callRpc(
        client,
        'create_cycle_with_participations',
        {
          p_name: input.cycle.name,
          p_starts_on: input.cycle.startsOn,
          p_ends_on: input.cycle.endsOn,
          p_funded_weekly_hours: input.cycle.fundedWeeklyHours,
          p_selection_mode: input.cycle.selectionMode,
          p_deadlines: input.cycle.deadlines,
          p_clone_from: input.cloneParticipationFrom,
        },
        cycleEntity.parse,
      ),

    // `updated_at` is maintained by a trigger. Sending the caller's clock would
    // make this code look like it is in control of a column it is not.
    update: (input) =>
      runSingle(
        client
          .from('cycles')
          .update({
            name: input.name,
            starts_on: input.startsOn,
            ends_on: input.endsOn,
            funded_weekly_hours: input.fundedWeeklyHours,
            selection_mode: input.selectionMode,
            deadlines: asJson(input.deadlines),
          })
          .eq('id', input.cycleId)
          .is('archived_at', null)
          .select(CYCLE)
          .single(),
        cycleEntity.parse,
        { table: 'cycles', cycleId: input.cycleId },
      ),

    /**
     * `input.from` is dropped: `advance_cycle_stage` re-reads the current stage
     * `for update` and refuses anything that is not forwards. Trusting the
     * caller's idea of the current stage is exactly the read-then-write race
     * the function exists to close.
     */
    advance: (input) =>
      callRpc(
        client,
        'advance_cycle_stage',
        { p_cycle_id: input.cycleId, p_to_stage: input.to },
        cycleEntity.parse,
      ),

    archive: (id, archivedAt) =>
      runSingle(
        client.from('cycles').update({ archived_at: archivedAt }).eq('id', id).select(CYCLE).single(),
        cycleEntity.parse,
        { table: 'cycles', cycleId: id },
      ),
  };
}

export function participationRepository(client: RlsClient): ParticipationPort {
  return {
    listForCycle: (cycleId) =>
      run(
        client.from('cycle_participations').select('*').eq('cycle_id', cycleId),
        cycleParticipationEntity.parseMany,
        { table: 'cycle_participations', cycleId },
      ),

    find: (cycleId, startupId) =>
      runMaybe(
        client
          .from('cycle_participations')
          .select('*')
          .eq('cycle_id', cycleId)
          .eq('startup_id', startupId)
          .maybeSingle(),
        cycleParticipationEntity.parse,
        { table: 'cycle_participations', cycleId, startupId },
      ),

    // Upsert on the natural key rather than insert-or-update in two round
    // trips: `unique (cycle_id, startup_id)` already says there is one row per
    // startup per cycle, so let it be the thing that decides.
    save: (input) =>
      runSingle(
        client
          .from('cycle_participations')
          .upsert(
            {
              cycle_id: input.cycleId,
              startup_id: input.startupId,
              status: input.status,
              requested_total_hours: input.requestedTotalHours,
              requested_intern_count: input.requestedInternCount,
              disciplines: [...input.disciplines],
              operator_score: input.operatorScore,
              internal_notes: input.internalNotes,
              startup_justification: input.startupJustification,
            },
            { onConflict: 'cycle_id,startup_id' },
          )
          .select('*')
          .single(),
        cycleParticipationEntity.parse,
        { table: 'cycle_participations', cycleId: input.cycleId, startupId: input.startupId },
      ),

    acknowledge: (cycleId, startupId, actorId, occurredAt) =>
      runSingle(
        client
          .from('cycle_participations')
          .update({
            allocation_acknowledged_at: occurredAt,
            allocation_acknowledged_by: actorId,
          })
          .eq('cycle_id', cycleId)
          .eq('startup_id', startupId)
          .select('*')
          .single(),
        cycleParticipationEntity.parse,
        { table: 'cycle_participations', cycleId, startupId },
      ),
  };
}
