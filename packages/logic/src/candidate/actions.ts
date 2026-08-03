import { z } from 'zod';
import { conflict, err, forbidden, notFound, ok, validation } from '@relayflow/core';
import { isCandidate } from '@relayflow/access';
import {
  confirmAvailabilityInput,
  confirmFieldsInput,
  documentId,
  documentStoragePath,
  unconfirmedFields,
} from '@relayflow/entities';
import { defineUseCase } from '../use-case';

/**
 * The three things a candidate can actually do.
 *
 * Each one re-derives the candidate from the verified actor and checks that the
 * record being touched belongs to them. The capability check already covers it,
 * but this is the layer where a mistake exposes somebody's ID document, so the
 * ownership test is written out rather than assumed.
 */

/**
 * "Am I still available?" — the single highest-value question in the product.
 *
 * The brief names startups interviewing people who took another job weeks ago
 * as one of the biggest sources of waste. This is the answer to it, and it is
 * deliberately the easiest thing in the whole system to do: one screen, four
 * buttons, no login flow beyond the emailed link.
 */
export const confirmAvailability = defineUseCase({
  name: 'candidate.confirmAvailability',
  input: confirmAvailabilityInput,
  authorize: { capability: 'candidate:confirm_availability' as const },

  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) return err(forbidden('Only a candidate can do this.'));
    const candidateId = ctx.actor.candidateId;

    const current = await ctx.repos.candidates.findById(candidateId);
    if (!current.ok) return current;
    if (!current.data) return err(notFound('Candidate record not found.'));
    if (current.data.cycleId !== input.cycleId) {
      return err(notFound('Candidate record not found.'));
    }

    // Someone already placed cannot quietly mark themselves available again —
    // that would leave a startup holding a reservation on a person the system
    // is simultaneously offering to others.
    if (current.data.availability === 'placed') {
      return err(
        conflict(
          'You have already been placed for this cycle. Contact QSTP if something has changed.',
        ),
      );
    }

    const updated = await ctx.repos.candidates.setAvailability(
      candidateId,
      input.status,
      ctx.clock.now().toISOString(),
    );
    if (!updated.ok) return updated;

    if (input.status !== 'available') {
      const pool = await ctx.repos.candidates.listPoolForCycle(input.cycleId);
      if (!pool.ok) return pool;
      for (const row of pool.data) {
        if (row.candidate.id !== candidateId || row.entry.status === 'withdrawn') continue;
        const withdrawn = await ctx.repos.candidates.updatePoolEntry({
          poolEntryId: row.entry.id,
          status: 'withdrawn',
          reviewedAt: ctx.clock.now().toISOString(),
        });
        if (!withdrawn.ok) return withdrawn;
      }
    }

    await ctx.repos.activity.append({
      cycleId: input.cycleId,
      entityType: 'candidate',
      entityId: candidateId,
      action: 'availability_confirmed',
      actorId: ctx.actor.userId,
      actorRole: 'candidate',
      before: { availability: current.data.availability },
      after: { availability: input.status },
      reason: input.note,
      occurredAt: ctx.clock.now().toISOString(),
    });

    ctx.logger.info('availability confirmed', { candidateId, status: input.status });

    return ok(updated.data);
  },
});

const uploadInput = z.object({
  documentId,
  fileName: z.string().trim().min(1).max(300),
  /** The reverse side, for kinds that have one. */
  backFileName: z.string().trim().min(1).max(300).nullable().default(null),
});

/**
 * Step one of an upload: a URL the browser can PUT the file to.
 *
 * The bytes never come through the server. A phone photo of a Qatari ID is
 * several megabytes and a Server Action caps its request body at one by
 * default — but the better reason is that minting the URL under the candidate's
 * own credentials means the storage policy decides whether the write is allowed
 * at the moment the URL is created, rather than after the file has arrived.
 *
 * The client sends a filename and nothing else. The folder is computed here
 * from ids the server already holds, because the storage policy matches on that
 * folder being the candidate's own — the path IS the authorization, and a path
 * the client could choose would be no authorization at all.
 */
