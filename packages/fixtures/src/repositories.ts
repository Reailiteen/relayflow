import { conflict, err, notFound, ok, validation, type Result } from '@relayflow/core';
import {
  blocksOthers,
  canTransitionPosition,
  effectiveHours,
  isOpenOffer,
  placementReadinessBlockers,
  stageIndex,
  type ActivityEvent,
  type Allocation,
  type Candidate,
  type CandidateDocument,
  type CandidateChoiceFallback,
  type Cycle,
  type CycleParticipation,
  type DocumentRequirementTemplate,
  type ExceptionRequest,
  type ExtractedField,
  type Interview,
  type Placement,
  type PlacementRequirement,
  type PlacementSignature,
  type PoolEntry,
  type Position,
  type PositionIntent,
  type PrioritizationRun,
  type RatingItem,
  type StartupRating,
  type RecoveryCase,
  type RedistributionRound,
  type RequirementSubmission,
  type Selection,
  type SelectionConflict,
  type Startup,
  type StartupMember,
  type TaskAssignment,
  type TaskTemplate,
} from '@relayflow/entities';
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
  ActivityPort,
  ConflictPort,
  FallbackPort,
  ParticipationPort,
  PlacementPort,
  PositionIntentPort,
  PrioritizationPort,
  RatingPort,
  RecoveryPort,
  RequirementPort,
  TaskPort,
} from '@relayflow/ports';
import * as seed from './seed';
import * as seedPrioritisation from './seed-prioritisation';

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
  participations: CycleParticipation[];
  positionIntents: PositionIntent[];
  startupRatings: StartupRating[];
  prioritizationRuns: PrioritizationRun[];
  activityEvents: ActivityEvent[];
  taskTemplates: TaskTemplate[];
  taskAssignments: TaskAssignment[];
  selectionConflicts: SelectionConflict[];
  placements: Placement[];
  requirementTemplates: DocumentRequirementTemplate[];
  placementRequirements: PlacementRequirement[];
  requirementSubmissions: RequirementSubmission[];
  signatures: PlacementSignature[];
  recoveryCases: RecoveryCase[];
  redistributionRounds: RedistributionRound[];
  fallbackCases: CandidateChoiceFallback[];
}

