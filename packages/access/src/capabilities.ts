import type { Role } from '@relayflow/entities';

/**
 * The capability catalog.
 *
 * Code asks "may this actor invite a member?", never "is this actor an admin?".
 * Roles are an implementation detail of the grant table below; capabilities are
 * the vocabulary the rest of the system speaks. Adding a role therefore cannot
 * silently widen anyone's access — you have to grant capabilities explicitly.
 */
export const CAPABILITIES = [
  'organization:read',
  'organization:update',
  'organization:delete',

  'member:read',
  'member:invite',
  'member:update_role',
  'member:remove',

  'billing:read',
  'billing:manage',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Role -> capability grants. Read this table as the complete definition of what
 * each role can do; there is no implicit inheritance and no wildcard.
 */
export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> = {
  owner: [
    'organization:read',
    'organization:update',
    'organization:delete',
    'member:read',
    'member:invite',
    'member:update_role',
    'member:remove',
    'billing:read',
    'billing:manage',
  ],
  admin: [
    'organization:read',
    'organization:update',
    'member:read',
    'member:invite',
    'member:update_role',
    'member:remove',
    'billing:read',
  ],
  member: ['organization:read', 'member:read'],
  guest: ['organization:read'],
};
