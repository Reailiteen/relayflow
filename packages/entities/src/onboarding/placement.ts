import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  candidateId,
  cycleId,
  placementId,
  placementRequirementId,
  positionId,
  requirementTemplateId,
  selectionId,
  signatureId,
  startupId,
  submissionId,
  userId,
} from '../shared/ids';
import type {
  DocumentRequirementTemplate,
  Placement,
  PlacementRequirement,
  PlacementSignature,
  RequirementSubmission,
} from '../operations/operations';

/**
 * Row schemas for the onboarding tables.
 *
 * The domain types live in `../operations/operations` alongside the rules that
 * read them; what is here is only the translation between a Postgres row and
 * one of those types. Kept separate so the rules file stays free of column
 * names, and so a migration that renames a column breaks in one place.
 *
 * Read `auditColumns` usage carefully. `requirement_submissions` and
 * `placement_signatures` have no `updated_at` — a submission is a revision and
 * a signature is an event, and neither is a thing you edit. Spreading
 * `auditColumns` onto them would make every parse throw at runtime.
 */

const placementStatus = z.enum(['confirmed', 'ready_to_start', 'onboarded', 'cancelled']);
const requirementOwner = z.enum(['candidate', 'startup', 'qstp']);
const requirementStatus = z.enum([
  'requested',
  'awaiting_upload',
  'uploaded',
  'under_review',
  'correction_requested',
  'resubmitted',
  'approved',
  'rejected',
  'expired',
  'waived',
]);
const signatureKind = z.enum(['qstp_agreement', 'startup_agreement', 'candidate_agreement']);

const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date();

export const placementRow = z.object({
  id: placementId,
  cycle_id: cycleId,
  selection_id: selectionId,
  candidate_id: candidateId,
  startup_id: startupId,
  position_id: positionId,
  committed_weekly_hours: z.number().int().min(0),
  starts_on: date,
  ends_on: date,
  supervisor_id: userId.nullable(),
  supervisor_name: z.string(),
  status: placementStatus,
  candidate_ready_at: timestamp.nullable(),
  startup_ready_at: timestamp.nullable(),
  details_finalized_at: timestamp.nullable(),
  qstp_approved_at: timestamp.nullable(),
  cancelled_at: timestamp.nullable(),
  cancellation_reason: z.string().nullable(),
  replacement_for_placement_id: placementId.nullable(),
  ...auditColumns,
});

export const placementEntity = defineEntity({
  name: 'Placement',
  row: placementRow,
  toDomain: (row): Placement => ({
    id: row.id,
    cycleId: row.cycle_id,
    selectionId: row.selection_id,
    candidateId: row.candidate_id,
    startupId: row.startup_id,
    positionId: row.position_id,
    committedWeeklyHours: row.committed_weekly_hours,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    supervisorId: row.supervisor_id,
    supervisorName: row.supervisor_name,
    status: row.status,
    candidateReadyAt: row.candidate_ready_at,
    startupReadyAt: row.startup_ready_at,
    detailsFinalizedAt: row.details_finalized_at,
    qstpApprovedAt: row.qstp_approved_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    replacementForPlacementId: row.replacement_for_placement_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const documentRequirementTemplateRow = z.object({
  id: requirementTemplateId,
  cycle_id: cycleId,
  title: z.string(),
  owner: requirementOwner,
  required: z.boolean(),
  position_id: positionId.nullable(),
  active: z.boolean(),
  ...auditColumns,
});

export const documentRequirementTemplateEntity = defineEntity({
  name: 'DocumentRequirementTemplate',
  row: documentRequirementTemplateRow,
  toDomain: (row): DocumentRequirementTemplate => ({
    id: row.id,
    cycleId: row.cycle_id,
    title: row.title,
    owner: row.owner,
    required: row.required,
    positionId: row.position_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const placementRequirementRow = z.object({
  id: placementRequirementId,
  placement_id: placementId,
  template_id: requirementTemplateId.nullable(),
  title: z.string(),
  owner: requirementOwner,
  required: z.boolean(),
  status: requirementStatus,
  amendment_reason: z.string().nullable(),
  ...auditColumns,
});

export const placementRequirementEntity = defineEntity({
  name: 'PlacementRequirement',
  row: placementRequirementRow,
  toDomain: (row): PlacementRequirement => ({
    id: row.id,
    placementId: row.placement_id,
    templateId: row.template_id,
    title: row.title,
    owner: row.owner,
    required: row.required,
    status: row.status,
    amendmentReason: row.amendment_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

/**
 * A submission and the fields extracted from it.
 *
 * The fields arrive embedded (`select=*,requirement_submission_fields(*)`)
 * rather than as a second query. They are the reason the submission exists —
 * an IBAN read off a bank letter — and fetching them separately would make a
 * half-loaded submission a state the UI could render.
 */
const submissionField = z.object({
  key: z.string(),
  label: z.string().nullable(),
  extracted: z.string().nullable(),
  confirmed: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export const requirementSubmissionRow = z.object({
  id: submissionId,
  requirement_id: placementRequirementId,
  revision: z.number().int().min(1),
  file_name: z.string(),
  storage_path: z.string(),
  submitted_by: userId,
  submitted_at: timestamp,
  correction_reason: z.string().nullable(),
  requirement_submission_fields: z.array(submissionField).default([]),
});

export const requirementSubmissionEntity = defineEntity({
  name: 'RequirementSubmission',
  row: requirementSubmissionRow,
  toDomain: (row): RequirementSubmission => ({
    id: row.id,
    requirementId: row.requirement_id,
    revision: row.revision,
    fileName: row.file_name,
    storagePath: row.storage_path,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    extractedFields: row.requirement_submission_fields.map((field) => ({
      key: field.key,
      extracted: field.extracted,
      confirmed: field.confirmed,
    })),
    correctionReason: row.correction_reason,
  }),
});

export const placementSignatureRow = z.object({
  id: signatureId,
  placement_id: placementId,
  kind: signatureKind,
  signer_id: userId,
  signer_name: z.string(),
  declaration_accepted: z.boolean(),
  document_opened_at: timestamp,
  signed_at: timestamp,
});

export const placementSignatureEntity = defineEntity({
  name: 'PlacementSignature',
  row: placementSignatureRow,
  toDomain: (row): PlacementSignature => ({
    id: row.id,
    placementId: row.placement_id,
    kind: row.kind,
    signerId: row.signer_id,
    signerName: row.signer_name,
    declarationAccepted: row.declaration_accepted,
    documentOpenedAt: row.document_opened_at,
    signedAt: row.signed_at,
  }),
});
