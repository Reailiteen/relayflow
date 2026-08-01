import { describe, expect, it } from 'vitest';

import {
  allocateBaselineThenUpgrade,
  allocatePriorityConcentration,
  allocateTargetDistribution,
} from './allocation';
import { DEFAULT_POLICY } from './policy';
import type { ScoredStartup } from './types';

const cohort = (...scores: readonly number[]): ScoredStartup[] =>
  scores.map((score, index) => {
    const id = String.fromCharCode(97 + index);
    return { startupId: id, startupName: id.toUpperCase(), score };
  });

describe('allocateBaselineThenUpgrade', () => {
  it('gives baselines before rank-ordered upgrades', () => {
    const result = allocateBaselineThenUpgrade(cohort(90, 70, 55), 100, DEFAULT_POLICY);

    expect(result.allocations.map((startup) => startup.finalHours)).toStrictEqual([60, 20, 20]);
    expect(result.proposedHours).toBe(100);
    expect(result.withinBudget).toBe(true);
  });

  it('waitlists lower ranks when the baseline budget runs out', () => {
    const result = allocateBaselineThenUpgrade(cohort(90, 70, 55), 50, DEFAULT_POLICY);

    expect(result.allocations.map((startup) => startup.finalHours)).toStrictEqual([30, 20, 0]);
    expect(result.waitlist[0]?.startupId).toBe('c');
    expect(result.waitlist[0]?.reason).toBe('budget_unavailable_for_baseline');
  });

  it('keeps exact ties equal at a funding boundary', () => {
    // 30h cannot buy two baselines, so neither gets one. Funding exactly one of
    // two identical scores would be the bug this asserts against.
    const result = allocateBaselineThenUpgrade(cohort(70, 70), 30, DEFAULT_POLICY);

    expect(result.allocations.map((startup) => startup.finalHours)).toStrictEqual([0, 0]);
    expect(result.residualHours).toBe(30);
    expect(result.signals.some((signal) => signal.type === 'exact_score_tie')).toBe(true);
  });
});

describe('allocatePriorityConcentration', () => {
  it('protects higher ranks and creates a waitlist', () => {
    const result = allocatePriorityConcentration(cohort(90, 70, 55), 80, DEFAULT_POLICY);

    expect(result.allocations.map((startup) => startup.finalHours)).toStrictEqual([60, 20, 0]);
    expect(result.waitlist[0]?.startupId).toBe('c');
    expect(result.proposedHours).toBe(80);
  });

  it('downgrades exact ties together', () => {
    const result = allocatePriorityConcentration(cohort(70, 70), 50, DEFAULT_POLICY);

    expect(result.allocations.map((startup) => startup.finalHours)).toStrictEqual([20, 20]);
    // 10h stranded rather than given to one of two equals.
    expect(result.residualHours).toBe(10);
  });

  it('refuses to invent an order inside a tied waitlist group', () => {
    const result = allocatePriorityConcentration(cohort(90, 70, 70), 60, DEFAULT_POLICY);

    expect(result.waitlist[0]?.waitlistRank).toBe(1);
    expect(result.waitlist[1]?.waitlistRank).toBe(1);
    expect(result.waitlist[0]?.orderStatus).toBe('tied_requires_qstp_resolution');
    expect(result.signals.some((signal) => signal.type === 'waitlist_tie_requires_review')).toBe(
      true,
    );
  });
});

describe('allocateTargetDistribution', () => {
  it('chooses the closest valid integer mix', () => {
    const result = allocateTargetDistribution(cohort(90, 80, 60, 40), 150, DEFAULT_POLICY, {
      targetShares: { 60: 0.25, 40: 0.25, 30: 0.25, 20: 0.25, 0: 0 },
      allowedCountDeviationPerTier: 0,
    });

    expect(result.allocations.map((startup) => startup.finalHours)).toStrictEqual([60, 40, 30, 20]);
    expect(result.proposedHours).toBe(150);
    expect(result.distribution?.withinMargin).toBe(true);
  });

  it('preserves an exact-score group across tier boundaries', () => {
    const result = allocateTargetDistribution(cohort(90, 80, 80, 60), 200, DEFAULT_POLICY, {
      targetShares: { 60: 0.25, 40: 0.25, 30: 0.25, 20: 0, 0: 0.25 },
      allowedCountDeviationPerTier: 1,
    });

    expect(result.allocations[1]?.finalHours).toBe(result.allocations[2]?.finalHours);
    expect(result.signals.some((signal) => signal.type === 'exact_score_tie')).toBe(true);
  });

  it('rejects shares that do not sum to one', () => {
    expect(() =>
      allocateTargetDistribution([], 100, DEFAULT_POLICY, {
        targetShares: { 60: 0.5, 40: 0.2, 30: 0.2, 20: 0.2, 0: 0 },
      }),
    ).toThrow(/sum to 1/);
  });
});
