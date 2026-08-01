import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  candidateId,
  cycleId,
  positionId,
  selectionId,
  startupId,
  userId,
  type CandidateId,
  type PositionId,
  type SelectionId,
  type StartupId,
  type UserId,
} from '../shared/ids';

/**
 * A startup's claim on a candidate — and the product's sharpest invariant.
 *
 * **One candidate can hold at most one *blocking* claim across the entire
 * cycle.** Two startups interviewing the same person is fine and expected; two
 * startups both believing they hired them is the failure this system exists to
 * prevent.
 *
 * How a claim becomes the blocking one depends on the cycle's selection mode.
 * Under `first_come` the earliest `reservedAt` wins — a server timestamp, never
 * a client's clock, because the losing startup will ask and "your browser said
 * 10:04" is not an answer. Under `candidate_choice` several startups may hold
 * non-blocking `offered` claims at once and the candidate picks one; the
 * invariant is unchanged, because offers do not block.
 *
 * Enforcement is layered: the use-case checks before writing, and the database
 * carries a partial unique index on (candidate_id) WHERE status IN
 * ('reserved','confirmed'). Only the second one is actually race-proof, which
 * is why it exists.
 */

/**
 * How a candidate is won.
 *
 * Set per cycle. Per-position was considered and deferred: it is a superset of
 * this, and a position-level override can default to the cycle's value later
 * without moving the field.
 */
export const SELECTION_MODES = [
  'first_come', // earliest reservation wins; the original behaviour
  'candidate_choice', // several may offer; the candidate decides
] as const;

export const selectionMode = z.enum(SELECTION_MODES);
export type SelectionMode = (typeof SELECTION_MODES)[number];

export const SELECTION_STATUSES = [
  'offered', // non-blocking interest; several may coexist per candidate
  'reserved', // active claim; blocks everyone else
  'accepted', // candidate accepted; awaiting QSTP placement confirmation
  'confirmed', // QSTP confirmed; proceeding to onboarding
  'declined', // the candidate chose someone else
  'released', // startup withdrew, or candidate declined
  'lost', // another startup got there first
  'cancelled', // a previously confirmed placement was cancelled; history retained
] as const;

export const selectionStatus = z.enum(SELECTION_STATUSES);
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

/**
 * Statuses that block another startup from claiming the same candidate.
 *
 * This function *is* the invariant, and adding the two offer statuses did not
 * change it: `offered` is interest, not a commitment, and `declined` is a claim
 * that has lost. Everything that must not double-count a candidate — pool
 * filtering, the board's held-by checks, the reserve guard, and committed hours
 * on the dashboard — asks this rather than listing statuses itself.
 */
export function blocksOthers(status: SelectionStatus): boolean {
  return status === 'reserved' || status === 'accepted' || status === 'confirmed';
}

/** A live offer: made, and not yet accepted, declined or withdrawn. */
export function isOpenOffer(status: SelectionStatus): boolean {
  return status === 'offered';
}

