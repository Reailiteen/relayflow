/**
 * Scoring one startup.
 *
 * Ninety of the hundred points are six human judgements. The extraction feeds
 * the two things a person should not be asked to eyeball — whether any position
 * is actually feasible, and what the platform already knows about this startup's
 * past behaviour.
 *
 *   progressAgainstStage           ×5     20
 *   tractionStrength               ×5     20     execution   40
 *   valueToStartup                 ×3.75  15
 *   valueToIntern                  ×3.75  15     role        30
 *   qstpQatarAlignment             ×2.5   10
 *   researchEcosystemContribution  ×2.5   10     strategy    20
 *   platform history                      10
 *
 * Three gates run first, in order, and each returns a *distinct terminal status*
 * rather than a low score. That distinction is the point: a startup nobody has
 * extracted yet and a startup that scored 12 both end up with zero hours, and
 * one of them needs chasing while the other needs nothing.
 */

import { evaluateV3Positions, fieldsByPath } from './normalisation';
import {
  RATING_KEYS,
  type ExtractionField,
  type Extraction,
  type HistorySource,
  type PrioritisationPolicy,
  type QstpRatings,
  type ScoreResult,
} from './types';

const round = (value: number): number => Math.round(value * 100) / 100;

/** The five platform-derived rates, each 0..1. All must be present and valid. */
const HISTORY_RATES = [
  'deadlineRate',
  'allocationUtilizationRate',
  'dispositionRate',
  'taskReportingRate',
  'internCompletionRate',
] as const;

/**
 * Throws rather than returning a Result. The caller turns this into an
 * `awaiting_manual_scores` blocker carrying the message, so a bad rating is
 * review work rather than a crashed portfolio.
 */
export function validateRatings(ratings: unknown, policy: PrioritisationPolicy): QstpRatings {
  if (ratings === null || typeof ratings !== 'object') {
    throw new Error('V3 QSTP ratings are required');
  }
  const source = ratings as Record<string, unknown>;

  for (const field of RATING_KEYS) {
    const value = source[field];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > policy.ratingMaximum
    ) {
      throw new Error(`${field} must be an integer from 0 to ${policy.ratingMaximum}`);
    }
  }

  return source as unknown as QstpRatings;
}

function scoreHistory(
  historyField: ExtractionField | undefined,
  policy: PrioritisationPolicy,
): { points: number; source: HistorySource } {
  const history = historyField?.status === 'supported' ? historyField.resolvedValue : null;

  if (history === null || typeof history !== 'object') {
    return { points: policy.neutralHistoryPoints, source: 'neutral_no_history' };
  }

  const record = history as Record<string, unknown>;
  const rates = HISTORY_RATES.map((field) => record[field]);
  const usable = rates.every(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1,
  );

  if (!usable) {
    return { points: policy.neutralHistoryPoints, source: 'neutral_invalid_history' };
  }

  const total = rates.reduce((sum, value) => sum + value, 0);
  return { points: (total / rates.length) * 10, source: 'platform_history' };
}

export function scoreStartup({
  extraction,
  ratings,
  policy,
}: {
  extraction: Extraction;
  ratings: unknown;
  policy: PrioritisationPolicy;
}): ScoreResult {
  const validated = validateRatings(ratings, policy);
  const byPath = fieldsByPath(extraction);

  // Gate 1 — we cannot judge readiness we were never shown.
  const positionsField = byPath.positions;
  if (positionsField?.status !== 'supported' || !Array.isArray(positionsField.resolvedValue)) {
    return {
      status: 'needs_information',
      blockers: [{ type: 'positions_unresolved', status: positionsField?.status ?? 'omitted' }],
      positionResults: [],
    };
  }

  const positionResults = evaluateV3Positions(positionsField.resolvedValue, policy);

  // Gate 2 — no position can host an intern. Not a low score; a different answer.
  if (!positionResults.some((position) => position.feasible)) {
    return { status: 'not_ready', blockers: [{ type: 'no_feasible_position' }], positionResults };
  }

  // Gate 3 — non-compensatory. Excellence elsewhere cannot buy past a poor host.
  if (
    validated.valueToStartup < policy.minimumRoleValueRating ||
    validated.valueToIntern < policy.minimumRoleValueRating
  ) {
    return {
      status: 'not_fundable',
      blockers: [
        {
          type: 'role_value_below_floor',
          minimum: policy.minimumRoleValueRating,
          valueToStartup: validated.valueToStartup,
          valueToIntern: validated.valueToIntern,
        },
      ],
      positionResults,
    };
  }

  const history = scoreHistory(byPath.platformHistory, policy);
  const weighted = {
    progressAgainstStage: validated.progressAgainstStage * 5,
    tractionStrength: validated.tractionStrength * 5,
    valueToStartup: validated.valueToStartup * 3.75,
    valueToIntern: validated.valueToIntern * 3.75,
    qstpQatarAlignment: validated.qstpQatarAlignment * 2.5,
    researchEcosystemContribution: validated.researchEcosystemContribution * 2.5,
    history: history.points,
  };

  // Sum the unrounded components, then round once. Rounding each component
  // first and summing those would drift by up to a third of a point.
  const total = Object.values(weighted).reduce((sum, value) => sum + value, 0);

  return {
    status: 'scored',
    score: round(total),
    breakdown: {
      progressAgainstStage: round(weighted.progressAgainstStage),
      tractionStrength: round(weighted.tractionStrength),
      valueToStartup: round(weighted.valueToStartup),
      valueToIntern: round(weighted.valueToIntern),
      qstpQatarAlignment: round(weighted.qstpQatarAlignment),
      researchEcosystemContribution: round(weighted.researchEcosystemContribution),
      history: round(weighted.history),
    },
    historySource: history.source,
    blockers: [],
    positionResults,
  };
}

/** The highest tier a score qualifies for, before the budget has its say. */
export function maximumTierForScore(score: number, policy: PrioritisationPolicy): number {
  const threshold = policy.thresholds.find((candidate) => score >= candidate.minScore);
  // The policy is validated to descend to a zero floor, so this cannot miss.
  if (threshold === undefined) throw new Error('policy has no threshold matching the score');
  return threshold.hours;
}
