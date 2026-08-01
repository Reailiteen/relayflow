import type { Result } from '@relayflow/core';
import type {
  Allocation,
  Candidate,
  CandidateDocument,
  Cycle,
  CycleId,
  ExceptionKind,
  ExceptionRequest,
  Interview,
  PoolEntry,
  Position,
  Selection,
  Startup,
  StartupId,
  StartupMember,
  CandidateId,
  ActivityEvent,
  CycleParticipation,
  PrioritizationRun,
  Placement,
  PlacementRequirement,
  RequirementSubmission,
  PlacementSignature,
  RecoveryCase,
  RedistributionRound,
  RedistributionRoundId,
  DocumentRequirementTemplate,
  TaskTemplate,
  TaskAssignment,
  SelectionConflict,
  CandidateChoiceFallback,
  DocumentId,
  InterviewId,
  PoolEntryId,
  PositionId,
  UserId,
} from '@relayflow/entities';

/**
 * What the application needs from storage, stated without saying who provides it.
 *
 * `@relayflow/logic` depends on these interfaces and nothing else, so use-cases
 * know nothing about Postgres, PostgREST or HTTP. Two adapters implement them:
 * `@relayflow/fixtures` (in-memory, what runs today) and `@relayflow/data`
 * (Supabase, for when the project exists).
 *
 * Reads are deliberately shaped around the questions the product asks — "which
 * startups have not submitted positions", not "select * where". Pushing those
 * questions down here keeps N+1 fan-out out of the use-case layer and gives the
 * SQL adapter something it can answer in one round trip.
 */

export interface CyclePort {
  findById(id: CycleId): Promise<Result<Cycle | null>>;
  /** The cycle currently being operated. Null before the first one is created. */
  findActive(): Promise<Result<Cycle | null>>;
  list(): Promise<Result<Cycle[]>>;
  create(input: CreateCycleCommand): Promise<Result<Cycle>>;
  update(input: UpdateCycleCommand): Promise<Result<Cycle>>;
  advance(input: AdvanceCycleCommand): Promise<Result<Cycle>>;
  archive(id: CycleId, archivedAt: string): Promise<Result<Cycle>>;
}

export interface CreateCycleCommand {
  readonly cycle: Omit<Cycle, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>;
  readonly cloneParticipationFrom: CycleId | null;
  readonly createdAt: string;
}

export interface UpdateCycleCommand {
  readonly cycleId: CycleId;
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly fundedWeeklyHours: number;
  readonly selectionMode: Cycle['selectionMode'];
  readonly deadlines: Cycle['deadlines'];
  readonly updatedAt: string;
}

export interface AdvanceCycleCommand {
  readonly cycleId: CycleId;
  readonly from: Cycle['stage'];
  readonly to: Cycle['stage'];
  readonly updatedAt: string;
}

export interface ParticipationPort {
  listForCycle(cycleId: CycleId): Promise<Result<CycleParticipation[]>>;
  find(cycleId: CycleId, startupId: StartupId): Promise<Result<CycleParticipation | null>>;
  save(input: Omit<CycleParticipation, 'id' | 'createdAt' | 'updatedAt'> & { occurredAt: string }): Promise<Result<CycleParticipation>>;
  acknowledge(cycleId: CycleId, startupId: StartupId, actorId: UserId, occurredAt: string): Promise<Result<CycleParticipation>>;
}

export interface PrioritizationPort {
  run(cycleId: CycleId, createdBy: UserId, createdAt: string): Promise<Result<PrioritizationRun>>;
  listForCycle(cycleId: CycleId): Promise<Result<PrioritizationRun[]>>;
  adjust(
    runId: PrioritizationRun['id'],
    startupId: StartupId,
    proposedHours: 0 | 20 | 30 | 40 | 60,
    adjustedBy: UserId,
    adjustedAt: string,
  ): Promise<Result<PrioritizationRun>>;
  confirm(runId: PrioritizationRun['id'], confirmedAt: string): Promise<Result<PrioritizationRun>>;
}

export interface ActivityPort {
  append(event: Omit<ActivityEvent, 'id'>): Promise<Result<ActivityEvent>>;
  listForCycle(cycleId: CycleId): Promise<Result<ActivityEvent[]>>;
  listForEntity(cycleId: CycleId, entityType: string, entityId: string): Promise<Result<ActivityEvent[]>>;
}

