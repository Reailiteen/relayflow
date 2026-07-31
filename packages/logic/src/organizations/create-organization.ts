import { createOrganizationInput } from '@relayflow/entities';
import { AUTHENTICATED, defineUseCase, requireActor } from '../use-case';

/**
 * Creating an organization writes two records — the organization and the
 * owner's membership — and a half-completed version of that leaves a workspace
 * nobody can administer.
 *
 * The use-case does not orchestrate those two writes itself; it calls a single
 * port method whose contract requires atomicity. That way the guarantee lives
 * with whoever can actually provide it (a SQL transaction, in the Supabase
 * adapter) instead of being attempted from up here, which is the non-atomic
 * pattern the audit flagged.
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

    const created = await ctx.repos.organizations.createWithOwner(input, actor.data.userId);
    if (!created.ok) return created;

    ctx.logger.info('organization created', {
      organizationId: created.data.id,
      ownerId: actor.data.userId,
    });

    return created;
  },
});
