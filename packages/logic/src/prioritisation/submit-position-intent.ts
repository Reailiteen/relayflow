import { err, notFound, ok, validation } from '@relayflow/core';
import {
  checkIntentFeasibility,
  cycleId as cycleIdSchema,
  startupId as startupIdSchema,
  submitPositionIntentInput,
  type PositionIntent,
} from '@relayflow/entities';
import { DEFAULT_POLICY } from '@relayflow/prioritisation';
import { z } from 'zod';
import { defineUseCase, requireActor } from '../use-case';

/**
 * A startup declaring it can host an intern, during the `allocation` stage.
 *
 * Submitted before hours exist, so it deliberately says nothing about how many
 * interns or how many hours — those are QSTP's to decide. It answers only the
 * readiness question the prioritisation engine gates on.
 */
export const submitPositionIntent = defineUseCase({
  name: 'prioritisation.submitPositionIntent',
  input: submitPositionIntentInput.extend({
    cycleId: cycleIdSchema,
    intentId: z.uuid().optional(),
  }),

  authorize: (_ctx, input) => ({
    capability: 'position:submit' as const,
    startupId: input.startupId,
  }),

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const cycleResult = await ctx.repos.cycles.findById(input.cycleId);
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('That cycle does not exist.'));

    // Readiness is an input to prioritisation, so it closes when prioritisation
    // does. After that the real position form is the place to describe a role.
    if (cycle.stage !== 'allocation') {
      return err(
        validation('Readiness answers are collected while hours are being allocated.'),
      );
    }

    const occurredAt = ctx.clock.now().toISOString();
    const saved = await ctx.repos.positionIntents.save({
      ...(input.intentId ? { id: input.intentId as PositionIntent['id'] } : {}),
      cycleId: input.cycleId,
      startupId: input.startupId,
      title: input.title,
      category: input.category,
      expectedDeliverable: input.expectedDeliverable,
      learningOutcomes: input.learningOutcomes,
      workMode: input.workMode,
      supervisorName: input.supervisorName,
      supervisorId: null,
      weeklySupervisionMinutes: input.weeklySupervisionMinutes,
      maximumInterns: input.maximumInterns,
      resourcesReady: input.resourcesReady,
      onboardingReady: input.onboardingReady,
      submittedBy: actor.data.userId,
      submittedAt: occurredAt,
      occurredAt,
    });
    if (!saved.ok) return saved;

    // Accepted either way — an unready role is a real answer, and QSTP needs to
    // see it. But the startup is told now, while they can still fix it, rather
    // than finding out through an allocation they never got.
    const feasibility = checkIntentFeasibility(saved.data, DEFAULT_POLICY);
    return ok({
      intent: saved.data,
      feasible: feasibility?.feasible ?? false,
      unmetChecks: feasibility
        ? Object.entries(feasibility.checks)
            .filter(([, passed]) => !passed)
            .map(([check]) => check)
        : [],
    });
  },
});

/** Everything a startup has declared for a cycle, with the gate applied. */
export const listPositionIntents = defineUseCase({
  name: 'prioritisation.listPositionIntents',
  input: z.object({ cycleId: cycleIdSchema, startupId: startupIdSchema }),

  authorize: (_ctx, input) => ({
    capability: 'position:read_own' as const,
    startupId: input.startupId,
  }),

  execute: async (ctx, input) => {
    const intents = await ctx.repos.positionIntents.listForStartup(
      input.cycleId,
      input.startupId,
    );
    if (!intents.ok) return intents;
    return ok(
      intents.data.map((intent) => ({
        intent,
        feasible: checkIntentFeasibility(intent, DEFAULT_POLICY)?.feasible ?? false,
      })),
    );
  },
});
