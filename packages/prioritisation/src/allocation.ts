/**
 * Fitting qualified startups into a fixed budget.
 *
 * Scoring says what each startup *deserves*; this says what the cycle can
 * *afford*. Keeping them apart is deliberate — a startup downgraded for budget
 * reasons has not been judged worse, and the record must say which of the two
 * happened.
 *
 * The invariant that runs through every strategy: **startups on exactly the
 * same score always receive exactly the same hours**. Ties are moved as a group
 * or not at all. Where a tie reaches the waitlist, the engine refuses to invent
 * an order and marks the group for QSTP to resolve, because letting a uuid
 * comparison decide who gets released hours is not a policy anyone would sign.
 */

import { maximumTierForScore } from './scoring';
import type {
  AllocatedStartup,
  AllocationResult,
  AllocationStrategy,
  DistributionReport,
  DistributionTier,
  PortfolioSignal,
  PrioritisationPolicy,
  ScoredStartup,
  WaitlistEntry,
  WaitlistReason,
  WorkingAllocation,
} from './types';

const round = (value: number): number => Math.round(value * 100) / 100;

const ASCENDING_BUCKETS: readonly number[] = [0, 20, 30, 40, 60];

function nextBucket(hours: number): number {
  return ASCENDING_BUCKETS[ASCENDING_BUCKETS.indexOf(hours) + 1] ?? hours;
}

function lowerBucket(hours: number): number {
  return ASCENDING_BUCKETS[Math.max(ASCENDING_BUCKETS.indexOf(hours) - 1, 0)] ?? 0;
}

interface ScoreGroup {
  readonly score: number;
  readonly startups: WorkingAllocation[];
}

function rankedAllocations(
  scoredStartups: readonly ScoredStartup[],
  policy: PrioritisationPolicy,
  initialHours: (maximumHours: number) => number,
): WorkingAllocation[] {
  return [...scoredStartups]
    .sort((left, right) => right.score - left.score || left.startupId.localeCompare(right.startupId))
    .map((startup, index): WorkingAllocation => {
      const maximumHours = maximumTierForScore(startup.score, policy);
      return {
        ...startup,
        rank: index + 1,
        maximumHours,
        finalHours: initialHours(maximumHours),
        adjustments: [],
        signals: [],
      };
    });
}

/** Consecutive runs of identical score. Order is rank order, so groups are contiguous. */
function exactScoreGroups(allocations: readonly WorkingAllocation[]): ScoreGroup[] {
  const groups: ScoreGroup[] = [];
  for (const startup of allocations) {
    const current = groups.at(-1);
    if (current?.score === startup.score) current.startups.push(startup);
    else groups.push({ score: startup.score, startups: [startup] });
  }
  return groups;
}

/**
 * Advisory output. Mutates each startup's own `signals`, and returns the
 * portfolio-level ones.
 */
function allocationSignals(
  allocations: readonly WorkingAllocation[],
  residualHours: number,
  policy: PrioritisationPolicy,
  strategy: AllocationStrategy,
): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [];

  for (let index = 0; index < allocations.length - 1; index += 1) {
    const current = allocations[index];
    const next = allocations[index + 1];
    if (current === undefined || next === undefined) continue;

    const distance = round(current.score - next.score);
    if (distance === 0) {
      signals.push({
        type: 'exact_score_tie',
        startupIds: [current.startupId, next.startupId],
        score: current.score,
      });
      // Not validation — an assertion. If this fires the allocator is broken,
      // and letting it through would publish unequal funding for equal scores.
      if (current.finalHours !== next.finalHours) {
        throw new Error('exact tie received unequal hours');
      }
    } else if (distance <= policy.nearTieMargin) {
      signals.push({
        type: 'near_score_tie',
        startupIds: [current.startupId, next.startupId],
        distance,
      });
    }
  }

  for (const startup of allocations) {
    if (startup.finalHours < startup.maximumHours) {
      startup.signals.push({
        type:
          strategy === 'distribution_target_equal_ties'
            ? 'distribution_limited_below_maximum'
            : 'budget_limited_below_maximum',
        maximumHours: startup.maximumHours,
        finalHours: startup.finalHours,
      });
    }
    // All but the zero floor: being "near" the bottom threshold is not news.
    for (const threshold of policy.thresholds.slice(0, -1)) {
      const distance = Math.abs(startup.score - threshold.minScore);
      if (distance <= policy.nearThresholdMargin) {
        startup.signals.push({
          type: 'near_threshold',
          threshold: threshold.minScore,
          distance: round(distance),
        });
      }
    }
  }

  if (residualHours > 0) signals.push({ type: 'residual_hours', hours: residualHours });
  return signals;
}

