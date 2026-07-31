import type { Result } from '@relayflow/core';
import type {
  CreateOrganizationInput,
  Membership,
  Organization,
  OrganizationId,
  UserId,
} from '@relayflow/entities';

/**
 * What the application needs from storage, stated without saying who provides it.
 *
 * `@relayflow/logic` depends on these interfaces and nothing else, so use-cases
 * know nothing about Postgres, PostgREST, or HTTP. Two adapters implement them:
 * `@relayflow/fixtures` (in-memory, what UI development runs against) and
 * `@relayflow/data` (Supabase, for when we wire the real backend).
 *
 * That split is what lets the product be built and demoed before a database
 * exists, and it is also what keeps the eventual swap honest — if a use-case
 * cannot be satisfied through these methods, the gap is visible here rather
 * than discovered halfway through a migration.
 */

export interface OrganizationPort {
  findById(id: OrganizationId): Promise<Result<Organization | null>>;
  findBySlug(slug: string): Promise<Result<Organization | null>>;
  /** Only what the caller is permitted to see. */
  listForUser(userId: UserId): Promise<Result<Organization[]>>;

  /**
   * Creates the organization and its owning membership.
   *
   * **Every implementation must make this atomic.** Two writes that can half
   * succeed leave an organization nobody can administer, which is unrecoverable
   * through the UI. The Supabase adapter satisfies this with a single SQL
   * function; an in-memory adapter satisfies it by construction.
   */
  createWithOwner(input: CreateOrganizationInput, ownerId: UserId): Promise<Result<Organization>>;
}

export interface MembershipPort {
  listForUser(userId: UserId): Promise<Result<Membership[]>>;
  listForOrganization(organizationId: OrganizationId): Promise<Result<Membership[]>>;
  find(organizationId: OrganizationId, userId: UserId): Promise<Result<Membership | null>>;
}

/** The single object use-cases receive. Adapters return one of these. */
export interface Repositories {
  readonly organizations: OrganizationPort;
  readonly memberships: MembershipPort;
}