/** A fresh copy of the seed. Cloned so callers mutate their own state only. */
export function createStore(): FixtureStore {
  const clone = <T>(rows: readonly T[]): T[] => rows.map((row) => ({ ...row }));
  const secondCycle: Cycle = {
    ...seed.cycle,
    id: 'c1c1e000-0000-4000-8000-000000000002' as Cycle['id'],
    name: 'Autumn 2026 Internship Cycle',
    stage: 'allocation',
    // Tight on purpose. The three fundable startups want 160 weekly hours
    // between them, so the draft has to downgrade the lowest-ranked one all the
    // way to the waitlist and still strand 5 hours — which is what a reviewer
    // needs to see before they trust the number.
    fundedWeeklyHours: 135,
    startsOn: '2026-09-01',
    endsOn: '2027-01-31',
    deadlines: {
      positionSubmission: '2026-09-25T23:59:00.000Z',
      candidateSelection: '2026-10-30T23:59:00.000Z',
      documentSubmission: '2026-11-20T23:59:00.000Z',
      offerWindow: null,
    },
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: '2026-07-01T08:00:00.000Z',
  };
  const participations: CycleParticipation[] = seed.startups.map((startup, index) => ({
    id: `b1b1e000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as CycleParticipation['id'],
    cycleId: seed.cycle.id,
    startupId: startup.id,
    status: 'accepted',
    requestedTotalHours: seed.allocations.find((row) => row.startupId === startup.id)?.weeklyHours ?? 20,
    requestedInternCount: 2,
    disciplines: startup.sector ? [startup.sector] : [],
    operatorScore: seed.allocations.find((row) => row.startupId === startup.id)?.score ?? null,
    internalNotes: index === 3 ? 'Strategic sector review completed.' : null,
    startupJustification: seed.allocations.find((row) => row.startupId === startup.id)?.justification ?? null,
    allocationAcknowledgedAt: index < 5 ? '2026-02-12T10:00:00.000Z' : null,
    allocationAcknowledgedBy: index < 5 ? seed.ids.qstpOps : null,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: seed.FIXTURE_NOW,
  }));
  participations.push(
    ...seed.startups.map((startup, index) => ({
      id: `b2b2e000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as CycleParticipation['id'],
      cycleId: secondCycle.id,
      startupId: startup.id,
      status: 'accepted' as const,
      requestedTotalHours: index === 0 ? 60 : 40,
      requestedInternCount: 2,
      disciplines: startup.sector ? [startup.sector] : [],
      // Derived, not entered. Written from the engine's score when a run is
      // published; the six ratings behind it are the real record.
      operatorScore: null,
      internalNotes: null,
      startupJustification: null,
      allocationAcknowledgedAt: null,
      allocationAcknowledgedBy: null,
      createdAt: '2026-07-02T10:00:00.000Z',
      updatedAt: '2026-07-02T10:00:00.000Z',
    })),
  );
  const placement: Placement = {
    id: '91ace000-0000-4000-8000-000000000001' as Placement['id'],
    cycleId: seed.cycle.id,
    selectionId: seed.selections[0]!.id,
    candidateId: seed.ids.canLayla,
    startupId: seed.ids.acme,
    positionId: seed.ids.posAiDev,
    committedWeeklyHours: 20,
    startsOn: '2026-04-12',
    endsOn: '2026-07-05',
    supervisorId: seed.ids.acmeSupervisor,
    supervisorName: 'Karim Nasser',
    status: 'confirmed',
    candidateReadyAt: '2026-03-15T13:00:00.000Z',
    startupReadyAt: null,
    detailsFinalizedAt: '2026-03-15T14:00:00.000Z',
    qstpApprovedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    replacementForPlacementId: null,
    createdAt: '2026-03-11T10:00:00.000Z',
    updatedAt: seed.FIXTURE_NOW,
  };
  const templates: DocumentRequirementTemplate[] = [
    {
      id: 'd0c0a000-0000-4000-8000-000000000001' as DocumentRequirementTemplate['id'],
      cycleId: seed.cycle.id,
      title: 'National ID',
      owner: 'candidate',
      required: true,
      positionId: null,
      active: true,
      createdAt: '2026-02-01T08:00:00.000Z',
      updatedAt: '2026-02-01T08:00:00.000Z',
    },
    {
      id: 'd0c0a000-0000-4000-8000-000000000002' as DocumentRequirementTemplate['id'],
      cycleId: seed.cycle.id,
      title: 'Bank details',
      owner: 'candidate',
      required: true,
      positionId: null,
      active: true,
      createdAt: '2026-02-01T08:00:00.000Z',
      updatedAt: '2026-02-01T08:00:00.000Z',
    },
    {
      id: 'd0c0a000-0000-4000-8000-000000000003' as DocumentRequirementTemplate['id'],
      cycleId: seed.cycle.id,
      title: 'Startup NDA',
      owner: 'startup',
      required: true,
      positionId: seed.ids.posAiDev,
      active: true,
      createdAt: '2026-02-20T08:00:00.000Z',
      updatedAt: '2026-02-20T08:00:00.000Z',
    },
  ];
  const placementRequirements: PlacementRequirement[] = templates.map((template, index) => ({
    id: `d0c0b000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as PlacementRequirement['id'],
    placementId: placement.id,
    templateId: template.id,
    title: template.title,
    owner: template.owner,
    required: template.required,
    status: index === 0 ? 'approved' : index === 1 ? 'under_review' : 'awaiting_upload',
    amendmentReason: null,
    createdAt: placement.createdAt,
    updatedAt: seed.FIXTURE_NOW,
  }));
  const recoveryCases: RecoveryCase[] = [
    {
      id: 'aec0e000-0000-4000-8000-000000000001' as RecoveryCase['id'],
      cycleId: seed.cycle.id,
      startupId: seed.ids.fintech,
      placementId: null,
      recoverableHours: 40,
      status: 'potential',
      protectedUntil: null,
      reason: 'Selection deadline passed without a confirmed placement.',
      confirmedBy: null,
      redistributionRoundId: null,
      createdAt: '2026-03-15T09:00:00.000Z',
      updatedAt: '2026-03-15T09:00:00.000Z',
    },
    {
      id: 'aec0e000-0000-4000-8000-000000000002' as RecoveryCase['id'],
      cycleId: seed.cycle.id,
      startupId: seed.ids.northwind,
      placementId: null,
      recoverableHours: 20,
      status: 'exception_protected',
      protectedUntil: '2026-03-21T23:59:00.000Z',
      reason: 'Candidate selection extension is awaiting decision.',
      confirmedBy: null,
      redistributionRoundId: null,
      createdAt: '2026-03-15T09:00:00.000Z',
      updatedAt: '2026-03-15T09:00:00.000Z',
    },
  ];
  return {
    cycles: [{ ...seed.cycle }, secondCycle],
    startups: clone(seed.startups),
    startupMembers: clone(seed.startupMembers),
    allocations: clone(seed.allocations),
    positions: clone(seed.positions),
    candidates: [
      ...clone(seed.candidates),
      // The Autumn cycle needs its own pool, or a cycle you drive yourself from
      // evaluation runs out of road the moment it reaches shortlisting.
      ...seedPrioritisation.autumnCandidates(secondCycle.id),
    ],
    poolEntries: clone(seed.poolEntries),
    selections: clone(seed.selections),
    exceptions: [
      ...clone(seed.exceptions),
      {
        id: 'e8ce9710-0000-4000-8000-000000000010' as ExceptionRequest['id'],
        cycleId: seed.cycle.id,
        startupId: seed.ids.acme,
        kind: 'position_submission',
        status: 'approved',
        reason: 'Supervisor details were finalized after the programme deadline.',
        requestedDeadline: '2026-03-20T23:59:00.000Z',
        grantedDeadline: '2026-03-20T23:59:00.000Z',
        decisionNote: 'Approved for fixture workflow coverage.',
        requestedBy: seed.ids.acmeOwner,
        decidedBy: seed.ids.qstpOps,
        decidedAt: '2026-02-27T10:00:00.000Z',
        createdAt: '2026-02-26T10:00:00.000Z',
        updatedAt: '2026-02-27T10:00:00.000Z',
      },
      {
        id: 'e8ce9710-0000-4000-8000-000000000011' as ExceptionRequest['id'],
        cycleId: seed.cycle.id,
        startupId: seed.ids.northwind,
        kind: 'position_submission',
        status: 'approved',
        reason: 'Approved position correction window.',
        requestedDeadline: '2026-03-20T23:59:00.000Z',
        grantedDeadline: '2026-03-20T23:59:00.000Z',
        decisionNote: 'Approved for fixture workflow coverage.',
        requestedBy: seed.ids.northwindOwner,
        decidedBy: seed.ids.qstpOps,
        decidedAt: '2026-02-27T10:00:00.000Z',
        createdAt: '2026-02-26T10:00:00.000Z',
        updatedAt: '2026-02-27T10:00:00.000Z',
      },
    ],
    interviews: clone(seed.interviews),
    documents: clone(seed.documents),
    participations,
    positionIntents: seedPrioritisation.positionIntents(secondCycle.id, seed.ids.acmeOwner),
    startupRatings: seedPrioritisation.startupRatings(secondCycle.id, seed.ids.qstpOps),
    prioritizationRuns: [],
    activityEvents: [],
    taskTemplates: [
      {
        id: '7a5c0000-0000-4000-8000-000000000001' as TaskTemplate['id'],
        cycleId: seed.cycle.id,
        positionId: seed.ids.posAiDev,
        title: 'Computer vision exercise',
        instructions: 'Review the sample dataset and propose a defect-detection approach.',
        createdBy: seed.ids.acmeSupervisor,
        createdAt: '2026-03-03T10:00:00.000Z',
      },
    ],
    taskAssignments: [
      {
        id: '7a551000-0000-4000-8000-000000000001' as TaskAssignment['id'],
        cycleId: seed.cycle.id,
        templateId: '7a5c0000-0000-4000-8000-000000000001' as TaskTemplate['id'],
        positionId: seed.ids.posAiDev,
        candidateId: seed.ids.canLayla,
        status: 'reviewed',
        dueAt: '2026-03-08T18:00:00.000Z',
        submittedAt: '2026-03-08T17:00:00.000Z',
        lateAccepted: false,
        fileName: 'layla-vision-exercise.pdf',
        linkUrl: null,
        reviewNotes: 'Clear assumptions and a practical validation plan.',
        reviewedBy: seed.ids.acmeSupervisor,
        createdAt: '2026-03-04T10:00:00.000Z',
        updatedAt: '2026-03-09T10:00:00.000Z',
      },
    ],
    selectionConflicts: [
      {
        id: 'c0f11c70-0000-4000-8000-000000000001' as SelectionConflict['id'],
        cycleId: seed.cycle.id,
        candidateId: seed.ids.canOmar,
        attemptedSelectionId: seed.selections[2]!.id,
        blockingSelectionId: seed.selections[1]!.id,
        status: 'open',
        previousStartupId: seed.ids.acme,
        requestedStartupId: seed.ids.northwind,
        resolvedBy: null,
        reason: null,
        createdAt: '2026-03-12T11:00:00.000Z',
        resolvedAt: null,
      },
    ],
    placements: [placement],
    requirementTemplates: templates,
    placementRequirements,
    requirementSubmissions: [],
    signatures: [],
    recoveryCases,
    redistributionRounds: [],
    fallbackCases: [],
  };
}

export const FIXTURE_SCENARIOS = [
  'happy_path',
  'missed_deadline',
  'conflict',
  'candidate_choice',
  'redistribution',
  'document_correction',
  'cancelled_placement',
] as const;
export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

/** Deterministic scenario variants for demos and browser tests. */
export function createScenarioStore(scenario: FixtureScenario): FixtureStore {
  const store = createStore();
  if (scenario === 'candidate_choice') {
    store.cycles[0] = {
      ...store.cycles[0]!,
      selectionMode: 'candidate_choice',
      stage: 'selection',
      deadlines: { ...store.cycles[0]!.deadlines, offerWindow: '2026-03-20T23:59:00.000Z' },
    };
    store.selections = store.selections.filter((row) => row.candidateId !== seed.ids.canHassan);
    store.selections.push(
      {
        ...seed.selections[1]!,
        id: '5e1ec700-0000-4000-8000-000000000010' as Selection['id'],
        candidateId: seed.ids.canHassan,
        positionId: seed.ids.posAiDev,
        startupId: seed.ids.acme,
        status: 'offered',
        offeredAt: '2026-03-13T09:00:00.000Z',
        acceptedAt: null,
        confirmedAt: null,
      },
      {
        ...seed.selections[2]!,
        id: '5e1ec700-0000-4000-8000-000000000011' as Selection['id'],
        candidateId: seed.ids.canHassan,
        positionId: seed.ids.posDataAnalyst,
        startupId: seed.ids.northwind,
        status: 'offered',
        offeredAt: '2026-03-13T10:00:00.000Z',
        acceptedAt: null,
        confirmedAt: null,
      },
    );
  }
  if (scenario === 'document_correction') {
    store.placementRequirements[1] = {
      ...store.placementRequirements[1]!,
      status: 'correction_requested',
      amendmentReason: 'The account holder name does not match the placement record.',
    };
    store.requirementSubmissions.push({
      id: '5ab00100-0000-4000-8000-000000000001' as RequirementSubmission['id'],
      requirementId: store.placementRequirements[1].id,
      revision: 1,
      fileName: 'bank-details-v1.pdf',
      storagePath: 'placements/demo/bank/v1/bank-details-v1.pdf',
      submittedBy: seed.ids.candidateUser,
      submittedAt: '2026-03-14T10:00:00.000Z',
      extractedFields: [
        { key: 'iban', extracted: 'QA58DOHB0000I234', confirmed: 'QA58DOHB00001234' },
      ],
      correctionReason: null,
    });
  }
  if (scenario === 'cancelled_placement') {
    store.placements[0] = {
      ...store.placements[0]!,
      status: 'cancelled',
      cancelledAt: seed.FIXTURE_NOW,
      cancellationReason: 'Candidate withdrew before the start date.',
    };
    store.recoveryCases.push({
      id: 'aec0e000-0000-4000-8000-000000000010' as RecoveryCase['id'],
      cycleId: seed.cycle.id,
      startupId: seed.ids.acme,
      placementId: store.placements[0].id,
      recoverableHours: 20,
      status: 'potential',
      protectedUntil: null,
      reason: 'Cancelled placement hours are available for replacement or redistribution.',
      confirmedBy: null,
      redistributionRoundId: null,
      createdAt: seed.FIXTURE_NOW,
      updatedAt: seed.FIXTURE_NOW,
    });
  }
  if (scenario === 'happy_path') {
    store.selectionConflicts = [];
    store.recoveryCases = [];
  }
  if (scenario === 'missed_deadline') {
    store.positions = store.positions.filter((row) => row.startupId !== seed.ids.fintech);
    store.exceptions = store.exceptions.filter((row) => row.kind !== 'position_submission');
  }
  return store;
}

export function resetFixtureStore(target: FixtureStore, scenario: FixtureScenario): void {
  const next = createScenarioStore(scenario);
  for (const key of Object.keys(next) as (keyof FixtureStore)[]) {
    // Every store member is an array. Replace in place so repository closures keep working.
    (target[key] as unknown[]) = [...(next[key] as unknown[])];
  }
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
    list: () => Promise.resolve(ok([...store.cycles].sort((a, b) => b.startsOn.localeCompare(a.startsOn)))),
    create: (input) => {
      const cycle: Cycle = {
        ...input.cycle,
        id: uuid() as Cycle['id'],
        archivedAt: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      store.cycles.push(cycle);
      if (input.cloneParticipationFrom) {
        for (const source of store.participations.filter((row) => row.cycleId === input.cloneParticipationFrom)) {
          store.participations.push({
            ...source,
            id: uuid() as CycleParticipation['id'],
            cycleId: cycle.id,
            operatorScore: null,
            internalNotes: null,
            startupJustification: null,
            allocationAcknowledgedAt: null,
            allocationAcknowledgedBy: null,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
          });
        }
      }
      return Promise.resolve(ok(cycle));
    },
    update: (input) => {
      const cycle = store.cycles.find((row) => row.id === input.cycleId);
      if (!cycle) return Promise.resolve(err(notFound('Cycle not found.')));
      if (cycle.stage === 'closed' || cycle.archivedAt) {
        return Promise.resolve(err(conflict('Closed or archived cycles cannot be edited.')));
      }
      const next: Cycle = {
        ...cycle,
        name: input.name,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        fundedWeeklyHours: input.fundedWeeklyHours,
        selectionMode: input.selectionMode,
        deadlines: input.deadlines,
        updatedAt: input.updatedAt,
      };
      store.cycles[store.cycles.indexOf(cycle)] = next;
      return Promise.resolve(ok(next));
    },
    advance: (input) => {
      const cycle = store.cycles.find((row) => row.id === input.cycleId);
      if (!cycle) return Promise.resolve(err(notFound('Cycle not found.')));
      if (cycle.stage !== input.from || stageIndex(input.to) !== stageIndex(input.from) + 1) {
        return Promise.resolve(err(conflict('The cycle can only advance one stage from its current state.')));
      }
      const next = { ...cycle, stage: input.to, updatedAt: input.updatedAt };
      store.cycles[store.cycles.indexOf(cycle)] = next;
      return Promise.resolve(ok(next));
    },
    archive: (id, archivedAt) => {
      const cycle = store.cycles.find((row) => row.id === id);
      if (!cycle) return Promise.resolve(err(notFound('Cycle not found.')));
      const next = { ...cycle, archivedAt, updatedAt: archivedAt };
      store.cycles[store.cycles.indexOf(cycle)] = next;
      return Promise.resolve(ok(next));
    },
  };

  const startups: StartupPort = {
    findById: (id) => Promise.resolve(ok(store.startups.find((s) => s.id === id) ?? null)),
    listForCycle: (cycleId) => {
      const participating = new Set(
        store.participations.filter((row) => row.cycleId === cycleId).map((row) => row.startupId),
      );
      return Promise.resolve(
        ok(store.startups.filter((row) => participating.has(row.id)).sort((a, b) => a.name.localeCompare(b.name))),
      );
    },
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
      Promise.resolve(
        ok(store.allocations.filter((a) => a.cycleId === cycleId && a.status !== 'superseded')),
      ),

    listHistoryForCycle: (cycleId) =>
      Promise.resolve(ok(store.allocations.filter((a) => a.cycleId === cycleId))),

    findForStartup: (cycleId, startupId) =>
      Promise.resolve(
        ok(
          store.allocations.find(
            (a) =>
              a.cycleId === cycleId &&
              a.startupId === startupId &&
              a.status !== 'superseded',
          ) ?? null,
        ),
      ),

    decide: (input) => {
      const cycle = store.cycles.find((row) => row.id === input.cycleId);
      if (!cycle) return Promise.resolve(err(notFound('Cycle not found.')));
      const existing = store.allocations.find(
        (a) =>
          a.cycleId === input.cycleId &&
          a.startupId === input.startupId &&
          a.status !== 'superseded',
      );
      const otherCommitted = store.allocations
        .filter(
          (row) =>
            row.cycleId === input.cycleId &&
            row.status === 'confirmed' &&
            row.startupId !== input.startupId,
        )
        .reduce((sum, row) => sum + row.weeklyHours, 0);
      if (otherCommitted + input.weeklyHours > cycle.fundedWeeklyHours) {
        return Promise.resolve(err(conflict('This allocation would exceed the cycle budget.')));
      }

      const next: Allocation = {
        id: uuid() as Allocation['id'],
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
          input.redistributionRoundId !== null ||
          existing?.fromRedistribution === true ||
          (existing !== undefined && input.weeklyHours > existing.weeklyHours),
        revision: (existing?.revision ?? 0) + 1,
        supersedesAllocationId: existing?.id ?? null,
        redistributionRoundId: input.redistributionRoundId,
        decidedBy: input.decidedBy,
        decidedAt: input.decidedAt,
        createdAt: existing?.createdAt ?? input.decidedAt,
        updatedAt: input.decidedAt,
      };

      if (existing) {
        store.allocations[store.allocations.indexOf(existing)] = {
          ...existing,
          status: 'superseded',
          updatedAt: input.decidedAt,
        };
      }
      store.allocations.push(next);
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
        intentId: input.intentId ?? null,
        title: input.title,
        description: input.description,
        requiredSkills: input.requiredSkills,
        workArrangement: input.workArrangement,
        additionalRequirements: input.additionalRequirements,
        internCount: input.internCount,
        hoursPerIntern: input.hoursPerIntern,
        durationWeeks: input.durationWeeks,
        supervisorId: null,
        supervisorName: input.supervisorName,
        status: input.status ?? 'submitted',
        reviewNote: null,
        reviewHistory: [],
        redistributionRoundId: input.redistributionRoundId,
        createdAt: now,
        updatedAt: now,
      };
      store.positions.push(position);
      return Promise.resolve(ok(position));
    },

    updateDetails: (id, input) => {
      const position = store.positions.find((row) => row.id === id);
      if (!position) return Promise.resolve(err(notFound('Position not found.')));
      if (!['draft', 'changes_requested'].includes(position.status)) {
        return Promise.resolve(err(conflict('Only drafts and requested corrections can be edited.')));
      }
      const next: Position = {
        ...position,
        title: input.title,
        description: input.description,
        requiredSkills: input.requiredSkills,
        workArrangement: input.workArrangement,
        additionalRequirements: input.additionalRequirements,
        internCount: input.internCount,
        hoursPerIntern: input.hoursPerIntern,
        durationWeeks: input.durationWeeks,
        supervisorName: input.supervisorName,
        redistributionRoundId: input.redistributionRoundId,
        updatedAt: new Date().toISOString(),
      };
      store.positions[store.positions.indexOf(position)] = next;
      return Promise.resolve(ok(next));
    },

    updateStatus: (id, status, reviewNote) => {
      const position = store.positions.find((p) => p.id === id);
      if (!position) return Promise.resolve(err(notFound('Position not found.')));
      if (!canTransitionPosition(position.status, status)) {
        return Promise.resolve(err(conflict(`Position cannot move from ${position.status} to ${status}.`)));
      }
      const occurredAt = new Date().toISOString();
      const next = {
        ...position,
        status,
        reviewNote,
        reviewHistory: [...position.reviewHistory, { status, note: reviewNote, occurredAt }],
        updatedAt: occurredAt,
      };
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

    listForCycle: (cycleId) => {
      const positionIds = new Set(
        store.positions.filter((position) => position.cycleId === cycleId).map((position) => position.id),
      );
      return Promise.resolve(ok(store.selections.filter((selection) => positionIds.has(selection.positionId))));
    },

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
        offeredAt: null,
        acceptedAt: null,
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

    offer: (input) => {
      // Unlike reserve, a rival offer is not an obstacle — but a blocking claim
      // still is, or the candidate would be shown a choice they do not have.
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

      const already = store.selections.find(
        (s) =>
          s.candidateId === input.candidateId &&
          s.positionId === input.positionId &&
          isOpenOffer(s.status),
      );
      if (already) {
        return Promise.resolve(
          err(
            conflict('You have already offered this candidate the role.', {
              context: { candidateId: input.candidateId, positionId: input.positionId },
            }),
          ),
        );
      }

      const selection: Selection = {
        id: uuid() as Selection['id'],
        positionId: input.positionId,
        startupId: input.startupId,
        candidateId: input.candidateId,
        status: 'offered',
        // Provisional: restamped when the candidate accepts. Never read while
        // the claim is non-blocking.
        reservedAt: input.offeredAt,
        offeredAt: input.offeredAt,
        acceptedAt: null,
        confirmedAt: null,
        releasedAt: null,
        selectedBy: input.selectedBy,
        overrideReason: null,
        overriddenBy: null,
        createdAt: input.offeredAt,
        updatedAt: input.offeredAt,
      };
      store.selections.push(selection);
      return Promise.resolve(ok(selection));
    },

    acceptOffer: (input) => {
      const chosen = store.selections.find((s) => s.id === input.selectionId);
      if (!chosen) return Promise.resolve(err(notFound('Offer not found.')));

      // Scoped to the actor's own candidate id, so a valid id belonging to
      // someone else is not found rather than accepted.
      if (chosen.candidateId !== input.candidateId) {
        return Promise.resolve(err(notFound('Offer not found.')));
      }

      if (!isOpenOffer(chosen.status)) {
        return Promise.resolve(
          err(
            conflict('That offer is no longer open.', {
              context: { selectionId: chosen.id, status: chosen.status },
            }),
          ),
        );
      }

      // The same guard `reserve` applies. Accepting is the moment an offer
      // becomes blocking, so it races with an FCFS reservation and with a
      // second acceptance; in SQL this is the partial unique index.
      const held = store.selections.find(
        (s) => s.candidateId === input.candidateId && blocksOthers(s.status),
      );
      if (held) {
        return Promise.resolve(
          err(
            conflict('That role is no longer available.', {
              context: { candidateId: input.candidateId, heldBy: held.startupId },
            }),
          ),
        );
      }

      // One write: the chosen offer is reserved, every sibling is declined.
      const accepted: Selection = {
        ...chosen,
        status: 'accepted',
        reservedAt: input.acceptedAt,
        acceptedAt: input.acceptedAt,
        updatedAt: input.acceptedAt,
      };
      store.selections = store.selections.map((s) => {
        if (s.id === accepted.id) return accepted;
        if (s.candidateId === input.candidateId && isOpenOffer(s.status)) {
          return {
            ...s,
            status: 'declined' as const,
            releasedAt: input.acceptedAt,
            updatedAt: input.acceptedAt,
          };
        }
        return s;
      });

      return Promise.resolve(ok(accepted));
    },

    acceptReservation: (input) => {
      const selection = store.selections.find(
        (row) => row.id === input.selectionId && row.candidateId === input.candidateId,
      );
      if (!selection) return Promise.resolve(err(notFound('Selection not found.')));
      if (selection.status !== 'reserved') {
        return Promise.resolve(err(conflict('This reservation is not awaiting acceptance.')));
      }
      const next: Selection = {
        ...selection,
        status: 'accepted',
        acceptedAt: input.acceptedAt,
        updatedAt: input.acceptedAt,
      };
      store.selections[store.selections.indexOf(selection)] = next;
      return Promise.resolve(ok(next));
    },

    decline: (selectionId, candidateId, occurredAt) => {
      const selection = store.selections.find(
        (row) => row.id === selectionId && row.candidateId === candidateId,
      );
      if (!selection) return Promise.resolve(err(notFound('Selection not found.')));
      if (!['offered', 'reserved'].includes(selection.status)) {
        return Promise.resolve(err(conflict('This selection is no longer awaiting a response.')));
      }
      const next: Selection = {
        ...selection,
        status: selection.status === 'offered' ? 'declined' : 'released',
        releasedAt: occurredAt,
        updatedAt: occurredAt,
      };
      store.selections[store.selections.indexOf(selection)] = next;
      return Promise.resolve(ok(next));
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

  const replaceInterview = (next: Interview) => {
    const index = store.interviews.findIndex((i) => i.id === next.id);
    if (index >= 0) store.interviews[index] = next;
    else store.interviews.push(next);
    return next;
  };

  const interviews: InterviewPort = {
    findById: (id) => Promise.resolve(ok(store.interviews.find((i) => i.id === id) ?? null)),

    listForPosition: (positionId) =>
      Promise.resolve(ok(store.interviews.filter((i) => i.positionId === positionId))),

    listForCandidate: (candidateId) =>
      Promise.resolve(ok(store.interviews.filter((i) => i.candidateId === candidateId))),

    schedule: (input) =>
      Promise.resolve(
        ok(
          replaceInterview({
            id: uuid() as Interview['id'],
            positionId: input.positionId,
            candidateId: input.candidateId,
            mode: input.mode,
            status: 'scheduled',
            scheduledFor: input.scheduledFor,
            durationMinutes: input.durationMinutes,
            location: input.location,
            recordingUrl: null,
            transcriptStatus: 'none',
            transcript: null,
            aiSummary: null,
            feedback: null,
            recommendation: null,
            interviewerId: input.interviewerId,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
          }),
        ),
      ),

    request: (input) =>
      Promise.resolve(
        ok(
          replaceInterview({
            id: uuid() as Interview['id'],
            positionId: input.positionId,
            candidateId: input.candidateId,
            mode: input.mode,
            status: 'requested',
            scheduledFor: null,
            durationMinutes: null,
            location: null,
            recordingUrl: null,
            transcriptStatus: 'none',
            transcript: null,
            aiSummary: null,
            feedback: null,
            recommendation: null,
            interviewerId: input.interviewerId,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
          }),
        ),
      ),

    transition: (input) => {
      const interview = store.interviews.find((row) => row.id === input.interviewId);
      if (!interview) return Promise.resolve(err(notFound('Interview not found.')));
      const allowed: Record<Interview['status'], readonly Interview['status'][]> = {
        requested: ['confirmed', 'cancelled'],
        confirmed: ['scheduled', 'cancelled'],
        scheduled: ['scheduled', 'completed', 'cancelled', 'no_show'],
        completed: [],
        cancelled: [],
        no_show: [],
      };
      if (!allowed[interview.status].includes(input.status)) {
        return Promise.resolve(
          err(conflict(`Interview cannot move from ${interview.status} to ${input.status}.`)),
        );
      }
      if (input.status === 'scheduled' && (!input.scheduledFor || !input.durationMinutes)) {
        return Promise.resolve(err(validation('A scheduled interview needs a date and duration.')));
      }
      return Promise.resolve(
        ok(
          replaceInterview({
            ...interview,
            status: input.status,
            scheduledFor:
              input.status === 'scheduled'
                ? (input.scheduledFor ?? null)
                : interview.scheduledFor,
            durationMinutes:
              input.status === 'scheduled'
                ? (input.durationMinutes ?? null)
                : interview.durationMinutes,
            location:
              input.status === 'scheduled' ? (input.location ?? null) : interview.location,
            updatedAt: input.occurredAt,
          }),
        ),
      );
    },

    attachRecording: (input) => {
      const interview = store.interviews.find((i) => i.id === input.interviewId);
      if (!interview) return Promise.resolve(err(notFound('Interview not found.')));

      // Stand-in for Whisper plus a summariser. Returned synchronously here,
      // but the status field is what the UI reads either way.
      return Promise.resolve(
        ok(
          replaceInterview({
            ...interview,
            status: 'completed',
            recordingUrl: input.recordingUrl,
            transcriptStatus: 'ready',
            transcript:
              'Interviewer: Thanks for joining. Could you walk us through a project you are proud of?\n' +
              'Candidate: The one I keep coming back to is a defect-detection model I shipped last summer…',
            aiSummary:
              'Communicates clearly and gives concrete examples. Strong practical experience with the ' +
              'core stack; less exposure to deployment tooling. Asked thoughtful questions about ' +
              'supervision and scope.',
            updatedAt: input.recordedAt,
          }),
        ),
      );
    },

    saveFeedback: (input) => {
      const interview = store.interviews.find((i) => i.id === input.interviewId);
      if (!interview) return Promise.resolve(err(notFound('Interview not found.')));

      return Promise.resolve(
        ok(
          replaceInterview({
            ...interview,
            status: interview.status === 'scheduled' ? 'completed' : interview.status,
            feedback: input.feedback,
            recommendation: input.recommendation,
            updatedAt: input.savedAt,
          }),
        ),
      );
    },
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

    listForStartup: (startupId) =>
      Promise.resolve(ok(store.documents.filter((d) => d.startupId === startupId))),

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

  const appendEvent = (event: Omit<ActivityEvent, 'id'>): ActivityEvent => {
    const created: ActivityEvent = { ...event, id: uuid() as ActivityEvent['id'] };
    store.activityEvents.push(created);
    return created;
  };

  const activity: ActivityPort = {
    append: (event) => Promise.resolve(ok(appendEvent(event))),
    listForCycle: (cycleId) =>
      Promise.resolve(
        ok(
          store.activityEvents
            .filter((event) => event.cycleId === cycleId)
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
        ),
      ),
    listForEntity: (cycleId, entityType, entityId) =>
      Promise.resolve(
        ok(
          store.activityEvents
            .filter(
              (event) =>
                event.cycleId === cycleId &&
                event.entityType === entityType &&
                event.entityId === entityId,
            )
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
        ),
      ),
  };

  const participation: ParticipationPort = {
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.participations.filter((row) => row.cycleId === cycleId))),
    find: (cycleId, startupId) =>
      Promise.resolve(
        ok(
          store.participations.find(
            (row) => row.cycleId === cycleId && row.startupId === startupId,
          ) ?? null,
        ),
      ),
    save: (input) => {
      const { occurredAt, ...values } = input;
      const existing = store.participations.find(
        (row) => row.cycleId === input.cycleId && row.startupId === input.startupId,
      );
      const next: CycleParticipation = {
        ...values,
        id: existing?.id ?? (uuid() as CycleParticipation['id']),
        createdAt: existing?.createdAt ?? occurredAt,
        updatedAt: occurredAt,
      };
      if (existing) store.participations[store.participations.indexOf(existing)] = next;
      else store.participations.push(next);
      return Promise.resolve(ok(next));
    },
    acknowledge: (cycleId, startupId, actorId, occurredAt) => {
      const row = store.participations.find(
        (item) => item.cycleId === cycleId && item.startupId === startupId,
      );
      if (!row) return Promise.resolve(err(notFound('Cycle participation not found.')));
      const allocation = store.allocations.find(
        (item) =>
          item.cycleId === cycleId && item.startupId === startupId && item.status === 'confirmed',
      );
      if (!allocation) return Promise.resolve(err(conflict('There is no published allocation to acknowledge.')));
      if (row.allocationAcknowledgedAt) return Promise.resolve(ok(row));
      const next: CycleParticipation = {
        ...row,
        allocationAcknowledgedAt: occurredAt,
        allocationAcknowledgedBy: actorId,
        updatedAt: occurredAt,
      };
      store.participations[store.participations.indexOf(row)] = next;
      appendEvent({
        cycleId,
        entityType: 'participation',
        entityId: row.id,
        action: 'allocation_acknowledged',
        actorId,
        actorRole: 'owner',
        before: { allocationAcknowledgedAt: row.allocationAcknowledgedAt },
        after: { allocationAcknowledgedAt: occurredAt },
        reason: null,
        occurredAt,
      });
      return Promise.resolve(ok(next));
    },
  };

  const positionIntents: PositionIntentPort = {
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.positionIntents.filter((row) => row.cycleId === cycleId))),
    listForStartup: (cycleId, startupId) =>
      Promise.resolve(
        ok(
          store.positionIntents.filter(
            (row) => row.cycleId === cycleId && row.startupId === startupId,
          ),
        ),
      ),
    save: (input) => {
      const existing = input.id
        ? store.positionIntents.find((row) => row.id === input.id)
        : undefined;
      const next: PositionIntent = {
        ...input,
        id: existing?.id ?? (uuid() as PositionIntent['id']),
        createdAt: existing?.createdAt ?? input.occurredAt,
        updatedAt: input.occurredAt,
      };
      if (existing) store.positionIntents[store.positionIntents.indexOf(existing)] = next;
      else store.positionIntents.push(next);
      appendEvent({
        cycleId: next.cycleId,
        entityType: 'position_intent',
        entityId: next.id,
        action: existing ? 'updated' : 'submitted',
        actorId: next.submittedBy,
        actorRole: 'owner',
        before: existing ? { title: existing.title } : null,
        after: { title: next.title, startupId: next.startupId },
        reason: null,
        occurredAt: input.occurredAt,
      });
      return Promise.resolve(ok(next));
    },
    withdraw: (id, occurredAt) => {
      const existing = store.positionIntents.find((row) => row.id === id);
      if (!existing) return Promise.resolve(err(notFound('Position intent not found.')));
      store.positionIntents.splice(store.positionIntents.indexOf(existing), 1);
      appendEvent({
        cycleId: existing.cycleId,
        entityType: 'position_intent',
        entityId: id,
        action: 'withdrawn',
        actorId: existing.submittedBy,
        actorRole: 'owner',
        before: { title: existing.title },
        after: null,
        reason: null,
        occurredAt,
      });
      return Promise.resolve(ok(undefined));
    },
  };

  const ratings: RatingPort = {
    listForCycle: (cycleId) =>
      Promise.resolve(
        ok(store.startupRatings.filter((row) => row.cycleId === cycleId && row.status !== 'superseded')),
      ),
    findForStartup: (cycleId, startupId) => {
      const rows = store.startupRatings.filter(
        (row) => row.cycleId === cycleId && row.startupId === startupId,
      );
      // Submitted wins over draft — the draft is a work-in-progress that must
      // not shadow the rating a run was actually calculated from.
      const live =
        rows.find((row) => row.status === 'submitted') ??
        rows.find((row) => row.status === 'draft') ??
        null;
      return Promise.resolve(ok(live));
    },
    saveDraft: (input) => {
      const existing = store.startupRatings.find(
        (row) =>
          row.cycleId === input.cycleId &&
          row.startupId === input.startupId &&
          row.status === 'draft',
      );
      const next: StartupRating = {
        id: existing?.id ?? (uuid() as StartupRating['id']),
        cycleId: input.cycleId,
        startupId: input.startupId,
        status: 'draft',
        items: input.items.map((item) => ({ ...item, id: uuid() as RatingItem['id'] })),
        ratedBy: input.ratedBy,
        supersedesId: null,
        revisionReason: null,
        submittedAt: null,
        createdAt: existing?.createdAt ?? input.occurredAt,
        updatedAt: input.occurredAt,
      };
      if (existing) store.startupRatings[store.startupRatings.indexOf(existing)] = next;
      else store.startupRatings.push(next);
      return Promise.resolve(ok(next));
    },
    submit: (input) => {
      const prior = store.startupRatings.find(
        (row) =>
          row.cycleId === input.cycleId &&
          row.startupId === input.startupId &&
          row.status === 'submitted',
      );
      // Superseded, never edited. A rating that changed after a run was
      // published has to stay reconstructable.
      if (prior) {
        store.startupRatings[store.startupRatings.indexOf(prior)] = {
          ...prior,
          status: 'superseded',
          updatedAt: input.occurredAt,
        };
      }
      const draft = store.startupRatings.find(
        (row) =>
          row.cycleId === input.cycleId &&
          row.startupId === input.startupId &&
          row.status === 'draft',
      );
      if (draft) store.startupRatings.splice(store.startupRatings.indexOf(draft), 1);

      const next: StartupRating = {
        id: uuid() as StartupRating['id'],
        cycleId: input.cycleId,
        startupId: input.startupId,
        status: 'submitted',
        items: input.items.map((item) => ({ ...item, id: uuid() as RatingItem['id'] })),
        ratedBy: input.ratedBy,
        supersedesId: prior?.id ?? null,
        revisionReason: input.revisionReason,
        submittedAt: input.occurredAt,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      };
      store.startupRatings.push(next);
      appendEvent({
        cycleId: input.cycleId,
        entityType: 'startup_rating',
        entityId: next.id,
        action: prior ? 'revised' : 'submitted',
        actorId: input.ratedBy,
        actorRole: 'operations',
        before: prior ? { ratingId: prior.id } : null,
        after: { startupId: input.startupId },
        reason: input.revisionReason,
        occurredAt: input.occurredAt,
      });
      return Promise.resolve(ok(next));
    },
  };

  const prioritization: PrioritizationPort = {
    // No scoring here. The use-case has already called the engine; this stores
    // what came back and nothing more.
    create: (input) => {
      const previous = store.prioritizationRuns.filter((row) => row.cycleId === input.cycleId);
      // One draft at a time — re-running replaces the last one rather than
      // leaving two candidate answers with no way to tell which is current.
      store.prioritizationRuns = store.prioritizationRuns.map((row) =>
        row.cycleId === input.cycleId && row.status === 'draft'
          ? { ...row, status: 'superseded' }
          : row,
      );
      const run: PrioritizationRun = {
        ...input,
        id: uuid() as PrioritizationRun['id'],
        version: Math.max(...previous.map((row) => row.version), 0) + 1,
        status: 'draft',
        confirmedAt: null,
      };
      store.prioritizationRuns.push(run);
      appendEvent({
        cycleId: input.cycleId,
        entityType: 'prioritization_run',
        entityId: run.id,
        action: 'created',
        actorId: input.createdBy,
        actorRole: 'operations',
        before: null,
        after: {
          version: run.version,
          proposedHours: run.proposedHours,
          completeness: run.completeness,
        },
        reason: null,
        occurredAt: input.createdAt,
      });
      return Promise.resolve(ok(run));
    },
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.prioritizationRuns.filter((row) => row.cycleId === cycleId))),
    adjust: (runId, startupId, proposedHours, reason, adjustedBy, adjustedAt) => {
      const source = store.prioritizationRuns.find((row) => row.id === runId);
      if (!source || source.status !== 'draft') {
        return Promise.resolve(err(notFound('Draft prioritization run not found.')));
      }
      const target = source.outcomes.find((row) => row.startupId === startupId);
      if (!target) return Promise.resolve(err(notFound('That startup is not in this run.')));
      // Handing hours to a blocked startup would paper over the thing that
      // actually needs doing — chasing the missing information.
      if (target.status !== 'scored') {
        return Promise.resolve(
          err(
            conflict(
              `That startup is ${target.status.replace(/_/g, ' ')}, so it has no tier to adjust.`,
            ),
          ),
        );
      }

      const outcomes = source.outcomes.map((row) =>
        row.startupId === startupId
          ? { ...row, adjustedHours: proposedHours, adjustmentReason: reason }
          : row,
      );
      const proposedTotal = outcomes.reduce(
        (sum, row) => sum + (effectiveHours(row) ?? 0),
        0,
      );
      if (proposedTotal > source.budgetHours) {
        return Promise.resolve(err(conflict('Adjusted proposals exceed the cycle budget.')));
      }

      const previous = store.prioritizationRuns.filter((row) => row.cycleId === source.cycleId);
      const adjusted: PrioritizationRun = {
        ...source,
        id: uuid() as PrioritizationRun['id'],
        version: Math.max(...previous.map((row) => row.version), 0) + 1,
        outcomes,
        proposedHours: proposedTotal,
        residualHours: source.budgetHours - proposedTotal,
        withinBudget: proposedTotal <= source.budgetHours,
        createdBy: adjustedBy,
        createdAt: adjustedAt,
      };
      store.prioritizationRuns[store.prioritizationRuns.indexOf(source)] = {
        ...source,
        status: 'superseded',
      };
      store.prioritizationRuns.push(adjusted);
      return Promise.resolve(ok(adjusted));
    },
    confirm: (runId, confirmedAt) => {
      const run = store.prioritizationRuns.find((row) => row.id === runId);
      if (!run) return Promise.resolve(err(notFound('Prioritization run not found.')));
      if (run.status !== 'draft') return Promise.resolve(err(conflict('Only a draft run can be confirmed.')));
      store.prioritizationRuns = store.prioritizationRuns.map((row) => {
        if (row.cycleId !== run.cycleId) return row;
        if (row.id === run.id) return { ...row, status: 'confirmed', confirmedAt };
        return row.status === 'confirmed' ? { ...row, status: 'superseded' } : row;
      });
      const confirmed = store.prioritizationRuns.find((row) => row.id === runId)!;
      return Promise.resolve(ok(confirmed));
    },
  };

  const tasks: TaskPort = {
    listTemplates: (positionId) =>
      Promise.resolve(ok(store.taskTemplates.filter((row) => row.positionId === positionId))),
    saveTemplate: (input) => {
      const created: TaskTemplate = { ...input, id: uuid() as TaskTemplate['id'] };
      store.taskTemplates.push(created);
      return Promise.resolve(ok(created));
    },
    listAssignments: (candidateId) =>
      Promise.resolve(ok(store.taskAssignments.filter((row) => row.candidateId === candidateId))),
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.taskAssignments.filter((row) => row.cycleId === cycleId))),
    assign: (input) => {
      const { occurredAt, ...values } = input;
      const assignment: TaskAssignment = {
        ...values,
        id: uuid() as TaskAssignment['id'],
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      store.taskAssignments.push(assignment);
      return Promise.resolve(ok(assignment));
    },
    submit: (assignmentId, candidateId, fileName, linkUrl, occurredAt) => {
      const assignment = store.taskAssignments.find(
        (row) => row.id === assignmentId && row.candidateId === candidateId,
      );
      if (!assignment) return Promise.resolve(err(notFound('Task assignment not found.')));
      if (assignment.status !== 'assigned') return Promise.resolve(err(conflict('This task is not open for submission.')));
      if (!fileName && !linkUrl) return Promise.resolve(err(validation('Add a file or link.')));
      const next: TaskAssignment = {
        ...assignment,
        status: 'submitted',
        submittedAt: occurredAt,
        lateAccepted: occurredAt > assignment.dueAt,
        fileName,
        linkUrl,
        updatedAt: occurredAt,
      };
      store.taskAssignments[store.taskAssignments.indexOf(assignment)] = next;
      return Promise.resolve(ok(next));
    },
    review: (assignmentId, reviewerId, notes, occurredAt) => {
      const assignment = store.taskAssignments.find((row) => row.id === assignmentId);
      if (!assignment) return Promise.resolve(err(notFound('Task assignment not found.')));
      if (assignment.status !== 'submitted') return Promise.resolve(err(conflict('Only submitted tasks can be reviewed.')));
      const next: TaskAssignment = {
        ...assignment,
        status: 'reviewed',
        reviewNotes: notes,
        reviewedBy: reviewerId,
        updatedAt: occurredAt,
      };
      store.taskAssignments[store.taskAssignments.indexOf(assignment)] = next;
      return Promise.resolve(ok(next));
    },
    withdraw: (assignmentId, occurredAt) => {
      const assignment = store.taskAssignments.find((row) => row.id === assignmentId);
      if (!assignment) return Promise.resolve(err(notFound('Task assignment not found.')));
      if (!['assigned', 'submitted'].includes(assignment.status)) {
        return Promise.resolve(err(conflict('This task can no longer be withdrawn.')));
      }
      const next: TaskAssignment = { ...assignment, status: 'withdrawn', updatedAt: occurredAt };
      store.taskAssignments[store.taskAssignments.indexOf(assignment)] = next;
      return Promise.resolve(ok(next));
    },
  };

  const requirements: RequirementPort = {
    listTemplates: (cycleId) =>
      Promise.resolve(ok(store.requirementTemplates.filter((row) => row.cycleId === cycleId))),
    saveTemplate: (input) => {
      const { occurredAt, ...values } = input;
      const template: DocumentRequirementTemplate = {
        ...values,
        id: uuid() as DocumentRequirementTemplate['id'],
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      store.requirementTemplates.push(template);
      return Promise.resolve(ok(template));
    },
    updateTemplate: (id, input) => {
      const template = store.requirementTemplates.find((row) => row.id === id);
      if (!template) return Promise.resolve(err(notFound('Requirement template not found.')));
      const next: DocumentRequirementTemplate = {
        ...template,
        title: input.title,
        owner: input.owner,
        required: input.required,
        active: input.active,
        updatedAt: input.occurredAt,
      };
      store.requirementTemplates[store.requirementTemplates.indexOf(template)] = next;
      return Promise.resolve(ok(next));
    },
    snapshotForPlacement: (placementId, occurredAt) => {
      const placement = store.placements.find((row) => row.id === placementId);
      if (!placement) return Promise.resolve(err(notFound('Placement not found.')));
      const existing = store.placementRequirements.filter((row) => row.placementId === placementId);
      if (existing.length > 0) return Promise.resolve(ok(existing));
      const applicable = store.requirementTemplates.filter(
        (row) =>
          row.cycleId === placement.cycleId &&
          row.active &&
          (row.positionId === null || row.positionId === placement.positionId),
      );
      const snapshots = applicable.map((template): PlacementRequirement => ({
        id: uuid() as PlacementRequirement['id'],
        placementId,
        templateId: template.id,
        title: template.title,
        owner: template.owner,
        required: template.required,
        status: template.owner === 'qstp' ? 'requested' : 'awaiting_upload',
        amendmentReason: null,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      }));
      store.placementRequirements.push(...snapshots);
      return Promise.resolve(ok(snapshots));
    },
    listForPlacement: (placementId) =>
      Promise.resolve(ok(store.placementRequirements.filter((row) => row.placementId === placementId))),
    amend: (input) => {
      const { reason, occurredAt, ...values } = input;
      const requirement: PlacementRequirement = {
        ...values,
        id: uuid() as PlacementRequirement['id'],
        amendmentReason: reason,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      store.placementRequirements.push(requirement);
      return Promise.resolve(ok(requirement));
    },
    submit: (input) => {
      const requirement = store.placementRequirements.find((row) => row.id === input.requirementId);
      if (!requirement) return Promise.resolve(err(notFound('Requirement not found.')));
      if (!['awaiting_upload', 'correction_requested', 'rejected'].includes(requirement.status)) {
        return Promise.resolve(err(conflict('This requirement is not awaiting a submission.')));
      }
      const revision =
        store.requirementSubmissions.filter((row) => row.requirementId === requirement.id).length + 1;
      const submission: RequirementSubmission = {
        id: uuid() as RequirementSubmission['id'],
        requirementId: requirement.id,
        revision,
        fileName: input.fileName,
        storagePath: `placements/${requirement.placementId}/${requirement.id}/v${revision}/${input.fileName}`,
        submittedBy: input.submittedBy,
        submittedAt: input.occurredAt,
        extractedFields: input.extractedFields,
        correctionReason: requirement.status === 'correction_requested' ? requirement.amendmentReason : null,
      };
      store.requirementSubmissions.push(submission);
      const next: PlacementRequirement = {
        ...requirement,
        status: revision > 1 ? 'resubmitted' : 'uploaded',
        updatedAt: input.occurredAt,
      };
      store.placementRequirements[store.placementRequirements.indexOf(requirement)] = next;
      return Promise.resolve(ok(submission));
    },
    decide: (input) => {
      const requirement = store.placementRequirements.find((row) => row.id === input.requirementId);
      if (!requirement) return Promise.resolve(err(notFound('Requirement not found.')));
      if (input.decision === 'correction_requested' && !input.reason?.trim()) {
        return Promise.resolve(err(validation('A correction reason is required.')));
      }
      const next: PlacementRequirement = {
        ...requirement,
        status: input.decision,
        amendmentReason: input.reason,
        updatedAt: input.occurredAt,
      };
      store.placementRequirements[store.placementRequirements.indexOf(requirement)] = next;
      return Promise.resolve(ok(next));
    },
    listSubmissions: (requirementId) =>
      Promise.resolve(
        ok(
          store.requirementSubmissions
            .filter((row) => row.requirementId === requirementId)
            .sort((a, b) => a.revision - b.revision),
        ),
      ),
    sign: (input) => {
      if (!input.declarationAccepted || !input.documentOpenedAt) {
        return Promise.resolve(err(validation('Open the agreement and accept the declaration before signing.')));
      }
      const duplicate = store.signatures.find(
        (row) => row.placementId === input.placementId && row.kind === input.kind,
      );
      if (duplicate) return Promise.resolve(ok(duplicate));
      const signature: PlacementSignature = { ...input, id: uuid() as PlacementSignature['id'] };
      store.signatures.push(signature);
      return Promise.resolve(ok(signature));
    },
    listSignatures: (placementId) =>
      Promise.resolve(ok(store.signatures.filter((row) => row.placementId === placementId))),
  };

  const placements: PlacementPort = {
    findById: (id) => Promise.resolve(ok(store.placements.find((row) => row.id === id) ?? null)),
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.placements.filter((row) => row.cycleId === cycleId))),
    listForCandidate: (candidateId) =>
      Promise.resolve(ok(store.placements.filter((row) => row.candidateId === candidateId))),
    confirmSelection: (selectionId, input) => {
      const selection = store.selections.find((row) => row.id === selectionId);
      if (!selection) return Promise.resolve(err(notFound('Selection not found.')));
      if (selection.status !== 'accepted') return Promise.resolve(err(conflict('Candidate acceptance is required before QSTP confirmation.')));
      const position = store.positions.find((row) => row.id === selection.positionId);
      if (!position || !['approved', 'locked'].includes(position.status)) {
        return Promise.resolve(err(conflict('The position is not approved for placement.')));
      }
      const filled = store.placements.filter(
        (row) => row.positionId === position.id && row.status !== 'cancelled',
      ).length;
      if (filled >= position.internCount) return Promise.resolve(err(conflict('The position has no open seats.')));
      const activeForCandidate = store.placements.find(
        (row) => row.candidateId === selection.candidateId && row.cycleId === position.cycleId && row.status !== 'cancelled',
      );
      if (activeForCandidate) return Promise.resolve(err(conflict('The candidate already has a confirmed placement.')));

      const confirmedSelection: Selection = {
        ...selection,
        status: 'confirmed',
        confirmedAt: input.occurredAt,
        updatedAt: input.occurredAt,
      };
      store.selections[store.selections.indexOf(selection)] = confirmedSelection;
      const candidate = store.candidates.find((row) => row.id === selection.candidateId);
      if (candidate) {
        store.candidates[store.candidates.indexOf(candidate)] = {
          ...candidate,
          availability: 'placed',
          updatedAt: input.occurredAt,
        };
      }
      const placement: Placement = {
        id: uuid() as Placement['id'],
        cycleId: position.cycleId,
        selectionId,
        candidateId: selection.candidateId,
        startupId: selection.startupId,
        positionId: position.id,
        committedWeeklyHours: position.hoursPerIntern,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        supervisorId: input.supervisorId,
        supervisorName: input.supervisorName,
        status: 'confirmed',
        candidateReadyAt: null,
        startupReadyAt: null,
        detailsFinalizedAt: null,
        qstpApprovedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        replacementForPlacementId: null,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      };
      store.placements.push(placement);
      if (filled + 1 >= position.internCount) {
        store.positions[store.positions.indexOf(position)] = {
          ...position,
          status: 'filled',
          updatedAt: input.occurredAt,
        };
        store.selections = store.selections.map((row) =>
          row.positionId === position.id && row.id !== selection.id && row.status === 'offered'
            ? {
                ...row,
                status: 'released' as const,
                releasedAt: input.occurredAt,
                updatedAt: input.occurredAt,
              }
            : row,
        );
      }
      const templates = store.requirementTemplates.filter(
        (row) => row.cycleId === placement.cycleId && row.active && (row.positionId === null || row.positionId === position.id),
      );
      store.placementRequirements.push(
        ...templates.map((template): PlacementRequirement => ({
          id: uuid() as PlacementRequirement['id'],
          placementId: placement.id,
          templateId: template.id,
          title: template.title,
          owner: template.owner,
          required: template.required,
          status: template.owner === 'qstp' ? 'requested' : 'awaiting_upload',
          amendmentReason: null,
          createdAt: input.occurredAt,
          updatedAt: input.occurredAt,
        })),
      );
      appendEvent({
        cycleId: placement.cycleId,
        entityType: 'placement',
        entityId: placement.id,
        action: 'confirmed',
        actorId: input.confirmedBy,
        actorRole: 'operations',
        before: null,
        after: { status: placement.status, committedWeeklyHours: placement.committedWeeklyHours },
        reason: null,
        occurredAt: input.occurredAt,
      });
      return Promise.resolve(ok(placement));
    },
    setReadiness: (input) => {
      const placement = store.placements.find((row) => row.id === input.placementId);
      if (!placement) return Promise.resolve(err(notFound('Placement not found.')));
      if (placement.status === 'cancelled') return Promise.resolve(err(conflict('Cancelled placements are read-only.')));
      const next: Placement = {
        ...placement,
        candidateReadyAt: input.party === 'candidate' ? input.occurredAt : placement.candidateReadyAt,
        startupReadyAt: input.party === 'startup' ? input.occurredAt : placement.startupReadyAt,
        detailsFinalizedAt: input.party === 'details' ? input.occurredAt : placement.detailsFinalizedAt,
        qstpApprovedAt: input.party === 'qstp' ? input.occurredAt : placement.qstpApprovedAt,
        updatedAt: input.occurredAt,
      };
      store.placements[store.placements.indexOf(placement)] = next;
      return Promise.resolve(ok(next));
    },
    markReady: (placementId, occurredAt) => {
      const placement = store.placements.find((row) => row.id === placementId);
      if (!placement) return Promise.resolve(err(notFound('Placement not found.')));
      const blockers = placementReadinessBlockers({
        active: placement.status === 'confirmed',
        requirements: store.placementRequirements.filter((row) => row.placementId === placement.id),
        signatures: store.signatures.filter((row) => row.placementId === placement.id),
        candidateReady: placement.candidateReadyAt !== null,
        startupReady: placement.startupReadyAt !== null,
        detailsFinal: placement.detailsFinalizedAt !== null,
        qstpApproved: placement.qstpApprovedAt !== null,
        unresolvedConflict: store.selectionConflicts.some(
          (row) => row.candidateId === placement.candidateId && row.status === 'open',
        ),
        unresolvedException: store.exceptions.some(
          (row) => row.cycleId === placement.cycleId && row.startupId === placement.startupId && row.status === 'pending',
        ),
      });
      if (blockers.length > 0) return Promise.resolve(err(conflict(blockers[0] ?? 'Placement is not ready.', { context: { blockers } })));
      const next: Placement = { ...placement, status: 'ready_to_start', updatedAt: occurredAt };
      store.placements[store.placements.indexOf(placement)] = next;
      return Promise.resolve(ok(next));
    },
    onboard: (placementId, occurredAt) => {
      const placement = store.placements.find((row) => row.id === placementId);
      if (!placement) return Promise.resolve(err(notFound('Placement not found.')));
      if (placement.status !== 'ready_to_start') return Promise.resolve(err(conflict('Only ready placements can be onboarded.')));
      const next: Placement = { ...placement, status: 'onboarded', updatedAt: occurredAt };
      store.placements[store.placements.indexOf(placement)] = next;
      return Promise.resolve(ok(next));
    },
    cancel: (placementId, reason, actorId, occurredAt) => {
      const placement = store.placements.find((row) => row.id === placementId);
      if (!placement) return Promise.resolve(err(notFound('Placement not found.')));
      if (placement.status === 'cancelled') return Promise.resolve(err(conflict('Placement is already cancelled.')));
      const next: Placement = {
        ...placement,
        status: 'cancelled',
        cancelledAt: occurredAt,
        cancellationReason: reason,
        updatedAt: occurredAt,
      };
      store.placements[store.placements.indexOf(placement)] = next;
      const selection = store.selections.find((row) => row.id === placement.selectionId);
      if (selection) {
        store.selections[store.selections.indexOf(selection)] = {
          ...selection,
          status: 'cancelled',
          releasedAt: occurredAt,
          updatedAt: occurredAt,
        };
      }
      const candidate = store.candidates.find((row) => row.id === placement.candidateId);
      if (candidate) {
        store.candidates[store.candidates.indexOf(candidate)] = {
          ...candidate,
          availability: 'available',
          updatedAt: occurredAt,
        };
      }
      const recoveryCase: RecoveryCase = {
        id: uuid() as RecoveryCase['id'],
        cycleId: placement.cycleId,
        startupId: placement.startupId,
        placementId: placement.id,
        recoverableHours: placement.committedWeeklyHours,
        status: 'potential',
        protectedUntil: null,
        reason,
        confirmedBy: null,
        redistributionRoundId: null,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      store.recoveryCases.push(recoveryCase);
      appendEvent({
        cycleId: placement.cycleId,
        entityType: 'placement',
        entityId: placement.id,
        action: 'cancelled',
        actorId,
        actorRole: 'operations',
        before: { status: placement.status },
        after: { status: 'cancelled' },
        reason,
        occurredAt,
      });
      return Promise.resolve(ok({ placement: next, recoveryCase }));
    },
  };

  const recovery: RecoveryPort = {
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.recoveryCases.filter((row) => row.cycleId === cycleId))),
    confirm: (caseId, actorId, occurredAt) => {
      const recoveryCase = store.recoveryCases.find((row) => row.id === caseId);
      if (!recoveryCase) return Promise.resolve(err(notFound('Recovery case not found.')));
      if (['exception_protected', 'replacement_protected'].includes(recoveryCase.status) && recoveryCase.protectedUntil && recoveryCase.protectedUntil >= occurredAt) {
        return Promise.resolve(err(conflict('These hours are protected until the approved deadline.')));
      }
      if (recoveryCase.status !== 'potential') return Promise.resolve(err(conflict('This recovery case cannot be confirmed.')));
      const next: RecoveryCase = { ...recoveryCase, status: 'confirmed', confirmedBy: actorId, updatedAt: occurredAt };
      store.recoveryCases[store.recoveryCases.indexOf(recoveryCase)] = next;
      return Promise.resolve(ok(next));
    },
    protect: (caseId, until, occurredAt) => {
      const recoveryCase = store.recoveryCases.find((row) => row.id === caseId);
      if (!recoveryCase) return Promise.resolve(err(notFound('Recovery case not found.')));
      if (!['potential', 'confirmed'].includes(recoveryCase.status)) return Promise.resolve(err(conflict('This recovery case cannot be protected.')));
      const next: RecoveryCase = { ...recoveryCase, status: 'replacement_protected', protectedUntil: until, updatedAt: occurredAt };
      store.recoveryCases[store.recoveryCases.indexOf(recoveryCase)] = next;
      return Promise.resolve(ok(next));
    },
    createRound: async (input) => {
      const cases = store.recoveryCases.filter((row) => input.recoveryCaseIds.includes(row.id));
      if (cases.length !== input.recoveryCaseIds.length || cases.some((row) => row.cycleId !== input.cycleId || row.status !== 'confirmed')) {
        return Promise.resolve(err(conflict('Only confirmed recovery cases from this cycle can fund a round.')));
      }
      if (input.positionDeadline >= input.selectionDeadline) {
        return Promise.resolve(err(validation('The accelerated position deadline must be before selection.')));
      }
      const reductions = cases.map((recoveryCase) => {
        const current = store.allocations.find(
          (row) =>
            row.cycleId === input.cycleId &&
            row.startupId === recoveryCase.startupId &&
            row.status === 'confirmed',
        );
        return { recoveryCase, current, nextHours: (current?.weeklyHours ?? 0) - recoveryCase.recoverableHours };
      });
      if (reductions.some((row) => row.current === undefined || ![0, 20, 30, 40, 60].includes(row.nextHours))) {
        return Promise.resolve(err(conflict('Recovered hours must leave each startup on a valid tier.')));
      }
      const round: RedistributionRound = {
        id: uuid() as RedistributionRound['id'],
        cycleId: input.cycleId,
        number: store.redistributionRounds.filter((row) => row.cycleId === input.cycleId).length + 1,
        status: 'draft',
        availableHours: cases.reduce((sum, row) => sum + row.recoverableHours, 0),
        invitations: [],
        positionDeadline: input.positionDeadline,
        selectionDeadline: input.selectionDeadline,
        createdBy: input.createdBy,
        createdAt: input.occurredAt,
        closedAt: null,
      };
      for (const reduction of reductions) {
        const current = reduction.current!;
        const reduced = await allocations.decide({
          cycleId: input.cycleId,
          startupId: reduction.recoveryCase.startupId,
          weeklyHours: reduction.nextHours,
          score: current.score,
          justification: current.justification,
          overrideReason: 'Hours transferred into a confirmed redistribution round.',
          decidedBy: input.createdBy,
          decidedAt: input.occurredAt,
          redistributionRoundId: round.id,
        });
        if (!reduced.ok) return reduced;
      }
      store.redistributionRounds.push(round);
      for (const recoveryCase of cases) {
        store.recoveryCases[store.recoveryCases.indexOf(recoveryCase)] = {
          ...recoveryCase,
          status: 'recovered',
          redistributionRoundId: round.id,
          updatedAt: input.occurredAt,
        };
      }
      return Promise.resolve(ok(round));
    },
    listRounds: (cycleId) =>
      Promise.resolve(ok(store.redistributionRounds.filter((row) => row.cycleId === cycleId))),
    invite: (roundId, startupId, proposedHours, _occurredAt) => {
      const round = store.redistributionRounds.find((row) => row.id === roundId);
      if (!round) return Promise.resolve(err(notFound('Redistribution round not found.')));
      if (!([0, 20, 30, 40, 60] as number[]).includes(proposedHours) || proposedHours > round.availableHours) {
        return Promise.resolve(err(validation('Grant must use a valid tier within the recovered hours.')));
      }
      if (round.invitations.some((row) => row.startupId === startupId)) return Promise.resolve(err(conflict('Startup is already invited.')));
      const next: RedistributionRound = {
        ...round,
        status: 'invitations',
        invitations: [...round.invitations, { startupId, status: 'invited', proposedHours: proposedHours as 0 | 20 | 30 | 40 | 60, respondedAt: null }],
      };
      store.redistributionRounds[store.redistributionRounds.indexOf(round)] = next;
      return Promise.resolve(ok(next));
    },
    respond: async (roundId, startupId, response, occurredAt) => {
      const round = store.redistributionRounds.find((row) => row.id === roundId);
      if (!round) return Promise.resolve(err(notFound('Redistribution round not found.')));
      const invitation = round.invitations.find((row) => row.startupId === startupId);
      if (!invitation || invitation.status !== 'invited') return Promise.resolve(err(conflict('There is no open invitation.')));
      const acceptedTotal = round.invitations
        .filter((row) => row.status === 'accepted')
        .reduce((sum, row) => sum + row.proposedHours, 0);
      if (response === 'accepted' && acceptedTotal + invitation.proposedHours > round.availableHours) {
        return Promise.resolve(err(conflict('The round no longer has enough hours for this grant.')));
      }
      if (response === 'accepted') {
        const current = store.allocations.find(
          (row) =>
            row.cycleId === round.cycleId &&
            row.startupId === startupId &&
            row.status === 'confirmed',
        );
        const nextTier = (current?.weeklyHours ?? 0) + invitation.proposedHours;
        if (![0, 20, 30, 40, 60].includes(nextTier)) {
          return Promise.resolve(err(conflict('This grant would not leave the startup on a valid tier.')));
        }
        const granted = await allocations.decide({
          cycleId: round.cycleId,
          startupId,
          weeklyHours: nextTier,
          score: current?.score ?? null,
          justification: 'Granted through an accepted redistribution invitation.',
          overrideReason: null,
          decidedBy: round.createdBy,
          decidedAt: occurredAt,
          redistributionRoundId: round.id,
        });
        if (!granted.ok) return granted;
      }
      const next: RedistributionRound = {
        ...round,
        status: response === 'accepted' ? 'accelerated_positions' : round.status,
        invitations: round.invitations.map((row) =>
          row.startupId === startupId ? { ...row, status: response, respondedAt: occurredAt } : row,
        ),
      };
      store.redistributionRounds[store.redistributionRounds.indexOf(round)] = next;
      return Promise.resolve(ok(next));
    },
    expireInvitations: (roundId, occurredAt) => {
      const round = store.redistributionRounds.find((row) => row.id === roundId);
      if (!round) return Promise.resolve(err(notFound('Redistribution round not found.')));
      if (occurredAt <= round.positionDeadline) {
        return Promise.resolve(err(conflict('The invitation response window is still open.')));
      }
      const next: RedistributionRound = {
        ...round,
        invitations: round.invitations.map((row) =>
          row.status === 'invited' ? { ...row, status: 'expired', respondedAt: occurredAt } : row,
        ),
      };
      store.redistributionRounds[store.redistributionRounds.indexOf(round)] = next;
      return Promise.resolve(ok(next));
    },
    closeRound: (roundId, occurredAt) => {
      const round = store.redistributionRounds.find((row) => row.id === roundId);
      if (!round) return Promise.resolve(err(notFound('Redistribution round not found.')));
      if (['closed', 'cancelled'].includes(round.status)) return Promise.resolve(err(conflict('Round is already closed.')));
      const next: RedistributionRound = { ...round, status: 'closed', closedAt: occurredAt };
      store.redistributionRounds[store.redistributionRounds.indexOf(round)] = next;
      return Promise.resolve(ok(next));
    },
  };

  const conflicts: ConflictPort = {
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.selectionConflicts.filter((row) => row.cycleId === cycleId))),
    record: (input) => {
      const record: SelectionConflict = { ...input, id: uuid() as SelectionConflict['id'] };
      store.selectionConflicts.push(record);
      return Promise.resolve(ok(record));
    },
    resolve: (id, decision, actorId, reason, occurredAt) => {
      const record = store.selectionConflicts.find((row) => row.id === id);
      if (!record) return Promise.resolve(err(notFound('Selection conflict not found.')));
      if (record.status !== 'open') return Promise.resolve(err(conflict('Conflict is already resolved.')));
      if (!reason.trim()) return Promise.resolve(err(validation('A decision reason is required.')));
      const next: SelectionConflict = {
        ...record,
        status: decision,
        resolvedBy: actorId,
        reason,
        resolvedAt: occurredAt,
      };
      store.selectionConflicts[store.selectionConflicts.indexOf(record)] = next;
      return Promise.resolve(ok(next));
    },
  };

  const fallbacks: FallbackPort = {
    listForCycle: (cycleId) =>
      Promise.resolve(ok(store.fallbackCases.filter((row) => row.cycleId === cycleId))),
    open: (input) => {
      const cycle = store.cycles.find((row) => row.id === input.cycleId);
      if (!cycle) return Promise.resolve(err(notFound('Cycle not found.')));
      if (cycle.selectionMode !== 'candidate_choice') {
        return Promise.resolve(err(conflict('Fallback applies only to candidate-choice cycles.')));
      }
      if (cycle.deadlines.offerWindow === null || input.occurredAt <= cycle.deadlines.offerWindow) {
        return Promise.resolve(err(conflict('The candidate offer window is still open.')));
      }
      if (store.fallbackCases.some((row) => row.candidateId === input.candidateId && row.status === 'open')) {
        return Promise.resolve(err(conflict('A fallback case is already open for this candidate.')));
      }
      const offers = store.selections
        .filter((row) => row.candidateId === input.candidateId && row.status === 'offered')
        .sort((a, b) => (a.offeredAt ?? a.createdAt).localeCompare(b.offeredAt ?? b.createdAt));
      if (offers.length === 0) return Promise.resolve(err(conflict('There are no open offers to fall back to.')));
      const fallback: CandidateChoiceFallback = {
        id: uuid() as CandidateChoiceFallback['id'],
        cycleId: input.cycleId,
        candidateId: input.candidateId,
        orderedOfferIds: offers.map((row) => row.id),
        currentOfferIndex: 0,
        responseDeadline: input.responseDeadline,
        status: 'open',
        openedBy: input.openedBy,
        resolvedBy: null,
        reason: null,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      };
      store.fallbackCases.push(fallback);
      return Promise.resolve(ok(fallback));
    },
    respond: async (input) => {
      const fallback = store.fallbackCases.find((row) => row.id === input.caseId);
      if (!fallback) return Promise.resolve(err(notFound('Fallback case not found.')));
      if (fallback.status !== 'open') return Promise.resolve(err(conflict('Fallback case is already resolved.')));
      if (input.occurredAt > fallback.responseDeadline) {
        return Promise.resolve(err(conflict('The current fallback response deadline has expired.')));
      }
      const selectionId = fallback.orderedOfferIds[fallback.currentOfferIndex];
      if (!selectionId) return Promise.resolve(err(conflict('There is no current fallback offer.')));
      if (input.response === 'accepted') {
        const accepted = await selections.acceptOffer({
          selectionId,
          candidateId: fallback.candidateId,
          acceptedAt: input.occurredAt,
        });
        if (!accepted.ok) return accepted;
        const next: CandidateChoiceFallback = {
          ...fallback,
          status: 'accepted',
          resolvedBy: input.actorId,
          updatedAt: input.occurredAt,
        };
        store.fallbackCases[store.fallbackCases.indexOf(fallback)] = next;
        return Promise.resolve(ok(next));
      }
      const declined = await selections.decline(selectionId, fallback.candidateId, input.occurredAt);
      if (!declined.ok) return declined;
      const nextIndex = fallback.currentOfferIndex + 1;
      const exhausted = nextIndex >= fallback.orderedOfferIds.length;
      if (!exhausted && !input.nextResponseDeadline) {
        return Promise.resolve(err(validation('Set the next fallback response deadline.')));
      }
      const next: CandidateChoiceFallback = {
        ...fallback,
        currentOfferIndex: nextIndex,
        responseDeadline: input.nextResponseDeadline ?? fallback.responseDeadline,
        status: exhausted ? 'exhausted' : 'open',
        resolvedBy: exhausted ? input.actorId : null,
        updatedAt: input.occurredAt,
      };
      store.fallbackCases[store.fallbackCases.indexOf(fallback)] = next;
      return Promise.resolve(ok(next));
    },
    override: (input) => {
      const fallback = store.fallbackCases.find((row) => row.id === input.caseId);
      if (!fallback) return Promise.resolve(err(notFound('Fallback case not found.')));
      if (!input.highRiskConfirmed || !input.reason.trim()) {
        return Promise.resolve(err(validation('Confirm the high-risk override and record a reason.')));
      }
      if (store.placements.some((row) => row.candidateId === fallback.candidateId && row.status !== 'cancelled')) {
        return Promise.resolve(err(conflict('Cancel the existing placement before overriding the candidate choice.')));
      }
      const target = store.selections.find(
        (row) => row.id === input.selectionId && row.candidateId === fallback.candidateId,
      );
      if (!target) return Promise.resolve(err(notFound('Selection not found.')));
      store.selections = store.selections.map((row) => {
        if (row.candidateId !== fallback.candidateId) return row;
        if (row.id === target.id) {
          return {
            ...row,
            status: 'accepted' as const,
            acceptedAt: input.occurredAt,
            reservedAt: input.occurredAt,
            overrideReason: input.reason,
            overriddenBy: input.actorId,
            releasedAt: null,
            updatedAt: input.occurredAt,
          };
        }
        return blocksOthers(row.status) || row.status === 'offered'
          ? { ...row, status: 'declined' as const, releasedAt: input.occurredAt, updatedAt: input.occurredAt }
          : row;
      });
      const next: CandidateChoiceFallback = {
        ...fallback,
        status: 'overridden',
        resolvedBy: input.actorId,
        reason: input.reason,
        updatedAt: input.occurredAt,
      };
      store.fallbackCases[store.fallbackCases.indexOf(fallback)] = next;
      appendEvent({
        cycleId: fallback.cycleId,
        entityType: 'fallback_case',
        entityId: fallback.id,
        action: 'candidate_choice_overridden',
        actorId: input.actorId,
        actorRole: 'program_manager',
        before: { candidateId: fallback.candidateId },
        after: { selectionId: input.selectionId },
        reason: input.reason,
        occurredAt: input.occurredAt,
      });
      return Promise.resolve(ok(next));
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
    participation,
    positionIntents,
    ratings,
    prioritization,
    activity,
    tasks,
    placements,
    requirements,
    recovery,
    conflicts,
    fallbacks,
  };
}

/** Re-exported so callers can assert against known ids in dev and tests. */
export type { Result };
