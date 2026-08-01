/**
 * The QSTP startup prioritisation engine.
 *
 * Pure policy: evidence and six human ratings in, a reviewable portfolio draft
 * out. It knows nothing about relayflow's domain types, storage, or actors —
 * translation happens once, in `@relayflow/logic`.
 *
 * The numbers it applies are provisional and awaiting QSTP confirmation. The
 * draft is defensible because it shows its work, not because it is right.
 */

export { buildPortfolioDraft, PORTFOLIO_CONTRACT_VERSION } from './prioritise';
export { DEFAULT_POLICY, assertPolicyCoherent } from './policy';
export { maximumTierForScore, scoreStartup, validateRatings } from './scoring';
export {
  allocateBaselineThenUpgrade,
  allocatePriorityConcentration,
  allocateTargetDistribution,
} from './allocation';
export {
  canonicalizePosition,
  evaluateV3Positions,
  fieldsByPath,
  parseBoolean,
  parseNumber,
  parseWeeklyMinutes,
} from './normalisation';
export {
  allocationInputSchema,
  cycleInputSchema,
  extractionFieldSchema,
  extractionSchema,
  policySchema,
  portfolioInputSchema,
  startupInputSchema,
} from './schemas';
export { RATING_KEYS } from './types';
export type {
  AllocatedStartup,
  AllocationMode,
  AllocationResult,
  AllocationStrategy,
  Adjustment,
  Blocker,
  CanonicalPosition,
  DistributionReport,
  DistributionTier,
  EvidenceStatus,
  Extraction,
  ExtractionField,
  HistorySource,
  PlatformHistory,
  PolicyThreshold,
  PortfolioAllocationInput,
  PortfolioCycleInput,
  PortfolioDraft,
  PortfolioInput,
  PortfolioSignal,
  PortfolioStartupInput,
  PositionChecks,
  PositionResult,
  PrioritisationPolicy,
  QstpRatings,
  RatingKey,
  RunStatus,
  ScoreBreakdown,
  ScoreResult,
  ScoredStartup,
  StartupResult,
  StartupSignal,
  StartupStatus,
  WaitlistEntry,
  WaitlistOrderStatus,
  WaitlistReason,
} from './types';
