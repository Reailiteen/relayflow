import { conflict, err, forbidden, notFound, ok } from '@relayflow/core';
import { ANY_STARTUP, authorize } from '@relayflow/access';
import { isSelectable, selectCandidateInput } from '@relayflow/entities';
import { defineUseCase, requireActor } from '../use-case';

/**
 * A startup claims a candidate — the product's sharpest operation.
 *
 * Four things have to hold, and the order matters. The authorization check runs
 * against the *position's* startup, not one the caller supplied, so a startup
 * cannot select against a rival's position. Then the candidate must actually be
 * in that position's pool, must still be available, and must be unclaimed.
 *
 * The final unclaimed check is delegated to the port rather than done here on
 * purpose. Reading "is anyone holding them?" and then writing is a race, and
 * two startups clicking Select within the same second is exactly the scenario
 * this system exists to prevent. Only the storage layer can close that window
 * — with a unique index — so it is the storage layer's contract to do so.
 */
export const selectCandidate = defineUseCase({
  name: 'selection.selectCandidate',
  input: selectCandidateInput,

  // Step one of two: may this actor select anywhere at all? The startup that
  // actually owns the position is not known until it has been loaded, so the
  // real check happens below — this only turns away callers who could never
  // select regardless of position (candidates, auditors, supervisors).
  authorize: { capability: 'selection:create' as const, startupId: ANY_STARTUP },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const positionResult = await ctx.repos.positions.findById(input.positionId);
    if (!positionResult.ok) return positionResult;
    const position = positionResult.data;
    if (!position) return err(notFound('Position not found.'));

    // Step two: re-authorize now that we know whose position this is. Without
    // it, `selection:create` would let any startup select against any position
    // — the capability says *what*, this says *whose*.
    const scoped = authorize(ctx.actor, {
      capability: 'selection:create',
      startupId: position.startupId,
    });
    if (!scoped.ok) return scoped;

    const poolResult = await ctx.repos.candidates.listPool(position.id);
    if (!poolResult.ok) return poolResult;

    const inPool = poolResult.data.find((row) => row.candidate.id === input.candidateId);
    if (!inPool) {
      // Not "not found": the startup can see this position, so an unfamiliar
      // candidate id means they are reaching outside their pool.
      return err(forbidden('That candidate is not in this position’s pool.'));
    }

    if (!isSelectable(inPool.candidate.availability)) {
      return err(
        conflict(
          inPool.candidate.availability === 'placed'
            ? 'That candidate has already been placed elsewhere.'
            : 'That candidate is no longer available.',
          { context: { availability: inPool.candidate.availability } },
        ),
      );
    }

    // The port refuses a second active claim and returns a `conflict` error.
    // Its message is already written for the startup that lost the race.
    const reserved = await ctx.repos.selections.reserve({
      positionId: position.id,
      startupId: position.startupId,
      candidateId: input.candidateId,
      selectedBy: actor.data.userId,
      reservedAt: ctx.clock.now().toISOString(),
    });
    if (!reserved.ok) return reserved;

    ctx.logger.info('candidate reserved', {
      positionId: position.id,
      startupId: position.startupId,
      candidateId: input.candidateId,
    });

    return ok(reserved.data);
  },
});