export interface TaskPort {
  listTemplates(positionId: PositionId): Promise<Result<TaskTemplate[]>>;
  saveTemplate(input: Omit<TaskTemplate, 'id'>): Promise<Result<TaskTemplate>>;
  listAssignments(candidateId: CandidateId): Promise<Result<TaskAssignment[]>>;
  listForCycle(cycleId: CycleId): Promise<Result<TaskAssignment[]>>;
  assign(input: Omit<TaskAssignment, 'id' | 'createdAt' | 'updatedAt'> & { occurredAt: string }): Promise<Result<TaskAssignment>>;
  submit(assignmentId: TaskAssignment['id'], candidateId: CandidateId, fileName: string | null, linkUrl: string | null, occurredAt: string): Promise<Result<TaskAssignment>>;
  review(assignmentId: TaskAssignment['id'], reviewerId: UserId, notes: string, occurredAt: string): Promise<Result<TaskAssignment>>;
  withdraw(assignmentId: TaskAssignment['id'], occurredAt: string): Promise<Result<TaskAssignment>>;
}

export interface PlacementPort {
  findById(id: Placement['id']): Promise<Result<Placement | null>>;
  listForCycle(cycleId: CycleId): Promise<Result<Placement[]>>;
  listForCandidate(candidateId: CandidateId): Promise<Result<Placement[]>>;
  confirmSelection(selectionId: Selection['id'], input: { startsOn: string; endsOn: string; supervisorId: UserId | null; supervisorName: string; confirmedBy: UserId; occurredAt: string }): Promise<Result<Placement>>;
  setReadiness(input: { placementId: Placement['id']; party: 'candidate' | 'startup' | 'details' | 'qstp'; actorId: UserId; occurredAt: string }): Promise<Result<Placement>>;
  markReady(placementId: Placement['id'], occurredAt: string): Promise<Result<Placement>>;
  onboard(placementId: Placement['id'], occurredAt: string): Promise<Result<Placement>>;
  cancel(placementId: Placement['id'], reason: string, actorId: UserId, occurredAt: string): Promise<Result<{ placement: Placement; recoveryCase: RecoveryCase }>>;
}

export interface RequirementPort {
  listTemplates(cycleId: CycleId): Promise<Result<DocumentRequirementTemplate[]>>;
  saveTemplate(input: Omit<DocumentRequirementTemplate, 'id' | 'createdAt' | 'updatedAt'> & { occurredAt: string }): Promise<Result<DocumentRequirementTemplate>>;
  updateTemplate(
    id: DocumentRequirementTemplate['id'],
    input: Pick<DocumentRequirementTemplate, 'title' | 'owner' | 'required' | 'active'> & {
      occurredAt: string;
    },
  ): Promise<Result<DocumentRequirementTemplate>>;
  snapshotForPlacement(placementId: Placement['id'], occurredAt: string): Promise<Result<PlacementRequirement[]>>;
  listForPlacement(placementId: Placement['id']): Promise<Result<PlacementRequirement[]>>;
  amend(input: Omit<PlacementRequirement, 'id' | 'createdAt' | 'updatedAt'> & { reason: string; occurredAt: string }): Promise<Result<PlacementRequirement>>;
  submit(input: { requirementId: PlacementRequirement['id']; fileName: string; submittedBy: UserId; extractedFields: RequirementSubmission['extractedFields']; occurredAt: string }): Promise<Result<RequirementSubmission>>;
  decide(input: { requirementId: PlacementRequirement['id']; decision: 'approved' | 'correction_requested' | 'rejected' | 'expired' | 'waived'; reason: string | null; occurredAt: string }): Promise<Result<PlacementRequirement>>;
  listSubmissions(requirementId: PlacementRequirement['id']): Promise<Result<RequirementSubmission[]>>;
  sign(input: Omit<PlacementSignature, 'id'>): Promise<Result<PlacementSignature>>;
  listSignatures(placementId: Placement['id']): Promise<Result<PlacementSignature[]>>;
}

