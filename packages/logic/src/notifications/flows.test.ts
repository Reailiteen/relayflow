import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { ANONYMOUS } from '@relayflow/access';
import { DEV_ACTORS, createFixtureRepositories, createStore, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import { internalRoute } from '@relayflow/entities';
import type { UseCaseContext } from '../context';
import {
  getNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
} from './inbox';

/**
 * The inbox, from the three vantage points that share it.
 *
 * The rule these exist to hold is that a notification belongs to exactly one
 * person. Everything else here — filters, counts, idempotent reads — is
 * behaviour the interface depends on, but the isolation is the part that would
 * be a breach rather than a bug.
 */

const NOW = '2026-03-16T12:00:00.000Z';

function contextFor(actor: UseCaseContext['actor'], store = createStore()): UseCaseContext {
  return {
    actor,
    repos: createFixtureRepositories(store),
    logger: silentLogger,
    clock: fixedClock(NOW),
  };
}

describe('notification inbox', () => {
  it('shows each person only their own notifications', async () => {
    const manager = await getNotificationInbox(contextFor(DEV_ACTORS.manager()), {});
    const candidate = await getNotificationInbox(contextFor(DEV_ACTORS.candidate()), {});
    if (!manager.ok || !candidate.ok) throw new Error('inbox read failed');

    expect(manager.data.notifications.length).toBeGreaterThan(0);
    expect(candidate.data.notifications.length).toBeGreaterThan(0);

    for (const row of manager.data.notifications) {
      expect(row.recipientId).toBe(ids.qstpManager);
    }
    for (const row of candidate.data.notifications) {
      expect(row.recipientId).toBe(ids.candidateUser);
    }
  });

  it('refuses to say anything at all to someone signed out', async () => {
    const result = await getNotificationInbox(contextFor(ANONYMOUS), {});
    expect(result.ok).toBe(false);
  });

  it('orders newest first regardless of read state', async () => {
    const result = await getNotificationInbox(contextFor(DEV_ACTORS.operations()), {});
    if (!result.ok) throw new Error(result.error.message);

    const stamps = result.data.notifications.map((row) => row.createdAt);
    expect([...stamps].sort((a, b) => b.localeCompare(a))).toEqual(stamps);
    // Operations has both a read row and unread ones, so this is a real check
    // rather than a list that happens to be uniformly unread.
    expect(result.data.notifications.some((row) => row.readAt !== null)).toBe(true);
  });

  it('keeps the unread count whole when the list is filtered or truncated', async () => {
    const ctx = contextFor(DEV_ACTORS.operations());
    const all = await getNotificationInbox(ctx, {});
    const one = await getNotificationInbox(ctx, { filter: 'unread', limit: 1 });
    if (!all.ok || !one.ok) throw new Error('inbox read failed');

    expect(one.data.notifications).toHaveLength(1);
    expect(one.data.unread).toBe(all.data.unread);
    expect(all.data.unread).toBeGreaterThan(1);
  });

  it('marks one read, and marking it again does not move the timestamp', async () => {
    const store = createStore();
    const ctx = contextFor(DEV_ACTORS.candidate(), store);

    const before = await getNotificationInbox(ctx, { filter: 'unread' });
    if (!before.ok) throw new Error(before.error.message);
    const target = before.data.notifications[0]!;

    const first = await markNotificationRead(ctx, { notificationId: target.id });
    if (!first.ok) throw new Error(first.error.message);
    expect(first.data.readAt).toBe(NOW);

    const again = await markNotificationRead(
      { ...ctx, clock: fixedClock('2026-03-17T09:00:00.000Z') },
      { notificationId: target.id },
    );
    if (!again.ok) throw new Error(again.error.message);
    expect(again.data.readAt).toBe(NOW);

    const after = await getNotificationInbox(ctx, {});
    if (!after.ok) throw new Error(after.error.message);
    expect(after.data.unread).toBe(before.data.unread - 1);
  });

  it('will not let one person mark another person’s notification read', async () => {
    const store = createStore();
    const candidateInbox = await getNotificationInbox(
      contextFor(DEV_ACTORS.candidate(), store),
      {},
    );
    if (!candidateInbox.ok) throw new Error(candidateInbox.error.message);
    const theirs = candidateInbox.data.notifications[0]!;

    const attempt = await markNotificationRead(contextFor(DEV_ACTORS.manager(), store), {
      notificationId: theirs.id,
    });

    expect(attempt.ok).toBe(false);
    // And it stays unread — a refused write must not be a silent one either.
    const unchanged = store.notifications.find((row) => row.id === theirs.id);
    expect(unchanged?.readAt).toBe(theirs.readAt);
  });

  it('marks all read for the actor and nobody else', async () => {
    const store = createStore();
    const candidateCtx = contextFor(DEV_ACTORS.candidate(), store);
    const managerCtx = contextFor(DEV_ACTORS.manager(), store);

    const managerBefore = await getNotificationInbox(managerCtx, {});
    const cleared = await markAllNotificationsRead(candidateCtx, {});
    if (!cleared.ok || !managerBefore.ok) throw new Error('mark all failed');

    expect(cleared.data).toBeGreaterThan(0);

    const candidateAfter = await getNotificationInbox(candidateCtx, {});
    const managerAfter = await getNotificationInbox(managerCtx, {});
    if (!candidateAfter.ok || !managerAfter.ok) throw new Error('inbox read failed');

    expect(candidateAfter.data.unread).toBe(0);
    expect(managerAfter.data.unread).toBe(managerBefore.data.unread);

    // Idempotent: a second sweep changes nothing and says so.
    const secondSweep = await markAllNotificationsRead(candidateCtx, {});
    if (!secondSweep.ok) throw new Error(secondSweep.error.message);
    expect(secondSweep.data).toBe(0);
  });

  it('only carries routes that stay inside the app', () => {
    expect(internalRoute('/candidate/documents')).toBe('/candidate/documents');
    expect(internalRoute('//evil.example/phish')).toBeNull();
    expect(internalRoute('javascript:alert(1)')).toBeNull();
    expect(internalRoute('/documents?next=/a b')).toBeNull();
    expect(internalRoute(undefined)).toBeNull();
  });

  it('seeds every category so the six-way treatment has something to render', () => {
    const store = createStore();
    const categories = new Set(store.notifications.map((row) => row.category));
    expect([...categories].sort()).toEqual([
      'candidate',
      'deadline',
      'exception',
      'onboarding',
      'selection',
      'system',
    ]);
  });
});
