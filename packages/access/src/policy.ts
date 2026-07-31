import { forbidden, unauthenticated, type Result, ok, err } from '@relayflow/core';
import type { OrganizationId } from '@relayflow/entities';
import { ROLE_CAPABILITIES, type Capability } from './capabilities';
import { isAuthenticated, membershipIn, type MaybeActor } from './actor';

/**
 * The decision function. Pure, synchronous, and total — given the same actor
 * and capability it always returns the same answer, which makes the whole
 * authorization surface unit-testable without a database.
 */

export interface AccessQuery {
  readonly capability: Capability;
  /** Tenant the action targets. Omit only for genuinely global reads. */
  readonly organizationId?: OrganizationId;
}

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: 'unauthenticated' | 'not_a_member' | 'suspended' | 'missing_capability' };

export function decide(actor: MaybeActor, query: AccessQuery): Decision {
  if (!isAuthenticated(actor)) return { allowed: false, reason: 'unauthenticated' };

  if (query.organizationId === undefined) {
    // No tenant in the query means the capability must hold somewhere the actor
    // is active — never a blanket allow.
    const anywhere = actor.memberships.some(
      (m) => m.status === 'active' && grants(m.role, query.capability),
    );
    return anywhere ? { allowed: true } : { allowed: false, reason: 'missing_capability' };
  }

  const membership = membershipIn(actor, query.organizationId);
  if (!membership) return { allowed: false, reason: 'not_a_member' };
  if (membership.status !== 'active') return { allowed: false, reason: 'suspended' };

  return grants(membership.role, query.capability)
    ? { allowed: true }
    : { allowed: false, reason: 'missing_capability' };
}

function grants(role: keyof typeof ROLE_CAPABILITIES, capability: Capability): boolean {
  // Default deny: an unknown role yields an empty grant list, not a wildcard.
  return (ROLE_CAPABILITIES[role] ?? []).includes(capability);
}

/** Boolean form, for rendering UI affordances. */
export function can(actor: MaybeActor, query: AccessQuery): boolean {
  return decide(actor, query).allowed;
}

/**
 * Result form, for use-cases. A denial for a resource the actor cannot even
 * see returns `not_found` rather than `forbidden`, so the API does not confirm
 * the existence of other tenants' records.
 */
export function authorize(actor: MaybeActor, query: AccessQuery): Result<void> {
  const decision = decide(actor, query);
  if (decision.allowed) return ok(undefined);

  const context = { capability: query.capability, organizationId: query.organizationId };

  switch (decision.reason) {
    case 'unauthenticated':
      return err(unauthenticated(undefined, { context }));
    case 'not_a_member':
      return err(forbidden('You do not have access to this workspace.', { context }));
    case 'suspended':
      return err(forbidden('Your access to this workspace is suspended.', { context }));
    case 'missing_capability':
      return err(forbidden('You do not have permission to do this.', { context }));
  }
}
