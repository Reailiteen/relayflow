import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  candidateId,
  cycleId,
  fallbackCaseId,
  selectionConflictId,
  selectionId,
  startupId,
  userId,
} from '../shared/ids';
import type { CandidateChoiceFallback, SelectionConflict } from '../operations/operations';

/**
 * Row schemas for the two records that exist because selection can go wrong.
 *
 * Neither table carries `updated_at`: a conflict is opened once and resolved
 * once, and the pair of timestamps it does carry — `created_at`, `resolved_at`
 * — say more than a third would.
 */

const timestamp = z.iso.datetime({ offset: true });

export const selectionConflictRow = z.object({
  id: selectionConflictId,
  cycle_id: cycleId,
  candidate_id: candidateId,
  attempted_selection_id: selectionId.nullable(),
  blocking_selection_id: selectionId,
  status: z.enum(['open', 'dismissed', 'overridden']),
  previous_startup_id: startupId,
  requested_startup_id: startupId,
  resolved_by: userId.nullable(),
  reason: z.string().nullable(),
  created_at: timestamp,
  resolved_at: timestamp.nullable(),
});

export const selectionConflictEntity = defineEntity({
  name: 'SelectionConflict',
  row: selectionConflictRow,
  toDomain: (row): SelectionConflict => ({
    id: row.id,
    cycleId: row.cycle_id,
    candidateId: row.candidate_id,
    attemptedSelectionId: row.attempted_selection_id,
    blockingSelectionId: row.blocking_selection_id,
    status: row.status,
    previousStartupId: row.previous_startup_id,
    requestedStartupId: row.requested_startup_id,
    resolvedBy: row.resolved_by,
    reason: row.reason,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }),
});

/**
 * The ordered offer list arrives embedded, and the order is data.
 *
 * `fallback_offers` carries an explicit `position` ordinal rather than relying
 * on insertion order, because the whole mechanism is "ask the earliest offer
 * first" and a list whose order depends on when rows happened to be written is
 * a list nobody can defend to the startup that came second. Sorting here rather
 * than trusting PostgREST's row order is the same argument one layer up.
 */
const fallbackOffer = z.object({
  selection_id: selectionId,
  position: z.number().int().min(0),
});

export const candidateChoiceFallbackRow = z.object({
  id: fallbackCaseId,
  cycle_id: cycleId,
  candidate_id: candidateId,
  current_offer_index: z.number().int().min(0),
  response_deadline: timestamp,
  status: z.enum(['open', 'accepted', 'exhausted', 'overridden']),
  opened_by: userId,
  resolved_by: userId.nullable(),
  reason: z.string().nullable(),
  fallback_offers: z.array(fallbackOffer).default([]),
  ...auditColumns,
});

export const candidateChoiceFallbackEntity = defineEntity({
  name: 'CandidateChoiceFallback',
  row: candidateChoiceFallbackRow,
  toDomain: (row): CandidateChoiceFallback => ({
    id: row.id,
    cycleId: row.cycle_id,
    candidateId: row.candidate_id,
    orderedOfferIds: [...row.fallback_offers]
      .sort((a, b) => a.position - b.position)
      .map((offer) => offer.selection_id),
    currentOfferIndex: row.current_offer_index,
    responseDeadline: row.response_deadline,
    status: row.status,
    openedBy: row.opened_by,
    resolvedBy: row.resolved_by,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});