export interface RecoveryPort {
  listForCycle(cycleId: CycleId): Promise<Result<RecoveryCase[]>>;
  confirm(caseId: RecoveryCase['id'], actorId: UserId, occurredAt: string): Promise<Result<RecoveryCase>>;
  protect(caseId: RecoveryCase['id'], until: string, occurredAt: string): Promise<Result<RecoveryCase>>;
  createRound(input: { cycleId: CycleId; recoveryCaseIds: readonly RecoveryCase['id'][]; positionDeadline: string; selectionDeadline: string; createdBy: UserId; occurredAt: string }): Promise<Result<RedistributionRound>>;
  listRounds(cycleId: CycleId): Promise<Result<RedistributionRound[]>>;
  invite(roundId: RedistributionRound['id'], startupId: StartupId, proposedHours: number, occurredAt: string): Promise<Result<RedistributionRound>>;
  respond(roundId: RedistributionRound['id'], startupId: StartupId, response: 'accepted' | 'declined', occurredAt: string): Promise<Result<RedistributionRound>>;
  expireInvitations(roundId: RedistributionRound['id'], occurredAt: string): Promise<Result<RedistributionRound>>;
  closeRound(roundId: RedistributionRound['id'], occurredAt: string): Promise<Result<RedistributionRound>>;
}

export interface ConflictPort {
  listForCycle(cycleId: CycleId): Promise<Result<SelectionConflict[]>>;
  record(input: Omit<SelectionConflict, 'id'>): Promise<Result<SelectionConflict>>;
  resolve(id: SelectionConflict['id'], decision: 'dismissed' | 'overridden', actorId: UserId, reason: string, occurredAt: string): Promise<Result<SelectionConflict>>;
}

export interface FallbackPort {
  listForCycle(cycleId: CycleId): Promise<Result<CandidateChoiceFallback[]>>;
  open(input: { cycleId: CycleId; candidateId: CandidateId; responseDeadline: string; openedBy: UserId; occurredAt: string }): Promise<Result<CandidateChoiceFallback>>;
  respond(input: { caseId: CandidateChoiceFallback['id']; response: 'accepted' | 'declined'; actorId: UserId; nextResponseDeadline: string | null; occurredAt: string }): Promise<Result<CandidateChoiceFallback>>;
  override(input: { caseId: CandidateChoiceFallback['id']; selectionId: Selection['id']; actorId: UserId; reason: string; highRiskConfirmed: boolean; occurredAt: string }): Promise<Result<CandidateChoiceFallback>>;
}

export interface StartupPort {
  findById(id: StartupId): Promise<Result<Startup | null>>;
  listForCycle(cycleId: CycleId): Promise<Result<Startup[]>>;
  /** Startups this user can act for. Empty for QSTP staff and candidates. */
  listForUser(userId: UserId): Promise<Result<Startup[]>>;
  listMembers(startupId: StartupId): Promise<Result<StartupMember[]>>;
}

export interface AllocationPort {
  listForCycle(cycleId: CycleId): Promise<Result<Allocation[]>>;
  findForStartup(cycleId: CycleId, startupId: StartupId): Promise<Result<Allocation | null>>;
  listHistoryForCycle(cycleId: CycleId): Promise<Result<Allocation[]>>;
  /**
   * Assigns or updates a startup's tier.
   *
   * The implementation must re-check the cycle budget *inside* the write, not
   * just trust the caller's earlier check — two operations staff allocating at
   * the same moment would otherwise both pass a stale read and overrun the
   * funded total.
   */
  decide(input: DecideAllocationCommand): Promise<Result<Allocation>>;
}

export interface DecideAllocationCommand {
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly weeklyHours: number;
  readonly score: number | null;
  readonly justification: string | null;
  readonly overrideReason: string | null;
  readonly decidedBy: UserId;
  readonly decidedAt: string;
  readonly redistributionRoundId: RedistributionRoundId | null;
}

export interface PositionPort {
  findById(id: PositionId): Promise<Result<Position | null>>;
  listForCycle(cycleId: CycleId): Promise<Result<Position[]>>;
  listForStartup(cycleId: CycleId, startupId: StartupId): Promise<Result<Position[]>>;
  create(input: CreatePositionCommand): Promise<Result<Position>>;
  updateDetails(id: PositionId, input: CreatePositionCommand): Promise<Result<Position>>;
  updateStatus(
    id: PositionId,
    status: Position['status'],
    reviewNote: string | null,
  ): Promise<Result<Position>>;
}

