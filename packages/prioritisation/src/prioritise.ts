/**
 * The one entry point.
 *
 * Pure and total in the way that matters: no file access, no network, no
 * database, no logging, no notification, no approval. Given the same inputs it
 * returns the same portfolio draft, which is what makes a run replayable six
 * months later when somebody asks why a startup got 40 hours.
 *
 * What comes back is a *draft*. It carries blockers, advisory signals, ties that
 * the engine refuses to break, and budget adjustments with their reasons. None
 * of it is a decision until a QSTP reviewer confirms it.
 */

import {
  allocateBaselineThenUpgrade,
  allocatePriorityConcentration,
  allocateTargetDistribution,
} from './allocation';
import { DEFAULT_POLICY, assertPolicyCoherent } from './policy';
import { scoreStartup, validateRatings } from './scoring';
import { portfolioInputSchema } from './schemas';
import type {
  AllocationResult,
  Blocker,
  PortfolioAllocationInput,
  PortfolioDraft,
  PortfolioInput,
  PortfolioStartupInput,
  PrioritisationPolicy,
  ScoredStartup,
  StartupResult,
  StartupStatus,
} from './types';

export const PORTFOLIO_CONTRACT_VERSION = '1.0.0';

function unscored(
  startup: PortfolioStartupInput,
  status: Exclude<StartupStatus, 'scored'>,
  blocker: Blocker,
): StartupResult {
  return {
    startupId: startup.startupId,
    startupName: startup.startupName,
    status,
    blockers: [blocker],
    score: null,
    breakdown: null,
    historySource: null,
    positionResults: [],
    rank: null,
    maximumHours: null,
    finalHours: null,
    waitlistRank: null,
    adjustments: [],
    signals: [],
  };
}

function allocate(
  scored: readonly ScoredStartup[],
  budgetHours: number,
  policy: PrioritisationPolicy,
  allocation: PortfolioAllocationInput,
): AllocationResult {
  if (allocation.mode === 'priority') {
    return allocatePriorityConcentration(scored, budgetHours, policy);
  }
  if (allocation.mode === 'broad') {
    return allocateBaselineThenUpgrade(scored, budgetHours, policy);
  }
  return allocateTargetDistribution(scored, budgetHours, policy, {
    ...(allocation.targetShares !== undefined ? { targetShares: allocation.targetShares } : {}),
    ...(allocation.allowedCountDeviationPerTier !== undefined
      ? { allowedCountDeviationPerTier: allocation.allowedCountDeviationPerTier }
      : {}),
  });
}

/** Cross-record invariant Zod cannot express: one result per startup. */
function assertUniqueStartupIds(startups: readonly PortfolioStartupInput[]): void {
  const seen = new Set<string>();
  for (const startup of startups) {
    if (seen.has(startup.startupId)) {
      throw new Error(`duplicate startupId: ${startup.startupId}`);
    }
    seen.add(startup.startupId);
  }
}

