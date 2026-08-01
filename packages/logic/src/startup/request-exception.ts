import { conflict, err, notFound, ok } from '@relayflow/core';
import { ANY_STARTUP, authorize, isStartup } from '@relayflow/access';
import { requestExceptionInput } from '@relayflow/entities';
import { defineUseCase, requireActor } from '../use-case';

/**
 * A startup asks QSTP for more time.
 *
 * Two guards beyond the obvious. A second pending request is refused, because
 * a queue of duplicates is how a genuine request gets lost. And an extension
 * must actually extend — asking for a date on or before the current deadline is
 * almost always a mistyped year, and approving it would quietly shorten their
 * time rather than lengthen it.
 */
export const requestException = defineUseCase({
  name: 'startup.requestException',
  input: requestExceptionInput,
  authorize: { capability: 'exception:request' as const, startupId: ANY_STARTUP },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    if (!isStartup(ctx.actor)) return err(notFound('You are not affiliated with a startup.'));
    const startupId = ctx.actor.affiliations.find((a) => a.status === 'active')?.startupId;
    if (!startupId) return err(notFound('You are not affiliated with a startup.'));

    const scoped = authorize(ctx.actor, { capability: 'exception:request', startupId });
    if (!scoped.ok) return scoped;

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const existing = await ctx.repos.exceptions.listForStartup(cycle.id, startupId);
    if (!existing.ok) return existing;

    if (existing.data.some((e) => e.kind === input.kind && e.status === 'pending')) {
      return err(
        conflict('You already have a request for this deadline waiting on QSTP.', {
          context: { kind: input.kind },
        }),
      );
    }
    if (existing.data.some((e) => e.kind === input.kind && e.status === 'approved')) {
      return err(conflict('An extension for this deadline has already been approved.'));
    }

    const currentDeadline =
      input.kind === 'position_submission'
        ? cycle.deadlines.positionSubmission
        : cycle.deadlines.candidateSelection;

    if (ctx.clock.now().toISOString() >= currentDeadline) {
      return err(
        conflict('Extension requests must be submitted before the effective deadline.', {
          context: { kind: input.kind, current: currentDeadline },
        }),
      );
    }

    if (input.requestedDeadline <= currentDeadline) {
      return err(
        conflict('The date you asked for is not later than the current deadline.', {
          context: { requested: input.requestedDeadline, current: currentDeadline },
        }),
      );
    }

    const created = await ctx.repos.exceptions.request({
      cycleId: cycle.id,
      startupId,
      kind: input.kind,
      reason: input.reason,
      requestedDeadline: input.requestedDeadline,
      requestedBy: actor.data.userId,
    });
    if (!created.ok) return created;

    ctx.logger.info('exception requested', { startupId, kind: input.kind });

    return ok(created.data);
  },
});
