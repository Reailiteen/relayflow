import type { RlsClient } from '../client';
import { organizationRepository, type OrganizationRepository } from './organizations';
import { membershipRepository, type MembershipRepository } from './memberships';

/**
 * The single object use-cases receive. Adding a repository here makes it
 * available everywhere; nothing in @relayflow/logic ever constructs a client.
 */
export interface Repositories {
  readonly organizations: OrganizationRepository;
  readonly memberships: MembershipRepository;
}

export function createRepositories(client: RlsClient): Repositories {
  return {
    organizations: organizationRepository(client),
    memberships: membershipRepository(client),
  };
}

export * from './organizations';
export * from './memberships';
