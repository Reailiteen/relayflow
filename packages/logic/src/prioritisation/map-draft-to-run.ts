import type {
  CycleParticipation,
  HourTier,
  JsonValue,
  PrioritizationOutcome,
  PrioritizationRun,
  PrioritizationWaitlistEntry,
  StartupId,
} from '@relayflow/entities';
import type { PortfolioDraft, PrioritisationPolicy } from '@relayflow/prioritisation';

/**
 * The engine's draft, in the shape the port stores.
 *
 * Everything advisory is carried through rather than summarised away: blockers,
 * signals, adjustments, tie flags, residual hours. A reviewer confirming a
 * funding decision needs to see that two startups tied, that one was walked
 * down two tiers for budget, and that five hours could not be spent — none of
 * which survives a reduction to "startup, hours".
 */

export type NewPrioritizationRun = Omit<
  PrioritizationRun,
  'id' | 'version' | 'status' | 'confirmedAt'
>;

const asTier = (hours: number | null): HourTier | null =>
  hours === null ? null : (hours as HourTier);

export function mapDraftToRun(
  draft: PortfolioDraft,
  participations: readonly CycleParticipation[],
  policy: PrioritisationPolicy,
  createdBy: PrioritizationRun['createdBy'],
  createdAt: string,
): NewPrioritizationRun {
  const participationByStartup = new Map(
    participations.map((row) => [row.startupId as string, row]),
  );

  const outcomes: PrioritizationOutcome[] = draft.startups.map((result) => {
    const participation = participationByStartup.get(result.startupId);
    return {
      participationId: participation?.id ?? null,
      startupId: result.startupId as StartupId,
      status: result.status,
      score: result.score,
      breakdown: result.breakdown,
      historySource: result.historySource,
      rank: result.rank,
      requestedHours: participation?.requestedTotalHours ?? 0,
      maximumHours: asTier(result.maximumHours),
      proposedHours: asTier(result.finalHours),
      // An adjustment is a human act. A fresh run has none by definition.
      adjustedHours: null,
      adjustmentReason: null,
      waitlistRank: result.waitlistRank,
      requiresTieResolution:
        draft.waitlist.find((entry) => entry.startupId === result.startupId)?.orderStatus ===
        'tied_requires_qstp_resolution',
      blockers: result.blockers,
      signals: result.signals,
      adjustments: result.adjustments,
    };
  });

  const waitlist: PrioritizationWaitlistEntry[] = draft.waitlist.map((entry) => ({
    startupId: entry.startupId as StartupId,
    score: entry.score,
    // Shared across a tie group on purpose. `displayOrder` is dropped here
    // deliberately — it is presentation, and storing it invites someone to make
    // released-hour offers in that order.
    waitlistRank: entry.waitlistRank,
    tieGroupSize: entry.tieGroupSize,
    requiresTieResolution: entry.orderStatus === 'tied_requires_qstp_resolution',
    reason: entry.reason,
  }));

  return {
    cycleId: draft.cycle.cycleId as PrioritizationRun['cycleId'],
    completeness: draft.runStatus,
    policyVersion: draft.policyVersion,
    allocationMode: draft.allocationMode,
    allocationStrategy: draft.allocationStrategy,
    budgetHours: draft.budget.availableHours,
    maximumQualifiedHours: draft.budget.maximumQualifiedHours,
    proposedHours: draft.budget.proposedHours,
    residualHours: draft.budget.residualHours,
    withinBudget: draft.budget.withinBudget,
    outcomes,
    waitlist,
    signals: draft.signals,
    // A frozen copy, not a reference. Re-reading this run in six months must
    // show the weights and thresholds it was calculated under, not whatever is
    // in force by then.
    policySnapshot: JSON.parse(JSON.stringify(policy)) as JsonValue,
    createdBy,
    createdAt,
  };
}
