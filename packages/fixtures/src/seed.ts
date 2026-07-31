import { asId } from '@relayflow/core';
import type { Membership, Organization, OrganizationId, User, UserId } from '@relayflow/entities';

/**
 * Seed data for UI development.
 *
 * Chosen to exercise the cases that break layouts rather than the ones that
 * flatter them: a long organization name, a member with no avatar, a suspended
 * member, and a user who belongs to two workspaces with different roles. If a
 * screen looks right against this, it will look right in production.
 */

export const ids = {
  orgAcme: asId<'OrganizationId'>('a0000000-0000-4000-8000-000000000001'),
  orgNorthwind: asId<'OrganizationId'>('a0000000-0000-4000-8000-000000000002'),

  userAda: asId<'UserId'>('b0000000-0000-4000-8000-000000000001'),
  userGrace: asId<'UserId'>('b0000000-0000-4000-8000-000000000002'),
  userAlan: asId<'UserId'>('b0000000-0000-4000-8000-000000000003'),
  userKatherine: asId<'UserId'>('b0000000-0000-4000-8000-000000000004'),
} satisfies Record<string, OrganizationId | UserId>;

const NOW = '2026-01-15T09:30:00.000Z';
const EARLIER = '2025-11-02T14:05:00.000Z';

export const organizations: Organization[] = [
  {
    id: ids.orgAcme,
    slug: 'acme',
    name: 'Acme',
    createdAt: EARLIER,
    updatedAt: NOW,
  },
  {
    id: ids.orgNorthwind,
    slug: 'northwind-logistics-group',
    // Deliberately long: headers and breadcrumbs need to survive it.
    name: 'Northwind Logistics Group International',
    createdAt: EARLIER,
    updatedAt: EARLIER,
  },
];

export const users: User[] = [
  {
    id: ids.userAda,
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    avatarUrl: 'https://i.pravatar.cc/128?u=ada',
    createdAt: EARLIER,
    updatedAt: NOW,
  },
  {
    id: ids.userGrace,
    email: 'grace@example.com',
    displayName: 'Grace Hopper',
    avatarUrl: 'https://i.pravatar.cc/128?u=grace',
    createdAt: EARLIER,
    updatedAt: NOW,
  },
  {
    id: ids.userAlan,
    email: 'alan.with.a.rather.long.address@example.com',
    displayName: 'Alan Turing',
    // No avatar: initials fallback has to exist.
    avatarUrl: null,
    createdAt: EARLIER,
    updatedAt: EARLIER,
  },
  {
    id: ids.userKatherine,
    email: 'katherine@example.com',
    displayName: 'Katherine Johnson',
    avatarUrl: null,
    createdAt: EARLIER,
    updatedAt: EARLIER,
  },
];

const membership = (
  n: number,
  organizationId: OrganizationId,
  userId: UserId,
  role: Membership['role'],
  status: Membership['status'] = 'active',
): Membership => ({
  id: asId<'MembershipId'>(`c0000000-0000-4000-8000-00000000000${n}`),
  organizationId,
  userId,
  role,
  status,
  createdAt: EARLIER,
  updatedAt: NOW,
});

export const memberships: Membership[] = [
  membership(1, ids.orgAcme, ids.userAda, 'owner'),
  membership(2, ids.orgAcme, ids.userGrace, 'admin'),
  membership(3, ids.orgAcme, ids.userAlan, 'member'),
  // Suspended: the roster must render this distinctly, and policy must deny it.
  membership(4, ids.orgAcme, ids.userKatherine, 'member', 'suspended'),
  // Ada is an owner in one workspace and a plain member in the other, so the
  // UI cannot get away with caching "is admin" globally.
  membership(5, ids.orgNorthwind, ids.userAda, 'member'),
  membership(6, ids.orgNorthwind, ids.userGrace, 'owner'),
];
