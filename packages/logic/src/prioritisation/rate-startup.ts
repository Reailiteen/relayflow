import { conflict, err, notFound, ok, validation } from '@relayflow/core';
import {
  RATING_KEYS,
  cycleId as cycleIdSchema,
  draftStartupRatingInput,
  missingDimensions,
  submitStartupRatingInput,
} from '@relayflow/entities';
import { z } from 'zod';
import { defineUseCase, requireActor } from '../use-case';

/**
 * The six QSTP judgements that carry ninety of a startup's hundred points.
 *
 * Three use-cases rather than one save: a half-finished draft and a rating that
 * a funding decision was calculated from are different things, and letting the
 * first quietly become the second is how an unreviewed number ends up in a
 * published allocation.
 */

/** Partial by design — a reviewer works through the dimensions over time. */
export const draftStartupRating = defineUseCase({
  name: 'prioritisation.draftStartupRating',
  input: draftStartupRatingInput.extend({ cycleId: cycleIdSchema }),

  authorize: { capability: 'rating:submit' as const },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const saved = await ctx.repos.ratings.saveDraft({
      cycleId: input.cycleId,
      startupId: input.startupId,
      items: input.items.map((item) => ({ ...item, citations: item.citations })),
      ratedBy: actor.data.userId,
      occurredAt: ctx.clock.now().toISOString(),
    });
    if (!saved.ok) return saved;

    return ok({ rating: saved.data, missing: missingDimensions(saved.data) });
  },
});

/**
 * Commits all six at once.
 *
 * Partial submission is refused rather than accepted-and-flagged. A startup
 * rated on four dimensions out of six would score lower than one rated on all
 * six for reasons that have nothing to do with the startup.
 */
export const submitStartupRating = defineUseCase({
  name: 'prioritisation.submitStartupRating',
  input: submitStartupRatingInput.extend({ cycleId: cycleIdSchema }),

  authorize: { capability: 'rating:submit' as const },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const cycleResult = await ctx.repos.cycles.findById(input.cycleId);
    if (!cycleResult.ok) return cycleResult;
    if (!cycleResult.data) return err(notFound('That cycle does not exist.'));

    const named = new Set(input.items.map((item) => item.dimension));
    if (named.size !== RATING_KEYS.length) {
      return err(validation('Each of the six dimensions must be rated exactly once.'));
    }

    const existing = await ctx.repos.ratings.findForStartup(input.cycleId, input.startupId);
    if (!existing.ok) return existing;

    const replacing = existing.data?.status === 'submitted';
    if (replacing && !input.revisionReason) {
      return err(
        validation('Say why the rating is changing — it may already have informed a decision.'),
      );
    }

    // A confirmed run has already turned these ratings into allocations. Editing
    // the inputs underneath it would leave the published decision unexplainable,
    // so the way to change your mind is a fresh run.
    const runs = await ctx.repos.prioritization.listForCycle(input.cycleId);
    if (!runs.ok) return runs;
    if (runs.data.some((run) => run.status === 'confirmed')) {
      return err(
        conflict('Allocations for this cycle are already published. Start a new run to re-rate.'),
      );
    }

    const submitted = await ctx.repos.ratings.submit({
      cycleId: input.cycleId,
      startupId: input.startupId,
      items: input.items,
      ratedBy: actor.data.userId,
      revisionReason: input.revisionReason,
      occurredAt: ctx.clock.now().toISOString(),
    });
    if (!submitted.ok) return submitted;

    return ok(submitted.data);
  },
});

/** Every rating in a cycle, for the review screen and the run's input summary. */
export const listStartupRatings = defineUseCase({
  name: 'prioritisation.listStartupRatings',
  input: z.object({ cycleId: cycleIdSchema }),

  authorize: { capability: 'rating:read_all' as const },

  execute: async (ctx, input) => {
    const ratings = await ctx.repos.ratings.listForCycle(input.cycleId);
    if (!ratings.ok) return ratings;
    return ok(
      ratings.data.map((rating) => ({ rating, missing: missingDimensions(rating) })),
    );
  },
});
