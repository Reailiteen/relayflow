import type { MembershipStatus, OrganizationId, Role, UserId } from '@relayflow/entities';

/**
 * Who is asking, resolved once per request.
 *
 * The audit's central failure was authorization decided from whatever data
 * happened to be in scope. Here the actor is built in exactly one place (the
 * app's session resolver) and passed explicitly into every use-case, so a
 * decision can never be made from an unverified client-supplied value.
 */
export interface ActorMembership {
  readonly organizationId: OrganizationId;
  readonly role: Role;
  readonly status: MembershipStatus;
}

export interface Actor {
  readonly userId: UserId;
  readonly email: string;
  /** Every organization this user belongs to, including suspended ones. */
  readonly memberships: readonly ActorMembership[];
}

/** An unauthenticated caller. Distinct from "actor with no memberships". */
export const ANONYMOUS = Symbol('anonymous');
export type AnonymousActor = typeof ANONYMOUS;

export type MaybeActor = Actor | AnonymousActor;

export function isAuthenticated(actor: MaybeActor): actor is Actor {
  return actor !== ANONYMOUS;
}

export function membershipIn(actor: Actor, organizationId: OrganizationId): ActorMembership | null {
  return actor.memberships.find((m) => m.organizationId === organizationId) ?? null;
}
