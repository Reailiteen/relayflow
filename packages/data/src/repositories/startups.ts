import { allocationEntity, startupEntity, startupMemberEntity } from '@relayflow/entities';
import type { AllocationPort, StartupPort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { run, runMaybe } from '../repository';
import { callRpc } from '../transaction';

/** Startups, their members, and what QSTP promised them. */

export function startupsRepository(client: RlsClient): StartupPort {
  return {
    findById: (id) =>
      runMaybe(client.from('startups').select('*').eq('id', id).maybeSingle(), startupEntity.parse, {
        table: 'startups',
        startupId: id,
      }),

    /**
     * The startups taking part in one cycle.
     *
     * An inner-join embed rather than two queries: `!inner` turns the embedded
     * relation into a filter, so this is one round trip and the participation
     * columns that come back are stripped by the entity's row schema.
     */
    listForCycle: (cycleId) =>
      run(
        client
          .from('startups')
          .select('*, cycle_participations!inner(cycle_id)')
          .eq('cycle_participations.cycle_id', cycleId)
          .order('name'),
        startupEntity.parseMany,
        { table: 'startups', cycleId },
      ),

    listForUser: (userId) =>
      run(
        client
          .from('startups')
          .select('*, startup_members!inner(user_id, status)')
          .eq('startup_members.user_id', userId)
          // Suspended membership keeps the row and loses the access, exactly as
          // `is_startup_member` decides it in SQL.
          .eq('startup_members.status', 'active'),
        startupEntity.parseMany,
        { table: 'startups', userId },
      ),

    listMembers: (startupId) =>
      run(
        client.from('startup_members').select('*').eq('startup_id', startupId),
        startupMemberEntity.parseMany,
        { table: 'startup_members', startupId },
      ),
  };
}

export function allocationsRepository(client: RlsClient): AllocationPort {
  return {
    /** The live allocation per startup. Superseded revisions are history. */
    listForCycle: (cycleId) =>
      run(
        client
          .from('allocations')
          .select('*')
          .eq('cycle_id', cycleId)
          .neq('status', 'superseded')
          .order('created_at', { ascending: false }),
        allocationEntity.parseMany,
        { table: 'allocations', cycleId },
      ),

    findForStartup: (cycleId, startupId) =>
      runMaybe(
        client
          .from('allocations')
          .select('*')
          .eq('cycle_id', cycleId)
          .eq('startup_id', startupId)
          .neq('status', 'superseded')
          .maybeSingle(),
        allocationEntity.parse,
        { table: 'allocations', cycleId, startupId },
      ),

    /** Every revision, including superseded ones. This is the "why" trail. */
    listHistoryForCycle: (cycleId) =>
      run(
        client
          .from('allocations')
          .select('*')
          .eq('cycle_id', cycleId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(500),
        allocationEntity.parseMany,
        { table: 'allocations', cycleId },
      ),

    /**
     * The budget re-check lives inside `decide_allocation`, not here.
     *
     * Two operations staff allocating at the same moment would both pass a
     * check made against a stale read, and the overrun surfaces at payroll. So
     * the function takes the cycle row `for update` and sums everyone else
     * before writing — which is also why `decidedBy` and `decidedAt` are
     * dropped rather than sent.
     */
    decide: (input) =>
      callRpc(
        client,
        'decide_allocation',
        {
          p_cycle_id: input.cycleId,
          p_startup_id: input.startupId,
          p_weekly_hours: input.weeklyHours,
          p_score: input.score,
          p_justification: input.justification,
          p_override_reason: input.overrideReason,
          p_redistribution_round_id: input.redistributionRoundId,
        },
        allocationEntity.parse,
      ),
  };
}
