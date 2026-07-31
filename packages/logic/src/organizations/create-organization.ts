import { ok } from '@relayflow/core';
import { createOrganizationInput, organizationEntity } from '@relayflow/entities';
import { callRpc } from '@relayflow/data';
import { AUTHENTICATED, defineUseCase, requireActor } from '../use-case';

/**
 * Creating an organization writes two rows — the organization and the owner's
 * membership. Doing that as two PostgREST calls is exactly the non-atomic
 * pattern the audit flagged: if the second write fails, you are left with an
 * organization nobody can administer, and no way to notice.
 *
 * So it is one SQL function in one transaction, running as the caller.
 * See supabase/migrations/0002_rpc_create_organization_with_owner.sql.
 */
export const createOrganization = defineUseCase({
  name: 'organizations.create',
  input: createOrganizationInput,

  // No tenant capability applies: this call is what brings the tenant into
  // existence. Any signed-in user may create their own workspace.
  authorize: AUTHENTICATED,

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const created = await callRpc(
      ctx.client,
      'create_organization_with_owner',
      { p_name: input.name, p_slug: input.slug },
      organizationEntity.parse,
    );
    if (!created.ok) return created;

    ctx.logger.info('organization created', {
      organizationId: created.data.id,
      ownerId: actor.data.userId,
    });

    return ok(created.data);
  },
});
