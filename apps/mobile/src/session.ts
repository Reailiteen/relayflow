import { systemClock } from '@relayflow/core';
import type { MaybeActor } from '@relayflow/access';
import { createFixtureRepositories, createStore, devActor } from '@relayflow/fixtures';
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
 * Running on fixtures for now; see the note in the web context. Swapping in
 * Supabase is a change to this file alone.
 */

const logger = createLogger({
  minLevel: __DEV__ ? 'debug' : 'info',
  base: { app: 'mobile' },
});

/** One store per app launch, so writes persist while you navigate. */
const store = createStore();

let actingAs = 'candidate';

/** Dev affordance: re-run the app as a different seeded user. */
export function setActingAs(name: string) {
  actingAs = name;
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
