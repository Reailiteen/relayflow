import { z } from 'zod';
import { conflict, err, forbidden, notFound, ok, validation } from '@relayflow/core';
import { isCandidate } from '@relayflow/access';
import {
  confirmAvailabilityInput,
  confirmFieldsInput,
  documentId,
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

    ctx.logger.info('availability confirmed', { candidateId, status: input.status });

    return ok(updated.data);
  },
});

/**
 * Uploading a document.
 *
 * The file itself is not handled here — in the demo there is no storage, and in
 * production the bytes go straight to object storage from the client. What this
 * records is that an upload happened and what the extractor read from it.
 */
export const uploadDocument = defineUseCase({
  name: 'candidate.uploadDocument',

  input: z.object({
    documentId,
    fileName: z.string().trim().min(1).max(300),
  }),

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

    const uploaded = await ctx.repos.documents.upload({
      documentId: input.documentId,
      fileName: input.fileName,
      uploadedAt: ctx.clock.now().toISOString(),
    });
    if (!uploaded.ok) return uploaded;

    // Deliberately no field values in the log line: these are ID numbers and
    // bank details. The logger redacts known keys, but the safest value to log
    // is none.
    ctx.logger.info('document uploaded', {
      documentId: input.documentId,
      kind: uploaded.data.kind,
      extractedFieldCount: uploaded.data.fields.length,
    });

    return ok(uploaded.data);
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