function waitlistReason(maximumHours: number, strategy: AllocationStrategy): WaitlistReason {
  if (maximumHours === 0) return 'score_below_minimum';
  if (strategy === 'distribution_target_equal_ties') return 'distribution_target';
  if (strategy === 'priority_concentration_equal_ties') return 'budget_priority_concentration';
  return 'budget_unavailable_for_baseline';
}

function finalizeAllocation(
  allocations: WorkingAllocation[],
  budgetHours: number,
  maximumHours: number,
  strategy: AllocationStrategy,
  policy: PrioritisationPolicy,
): AllocationResult {
  const proposedHours = allocations.reduce((sum, startup) => sum + startup.finalHours, 0);
  const residualHours = budgetHours - proposedHours;
  const waitlisted = allocations.filter((startup) => startup.finalHours === 0);

  const waitlist: WaitlistEntry[] = waitlisted.map((startup, index) => {
    const groupStart = waitlisted.findIndex((candidate) => candidate.score === startup.score);
    const tieGroupSize = waitlisted.filter((candidate) => candidate.score === startup.score).length;
    return {
      startupId: startup.startupId,
      startupName: startup.startupName,
      score: startup.score,
      rank: startup.rank,
      // Shared across the tie group on purpose. `displayOrder` is presentation.
      waitlistRank: groupStart + 1,
      displayOrder: index + 1,
      tieGroupSize,
      orderStatus: tieGroupSize > 1 ? 'tied_requires_qstp_resolution' : 'resolved_by_score',
      reason: waitlistReason(startup.maximumHours, strategy),
    };
  });

  const waitlistById = new Map(waitlist.map((entry) => [entry.startupId, entry.waitlistRank]));
  const signals = allocationSignals(allocations, residualHours, policy, strategy);

  const waitlistTieScores = [
    ...new Set(waitlist.filter((entry) => entry.tieGroupSize > 1).map((entry) => entry.score)),
  ];
  for (const score of waitlistTieScores) {
    signals.push({
      type: 'waitlist_tie_requires_review',
      score,
      startupIds: waitlist.filter((entry) => entry.score === score).map((entry) => entry.startupId),
    });
  }

  const finalAllocations: AllocatedStartup[] = allocations.map((startup) => ({
    ...startup,
    waitlistRank: waitlistById.get(startup.startupId) ?? null,
  }));

  return {
    strategy,
    maximumHours,
    proposedHours,
    residualHours,
    withinBudget: proposedHours <= budgetHours,
    allocations: finalAllocations,
    waitlist,
    signals,
  };
}

function assertBudget(budgetHours: number): void {
  if (!Number.isFinite(budgetHours) || budgetHours < 0) {
    throw new Error('budgetHours must be a finite non-negative number');
  }
}

// ---------------------------------------------------------------------------
// Priority concentration — the recommended default
// ---------------------------------------------------------------------------

/**
 * Everyone starts at the tier their score earned; the lowest-ranked groups walk
 * down one bucket at a time until the total fits.
 *
 * The effect is that scarcity is absorbed at the bottom of the ranking rather
 * than spread thinly across it — QSTP's stated preference, and still provisional.
 */
