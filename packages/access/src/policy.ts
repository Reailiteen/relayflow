import { forbidden, unauthenticated, type Result, ok, err } from '@relayflow/core';
import type { CandidateId, StartupId } from '@relayflow/entities';
import {
  CANDIDATE_CAPABILITIES,
  QSTP_CAPABILITIES,
  STARTUP_CAPABILITIES,
  type Capability,
} from './capabilities';
import { affiliationWith, isAuthenticated, type MaybeActor } from './actor';

/**
 * The decision function. Pure, synchronous, total.
 *
 * Given the same actor and the same query it always returns the same answer, so
 * the whole authorization surface is unit-testable without a database — and the
 * screen that decides whether to render a button calls exactly the same code as
 * the use-case that will refuse it.
 */

/**
 * "Somewhere" — for the first of a two-step check.
 *
 * Some actions cannot name their startup until data has been loaded: selecting
 * a candidate is scoped to whichever startup owns the position, which is only
 * known after fetching it. Those use-cases gate coarsely on ANY_STARTUP first,
 * then re-authorize with the real id once they have it.
 *
 * It is deliberately explicit. An *omitted* startupId is treated as a denial,
 * so forgetting to scope a check fails closed rather than silently permitting
 * every tenant.
 */
export const ANY_STARTUP = 'any' as const;
export type AnyStartup = typeof ANY_STARTUP;

export interface AccessQuery {
  readonly capability: Capability;
  /**
   * The startup this action targets. Required whenever the capability is
   * startup-scoped: without it, a startup member holding `position:submit`
   * would be able to submit against anyone's allocation.
   *
   * Pass ANY_STARTUP only as the first half of a two-step check.
   */
  readonly startupId?: StartupId | AnyStartup;
  /** The candidate this action targets, for candidate-scoped capabilities. */
  readonly candidateId?: CandidateId;
}

export type DenialReason =
  | 'unauthenticated'
  | 'wrong_portal' // right person, wrong kind of account for this action
  | 'not_affiliated' // startup member, but not with *that* startup
  | 'suspended'
  | 'not_self' // candidate reaching for another candidate's record
  | 'missing_capability';

export type Decision = { allowed: true } | { allowed: false; reason: DenialReason };

const ALLOW: Decision = { allowed: true };
const deny = (reason: DenialReason): Decision => ({ allowed: false, reason });

export function decide(actor: MaybeActor, query: AccessQuery): Decision {
  if (!isAuthenticated(actor)) return deny('unauthenticated');

  switch (actor.kind) {
    case 'qstp': {
      const granted = QSTP_CAPABILITIES[actor.role] ?? [];
      return granted.includes(query.capability) ? ALLOW : deny('missing_capability');
    }

    case 'startup': {
      // Startup-scoped work must name its startup. Treating a missing id as
      // "any startup" is precisely the bug this guard exists to prevent.
      if (query.startupId === undefined) return deny('missing_capability');

      // Coarse first pass: does this capability hold at *any* startup they are
      // actively affiliated with? The caller must still re-check with the real
      // id before writing anything.
      if (query.startupId === ANY_STARTUP) {
        const anywhere = actor.affiliations.some(
          (a) =>
            a.status === 'active' &&
            (STARTUP_CAPABILITIES[a.role] ?? []).includes(query.capability),
        );
        return anywhere ? ALLOW : deny('missing_capability');
      }

      const affiliation = affiliationWith(actor, query.startupId);
      if (!affiliation) return deny('not_affiliated');
      if (affiliation.status !== 'active') return deny('suspended');

      const granted = STARTUP_CAPABILITIES[affiliation.role] ?? [];
      return granted.includes(query.capability) ? ALLOW : deny('missing_capability');
    }

    case 'candidate': {
      if (!CANDIDATE_CAPABILITIES.includes(query.capability)) {
        return deny('missing_capability');
      }
      // A candidate may only ever act on their own record.
      if (query.candidateId !== undefined && query.candidateId !== actor.candidateId) {
        return deny('not_self');
      }
      return ALLOW;
    }
  }
}

/** Boolean form, for rendering UI affordances. */
export function can(actor: MaybeActor, query: AccessQuery): boolean {
  return decide(actor, query).allowed;
}

/**
 * Result form, for use-cases.
 *
 * Note what the messages do and do not say. A denial never confirms that the
 * other startup, candidate or record exists — a startup probing for a rival's
 * position id gets the same answer whether or not it is real.
 */
export function authorize(actor: MaybeActor, query: AccessQuery): Result<void> {
  const decision = decide(actor, query);
  if (decision.allowed) return ok(undefined);

  const context = {
    capability: query.capability,
    startupId: query.startupId,
    candidateId: query.candidateId,
    reason: decision.reason,
  };

  switch (decision.reason) {
    case 'unauthenticated':
      return err(unauthenticated(undefined, { context }));
    case 'suspended':
      return err(forbidden('Your access to this workspace is suspended.', { context }));
    case 'not_affiliated':
    case 'not_self':
    case 'wrong_portal':
    case 'missing_capability':
      return err(forbidden('You do not have permission to do this.', { context }));
  }
}
