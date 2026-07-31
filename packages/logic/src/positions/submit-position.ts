import { err, forbidden, notFound, ok, validation } from '@relayflow/core';
import { ANY_STARTUP, authorize } from '@relayflow/access';
import { z } from 'zod';
import {
  fitsInAllocation,
  positionHours,
  remainingStartupHours,
  reservesHours,
  submitPositionInput,
  totalWeeklyHours,
} from '@relayflow/entities';
import { defineUseCase, requireActor } from '../use-case';

/**
 * A startup submits a role.
 *
 * The Stage 2 rule is that a startup cannot request more hours than its tier,
 * counted across all its positions — a 40-hour startup must not be able to
 * submit two 30-hour roles by submitting them one at a time. So the check sums
 * what they already have rather than looking at this position alone.
 *
 * The error tells them how much room is actually left. "Exceeds your
 * allocation" makes someone open a spreadsheet; "you have 20 hours remaining"
 * lets them fix it immediately.
 */
export const submitPosition = defineUseCase({
  name: 'position.submit',

  input: submitPositionInput.extend({
    startupId: z.uuid(),
  }),

  authorize: { capability: 'position:submit' as const, startupId: ANY_STARTUP },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const startupId = input.startupId as Parameters<typeof ctx.repos.startups.findById>[0];

    // Scope the coarse gate above to the startup actually named in the input.
    const scoped = authorize(ctx.actor, { capability: 'position:submit', startupId });
    if (!scoped.ok) return scoped;

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const allocationResult = await ctx.repos.allocations.findForStartup(cycle.id, startupId);
    if (!allocationResult.ok) return allocationResult;
    const allocation = allocationResult.data;

    if (!allocation || allocation.status !== 'confirmed') {
      return err(forbidden('Your allocation for this cycle has not been confirmed yet.'));
    }
    if (allocation.weeklyHours === 0) {
      return err(
        forbidden(
          'You have not been allocated hours for this cycle. ' +
            'If hours are redistributed you will be invited to submit roles then.',
        ),
      );
    }

    const existingResult = await ctx.repos.positions.listForStartup(cycle.id, startupId);
    if (!existingResult.ok) return existingResult;

    // Withdrawn and rejected roles do not hold hours, so they must not count
    // against the startup here.
    const held = existingResult.data
      .filter((p) => reservesHours(p.status))
      .map((p) => totalWeeklyHours(p));

    const requested = positionHours(input.hoursPerIntern, input.internCount);

    if (!fitsInAllocation(allocation.weeklyHours, held, requested)) {
      const remaining = remainingStartupHours(allocation.weeklyHours, held);
      return err(
        validation(
          `This role needs ${requested} weekly hours but you have ${remaining} of ` +
            `${allocation.weeklyHours} remaining. Reduce the intern count or hours per intern.`,
          { context: { requested, remaining, allocated: allocation.weeklyHours } },
        ),
      );
    }

    const created = await ctx.repos.positions.create({
      cycleId: cycle.id,
      startupId,
      title: input.title,
      description: input.description,
      requiredSkills: input.requiredSkills,
      internCount: input.internCount,
      hoursPerIntern: input.hoursPerIntern,
      durationWeeks: input.durationWeeks,
      supervisorName: input.supervisorName,
    });
    if (!created.ok) return created;

    ctx.logger.info('position submitted', {
      startupId,
      positionId: created.data.id,
      weeklyHours: requested,
    });

    return ok(created.data);
  },
});