export function allocatePriorityConcentration(
  scoredStartups: readonly ScoredStartup[],
  budgetHours: number,
  policy: PrioritisationPolicy,
): AllocationResult {
  assertBudget(budgetHours);

  const allocations = rankedAllocations(scoredStartups, policy, (maximum) => maximum);
  const maximumHours = allocations.reduce((sum, startup) => sum + startup.maximumHours, 0);
  let proposedHours = maximumHours;
  const groups = exactScoreGroups(allocations);

  for (const group of [...groups].reverse()) {
    let head = group.startups[0];
    while (proposedHours > budgetHours && head !== undefined && head.finalHours > 0) {
      const fromHours = head.finalHours;
      if (!group.startups.every((startup) => startup.finalHours === fromHours)) {
        throw new Error('exact-score group has unequal allocations');
      }
      const toHours = lowerBucket(fromHours);
      for (const startup of group.startups) {
        startup.finalHours = toHours;
        startup.adjustments.push({
          type: 'budget_downgrade',
          fromHours,
          toHours,
          reason: 'priority_concentration_equal_treatment_for_exact_scores',
        });
      }
      proposedHours -= (fromHours - toHours) * group.startups.length;
      head = group.startups[0];
    }
    if (proposedHours <= budgetHours) break;
  }

  return finalizeAllocation(
    allocations,
    budgetHours,
    maximumHours,
    'priority_concentration_equal_ties',
    policy,
  );
}

// ---------------------------------------------------------------------------
// Broad access — retained as the comparison baseline
// ---------------------------------------------------------------------------

/**
 * Give every qualified startup 20h first, then spend what is left upgrading in
 * rank order. Reaches more startups; funds the strongest less well.
 */
export function allocateBaselineThenUpgrade(
  scoredStartups: readonly ScoredStartup[],
  budgetHours: number,
  policy: PrioritisationPolicy,
): AllocationResult {
  assertBudget(budgetHours);

  const allocations = rankedAllocations(scoredStartups, policy, () => 0);
  const maximumHours = allocations.reduce((sum, startup) => sum + startup.maximumHours, 0);
  let remaining = budgetHours;
  const scoreGroups = exactScoreGroups(allocations);

  for (const group of scoreGroups) {
    const eligible = group.startups.filter((startup) => startup.maximumHours >= 20);
    if (eligible.length === 0) continue;
    const baselineCost = eligible.length * 20;
    // Stop rather than skip: funding a later group past a group we could not
    // afford would put a lower score ahead of a higher one.
    if (remaining < baselineCost) break;
    for (const startup of eligible) {
      startup.finalHours = 20;
      startup.adjustments.push({ type: 'baseline_allocation', fromHours: 0, toHours: 20 });
    }
    remaining -= baselineCost;
  }

  for (let groupIndex = 0; groupIndex < scoreGroups.length; groupIndex += 1) {
    const group = scoreGroups[groupIndex];
    if (group === undefined) continue;

    for (;;) {
      const head = group.startups[0];
      if (head === undefined) break;
      const fromHours = head.finalHours;
      if (!group.startups.every((startup) => startup.finalHours === fromHours)) {
        throw new Error('exact-score group has unequal allocations');
      }

      const toHours = nextBucket(fromHours);
      const previous = groupIndex === 0 ? null : scoreGroups[groupIndex - 1];
      // Monotonic in rank order: a group may never overtake the one above it.
      const previousHours =
        previous === null || previous === undefined
          ? Number.POSITIVE_INFINITY
          : Math.min(...previous.startups.map((startup) => startup.finalHours));

      const canUpgrade =
        toHours > fromHours &&
        toHours <= previousHours &&
        group.startups.every((startup) => toHours <= startup.maximumHours);
      const upgradeCost = (toHours - fromHours) * group.startups.length;
      if (!canUpgrade || upgradeCost > remaining) break;

      for (const startup of group.startups) {
        startup.finalHours = toHours;
        startup.adjustments.push({
          type: 'priority_upgrade',
          fromHours,
          toHours,
          reason: 'rank_order_equal_treatment_for_exact_scores',
        });
      }
      remaining -= upgradeCost;
    }
  }

  return finalizeAllocation(
    allocations,
    budgetHours,
    maximumHours,
    'baseline_then_ranked_upgrades',
    policy,
  );
}

// ---------------------------------------------------------------------------
// Target distribution — only when QSTP wants a portfolio mix
// ---------------------------------------------------------------------------

