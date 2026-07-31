import { ANONYMOUS, type Actor, type MaybeActor } from '@relayflow/access';
import { ids, users } from './seed';

/**
 * Stand-in signed-in users, one per meaningful vantage point.
 *
 * Switching between these is how we check the UI genuinely respects
 * capabilities rather than merely looking like it does. A programme manager, an
 * operations user, a read-only auditor, a startup owner, a supervisor and a
 * candidate should each see a materially different interface. If any two of
 * them look the same, something is gated on the wrong thing.
 */

const emailOf = (userId: (typeof ids)[keyof typeof ids]) =>
  users.find((u) => u.id === userId)?.email ?? 'unknown@example.com';

const nameOf = (userId: (typeof ids)[keyof typeof ids]) =>
  users.find((u) => u.id === userId)?.fullName ?? 'Unknown';

export const DEV_ACTORS = {
  /** QSTP programme manager — full control, including budget-reshaping actions. */
  manager: (): Actor => ({
    kind: 'qstp',
    userId: ids.qstpManager,
    email: emailOf(ids.qstpManager),
    fullName: nameOf(ids.qstpManager),
    role: 'program_manager',
  }),

  /** QSTP operations — day-to-day, but cannot run redistribution or override. */
  operations: (): Actor => ({
    kind: 'qstp',
    userId: ids.qstpOps,
    email: emailOf(ids.qstpOps),
    fullName: nameOf(ids.qstpOps),
    role: 'operations',
  }),

  /** Read-only auditor. Every mutating affordance should be absent. */
  auditor: (): Actor => ({
    kind: 'qstp',
    userId: ids.qstpViewer,
    email: emailOf(ids.qstpViewer),
    fullName: nameOf(ids.qstpViewer),
    role: 'viewer',
  }),

  /** Acme's owner — the happy-path startup, 60 hours, already placed someone. */
  startupOwner: (): Actor => ({
    kind: 'startup',
    userId: ids.acmeOwner,
    email: emailOf(ids.acmeOwner),
    fullName: nameOf(ids.acmeOwner),
    affiliations: [{ startupId: ids.acme, role: 'owner', status: 'active' }],
  }),

  /** Acme's supervisor — interviews, but cannot select or request exceptions. */
  supervisor: (): Actor => ({
    kind: 'startup',
    userId: ids.acmeSupervisor,
    email: emailOf(ids.acmeSupervisor),
    fullName: nameOf(ids.acmeSupervisor),
    affiliations: [{ startupId: ids.acme, role: 'supervisor', status: 'active' }],
  }),

  /** Northwind's owner — missed the deadline, exception pending. */
  lateStartup: (): Actor => ({
    kind: 'startup',
    userId: ids.northwindOwner,
    email: emailOf(ids.northwindOwner),
    fullName: nameOf(ids.northwindOwner),
    affiliations: [{ startupId: ids.northwind, role: 'owner', status: 'active' }],
  }),

  /** Layla — placed, now working through onboarding documents. */
  candidate: (): Actor => ({
    kind: 'candidate',
    userId: ids.candidateUser,
    email: emailOf(ids.candidateUser),
    fullName: nameOf(ids.candidateUser),
    candidateId: ids.canLayla,
  }),

  anonymous: (): MaybeActor => ANONYMOUS,
} as const;

export type DevActorName = keyof typeof DEV_ACTORS;

export const DEV_ACTOR_NAMES = Object.keys(DEV_ACTORS) as DevActorName[];

/**
 * Resolves the actor a dev session runs as, defaulting to the programme manager
 * so a fresh checkout lands on the busiest, most informative screen.
 */
export function devActor(name: string | undefined): MaybeActor {
  const key = (name ?? 'manager') as DevActorName;
  return (DEV_ACTORS[key] ?? DEV_ACTORS.manager)();
}
