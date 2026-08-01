import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { DEV_ACTORS, createFixtureRepositories, createStore, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { UseCaseContext } from '../context';
import { listStartupSummaries } from '../qstp/operations';
import { getStartupPools } from '../startup/views';
import { moveCandidateCard, moveStartupCard } from './moves';

/**
 * The boards, driven the way the browser drives them.
 *
 * The point of these is that a drag is not a separate code path. Moving a card
 * to "Selected" reserves the candidate through the same use-case the Select
 * button calls, and is refused for the same reasons; moving a startup to
 * "Candidate pool sent" shares a pool through the same use-case the Candidates
 * screen uses. If a rule can be dodged by dragging, one of these fails.
 */

const NOW = '2026-03-16T09:00:00.000Z';

function contextFor(actor: UseCaseContext['actor'], store = createStore()): UseCaseContext {
  return {
    actor,
    repos: createFixtureRepositories(store),
    logger: silentLogger,
    clock: fixedClock(NOW),
  };
}

const stageOf = async (ctx: UseCaseContext, startupId: string) => {
  const result = await listStartupSummaries(ctx, {});
  if (!result.ok) throw new Error(result.error.message);
  return result.data.find((row) => row.startup.id === startupId)?.stage;
};

describe('QSTP startup-cycle board', () => {
  it('derives each startup’s column from what has actually happened', async () => {
    const ctx = contextFor(DEV_ACTORS.manager());

    // Acme has a confirmed intern with paperwork outstanding.
    expect(await stageOf(ctx, ids.acme)).toBe('onboarding');
    // Msheireb has approved roles and no pool.
    expect(await stageOf(ctx, ids.msheireb)).toBe('positions_pending');
    // Desert Bloom holds hours and has submitted nothing.
    expect(await stageOf(ctx, ids.agritech)).toBe('allocated');
  });

  it('sends a pool when the startup has approved positions, and records it', async () => {
    const store = createStore();
    const ctx = contextFor(DEV_ACTORS.manager(), store);

    const before = store.poolEntries.length;
    const moved = await moveStartupCard(ctx, {
      startupId: ids.msheireb,
      from: 'positions_pending',
      to: 'pool_sent',
    });

    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.data.shared).toBeGreaterThan(0);
    expect(store.poolEntries.length).toBeGreaterThan(before);

    // The card moves because the data moved, not because we told it to.
    expect(await stageOf(ctx, ids.msheireb)).toBe('pool_sent');
  });

  it('never puts a claimed or unavailable candidate into a new pool', async () => {
    const store = createStore();
    const ctx = contextFor(DEV_ACTORS.manager(), store);

    await moveStartupCard(ctx, {
      startupId: ids.msheireb,
      from: 'positions_pending',
      to: 'pool_sent',
    });

    const added = store.poolEntries.filter((entry) => entry.positionId === ids.posDataEng);
    expect(added.length).toBeGreaterThan(0);

    // Omar is reserved by Acme, and would be a wasted interview.
    expect(added.some((entry) => entry.candidateId === ids.canOmar)).toBe(false);
    // Yusuf took another job.
    expect(added.some((entry) => entry.candidateId === ids.canYusuf)).toBe(false);
  });

  it('refuses to send a pool to a startup that has submitted no positions', async () => {
    const ctx = contextFor(DEV_ACTORS.manager());
    const result = await moveStartupCard(ctx, {
      startupId: ids.agritech,
      from: 'allocated',
      to: 'pool_sent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });

  it('refuses a move whose starting column is already stale', async () => {
    const ctx = contextFor(DEV_ACTORS.manager());
    const result = await moveStartupCard(ctx, {
      // Acme is in onboarding, not positions_pending.
      startupId: ids.acme,
      from: 'positions_pending',
      to: 'pool_sent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('conflict');
      expect(result.error.message).toMatch(/moved since this board was loaded/i);
    }
  });

  it('does not let a viewer move anything', async () => {
    const ctx = contextFor(DEV_ACTORS.auditor());
    const result = await moveStartupCard(ctx, {
      startupId: ids.msheireb,
      from: 'positions_pending',
      to: 'pool_sent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });
});

describe('startup candidate board', () => {
  /** The pool entry for one candidate on one of the startup's positions. */
  const entryFor = async (ctx: UseCaseContext, candidateId: string) => {
    const pools = await getStartupPools(ctx, {});
    if (!pools.ok) throw new Error(pools.error.message);
    return pools.data.pools
      .flatMap((pool) => pool.candidates)
      .find((row) => row.candidate.id === candidateId)?.entry;
  };

  it('moves a candidate through review without touching any reservation', async () => {
    const store = createStore();
    const ctx = contextFor(DEV_ACTORS.startupOwner(), store);

    const entry = await entryFor(ctx, ids.canHassan);
    expect(entry?.status).toBe('pending');

    const moved = await moveCandidateCard(ctx, {
      poolEntryId: entry!.id,
      to: 'shortlisted',
    });

    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.data.status).toBe('shortlisted');
    // Bookkeeping only: nobody has been claimed.
    expect(store.selections.some((s) => s.candidateId === ids.canHassan)).toBe(false);
  });

  it('actually reserves the candidate when the card reaches Selected', async () => {
    const store = createStore();
    const ctx = contextFor(DEV_ACTORS.startupOwner(), store);

    const entry = await entryFor(ctx, ids.canHassan);
    const moved = await moveCandidateCard(ctx, { poolEntryId: entry!.id, to: 'selected' });

    expect(moved.ok).toBe(true);

    // The drag went through the real reservation, not a status write.
    const claim = store.selections.find((s) => s.candidateId === ids.canHassan);
    expect(claim).toBeDefined();
    expect(claim?.status).toBe('reserved');
    expect(claim?.startupId).toBe(ids.acme);
  });

  it('refuses Selected for a candidate another startup already holds', async () => {
    const ctx = contextFor(DEV_ACTORS.startupOwner());

    // Northwind also holds Omar, so Acme cannot take him from the board.
    const entry = await entryFor(ctx, ids.canOmar);
    const result = await moveCandidateCard(ctx, { poolEntryId: entry!.id, to: 'selected' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/first-come-first-served/i);
  });

  it('refuses to mark a candidate interviewed when no interview exists', async () => {
    const ctx = contextFor(DEV_ACTORS.startupOwner());

    const entry = await entryFor(ctx, ids.canHassan);
    const result = await moveCandidateCard(ctx, { poolEntryId: entry!.id, to: 'interviewed' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/request an interview/i);
  });

  it('does not let a supervisor commit the startup to a hire', async () => {
    const ctx = contextFor(DEV_ACTORS.supervisor());

    const entry = await entryFor(ctx, ids.canHassan);
    const result = await moveCandidateCard(ctx, { poolEntryId: entry!.id, to: 'selected' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });

  it('does not let a startup move a card in another startup’s pool', async () => {
    const acme = contextFor(DEV_ACTORS.startupOwner());
    const entry = await entryFor(acme, ids.canHassan);

    // Northwind's owner, reaching for an entry in Acme's pool.
    const result = await moveCandidateCard(contextFor(DEV_ACTORS.lateStartup()), {
      poolEntryId: entry!.id,
      to: 'rejected',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });
});