function validateDistributionTarget(
  targetShares: Record<string, number> | undefined,
  policy: PrioritisationPolicy,
): Record<string, number> {
  if (targetShares === undefined || targetShares === null || Array.isArray(targetShares)) {
    throw new Error('distribution targetShares must be an object keyed by tier hours');
  }

  const supportedKeys = new Set(policy.buckets.map(String));
  const unknownKeys = Object.keys(targetShares).filter((key) => !supportedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`unsupported distribution tiers: ${unknownKeys.join(', ')}`);
  }

  const shares = Object.fromEntries(
    policy.buckets.map((hours) => {
      const share = targetShares[String(hours)];
      if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) {
        throw new Error(`distribution share for ${hours}h must be between 0 and 1`);
      }
      return [String(hours), share];
    }),
  );

  const sum = Object.values(shares).reduce((total, share) => total + share, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error('distribution shares must sum to 1');
  return shares;
}

interface DistributionCandidate {
  readonly assignments: number[];
  readonly counts: Record<string, number>;
  readonly usedHours: number;
  readonly deviations: Record<string, number>;
  readonly maxCountDeviation: number;
  readonly totalCountDeviation: number;
  readonly signature: string;
}

function compareDistributionCandidates(
  left: DistributionCandidate,
  right: DistributionCandidate,
): number {
  return (
    left.maxCountDeviation - right.maxCountDeviation ||
    left.totalCountDeviation - right.totalCountDeviation ||
    right.usedHours - left.usedHours ||
    left.signature.localeCompare(right.signature)
  );
}

/**
 * Search for the integer tier mix closest to a requested set of shares.
 *
 * Exhaustive backtracking over exact-score groups, constrained to be
 * monotonically non-increasing by rank, capped by each group's earned maximum,
 * and never exceeding the budget. Cost grows with the number of distinct scores,
 * so a cohort of many tied groups is the pathological case — see the caller's
 * guard before enabling this mode in production.
 */
