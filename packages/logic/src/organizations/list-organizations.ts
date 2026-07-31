import { z } from 'zod';
import { AUTHENTICATED, defineUseCase, requireActor } from '../use-case';

/**
 * The workspaces the caller belongs to.
 *
 * The user id comes from the resolved actor, never from input — a caller must
 * not be able to list somebody else's workspaces by passing their id.
 */
export const listOrganizations = defineUseCase({
  name: 'organizations.list',
  input: z.object({}),
  authorize: AUTHENTICATED,
  execute: async (ctx) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    return ctx.repos.organizations.listForUser(actor.data.userId);
  },
});
