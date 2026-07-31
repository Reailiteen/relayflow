import { conflict, ok, err, type Result } from '@relayflow/core';
import type {
  CreateOrganizationInput,
  Membership,
  Organization,
  OrganizationId,
  UserId,
} from '@relayflow/entities';
import type { MembershipPort, OrganizationPort, Repositories } from '@relayflow/ports';
import { memberships as seedMemberships, organizations as seedOrganizations } from './seed';

/**
 * In-memory adapter — the backend for UI development.
 *
 * It implements the same ports the Supabase adapter does, so screens built
 * against it are wired to the real use-cases and the real policy layer, not to
 * mock components. When the database arrives, apps swap one factory call and
 * nothing above it changes.
 *
 * State is per-instance rather than module-global so a test or a request can
 * have its own copy without leaking into the next one.
 */

export interface FixtureStore {
  organizations: Organization[];
  memberships: Membership[];
}

export function createStore(): FixtureStore {
  // Cloned: callers mutate through the repositories, never the seed arrays.
  return {
    organizations: seedOrganizations.map((o) => ({ ...o })),
    memberships: seedMemberships.map((m) => ({ ...m })),
  };
}

function organizationPort(store: FixtureStore): OrganizationPort {
  return {
    findById: (id) => Promise.resolve(ok(store.organizations.find((o) => o.id === id) ?? null)),

    findBySlug: (slug) =>
      Promise.resolve(ok(store.organizations.find((o) => o.slug === slug) ?? null)),

    listForUser: (userId) => {
      // Mirrors what RLS enforces server-side: you see only your own workspaces.
      const mine = new Set(
        store.memberships.filter((m) => m.userId === userId).map((m) => m.organizationId),
      );
      return Promise.resolve(
        ok(
          store.organizations
            .filter((o) => mine.has(o.id))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      );
    },

    createWithOwner: (input: CreateOrganizationInput, ownerId: UserId) => {
      if (store.organizations.some((o) => o.slug === input.slug)) {
        return Promise.resolve(err(conflict('That workspace address is already taken.')));
      }

      const now = new Date().toISOString();
      const organization: Organization = {
        id: `${crypto.randomUUID()}` as OrganizationId,
        slug: input.slug,
        name: input.name,
        createdAt: now,
        updatedAt: now,
      };

      // Atomic by construction: both pushes happen or neither does, because
      // nothing between them can fail.
      store.organizations.push(organization);
      store.memberships.push({
        id: crypto.randomUUID() as Membership['id'],
        organizationId: organization.id,
        userId: ownerId,
        role: 'owner',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      return Promise.resolve(ok(organization));
    },
  };
}

function membershipPort(store: FixtureStore): MembershipPort {
  const list = (predicate: (m: Membership) => boolean): Promise<Result<Membership[]>> =>
    Promise.resolve(ok(store.memberships.filter(predicate)));

  return {
    listForUser: (userId) => list((m) => m.userId === userId),
    listForOrganization: (organizationId) => list((m) => m.organizationId === organizationId),
    find: (organizationId, userId) =>
      Promise.resolve(
        ok(
          store.memberships.find(
            (m) => m.organizationId === organizationId && m.userId === userId,
          ) ?? null,
        ),
      ),
  };
}

export function createFixtureRepositories(store: FixtureStore = createStore()): Repositories {
  return {
    organizations: organizationPort(store),
    memberships: membershipPort(store),
  };
}
