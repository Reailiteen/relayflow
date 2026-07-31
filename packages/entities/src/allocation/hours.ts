/**
 * The hour budget — the spine of the whole product.
 *
 * QSTP has a fixed number of funded weekly hours. Those hours are allocated to
 * startups in tiers, consumed by the interns actually placed, released when a
 * startup misses its deadline, and re-allocated in a redistribution round.
 * Every stage of the workflow moves numbers between those buckets.
 *
 * The arithmetic lives here, pure and total, for two reasons. It is the thing
 * most expensive to get subtly wrong — an over-allocation is a funding overrun
 * that nobody notices until payroll — and it is the thing hardest to verify by
 * clicking around a UI. Everything below is a function of its inputs and is
 * unit-tested against the awkward cases rather than the happy ones.
 */

/**
 * The tiers QSTP allocates in. Deliberately a closed set, not a free number:
 * the programme runs on agreed bands, and an arbitrary 37 would mean somebody
 * bypassed the evaluation.
 */
export const HOUR_TIERS = [60, 40, 30, 20, 0] as const;

export type HourTier = (typeof HOUR_TIERS)[number];

export function isHourTier(value: number): value is HourTier {
  return (HOUR_TIERS as readonly number[]).includes(value);
}

/** The next tier down, for redistribution and for "offer them less" decisions. */
export function tierBelow(tier: HourTier): HourTier | null {
  const index = HOUR_TIERS.indexOf(tier);
  return HOUR_TIERS[index + 1] ?? null;
}

/**
 * A read-only view of where the cycle's hours currently sit.
 *
 * `allocated` is what QSTP has promised to startups. `committed` is what those
 * startups have actually spent by placing interns. The gap between them is the
 * interesting number: it is hours that are spoken for but not yet used, and
 * after the selection deadline it is exactly what redistribution reclaims.
 */
export interface HourBudget {
  /** Total funded weekly hours for the cycle. Set once at cycle creation. */
  readonly funded: number;
  /** Sum of every active startup allocation. */
  readonly allocated: number;
  /** Sum of hours on positions with a confirmed intern. */
  readonly committed: number;
}

export interface BudgetView extends HourBudget {
  /** Funded but not yet promised to anyone — available to allocate right now. */
  readonly unallocated: number;
  /** Promised but not yet used. Candidate for reclaim after the deadline. */
  readonly idle: number;
  /** committed / funded, 0–1. Null when nothing is funded, rather than NaN. */
  readonly utilisation: number | null;
}

export function budgetView(budget: HourBudget): BudgetView {
  return {
    ...budget,
    // Clamped at zero: a negative "available" reads as a data error to whoever
    // sees it, and the real over-allocation is surfaced by `overAllocatedBy`
    // instead of being smuggled into a headline number.
    unallocated: Math.max(0, budget.funded - budget.allocated),
    idle: Math.max(0, budget.allocated - budget.committed),
    utilisation: budget.funded === 0 ? null : budget.committed / budget.funded,
  };
}

/** How far past the funded total the current allocations go. 0 when healthy. */
export function overAllocatedBy(budget: HourBudget): number {
  return Math.max(0, budget.allocated - budget.funded);
}

export function isOverAllocated(budget: HourBudget): boolean {
  return overAllocatedBy(budget) > 0;
}

/**
 * Whether QSTP can allocate `tier` hours to one more startup.
 *
 * Called before every allocation and before every redistribution grant, so the
 * over-allocation is refused at the point of decision rather than discovered in
 * a report afterwards.
 */
export function canAllocate(budget: HourBudget, tier: HourTier): boolean {
  return budget.allocated + tier <= budget.funded;
}

/**
 * Re-allocating an existing startup from one tier to another: only the delta
 * matters, so moving 60 → 40 always succeeds even in an exhausted budget.
 */
export function canChangeTier(budget: HourBudget, from: HourTier, to: HourTier): boolean {
  const delta = to - from;
  return delta <= 0 || budget.allocated + delta <= budget.funded;
}

/**
 * The largest tier that still fits. Used to suggest a realistic allocation
 * rather than letting QSTP pick one and then be told no.
 */
export function largestAffordableTier(budget: HourBudget): HourTier {
  const room = budget.funded - budget.allocated;
  return HOUR_TIERS.find((tier) => tier <= room) ?? 0;
}

/** Weekly hours a position consumes: one intern's hours times the headcount. */
export function positionHours(hoursPerIntern: number, internCount: number): number {
  return hoursPerIntern * internCount;
}

/**
 * Whether a startup's positions fit inside its own allocation.
 *
 * This is the Stage 2 guard — a startup on 40 hours must not be able to submit
 * roles totalling 60. `proposed` is the position being added or edited, and is
 * excluded from `existing` by the caller so an edit does not count twice.
 */
export function fitsInAllocation(
  allocatedHours: number,
  existingPositionHours: readonly number[],
  proposed: number,
): boolean {
  const used = existingPositionHours.reduce((total, hours) => total + hours, 0);
  return used + proposed <= allocatedHours;
}

export function remainingStartupHours(
  allocatedHours: number,
  positionHoursList: readonly number[],
): number {
  const used = positionHoursList.reduce((total, hours) => total + hours, 0);
  return Math.max(0, allocatedHours - used);
}