export function buildPortfolioDraft(input: PortfolioInput): PortfolioDraft {
  const schemaVersion = input.schemaVersion ?? PORTFOLIO_CONTRACT_VERSION;
  if (schemaVersion !== PORTFOLIO_CONTRACT_VERSION) {
    throw new Error(`unsupported schemaVersion: ${schemaVersion}`);
  }

  // Validate, then keep using `input` — see the note in schemas.ts.
  portfolioInputSchema.parse(input);

  const policy = input.policy ?? DEFAULT_POLICY;
  assertPolicyCoherent(policy);
  assertUniqueStartupIds(input.startups);

  const { cycle, startups, allocation } = input;

  const evaluated: StartupResult[] = startups.map((startup) => {
    // Three ways to arrive without a score, each a different piece of work for
    // a different person. Collapsing them into "zero hours" is the failure mode
    // this whole status set exists to prevent.
    if (startup.extraction === null || startup.extraction === undefined) {
      return unscored(startup, 'needs_information', { type: 'extraction_unavailable' });
    }
    if (startup.qstpRatings === null || startup.qstpRatings === undefined) {
      return unscored(startup, 'awaiting_manual_scores', { type: 'missing_qstp_ratings' });
    }
    try {
      validateRatings(startup.qstpRatings, policy);
    } catch (error) {
      return unscored(startup, 'awaiting_manual_scores', {
        type: 'invalid_qstp_ratings',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const result = scoreStartup({
      extraction: startup.extraction,
      ratings: startup.qstpRatings,
      policy,
    });

    return {
      startupId: startup.startupId,
      startupName: startup.startupName,
      status: result.status,
      blockers: result.blockers,
      score: result.status === 'scored' ? result.score : null,
      breakdown: result.status === 'scored' ? result.breakdown : null,
      historySource: result.status === 'scored' ? result.historySource : null,
      positionResults: result.positionResults,
      rank: null,
      maximumHours: null,
      finalHours: null,
      waitlistRank: null,
      adjustments: [],
      signals: [],
    };
  });

  const scored: ScoredStartup[] = evaluated
    .filter((startup): startup is StartupResult & { score: number } => startup.status === 'scored' && startup.score !== null)
    .map(({ startupId, startupName, score }) => ({ startupId, startupName, score }));

  const allocationResult = allocate(scored, cycle.budgetHours, policy, allocation);
  const allocationsById = new Map(
    allocationResult.allocations.map((startup) => [startup.startupId, startup]),
  );

  const startupResults: StartupResult[] = evaluated.map((startup) => {
    const assigned = allocationsById.get(startup.startupId);
    return assigned === undefined
      ? startup
      : {
          ...startup,
          rank: assigned.rank,
          maximumHours: assigned.maximumHours,
          finalHours: assigned.finalHours,
          waitlistRank: assigned.waitlistRank,
          adjustments: assigned.adjustments,
          signals: assigned.signals,
        };
  });

  const statuses: Record<string, number> = {};
  for (const startup of startupResults) {
    statuses[startup.status] = (statuses[startup.status] ?? 0) + 1;
  }

  const finalTiers: Record<string, number> = Object.fromEntries(
    policy.buckets.map((hours) => [String(hours), 0]),
  );
  for (const startup of startupResults) {
    if (startup.status !== 'scored') continue;
    const key = String(startup.finalHours);
    finalTiers[key] = (finalTiers[key] ?? 0) + 1;
  }

  const incomplete = (statuses.needs_information ?? 0) + (statuses.awaiting_manual_scores ?? 0);

  return {
    schemaVersion: PORTFOLIO_CONTRACT_VERSION,
    policyVersion: policy.version,
    // "Complete" means every startup reached a legitimate outcome — not that
    // anybody approved it.
    runStatus: incomplete === 0 ? 'complete_draft' : 'partial_draft',
    allocationMode: allocation.mode,
    allocationStrategy: allocationResult.strategy,
    cycle: {
      cycleId: cycle.cycleId,
      submissionCutoffDate: cycle.submissionCutoffDate ?? null,
      budgetHours: cycle.budgetHours,
    },
    budget: {
      availableHours: cycle.budgetHours,
      maximumQualifiedHours: allocationResult.maximumHours,
      proposedHours: allocationResult.proposedHours,
      residualHours: allocationResult.residualHours,
      withinBudget: allocationResult.withinBudget,
    },
    counts: {
      submitted: startupResults.length,
      statuses,
      funded: startupResults.filter((startup) => (startup.finalHours ?? 0) > 0).length,
      waitlisted: allocationResult.waitlist.length,
      finalTiers,
    },
    startups: startupResults,
    waitlist: allocationResult.waitlist,
    signals: allocationResult.signals,
    ...(allocationResult.distribution !== undefined
      ? { distribution: allocationResult.distribution }
      : {}),
  };
}
