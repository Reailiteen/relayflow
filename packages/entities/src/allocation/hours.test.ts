import { describe, expect, it } from 'vitest';
import {
  budgetView,
  canAllocate,
  canChangeTier,
  fitsInAllocation,
  isOverAllocated,
  largestAffordableTier,
  overAllocatedBy,
  tierBelow,
} from './hours';

/**
 * These target the cases that cost money when they are wrong, not the ones
 * that are pleasant to write.
 */
describe('hour budget', () => {
  const budget = (funded: number, allocated: number, committed: number) => ({
    funded,
    allocated,
    committed,
  });

  it('reports unallocated and idle hours separately', () => {
    // 500 funded, 300 promised, 180 actually used by placed interns.
    const view = budgetView(budget(500, 300, 180));
    expect(view.unallocated).toBe(200); // free to allocate now
    expect(view.idle).toBe(120); // promised but unused — reclaimable later
    expect(view.utilisation).toBeCloseTo(0.36);
  });

  it('never reports a negative headline number when over-allocated', () => {
    const view = budgetView(budget(100, 140, 0));
    expect(view.unallocated).toBe(0);
    // The overrun is surfaced explicitly rather than as a negative "available".
    expect(overAllocatedBy(budget(100, 140, 0))).toBe(40);
    expect(isOverAllocated(budget(100, 140, 0))).toBe(true);
  });

  it('returns null utilisation rather than NaN for an unfunded cycle', () => {
    expect(budgetView(budget(0, 0, 0)).utilisation).toBeNull();
  });

  it('refuses an allocation that would exceed the funded total', () => {
    expect(canAllocate(budget(100, 60, 0), 40)).toBe(true);
    expect(canAllocate(budget(100, 60, 0), 60)).toBe(false);
  });

  it('allows an exact fit — the boundary is inclusive', () => {
    expect(canAllocate(budget(100, 40, 0), 60)).toBe(true);
  });

  it('always permits lowering a tier, even in an exhausted budget', () => {
    const exhausted = budget(100, 100, 0);
    expect(canChangeTier(exhausted, 60, 40)).toBe(true);
    expect(canChangeTier(exhausted, 40, 60)).toBe(false);
  });

  it('suggests the largest tier that actually fits', () => {
    expect(largestAffordableTier(budget(100, 55, 0))).toBe(40);
    expect(largestAffordableTier(budget(100, 85, 0))).toBe(0);
    expect(largestAffordableTier(budget(100, 100, 0))).toBe(0);
  });

  it('walks tiers downward and stops at zero', () => {
    expect(tierBelow(60)).toBe(40);
    expect(tierBelow(20)).toBe(0);
    expect(tierBelow(0)).toBeNull();
  });

  it('stops a startup requesting more hours than its own allocation', () => {
    // 40-hour startup with one 20-hour position already submitted.
    expect(fitsInAllocation(40, [20], 20)).toBe(true);
    expect(fitsInAllocation(40, [20], 30)).toBe(false);
  });

  it('counts headcount, not just hours per intern', () => {
    // Two interns at 20 hours each is 40 hours, not 20.
    expect(fitsInAllocation(30, [], 20 * 2)).toBe(false);
  });
});