export function allocateTargetDistribution(
  scoredStartups: readonly ScoredStartup[],
  budgetHours: number,
  policy: PrioritisationPolicy,
  options: { targetShares?: Record<string, number>; allowedCountDeviationPerTier?: number } = {},
): AllocationResult {
  const { targetShares, allowedCountDeviationPerTier = 1 } = options;
  assertBudget(budgetHours);
  if (!Number.isInteger(allowedCountDeviationPerTier) || allowedCountDeviationPerTier < 0) {
    throw new Error('allowedCountDeviationPerTier must be a non-negative integer');
  }

  const shares = validateDistributionTarget(targetShares, policy);
  const allocations = rankedAllocations(scoredStartups, policy, () => 0);
  const maximumHours = allocations.reduce((sum, startup) => sum + startup.maximumHours, 0);
  const groups = exactScoreGroups(allocations);
  const descendingBuckets = [...policy.buckets].sort((left, right) => right - left);
  const targetCounts = Object.fromEntries(
    descendingBuckets.map((hours) => [
      String(hours),
      (shares[String(hours)] ?? 0) * allocations.length,
    ]),
  );

  let best: DistributionCandidate | null = null;

  function visit(
    groupIndex: number,
    previousHours: number,
    usedHours: number,
    counts: Record<string, number>,
    assignments: number[],
  ): void {
    if (groupIndex === groups.length) {
      const normalizedCounts = Object.fromEntries(
        descendingBuckets.map((hours) => [String(hours), counts[String(hours)] ?? 0]),
      );
      const deviations = Object.fromEntries(
        descendingBuckets.map((hours) => [
          String(hours),
          Math.abs((normalizedCounts[String(hours)] ?? 0) - (targetCounts[String(hours)] ?? 0)),
        ]),
      );
      const candidate: DistributionCandidate = {
        assignments: [...assignments],
        counts: normalizedCounts,
        usedHours,
        deviations,
        maxCountDeviation: Math.max(...Object.values(deviations)),
        totalCountDeviation: Object.values(deviations).reduce((sum, value) => sum + value, 0),
        signature: assignments.join(','),
      };
      if (best === null || compareDistributionCandidates(candidate, best) < 0) best = candidate;
      return;
    }

    const group = groups[groupIndex];
    if (group === undefined) return;
    const groupSize = group.startups.length;
    const groupMaximum = group.startups[0]?.maximumHours ?? 0;

    for (const hours of descendingBuckets) {
      if (hours > previousHours || hours > groupMaximum) continue;
      const nextUsedHours = usedHours + hours * groupSize;
      if (nextUsedHours > budgetHours) continue;

      const key = String(hours);
      counts[key] = (counts[key] ?? 0) + groupSize;
      assignments.push(hours);
      visit(groupIndex + 1, hours, nextUsedHours, counts, assignments);
      assignments.pop();
      counts[key] = (counts[key] ?? 0) - groupSize;
    }
  }

  visit(0, Number.POSITIVE_INFINITY, 0, {}, []);
  if (best === null) throw new Error('no valid distribution allocation exists');
  const chosen: DistributionCandidate = best;

  groups.forEach((group, index) => {
    const hours = chosen.assignments[index] ?? 0;
    for (const startup of group.startups) {
      startup.finalHours = hours;
      startup.adjustments.push({
        type: 'distribution_assignment',
        fromHours: 0,
        toHours: hours,
        reason: 'closest_target_preserving_budget_score_caps_rank_order_and_exact_ties',
      });
    }
  });

  const result = finalizeAllocation(
    allocations,
    budgetHours,
    maximumHours,
    'distribution_target_equal_ties',
    policy,
  );

  const achievedShares = Object.fromEntries(
    descendingBuckets.map((hours) => [
      String(hours),
      allocations.length === 0 ? 0 : (chosen.counts[String(hours)] ?? 0) / allocations.length,
    ]),
  );

  const perTier = Object.fromEntries(
    descendingBuckets.map((hours): [string, DistributionTier] => {
      const key = String(hours);
      const countDeviation = chosen.deviations[key] ?? 0;
      const achievedShare = achievedShares[key] ?? 0;
      const targetShare = shares[key] ?? 0;
      return [
        key,
        {
          targetShare,
          targetCount: round(targetCounts[key] ?? 0),
          achievedShare: round(achievedShare),
          achievedCount: chosen.counts[key] ?? 0,
          countDeviation: round(countDeviation),
          percentagePointDeviation: round((achievedShare - targetShare) * 100),
          withinCountMargin: countDeviation <= allowedCountDeviationPerTier + 1e-9,
        },
      ];
    }),
  );

  const withinMargin = Object.values(perTier).every((tier) => tier.withinCountMargin);
  const impliedTargetHours = descendingBuckets.reduce(
    (sum, hours) => sum + (targetCounts[String(hours)] ?? 0) * hours,
    0,
  );

  const distribution: DistributionReport = {
    denominator: allocations.length,
    allowedCountDeviationPerTier,
    impliedTargetHours: round(impliedTargetHours),
    fractionalTargetWithinBudget: impliedTargetHours <= budgetHours,
    withinMargin,
    maxCountDeviation: round(chosen.maxCountDeviation),
    totalCountDeviation: round(chosen.totalCountDeviation),
    totalAbsolutePercentagePointDeviation: round(
      Object.values(perTier).reduce((sum, tier) => sum + Math.abs(tier.percentagePointDeviation), 0),
    ),
    perTier,
  };

  const signals = [...result.signals];
  if (Object.values(targetCounts).some((count) => !Number.isInteger(count))) {
    signals.push({ type: 'distribution_rounding', targetCounts });
  }
  if (impliedTargetHours > budgetHours) {
    signals.push({
      type: 'distribution_budget_conflict',
      impliedTargetHours: round(impliedTargetHours),
      budgetHours,
    });
  }
  if (!withinMargin) {
    signals.push({
      type: 'distribution_target_unmet',
      allowedCountDeviationPerTier,
      maxCountDeviation: round(chosen.maxCountDeviation),
    });
  }

  return { ...result, signals, distribution };
}
