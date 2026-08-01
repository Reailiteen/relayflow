import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { createFixtureRepositories, createStore, DEV_ACTORS, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { UseCaseContext } from '../context';
import {
  advanceCycleStage,
  getCycleWorkspace,
  publishAllocations,
  runPrioritization,
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
    expect(second.ok && second.data.participation).toHaveLength(3);
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
    const published = await publishAllocations(ctx, { cycleId: cycle.id, runId: run.data.id });
    expect(published.ok && published.data.status).toBe('confirmed');
    const allocations = await ctx.repos.allocations.listForCycle(cycle.id);
    expect(allocations.ok && allocations.data.reduce((sum, row) => sum + row.weeklyHours, 0)).toBeLessThanOrEqual(cycle.fundedWeeklyHours);
  });

  it('requires a warning reason to advance an allocation with unacknowledged grants', async () => {
    const store = createStore();
    const cycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const ctx = context(DEV_ACTORS.manager(), store);
    const run = await runPrioritization(ctx, { cycleId: cycle.id });
    if (!run.ok) throw run.error;
    const published = await publishAllocations(ctx, { cycleId: cycle.id, runId: run.data.id });
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
});
