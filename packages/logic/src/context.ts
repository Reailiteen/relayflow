import type { Clock } from '@relayflow/core';
import type { MaybeActor } from '@relayflow/access';
import type { Repositories, RlsClient } from '@relayflow/data';
import type { Logger } from '@relayflow/logger';

/**
 * Everything a use-case is allowed to touch, assembled once per request by the
 * calling app. Nothing is reached for ambiently — no global client, no
 * `Date.now()`, no module-level singletons — which is what makes use-cases
 * testable without a running database and impossible to run without an actor.
 */
export interface UseCaseContext {
  readonly actor: MaybeActor;
  readonly repos: Repositories;
  readonly logger: Logger;
  readonly clock: Clock;
  /**
   * The RLS-bound client, for RPC calls that need atomicity. Repositories cover
   * ordinary reads and writes; reach for this only via `callRpc`.
   */
  readonly client: RlsClient;
}
