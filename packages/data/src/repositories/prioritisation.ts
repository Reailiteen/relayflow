import { prioritizationRunEntity, startupRatingEntity } from '@relayflow/entities';
import type { PrioritizationPort, RatingPort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { run, runMaybe, runSingle } from '../repository';
import { callRpc } from '../transaction';

/**
 * Prioritisation runs and the six judgements behind them.
 *
 * Persistence only. Scoring is a pure function in `@relayflow/prioritisation`,
 * called once by the use-case — if it lived here, this adapter and the fixtures
 * one would each have their own copy and could silently disagree about a
 * funding decision.
 */

const RUN_WITH_RESULTS = '*, prioritisation_results(*)';

export function prioritizationRepository(client: RlsClient): PrioritizationPort {
  const reloadRun = (runId: string) =>
    runSingle(
      client.from('prioritisation_runs').select(RUN_WITH_RESULTS).eq('id', runId).single(),
      prioritizationRunEntity.parse,
      { table: 'prioritisation_runs', runId },
    );

  return {
    create: async (input) => {
      const created = await callRpc(
        client,
        'create_prioritisation_run',
        {
          p_cycle_id: input.cycleId,
          p_run: {
            policySnapshot: input.policySnapshot,
            budgetHours: input.budgetHours,
            maximumQualifiedHours: input.maximumQualifiedHours,
            proposedHours: input.proposedHours,
            residualHours: input.residualHours,
            withinBudget: input.withinBudget,
            allocationMode: input.allocationMode,
            allocationStrategy: input.allocationStrategy,
            completeness: input.completeness,
            signals: input.signals,
          },
          // The waitlist is not sent separately: every entry in it is a result
          // that carries a `waitlist_rank`, and storing it twice would give two
          // places to disagree about who is next.
          p_results: input.outcomes.map((outcome) => ({
            startupId: outcome.startupId,
            participationId: outcome.participationId,
            requestedHours: outcome.requestedHours,
            ratingId: null,
            extractionRunId: null,
            status: outcome.status,
            score: outcome.score,
            breakdown: outcome.breakdown,
            historySource: outcome.historySource,
            rank: outcome.rank,
            requiresTieResolution: outcome.requiresTieResolution,
            maximumHours: outcome.maximumHours,
            proposedHours: outcome.proposedHours,
            waitlistRank: outcome.waitlistRank,
            waitlistReason:
              input.waitlist.find((entry) => entry.startupId === outcome.startupId)?.reason ?? null,
            blockers: outcome.blockers,
            signals: outcome.signals,
            adjustments: outcome.adjustments,
          })),
        },
        (value) => (value as { id: string }).id,
      );
      if (!created.ok) return created;
      return reloadRun(created.data);
    },

    listForCycle: (cycleId) =>
      run(
        client
          .from('prioritisation_runs')
          .select(RUN_WITH_RESULTS)
          .eq('cycle_id', cycleId)
          .order('version', { ascending: false }),
        prioritizationRunEntity.parseMany,
        { table: 'prioritisation_runs', cycleId },
      ),

    /**
     * `adjust_prioritisation_result` returns the result row; the port promises
     * the run. Re-reading rather than reshaping, because the run's totals are
     * the engine's verdict and must be read back as stored — not re-derived by
     * summing the outcomes we happen to have in hand.
     */
    adjust: async (runId, startupId, proposedHours, reason) => {
      const adjusted = await callRpc(
        client,
        'adjust_prioritisation_result',
        {
          p_run_id: runId,
          p_startup_id: startupId,
          p_hours: proposedHours,
          p_reason: reason,
        },
        () => runId,
      );
      if (!adjusted.ok) return adjusted;
      return reloadRun(runId);
    },

    /**
     * Publishing writes the allocations the draft proposes — but only for
     * `scored` startups. The other four statuses produce no allocation row at
     * all, because a 0h allocation is indistinguishable from "we evaluated you
     * and you did not qualify", and those startups were never evaluated.
     */
    confirm: async (runId) => {
      const published = await callRpc(
        client,
        'publish_prioritisation_run',
        { p_run_id: runId, p_acknowledge_incomplete: false, p_reason: null },
        () => runId,
      );
      if (!published.ok) return published;
      return reloadRun(runId);
    },
  };
}

const RATING_WITH_ITEMS = '*, startup_rating_items(id, dimension, value, rationale)';

/** The items come embedded; the entity expects them under `items`. */
const parseRating = (value: unknown) => {
  const row = value as Record<string, unknown>;
  const { startup_rating_items: items, ...rest } = row;
  return startupRatingEntity.parse({
    ...rest,
    items: ((items as Record<string, unknown>[] | undefined) ?? []).map((item) => ({
      ...item,
      citations: [],
    })),
  });
};

export function ratingsRepository(client: RlsClient): RatingPort {
  return {
    listForCycle: (cycleId) =>
      run(
        client.from('startup_ratings').select(RATING_WITH_ITEMS).eq('cycle_id', cycleId),
        (rows) => rows.map(parseRating),
        { table: 'startup_ratings', cycleId },
      ),

    /**
     * The live rating: submitted wins over draft.
     *
     * A draft is a work-in-progress and must not shadow the rating a run was
     * actually calculated from. Ordering by status puts `submitted` before
     * `draft` alphabetically, which is a coincidence — so it is spelled out
     * with an explicit two-step read instead of relied upon.
     */
    findForStartup: async (cycleId, startupId) => {
      const submitted = await runMaybe(
        client
          .from('startup_ratings')
          .select(RATING_WITH_ITEMS)
          .eq('cycle_id', cycleId)
          .eq('startup_id', startupId)
          .eq('status', 'submitted')
          .maybeSingle(),
        parseRating,
        { table: 'startup_ratings', cycleId, startupId },
      );
      if (!submitted.ok || submitted.data !== null) return submitted;

      return runMaybe(
        client
          .from('startup_ratings')
          .select(RATING_WITH_ITEMS)
          .eq('cycle_id', cycleId)
          .eq('startup_id', startupId)
          .eq('status', 'draft')
          .maybeSingle(),
        parseRating,
        { table: 'startup_ratings', cycleId, startupId },
      );
    },

    // The draft's items are replaced wholesale, not merged: a draft that kept
    // items you did not resend would make deleting a rationale impossible.
    saveDraft: async (input) => {
      const saved = await callRpc(
        client,
        'save_startup_rating_draft',
        {
          p_cycle_id: input.cycleId,
          p_startup_id: input.startupId,
          p_items: input.items.map((item) => ({
            dimension: item.dimension,
            value: item.value,
            rationale: item.rationale,
          })),
        },
        (value) => (value as { id: string }).id,
      );
      if (!saved.ok) return saved;
      return runSingle(
        client.from('startup_ratings').select(RATING_WITH_ITEMS).eq('id', saved.data).single(),
        parseRating,
        { table: 'startup_ratings', cycleId: input.cycleId },
      );
    },

    // Superseded, never edited: a rating that changed after a run was published
    // has to stay reconstructable.
    submit: async (input) => {
      const submitted = await callRpc(
        client,
        'submit_startup_rating',
        {
          p_cycle_id: input.cycleId,
          p_startup_id: input.startupId,
          p_items: input.items.map((item) => ({
            dimension: item.dimension,
            value: item.value,
            rationale: item.rationale,
          })),
          p_revision_reason: input.revisionReason,
        },
        (value) => (value as { id: string }).id,
      );
      if (!submitted.ok) return submitted;
      return runSingle(
        client.from('startup_ratings').select(RATING_WITH_ITEMS).eq('id', submitted.data).single(),
        parseRating,
        { table: 'startup_ratings', cycleId: input.cycleId },
      );
    },
  };
}