export interface CreatePositionCommand {
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly title: string;
  readonly description: string;
  readonly requiredSkills: readonly string[];
  readonly workArrangement: Position['workArrangement'];
  readonly additionalRequirements: string | null;
  readonly internCount: number;
  readonly hoursPerIntern: number;
  readonly durationWeeks: number;
  readonly supervisorName: string | null;
  readonly redistributionRoundId: RedistributionRoundId | null;
  readonly status?: 'draft' | 'submitted' | undefined;
}

export interface CandidatePort {
  findById(id: CandidateId): Promise<Result<Candidate | null>>;
  listForCycle(cycleId: CycleId): Promise<Result<Candidate[]>>;
  /** The pool shared with one position, with the candidate records attached. */
  listPool(positionId: PositionId): Promise<Result<PoolEntryWithCandidate[]>>;

  /**
   * Every pool entry in the cycle, across all positions.
   *
   * The QSTP board asks "how far has each of thirty startups got?" and needs
   * pool counts for all of them at once. Without this the read is one query per
   * position, which is a screen's layout dictating a database's access pattern.
   */
  listPoolForCycle(cycleId: CycleId): Promise<Result<PoolEntryWithCandidate[]>>;

  findPoolEntry(id: PoolEntryId): Promise<Result<PoolEntry | null>>;

  setAvailability(
    id: CandidateId,
    availability: Candidate['availability'],
    confirmedAt: string,
  ): Promise<Result<Candidate>>;

  /**
   * Bulk import from Deema or a CSV.
   *
   * Returns what was created *and* what was skipped as a duplicate, because
   * "imported 40 candidates" is not the same claim as "your file had 40 rows"
   * and an operator needs to know which they got.
   */
  importMany(input: ImportCandidatesCommand): Promise<Result<ImportResult>>;

  /**
   * Shares candidates with a position — the Stage 3 handoff QSTP controls.
   *
   * Idempotent: re-sharing someone already in the pool is a no-op rather than a
   * duplicate row, because operators will click twice.
   */
  shareWithPosition(input: SharePoolCommand): Promise<Result<{ added: number; skipped: number }>>;

  /**
   * Moves one candidate along a startup's own review pipeline.
   *
   * This is bookkeeping about the startup's process — shortlisted, interviewed,
   * rejected — and carries no claim on the person. Reserving them is
   * `selections.reserve`, and the two must not be conflated: this status is
   * advisory and private to one startup, that one is exclusive and races.
   */
  updatePoolEntry(input: UpdatePoolEntryCommand): Promise<Result<PoolEntry>>;
}

export interface UpdatePoolEntryCommand {
  readonly poolEntryId: PoolEntryId;
  readonly status: PoolEntry['status'];
  readonly reviewedAt: string;
}

export interface ImportCandidatesCommand {
  readonly cycleId: CycleId;
  readonly source: 'deema' | 'csv' | 'manual';
  readonly rows: readonly {
    fullName: string;
    email: string;
    skills: readonly string[];
    cvUrl: string | null;
    githubUrl: string | null;
  }[];
  readonly importedAt: string;
}

export interface ImportResult {
  readonly imported: number;
  /** Already in this cycle, matched on email. */
  readonly duplicates: number;
  readonly candidates: readonly Candidate[];
}

export interface SharePoolCommand {
  readonly positionId: PositionId;
  readonly candidateIds: readonly CandidateId[];
  readonly sharedAt: string;
}

export interface PoolEntryWithCandidate {
  readonly entry: PoolEntry;
  readonly candidate: Candidate;
}

export interface SelectionPort {
  /** Every claim on one candidate — what conflict resolution reads. */
  listForCandidate(candidateId: CandidateId): Promise<Result<Selection[]>>;
  listForCycle(cycleId: CycleId): Promise<Result<Selection[]>>;

  /**
   * Attempts to reserve a candidate for a position.
   *
   * **Must be atomic and must reject a second active claim.** Checking "is this
   * candidate free?" and then inserting is a race with a window measured in
   * milliseconds, and two startups clicking Select at once is the exact
   * scenario the product exists to prevent. The SQL adapter leans on a partial
   * unique index; the fixtures adapter is single-threaded.
   *
   * Returns a `conflict` error when someone already holds the candidate.
   */
  reserve(input: ReserveCommand): Promise<Result<Selection>>;