export interface Selection {
  readonly id: SelectionId;
  readonly positionId: PositionId;
  readonly startupId: StartupId;
  readonly candidateId: CandidateId;
  readonly status: SelectionStatus;
  /**
   * When this claim became blocking. Server timestamp, and the tiebreaker of
   * record under `first_come`.
   *
   * A claim that started life as an offer carries the offer's time here until
   * it is accepted, at which point it is restamped. That placeholder is never
   * read while the claim is non-blocking, because every reader filters on
   * `blocksOthers` first.
   */
  readonly reservedAt: string;
  /**
   * When this claim was made as an offer, or null for a direct reservation.
   *
   * This is the ordering used when an offer window closes with no decision —
   * the earliest offer is asked first — so it stays set after acceptance.
   */
  readonly offeredAt: string | null;
  /**
   * When the candidate accepted this offer.
   *
   * Distinct from `reservedAt` on purpose: it is the difference between "this
   * startup got there first" and "this person chose this startup", and QSTP
   * overriding the second is a much heavier act than overriding the first.
   */
  readonly acceptedAt: string | null;
  readonly confirmedAt: string | null;
  /** When the claim stopped being live — released, or declined by the candidate. */
  readonly releasedAt: string | null;
  readonly selectedBy: UserId;
  /**
   * Set when QSTP overrules the first-come rule. Requires a reason: overriding
   * a timestamp-based rule is a judgement call, and it must be defensible to
   * the startup that technically won.
   */
  readonly overrideReason: string | null;
  readonly overriddenBy: UserId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const selectionRow = z.object({
  id: selectionId,
  position_id: positionId,
  startup_id: startupId,
  candidate_id: candidateId,
  status: selectionStatus,
  reserved_at: z.iso.datetime({ offset: true }),
  offered_at: z.iso.datetime({ offset: true }).nullable(),
  accepted_at: z.iso.datetime({ offset: true }).nullable(),
  confirmed_at: z.iso.datetime({ offset: true }).nullable(),
  released_at: z.iso.datetime({ offset: true }).nullable(),
  selected_by: userId,
  override_reason: z.string().nullable(),
  overridden_by: userId.nullable(),
  ...auditColumns,
});

export const selectionEntity = defineEntity({
  name: 'Selection',
  row: selectionRow,
  toDomain: (row): Selection => ({
    id: row.id,
    positionId: row.position_id,
    startupId: row.startup_id,
    candidateId: row.candidate_id,
    status: row.status,
    reservedAt: row.reserved_at,
    offeredAt: row.offered_at,
    acceptedAt: row.accepted_at,
    confirmedAt: row.confirmed_at,
    releasedAt: row.released_at,
    selectedBy: row.selected_by,
    overrideReason: row.override_reason,
    overriddenBy: row.overridden_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

/**
 * Given every claim on one candidate, who holds them.
 *
 * Pure and total so the conflict screen and the reservation use-case cannot
 * disagree about who won — they call this.
 */
export function winner(claims: readonly Selection[]): Selection | null {
  const active = claims.filter((claim) => blocksOthers(claim.status));
  if (active.length === 0) return null;

  // A QSTP override outranks the clock, by design.
  const overridden = active.find((claim) => claim.overrideReason !== null);
  if (overridden) return overridden;

  return active.reduce((earliest, claim) =>
    claim.reservedAt < earliest.reservedAt ? claim : earliest,
  );
}

/** Claims that exist but did not win — what the conflict screen needs to show. */
export function contenders(claims: readonly Selection[]): Selection[] {
  const held = winner(claims);
  return claims.filter((claim) => claim.id !== held?.id && blocksOthers(claim.status));
}

export function hasConflict(claims: readonly Selection[]): boolean {
  return contenders(claims).length > 0;
}

/** Live offers on a candidate, earliest first — the order the fallback walks. */
export function openOffers(claims: readonly Selection[]): Selection[] {
  return claims
    .filter((claim) => isOpenOffer(claim.status))
    .sort((a, b) => (a.offeredAt ?? a.reservedAt).localeCompare(b.offeredAt ?? b.reservedAt));
}

/** The offer this candidate accepted, if they have chosen. */
export function acceptedOffer(claims: readonly Selection[]): Selection | null {
  return claims.find((claim) => claim.acceptedAt !== null && blocksOthers(claim.status)) ?? null;
}

/**
 * Who holds this candidate, under the mode the cycle is running.
 *
 * Both modes agree whenever a claim is already blocking — they have to, because
 * the unique index permits only one. What the dispatcher buys is that callers
 * must *say* which mode they are in, and that `candidate_choice` refuses to
 * settle ties by the clock: if two blocking claims somehow exist there, the
 * candidate's accepted one wins, not whichever was written first. Falling back
 * to first-come silently would be the bug this function exists to prevent.
 *
 * While a candidate is deciding, every claim is an offer and nothing blocks, so
 * this returns null. `openOffers` is what tells you the difference between "no
 * one wants them" and "three startups are waiting on an answer".
 */
export function resolve(mode: SelectionMode, claims: readonly Selection[]): Selection | null {
  if (mode === 'first_come') return winner(claims);

  // A QSTP override outranks the candidate's own choice — deliberately, and
  // only ever as an exception that has to be justified in writing.
  const active = claims.filter((claim) => blocksOthers(claim.status));
  const overridden = active.find((claim) => claim.overrideReason !== null);
  if (overridden) return overridden;

  return acceptedOffer(claims) ?? active[0] ?? null;
}

export const selectCandidateInput = z.object({
  cycleId: cycleId.optional(),
  positionId,
  candidateId,
});

export type SelectCandidateInput = z.infer<typeof selectCandidateInput>;

export const resolveConflictInput = z.object({
  selectionId,
  /** Which claim QSTP is awarding the candidate to. */
  awardTo: startupId,
  reason: z.string().trim().min(1, 'Record why this overrides the timestamp.').max(2000),
});

export type ResolveConflictInput = z.infer<typeof resolveConflictInput>;

/**
 * The candidate accepting one of their offers.
 *
 * Only the selection id: which candidate this belongs to is read from the
 * actor, never from input, so accepting on someone else's behalf is not
 * expressible rather than merely refused.
 */
export const acceptOfferInput = z.object({
  selectionId,
});

export type AcceptOfferInput = z.infer<typeof acceptOfferInput>;
