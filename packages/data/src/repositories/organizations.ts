import type { Result } from '@relayflow/core';
import {
  organizationEntity,
  type Organization,
  type OrganizationId,
} from '@relayflow/entities';
import type { RlsClient } from '../client';
import { run, runMaybe } from '../repository';

/**
 * Repositories are thin: they select, they parse, they return. No branching on
 * roles, no cross-table workflows, no side effects. Anything that decides
 * *whether* an action is allowed belongs in @relayflow/access; anything that
 * sequences several writes belongs in a SQL function.
 */
export interface OrganizationRepository {
  findById(id: OrganizationId): Promise<Result<Organization | null>>;
  findBySlug(slug: string): Promise<Result<Organization | null>>;
  /** Only the organizations RLS already permits this session to see. */
  listForCurrentUser(): Promise<Result<Organization[]>>;
}

const COLUMNS = 'id, slug, name, created_at, updated_at';

export function organizationRepository(client: RlsClient): OrganizationRepository {
  return {
    findById: (id) =>
      runMaybe(
        client.from('organizations').select(COLUMNS).eq('id', id).maybeSingle(),
        organizationEntity.parse,
        { repository: 'organizations', op: 'findById' },
      ),

    findBySlug: (slug) =>
      runMaybe(
        client.from('organizations').select(COLUMNS).eq('slug', slug).maybeSingle(),
        organizationEntity.parse,
        { repository: 'organizations', op: 'findBySlug' },
      ),

    listForCurrentUser: () =>
      run(
        client.from('organizations').select(COLUMNS).order('name', { ascending: true }),
        organizationEntity.parseMany,
        { repository: 'organizations', op: 'listForCurrentUser' },
      ),
  };
}
