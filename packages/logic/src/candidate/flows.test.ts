import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { DEV_ACTORS, createFixtureRepositories, createStore, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { CandidateActor } from '@relayflow/access';
import type { UseCaseContext } from '../context';
import { verifyDocument } from '../qstp/decisions';
import { confirmAvailability, confirmDocumentFields, uploadDocument } from './actions';
import { getCandidateDocuments, getCandidateOverview } from './views';

/**
 * The candidate portal's flows.
 *
 * The ownership cases carry the most weight here: this is the only part of the
 * system holding national ID numbers and bank details, so "can one candidate
 * reach another's document?" is asserted rather than assumed.
 */

const NOW = '2026-03-16T09:00:00.000Z';

function contextFor(actor: UseCaseContext['actor'], store = createStore()): UseCaseContext {
  return {
    actor,
    repos: createFixtureRepositories(store),
    logger: silentLogger,
    clock: fixedClock(NOW),
  };
}

/**
 * A candidate actor pointed at somebody else's record — built explicitly
 * rather than spread from DEV_ACTORS, which returns the wider `Actor` union.
 */
const impostor = (): CandidateActor => ({
  kind: 'candidate',
  userId: ids.candidateUser,
  email: 'omar.khalid@example.com',
  fullName: 'Omar Khalid',
  candidateId: ids.canOmar,
});

describe('candidate portal', () => {
  describe('overview', () => {
    it('shows a placed candidate their placement and their journey position', async () => {
      const overview = await getCandidateOverview(contextFor(DEV_ACTORS.candidate()), {});
      expect(overview.ok).toBe(true);
      if (!overview.ok) return;

      expect(overview.data.candidate.fullName).toBe('Layla Ahmed');
      expect(overview.data.placement?.startup?.name).toBe('Acme Robotics');
      expect(overview.data.placement?.position?.title).toBe('AI Developer');

      // Placed, with documents outstanding, so documents is the current step.
      expect(overview.data.currentStep).toBe('documents');
      expect(overview.data.documentsOutstanding).toBeGreaterThan(0);
      expect(overview.data.action?.href).toBe('/candidate/documents');

      const journey = Object.fromEntries(overview.data.journey.map((s) => [s.step, s.state]));
      expect(journey.availability).toBe('done');
      expect(journey.placement).toBe('done');
      expect(journey.documents).toBe('current');
      expect(journey.onboarded).toBe('upcoming');
    });

    it('blocks the later steps for a candidate who withdrew', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.candidate(), store);

      // Layla is 'placed' in the fixture, which cannot be undone — use a
      // candidate who has not been placed.
      const layla = store.candidates.find((c) => c.id === ids.canLayla);
      if (layla) {
        store.candidates[store.candidates.indexOf(layla)] = {
          ...layla,
          availability: 'employed',
        };
      }

      const overview = await getCandidateOverview(ctx, {});
      expect(overview.ok).toBe(true);
      if (!overview.ok) return;

      const journey = Object.fromEntries(overview.data.journey.map((s) => [s.step, s.state]));
      expect(journey.interview).toBe('blocked');
      expect(journey.documents).toBe('blocked');
    });
  });

  describe('availability', () => {
    it('refuses to change availability once the candidate is placed', async () => {
      // Layla is already placed.
      const result = await confirmAvailability(contextFor(DEV_ACTORS.candidate()), {
        status: 'employed',
        note: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('conflict');
        expect(result.error.message).toContain('already been placed');
      }
    });

    it('records a confirmation for a candidate who is not yet placed', async () => {
      const store = createStore();
      const ctx = contextFor(impostor(), store); // Omar, who is reserved but not placed

      const result = await confirmAvailability(ctx, { status: 'available', note: null });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.availability).toBe('available');
        expect(result.data.availabilityConfirmedAt).toBe(NOW);
      }
    });

    it('is refused for a startup actor', async () => {
      const result = await confirmAvailability(contextFor(DEV_ACTORS.startupOwner()), {
        status: 'available',
        note: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });
  });

  describe('documents', () => {
    it('extracts fields on upload and asks the candidate to check them', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.candidate(), store);

      const nda = store.documents.find((d) => d.kind === 'startup_nda');
      const bank = store.documents.find((d) => d.kind === 'bank_statement');
      expect(nda?.status).toBe('requested');
      expect(bank).toBeDefined();

      // Re-upload the bank statement to exercise extraction.
      const uploaded = await uploadDocument(ctx, {
        documentId: bank?.id,
        fileName: 'statement.pdf',
      });
      expect(uploaded.ok).toBe(true);
      if (!uploaded.ok) return;

      expect(uploaded.data.status).toBe('awaiting_candidate_review');
      // Nothing is confirmed yet — that is the candidate's job.
      expect(uploaded.data.fields.every((field) => field.confirmed === null)).toBe(true);

      const views = await getCandidateDocuments(ctx, {});
      expect(views.ok).toBe(true);
      if (!views.ok) return;
      const view = views.data.find((v) => v.document.id === bank?.id);
      // The IBAN comes back low-confidence, which the UI must call out.
      expect(view?.lowConfidence).toContain('iban');
      expect(view?.needsAction).toBe(true);
    });

    it('refuses a partial confirmation and names what is missing', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.candidate(), store);
      const bank = store.documents.find((d) => d.kind === 'bank_statement');

      await uploadDocument(ctx, { documentId: bank?.id, fileName: 'statement.pdf' });

      const result = await confirmDocumentFields(ctx, {
        documentId: bank?.id,
        fields: [{ key: 'iban', value: 'QA58DOHB00001234567890ABCDEFG' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation');
        expect(result.error.message).toContain('Account holder');
      }
    });

    it('keeps the extracted value alongside the correction', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.candidate(), store);
      const bank = store.documents.find((d) => d.kind === 'bank_statement');

      const uploaded = await uploadDocument(ctx, {
        documentId: bank?.id,
        fileName: 'statement.pdf',
      });
      if (!uploaded.ok) return;
      const misread = uploaded.data.fields.find((f) => f.key === 'iban')?.extracted;

      const corrected = 'QA58DOHB00001234567890ABCDEFG';
      const result = await confirmDocumentFields(ctx, {
        documentId: bank?.id,
        fields: uploaded.data.fields.map((field) => ({
          key: field.key,
          value: field.key === 'iban' ? corrected : (field.extracted ?? 'x'),
        })),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe('submitted');

      const iban = result.data.fields.find((f) => f.key === 'iban');
      expect(iban?.confirmed).toBe(corrected);
      // The original read survives, so OCR accuracy stays measurable.
      expect(iban?.extracted).toBe(misread);
      expect(iban?.extracted).not.toBe(iban?.confirmed);
    });

    it('rejects fields that do not belong to the document', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.candidate(), store);
      const bank = store.documents.find((d) => d.kind === 'bank_statement');

      const result = await confirmDocumentFields(ctx, {
        documentId: bank?.id,
        fields: [{ key: 'salary', value: '999999' }],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('validation');
    });
  });

  describe('ownership', () => {
    it('hides another candidate’s document behind not_found', async () => {
      const store = createStore();
      // Omar reaching for Layla's bank statement.
      const ctx = contextFor(impostor(), store);
      const laylasBank = store.documents.find(
        (d) => d.candidateId === ids.canLayla && d.kind === 'bank_statement',
      );

      const result = await uploadDocument(ctx, {
        documentId: laylasBank?.id,
        fileName: 'not-mine.pdf',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // not_found rather than forbidden: a forbidden would confirm the
        // document exists.
        expect(result.error.code).toBe('not_found');
      }
    });

    it('lists only the actor’s own documents', async () => {
      const mine = await getCandidateDocuments(contextFor(DEV_ACTORS.candidate()), {});
      expect(mine.ok).toBe(true);
      if (!mine.ok) return;
      expect(mine.data.every((v) => v.document.candidateId === ids.canLayla)).toBe(true);

      const theirs = await getCandidateDocuments(contextFor(impostor()), {});
      expect(theirs.ok).toBe(true);
      if (!theirs.ok) return;
      expect(theirs.data.every((v) => v.document.candidateId === ids.canOmar)).toBe(true);
    });

    it('refuses a candidate reading someone else’s overview by id substitution', async () => {
      // The actor carries the candidate id; there is no input to tamper with,
      // which is the point. Omar's actor sees Omar.
      const overview = await getCandidateOverview(contextFor(impostor()), {});
      expect(overview.ok).toBe(true);
      if (!overview.ok) return;
      expect(overview.data.candidate.id).toBe(ids.canOmar);
      expect(overview.data.candidate.fullName).toBe('Omar Khalid');
    });
  });

  describe('QSTP verification', () => {
    it('verifies a document the candidate has submitted', async () => {
      const store = createStore();
      const submitted = store.documents.find((d) => d.status === 'submitted');

      const result = await verifyDocument(contextFor(DEV_ACTORS.manager(), store), {
        documentId: submitted?.id,
        decision: 'verified',
        rejectionReason: null,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe('verified');
    });

    it('will not verify one the candidate has not checked yet', async () => {
      const store = createStore();
      const requested = store.documents.find((d) => d.status === 'requested');

      const result = await verifyDocument(contextFor(DEV_ACTORS.manager(), store), {
        documentId: requested?.id,
        decision: 'verified',
        rejectionReason: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
    });

    it('requires a reason when rejecting', async () => {
      const store = createStore();
      const submitted = store.documents.find((d) => d.status === 'submitted');

      const result = await verifyDocument(contextFor(DEV_ACTORS.manager(), store), {
        documentId: submitted?.id,
        decision: 'rejected',
        rejectionReason: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('validation');
    });

    it('is refused for a candidate verifying their own paperwork', async () => {
      const store = createStore();
      const submitted = store.documents.find((d) => d.status === 'submitted');

      const result = await verifyDocument(contextFor(DEV_ACTORS.candidate(), store), {
        documentId: submitted?.id,
        decision: 'verified',
        rejectionReason: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });
  });
});
