import { z } from 'zod';
import { defineEntity } from '../shared/entity';
import {
  cycleId,
  participationId,
  prioritizationRunId,
  startupId,
  startupRatingId,
  userId,
} from '../shared/ids';
import { HOUR_TIERS } from '../allocation/hours';
import type {
  JsonValue,
  PrioritizationOutcome,
  PrioritizationRun,
  PrioritizationWaitlistEntry,
} from '../operations/operations';

/**
 * A stored prioritisation run, and the per-startup results it froze.
 *
 * Everything here is written once and read forever. The run is the record of a
 * funding decision, so nothing in this file joins to a table that could have
 * moved since: `policy_snapshot` is a frozen copy rather than a reference, and
 * 0013 added `participation_id` and `requested_hours` to the results table for
 * the same reason — reading a startup's request through today's participation
 * row would show a six-month-old run a number it was never calculated from.
 *
 * The results arrive embedded, because a run without its outcomes is not a
 * partial run, it is a meaningless one.
 */

const timestamp = z.iso.datetime({ offset: true });

const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);

const hourTier = z.union(
  HOUR_TIERS.map((tier) => z.literal(tier)) as unknown as [
    z.ZodLiteral<60>,
    z.ZodLiteral<40>,
    z.ZodLiteral<30>,
    z.ZodLiteral<20>,
    z.ZodLiteral<0>,
  ],
);

export const prioritizationResultRow = z.object({
  startup_id: startupId,
  participation_id: participationId.nullable(),
  requested_hours: z.number().int().min(0),
  rating_id: startupRatingId.nullable(),
  status: z.enum([
    'scored',
    'needs_information',
    'awaiting_manual_scores',
    'not_ready',
    'not_fundable',
  ]),
  score: z.number().min(0).max(100).nullable(),
  breakdown: z.record(z.string(), z.number()).nullable(),
  history_source: z.string().nullable(),
  rank: z.number().int().min(1).nullable(),
  tie_group: z.number().int().nullable(),
  requires_tie_resolution: z.boolean(),
  maximum_hours: hourTier.nullable(),
  proposed_hours: hourTier.nullable(),
  adjusted_hours: hourTier.nullable(),
  adjustment_reason: z.string().nullable(),
  waitlist_rank: z.number().int().min(1).nullable(),
  waitlist_reason: z.string().nullable(),
  blockers: z.array(json),
  signals: z.array(json),
  adjustments: z.array(json),
});

type ResultRow = z.infer<typeof prioritizationResultRow>;

export const prioritizationRunRow = z.object({
  id: prioritizationRunId,
  cycle_id: cycleId,
  version: z.number().int().min(1),
  status: z.enum(['draft', 'confirmed', 'superseded']),
  policy_snapshot: json,
  budget_hours: z.number().int().min(0),
  maximum_qualified_hours: z.number().int(),
  proposed_hours: z.number().int(),
  residual_hours: z.number().int(),
  within_budget: z.boolean(),
  allocation_mode: z.enum(['priority', 'broad', 'distribution']),
  allocation_strategy: z.string(),
  completeness: z.enum(['complete_draft', 'partial_draft']),
  signals: z.array(json),
  created_by: userId,
  created_at: timestamp,
  confirmed_at: timestamp.nullable(),
  prioritisation_results: z.array(prioritizationResultRow).default([]),
});

/**
 * The engine names its own policy version; the column is a foreign key to the
 * policy table, which is not the same thing. Reading it out of the snapshot is
 * what keeps an old run reporting the version it actually ran under.
 */
const versionedSnapshot = z.object({ version: z.string() });

function policyVersionOf(snapshot: JsonValue): string {
  const parsed = versionedSnapshot.safeParse(snapshot);
  return parsed.success ? parsed.data.version : 'unknown';
}

function toOutcome(row: ResultRow): PrioritizationOutcome {
  return {
    participationId: row.participation_id,
    startupId: row.startup_id,
    status: row.status,
    score: row.score,
    breakdown: row.breakdown,
    historySource: row.history_source,
    rank: row.rank,
    requestedHours: row.requested_hours,
    maximumHours: row.maximum_hours,
    proposedHours: row.proposed_hours,
    adjustedHours: row.adjusted_hours,
    adjustmentReason: row.adjustment_reason,
    waitlistRank: row.waitlist_rank,
    requiresTieResolution: row.requires_tie_resolution,
    blockers: row.blockers,
    signals: row.signals,
    adjustments: row.adjustments,
  };
}

/**
 * The waitlist, rebuilt from the results that carry a waitlist rank.
 *
 * `tieGroupSize` is counted here rather than stored, because it is exactly the
 * number of rows sharing a `tie_group` and storing it would give two places to
 * disagree. A result with no tie group is its own group of one.
 */
function toWaitlist(rows: readonly ResultRow[]): PrioritizationWaitlistEntry[] {
  const groupSizes = new Map<number, number>();
  for (const row of rows) {
    if (row.tie_group === null) continue;
    groupSizes.set(row.tie_group, (groupSizes.get(row.tie_group) ?? 0) + 1);
  }

  return rows
    .filter((row) => row.waitlist_rank !== null && row.score !== null)
    .sort((a, b) => (a.waitlist_rank ?? 0) - (b.waitlist_rank ?? 0))
    .map((row) => ({
      startupId: row.startup_id,
      score: row.score ?? 0,
      waitlistRank: row.waitlist_rank ?? 0,
      tieGroupSize: row.tie_group === null ? 1 : (groupSizes.get(row.tie_group) ?? 1),
      requiresTieResolution: row.requires_tie_resolution,
      reason: row.waitlist_reason ?? '',
    }));
}

export const prioritizationRunEntity = defineEntity({
  name: 'PrioritizationRun',
  row: prioritizationRunRow,
  toDomain: (row): PrioritizationRun => ({
    id: row.id,
    cycleId: row.cycle_id,
    version: row.version,
    status: row.status,
    completeness: row.completeness,
    policyVersion: policyVersionOf(row.policy_snapshot),
    allocationMode: row.allocation_mode,
    allocationStrategy: row.allocation_strategy,
    budgetHours: row.budget_hours,
    maximumQualifiedHours: row.maximum_qualified_hours,
    proposedHours: row.proposed_hours,
    residualHours: row.residual_hours,
    withinBudget: row.within_budget,
    outcomes: row.prioritisation_results.map(toOutcome),
    waitlist: toWaitlist(row.prioritisation_results),
    signals: row.signals,
    policySnapshot: row.policy_snapshot,
    createdBy: row.created_by,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  }),
});
