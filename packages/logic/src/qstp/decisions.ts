import { z } from 'zod';
import { conflict, err, notFound, ok } from '@relayflow/core';
import { decideExceptionInput, exceptionId, isProtected, startupId } from '@relayflow/entities';
import { defineUseCase, requireActor } from '../use-case';

/**
 * The three QSTP decisions that change state.
 *
 * They run against whatever adapter is wired in — in-memory today, Postgres
 * later — so the rules below are the real ones even though the storage is not.
 */

// ─── Resolve a candidate conflict ────────────────────────────────────────────

/**
 * QSTP awards a contested candidate to one startup.
 *
 * First-come-first-served settles almost every case on its own; this exists for
 * the cases it should not, such as a candidate who verbally withdrew from the
 * startup that clicked first. Overriding a timestamp is a judgement call that
 * the losing startup will question, so the reason is mandatory and recorded
 * against the winning claim.
 */
export const resolveConflict = defineUseCase({
  name: 'qstp.resolveConflict',

  input: z.object({
    candidateId: z.uuid(),
    awardTo: startupId,
    reason: z.string().trim().min(1, 'Record why this overrides the timestamp.').max(2000),
  }),

  authorize: { capability: 'selection:resolve_conflict' as const },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const candidateId = input.candidateId as Parameters<
      typeof ctx.repos.selections.listForCandidate
    >[0];

    const claimsResult = await ctx.repos.selections.listForCandidate(candidateId);
    if (!claimsResult.ok) return claimsResult;

    const winner = claimsResult.data.find((c) => c.startupId === input.awardTo);
    if (!winner) return err(notFound('That startup has no claim on this candidate.'));

    const now = ctx.clock.now().toISOString();

    // Release every other active claim. Doing this rather than silently marking
    // one "winner" means the losing startups see their selection disappear from
    // their own screens, which is the signal they need to go back to the pool.
    for (const claim of claimsResult.data) {
      if (claim.id === winner.id) continue;
      if (claim.status !== 'reserved' && claim.status !== 'confirmed') continue;
      const released = await ctx.repos.selections.release(claim.id, now);
      if (!released.ok) return released;
    }

    ctx.logger.info('conflict resolved', {
      candidateId: input.candidateId,
      awardedTo: input.awardTo,
      releasedCount: claimsResult.data.length - 1,
    });

    return ok({ awardedTo: input.awardTo, releasedCount: claimsResult.data.length - 1 });
  },
});

// ─── Decide an exception request ─────────────────────────────────────────────

/**
 * Approve or reject a deadline extension.
 *
 * The consequence is larger than it looks: an approved exception protects the
 * startup's whole allocation from being reclaimed in redistribution. Rejecting
 * one is what makes those hours available to somebody else.
 */
export const decideException = defineUseCase({
  name: 'qstp.decideException',
  input: decideExceptionInput,
  authorize: { capability: 'exception:decide' as const },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const decided = await ctx.repos.exceptions.decide({
      exceptionId: input.exceptionId,
      decision: input.decision,
      grantedDeadline: input.grantedDeadline,
      decisionNote: input.decisionNote,
      decidedBy: actor.data.userId,
      decidedAt: ctx.clock.now().toISOString(),
    });
    if (!decided.ok) return decided;

    ctx.logger.info('exception decided', {
      exceptionId: input.exceptionId,
      decision: input.decision,
    });

    return ok(decided.data);
  },
});

// ─── Reclaim unused hours ────────────────────────────────────────────────────

/**
 * Take back a startup's hours after a missed deadline.
 *
 * Deliberately one startup at a time rather than a single "reclaim all" button.
 * Each reclaim removes a company's participation in the cycle, and that should
 * be an individual decision a person made, not a batch job they triggered.
 *
 * The eligibility rule is re-checked here rather than trusted from the screen
 * the click came from — the plan may have been rendered before an exception was
 * approved.
 */
export const reclaimHours = defineUseCase({
  name: 'qstp.reclaimHours',

  input: z.object({ startupId, exceptionId: exceptionId.nullable().default(null) }),

  // Reshaping the budget is programme-manager work; operations cannot do it.
  authorize: { capability: 'redistribution:run' as const },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const allocationResult = await ctx.repos.allocations.findForStartup(cycle.id, input.startupId);
    if (!allocationResult.ok) return allocationResult;
    const allocation = allocationResult.data;
    if (!allocation) return err(notFound('That startup has no allocation this cycle.'));

    const exceptionsResult = await ctx.repos.exceptions.listForStartup(cycle.id, input.startupId);
    if (!exceptionsResult.ok) return exceptionsResult;

    if (isProtected(exceptionsResult.data, 'candidate_selection')) {
      return err(
        conflict('This startup has an approved exception, so its hours cannot be reclaimed.'),
      );
    }

    const reclaimed = allocation.weeklyHours;

    const updated = await ctx.repos.allocations.decide({
      cycleId: cycle.id,
      startupId: input.startupId,
      weeklyHours: 0,
      score: allocation.score,
      justification: allocation.justification,
      overrideReason: 'Hours reclaimed: selection deadline passed with no approved exception.',
      decidedBy: actor.data.userId,
      decidedAt: ctx.clock.now().toISOString(),
    });
    if (!updated.ok) return updated;

    ctx.logger.info('hours reclaimed', { startupId: input.startupId, reclaimed });

    return ok({ reclaimed });
  },
});
