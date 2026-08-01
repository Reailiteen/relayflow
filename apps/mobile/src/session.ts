import { systemClock } from '@relayflow/core';
import { isCandidate, isStartup, type MaybeActor } from '@relayflow/access';
import { DEV_ACTOR_NAMES, createFixtureRepositories, createStore, devActor } from '@relayflow/fixtures';
import { createLogger } from '@relayflow/logger';
import type { UseCaseContext } from '@relayflow/logic';

/**
 * The mobile counterpart to apps/web/src/server/context.ts.
 *
 * Deliberately the same shape: resolve an actor, build repositories, hand both
 * to the same use-cases. Web and mobile share every authorization decision
 * because they share the code that makes it — that is the whole reason `logic`
 * is a package rather than a folder in each app.
 *
 * Running on fixtures. Swapping in Supabase is a change to this file alone.
 */

const logger = createLogger({
  minLevel: __DEV__ ? 'debug' : 'info',
  base: { app: 'mobile' },
});

/** One store per app launch, so writes persist while you navigate. */
const store = createStore();

/** Mobile carries the candidate and startup portals; QSTP stays on the web. */
export const MOBILE_PERSONAS = DEV_ACTOR_NAMES.filter(
  (name) => name === 'candidate' || name === 'startupOwner' || name === 'lateStartup',
);

let actingAs: string = 'candidate';
const listeners = new Set<() => void>();

export function setActingAs(name: string) {
  actingAs = name;
  for (const listener of listeners) listener();
}

export function getActingAs(): string {
  return actingAs;
}

/** Lets screens re-render when the dev persona changes. */
export function subscribeToActor(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resolveActor(): MaybeActor {
  // ⟵ REPLACE WITH: verified session lookup.
  return devActor(actingAs);
}

export function createContext(): UseCaseContext {
  return {
    actor: resolveActor(),
    // ⟵ REPLACE WITH: createRepositories(rlsBoundClient).
    repos: createFixtureRepositories(store),
    clock: systemClock,
    logger,
  };
}

/** Which portal this session belongs in. Drives the initial route. */
export function portalFor(actor: MaybeActor): 'candidate' | 'startup' | null {
  if (isCandidate(actor)) return 'candidate';
  if (isStartup(actor)) return 'startup';
  return null;
}