  /**
   * Records a startup's non-blocking interest, for `candidate_choice` cycles.
   *
   * The mirror image of `reserve`: it must *not* refuse because another startup
   * has already offered — several offers coexisting is the entire point. It
   * must still refuse when someone holds a blocking claim, or a startup could
   * offer to a candidate who has already been reserved and the candidate would
   * be shown a choice they do not have.
   *
   * A startup offering twice for the same position is a duplicate, not a
   * conflict, and is refused as one.
   */
  offer(input: OfferCommand): Promise<Result<Selection>>;

  /**
   * The candidate accepts one offer, in a single atomic write: the chosen claim
   * becomes `reserved`, every sibling offer becomes `declined`.
   *
   * **Must go through the same guard as `reserve`.** Accepting is where an
   * offer turns into a blocking claim, so it races with any FCFS reservation
   * and with a second acceptance, and the partial unique index is what settles
   * both. Writing the accept without that guard would reopen the exact window
   * the index exists to close.
   *
   * Returns a `conflict` error when the offer is no longer open, or when a
   * blocking claim appeared while the candidate was deciding.
   */
  acceptOffer(input: AcceptOfferCommand): Promise<Result<Selection>>;

  /** Candidate accepts a first-come reservation before QSTP confirms it. */
  acceptReservation(input: AcceptOfferCommand): Promise<Result<Selection>>;

  /** Candidate declines either an offer or reservation; history is retained. */
  decline(selectionId: Selection['id'], candidateId: CandidateId, occurredAt: string): Promise<Result<Selection>>;

  release(selectionId: Selection['id'], releasedAt: string): Promise<Result<Selection>>;
}

export interface ReserveCommand {
  readonly positionId: PositionId;
  readonly startupId: StartupId;
  readonly candidateId: CandidateId;
  readonly selectedBy: UserId;
  readonly reservedAt: string;
}

export interface OfferCommand {
  readonly positionId: PositionId;
  readonly startupId: StartupId;
  readonly candidateId: CandidateId;
  readonly selectedBy: UserId;
  readonly offeredAt: string;
}

export interface AcceptOfferCommand {
  readonly selectionId: Selection['id'];
  /** Read from the actor, never from input — the port re-checks it owns this. */
  readonly candidateId: CandidateId;
  readonly acceptedAt: string;
}

export interface ExceptionPort {
  listForCycle(cycleId: CycleId): Promise<Result<ExceptionRequest[]>>;
  listForStartup(cycleId: CycleId, startupId: StartupId): Promise<Result<ExceptionRequest[]>>;
  request(input: RequestExceptionCommand): Promise<Result<ExceptionRequest>>;
  decide(input: DecideExceptionCommand): Promise<Result<ExceptionRequest>>;
}

export interface RequestExceptionCommand {
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly kind: ExceptionKind;
  readonly reason: string;
  readonly requestedDeadline: string;
  readonly requestedBy: UserId;
}

export interface DecideExceptionCommand {
  readonly exceptionId: ExceptionRequest['id'];
  readonly decision: 'approved' | 'rejected';
  readonly grantedDeadline: string | null;
  readonly decisionNote: string | null;
  readonly decidedBy: UserId;
  readonly decidedAt: string;
}

export interface InterviewPort {
  findById(id: InterviewId): Promise<Result<Interview | null>>;
  listForPosition(positionId: PositionId): Promise<Result<Interview[]>>;
  listForCandidate(candidateId: CandidateId): Promise<Result<Interview[]>>;

  schedule(input: ScheduleInterviewCommand): Promise<Result<Interview>>;
  request(input: RequestInterviewCommand): Promise<Result<Interview>>;
  transition(input: TransitionInterviewCommand): Promise<Result<Interview>>;

  /**
   * Attaches a recording and whatever transcription produced.
   *
   * Modelled as one write because the caller needs a single answer, but the
   * status field is what matters: transcription is asynchronous and it fails.
   * A real implementation moves the interview to `processing` and a worker
   * finishes it; either way the UI reads `transcriptStatus` rather than
   * inferring success from the presence of text.
   */
  attachRecording(input: AttachRecordingCommand): Promise<Result<Interview>>;

