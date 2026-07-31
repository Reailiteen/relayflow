import { err, notFound, ok, validation } from '@relayflow/core';
import {
  allocateInput,
  budgetView,
  canChangeTier,
  isHourTier,
  largestAffordableTier,
} from '@relayflow/entities';
import { defineUseCase, requireActor } from '../use-case';

/**
 * QSTP assigns a startup its weekly-hour tier.
 *
 * The guard that matters is the budget one: the cycle's funded total is a real
 * financial ceiling, and an over-allocation is a funding overrun that nobody
 * notices until interns are already working. So the check runs here *and* the
 * port re-checks inside the write — two operations staff allocating at the same
 * moment would otherwise both pass a stale read.
 *
 * Note it computes the delta rather than the absolute: moving a startup from 60
 * to 40 must always succeed, even when the budget is fully committed.
 */
export const decideAllocation = defineUseCase({
  name: 'allocation.decide',
  input: allocateInput,

  authorize: { capability: 'allocation:decide' as const },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    if (!isHourTier(input.weeklyHours)) {
      return err(validation('That is not one of the programme’s hour tiers.'));
    }

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle to allocate against.'));

    const allocationsResult = await ctx.repos.allocations.listForCycle(cycle.id);
    if (!allocationsResult.ok) return allocationsResult;

    const confirmed = allocationsResult.data.filter((a) => a.status === 'confirmed');
    const current = confirmed.find((a) => a.startupId === input.startupId);
    const allocated = confirmed.reduce((total, a) => total + a.weeklyHours, 0);

    const budget = {
      funded: cycle.fundedWeeklyHours,
      allocated,
      committed: 0, // not needed for this decision
    };

    if (!canChangeTier(budget, current?.weeklyHours ?? 0, input.weeklyHours)) {
      const view = budgetView(budget);
      return err(
        validation(
          `Only ${view.unallocated} weekly hours remain unallocated. ` +
            `The largest tier that fits is ${largestAffordableTier(budget)}.`,
          {
            context: {
              requested: input.weeklyHours,
              unallocated: view.unallocated,
              funded: budget.funded,
            },
          },
        ),
      );
    }

    const decided = await ctx.repos.allocations.decide({
      cycleId: cycle.id,
      startupId: input.startupId,
      weeklyHours: input.weeklyHours,
      score: input.score,
      justification: input.justification,
      overrideReason: input.overrideReason,
      decidedBy: actor.data.userId,
      decidedAt: ctx.clock.now().toISOString(),
    });
    if (!decided.ok) return decided;

    ctx.logger.info('allocation decided', {
      startupId: input.startupId,
      weeklyHours: input.weeklyHours,
      wasOverride: input.overrideReason !== null,
    });

    return ok(decided.data);
  },
});
