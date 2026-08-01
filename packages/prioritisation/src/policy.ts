/**
 * The scoring and allocation policy.
 *
 * Every number here is a QSTP decision, not a technical constant, which is why
 * the policy is a value passed into the engine rather than a module-level
 * constant baked into it. A run freezes the policy it used; changing these
 * defaults must never silently change what an old run means.
 *
 * The values below are PROVISIONAL. An independent blind review of the same
 * 30-startup cohort reached 0.58 score correlation and agreed on 16 of 28 final
 * tiers, so treat the output as a reviewable draft, not a validated ranking.
 */

import type { PrioritisationPolicy } from './types';

export const DEFAULT_POLICY: PrioritisationPolicy = Object.freeze({
  version: 'prioritization-v3-experiment-2',
  ratingMaximum: 4,
  /** A first-time startup gets a visible neutral half-score, never a zero. */
  neutralHistoryPoints: 5,
  minimumWeeklySupervisionMinutes: 30,
  /** Non-compensatory: strength elsewhere cannot buy past a poor host. */
  minimumRoleValueRating: 2,
  buckets: Object.freeze([60, 40, 30, 20, 0]),
  thresholds: Object.freeze([
    Object.freeze({ minScore: 85, hours: 60 }),
    Object.freeze({ minScore: 70, hours: 40 }),
    Object.freeze({ minScore: 50, hours: 30 }),
    Object.freeze({ minScore: 35, hours: 20 }),
    Object.freeze({ minScore: 0, hours: 0 }),
  ]),
  /** Score gaps at or below this are surfaced for review, not acted on. */
  nearTieMargin: 1,
  nearThresholdMargin: 2,
});

/**
 * Cross-field invariants Zod cannot express.
 *
 * Shape and per-field ranges are checked by `policySchema`; what remains is the
 * coherence between fields — that the thresholds form a descending ladder ending
 * at zero and only reference tiers that actually exist.
 */
export function assertPolicyCoherent(policy: PrioritisationPolicy): void {
  if (policy.minimumRoleValueRating > policy.ratingMaximum) {
    throw new Error('V3 minimum role-value rating must fit the rating scale');
  }

  const buckets = policy.buckets;
  if (
    buckets.length === 0 ||
    new Set(buckets).size !== buckets.length ||
    !buckets.includes(0)
  ) {
    throw new Error('V3 buckets must be unique non-negative numbers and include 0h');
  }

  const thresholds = policy.thresholds;
  const last = thresholds.at(-1);
  const descendsToZero = last?.minScore === 0;
  const wellFormed = thresholds.every((threshold, index) => {
    const previous = index === 0 ? null : thresholds[index - 1];
    const descends = previous === null || (previous !== undefined && threshold.minScore < previous.minScore);
    return buckets.includes(threshold.hours) && descends;
  });

  if (thresholds.length === 0 || !descendsToZero || !wellFormed) {
    throw new Error('V3 thresholds must descend to zero and reference configured buckets');
  }
}
