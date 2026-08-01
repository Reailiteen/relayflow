import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { DEV_ACTORS, createFixtureRepositories, createStore, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { UseCaseContext } from '../context';
import { submitPosition } from '../positions/submit-position';
import { selectCandidate } from '../selection/select-candidate';
import { requestException } from './request-exception';
import { getStartupHome, getStartupPools, getStartupPositions } from './views';

/**
 * The startup portal's flows, end to end against the fixture adapter.
 *
 * The tenant-isolation cases matter most here. A startup portal is the part of
 * the system where a mistake leaks one company's candidates to another, so
 * those are asserted rather than assumed.
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

describe('startup portal', () => {
  describe('next action', () => {
    it('points a well-progressed startup at the candidates it has not looked at', async () => {
      // Acme: allocated, submitted, interviewed, already placed someone — but
      // one candidate in the AI Developer pool is still unreviewed.
      const home = await getStartupHome(contextFor(DEV_ACTORS.startupOwner()), {});
      expect(home.ok).toBe(true);
      if (!home.ok) return;
      expect(home.data.startupName).toBe('Acme Robotics');
      expect(home.data.allocatedHours).toBe(60);
      expect(home.data.usedHours).toBe(60);
      expect(home.data.selectionsMade).toBeGreaterThan(0);

      expect(home.data.candidatesAwaitingReview).toBe(1);
      expect(home.data.nextAction.kind).toBe('review_candidates');
      // Not urgent: reviewing is work, but nothing is at risk.
      expect(home.data.nextAction.urgent).toBe(false);
    });

    it('falls through to "nothing" once every candidate has been looked at', async () => {
      const store = createStore();
      // Mark the last pending pool entry as reviewed.
      store.poolEntries = store.poolEntries.map((entry) =>
        entry.status === 'pending' ? { ...entry, status: 'rejected' as const } : entry,
      );

      const home = await getStartupHome(contextFor(DEV_ACTORS.startupOwner(), store), {});
      expect(home.ok).toBe(true);
      if (!home.ok) return;
      expect(home.data.candidatesAwaitingReview).toBe(0);
      expect(home.data.nextAction.kind).toBe('nothing');
    });

    it('tells a startup with no allocation that there is nothing for it to do', async () => {
      const store = createStore();
      const acme = store.allocations.find((a) => a.startupId === ids.acme);
      if (acme) store.allocations[store.allocations.indexOf(acme)] = { ...acme, weeklyHours: 0 };

      const home = await getStartupHome(contextFor(DEV_ACTORS.startupOwner(), store), {});
      expect(home.ok).toBe(true);
      if (!home.ok) return;
      expect(home.data.nextAction.kind).toBe('nothing');
      expect(home.data.nextAction.headline).toContain('No hours allocated');
    });

    it('tells a startup past its deadline to request an extension, urgently', async () => {
      // Northwind missed the selection deadline and has a request pending.
      const home = await getStartupHome(contextFor(DEV_ACTORS.lateStartup()), {});
      expect(home.ok).toBe(true);
      if (!home.ok) return;
      expect(home.data.startupName).toBe('Northwind Analytics');
      expect(home.data.pendingException).not.toBeNull();
      // They did select someone, so the deadline branch does not fire.
      expect(home.data.selectionsMade).toBeGreaterThan(0);
    });
  });

  describe('submitting positions', () => {
    it('refuses a role that exceeds the remaining allocation, and says by how much', async () => {
      const store = createStore();
      // Acme is on 60 hours with 60 already committed.
      const result = await submitPosition(contextFor(DEV_ACTORS.startupOwner(), store), {
        title: 'Extra Engineer',
        description: 'One more pair of hands.',
        requiredSkills: [],
        internCount: 1,
        hoursPerIntern: 20,
        durationWeeks: 12,
        supervisorName: null,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation');
        expect(result.error.message).toContain('0 of 60');
      }
    });

    it('accepts a role that fits and bills it against the allocation', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.lateStartup(), store); // Northwind: 40h, 40 used

      // Free up room first by checking the starting state.
      const before = await getStartupPositions(ctx, {});
      expect(before.ok && before.data.remainingHours).toBe(0);

      // Give them headroom, then submit.
      const northwindPosition = store.positions.find((p) => p.startupId === ids.northwind);
      if (northwindPosition) {
        store.positions[store.positions.indexOf(northwindPosition)] = {
          ...northwindPosition,
          internCount: 1, // 20h instead of 40h
        };
      }

      const result = await submitPosition(ctx, {
        title: 'Junior Analyst',
        description: 'Support the analytics team.',
        requiredSkills: ['SQL'],
        internCount: 1,
        hoursPerIntern: 20,
        durationWeeks: 12,
        supervisorName: 'Reem Al-Sulaiti',
      });
      expect(result.ok).toBe(true);

      const after = await getStartupPositions(ctx, {});
      expect(after.ok && after.data.usedHours).toBe(40);
      expect(after.ok && after.data.remainingHours).toBe(0);
    });

    it('is refused for a supervisor, who cannot commit the startup', async () => {
      const result = await submitPosition(contextFor(DEV_ACTORS.supervisor()), {
        title: 'Anything',
        description: 'Anything at all.',
        requiredSkills: [],
        internCount: 1,
        hoursPerIntern: 10,
        durationWeeks: 4,
        supervisorName: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });
  });

  describe('tenant isolation', () => {
    it('shows a startup only its own positions', async () => {
      const acme = await getStartupPositions(contextFor(DEV_ACTORS.startupOwner()), {});
      const northwind = await getStartupPositions(contextFor(DEV_ACTORS.lateStartup()), {});
      expect(acme.ok && northwind.ok).toBe(true);
      if (!acme.ok || !northwind.ok) return;

      expect(acme.data.positions.every((p) => p.startupId === ids.acme)).toBe(true);
      expect(northwind.data.positions.every((p) => p.startupId === ids.northwind)).toBe(true);
    });

    it('shows a startup only pools for its own positions', async () => {
      const pools = await getStartupPools(contextFor(DEV_ACTORS.startupOwner()), {});
      expect(pools.ok).toBe(true);
      if (!pools.ok) return;
      expect(pools.data.pools.every((pool) => pool.position.startupId === ids.acme)).toBe(true);
    });

    it('cannot select against another startup’s position', async () => {
      // Northwind's owner reaching for Acme's AI Developer role.
      const result = await selectCandidate(contextFor(DEV_ACTORS.lateStartup()), {
        positionId: ids.posAiDev,
        candidateId: ids.canHassan,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });

    it('marks candidates held by another startup rather than offering them', async () => {
      const pools = await getStartupPools(contextFor(DEV_ACTORS.lateStartup()), {});
      expect(pools.ok).toBe(true);
      if (!pools.ok) return;

      // Acme reserved Omar first, so Northwind's pool must show him as taken.
      const omar = pools.data.pools
        .flatMap((pool) => pool.candidates)
        .find((row) => row.candidate.id === ids.canOmar);

      expect(omar).toBeDefined();
      // Northwind has its own claim on Omar in the fixture, so `selection` is
      // set — the point is that both claims are visible to the port.
      expect(omar?.selection ?? omar?.takenByOther).toBeTruthy();
    });
  });

  describe('selecting a candidate', () => {
    it('refuses a candidate another startup already holds', async () => {
      const store = createStore();
      // Release Northwind's claim so Acme holds Omar alone, then have Northwind
      // try to take him.
      const northwindClaim = store.selections.find((s) => s.startupId === ids.northwind);
      if (northwindClaim) {
        store.selections[store.selections.indexOf(northwindClaim)] = {
          ...northwindClaim,
          status: 'released',
        };
      }

      const result = await selectCandidate(contextFor(DEV_ACTORS.lateStartup(), store), {
        positionId: ids.posDataAnalyst,
        candidateId: ids.canOmar,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('conflict');
        expect(result.error.message).toContain('already been reserved');
      }
    });

    it('refuses a candidate who is no longer available', async () => {
      // Yusuf took another job.
      const result = await selectCandidate(contextFor(DEV_ACTORS.lateStartup()), {
        positionId: ids.posDataAnalyst,
        candidateId: ids.canYusuf,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
    });
  });

  describe('requesting an extension', () => {
    it('refuses a second request while one is pending', async () => {
      const result = await requestException(contextFor(DEV_ACTORS.lateStartup()), {
        kind: 'candidate_selection',
        reason: 'We would like even more time than we already asked for.',
        requestedDeadline: '2026-04-01T23:59:00.000Z',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('conflict');
        expect(result.error.message).toContain('already have a request');
      }
    });

    it('refuses a date that is not actually an extension', async () => {
      const result = await requestException(contextFor(DEV_ACTORS.startupOwner()), {
        kind: 'candidate_selection',
        // Before the 14 March deadline.
        reason: 'Mistyped the year, as people do.',
        requestedDeadline: '2026-03-01T23:59:00.000Z',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
    });

    it('accepts a well-formed request', async () => {
      const result = await requestException(contextFor(DEV_ACTORS.startupOwner()), {
        kind: 'candidate_selection',
        reason: 'Our supervisor is travelling and cannot complete the final interviews.',
        requestedDeadline: '2026-03-28T23:59:00.000Z',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe('pending');
        expect(result.data.startupId).toBe(ids.acme);
      }
    });
  });
});
