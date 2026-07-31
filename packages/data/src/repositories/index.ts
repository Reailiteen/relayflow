import type { Repositories } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { organizationRepository } from './organizations';
import { membershipRepository } from './memberships';

/**
 * The Supabase adapter. Satisfies @relayflow/ports, so it is interchangeable
 * with @relayflow/fixtures from the caller's point of view.
 */
export function createRepositories(client: RlsClient): Repositories {
  return {
    organizations: organizationRepository(client),
    memberships: membershipRepository(client),
  };
}

export * from './organizations';
export * from './memberships';
