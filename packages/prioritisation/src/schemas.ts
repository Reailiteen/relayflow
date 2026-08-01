/**
 * Runtime validation at the engine's edge.
 *
 * These schemas are used as *validators*, never as transformers — the caller
 * keeps and passes on the original object. Zod strips unknown keys by default,
 * and letting a parsed copy reach the calculation would mean the golden replay
 * fixture no longer proves what it claims to prove.
 *
 * Two kinds of check deliberately live outside Zod:
 *   - cross-record invariants (duplicate startup ids) — see `prioritise.ts`
 *   - cross-field policy coherence — see `assertPolicyCoherent` in `policy.ts`
 * Both produce messages a reviewer can act on, which a schema union cannot.
 */

import { z } from 'zod';

const nonEmpty = z.string().min(1);
const finiteNonNegative = z.number().finite().nonnegative();

export const policySchema = z.object({
  version: nonEmpty,
  ratingMaximum: z.number().int().positive(),
  neutralHistoryPoints: z.number().finite().min(0).max(10),
  minimumWeeklySupervisionMinutes: finiteNonNegative,
  minimumRoleValueRating: z.number().int().nonnegative(),
  buckets: z.array(finiteNonNegative).min(1),
  thresholds: z
    .array(z.object({ minScore: finiteNonNegative, hours: z.number().finite() }))
    .min(1),
  nearTieMargin: finiteNonNegative,
  nearThresholdMargin: finiteNonNegative,
});

export const extractionFieldSchema = z.object({
  fieldPath: nonEmpty,
  status: z.enum(['supported', 'missing', 'conflicting', 'stale', 'not_applicable']),
  // Left as `unknown` on purpose: this is evidence, and the engine must not
  // reshape what a document said before a human has confirmed it. `.optional()`
  // is load-bearing — in Zod 4 an `unknown` key is still a *required* key.
  resolvedValue: z.unknown().optional(),
  normalizedUnit: z.string().nullish(),
  period: z.unknown().optional(),
  observations: z.array(z.unknown()).optional(),
});

export const extractionSchema = z.object({
  contractVersion: z.string().optional(),
  caseId: z.string().optional(),
  submissionCutoffDate: z.string().nullish(),
  fields: z.array(extractionFieldSchema),
});

export const startupInputSchema = z.object({
  startupId: nonEmpty,
  startupName: nonEmpty,
  /** `null` means nothing extracted yet — a blocker, not an empty extraction. */
  extraction: extractionSchema.nullish(),
  /**
   * Deliberately unvalidated here. A bad rating must become one startup's
   * `awaiting_manual_scores` blocker, not an exception that fails the cohort.
   */
  qstpRatings: z.unknown().optional(),
});

export const allocationInputSchema = z.object({
  mode: z.enum(['priority', 'broad', 'distribution']),
  targetShares: z.record(z.string(), z.number()).optional(),
  allowedCountDeviationPerTier: z.number().int().nonnegative().optional(),
});

export const cycleInputSchema = z.object({
  cycleId: nonEmpty,
  budgetHours: finiteNonNegative,
  submissionCutoffDate: z.string().nullish(),
});

export const portfolioInputSchema = z.object({
  schemaVersion: z.string().optional(),
  cycle: cycleInputSchema,
  startups: z.array(startupInputSchema),
  policy: policySchema.optional(),
  allocation: allocationInputSchema,
});