export const prepareDocumentUpload = defineUseCase({
  name: 'candidate.prepareDocumentUpload',

  input: z.object({
    documentId,
    fileName: z.string().trim().min(1).max(300),
    side: z.enum(['front', 'back']).default('front'),
  }),

  authorize: { capability: 'document:upload_own' as const },

  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) return err(forbidden('Only a candidate can do this.'));

    const document = await ctx.repos.documents.findById(input.documentId);
    if (!document.ok) return document;
    if (!document.data) return err(notFound('Document not found.'));
    if (document.data.candidateId !== ctx.actor.candidateId) {
      return err(notFound('Document not found.'));
    }
    if (document.data.status === 'verified') {
      return err(conflict('That document has already been verified.'));
    }

    return ctx.repos.documents.prepareUpload({
      path: documentStoragePath(
        ctx.actor.candidateId,
        input.documentId,
        input.fileName,
        input.side,
      ),
    });
  },
});

/**
 * Step two: the file is in storage, so record it and start extraction.
 *
 * Deliberately does not take a storage path. It recomputes the same one
 * `prepareDocumentUpload` used, from the same ids, so the two agree by
 * construction and there is no request in which a candidate can name a folder.
 */
export const uploadDocument = defineUseCase({
  name: 'candidate.uploadDocument',

  input: uploadInput,

  authorize: { capability: 'document:upload_own' as const },

  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) return err(forbidden('Only a candidate can do this.'));

    const document = await ctx.repos.documents.findById(input.documentId);
    if (!document.ok) return document;
    if (!document.data) return err(notFound('Document not found.'));

    // Ownership, spelled out. This is the request where getting it wrong hands
    // one person's passport to another.
    if (document.data.candidateId !== ctx.actor.candidateId) {
      return err(notFound('Document not found.'));
    }
    if (document.data.status === 'verified') {
      return err(conflict('That document has already been verified.'));
    }

    // A national ID carries the number on one side and the expiry on the other.
    // Accepting one side would produce a document nobody can actually verify.
    if (document.data.kind === 'national_id' && input.backFileName === null) {
      return err(validation('A Qatari ID needs both the front and the back.'));
    }

    const uploaded = await ctx.repos.documents.upload({
      documentId: input.documentId,
      fileName: input.fileName,
      storagePath: documentStoragePath(
        ctx.actor.candidateId,
        input.documentId,
        input.fileName,
        'front',
      ),
      backFileName: input.backFileName,
      backStoragePath:
        input.backFileName === null
          ? null
          : documentStoragePath(
              ctx.actor.candidateId,
              input.documentId,
              input.backFileName,
              'back',
            ),
      uploadedAt: ctx.clock.now().toISOString(),
    });
    if (!uploaded.ok) return uploaded;

    // Deliberately no field values in the log line: these are ID numbers and
    // bank details. The logger redacts known keys, but the safest value to log
    // is none.
    ctx.logger.info('document uploaded', {
      documentId: input.documentId,
      kind: uploaded.data.kind,
      twoSided: input.backFileName !== null,
    });

    return ok(uploaded.data);
  },
});

/**
 * A short-lived link to a file the actor is allowed to open.
 *
 * Minted on demand and never stored. A URL kept on a row is a permanent bearer
 * token for a national ID: anyone who ever saw it, in a log line or a screen
 * share, can open the document forever. Sixty seconds is enough to click.
 *
 * QSTP reaches this through its own use-case in `qstp/decisions`; this one is
 * the candidate's, and re-derives ownership rather than trusting the id.
 */
export const getDocumentDownloadUrl = defineUseCase({
  name: 'candidate.documentDownloadUrl',
  input: z.object({ documentId, side: z.enum(['front', 'back']).default('front') }),
  authorize: { capability: 'document:read_own' as const },

  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) return err(forbidden('Only a candidate can do this.'));

    const document = await ctx.repos.documents.findById(input.documentId);
    if (!document.ok) return document;
    if (!document.data) return err(notFound('Document not found.'));
    if (document.data.candidateId !== ctx.actor.candidateId) {
      return err(notFound('Document not found.'));
    }

    const path =
      input.side === 'back' ? document.data.backStoragePath : document.data.storagePath;
    if (path === null) return err(notFound('Nothing has been uploaded yet.'));

    return ctx.repos.documents.createDownloadUrl({
      bucket: 'candidate-documents',
      path,
      expiresInSeconds: 60,
    });
  },
});

