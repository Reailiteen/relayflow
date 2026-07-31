import { ok, type Result } from '@relayflow/core';
import {
  organizationEntity,
  type CreateOrganizationInput,
  type Organization,
  type UserId,
} from '@relayflow/entities';
import type { OrganizationPort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { run, runMaybe } from '../repository';
import { callRpc } from '../transaction';

/**
 * Repositories are thin: they select, they parse, they return. No branching on
 * roles, no policy, no orchestration. Anything that decides *whether* an action
 * is allowed lives in @relayflow/access.
 *
 * The one place this adapter does more than a single statement is
 * `createWithOwner`, and there it does less: it delegates to a SQL function so
 * the two writes share a transaction.
 */

const COLUMNS = 'id, slug, name, created_at, updated_at';

export function organizationRepository(client: RlsClient): OrganizationPort {
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

    // RLS already restricts this to the caller's own organizations; the filter
    // is not repeated here because doing so would imply the client is trusted
    // to supply its own identity.
    listForUser: (_userId: UserId) =>
      run(
        client.from('organizations').select(COLUMNS).order('name', { ascending: true }),
        organizationEntity.parseMany,
        { repository: 'organizations', op: 'listForUser' },
      ),

    createWithOwner: async (
      input: CreateOrganizationInput,
      _ownerId: UserId,
    ): Promise<Result<Organization>> => {
      // Ownership is assigned from auth.uid() inside the function, not from the
      // argument — a caller must not be able to hand a workspace to someone else.
      const created = await callRpc(
        client,
        'create_organization_with_owner',
        { p_name: input.name, p_slug: input.slug },
        organizationEntity.parse,
      );
      return created.ok ? ok(created.data) : created;
    },
  };
}
