import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { systemClock } from '@relayflow/core';
import {
  ANONYMOUS,
  isCandidate,
  type MaybeActor,
  type StartupAffiliation,
} from '@relayflow/access';
import { createRepositories, type RlsClient } from '@relayflow/data';
import type { CandidateId, StartupId, UserId } from '@relayflow/entities';
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
import { getSupabaseServerClient, supabaseEnv } from './supabase';

/**
 * The data access layer.
 *
 * Identity is derived in exactly one place, and `getActor()` is memoized per
 * request so that doing it correctly costs one resolution rather than one per
 * call site. Nothing here trusts a client-supplied user or startup id.
 *
 * Two adapters, chosen by whether the project is configured:
 *
 *   **Supabase** — a verified session and the real repositories. Every query
 *   runs under the caller's own JWT, so row-level security applies to all of
 *   them. This is the path that matters.
 *
 *   **Fixtures** — no `.env.local`, so an in-memory store and a persona cookie.
 *   Kept so a fresh clone runs with no credentials and no database, and so the
 *   sign-in page can say plainly which mode it is in. It is a demo affordance,
 *   not a fallback the production path can silently drop into: if Supabase is
 *   configured and the session is missing, the answer is ANONYMOUS, never a
 *   persona.
 */

/** Dev-only: which seeded user this session is acting as, on fixtures. */
export const DEV_ACTOR_COOKIE = 'relayflow_dev_actor';

export const getActor = cache(async (): Promise<MaybeActor> => {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    const store = await cookies();
    const persona = store.get(DEV_ACTOR_COOKIE)?.value;
    // No cookie means signed out. Defaulting to a persona here would make the
    // sign-out button do nothing, and would be exactly the kind of "helpful"
    // fallback that hides a broken session check.
    if (!persona) return ANONYMOUS;
    return devActor(persona);
  }

  // `getUser`, not `getSession`. getSession reads the cookie and believes it;
  // getUser re-validates the JWT against the auth server. On a request that
  // decides whether someone may read a national ID, that difference is the
  // whole check.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return ANONYMOUS;

  return resolveActor(supabase, data.user.id as UserId, data.user.email ?? '');
});

/**
 * A Supabase user becomes one of three actor shapes.
 *
 * The order is not arbitrary. QSTP staff operate across startups, so a staff
 * row wins over any membership — checking membership first would strip a staff
 * member who also advises a portfolio company of their staff powers, silently,
 * and only for them.
 *
 * All three reads run under the caller's own JWT. `qstp_staff_select` is
 * `is_qstp()`, which is self-referential and therefore true exactly for the
 * people who have a row, so a non-staff caller gets zero rows rather than an
 * error — which is the answer we wanted anyway.
 */
async function resolveActor(
  client: RlsClient,
  userId: UserId,
  email: string,
): Promise<MaybeActor> {
  const profile = await client.from('users').select('full_name').eq('id', userId).maybeSingle();
  const fullName = profile.data?.full_name ?? email;

  const staff = await client.from('qstp_staff').select('role').eq('user_id', userId).maybeSingle();
  if (staff.data) {
    return { kind: 'qstp', userId, email, fullName, role: staff.data.role };
  }

  const members = await client
    .from('startup_members')
    .select('startup_id, role, status')
    .eq('user_id', userId);
  if (members.data && members.data.length > 0) {
    const affiliations: StartupAffiliation[] = members.data.map((row) => ({
      startupId: row.startup_id as StartupId,
      role: row.role,
      status: row.status,
    }));
    return { kind: 'startup', userId, email, fullName, affiliations };
  }

  const candidate = await client
    .from('candidates')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (candidate.data) {
    return { kind: 'candidate', userId, email, fullName, candidateId: candidate.data.id as CandidateId };
  }

  // Authenticated, but nothing in the programme answers to them. Deliberately
  // ANONYMOUS: they have a valid session and no place to be, and the sign-in
  // page already says so rather than dropping them on an empty dashboard.
  return ANONYMOUS;
}

/**
 * One store for the whole server process, so a workspace created in one request
 * is still there in the next. Restarting the dev server resets it — which is
 * the honest behaviour for something that is explicitly not a database.
 */
const devStore = createStore();

/**
 * Development-only reset hook used by the fixture scenario selector.
 *
 * A no-op once the project is configured. Resetting an in-memory store that
 * nothing is reading would look like it worked and change nothing on screen.
 */
export function resetDevelopmentFixtures(scenario: FixtureScenario): void {
  if (process.env.NODE_ENV === 'production') return;
  if (supabaseEnv() !== null) return;
  resetFixtureStore(devStore, scenario);
}

/** Whether the scenario switcher should render at all. */
export function isRunningOnFixtures(): boolean {
  return supabaseEnv() === null;
}

export const getContext = cache(async (): Promise<UseCaseContext> => {
  const supabase = await getSupabaseServerClient();
  return {
    actor: await getActor(),
    repos: supabase ? createRepositories(supabase) : createFixtureRepositories(devStore),
    clock: systemClock,
    logger: createLogger({
      minLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      // Which adapter answered is the first thing you want to know when a
      // screen is empty and you are not sure whether that is RLS or a store
      // that restarted.
      base: { app: 'web', adapter: supabase ? 'supabase' : 'fixtures' },
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
