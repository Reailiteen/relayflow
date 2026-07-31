import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  candidateId,
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
 * **One candidate can hold at most one active reservation across the entire
 * cycle.** Two startups interviewing the same person is fine and expected; two
 * startups both believing they hired them is the failure this system exists to
 * prevent.
 *
 * Ties are settled first-come-first-served on `reservedAt`, which is a server
 * timestamp — never a client's clock, because the losing startup will ask, and
 * "your browser said 10:04" is not an answer.
 *
 * Enforcement is layered: the use-case checks before writing, and the database
 * carries a partial unique index on (candidate_id) WHERE status = 'reserved'.
 * Only the second one is actually race-proof, which is why it exists.
 */

export const SELECTION_STATUSES = [
  'reserved', // active claim; blocks everyone else
  'confirmed', // candidate accepted; proceeding to onboarding
  'released', // startup withdrew, or candidate declined
  'lost', // another startup got there first
] as const;

export const selectionStatus = z.enum(SELECTION_STATUSES);
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

/** Statuses that block another startup from claiming the same candidate. */
export function blocksOthers(status: SelectionStatus): boolean {
  return status === 'reserved' || status === 'confirmed';
}

export interface Selection {
  readonly id: SelectionId;
  readonly positionId: PositionId;
  readonly startupId: StartupId;
  readonly candidateId: CandidateId;
  readonly status: SelectionStatus;
  /** Server timestamp. The tiebreaker of record. */
  readonly reservedAt: string;
  readonly confirmedAt: string | null;
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

export const selectCandidateInput = z.object({
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
