import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { systemClock } from '@relayflow/core';
import type { MaybeActor } from '@relayflow/access';
import { createFixtureRepositories, createStore, devActor } from '@relayflow/fixtures';
import { createLogger } from '@relayflow/logger';
import type { UseCaseContext } from '@relayflow/logic';

/**
 * The data access layer.
 *
 * Identity is derived in exactly one place, and `getActor()` is memoized per
 * request so that doing it correctly costs one resolution rather than one per
 * call site. Nothing here trusts a client-supplied user or organization id.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CURRENTLY RUNNING ON FIXTURES. There is no database and no auth yet: the
 * actor comes from a cookie you can set from the dev toolbar, and the
 * repositories are in-memory.
 *
 * That is a deliberate, temporary state, and it is confined to this file.
 * Everything above it — use-cases, policy, entities — is already the real
 * implementation. Wiring Supabase later means replacing the two marked lines
 * below with a session lookup and `createRepositories(client)`; no use-case,
 * no policy rule, and no screen changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Dev-only: which seeded user this session is acting as. */
export const DEV_ACTOR_COOKIE = 'relayflow_dev_actor';

export const getActor = cache(async (): Promise<MaybeActor> => {
  // ⟵ REPLACE WITH: verified session lookup (supabase.auth.getUser()).
  const store = await cookies();
  return devActor(store.get(DEV_ACTOR_COOKIE)?.value);
});

/**
 * One store for the whole server process, so a workspace created in one request
 * is still there in the next. Restarting the dev server resets it — which is
 * the honest behaviour for something that is explicitly not a database.
 */
const devStore = createStore();

export const getContext = cache(async (): Promise<UseCaseContext> => {
  return {
    actor: await getActor(),
    // ⟵ REPLACE WITH: createRepositories(rlsBoundClient).
    repos: createFixtureRepositories(devStore),
    clock: systemClock,
    logger: createLogger({
      minLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      base: { app: 'web' },
    }),
  };
});

/**
 * The active cycle's name, for the sidebar.
 *
 * Chrome should not need a use-case and an authorization round trip just to
 * print a heading, so this reads the repository directly. It exposes nothing
 * the actor could not already see on any screen in this portal.
 */
export const getActiveCycleName = cache(async (): Promise<string | null> => {
  const ctx = await getContext();
  const result = await ctx.repos.cycles.findActive();
  return result.ok ? (result.data?.name ?? null) : null;
});
