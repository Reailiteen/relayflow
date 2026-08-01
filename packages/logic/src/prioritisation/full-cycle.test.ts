import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { createFixtureRepositories, createStore, DEV_ACTORS, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import { RATING_KEYS } from '@relayflow/entities';
import type { UseCaseContext } from '../context';
import { submitStartupRating } from './rate-startup';
import { submitPositionIntent } from './submit-position-intent';
import {
  acknowledgeAllocation,
  advanceCycleStage,
  confirmPlacement,
  publishAllocations,
  runPrioritization,
  savePosition,
  transitionPosition,
} from '../operations/core-system';
import { sharePool } from '../qstp/operations';
import { selectCandidate } from '../selection/select-candidate';
import { respondToSelection } from '../selection/accept-offer';

/**
 * One cycle, driven from evaluation to a confirmed placement.
 *
 * Every other test here checks a rule in isolation. This one checks that the
 * rules compose — that a cycle somebody starts themselves can actually be
 * finished, rather than reaching a stage whose prerequisites nobody seeded.
 *
 * It is deliberately written as the sequence a person would click, including
 * the steps that are easy to forget exist: a startup must acknowledge its
 * allocation before it can write a role, and a position needs two transitions
 * to reach `approved`.
 */
describe('a cycle from evaluation to placement', () => {
  it('completes every stage', async () => {
    const store = createStore();
    const cycle = store.cycles.find((row) => row.id !== ids.cycle)!;
    const repos = createFixtureRepositories(store);
    const as = (actor: UseCaseContext['actor']): UseCaseContext => ({
      actor,
      repos,
      logger: silentLogger,
      clock: fixedClock('2026-07-10T09:00:00.000Z'),
    });
    const qstp = as(DEV_ACTORS.manager());
    const owner = as(DEV_ACTORS.startupOwner());

    expect(cycle.stage).toBe('allocation');

    // ── Stage 1–2: evaluate, then allocate ────────────────────────────────
    const intent = await submitPositionIntent(owner, {
      cycleId: cycle.id,
      startupId: ids.acme,
      title: 'Platform Intern',
      category: 'software_engineering',
      expectedDeliverable: 'A deployed service with tests and a runbook.',
      learningOutcomes: ['Ship a reviewed change'],
      workMode: 'hybrid',
      supervisorName: 'Karim Nasser',
      weeklySupervisionMinutes: 60,
      maximumInterns: 1,
      resourcesReady: true,
      onboardingReady: true,
    });
    expect(intent.ok).toBe(true);

    const rating = await submitStartupRating(qstp, {
      cycleId: cycle.id,
      startupId: ids.msheireb,
      items: RATING_KEYS.map((dimension) => ({
        dimension,
        value: 3,
        rationale: 'Anchored at 3 against the rubric.',
        citations: [],
      })),
      revisionReason: null,
    });
    expect(rating.ok).toBe(true);

    const run = await runPrioritization(qstp, { cycleId: cycle.id });
    if (!run.ok) throw run.error;
    expect(run.data.outcomes.length).toBeGreaterThan(0);

    const published = await publishAllocations(qstp, {
      cycleId: cycle.id,
      runId: run.data.id,
      acknowledgeIncomplete: true,
      incompleteReason: 'Publishing the evaluated startups; chasing the rest.',
    });
    expect(published.ok).toBe(true);

    // ── Stage 3: role requests ────────────────────────────────────────────
    // Easy to miss, and the reason the positions form refuses otherwise: hours
    // have to be accepted before they can be spent.
    const acknowledged = await acknowledgeAllocation(owner, { cycleId: cycle.id });
    expect(acknowledged.ok).toBe(true);

    const toPositions = await advanceCycleStage(qstp, {
      cycleId: cycle.id,
      to: 'positions',
      warningOverrideReason: 'Walkthrough.',
    });
    expect(toPositions.ok).toBe(true);

    const position = await savePosition(owner, {
      cycleId: cycle.id,
      title: 'Platform Intern',
      description: 'Build and ship a reviewed service.',
      requiredSkills: ['TypeScript'],
      workArrangement: 'hybrid',
      additionalRequirements: null,
      internCount: 1,
      hoursPerIntern: 20,
      durationWeeks: 12,
      supervisorName: 'Karim Nasser',
      action: 'submit',
    });
    if (!position.ok) throw position.error;
    const positionId = position.data.id;

    for (const to of ['under_review', 'approved'] as const) {
      const moved = await transitionPosition(qstp, { cycleId: cycle.id, positionId, to, note: null });
      expect(moved.ok).toBe(true);
    }

    // ── Stage 4: shortlist and selection ──────────────────────────────────
    const toSelection = await advanceCycleStage(qstp, {
      cycleId: cycle.id,
      to: 'selection',
      warningOverrideReason: 'Walkthrough.',
    });
    expect(toSelection.ok).toBe(true);

    const available = store.candidates.filter(
      (row) => row.cycleId === cycle.id && row.availability === 'available',
    );
    // Without a pool of its own, a cycle you started yourself dead-ends here.
    expect(available.length).toBeGreaterThan(0);

    const shared = await sharePool(qstp, {
      cycleId: cycle.id,
      positionId,
      candidateIds: available.slice(0, 3).map((row) => row.id),
    });
    expect(shared.ok).toBe(true);

    const chosen = available[0]!;
    const selection = await selectCandidate(owner, {
      cycleId: cycle.id,
      positionId,
      candidateId: chosen.id,
    });
    if (!selection.ok) throw selection.error;
    const selectionId = store.selections.find((row) => row.candidateId === chosen.id)!.id;

    // ── Stage 5: confirmation and onboarding ──────────────────────────────
    const candidateCtx = as({
      kind: 'candidate',
      userId: chosen.id,
      email: chosen.email,
      fullName: chosen.fullName,
      candidateId: chosen.id,
    } as unknown as UseCaseContext['actor']);

    const accepted = await respondToSelection(candidateCtx, {
      cycleId: cycle.id,
      selectionId,
      decision: 'accepted',
    });
    expect(accepted.ok).toBe(true);

    const placement = await confirmPlacement(qstp, {
      cycleId: cycle.id,
      selectionId,
      startsOn: '2026-10-01',
      endsOn: '2026-12-15',
      supervisorName: 'Karim Nasser',
    });
    expect(placement.ok).toBe(true);

    // The end state that matters: a real person, in a real role, against hours
    // the engine proposed and a person confirmed.
    const placed = store.placements.find((row) => row.candidateId === chosen.id);
    expect(placed?.positionId).toBe(positionId);
    expect(placed?.startupId).toBe(ids.acme);
  });
});
