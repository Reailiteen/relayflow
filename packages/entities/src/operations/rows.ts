import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  activityEventId,
  candidateId,
  cycleId,
  participationId,
  placementId,
  positionId,
  recoveryCaseId,
  redistributionRoundId,
  startupId,
  taskAssignmentId,
  taskTemplateId,
  userId,
} from '../shared/ids';
import { HOUR_TIERS } from '../allocation/hours';
import type {
  ActivityEvent,
  CycleParticipation,
  JsonValue,
  RecoveryCase,
  RedistributionRound,
  TaskAssignment,
  TaskTemplate,
} from './operations';

/**
 * Row schemas for the operational tables — audit, participation, tasks, and
 * the recovery machinery.
 *
 * Three of these tables deliberately lack `updated_at`, and the reasons differ:
 * an activity event is an append-only fact, a task template is authored once,
 * and a redistribution round tracks its own lifecycle through `closed_at`.
 * `auditColumns` is spread only where both columns actually exist — 0013 had to
 * drop a trigger that assumed otherwise.
 */

const timestamp = z.iso.datetime({ offset: true });

/** jsonb, which is genuinely arbitrary: the audit log stores whole rows. */
const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);

const hourTier = z.union(
  HOUR_TIERS.map((tier) => z.literal(tier)) as unknown as [
    z.ZodLiteral<60>,
    z.ZodLiteral<40>,
    z.ZodLiteral<30>,
    z.ZodLiteral<20>,
    z.ZodLiteral<0>,
  ],
);

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const activityEventRow = z.object({
  id: activityEventId,
  cycle_id: cycleId,
  entity_type: z.string(),
  entity_id: z.uuid(),
  action: z.string(),
  actor_id: userId.nullable(),
  actor_role: z.enum([
    'program_manager',
    'operations',
    'viewer',
    'owner',
    'member',
    'supervisor',
    'candidate',
    'system',
  ]),
  before: json.nullable(),
  after: json.nullable(),
  reason: z.string().nullable(),
  occurred_at: timestamp,
});

export const activityEventEntity = defineEntity({
  name: 'ActivityEvent',
  row: activityEventRow,
  toDomain: (row): ActivityEvent => ({
    id: row.id,
    cycleId: row.cycle_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    before: row.before,
    after: row.after,
    reason: row.reason,
    occurredAt: row.occurred_at,
  }),
});

// ---------------------------------------------------------------------------
// Participation
// ---------------------------------------------------------------------------

export const cycleParticipationRow = z.object({
  id: participationId,
  cycle_id: cycleId,
  startup_id: startupId,
  status: z.enum(['invited', 'accepted', 'declined', 'suspended', 'archived']),
  requested_total_hours: z.number().int().min(0),
  requested_intern_count: z.number().int().min(0),
  disciplines: z.array(z.string()),
  operator_score: z.number().min(0).max(100).nullable(),
  internal_notes: z.string().nullable(),
  startup_justification: z.string().nullable(),
  allocation_acknowledged_at: timestamp.nullable(),
  allocation_acknowledged_by: userId.nullable(),
  ...auditColumns,
});

