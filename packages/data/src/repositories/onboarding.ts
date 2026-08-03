import { conflict, err, ok } from '@relayflow/core';
import {
  documentEntity,
  documentRequirementTemplateEntity,
  placementEntity,
  placementReadinessBlockers,
  placementRequirementEntity,
  placementSignatureEntity,
  recoveryCaseEntity,
  requirementSubmissionEntity,
  safeFileName,
} from '@relayflow/entities';
import type { DocumentPort, PlacementPort, RequirementPort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { fromPostgrest } from '../errors';
import { run, runMaybe, runSingle } from '../repository';
import { callRpc } from '../transaction';

/** Placements, their document checklists, and the candidate's own paperwork. */

export function placementsRepository(client: RlsClient): PlacementPort {
  return {
    findById: (id) =>
      runMaybe(
        client.from('placements').select('*').eq('id', id).maybeSingle(),
        placementEntity.parse,
        { table: 'placements', placementId: id },
      ),

    listForCycle: (cycleId) =>
      run(
        client.from('placements').select('*').eq('cycle_id', cycleId),
        placementEntity.parseMany,
        { table: 'placements', cycleId },
      ),

    listForCandidate: (candidateId) =>
      run(
        client.from('placements').select('*').eq('candidate_id', candidateId),
        placementEntity.parseMany,
        { table: 'placements', candidateId },
      ),

    confirmSelection: (selectionId, input) =>
      callRpc(
        client,
        'confirm_selection',
        {
          p_selection_id: selectionId,
          p_starts_on: input.startsOn,
          p_ends_on: input.endsOn,
          p_supervisor_name: input.supervisorName,
          p_supervisor_id: input.supervisorId,
        },
        placementEntity.parse,
      ),

    /**
     * `placements_write` is QSTP-only, deliberately: a party that could UPDATE
     * the row could also move its dates. So each party reaches exactly one
     * column, through a function whose guard is which party they actually are
     * rather than which party they name.
     */
    setReadiness: (input) =>
      callRpc(
        client,
        'set_placement_readiness',
        { p_placement_id: input.placementId, p_party: input.party },
        placementEntity.parse,
      ),

    /**
     * Readiness is computed here, in TypeScript, from the same
     * `placementReadinessBlockers` the screens call.
     *
     * The alternative was reimplementing those nine checks in SQL, which would
     * give the disabled button and the rejected write two chances to disagree
     * about why a placement is not ready. The gap between reading the facts and
     * writing the status is real but harmless: readiness is a gate, not a
     * claim, and the next read recomputes it anyway.
     */
    markReady: async (placementId, occurredAt) => {
      const placement = await client
        .from('placements')
        .select('*')
        .eq('id', placementId)
        .maybeSingle();
      if (placement.error) {
        return err(fromPostgrest(placement.error, { table: 'placements', placementId }));
      }
      if (!placement.data) return err(fromPostgrest({ code: 'PGRST116' } as never, { placementId }));
      const current = placementEntity.parse(placement.data);

      const [requirements, conflicts, exceptions] = await Promise.all([
        client
          .from('placement_requirements')
          .select('required, status, title')
          .eq('placement_id', placementId),
        client
          .from('selection_conflicts')
          .select('id')
          .eq('candidate_id', current.candidateId)
          .eq('status', 'open'),
        client
          .from('exception_requests')
          .select('id')
          .eq('cycle_id', current.cycleId)
          .eq('startup_id', current.startupId)
          .eq('status', 'pending'),
      ]);

      const blockers = placementReadinessBlockers({
        active: current.status === 'confirmed',
        requirements: requirements.data ?? [],
        candidateReady: current.candidateReadyAt !== null,
        startupReady: current.startupReadyAt !== null,
        detailsFinal: current.detailsFinalizedAt !== null,
        qstpApproved: current.qstpApprovedAt !== null,
        unresolvedConflict: (conflicts.data ?? []).length > 0,
        unresolvedException: (exceptions.data ?? []).length > 0,
      });
      if (blockers.length > 0) {
        return err(
          conflict(blockers[0] ?? 'Placement is not ready.', { context: { blockers, occurredAt } }),
        );
      }

      return runSingle(
        client
          .from('placements')
          .update({ status: 'ready_to_start' })
          .eq('id', placementId)
          .select('*')
          .single(),
        placementEntity.parse,
        { table: 'placements', placementId },
      );
    },

    onboard: (placementId) =>
      runSingle(
        client
          .from('placements')
          .update({ status: 'onboarded' })
          .eq('id', placementId)
          // Only a ready placement can be onboarded. Expressed as a predicate on
          // the update so the check and the write are the same statement.
          .eq('status', 'ready_to_start')
          .select('*')
          .single(),
        placementEntity.parse,
        { table: 'placements', placementId },
      ),

    /**
     * Cancelling frees hours, so it opens a recovery case in the same
     * transaction — hours freed by a cancellation nobody records are hours the
     * cycle never gets back.
     *
     * `cancel_placement` returns only the placement, and a follow-up read of
     * `recovery_cases` is QSTP-only and would silently return nothing to anyone
     * else. `cancel_placement_with_recovery` returns the pair.
     */
    cancel: (placementId, reason) =>
      callRpc(client, 'cancel_placement_with_recovery', {
        p_placement_id: placementId,
        p_reason: reason,
      }, (value) => {
        const payload = value as { placement: unknown; recoveryCase: unknown };
        return {
          placement: placementEntity.parse(payload.placement),
          recoveryCase: recoveryCaseEntity.parse(payload.recoveryCase),
        };
      }),
  };
}

const SUBMISSION_WITH_FIELDS = '*, requirement_submission_fields(key, label, extracted, confirmed, confidence)';

export function requirementsRepository(client: RlsClient): RequirementPort {
  return {
    listTemplates: (cycleId) =>
      run(
        client.from('document_requirement_templates').select('*').eq('cycle_id', cycleId),
        documentRequirementTemplateEntity.parseMany,
        { table: 'document_requirement_templates', cycleId },
      ),

    saveTemplate: (input) =>
      runSingle(
        client
          .from('document_requirement_templates')
          .insert({
            cycle_id: input.cycleId,
            title: input.title,
            owner: input.owner,
            required: input.required,
            position_id: input.positionId,
            active: input.active,
          })
          .select('*')
          .single(),
        documentRequirementTemplateEntity.parse,
        { table: 'document_requirement_templates', cycleId: input.cycleId },
      ),

    updateTemplate: (id, input) =>
      runSingle(
        client
          .from('document_requirement_templates')
          .update({
            title: input.title,
            owner: input.owner,
            required: input.required,
            active: input.active,
          })
          .eq('id', id)
          .select('*')
          .single(),
        documentRequirementTemplateEntity.parse,
        { table: 'document_requirement_templates', templateId: id },
      ),

    /**
     * Freezes the current templates onto a placement as its own checklist.
     *
     * A snapshot rather than a view, so a template edited later cannot move the
     * goalposts on somebody already mid-onboarding.
     */
    snapshotForPlacement: (placementId) =>
      callRpc(
        client,
        'snapshot_placement_requirements',
        { p_placement_id: placementId },
        (value) => placementRequirementEntity.parseMany(value as readonly unknown[]),
      ),

    listForPlacement: (placementId) =>
      run(
        client.from('placement_requirements').select('*').eq('placement_id', placementId),
        placementRequirementEntity.parseMany,
        { table: 'placement_requirements', placementId },
      ),

    // An amendment to a live checklist is a new row carrying its reason, not an
    // edit — "who added this requirement mid-flight, and why" stays answerable.
    amend: (input) =>
      runSingle(
        client
          .from('placement_requirements')
          .insert({
            placement_id: input.placementId,
            template_id: input.templateId,
            title: input.title,
            owner: input.owner,
            required: input.required,
            status: input.status,
            amendment_reason: input.reason,
          })
          .select('*')
          .single(),
        placementRequirementEntity.parse,
        { table: 'placement_requirements', placementId: input.placementId },
      ),

    submit: (input) =>
      callRpc(
        client,
        'submit_requirement',
        {
          p_requirement_id: input.requirementId,
          p_file_name: input.fileName,
          p_storage_path: storagePathFor(input),
          p_fields: input.extractedFields,
          p_correction_reason: null,
        },
        // The RPC returns the bare submission row; its fields are a child table
        // and were just written from `p_fields`, so they are attached here
        // rather than paid for with a second round trip.
        (value) =>
          requirementSubmissionEntity.parse({
            ...(value as Record<string, unknown>),
            requirement_submission_fields: input.extractedFields.map((field) => ({
              key: field.key,
              label: null,
              extracted: field.extracted,
              confirmed: field.confirmed,
              confidence: null,
            })),
          }),
      ),

    decide: (input) =>
      runSingle(
        client
          .from('placement_requirements')
          .update({
            status: input.decision,
            ...(input.reason === null ? {} : { amendment_reason: input.reason }),
          })
          .eq('id', input.requirementId)
          .select('*')
          .single(),
        placementRequirementEntity.parse,
        { table: 'placement_requirements', requirementId: input.requirementId },
      ),

    listSubmissions: (requirementId) =>
      run(
        client
          .from('requirement_submissions')
          .select(SUBMISSION_WITH_FIELDS)
          .eq('requirement_id', requirementId)
          .order('revision'),
        requirementSubmissionEntity.parseMany,
        { table: 'requirement_submissions', requirementId },
      ),

    sign: (input) =>
      runSingle(
        client
          .from('placement_signatures')
          .insert({
            placement_id: input.placementId,
            kind: input.kind,
            signer_id: input.signerId,
            signer_name: input.signerName,
            declaration_accepted: input.declarationAccepted,
            document_opened_at: input.documentOpenedAt,
            signed_at: input.signedAt,
          })
          .select('*')
          .single(),
        placementSignatureEntity.parse,
        { table: 'placement_signatures', placementId: input.placementId },
      ),

    listSignatures: (placementId) =>
      run(
        client.from('placement_signatures').select('*').eq('placement_id', placementId),
        placementSignatureEntity.parseMany,
        { table: 'placement_signatures', placementId },
      ),
  };
}

/**
 * Where a requirement's file lives.
 *
 * The revision is deliberately not in the path. `submit_requirement` computes
 * it from what is already stored, so the caller cannot know it at the moment
 * the signed URL is minted — and the storage policy in 0014 reads the
 * requirement id out of a fixed position in the folder name, which only works
 * if that position is fixed.
 *
 * So the object store holds the current file and `requirement_submissions`
 * holds every revision as a row. That is the right split: the history a dispute
 * needs is the record of what was submitted and when, and it survives whether
 * or not the bytes of revision one are still around.
 */
function storagePathFor(input: {
  requirementId: string;
  fileName: string;
  storagePath?: string | undefined;
}) {
  return input.storagePath ?? `requirements/${input.requirementId}/${safeFileName(input.fileName)}`;
}

export function documentsRepository(client: RlsClient): DocumentPort {
  const DOCUMENT = '*, candidate_document_fields(key, label, extracted, confirmed, confidence)';

  /** The child table is the document's `fields`; the entity expects them inline. */
  const parseDocument = (value: unknown) => {
    const row = value as Record<string, unknown>;
    const { candidate_document_fields: fields, ...rest } = row;
    return documentEntity.parse({ ...rest, fields: fields ?? [] });
  };
  const parseDocuments = (values: readonly unknown[]) => values.map(parseDocument);

  return {
    findById: (id) =>
      runMaybe(client.from('candidate_documents').select(DOCUMENT).eq('id', id).maybeSingle(), parseDocument, {
        table: 'candidate_documents',
        documentId: id,
      }),

    /**
     * A startup sees the paperwork it issued — an NDA — and never a candidate's
     * national ID or bank statement. The filter is `startup_id`, and RLS says
     * the same thing again underneath.
     */
    listForStartup: (startupId) =>
      run(
        client.from('candidate_documents').select(DOCUMENT).eq('startup_id', startupId),
        parseDocuments,
        { table: 'candidate_documents', startupId },
      ),

    listForCandidate: (candidateId) =>
      run(
        client.from('candidate_documents').select(DOCUMENT).eq('candidate_id', candidateId),
        parseDocuments,
        { table: 'candidate_documents', candidateId },
      ),

    listAwaitingVerification: (cycleId) =>
      run(
        client
          .from('candidate_documents')
          .select(`${DOCUMENT}, candidates!inner(cycle_id)`)
          .eq('candidates.cycle_id', cycleId)
          .eq('status', 'submitted'),
        parseDocuments,
        { table: 'candidate_documents', cycleId },
      ),

    /**
     * Records an upload and parks the document in `extracting`.
     *
     * Unlike the fixtures adapter, nothing here invents extracted fields:
     * extraction is a real pass over a real file now, and it happens
     * afterwards. `recordExtraction` finishes the job, and a document that
     * never gets there stays visibly `extracting` rather than looking done.
     */
    upload: (input) =>
      callRpc(
        client,
        'upload_candidate_document',
        {
          p_document_id: input.documentId,
          p_file_name: input.fileName,
          p_storage_path: input.storagePath,
          p_back_file_name: input.backFileName ?? null,
          p_back_storage_path: input.backStoragePath ?? null,
        },
        (value) => documentEntity.parse({ ...(value as Record<string, unknown>), fields: [] }),
      ),

    recordExtraction: async (input) => {
      const written = await callRpc(
        client,
        'record_document_extraction',
        {
          p_document_id: input.documentId,
          p_fields: input.fields,
          p_failed: input.failed,
        },
        (value) => (value as { id: string }).id,
      );
      if (!written.ok) return written;
      return runSingle(
        client.from('candidate_documents').select(DOCUMENT).eq('id', written.data).single(),
        parseDocument,
        { table: 'candidate_documents', documentId: input.documentId },
      );
    },

    /**
     * `extracted` is never overwritten — the confirmed value sits beside it, so
     * "we read X, they corrected it to Y" stays answerable and the extractor's
     * accuracy stays measurable.
     */
    confirmFields: async (input) => {
      const confirmed = await callRpc(
        client,
        'confirm_document_fields',
        {
          p_document_id: input.documentId,
          p_fields: input.fields.map((field) => ({ key: field.key, value: field.value })),
        },
        (value) => (value as { id: string }).id,
      );
      if (!confirmed.ok) return confirmed;
      return runSingle(
        client.from('candidate_documents').select(DOCUMENT).eq('id', confirmed.data).single(),
        parseDocument,
        { table: 'candidate_documents', documentId: input.documentId },
      );
    },

    verify: (input) =>
      runSingle(
        client
          .from('candidate_documents')
          .update({
            status: input.decision,
            rejection_reason: input.rejectionReason,
            verified_by: input.decision === 'verified' ? input.verifiedBy : null,
            verified_at: input.decision === 'verified' ? input.verifiedAt : null,
          })
          .eq('id', input.documentId)
          // Only a submitted document is QSTP's to judge. Expressed here so the
          // check and the write cannot drift apart.
          .eq('status', 'submitted')
          .select(DOCUMENT)
          .single(),
        parseDocument,
        { table: 'candidate_documents', documentId: input.documentId },
      ),

    prepareUpload: async (input) => {
      const { data, error } = await client.storage
        .from('candidate-documents')
        .createSignedUploadUrl(input.path, { upsert: true });
      if (error) {
        return err(
          conflict('Could not start the upload.', {
            context: { path: input.path, reason: error.message },
          }),
        );
      }
      return ok({ kind: 'signed', path: data.path, token: data.token });
    },

    createDownloadUrl: async (input) => {
      const { data, error } = await client.storage
        .from(input.bucket)
        .createSignedUrl(input.path, input.expiresInSeconds);
      if (error || !data) {
        return err(
          conflict('Could not open that file.', {
            context: { path: input.path, reason: error?.message },
          }),
        );
      }
      return ok(data.signedUrl);
    },
  };
}