  /** The interviewer's own verdict. Never written by the AI. */
  saveFeedback(input: SaveFeedbackCommand): Promise<Result<Interview>>;
}

export interface RequestInterviewCommand {
  readonly positionId: PositionId;
  readonly candidateId: CandidateId;
  readonly mode: Interview['mode'];
  readonly interviewerId: UserId;
  readonly createdAt: string;
}

export interface TransitionInterviewCommand {
  readonly interviewId: InterviewId;
  readonly status: Interview['status'];
  readonly scheduledFor?: string | null | undefined;
  readonly durationMinutes?: number | null | undefined;
  readonly location?: string | null | undefined;
  readonly occurredAt: string;
}

export interface ScheduleInterviewCommand {
  readonly positionId: PositionId;
  readonly candidateId: CandidateId;
  readonly mode: Interview['mode'];
  readonly scheduledFor: string;
  readonly durationMinutes: number;
  readonly location: string | null;
  readonly interviewerId: UserId;
  readonly createdAt: string;
}

export interface AttachRecordingCommand {
  readonly interviewId: InterviewId;
  readonly recordingUrl: string;
  readonly recordedAt: string;
}

export interface SaveFeedbackCommand {
  readonly interviewId: InterviewId;
  readonly feedback: string;
  readonly recommendation: Interview['recommendation'];
  readonly savedAt: string;
}

export interface DocumentPort {
  findById(id: DocumentId): Promise<Result<CandidateDocument | null>>;
  /**
   * Documents a startup owns — its own NDAs, never a candidate's ID or bank
   * details. The scoping is the point: a startup can see that its intern has
   * finished their paperwork without seeing what is in it.
   */
  listForStartup(startupId: StartupId): Promise<Result<CandidateDocument[]>>;
  listForCandidate(candidateId: CandidateId): Promise<Result<CandidateDocument[]>>;
  /** Everything waiting on QSTP verification, across the cycle. */
  listAwaitingVerification(cycleId: CycleId): Promise<Result<CandidateDocument[]>>;

  /**
   * Records an upload and whatever OCR read from it.
   *
   * Extraction is modelled as part of the write rather than a later callback
   * because the candidate is standing there waiting: they have just taken a
   * photo of their ID and the next screen asks them to check the fields. A real
   * implementation queues the OCR job and moves the document to `extracting`;
   * the contract is the same either way.
   */
  upload(input: UploadDocumentCommand): Promise<Result<CandidateDocument>>;

  /**
   * The candidate's corrections to what OCR read.
   *
   * `extracted` is never overwritten — the confirmed value is stored alongside
   * it, so "we read X, they corrected it to Y" stays answerable and the OCR's
   * accuracy stays measurable.
   */
  confirmFields(input: ConfirmFieldsCommand): Promise<Result<CandidateDocument>>;

  verify(input: VerifyDocumentCommand): Promise<Result<CandidateDocument>>;
}

export interface UploadDocumentCommand {
  readonly documentId: DocumentId;
  readonly fileName: string;
  readonly uploadedAt: string;
}

export interface ConfirmFieldsCommand {
  readonly documentId: DocumentId;
  readonly fields: readonly { key: string; value: string }[];
  readonly confirmedAt: string;
}

export interface VerifyDocumentCommand {
  readonly documentId: DocumentId;
  readonly decision: 'verified' | 'rejected';
  readonly rejectionReason: string | null;
  readonly verifiedBy: UserId;
  readonly verifiedAt: string;
}

/** The single object use-cases receive. Adapters return one of these. */
export interface Repositories {
  readonly cycles: CyclePort;
  readonly startups: StartupPort;
  readonly allocations: AllocationPort;
  readonly positions: PositionPort;
  readonly candidates: CandidatePort;
  readonly selections: SelectionPort;
  readonly exceptions: ExceptionPort;
  readonly interviews: InterviewPort;
  readonly documents: DocumentPort;
  readonly participation: ParticipationPort;
  readonly prioritization: PrioritizationPort;
  readonly activity: ActivityPort;
  readonly tasks: TaskPort;
  readonly placements: PlacementPort;
  readonly requirements: RequirementPort;
  readonly recovery: RecoveryPort;
  readonly conflicts: ConflictPort;
  readonly fallbacks: FallbackPort;
}
