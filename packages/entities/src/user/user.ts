import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import { userId, type UserId } from '../shared/ids';

/**
 * A person who can sign in — QSTP staff, startup member, or candidate.
 *
 * What they are *allowed to do* is not stored here. That is decided by
 * @relayflow/access from their QSTP staff record, their startup memberships, or
 * their candidate record. Keeping authority out of the profile is what stops a
 * "role" column on users from quietly becoming the real permission system.
 */
export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly fullName: string;
  readonly avatarUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const userRow = z.object({
  id: userId,
  email: z.email(),
  full_name: z.string().min(1).max(200),
  avatar_url: z.url().nullable(),
  ...auditColumns,
});

export const userEntity = defineEntity({
  name: 'User',
  row: userRow,
  toDomain: (row): User => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});
