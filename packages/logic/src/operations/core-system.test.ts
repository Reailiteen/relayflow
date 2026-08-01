import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { createFixtureRepositories, createStore, DEV_ACTORS, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { UseCaseContext } from '../context';
import {
  adjustPrioritization,
  advanceCycleStage,
  getCycleWorkspace,
  publishAllocations,
  runPrioritization,
  signPlacementAgreement,
  transitionPosition,
} from './core-system';

function context(actor: UseCaseContext['actor'], store = createStore()): UseCaseContext {
  return {
    actor,
    repos: createFixtureRepositories(store),
    logger: silentLogger,
    clock: fixedClock('2026-08-01T09:00:00.000Z'),
  };
}

describe('cycle-scoped core system flows', () => {
  it('keeps two live cycles isolated at direct URLs', async () => {
    const store = createStore();
    const secondCycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const ctx = context(DEV_ACTORS.manager(), store);
    const first = await getCycleWorkspace(ctx, { cycleId: ids.cycle });
    const second = await getCycleWorkspace(ctx, { cycleId: secondCycle.id });
    expect(first.ok && first.data.positions.length).toBeGreaterThan(0);
    expect(second.ok && second.data.positions).toEqual([]);
    expect(second.ok && second.data.participation.length).toBeGreaterThan(0);
  });

  it('hides internal scoring and candidate-owned requirements from startups', async () => {
    const result = await getCycleWorkspace(context(DEV_ACTORS.startupOwner()), { cycleId: ids.cycle });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.participation.every((row) => row.operatorScore === null && row.internalNotes === null)).toBe(true);
    expect(result.data.requirements.some((row) => row.owner === 'candidate')).toBe(true);
    expect(result.data.requirementSubmissions.every((submission) => {
      const requirement = result.data.requirements.find((row) => row.id === submission.requirementId);
      return requirement?.owner !== 'candidate';
    })).toBe(true);
    expect(result.data.positions.every((row) => row.startupId === ids.acme)).toBe(true);
  });

  it('returns not_found when a candidate probes another cycle', async () => {
    const store = createStore();
    const secondCycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const result = await getCycleWorkspace(context(DEV_ACTORS.candidate(), store), {
      cycleId: secondCycle.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('runs and publishes a budget-safe prioritization version', async () => {
    const store = createStore();
    const cycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const ctx = context(DEV_ACTORS.manager(), store);
    const run = await runPrioritization(ctx, { cycleId: cycle.id });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.data.proposedHours).toBeLessThanOrEqual(cycle.fundedWeeklyHours);
    expect(run.data.withinBudget).toBe(true);
    const published = await publishAllocations(ctx, {
      cycleId: cycle.id,
      runId: run.data.id,
      acknowledgeIncomplete: true,
      incompleteReason: 'Chasing the outstanding rating and intent separately.',
    });
    expect(published.ok && published.data.status).toBe('confirmed');
    const allocations = await ctx.repos.allocations.listForCycle(cycle.id);
    expect(allocations.ok && allocations.data.reduce((sum, row) => sum + row.weeklyHours, 0)).toBeLessThanOrEqual(cycle.fundedWeeklyHours);
  });

  /**
   * The behaviour the whole five-status design exists for. Two startups here
   * were never evaluated — one submitted no readiness answer, one has no
   * rating — and they must not come out the other side holding a 0h allocation
   * that reads as "we assessed you and you did not qualify".
   */
  it('gives no allocation to a startup that was never evaluated', async () => {
    const store = createStore();
    const cycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const ctx = context(DEV_ACTORS.manager(), store);

    const run = await runPrioritization(ctx, { cycleId: cycle.id });
    if (!run.ok) throw run.error;

    const byStatus = (status: string) =>
      run.data.outcomes.filter((row) => row.status === status).map((row) => row.startupId);

    // Every distinct outcome the engine can reach is represented.
    expect(byStatus('scored').length).toBeGreaterThan(0);
    expect(byStatus('needs_information')).toHaveLength(1);
    expect(byStatus('awaiting_manual_scores')).toHaveLength(1);
    expect(byStatus('not_ready')).toHaveLength(1);
    expect(byStatus('not_fundable')).toHaveLength(1);
    expect(run.data.completeness).toBe('partial_draft');

    // Refused outright until somebody says, in writing, that this is intended.
    const blindPublish = await publishAllocations(ctx, { cycleId: cycle.id, runId: run.data.id });
    expect(blindPublish.ok).toBe(false);

    const published = await publishAllocations(ctx, {
      cycleId: cycle.id,
      runId: run.data.id,
      acknowledgeIncomplete: true,
      incompleteReason: 'Publishing the evaluated startups; the rest are being chased.',
    });
    expect(published.ok).toBe(true);

    const allocations = await ctx.repos.allocations.listForCycle(cycle.id);
    if (!allocations.ok) throw allocations.error;
    const allocated = new Set(allocations.data.map((row) => row.startupId));

    // Scored startups get a row — including any at 0h, which is a real decision.
    for (const startupId of byStatus('scored')) expect(allocated.has(startupId)).toBe(true);
    // The other four get nothing at all.
    for (const status of ['needs_information', 'awaiting_manual_scores', 'not_ready', 'not_fundable']) {
      for (const startupId of byStatus(status)) expect(allocated.has(startupId)).toBe(false);
    }

    // And they stay visible, by name and reason, rather than vanishing.
    const events = await ctx.repos.activity.listForCycle(cycle.id);
    expect(
      events.ok && events.data.filter((row) => row.action === 'startup_not_allocated'),
    ).toHaveLength(4);
  });

  it('treats an exact-score tie as equal and refuses to split it by accident', async () => {
    const store = createStore();
    const cycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const ctx = context(DEV_ACTORS.manager(), store);
    const run = await runPrioritization(ctx, { cycleId: cycle.id });
    if (!run.ok) throw run.error;

    const scored = run.data.outcomes.filter((row) => row.status === 'scored');
    const tied = scored.filter((row) => row.score === scored[0]?.score);
    expect(tied.length).toBeGreaterThan(1);
    // Equal scores, equal hours. Always.
    expect(new Set(tied.map((row) => row.proposedHours)).size).toBe(1);

    const split = await adjustPrioritization(ctx, {
      cycleId: cycle.id,
      runId: run.data.id,
      startupId: tied[0]!.startupId,
      proposedHours: 20,
      reason: 'Moving one of a tied pair without acknowledging the tie.',
    });
    expect(split.ok).toBe(false);
  });

  it('requires a warning reason to advance an allocation with unacknowledged grants', async () => {
    const store = createStore();
    const cycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const ctx = context(DEV_ACTORS.manager(), store);
    const run = await runPrioritization(ctx, { cycleId: cycle.id });
    if (!run.ok) throw run.error;
    const published = await publishAllocations(ctx, {
      cycleId: cycle.id,
      runId: run.data.id,
      acknowledgeIncomplete: true,
      incompleteReason: 'Chasing the outstanding rating and intent separately.',
    });
    if (!published.ok) throw published.error;
    const blocked = await advanceCycleStage(ctx, {
      cycleId: cycle.id,
      to: 'positions',
      warningOverrideReason: null,
    });
    expect(blocked.ok).toBe(false);
    const advanced = await advanceCycleStage(ctx, {
      cycleId: cycle.id,
      to: 'positions',
      warningOverrideReason: 'Reviewed with participating startups; proceeding manually.',
    });
    expect(advanced.ok && advanced.data.cycle.stage).toBe('positions');
    const events = await ctx.repos.activity.listForEntity(cycle.id, 'cycle', cycle.id);
    expect(events.ok && events.data.some((row) => row.action === 'stage_advanced' && row.reason)).toBe(true);
  });

  it('keeps read-only QSTP viewers from running prioritization', async () => {
    const store = createStore();
    const cycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const result = await runPrioritization(context(DEV_ACTORS.auditor(), store), { cycleId: cycle.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });

  it('moves a position through explicit review states and records history', async () => {
    const store = createStore();
    const submitted = store.positions.find((row) => row.status === 'submitted')!;
    const ctx = context(DEV_ACTORS.operations(), store);
    const reviewing = await transitionPosition(ctx, {
      cycleId: submitted.cycleId,
      positionId: submitted.id,
      to: 'under_review',
      reason: null,
    });
    expect(reviewing.ok && reviewing.data.status).toBe('under_review');
    const approved = await transitionPosition(ctx, {
      cycleId: submitted.cycleId,
      positionId: submitted.id,
      to: 'approved',
      reason: null,
    });
    expect(approved.ok && approved.data.reviewHistory.map((row) => row.status)).toEqual([
      'under_review',
      'approved',
    ]);
  });

  it('lets the candidate sign their own agreement and no one else sign it for them', async () => {
    const store = createStore();
    const placement = store.placements[0]!;
    const sign = (actor: UseCaseContext['actor'], kind: 'candidate_agreement' | 'startup_agreement') =>
      signPlacementAgreement(context(actor, store), {
        cycleId: placement.cycleId,
        placementId: placement.id,
        kind,
        signerName: 'Layla Ahmed',
        declarationAccepted: true,
        documentOpenedAt: '2026-08-01T08:55:00.000Z',
      });

    const signed = await sign(DEV_ACTORS.candidate(), 'candidate_agreement');
    expect(signed.ok && signed.data.kind).toBe('candidate_agreement');
    expect(signed.ok && signed.data.signerId).toBe(ids.candidateUser);

    // Nobody signs on the candidate's behalf, and the candidate does not sign
    // the startup's line. Both read as not_found rather than forbidden: the
    // placement is simply not theirs to act on in that capacity.
    for (const [actor, kind] of [
      [DEV_ACTORS.manager(), 'candidate_agreement'],
      [DEV_ACTORS.startupOwner(), 'candidate_agreement'],
      [DEV_ACTORS.candidate(), 'startup_agreement'],
    ] as const) {
      const refused = await sign(actor, kind);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.code).toBe('not_found');
    }
  });

  it('holds Ready to Start on the candidate signature alone', async () => {
    const store = createStore();
    const placement = store.placements[0]!;
    const ctx = context(DEV_ACTORS.manager(), store);
    for (const requirement of store.placementRequirements.filter((row) => row.status !== 'approved')) {
      await ctx.repos.requirements.decide({
        requirementId: requirement.id,
        decision: 'approved',
        reason: null,
        occurredAt: '2026-08-01T09:00:00.000Z',
      });
    }
    for (const party of ['startup', 'qstp'] as const) {
      await ctx.repos.placements.setReadiness({
        placementId: placement.id,
        party,
        actorId: ids.qstpOps,
        occurredAt: '2026-08-01T09:00:00.000Z',
      });
    }
    for (const [actor, kind] of [
      [DEV_ACTORS.manager(), 'qstp_agreement'],
      [DEV_ACTORS.startupOwner(), 'startup_agreement'],
    ] as const) {
      const done = await signPlacementAgreement(context(actor, store), {
        cycleId: placement.cycleId,
        placementId: placement.id,
        kind,
        signerName: 'Signer',
        declarationAccepted: true,
        documentOpenedAt: '2026-08-01T08:55:00.000Z',
      });
      if (!done.ok) throw done.error;
    }

    const blockedOn = async () => {
      const view = await getCycleWorkspace(ctx, { cycleId: placement.cycleId });
      if (!view.ok) throw view.error;
      return view.data.placementReadiness.find((row) => row.placementId === placement.id)?.blockers ?? [];
    };
    expect(await blockedOn()).toEqual(['Candidate agreement is unsigned.']);

    const candidateSigned = await signPlacementAgreement(context(DEV_ACTORS.candidate(), store), {
      cycleId: placement.cycleId,
      placementId: placement.id,
      kind: 'candidate_agreement',
      signerName: 'Layla Ahmed',
      declarationAccepted: true,
      documentOpenedAt: '2026-08-01T08:55:00.000Z',
    });
    if (!candidateSigned.ok) throw candidateSigned.error;
    expect(await blockedOn()).toEqual([]);
  });
});
