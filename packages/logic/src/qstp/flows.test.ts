import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { DEV_ACTORS, createFixtureRepositories, createStore, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { UseCaseContext } from '../context';
import { getQstpDashboard } from './dashboard';
import { decideException, grantHours, reclaimHours, resolveConflict } from './decisions';
import { getRedistributionPlan, listConflicts } from './views';

/**
 * The three flows the demo walks through, end to end.
 *
 * These run the real use-cases against the fixture adapter, which is exactly
 * what the browser does — so if a button works here it works there, and if
 * someone breaks the redistribution rule the test says so rather than a
 * stakeholder discovering it mid-demo.
 */

// Two days after the selection deadline, matching the fixture set.
const NOW = '2026-03-16T09:00:00.000Z';

function contextFor(actor: UseCaseContext['actor'], store = createStore()): UseCaseContext {
  return {
    actor,
    repos: createFixtureRepositories(store),
    logger: silentLogger,
    clock: fixedClock(NOW),
  };
}

describe('QSTP demo flows', () => {
  describe('conflict resolution', () => {
    it('awards a contested candidate and releases the losing claim', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);

      const before = await listConflicts(ctx, {});
      expect(before.ok && before.data).toHaveLength(1);
      expect(before.ok && before.data[0]?.candidate.fullName).toBe('Omar Khalid');
      // Acme claimed first, so the clock gives them the candidate.
      expect(before.ok && before.data[0]?.claims.find((c) => c.isWinner)?.startup?.name).toBe(
        'Acme Robotics',
      );

      // QSTP overrules in Northwind's favour.
      const resolved = await resolveConflict(ctx, {
        candidateId: ids.canOmar,
        awardTo: ids.northwind,
        reason: 'Candidate confirmed by phone they had withdrawn from Acme.',
      });
      expect(resolved.ok).toBe(true);

      const after = await listConflicts(ctx, {});
      expect(after.ok && after.data).toHaveLength(0);
    });

    it('refuses to award to a startup with no claim', async () => {
      const ctx = contextFor(DEV_ACTORS.manager());
      const result = await resolveConflict(ctx, {
        candidateId: ids.canOmar,
        awardTo: ids.pearl,
        reason: 'Trying it on.',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('not_found');
    });

    it('is refused for a startup actor entirely', async () => {
      const ctx = contextFor(DEV_ACTORS.startupOwner());
      const result = await resolveConflict(ctx, {
        candidateId: ids.canOmar,
        awardTo: ids.acme,
        reason: 'Give them to me.',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });
  });

  describe('exception approval protects hours', () => {
    it('removes a startup from the reclaim list once its exception is approved', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);

      const before = await getRedistributionPlan(ctx, {});
      expect(before.ok).toBe(true);
      if (!before.ok) return;

      // Northwind is not reclaimable to begin with — it did select candidates.
      // Qatar Fintech Labs is, because its exception was rejected.
      const names = before.data.reclaimable.map((r) => r.startup.name);
      expect(names).toContain('Qatar Fintech Labs');
      const total = before.data.totalReclaimable;

      // Approve Qatar Fintech Labs an extension after the fact.
      const fintechException = store.exceptions.find((e) => e.startupId === ids.fintech);
      expect(fintechException).toBeDefined();

      const decided = await decideException(ctx, {
        exceptionId: fintechException?.id,
        decision: 'approved',
        grantedDeadline: '2026-03-25T23:59:00.000Z',
        decisionNote: 'Accepted on appeal.',
      });
      expect(decided.ok).toBe(true);

      const after = await getRedistributionPlan(ctx, {});
      expect(after.ok).toBe(true);
      if (!after.ok) return;

      // Their hours are now protected, so both the list and the total shrink.
      expect(after.data.reclaimable.map((r) => r.startup.name)).not.toContain('Qatar Fintech Labs');
      expect(after.data.totalReclaimable).toBeLessThan(total);
    });

    it('will not approve an exception without a new deadline', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);
      const pending = store.exceptions.find((e) => e.status === 'pending');

      const result = await decideException(ctx, {
        exceptionId: pending?.id,
        decision: 'approved',
        grantedDeadline: null,
        decisionNote: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('validation');
    });
  });

  describe('reclaiming hours', () => {
    it('returns the hours to the cycle budget', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);

      const before = await getQstpDashboard(ctx, {});
      expect(before.ok && before.data.budget.allocated).toBe(190);

      const result = await reclaimHours(ctx, { startupId: ids.fintech, exceptionId: null });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.reclaimed).toBe(40);

      const after = await getQstpDashboard(ctx, {});
      expect(after.ok && after.data.budget.allocated).toBe(150);
      expect(after.ok && after.data.budget.unallocated).toBe(350);
    });

    it('refuses when the startup holds an approved exception', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);

      const fintechException = store.exceptions.find((e) => e.startupId === ids.fintech);
      await decideException(ctx, {
        exceptionId: fintechException?.id,
        decision: 'approved',
        grantedDeadline: '2026-03-25T23:59:00.000Z',
        decisionNote: null,
      });

      // The rule is re-checked at the point of reclaim, not trusted from the
      // screen the click came from.
      const result = await reclaimHours(ctx, { startupId: ids.fintech, exceptionId: null });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
    });

    it('is refused for operations staff — budget reshaping is manager-only', async () => {
      const ctx = contextFor(DEV_ACTORS.operations());
      const result = await reclaimHours(ctx, { startupId: ids.fintech, exceptionId: null });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });
  });

  describe('granting reclaimed hours', () => {
    it('completes the round trip: reclaim from one startup, grant to another', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);

      // Lusail is on zero hours, waiting for a redistribution round.
      const reclaimed = await reclaimHours(ctx, { startupId: ids.fintech, exceptionId: null });
      expect(reclaimed.ok && reclaimed.data.reclaimed).toBe(40);

      const granted = await grantHours(ctx, {
        startupId: ids.lusail,
        weeklyHours: 20,
        justification: 'Recovered hours, next by score.',
      });
      expect(granted.ok).toBe(true);
      if (granted.ok) {
        expect(granted.data.weeklyHours).toBe(20);
        // Recorded as a redistribution grant, so the record explains itself.
        expect(granted.data.fromRedistribution).toBe(true);
      }

      // 190 - 40 reclaimed + 20 granted = 170.
      const after = await getQstpDashboard(ctx, {});
      expect(after.ok && after.data.budget.allocated).toBe(170);
    });

    it('refuses a grant that would exceed the funded total', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);

      // Squeeze the cycle so only 10 hours remain unallocated.
      const cycle = store.cycles[0];
      if (!cycle) throw new Error('fixture has no cycle');
      store.cycles[0] = { ...cycle, fundedWeeklyHours: 200 };

      const result = await grantHours(ctx, { startupId: ids.lusail, weeklyHours: 60, justification: null });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation');
        // The message says how much room there actually is.
        expect(result.error.message).toContain('10');
      }
    });

    it('is refused for operations staff', async () => {
      const ctx = contextFor(DEV_ACTORS.operations());
      const result = await grantHours(ctx, {
        startupId: ids.lusail,
        weeklyHours: 20,
        justification: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });
  });

  describe('the dashboard reflects every decision', () => {
    it('drops the conflict item once the conflict is resolved', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);

      const before = await getQstpDashboard(ctx, {});
      expect(before.ok && before.data.attention.some((a) => a.kind === 'candidate_conflict')).toBe(
        true,
      );

      await resolveConflict(ctx, {
        candidateId: ids.canOmar,
        awardTo: ids.acme,
        reason: 'Acme claimed first and the candidate confirmed.',
      });

      const after = await getQstpDashboard(ctx, {});
      expect(after.ok && after.data.attention.some((a) => a.kind === 'candidate_conflict')).toBe(
        false,
      );
    });
  });
});
