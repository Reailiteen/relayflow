import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  candidateId,
  documentId,
  startupId,
  userId,
  type CandidateId,
  type DocumentId,
  type StartupId,
  type UserId,
} from '../shared/ids';

/**
 * Onboarding paperwork: IDs, bank details, contracts, NDAs.
 *
 * Two things drive this model. First, these are the most sensitive records in
 * the system — a national ID and an IBAN — so extracted values are kept as
 * discrete, individually-verifiable fields rather than a blob, and are never
 * logged. Second, OCR is a *suggestion*: the candidate confirms or corrects
 * every field before QSTP ever sees it, because an unreviewed OCR digit in an
 * IBAN means a salary lands in someone else's account.
 */

export const DOCUMENT_KINDS = [
  'national_id',
  'passport',
  'bank_statement',
  'qstp_contract',
  'startup_nda',
  'other',
] as const;
export const documentKind = z.enum(DOCUMENT_KINDS);
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = [
  'requested', // asked for, not uploaded
  'uploaded',
  'extracting', // OCR running
  'awaiting_candidate_review', // OCR done; candidate must confirm the fields
  'submitted', // candidate confirmed; waiting on QSTP
  'verified',
  'rejected', // QSTP found a problem; see rejectionReason
] as const;
export const documentStatus = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Kinds that need both sides before anybody can read them. */
export function isTwoSided(kind: DocumentKind): boolean {
  return kind === 'national_id';
}

/** Whether the candidate still has something to do with this document. */
export function needsCandidateAction(status: DocumentStatus): boolean {
  return status === 'requested' || status === 'awaiting_candidate_review' || status === 'rejected';
}

export function needsQstpAction(status: DocumentStatus): boolean {
  return status === 'submitted';
}

/**
 * One field OCR pulled out, alongside what the candidate says it should be.
 *
 * Keeping `extracted` and `confirmed` separate — rather than overwriting — is
 * what makes it possible to show "we read X, you corrected it to Y", and to
 * measure how often the OCR is wrong.
 */
export interface ExtractedField {
  readonly key: string;
  readonly label: string;
  readonly extracted: string | null;
  readonly confirmed: string | null;
  /** OCR confidence 0–1. Low values should be surfaced, not silently trusted. */
  readonly confidence: number | null;
}

const extractedField = z.object({
  key: z.string().max(60),
  label: z.string().max(120),
  extracted: z.string().max(500).nullable(),
  confirmed: z.string().max(500).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

/** Fields the candidate has not yet confirmed — what the review screen lists. */
export function unconfirmedFields(fields: readonly ExtractedField[]): ExtractedField[] {
  return fields.filter((field) => field.confirmed === null);
}

/** Fields OCR was unsure about, so the UI can draw attention before submission. */
export function lowConfidenceFields(
  fields: readonly ExtractedField[],
  threshold = 0.8,
): ExtractedField[] {
  return fields.filter((field) => field.confidence !== null && field.confidence < threshold);
}

export interface CandidateDocument {
  readonly id: DocumentId;
  readonly candidateId: CandidateId;
  /** Set for startup-specific paperwork such as an NDA. */
  readonly startupId: StartupId | null;
  readonly kind: DocumentKind;
  readonly status: DocumentStatus;
  readonly fileName: string | null;
  readonly storagePath: string | null;
  /**
   * The reverse side, for kinds that have one.
   *
   * A Qatari ID is unreadable from one side — the number is on the front and
   * the expiry on the back — so it is one document with two images rather than
   * two documents that can drift apart, one verified and one not.
   */
  readonly backFileName: string | null;
  readonly backStoragePath: string | null;
  readonly fields: readonly ExtractedField[];
  readonly rejectionReason: string | null;
  readonly verifiedBy: UserId | null;
  readonly verifiedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const documentRow = z.object({
  id: documentId,
  candidate_id: candidateId,
  startup_id: startupId.nullable(),
  kind: documentKind,
  status: documentStatus,
  file_name: z.string().max(300).nullable(),
  storage_path: z.string().max(500).nullable(),
  back_file_name: z.string().max(300).nullable().default(null),
  back_storage_path: z.string().max(500).nullable().default(null),
  fields: z.array(extractedField),
  rejection_reason: z.string().nullable(),
  verified_by: userId.nullable(),
  verified_at: z.iso.datetime({ offset: true }).nullable(),
  ...auditColumns,
});

export const documentEntity = defineEntity({
  name: 'CandidateDocument',
  row: documentRow,
  toDomain: (row): CandidateDocument => ({
    id: row.id,
    candidateId: row.candidate_id,
    startupId: row.startup_id,
    kind: row.kind,
    status: row.status,
    fileName: row.file_name,
    storagePath: row.storage_path,
    backFileName: row.back_file_name,
    backStoragePath: row.back_storage_path,
    fields: row.fields,
    rejectionReason: row.rejection_reason,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

/**
 * A filename reduced to something safe to put in a storage path.
 *
 * Anything with a slash, a backslash or a leading dot can climb out of the
 * folder the storage policy is written against — and that policy is the only
 * thing standing between one candidate's passport and another's. Everything
 * outside a conservative allowlist becomes a hyphen, which occasionally makes
 * for an ugly filename and never for a path traversal.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'upload';
}

/**
 * Where a candidate's document lives in storage.
 *
 * Computed from ids the server already holds, never taken from the client. The
 * browser sends a filename; if it also chose the folder, a candidate could
 * write into somebody else's — and the storage policy matches on
 * `(storage.foldername(name))[2]` being their own candidate id, so the path IS
 * the authorization.
 *
 * The document id is in the path so re-uploading the same filename for a
 * different document does not collide.
 */
export function documentStoragePath(
  candidate: CandidateId,
  document: DocumentId,
  fileName: string,
  side: 'front' | 'back' = 'front',
): string {
  const name = safeFileName(fileName);
  return `candidates/${candidate}/${document}/${side === 'back' ? 'back-' : ''}${name}`;
}

export const confirmFieldsInput = z.object({
  documentId,
  fields: z
    .array(z.object({ key: z.string().max(60), value: z.string().trim().min(1).max(500) }))
    .min(1, 'Confirm at least one field.'),
});

export type ConfirmFieldsInput = z.infer<typeof confirmFieldsInput>;

export const verifyDocumentInput = z
  .object({
    documentId,
    decision: z.enum(['verified', 'rejected']),
    rejectionReason: z.string().trim().max(1000).nullable().default(null),
  })
  .refine((i) => i.decision === 'verified' || !!i.rejectionReason?.trim(), {
    // "Rejected" with no reason sends the candidate back with nothing to act on.
    message: 'Say what needs fixing.',
    path: ['rejectionReason'],
  });

export type VerifyDocumentInput = z.infer<typeof verifyDocumentInput>;
