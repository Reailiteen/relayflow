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
 *
 * What the write *means* depends on the cycle's selection mode, and that is
 * decided here rather than by the caller. Under `first_come` it reserves, as it
 * always has. Under `candidate_choice` it records an offer and the candidate
 * decides later. Reading the mode from the cycle instead of from input is what
 * stops a client asking for the mode that suits it.
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

    const cycleResult = await ctx.repos.cycles.findById(position.cycleId);
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const now = ctx.clock.now().toISOString();

    // Under candidate-choice this is an expression of interest, not a claim.
    // Nobody is blocked, several startups may be here at once, and the
    // candidate resolves it — so there is no race to lose and no conflict to
    // report, only the guard against offering someone already reserved.
    if (cycle.selectionMode === 'candidate_choice') {
      if (cycle.deadlines.offerWindow !== null && now > cycle.deadlines.offerWindow) {
        return err(conflict('Offers for this cycle have closed.'));
      }

      const offered = await ctx.repos.selections.offer({
        positionId: position.id,
        startupId: position.startupId,
        candidateId: input.candidateId,
        selectedBy: actor.data.userId,
        offeredAt: now,
      });
      if (!offered.ok) return offered;

      ctx.logger.info('candidate offered', {
        positionId: position.id,
        startupId: position.startupId,
        candidateId: input.candidateId,
      });

      return ok(offered.data);
    }

    // The port refuses a second active claim and returns a `conflict` error.
    // Its message is already written for the startup that lost the race.
    const reserved = await ctx.repos.selections.reserve({
      positionId: position.id,
      startupId: position.startupId,
      candidateId: input.candidateId,
      selectedBy: actor.data.userId,
      reservedAt: now,
    });
    if (!reserved.ok) {
      if (reserved.error.code === 'conflict') {
        const claims = await ctx.repos.selections.listForCandidate(input.candidateId);
        const blocking = claims.ok
          ? claims.data.find(
              (claim) =>
                claim.status === 'reserved' ||
                claim.status === 'accepted' ||
                claim.status === 'confirmed',
            )
          : null;
        if (blocking) {
          await ctx.repos.conflicts.record({
            cycleId: position.cycleId,
            candidateId: input.candidateId,
            attemptedSelectionId: null,
            blockingSelectionId: blocking.id,
            status: 'open',
            previousStartupId: blocking.startupId,
            requestedStartupId: position.startupId,
            resolvedBy: null,
            reason: null,
            createdAt: now,
            resolvedAt: null,
          });
          await ctx.repos.activity.append({
            cycleId: position.cycleId,
            entityType: 'selection_conflict',
            entityId: input.candidateId,
            action: 'created',
            actorId: actor.data.userId,
            actorRole: 'owner',
            before: { blockingStartupId: blocking.startupId },
            after: { requestedStartupId: position.startupId },
            reason: null,
            occurredAt: now,
          });
        }
      }
      return reserved;
    }

    ctx.logger.info('candidate reserved', {
      positionId: position.id,
      startupId: position.startupId,
      candidateId: input.candidateId,
    });

    return ok(reserved.data);
  },
});
