import type { CandidateId, MemberStatus, StartupId, StartupRole, UserId } from '@relayflow/entities';

/**
 * Who is asking — and RelayFlow has three genuinely different answers.
 *
 * QSTP staff operate *across* startups. Startup members are confined to their
 * own company. Candidates can only ever see themselves. These are not three
 * points on one role scale; they are different shapes of authority, and
 * flattening them into a single `role` column is how a startup ends up able to
 * read another startup's candidate pool.
 *
 * So `Actor` is a discriminated union. The compiler then forces every
 * permission decision to say which kind it is talking about, and a new
 * capability cannot be added without deciding what each of the three can do.
 */

export type QstpRole =
  /** Full control, including cycle setup and irreversible actions. */
  | 'program_manager'
  /** Day-to-day operations: allocations, exceptions, verification. */
  | 'operations'
  /** Read-only. Auditors, leadership, anyone who should not click things. */
  | 'viewer';

export interface StartupAffiliation {
  readonly startupId: StartupId;
  readonly role: StartupRole;
  readonly status: MemberStatus;
}

export interface QstpActor {
  readonly kind: 'qstp';
  readonly userId: UserId;
  readonly email: string;
  readonly fullName: string;
  readonly role: QstpRole;
}

export interface StartupActor {
  readonly kind: 'startup';
  readonly userId: UserId;
  readonly email: string;
  readonly fullName: string;
  /** Usually one. A person can advise two portfolio companies, so it is a list. */
  readonly affiliations: readonly StartupAffiliation[];
}

export interface CandidateActor {
  readonly kind: 'candidate';
  readonly userId: UserId;
  readonly email: string;
  readonly fullName: string;
  readonly candidateId: CandidateId;
}

export type Actor = QstpActor | StartupActor | CandidateActor;

/** An unauthenticated caller. Distinct from "an actor with no affiliations". */
export const ANONYMOUS = Symbol('anonymous');
export type AnonymousActor = typeof ANONYMOUS;

export type MaybeActor = Actor | AnonymousActor;

export function isAuthenticated(actor: MaybeActor): actor is Actor {
  return actor !== ANONYMOUS;
}

export function isQstp(actor: MaybeActor): actor is QstpActor {
  return isAuthenticated(actor) && actor.kind === 'qstp';
}

export function isStartup(actor: MaybeActor): actor is StartupActor {
  return isAuthenticated(actor) && actor.kind === 'startup';
}

export function isCandidate(actor: MaybeActor): actor is CandidateActor {
  return isAuthenticated(actor) && actor.kind === 'candidate';
}

/** The actor's standing at one startup, or null if they have none. */
export function affiliationWith(
  actor: MaybeActor,
  startupId: StartupId | string,
): StartupAffiliation | null {
  if (!isStartup(actor)) return null;
  return actor.affiliations.find((a) => a.startupId === startupId) ?? null;
}

/** Startups this person can currently act for. Suspended ones are excluded. */
export function activeStartupIds(actor: MaybeActor): StartupId[] {
  if (!isStartup(actor)) return [];
  return actor.affiliations.filter((a) => a.status === 'active').map((a) => a.startupId);
}

/** Which portal this actor belongs in — drives the post-login redirect. */
export function homePortal(actor: MaybeActor): 'qstp' | 'startup' | 'candidate' | 'signin' {
  return isAuthenticated(actor) ? actor.kind : 'signin';
}
