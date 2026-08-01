/**
 * The engine's own vocabulary.
 *
 * Deliberately independent of `@relayflow/entities` — no branded ids, no
 * `StartupId`, no `CycleId`. That independence is what keeps the golden replay
 * fixture in `contracts/examples/` literally replayable, and what lets this
 * package be diffed against the upstream experiment it was ported from.
 *
 * Translation to and from relayflow's domain types happens once, in
 * `@relayflow/logic`, and nowhere else.
 */

/** The six QSTP judgements. Everything else in the score is derived. */
export const RATING_KEYS = [
  'progressAgainstStage',
  'tractionStrength',
  'valueToStartup',
  'valueToIntern',
  'qstpQatarAlignment',
  'researchEcosystemContribution',
] as const;

export type RatingKey = (typeof RATING_KEYS)[number];

/** Integers 0..`policy.ratingMaximum`. Validated before scoring. */
export type QstpRatings = Record<RatingKey, number>;

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export interface PolicyThreshold {
  readonly minScore: number;
  readonly hours: number;
}

export interface PrioritisationPolicy {
  readonly version: string;
  readonly ratingMaximum: number;
  readonly neutralHistoryPoints: number;
  readonly minimumWeeklySupervisionMinutes: number;
  readonly minimumRoleValueRating: number;
  readonly buckets: readonly number[];
  readonly thresholds: readonly PolicyThreshold[];
  readonly nearTieMargin: number;
  readonly nearThresholdMargin: number;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * How much the evidence supports a field. Only `supported` is usable; the rest
 * are preserved so a reviewer can see *why* a field could not be used rather
 * than finding a silent zero.
 */
export type EvidenceStatus =
  | 'supported'
  | 'missing'
  | 'conflicting'
  | 'stale'
  | 'not_applicable';

export interface ExtractionField {
  readonly fieldPath: string;
  readonly status: EvidenceStatus;
  readonly resolvedValue?: unknown;
  readonly normalizedUnit?: string | null;
  readonly period?: unknown;
  readonly observations?: readonly unknown[];
}

export interface Extraction {
  readonly contractVersion?: string;
  readonly caseId?: string;
  readonly submissionCutoffDate?: string | null;
  readonly fields: readonly ExtractionField[];
}

/** The five platform-derived rates, each 0..1. Absent means "no history". */
export interface PlatformHistory {
  readonly deadlineRate: number;
  readonly allocationUtilizationRate: number;
  readonly dispositionRate: number;
  readonly taskReportingRate: number;
  readonly internCompletionRate: number;
}

// ---------------------------------------------------------------------------
// Positions and their feasibility gate
// ---------------------------------------------------------------------------

export interface CanonicalPosition {
  readonly id: string | null;
  readonly title: string | null;
  readonly category: string | null;
  readonly expectedDeliverable: string | null;
  readonly learningOutcomes: unknown;
  readonly workMode: string | null;
  readonly supervisorName: string | null;
  readonly relevantExperienceYears: number | null;
  readonly weeklySupervisionMinutes: number | null;
  readonly maximumInterns: number | null;
  readonly resourcesReady: boolean | null;
  readonly onboardingReady: boolean | null;
}

/** All ten must pass for a position to host an intern. */
export interface PositionChecks {
  readonly title: boolean;
  readonly category: boolean;
  readonly expectedDeliverable: boolean;
  readonly learningOutcomes: boolean;
  readonly workMode: boolean;
  readonly supervisor: boolean;
  readonly supervisorCapacity: boolean;
  readonly supervisionCommitment: boolean;
  readonly resourcesReady: boolean;
  readonly onboardingReady: boolean;
}

export interface PositionResult {
  readonly index: number;
  readonly id: string;
  readonly title: string | null;
  readonly feasible: boolean;
  readonly checks: PositionChecks;
  readonly canonical: CanonicalPosition;
}

// ---------------------------------------------------------------------------
// Blockers, signals, adjustments
// ---------------------------------------------------------------------------

/**
 * A blocker stops a startup being scored. Each one is a distinct thing a human
 * must do — which is the whole reason these are not collapsed into "0 hours".
 */
export type Blocker =
  | { readonly type: 'extraction_unavailable' }
  | { readonly type: 'missing_qstp_ratings' }
  | { readonly type: 'invalid_qstp_ratings'; readonly message: string }
  | { readonly type: 'positions_unresolved'; readonly status: string }
  | { readonly type: 'no_feasible_position' }
  | {
      readonly type: 'role_value_below_floor';
      readonly minimum: number;
      readonly valueToStartup: number;
      readonly valueToIntern: number;
    };

/** Advisory. Processing continues; QSTP sees these in the portfolio review. */
export type PortfolioSignal =
  | { readonly type: 'exact_score_tie'; readonly startupIds: readonly string[]; readonly score: number }
  | { readonly type: 'near_score_tie'; readonly startupIds: readonly string[]; readonly distance: number }
  | { readonly type: 'residual_hours'; readonly hours: number }
  | {
      readonly type: 'waitlist_tie_requires_review';
      readonly score: number;
      readonly startupIds: readonly string[];
    }
  | { readonly type: 'distribution_rounding'; readonly targetCounts: Record<string, number> }
  | {
      readonly type: 'distribution_budget_conflict';
      readonly impliedTargetHours: number;
      readonly budgetHours: number;
    }
  | {
      readonly type: 'distribution_target_unmet';
      readonly allowedCountDeviationPerTier: number;
      readonly maxCountDeviation: number;
    };

export type StartupSignal =
  | {
      readonly type: 'budget_limited_below_maximum' | 'distribution_limited_below_maximum';
      readonly maximumHours: number;
      readonly finalHours: number;
    }
  | { readonly type: 'near_threshold'; readonly threshold: number; readonly distance: number };

export type Adjustment =
  | {
      readonly type: 'budget_downgrade' | 'priority_upgrade' | 'distribution_assignment';
      readonly fromHours: number;
      readonly toHours: number;
      readonly reason: string;
    }
  // Note: no `reason`. The baseline is the policy, not a departure from it.
  | { readonly type: 'baseline_allocation'; readonly fromHours: number; readonly toHours: number };

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type StartupStatus =
  | 'scored'
  | 'needs_information'
  | 'awaiting_manual_scores'
  | 'not_ready'
  | 'not_fundable';

export type HistorySource = 'platform_history' | 'neutral_no_history' | 'neutral_invalid_history';

/**
 * A type alias rather than an interface on purpose: consumers store this as a
 * `Record<string, number>` column, and only an alias gets the implicit index
 * signature that makes that assignment typecheck.
 */
export type ScoreBreakdown = {
  readonly progressAgainstStage: number;
  readonly tractionStrength: number;
  readonly valueToStartup: number;
  readonly valueToIntern: number;
  readonly qstpQatarAlignment: number;
  readonly researchEcosystemContribution: number;
  readonly history: number;
};

export type ScoreResult =
  | {
      readonly status: 'scored';
      readonly score: number;
      readonly breakdown: ScoreBreakdown;
      readonly historySource: HistorySource;
      readonly blockers: readonly Blocker[];
      readonly positionResults: readonly PositionResult[];
    }
  | {
      readonly status: Exclude<StartupStatus, 'scored'>;
      readonly blockers: readonly Blocker[];
      readonly positionResults: readonly PositionResult[];
    };

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

export type AllocationMode = 'priority' | 'broad' | 'distribution';

export type AllocationStrategy =
  | 'priority_concentration_equal_ties'
  | 'baseline_then_ranked_upgrades'
  | 'distribution_target_equal_ties';

export interface ScoredStartup {
  readonly startupId: string;
  readonly startupName: string;
  readonly score: number;
}

/** Mutable while the allocator works. Exposed only through readonly views. */
export interface WorkingAllocation extends ScoredStartup {
  rank: number;
  maximumHours: number;
  finalHours: number;
  adjustments: Adjustment[];
  signals: StartupSignal[];
}

export interface AllocatedStartup extends ScoredStartup {
  readonly rank: number;
  readonly maximumHours: number;
  readonly finalHours: number;
  readonly waitlistRank: number | null;
  readonly adjustments: readonly Adjustment[];
  readonly signals: readonly StartupSignal[];
}

export type WaitlistOrderStatus = 'resolved_by_score' | 'tied_requires_qstp_resolution';

export type WaitlistReason =
  | 'score_below_minimum'
  | 'distribution_target'
  | 'budget_priority_concentration'
  | 'budget_unavailable_for_baseline';

export interface WaitlistEntry {
  readonly startupId: string;
  readonly startupName: string;
  readonly score: number;
  readonly rank: number;
  /** Shared by every startup on the same score — a tie does not get an order. */
  readonly waitlistRank: number;
  /** Presentation only. Must never decide who is offered released hours. */
  readonly displayOrder: number;
  readonly tieGroupSize: number;
  readonly orderStatus: WaitlistOrderStatus;
  readonly reason: WaitlistReason;
}

export interface DistributionTier {
  readonly targetShare: number;
  readonly targetCount: number;
  readonly achievedShare: number;
  readonly achievedCount: number;
  readonly countDeviation: number;
  readonly percentagePointDeviation: number;
  readonly withinCountMargin: boolean;
}

export interface DistributionReport {
  readonly denominator: number;
  readonly allowedCountDeviationPerTier: number;
  readonly impliedTargetHours: number;
  readonly fractionalTargetWithinBudget: boolean;
  readonly withinMargin: boolean;
  readonly maxCountDeviation: number;
  readonly totalCountDeviation: number;
  readonly totalAbsolutePercentagePointDeviation: number;
  readonly perTier: Record<string, DistributionTier>;
}

export interface AllocationResult {
  readonly strategy: AllocationStrategy;
  readonly maximumHours: number;
  readonly proposedHours: number;
  readonly residualHours: number;
  readonly withinBudget: boolean;
  readonly allocations: readonly AllocatedStartup[];
  readonly waitlist: readonly WaitlistEntry[];
  readonly signals: readonly PortfolioSignal[];
  readonly distribution?: DistributionReport;
}

// ---------------------------------------------------------------------------
// The portfolio draft
// ---------------------------------------------------------------------------

export interface PortfolioStartupInput {
  readonly startupId: string;
  readonly startupName: string;
  /** `null` when nothing has been extracted yet — not an empty extraction. */
  readonly extraction: Extraction | null;
  /** `null` until a QSTP reviewer has submitted all six ratings. */
  readonly qstpRatings: QstpRatings | null;
}

export interface PortfolioCycleInput {
  readonly cycleId: string;
  readonly budgetHours: number;
  readonly submissionCutoffDate?: string | null;
}

export interface PortfolioAllocationInput {
  readonly mode: AllocationMode;
  readonly targetShares?: Record<string, number>;
  readonly allowedCountDeviationPerTier?: number;
}

export interface PortfolioInput {
  readonly schemaVersion?: string;
  readonly cycle: PortfolioCycleInput;
  readonly startups: readonly PortfolioStartupInput[];
  readonly policy?: PrioritisationPolicy;
  readonly allocation: PortfolioAllocationInput;
}

export interface StartupResult {
  readonly startupId: string;
  readonly startupName: string;
  readonly status: StartupStatus;
  readonly blockers: readonly Blocker[];
  readonly score: number | null;
  readonly breakdown: ScoreBreakdown | null;
  readonly historySource: HistorySource | null;
  readonly positionResults: readonly PositionResult[];
  readonly rank: number | null;
  readonly maximumHours: number | null;
  readonly finalHours: number | null;
  readonly waitlistRank: number | null;
  readonly adjustments: readonly Adjustment[];
  readonly signals: readonly StartupSignal[];
}

/**
 * `complete_draft` means every startup reached a legitimate evaluation outcome.
 * It does not mean the portfolio was approved or published.
 */
export type RunStatus = 'complete_draft' | 'partial_draft';

export interface PortfolioDraft {
  readonly schemaVersion: string;
  readonly policyVersion: string;
  readonly runStatus: RunStatus;
  readonly allocationMode: AllocationMode;
  readonly allocationStrategy: AllocationStrategy;
  readonly cycle: {
    readonly cycleId: string;
    readonly submissionCutoffDate: string | null;
    readonly budgetHours: number;
  };
  readonly budget: {
    readonly availableHours: number;
    readonly maximumQualifiedHours: number;
    readonly proposedHours: number;
    readonly residualHours: number;
    readonly withinBudget: boolean;
  };
  readonly counts: {
    readonly submitted: number;
    readonly statuses: Record<string, number>;
    readonly funded: number;
    readonly waitlisted: number;
    readonly finalTiers: Record<string, number>;
  };
  readonly startups: readonly StartupResult[];
  readonly waitlist: readonly WaitlistEntry[];
  readonly signals: readonly PortfolioSignal[];
  readonly distribution?: DistributionReport;
}
