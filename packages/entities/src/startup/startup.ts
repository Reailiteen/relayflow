import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  startupId,
  startupMemberId,
  userId,
  type StartupId,
  type StartupMemberId,
  type UserId,
} from '../shared/ids';

/**
 * A startup in the QSTP programme, and the people who act on its behalf.
 *
 * The startup is the tenant boundary: a startup member must never see another
 * startup's candidates, interviews or allocation. QSTP staff are not members of
 * anything — they operate across all startups — which is why staff access is
 * modelled separately in @relayflow/access rather than as a super-role here.
 */

export interface Startup {
  readonly id: StartupId;
  readonly name: string;
  readonly slug: string;
  readonly sector: string | null;
  readonly contactEmail: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const startupRow = z.object({
  id: startupId,
  name: z.string().min(1).max(200),
  slug: z.string().min(2).max(63),
  sector: z.string().max(100).nullable(),
  contact_email: z.email(),
  ...auditColumns,
});

export const startupEntity = defineEntity({
  name: 'Startup',
  row: startupRow,
  toDomain: (row): Startup => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sector: row.sector,
    contactEmail: row.contact_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

/**
 * Roles inside a startup. Kept deliberately small — this is a portal for a
 * handful of people at each company, not an org chart.
 *
 * `supervisor` exists because positions name a supervisor and that person needs
 * to see their own interns without being able to change the startup's roles.
 */
export const STARTUP_ROLES = ['owner', 'member', 'supervisor'] as const;
export const startupRole = z.enum(STARTUP_ROLES);
export type StartupRole = (typeof STARTUP_ROLES)[number];

export const MEMBER_STATUSES = ['invited', 'active', 'suspended'] as const;
export const memberStatus = z.enum(MEMBER_STATUSES);
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface StartupMember {
  readonly id: StartupMemberId;
  readonly startupId: StartupId;
  readonly userId: UserId;
  readonly role: StartupRole;
  readonly status: MemberStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const startupMemberRow = z.object({
  id: startupMemberId,
  startup_id: startupId,
  user_id: userId,
  role: startupRole,
  status: memberStatus,
  ...auditColumns,
});

export const startupMemberEntity = defineEntity({
  name: 'StartupMember',
  row: startupMemberRow,
  toDomain: (row): StartupMember => ({
    id: row.id,
    startupId: row.startup_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});
