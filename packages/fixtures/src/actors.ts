import { ANONYMOUS, type Actor, type MaybeActor } from '@relayflow/access';
import { memberships, users, ids } from './seed';

/**
 * Stand-in signed-in users, so screens can be built and reviewed before auth
 * exists.
 *
 * Switching between these is how we check that the UI actually respects
 * capabilities: an owner, an admin, a plain member, a suspended member, and
 * nobody at all should each see a different set of affordances. If they all
 * look the same, the permission wiring is not real yet.
 */

function actorFor(userId: (typeof ids)[keyof typeof ids]): Actor {
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error(`No seeded user for ${userId}`);

  return {
    userId: user.id,
    email: user.email,
    memberships: memberships
      .filter((m) => m.userId === user.id)
      .map((m) => ({
        organizationId: m.organizationId,
        role: m.role,
        status: m.status,
      })),
  };
}

export const DEV_ACTORS = {
  /** Owner of Acme, plain member of Northwind. */
  owner: () => actorFor(ids.userAda),
  /** Admin of Acme, owner of Northwind. */
  admin: () => actorFor(ids.userGrace),
  /** Plain member. Should see almost no management affordances. */
  member: () => actorFor(ids.userAlan),
  /** Suspended. Policy must deny even though a membership row exists. */
  suspended: () => actorFor(ids.userKatherine),
  /** Signed out. */
  anonymous: (): MaybeActor => ANONYMOUS,
} as const;

export type DevActorName = keyof typeof DEV_ACTORS;

export const DEV_ACTOR_NAMES = Object.keys(DEV_ACTORS) as DevActorName[];

/**
 * Resolves the actor a dev session should run as, defaulting to the owner so a
 * fresh checkout shows a populated interface rather than an empty state.
 */
export function devActor(name: string | undefined): MaybeActor {
  const key = (name ?? 'owner') as DevActorName;
  return (DEV_ACTORS[key] ?? DEV_ACTORS.owner)();
}
