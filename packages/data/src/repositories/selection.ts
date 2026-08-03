import { conflict } from '@relayflow/core';
import {
  candidateChoiceFallbackEntity,
  exceptionEntity,
  selectionConflictEntity,
  selectionEntity,
} from '@relayflow/entities';
import type {
  ConflictPort,
  ExceptionPort,
  FallbackPort,
  SelectionPort,
} from '@relayflow/ports';
import type { RlsClient } from '../client';
import { run, runSingle } from '../repository';
import { callRpc } from '../transaction';
import { rpcOrConflict } from './shared/rpc';

/**
 * Selection — the sharpest invariant in the system.
 *
 * One candidate holds at most one *blocking* claim across the whole cycle, and
 * `selections_one_live_per_candidate_idx` is what actually enforces it. Nothing
 * in this file checks whether a candidate is free before writing: that read
 * would be stale by the time the insert ran, and two startups clicking Select
 * at the same moment is the exact scenario the product exists to prevent.
 *
 * `reserve_candidate` therefore inserts and handles the 23505, and returns NULL
 * when somebody else already holds the candidate — having first written a
 * conflict row. `rpcOrConflict` is what turns that NULL back into a domain
 * error instead of a schema parse failure.
 */

export function selectionsRepository(client: RlsClient): SelectionPort {
  return {
    listForCandidate: (candidateId) =>
      run(
        client
          .from('selections')
          .select('*')
          .eq('candidate_id', candidateId)
          .order('created_at', { ascending: false }),
        selectionEntity.parseMany,
        { table: 'selections', candidateId },
      ),

    /**
     * Every claim in the cycle.
     *
     * `selections` has no `cycle_id` — it reaches one through its position —
     * so this is an inner-join embed rather than a column filter.
     */
    listForCycle: (cycleId) =>
      run(
        client
          .from('selections')
          .select('*, positions!inner(cycle_id)')
          .eq('positions.cycle_id', cycleId)
          .order('created_at', { ascending: false })
          .limit(2000),
        selectionEntity.parseMany,
        { table: 'selections', cycleId },
      ),

    /**
     * `startupId`, `selectedBy` and `reservedAt` are ignored on purpose.
     *
     * The function reads the startup from the position and the actor from
     * `auth.uid()`. A caller that could name its own startup could reserve
     * against somebody else's position, and a caller that could name its own
     * timestamp could win a first-come race retroactively.
     */
    reserve: (input) =>
      rpcOrConflict(
        client,
        'reserve_candidate',
        {
          p_position_id: input.positionId,
          p_candidate_id: input.candidateId,
          p_status: 'reserved',
        },
        selectionEntity.parse,
        () =>
          conflict('Another startup has already claimed this candidate.', {
            context: { candidateId: input.candidateId, positionId: input.positionId },
          }),
      ),

    /**
     * Non-blocking interest, for `candidate_choice` cycles.
     *
     * The same function with a different status, because the same index decides
     * both questions: `offered` is not in the partial index, so several offers
     * coexist — but an offer still trips it when somebody holds a blocking
     * claim, which is what stops a candidate being shown a choice they do not
     * have. A second offer from the same startup for the same position trips
     * `selections_one_open_offer_idx` instead and is refused as the duplicate
     * it is, with no conflict row.
     */
    offer: (input) =>
      rpcOrConflict(
        client,
        'reserve_candidate',
        {
          p_position_id: input.positionId,
          p_candidate_id: input.candidateId,
          p_status: 'offered',
        },
        selectionEntity.parse,
        () =>
          conflict('Another startup has already claimed this candidate.', {
            context: { candidateId: input.candidateId, positionId: input.positionId },
          }),
      ),

    /**
     * Accepting is where an offer becomes a blocking claim, so it races the
     * same index — with a rival first-come reservation, and with a second
     * acceptance. It goes through the same guard for that reason.
     */
    acceptOffer: (input) =>
      rpcOrConflict(
        client,
        'accept_offer',
        { p_selection_id: input.selectionId },
        selectionEntity.parse,
        () =>
          conflict('That offer is no longer open.', {
            context: { selectionId: input.selectionId },
          }),
      ),

    acceptReservation: (input) =>
      callRpc(client, 'accept_reservation', { p_selection_id: input.selectionId }, selectionEntity.parse),

    decline: (selectionId) =>
      callRpc(client, 'decline_selection', { p_selection_id: selectionId }, selectionEntity.parse),

    release: (selectionId) =>
      callRpc(
        client,
        'release_selection',
        { p_selection_id: selectionId, p_reason: null },
        selectionEntity.parse,
      ),
  };
}

