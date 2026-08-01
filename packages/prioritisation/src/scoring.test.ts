import { describe, expect, it } from 'vitest';

import { DEFAULT_POLICY } from './policy';
import { maximumTierForScore, scoreStartup } from './scoring';
import type { Extraction, QstpRatings } from './types';

const feasiblePosition = {
  title: 'Engineering Intern',
  category: 'software_engineering',
  expectedDeliverable: 'A tested prototype',
  learningOutcomes: ['Build', 'Test'],
  workMode: 'hybrid',
  supervisor: { name: 'Supervisor', weeklyMinutes: 60, maxInterns: 1 },
  resourcesReady: true,
  onboardingReady: true,
};

const extractionWith = (position: unknown = feasiblePosition): Extraction => ({
  fields: [
    { fieldPath: 'positions', status: 'supported', resolvedValue: [position] },
    { fieldPath: 'platformHistory', status: 'missing', resolvedValue: null },
  ],
});

const ratings = (overrides: Partial<QstpRatings> = {}): QstpRatings => ({
  progressAgainstStage: 2,
  tractionStrength: 2,
  valueToStartup: 2,
  valueToIntern: 2,
  qstpQatarAlignment: 2,
  researchEcosystemContribution: 2,
  ...overrides,
});

describe('scoreStartup', () => {
  it('scores an all-adequate first-time startup at 50', () => {
    const result = scoreStartup({ extraction: extractionWith(), ratings: ratings(), policy: DEFAULT_POLICY });

    expect(result.status).toBe('scored');
    if (result.status !== 'scored') return;
    expect(result.score).toBe(50);
    // A startup with no history is not a startup with bad history.
    expect(result.historySource).toBe('neutral_no_history');
    expect(maximumTierForScore(result.score, DEFAULT_POLICY)).toBe(30);
  });

  it('does not let strength elsewhere compensate for the role-value floor', () => {
    const result = scoreStartup({
      extraction: extractionWith(),
      ratings: ratings({
        progressAgainstStage: 4,
        tractionStrength: 4,
        valueToStartup: 1,
        qstpQatarAlignment: 4,
        researchEcosystemContribution: 4,
        valueToIntern: 4,
      }),
      policy: DEFAULT_POLICY,
    });

    expect(result.status).toBe('not_fundable');
    expect(result.blockers[0]?.type).toBe('role_value_below_floor');
  });

  it('separates "no feasible position" from a low score', () => {
    const result = scoreStartup({
      extraction: extractionWith({ ...feasiblePosition, onboardingReady: false }),
      ratings: ratings({ progressAgainstStage: 4, tractionStrength: 4 }),
      policy: DEFAULT_POLICY,
    });

    expect(result.status).toBe('not_ready');
    expect(result.blockers[0]?.type).toBe('no_feasible_position');
  });

  it('reports unresolved position evidence as missing information', () => {
    const result = scoreStartup({
      extraction: { fields: [{ fieldPath: 'positions', status: 'conflicting' }] },
      ratings: ratings(),
      policy: DEFAULT_POLICY,
    });

    expect(result.status).toBe('needs_information');
    expect(result.blockers[0]).toStrictEqual({
      type: 'positions_unresolved',
      status: 'conflicting',
    });
  });

  it('uses platform history when all five rates are present', () => {
    const result = scoreStartup({
      extraction: {
        fields: [
          { fieldPath: 'positions', status: 'supported', resolvedValue: [feasiblePosition] },
          {
            fieldPath: 'platformHistory',
            status: 'supported',
            resolvedValue: {
              deadlineRate: 1,
              allocationUtilizationRate: 1,
              dispositionRate: 1,
              taskReportingRate: 1,
              internCompletionRate: 1,
            },
          },
        ],
      },
      ratings: ratings(),
      policy: DEFAULT_POLICY,
    });

    expect(result.status).toBe('scored');
    if (result.status !== 'scored') return;
    expect(result.historySource).toBe('platform_history');
    // Perfect history is 10, against the neutral 5 the same startup scored above.
    expect(result.breakdown.history).toBe(10);
    expect(result.score).toBe(55);
  });
});
