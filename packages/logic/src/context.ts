import type { Clock } from '@relayflow/core';
import type { MaybeActor } from '@relayflow/access';
import type { Repositories } from '@relayflow/ports';
import type { Logger } from '@relayflow/logger';

/**
 * Everything a use-case is allowed to touch, assembled once per request by the
 * calling app. Nothing is reached for ambiently — no global client, no
 * `Date.now()`, no module-level singletons — which is what makes use-cases
 * testable without a running database and impossible to run without an actor.
 *
 * `repos` is an interface, not an implementation. The app decides whether that
 * is the in-memory adapter or Supabase; nothing here can tell the difference,
 * and no use-case is allowed to find out.
 */
export interface UseCaseContext {
  readonly actor: MaybeActor;
  readonly repos: Repositories;
  readonly logger: Logger;
  readonly clock: Clock;
}