/**
 * Step three: what the extractor read.
 *
 * Called by whatever ran the extraction — the OCR route for a bank statement,
 * the identity provider for a QID — on the candidate's own behalf, which is why
 * it is gated on the same capability as the upload rather than on a QSTP one.
 * It cannot invent a document: the row must already be sitting in `extracting`.
 *
 * `failed` is a real outcome. A document left in `extracting` forever looks
 * exactly like one nobody has got to yet, and only one of those needs a person.
 */
export const recordDocumentExtraction = defineUseCase({
  name: 'candidate.recordDocumentExtraction',

  input: z.object({
    documentId,
    fields: z
      .array(
        z.object({
          key: z.string().min(1).max(60),
          label: z.string().min(1).max(120),
          extracted: z.string().max(500).nullable(),
          confidence: z.number().min(0).max(1).nullable(),
        }),
      )
      .max(40)
      .default([]),
    failed: z.boolean().default(false),
  }),

  authorize: { capability: 'document:upload_own' as const },

  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) return err(forbidden('Only a candidate can do this.'));

    const document = await ctx.repos.documents.findById(input.documentId);
    if (!document.ok) return document;
    if (!document.data) return err(notFound('Document not found.'));
    if (document.data.candidateId !== ctx.actor.candidateId) {
      return err(notFound('Document not found.'));
    }

    const recorded = await ctx.repos.documents.recordExtraction({
      documentId: input.documentId,
      fields: input.fields,
      failed: input.failed,
    });
    if (!recorded.ok) return recorded;

    // Field count and confidence only. The values are ID numbers and IBANs, and
    // the safest thing to log about them is nothing.
    ctx.logger.info('document extraction recorded', {
      documentId: input.documentId,
      kind: recorded.data.kind,
      failed: input.failed,
      fieldCount: recorded.data.fields.length,
    });

    return ok(recorded.data);
  },
});

/**
 * The candidate confirms what OCR read.
 *
 * Nothing reaches QSTP until this happens. An unreviewed OCR digit in an IBAN
 * means a salary lands in someone else's account, and the person best placed to
 * catch that is the one who owns the account.
 */
export const confirmDocumentFields = defineUseCase({
  name: 'candidate.confirmDocumentFields',
  input: confirmFieldsInput,
  authorize: { capability: 'document:upload_own' as const },

  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) return err(forbidden('Only a candidate can do this.'));

    const document = await ctx.repos.documents.findById(input.documentId);
    if (!document.ok) return document;
    if (!document.data) return err(notFound('Document not found.'));
    if (document.data.candidateId !== ctx.actor.candidateId) {
      return err(notFound('Document not found.'));
    }

    const known = new Set(document.data.fields.map((field) => field.key));
    const unknown = input.fields.filter((field) => !known.has(field.key));
    if (unknown.length > 0) {
      return err(
        validation('Those fields do not belong to this document.', {
          context: { keys: unknown.map((field) => field.key) },
        }),
      );
    }

    const confirmed = await ctx.repos.documents.confirmFields({
      documentId: input.documentId,
      fields: input.fields,
      confirmedAt: ctx.clock.now().toISOString(),
    });
    if (!confirmed.ok) return confirmed;

    // Partial confirmation is a half-finished form, not a submission.
    const remaining = unconfirmedFields(confirmed.data.fields);
    if (remaining.length > 0) {
      return err(
        validation(
          `Check the remaining field${remaining.length === 1 ? '' : 's'}: ` +
            remaining.map((field) => field.label).join(', ') + '.',
          { context: { remaining: remaining.map((field) => field.key) } },
        ),
      );
    }

    ctx.logger.info('document fields confirmed', {
      documentId: input.documentId,
      fieldCount: input.fields.length,
    });

    return ok(confirmed.data);
  },
});
