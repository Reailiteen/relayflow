import { conflict, err, notFound, ok, type Result } from '@relayflow/core';
import { blocksOthers, type ExtractedField, type Allocation, type Candidate, type CandidateDocument, type Cycle, type ExceptionRequest, type Interview, type PoolEntry, type Position, type Selection, type Startup, type StartupMember } from '@relayflow/entities';
import type {
  AllocationPort,
  CandidatePort,
  CyclePort,
  DocumentPort,
  ExceptionPort,
  InterviewPort,
  PoolEntryWithCandidate,
  PositionPort,
  Repositories,
  SelectionPort,
  StartupPort,
} from '@relayflow/ports';
import * as seed from './seed';

/**
 * In-memory adapter — the backend for UI development.
 *
 * It implements the same ports the Supabase adapter will, so screens built
 * against it are wired to the real use-cases and the real policy layer. The
 * only thing being faked is where the rows live.
 *
 * Where a port's contract demands an invariant, this honours it rather than
 * papering over it. `selections.reserve` really does refuse a second claim, so
 * the conflict path can be exercised in the UI today.
 */

export interface FixtureStore {
  cycles: Cycle[];
  startups: Startup[];
  startupMembers: StartupMember[];
  allocations: Allocation[];
  positions: Position[];
  candidates: Candidate[];
  poolEntries: PoolEntry[];
  selections: Selection[];
  exceptions: ExceptionRequest[];
  interviews: Interview[];
  documents: CandidateDocument[];
}

/** A fresh copy of the seed. Cloned so callers mutate their own state only. */
export function createStore(): FixtureStore {
  const clone = <T>(rows: readonly T[]): T[] => rows.map((row) => ({ ...row }));
  return {
    cycles: [{ ...seed.cycle }],
    startups: clone(seed.startups),
    startupMembers: clone(seed.startupMembers),
    allocations: clone(seed.allocations),
    positions: clone(seed.positions),
    candidates: clone(seed.candidates),
    poolEntries: clone(seed.poolEntries),
    selections: clone(seed.selections),
    exceptions: clone(seed.exceptions),
    interviews: clone(seed.interviews),
    documents: clone(seed.documents),
  };
}

const uuid = () => crypto.randomUUID();

/**
 * What "OCR" returns in the demo, per document kind.
 *
 * The confidences are chosen to exercise the UI rather than to flatter it: the
 * IBAN comes back at 0.58, which is exactly the case the candidate-review
 * screen exists for.
 */
const SIMULATED_EXTRACTION: Partial<Record<CandidateDocument['kind'], ExtractedField[]>> = {
  national_id: [
    { key: 'id_number', label: 'ID number', extracted: '28904177351', confirmed: null, confidence: 0.96 },
    { key: 'full_name', label: 'Full name', extracted: 'LAYLA AHMED', confirmed: null, confidence: 0.94 },
    { key: 'nationality', label: 'Nationality', extracted: 'Qatari', confirmed: null, confidence: 0.89 },
    { key: 'expiry', label: 'Expiry date', extracted: '2029-06-30', confirmed: null, confidence: 0.71 },
  ],
  passport: [
    { key: 'passport_number', label: 'Passport number', extracted: 'QA8842107', confirmed: null, confidence: 0.92 },
    { key: 'full_name', label: 'Full name', extracted: 'LAYLA AHMED', confirmed: null, confidence: 0.95 },
    { key: 'expiry', label: 'Expiry date', extracted: '2031-02-14', confirmed: null, confidence: 0.83 },
  ],
  bank_statement: [
    // Low on purpose. A wrong digit here sends a salary to a stranger.
    { key: 'iban', label: 'IBAN', extracted: 'QA58DOHB0000I234567890ABCDEFG', confirmed: null, confidence: 0.58 },
    { key: 'account_holder', label: 'Account holder', extracted: 'LAYLA AHMED', confirmed: null, confidence: 0.91 },
    { key: 'bank_name', label: 'Bank', extracted: 'Doha Bank', confirmed: null, confidence: 0.88 },
  ],
};

