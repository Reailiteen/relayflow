import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { createFixtureRepositories, createStore, DEV_ACTORS, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import { RATING_KEYS } from '@relayflow/entities';
import type { UseCaseContext } from '../context';
import { draftStartupRating, submitStartupRating } from './rate-startup';
import { submitPositionIntent } from './submit-position-intent';
import { publishAllocations, runPrioritization } from '../operations/core-system';

function context(actor: UseCaseContext['actor'], store = createStore()): UseCaseContext {
  return {
    actor,
    repos: createFixtureRepositories(store),
    logger: silentLogger,
    clock: fixedClock('2026-07-10T09:00:00.000Z'),
  };
}

/** A complete, rated-and-reasoned set of six. */
const fullItems = (value = 3) =>
  RATING_KEYS.map((dimension) => ({
    dimension,
    value,
    rationale: `Anchored at ${value} against the rubric.`,
    citations: [],
  }));

const allocationCycle = (store: ReturnType<typeof createStore>) =>
  store.cycles.find((row) => row.id !== ids.cycle)!;

describe('rating a startup', () => {
  it('refuses a partial submission', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const result = await submitStartupRating(context(DEV_ACTORS.operations(), store), {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: fullItems().slice(0, 5),
      revisionReason: null,
    });
    // Five of six would score this startup lower than its peers for reasons
    // that have nothing to do with the startup.
    expect(result.ok).toBe(false);
  });

  it('refuses a rating with no reason', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const result = await submitStartupRating(context(DEV_ACTORS.operations(), store), {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: RATING_KEYS.map((dimension) => ({
        dimension,
        value: 3,
        rationale: '   ',
        citations: [],
      })),
      revisionReason: null,
    });
    expect(result.ok).toBe(false);
  });

  it('keeps a draft partial and says what is still missing', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const result = await draftStartupRating(context(DEV_ACTORS.operations(), store), {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: fullItems().slice(0, 2),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.missing).toHaveLength(RATING_KEYS.length - 2);
  });

  it('supersedes rather than overwrites, and demands a reason to do it', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const ctx = context(DEV_ACTORS.operations(), store);

    const first = await submitStartupRating(ctx, {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: fullItems(2),
      revisionReason: null,
    });
    expect(first.ok).toBe(true);

    const silentChange = await submitStartupRating(ctx, {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: fullItems(4),
      revisionReason: null,
    });
    expect(silentChange.ok).toBe(false);

    const explained = await submitStartupRating(ctx, {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: fullItems(4),
      revisionReason: 'Q3 numbers arrived after the first pass.',
    });
    expect(explained.ok).toBe(true);
    if (!explained.ok || !first.ok) return;

    // The original is kept — it may already have informed a decision.
    const prior = store.startupRatings.find((row) => row.id === first.data.id);
    expect(prior?.status).toBe('superseded');
    expect(explained.data.supersedesId).toBe(first.data.id);
  });

  it('refuses to re-rate once allocations are published', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const ctx = context(DEV_ACTORS.manager(), store);

    const run = await runPrioritization(ctx, { cycleId: cycle.id });
    if (!run.ok) throw run.error;
    const published = await publishAllocations(ctx, {
      cycleId: cycle.id,
      runId: run.data.id,
      acknowledgeIncomplete: true,
      incompleteReason: 'Publishing the evaluated startups.',
    });
    expect(published.ok).toBe(true);

    // Editing an input underneath a published decision would leave it
    // unexplainable. The way to change your mind is a fresh run.
    const late = await submitStartupRating(ctx, {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: fullItems(4),
      revisionReason: 'Changed my mind.',
    });
    expect(late.ok).toBe(false);
  });

  it('does not let a read-only auditor rate', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const result = await submitStartupRating(context(DEV_ACTORS.auditor(), store), {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: fullItems(),
      revisionReason: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });
});

describe('declaring readiness', () => {
  const readyIntent = {
    title: 'Platform Engineering Intern',
    category: 'software_engineering',
    expectedDeliverable: 'A deployed service with tests and a runbook.',
    learningOutcomes: ['Ship a reviewed change', 'Write an on-call runbook'],
    workMode: 'hybrid' as const,
    supervisorName: 'Karim Nasser',
    weeklySupervisionMinutes: 60,
    maximumInterns: 1,
    resourcesReady: true,
    onboardingReady: true,
  };

  it('accepts a ready role and reports it as feasible', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const result = await submitPositionIntent(context(DEV_ACTORS.startupOwner(), store), {
      cycleId: cycle.id,
      startupId: ids.acme,
      ...readyIntent,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.feasible).toBe(true);
    expect(result.data.unmetChecks).toEqual([]);
  });

  /**
   * The important half. An unready answer is still recorded — QSTP needs to see
   * it — but the startup is told which checks failed while they can still act.
   */
  it('accepts an unready role and names what is missing', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const result = await submitPositionIntent(context(DEV_ACTORS.startupOwner(), store), {
      cycleId: cycle.id,
      startupId: ids.acme,
      ...readyIntent,
      // Supervision in name only, and nobody free to onboard them.
      weeklySupervisionMinutes: 10,
      onboardingReady: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.feasible).toBe(false);
    expect(result.data.unmetChecks).toContain('supervisionCommitment');
    expect(result.data.unmetChecks).toContain('onboardingReady');
  });

  it('rejects placeholder prose as a deliverable', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const result = await submitPositionIntent(context(DEV_ACTORS.startupOwner(), store), {
      cycleId: cycle.id,
      startupId: ids.acme,
      ...readyIntent,
      expectedDeliverable: 'A deliverable has not yet been defined.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.unmetChecks).toContain('expectedDeliverable');
  });

  it('closes once the cycle has moved past allocation', async () => {
    const store = createStore();
    // The Spring cycle is at `completion`; readiness is long settled there.
    const result = await submitPositionIntent(context(DEV_ACTORS.startupOwner(), store), {
      cycleId: ids.cycle,
      startupId: ids.acme,
      ...readyIntent,
    });
    expect(result.ok).toBe(false);
  });

  it('does not let a startup declare readiness for someone else', async () => {
    const store = createStore();
    const cycle = allocationCycle(store);
    const result = await submitPositionIntent(context(DEV_ACTORS.startupOwner(), store), {
      cycleId: cycle.id,
      startupId: ids.northwind,
      ...readyIntent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });
});