export const cycleParticipationEntity = defineEntity({
  name: 'CycleParticipation',
  row: cycleParticipationRow,
  toDomain: (row): CycleParticipation => ({
    id: row.id,
    cycleId: row.cycle_id,
    startupId: row.startup_id,
    status: row.status,
    requestedTotalHours: row.requested_total_hours,
    requestedInternCount: row.requested_intern_count,
    disciplines: row.disciplines,
    operatorScore: row.operator_score,
    internalNotes: row.internal_notes,
    startupJustification: row.startup_justification,
    allocationAcknowledgedAt: row.allocation_acknowledged_at,
    allocationAcknowledgedBy: row.allocation_acknowledged_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

// ---------------------------------------------------------------------------
// Candidate tasks
// ---------------------------------------------------------------------------

export const taskTemplateRow = z.object({
  id: taskTemplateId,
  cycle_id: cycleId,
  position_id: positionId,
  title: z.string(),
  instructions: z.string(),
  created_by: userId,
  created_at: timestamp,
});

export const taskTemplateEntity = defineEntity({
  name: 'TaskTemplate',
  row: taskTemplateRow,
  toDomain: (row): TaskTemplate => ({
    id: row.id,
    cycleId: row.cycle_id,
    positionId: row.position_id,
    title: row.title,
    instructions: row.instructions,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }),
});

export const taskAssignmentRow = z.object({
  id: taskAssignmentId,
  cycle_id: cycleId,
  template_id: taskTemplateId.nullable(),
  position_id: positionId,
  candidate_id: candidateId,
  status: z.enum(['assigned', 'submitted', 'reviewed', 'withdrawn']),
  due_at: timestamp,
  submitted_at: timestamp.nullable(),
  late_accepted: z.boolean(),
  file_name: z.string().nullable(),
  link_url: z.string().nullable(),
  review_notes: z.string().nullable(),
  reviewed_by: userId.nullable(),
  ...auditColumns,
});

export const taskAssignmentEntity = defineEntity({
  name: 'TaskAssignment',
  row: taskAssignmentRow,
  toDomain: (row): TaskAssignment => ({
    id: row.id,
    cycleId: row.cycle_id,
    templateId: row.template_id,
    positionId: row.position_id,
    candidateId: row.candidate_id,
    status: row.status,
    dueAt: row.due_at,
    submittedAt: row.submitted_at,
    lateAccepted: row.late_accepted,
    fileName: row.file_name,
    linkUrl: row.link_url,
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

// ---------------------------------------------------------------------------
// Recovery and redistribution
// ---------------------------------------------------------------------------

export const recoveryCaseRow = z.object({
  id: recoveryCaseId,
  cycle_id: cycleId,
  startup_id: startupId,
  placement_id: placementId.nullable(),
  recoverable_hours: z.number().int().min(0),
  status: z.enum([
    'potential',
    'exception_protected',
    'confirmed',
    'recovered',
    'replacement_protected',
    'closed',
  ]),
  protected_until: timestamp.nullable(),
  reason: z.string(),
  confirmed_by: userId.nullable(),
  redistribution_round_id: redistributionRoundId.nullable(),
  ...auditColumns,
});

export const recoveryCaseEntity = defineEntity({
  name: 'RecoveryCase',
  row: recoveryCaseRow,
  toDomain: (row): RecoveryCase => ({
    id: row.id,
    cycleId: row.cycle_id,
    startupId: row.startup_id,
    placementId: row.placement_id,
    recoverableHours: row.recoverable_hours,
    status: row.status,
    protectedUntil: row.protected_until,
    reason: row.reason,
    confirmedBy: row.confirmed_by,
    redistributionRoundId: row.redistribution_round_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

/**
 * A round with its invitations embedded.
 *
 * `RedistributionRound.invitations` is part of the domain object because every
 * screen that shows a round shows who was asked and what they said — a round
 * without them is a header with no content. So they arrive in the same read
 * (`select=*,redistribution_invitations(*)`) rather than as a second query the
 * caller could forget.
 */
const redistributionInvitation = z.object({
  startup_id: startupId,
  status: z.enum(['invited', 'accepted', 'declined', 'expired']),
  proposed_hours: hourTier,
  responded_at: timestamp.nullable(),
});

export const redistributionRoundRow = z.object({
  id: redistributionRoundId,
  cycle_id: cycleId,
  number: z.number().int().min(1),
  status: z.enum([
    'draft',
    'invitations',
    'accelerated_positions',
    'accelerated_selection',
    'closed',
    'cancelled',
  ]),
  available_hours: z.number().int().min(0),
  position_deadline: timestamp,
  selection_deadline: timestamp,
  created_by: userId,
  created_at: timestamp,
  closed_at: timestamp.nullable(),
  redistribution_invitations: z.array(redistributionInvitation).default([]),
});

export const redistributionRoundEntity = defineEntity({
  name: 'RedistributionRound',
  row: redistributionRoundRow,
  toDomain: (row): RedistributionRound => ({
    id: row.id,
    cycleId: row.cycle_id,
    number: row.number,
    status: row.status,
    availableHours: row.available_hours,
    invitations: row.redistribution_invitations.map((invitation) => ({
      startupId: invitation.startup_id,
      status: invitation.status,
      proposedHours: invitation.proposed_hours,
      respondedAt: invitation.responded_at,
    })),
    positionDeadline: row.position_deadline,
    selectionDeadline: row.selection_deadline,
    createdBy: row.created_by,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  }),
});