export function createFixtureRepositories(store: FixtureStore = createStore()): Repositories {
  const cycles: CyclePort = {
    findById: (id) => Promise.resolve(ok(store.cycles.find((c) => c.id === id) ?? null)),
    findActive: () =>
      Promise.resolve(ok(store.cycles.find((c) => c.stage !== 'closed') ?? store.cycles[0] ?? null)),
    list: () => Promise.resolve(ok([...store.cycles])),
  };

  const startups: StartupPort = {
    findById: (id) => Promise.resolve(ok(store.startups.find((s) => s.id === id) ?? null)),
    listForCycle: () =>
      Promise.resolve(ok([...store.startups].sort((a, b) => a.name.localeCompare(b.name)))),
    listForUser: (userId) => {
      const mine = new Set(
        store.startupMembers.filter((m) => m.userId === userId).map((m) => m.startupId),
      );
      return Promise.resolve(ok(store.startups.filter((s) => mine.has(s.id))));
    },
    listMembers: (startupId) =>
      Promise.resolve(ok(store.startupMembers.filter((m) => m.startupId === startupId))),
  };

  const allocations: AllocationPort = {
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.allocations.filter((a) => a.cycleId === cycleId))),

    findForStartup: (cycleId, startupId) =>
      Promise.resolve(
        ok(
          store.allocations.find((a) => a.cycleId === cycleId && a.startupId === startupId) ?? null,
        ),
      ),

    decide: (input) => {
      const existing = store.allocations.find(
        (a) => a.cycleId === input.cycleId && a.startupId === input.startupId,
      );

      const next: Allocation = {
        id: existing?.id ?? (uuid() as Allocation['id']),
        cycleId: input.cycleId,
        startupId: input.startupId,
        weeklyHours: input.weeklyHours as Allocation['weeklyHours'],
        status: 'confirmed',
        score: input.score,
        overrideReason: input.overrideReason,
        justification: input.justification,
        // A grant that raises a startup above what it previously held during a
        // redistribution round is recorded as such.
        fromRedistribution:
          existing?.fromRedistribution === true ||
          (existing !== undefined && input.weeklyHours > existing.weeklyHours),
        decidedBy: input.decidedBy,
        decidedAt: input.decidedAt,
        createdAt: existing?.createdAt ?? input.decidedAt,
        updatedAt: input.decidedAt,
      };

      if (existing) {
        store.allocations[store.allocations.indexOf(existing)] = next;
      } else {
        store.allocations.push(next);
      }
      return Promise.resolve(ok(next));
    },
  };

  const positions: PositionPort = {
    findById: (id) => Promise.resolve(ok(store.positions.find((p) => p.id === id) ?? null)),
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.positions.filter((p) => p.cycleId === cycleId))),
    listForStartup: (cycleId, startupId) =>
      Promise.resolve(
        ok(store.positions.filter((p) => p.cycleId === cycleId && p.startupId === startupId)),
      ),

    create: (input) => {
      const now = new Date().toISOString();
      const position: Position = {
        id: uuid() as Position['id'],
        cycleId: input.cycleId,
        startupId: input.startupId,
        title: input.title,
        description: input.description,
        requiredSkills: input.requiredSkills,
        internCount: input.internCount,
        hoursPerIntern: input.hoursPerIntern,
        durationWeeks: input.durationWeeks,
        supervisorId: null,
        supervisorName: input.supervisorName,
        status: 'submitted',
        reviewNote: null,
        createdAt: now,
        updatedAt: now,
      };
      store.positions.push(position);
      return Promise.resolve(ok(position));
    },

    updateStatus: (id, status, reviewNote) => {
      const position = store.positions.find((p) => p.id === id);
      if (!position) return Promise.resolve(err(notFound('Position not found.')));
      const next = { ...position, status, reviewNote, updatedAt: new Date().toISOString() };
      store.positions[store.positions.indexOf(position)] = next;
      return Promise.resolve(ok(next));
    },
  };

  const candidates: CandidatePort = {
    findById: (id) => Promise.resolve(ok(store.candidates.find((c) => c.id === id) ?? null)),
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.candidates.filter((c) => c.cycleId === cycleId))),

    listPool: (positionId) => {
      const rows: PoolEntryWithCandidate[] = [];
      for (const entry of store.poolEntries.filter((e) => e.positionId === positionId)) {
        const candidate = store.candidates.find((c) => c.id === entry.candidateId);
        if (candidate) rows.push({ entry, candidate });
      }
      return Promise.resolve(ok(rows));
    },

    listPoolForCycle: (cycleId) => {
      const inCycle = new Set(
        store.positions.filter((p) => p.cycleId === cycleId).map((p) => p.id),
      );
      const rows: PoolEntryWithCandidate[] = [];
      for (const entry of store.poolEntries) {
        if (!inCycle.has(entry.positionId)) continue;
        const candidate = store.candidates.find((c) => c.id === entry.candidateId);
        if (candidate) rows.push({ entry, candidate });
      }
      return Promise.resolve(ok(rows));
    },

    findPoolEntry: (id) => Promise.resolve(ok(store.poolEntries.find((e) => e.id === id) ?? null)),

    updatePoolEntry: (input) => {
      const entry = store.poolEntries.find((e) => e.id === input.poolEntryId);
      if (!entry) return Promise.resolve(err(notFound('That candidate is not in this pool.')));

      const next: PoolEntry = {
        ...entry,
        status: input.status,
        // First time the startup acts on the card is when the review clock stops.
        reviewedAt: entry.reviewedAt ?? (input.status === 'pending' ? null : input.reviewedAt),
        updatedAt: input.reviewedAt,
      };
      store.poolEntries[store.poolEntries.indexOf(entry)] = next;
      return Promise.resolve(ok(next));
    },

    importMany: (input) => {
      const existing = new Set(
        store.candidates
          .filter((c) => c.cycleId === input.cycleId)
          .map((c) => c.email.toLowerCase()),
      );

      const created: Candidate[] = [];
      let duplicates = 0;

      for (const row of input.rows) {
        if (existing.has(row.email.toLowerCase())) {
          duplicates += 1;
          continue;
        }
        existing.add(row.email.toLowerCase());

        const candidate: Candidate = {
          id: uuid() as Candidate['id'],
          cycleId: input.cycleId,
          userId: null,
          fullName: row.fullName,
          email: row.email,
          phone: null,
          skills: row.skills,
          cvUrl: row.cvUrl,
          portfolioUrl: null,
          githubUrl: row.githubUrl,
          // Imported, not asked yet — which is exactly why the availability
          // confirmation flow exists.
          availability: 'unconfirmed',
          availabilityConfirmedAt: null,
          source: input.source,
          createdAt: input.importedAt,
          updatedAt: input.importedAt,
        };
        store.candidates.push(candidate);
        created.push(candidate);
      }

      return Promise.resolve(
        ok({ imported: created.length, duplicates, candidates: created }),
      );
    },

    shareWithPosition: (input) => {
      const already = new Set(
        store.poolEntries
          .filter((entry) => entry.positionId === input.positionId)
          .map((entry) => entry.candidateId),
      );

      let added = 0;
      let skipped = 0;

      for (const candidateId of input.candidateIds) {
        if (already.has(candidateId)) {
          skipped += 1;
          continue;
        }
        already.add(candidateId);
        store.poolEntries.push({
          id: uuid() as PoolEntry['id'],
          positionId: input.positionId,
          candidateId,
          status: 'pending',
          sharedAt: input.sharedAt,
          reviewedAt: null,
          createdAt: input.sharedAt,
          updatedAt: input.sharedAt,
        });
        added += 1;
      }

      return Promise.resolve(ok({ added, skipped }));
    },

    setAvailability: (id, availability, confirmedAt) => {
      const candidate = store.candidates.find((c) => c.id === id);
      if (!candidate) return Promise.resolve(err(notFound('Candidate not found.')));
      const next = {
        ...candidate,
        availability,
        availabilityConfirmedAt: confirmedAt,
        updatedAt: confirmedAt,
      };
      store.candidates[store.candidates.indexOf(candidate)] = next;
      return Promise.resolve(ok(next));
    },
  };

  const selections: SelectionPort = {
    listForCandidate: (candidateId) =>
      Promise.resolve(ok(store.selections.filter((s) => s.candidateId === candidateId))),

    listForCycle: () => Promise.resolve(ok([...store.selections])),

    reserve: (input) => {
      // The port's contract: refuse a second active claim. Enforced here so the
      // conflict path is reachable from the UI without a database.
      const held = store.selections.find(
        (s) => s.candidateId === input.candidateId && blocksOthers(s.status),
      );
      if (held) {
        return Promise.resolve(
          err(
            conflict('That candidate has already been reserved by another startup.', {
              context: { candidateId: input.candidateId, heldBy: held.startupId },
            }),
          ),
        );
      }

      const selection: Selection = {
        id: uuid() as Selection['id'],
        positionId: input.positionId,
        startupId: input.startupId,
        candidateId: input.candidateId,
        status: 'reserved',
        reservedAt: input.reservedAt,
        confirmedAt: null,
        releasedAt: null,
        selectedBy: input.selectedBy,
        overrideReason: null,
        overriddenBy: null,
        createdAt: input.reservedAt,
        updatedAt: input.reservedAt,
      };
      store.selections.push(selection);
      return Promise.resolve(ok(selection));
    },

    release: (selectionId, releasedAt) => {
      const selection = store.selections.find((s) => s.id === selectionId);
      if (!selection) return Promise.resolve(err(notFound('Selection not found.')));
      const next: Selection = {
        ...selection,
        status: 'released',
        releasedAt,
        updatedAt: releasedAt,
      };
      store.selections[store.selections.indexOf(selection)] = next;
      return Promise.resolve(ok(next));
    },
  };

  const exceptions: ExceptionPort = {
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.exceptions.filter((e) => e.cycleId === cycleId))),

    listForStartup: (cycleId, startupId) =>
      Promise.resolve(
        ok(store.exceptions.filter((e) => e.cycleId === cycleId && e.startupId === startupId)),
      ),

    request: (input) => {
      const now = new Date().toISOString();
      const request: ExceptionRequest = {
        id: uuid() as ExceptionRequest['id'],
        cycleId: input.cycleId,
        startupId: input.startupId,
        kind: input.kind,
        status: 'pending',
        reason: input.reason,
        requestedDeadline: input.requestedDeadline,
        grantedDeadline: null,
        decisionNote: null,
        requestedBy: input.requestedBy,
        decidedBy: null,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.exceptions.push(request);
      return Promise.resolve(ok(request));
    },

    decide: (input) => {
      const request = store.exceptions.find((e) => e.id === input.exceptionId);
      if (!request) return Promise.resolve(err(notFound('Exception request not found.')));
      const next: ExceptionRequest = {
        ...request,
        status: input.decision,
        grantedDeadline: input.grantedDeadline,
        decisionNote: input.decisionNote,
        decidedBy: input.decidedBy,
        decidedAt: input.decidedAt,
        updatedAt: input.decidedAt,
      };
      store.exceptions[store.exceptions.indexOf(request)] = next;
      return Promise.resolve(ok(next));
    },
  };

  const interviews: InterviewPort = {
    listForPosition: (positionId) =>
      Promise.resolve(ok(store.interviews.filter((i) => i.positionId === positionId))),
    listForCandidate: (candidateId) =>
      Promise.resolve(ok(store.interviews.filter((i) => i.candidateId === candidateId))),
  };

  const replaceDocument = (next: CandidateDocument) => {
    const index = store.documents.findIndex((d) => d.id === next.id);
    if (index >= 0) store.documents[index] = next;
    return next;
  };

  const documents: DocumentPort = {
    findById: (id) => Promise.resolve(ok(store.documents.find((d) => d.id === id) ?? null)),

    listForCandidate: (candidateId) =>
      Promise.resolve(ok(store.documents.filter((d) => d.candidateId === candidateId))),

    listAwaitingVerification: () =>
      Promise.resolve(ok(store.documents.filter((d) => d.status === 'submitted'))),

    upload: (input) => {
      const document = store.documents.find((d) => d.id === input.documentId);
      if (!document) return Promise.resolve(err(notFound('Document not found.')));

      // Stand-in for OCR. The shapes are what a real extractor returns —
      // including a deliberately low-confidence IBAN, because that is the field
      // whose mis-read costs someone their salary and the UI has to handle it.
      const extracted = SIMULATED_EXTRACTION[document.kind] ?? [];

      return Promise.resolve(
        ok(
          replaceDocument({
            ...document,
            status: extracted.length > 0 ? 'awaiting_candidate_review' : 'submitted',
            fileName: input.fileName,
            storagePath: `candidates/${document.candidateId}/${input.fileName}`,
            fields: extracted,
            rejectionReason: null,
            updatedAt: input.uploadedAt,
          }),
        ),
      );
    },

    confirmFields: (input) => {
      const document = store.documents.find((d) => d.id === input.documentId);
      if (!document) return Promise.resolve(err(notFound('Document not found.')));

      const byKey = new Map(input.fields.map((field) => [field.key, field.value]));

      return Promise.resolve(
        ok(
          replaceDocument({
            ...document,
            // Confirmed sits alongside extracted; the original is never lost.
            fields: document.fields.map((field) => ({
              ...field,
              confirmed: byKey.get(field.key) ?? field.confirmed,
            })),
            status: 'submitted',
            rejectionReason: null,
            updatedAt: input.confirmedAt,
          }),
        ),
      );
    },

    verify: (input) => {
      const document = store.documents.find((d) => d.id === input.documentId);
      if (!document) return Promise.resolve(err(notFound('Document not found.')));

      return Promise.resolve(
        ok(
          replaceDocument({
            ...document,
            status: input.decision,
            rejectionReason: input.rejectionReason,
            verifiedBy: input.decision === 'verified' ? input.verifiedBy : null,
            verifiedAt: input.decision === 'verified' ? input.verifiedAt : null,
            updatedAt: input.verifiedAt,
          }),
        ),
      );
    },
  };

  return {
    cycles,
    startups,
    allocations,
    positions,
    candidates,
    selections,
    exceptions,
    interviews,
    documents,
  };
}

/** Re-exported so callers can assert against known ids in dev and tests. */
export type { Result };
