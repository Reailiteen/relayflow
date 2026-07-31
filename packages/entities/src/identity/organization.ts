import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import { organizationId, type OrganizationId } from '../shared/ids';

/**
 * The tenant boundary. Every tenant-scoped table carries organization_id, and
 * every RLS policy keys off it — so this is the single most important column
 * in the schema.
 */
export interface Organization {
  readonly id: OrganizationId;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const organizationRow = z.object({
  id: organizationId,
  slug: z.string().min(2).max(63),
  name: z.string().min(1).max(200),
  ...auditColumns,
});

export const organizationEntity = defineEntity({
  name: 'Organization',
  row: organizationRow,
  toDomain: (row): Organization => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const createOrganizationInput = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.'),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationInput>;
