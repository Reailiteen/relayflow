import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import { userId, type UserId } from '../shared/ids';

/**
 * The application-side profile. Credentials stay in auth.users and are never
 * mirrored here — this table holds only what the product needs to display.
 */
export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const userRow = z.object({
  id: userId,
  email: z.email(),
  display_name: z.string().min(1).max(200),
  avatar_url: z.url().nullable(),
  ...auditColumns,
});

export const userEntity = defineEntity({
  name: 'User',
  row: userRow,
  toDomain: (row): User => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const updateProfileInput = z.object({
  displayName: z.string().trim().min(1, 'Name is required.').max(200),
  avatarUrl: z.url().nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInput>;
