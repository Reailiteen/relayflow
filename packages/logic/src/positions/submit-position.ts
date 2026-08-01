import { err, forbidden, notFound, ok, validation } from '@relayflow/core';
import { ANY_STARTUP, authorize, isStartup } from '@relayflow/access';
import {
  fitsInAllocation,
  cycleId,
  effectiveDeadline,
  positionHours,
  remainingStartupHours,
  reservesHours,
  submitPositionInput,
  totalWeeklyHours,
  redistributionRoundId,
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

  input: submitPositionInput.extend({ cycleId, redistributionRoundId: redistributionRoundId.nullable().default(null) }),

  authorize: { capability: 'position:submit' as const, startupId: ANY_STARTUP },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    // The startup comes from the verified actor, never from input. A submitted
    // startupId would let one company spend another's allocation.
    if (!isStartup(ctx.actor)) return err(forbidden('Only a startup can submit positions.'));
    const startupId = ctx.actor.affiliations.find((a) => a.status === 'active')?.startupId;
    if (!startupId) return err(forbidden('You are not an active member of a startup.'));

    const scoped = authorize(ctx.actor, { capability: 'position:submit', startupId });
    if (!scoped.ok) return scoped;

    const cycleResult = await ctx.repos.cycles.findById(input.cycleId);
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle || cycle.archivedAt) return err(notFound('Cycle not found.'));
    if (!['positions', 'completion'].includes(cycle.stage)) return err(forbidden('Position submission is not open for this cycle.'));

    const [allocationResult, participationResult, exceptionsResult] = await Promise.all([
      ctx.repos.allocations.findForStartup(cycle.id, startupId),
      ctx.repos.participation.find(cycle.id, startupId),
      ctx.repos.exceptions.listForStartup(cycle.id, startupId),
    ]);
    if (!allocationResult.ok) return allocationResult;
    if (!participationResult.ok) return participationResult;
    if (!exceptionsResult.ok) return exceptionsResult;
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
    if (!participationResult.data?.allocationAcknowledgedAt) {
      return err(
        forbidden('Acknowledge your published allocation before submitting positions.'),
      );
    }
    if (participationResult.data.status !== 'accepted') return err(forbidden('This startup is not eligible to submit positions.'));
    let deadline = effectiveDeadline(cycle.deadlines.positionSubmission, exceptionsResult.data, 'position_submission');
    if (input.redistributionRoundId) {
      const rounds = await ctx.repos.recovery.listRounds(cycle.id);
      if (!rounds.ok) return rounds;
      const round = rounds.data.find((row) => row.id === input.redistributionRoundId);
      if (!round || !round.invitations.some((row) => row.startupId === startupId && row.status === 'accepted')) {
        return err(notFound('Redistribution round not found.'));
      }
      deadline = round.positionDeadline;
    }
    if (ctx.clock.now().toISOString() > deadline) {
      return err(
        forbidden('The position submission deadline has passed. Ask QSTP for an extension.'),
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
      workArrangement: input.workArrangement,
      additionalRequirements: input.additionalRequirements,
      internCount: input.internCount,
      hoursPerIntern: input.hoursPerIntern,
      durationWeeks: input.durationWeeks,
      supervisorName: input.supervisorName,
      redistributionRoundId: input.redistributionRoundId,
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
