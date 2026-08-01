import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { systemClock } from '@relayflow/core';
import { ANONYMOUS, isCandidate, type MaybeActor } from '@relayflow/access';
import {
  FIXTURE_SCENARIOS,
  createFixtureRepositories,
  createStore,
  devActor,
  resetFixtureStore,
  type FixtureScenario,
} from '@relayflow/fixtures';

export const FIXTURE_SCENARIO_NAMES = FIXTURE_SCENARIOS;
export type DevelopmentFixtureScenario = FixtureScenario;
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
  const persona = store.get(DEV_ACTOR_COOKIE)?.value;

  // No cookie means signed out. Defaulting to a persona here would make the
  // sign-out button do nothing, and would be exactly the kind of "helpful"
  // fallback that hides a broken session check once this is real.
  if (!persona) return ANONYMOUS;

  return devActor(persona);
});

/**
 * One store for the whole server process, so a workspace created in one request
 * is still there in the next. Restarting the dev server resets it — which is
 * the honest behaviour for something that is explicitly not a database.
 */
const devStore = createStore();

/** Development-only reset hook used by the fixture scenario selector. */
export function resetDevelopmentFixtures(scenario: FixtureScenario): void {
  if (process.env.NODE_ENV === 'production') return;
  resetFixtureStore(devStore, scenario);
}

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

/** Sends legacy stage URLs to the cycle-explicit canonical workspace. */
export async function redirectToActiveCycleWorkspace(
  portal: 'qstp' | 'startup' | 'candidate',
  workspace: 'allocation' | 'positions' | 'selection' | 'recovery' | 'placements',
): Promise<void> {
  const ctx = await getContext();
  let selected: { readonly id: string } | null = null;
  if (portal === 'candidate' && isCandidate(ctx.actor)) {
    const candidate = await ctx.repos.candidates.findById(ctx.actor.candidateId);
    if (candidate.ok && candidate.data) {
      const cycle = await ctx.repos.cycles.findById(candidate.data.cycleId);
      selected = cycle.ok ? cycle.data : null;
    }
  } else {
    const active = await ctx.repos.cycles.findActive();
    selected = active.ok ? active.data : null;
  }
  if (!selected) return;
  const prefix = portal === 'qstp' ? '' : `/${portal}`;
  redirect(`${prefix}/cycles/${selected.id}/${workspace}`);
}
