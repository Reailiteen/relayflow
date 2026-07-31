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
}

export interface PositionPort {
  findById(id: PositionId): Promise<Result<Position | null>>;
  listForCycle(cycleId: CycleId): Promise<Result<Position[]>>;
  listForStartup(cycleId: CycleId, startupId: StartupId): Promise<Result<Position[]>>;
  create(input: CreatePositionCommand): Promise<Result<Position>>;
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
  readonly internCount: number;
  readonly hoursPerIntern: number;
  readonly durationWeeks: number;
  readonly supervisorName: string | null;
}

export interface CandidatePort {
  findById(id: CandidateId): Promise<Result<Candidate | null>>;
  listForCycle(cycleId: CycleId): Promise<Result<Candidate[]>>;
  /** The pool shared with one position, with the candidate records attached. */
  listPool(positionId: PositionId): Promise<Result<PoolEntryWithCandidate[]>>;
  setAvailability(
    id: CandidateId,
    availability: Candidate['availability'],
    confirmedAt: string,
  ): Promise<Result<Candidate>>;
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

  release(selectionId: Selection['id'], releasedAt: string): Promise<Result<Selection>>;
}

export interface ReserveCommand {
  readonly positionId: PositionId;
  readonly startupId: StartupId;
  readonly candidateId: CandidateId;
  readonly selectedBy: UserId;
  readonly reservedAt: string;
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
  listForPosition(positionId: PositionId): Promise<Result<Interview[]>>;
  listForCandidate(candidateId: CandidateId): Promise<Result<Interview[]>>;
}

export interface DocumentPort {
  listForCandidate(candidateId: CandidateId): Promise<Result<CandidateDocument[]>>;
  /** Everything waiting on QSTP verification, across the cycle. */
  listAwaitingVerification(cycleId: CycleId): Promise<Result<CandidateDocument[]>>;
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
}