export function exceptionsRepository(client: RlsClient): ExceptionPort {
  return {
    listForCycle: (cycleId) =>
      run(
        client
          .from('exception_requests')
          .select('*')
          .eq('cycle_id', cycleId)
          .order('created_at', { ascending: false }),
        exceptionEntity.parseMany,
        { table: 'exception_requests', cycleId },
      ),

    listForStartup: (cycleId, startupId) =>
      run(
        client
          .from('exception_requests')
          .select('*')
          .eq('cycle_id', cycleId)
          .eq('startup_id', startupId)
          .order('created_at', { ascending: false }),
        exceptionEntity.parseMany,
        { table: 'exception_requests', cycleId, startupId },
      ),

    // `exception_requests_insert` already permits the startup, so a plain
    // insert is correct here and a function would add nothing.
    request: (input) =>
      runSingle(
        client
          .from('exception_requests')
          .insert({
            cycle_id: input.cycleId,
            startup_id: input.startupId,
            kind: input.kind,
            reason: input.reason,
            requested_deadline: input.requestedDeadline,
            requested_by: input.requestedBy,
          })
          .select('*')
          .single(),
        exceptionEntity.parse,
        { table: 'exception_requests', cycleId: input.cycleId, startupId: input.startupId },
      ),

    /**
     * Approving with a granted date also protects any potential recovery case
     * for that startup, in the same transaction. A startup granted an extension
     * that then has its hours reclaimed underneath it is the failure mode this
     * whole mechanism exists to prevent.
     */
    decide: (input) =>
      callRpc(
        client,
        'decide_exception',
        {
          p_exception_id: input.exceptionId,
          p_status: input.decision,
          p_granted_deadline: input.grantedDeadline,
          p_note: input.decisionNote,
        },
        exceptionEntity.parse,
      ),
  };
}

export function conflictsRepository(client: RlsClient): ConflictPort {
  return {
    listForCycle: (cycleId) =>
      run(
        client
          .from('selection_conflicts')
          .select('*')
          .eq('cycle_id', cycleId)
          .order('created_at', { ascending: false }),
        selectionConflictEntity.parseMany,
        { table: 'selection_conflicts', cycleId },
      ),

    /**
     * Conflicts are normally written by `reserve_candidate` inside the failed
     * insert. This exists for the case QSTP records one by hand, and is
     * QSTP-only by policy.
     */
    record: (input) =>
      runSingle(
        client
          .from('selection_conflicts')
          .insert({
            cycle_id: input.cycleId,
            candidate_id: input.candidateId,
            attempted_selection_id: input.attemptedSelectionId,
            blocking_selection_id: input.blockingSelectionId,
            status: input.status,
            previous_startup_id: input.previousStartupId,
            requested_startup_id: input.requestedStartupId,
          })
          .select('*')
          .single(),
        selectionConflictEntity.parse,
        { table: 'selection_conflicts', cycleId: input.cycleId },
      ),

    /**
     * An override moves the candidate and releases the losing claim in one
     * transaction. The loser is released rather than deleted, so the record
     * still shows who had them first — which is the question the startup that
     * lost will ask.
     */
    resolve: (id, decision, _actorId, reason) =>
      callRpc(
        client,
        'resolve_selection_conflict',
        { p_conflict_id: id, p_resolution: decision, p_reason: reason },
        selectionConflictEntity.parse,
      ),
  };
}

/** The candidate-choice fallback: walking an ordered offer list. */
const FALLBACK_WITH_OFFERS = '*, fallback_offers(selection_id, position)';

export function fallbacksRepository(client: RlsClient): FallbackPort {
  return {
    listForCycle: (cycleId) =>
      run(
        client
          .from('candidate_choice_fallbacks')
          .select(FALLBACK_WITH_OFFERS)
          .eq('cycle_id', cycleId)
          .order('created_at', { ascending: false }),
        candidateChoiceFallbackEntity.parseMany,
        { table: 'candidate_choice_fallbacks', cycleId },
      ),

    /**
     * Opening a case snapshots the open offers in the order they were made.
     *
     * All three of these are functions because all three write the case and its
     * offers or selections together — and because the offer order, once
     * written, is the thing the whole mechanism runs on.
     */
    open: async (input) => {
      const opened = await callRpc(
        client,
        'open_candidate_choice_fallback',
        {
          p_cycle_id: input.cycleId,
          p_candidate_id: input.candidateId,
          p_response_deadline: input.responseDeadline,
        },
        (value) => (value as { id: string }).id,
      );
      if (!opened.ok) return opened;
      return reloadFallback(client, opened.data);
    },

    respond: async (input) => {
      const responded = await callRpc(
        client,
        'respond_to_fallback',
        {
          p_case_id: input.caseId,
          p_response: input.response,
          p_next_response_deadline: input.nextResponseDeadline,
        },
        (value) => (value as { id: string }).id,
      );
      if (!responded.ok) return responded;
      return reloadFallback(client, responded.data);
    },

    override: async (input) => {
      const overridden = await callRpc(
        client,
        'override_fallback',
        {
          p_case_id: input.caseId,
          p_selection_id: input.selectionId,
          p_reason: input.reason,
          p_high_risk_confirmed: input.highRiskConfirmed,
        },
        (value) => (value as { id: string }).id,
      );
      if (!overridden.ok) return overridden;
      return reloadFallback(client, overridden.data);
    },
  };
}

/**
 * The functions return the case row; the domain object needs its offers too.
 *
 * A composite return type would avoid the second read, but the offer list does
 * not change on a response — only the index into it does — so re-reading is
 * cheap and keeps the SQL returning a plain table row.
 */
function reloadFallback(client: RlsClient, id: string) {
  return runSingle(
    client.from('candidate_choice_fallbacks').select(FALLBACK_WITH_OFFERS).eq('id', id).single(),
    candidateChoiceFallbackEntity.parse,
    { table: 'candidate_choice_fallbacks', caseId: id },
  );
}
