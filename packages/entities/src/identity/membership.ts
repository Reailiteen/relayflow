import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  membershipId,
  organizationId,
  userId,
  type MembershipId,
  type OrganizationId,
  type UserId,
} from '../shared/ids';

/**
 * Roles are coarse labels attached to a membership. They exist to be expanded
 * into capabilities by @relayflow/access — no code should branch on the role
 * string directly, because that is how "admin can do everything" bugs start.
 */
export const ROLES = ['owner', 'admin', 'member', 'guest'] as const;
export const role = z.enum(ROLES);
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended'] as const;
export const membershipStatus = z.enum(MEMBERSHIP_STATUSES);
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** A user's relationship to one organization. The join that authorization reads. */
export interface Membership {
  readonly id: MembershipId;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly role: Role;
  readonly status: MembershipStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const membershipRow = z.object({
  id: membershipId,
  organization_id: organizationId,
  user_id: userId,
  role,
  status: membershipStatus,
  ...auditColumns,
});

export const membershipEntity = defineEntity({
  name: 'Membership',
  row: membershipRow,
  toDomain: (row): Membership => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const inviteMemberInput = z.object({
  email: z.email('Enter a valid email address.'),
  // Ownership transfer is a separate, deliberate operation — not an invite.
  role: z.enum(['admin', 'member', 'guest']),
});

export type InviteMemberInput = z.infer<typeof inviteMemberInput>;
