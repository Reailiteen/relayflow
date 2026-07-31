import { z } from 'zod';
import { organizationId } from '@relayflow/entities';
import { defineUseCase } from '../use-case';

/**
 * A capability-gated read. Note that the tenant comes from validated input and
 * the check is against that same value — the actor cannot pass one
 * organization to the gate and read from another.
 *
 * RLS enforces the same boundary at the database. Both layers are deliberate:
 * the policy gives a clear error and drives the UI, RLS is the backstop that
 * holds even if a query is written wrongly.
 */
export const listMembers = defineUseCase({
  name: 'organizations.listMembers',

  input: z.object({ organizationId }),

  authorize: (_ctx, input) => ({
    capability: 'member:read' as const,
    organizationId: input.organizationId,
  }),

  execute: (ctx, input) => ctx.repos.memberships.listForOrganization(input.organizationId),
});
