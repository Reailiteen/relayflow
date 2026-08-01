import { z } from 'zod';
import { conflict, err, notFound, ok } from '@relayflow/core';
import { isCandidate } from '@relayflow/access';
import { acceptOfferInput, cycleId, selectionId } from '@relayflow/entities';
import { defineUseCase } from '../use-case';

/**
 * The candidate accepts one of their offers — and, in the same write, declines
 * the rest.
 *
 * This is the first operation in the system where the person being placed is
 * the one deciding, and that changes two things about how it is written.
 *
 * The candidate id comes from the actor, never from input. A candidate holds
 * exactly one identity and it is on their session, so accepting on someone
 * else's behalf is not a request the API can express — which is a stronger
 * guarantee than refusing it.
 *
 * And the atomicity is the port's job, not this function's. Accepting is the
 * moment a non-blocking offer becomes a blocking claim, so it races with an
 * FCFS reservation and with a second acceptance. Declining the siblings here,
 * in a loop, would leave a candidate holding two live offers if the process
 * died halfway. The port does it as one write, against the same unique index
 * that guards `reserve`.
 */
export const acceptOffer = defineUseCase({
  name: 'selection.acceptOffer',
  input: acceptOfferInput,

  // No startupId: for a candidate actor, a startup-scoped query is refused as
  // wrong_portal. The offer's startup is whichever one they picked.
  authorize: { capability: 'selection:accept_offer' as const },

  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) {
      // Reachable only if a non-candidate is ever granted the capability. The
      // use-case has no meaning for them, so it refuses rather than guessing.
      return err(notFound('No candidate record for this account.'));
    }
    const candidateId = ctx.actor.candidateId;

    const ownSelections = await ctx.repos.selections.listForCandidate(candidateId);
    if (!ownSelections.ok) return ownSelections;
    const offer = ownSelections.data.find((row) => row.id === input.selectionId);
    if (!offer) return err(notFound('Offer not found.'));
    const position = await ctx.repos.positions.findById(offer.positionId);
    if (!position.ok) return position;
    if (!position.data) return err(notFound('Offer not found.'));
    const cycleResult = await ctx.repos.cycles.findById(position.data.cycleId);
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const now = ctx.clock.now().toISOString();

    // The window closing does not void the offers — it hands the decision back
    // to the startups, earliest first. Letting the candidate accept after that
    // point would race with a startup being asked to confirm.
    if (cycle.deadlines.offerWindow !== null && now > cycle.deadlines.offerWindow) {
      return err(
        conflict('The time to choose has passed. QSTP will be in touch about next steps.'),
      );
    }

    const accepted = await ctx.repos.selections.acceptOffer({
      selectionId: input.selectionId,
      candidateId,
      acceptedAt: now,
    });
    if (!accepted.ok) return accepted;

    ctx.logger.info('offer accepted', {
      candidateId,
      selectionId: accepted.data.id,
      startupId: accepted.data.startupId,
    });

    return ok(accepted.data);
  },
});

/** Common candidate response for first-come reservations and choice-mode offers. */
export const respondToSelection = defineUseCase({
  name: 'selection.respond',
  input: z.object({
    cycleId,
    selectionId,
    decision: z.enum(['accepted', 'declined']),
  }),
  authorize: { capability: 'selection:accept_offer' as const },
  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) return err(notFound('Selection not found.'));
    const selections = await ctx.repos.selections.listForCandidate(ctx.actor.candidateId);
    if (!selections.ok) return selections;
    const selection = selections.data.find((row) => row.id === input.selectionId);
    if (!selection) return err(notFound('Selection not found.'));
    const position = await ctx.repos.positions.findById(selection.positionId);
    if (!position.ok) return position;
    if (!position.data || position.data.cycleId !== input.cycleId) return err(notFound('Selection not found.'));
    const now = ctx.clock.now().toISOString();
    if (input.decision === 'declined') {
      return ctx.repos.selections.decline(selection.id, ctx.actor.candidateId, now);
    }
    return selection.status === 'offered'
      ? ctx.repos.selections.acceptOffer({
          selectionId: selection.id,
          candidateId: ctx.actor.candidateId,
          acceptedAt: now,
        })
      : ctx.repos.selections.acceptReservation({
          selectionId: selection.id,
          candidateId: ctx.actor.candidateId,
          acceptedAt: now,
        });
  },
});
