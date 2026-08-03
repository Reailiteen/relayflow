import type {
  ActivityEventId,
  CandidateId,
  CycleId,
  ParticipationId,
  PlacementId,
  PlacementRequirementId,
  PositionId,
  PrioritizationRunId,
  RecoveryCaseId,
  RedistributionRoundId,
  RequirementTemplateId,
  SelectionConflictId,
  SelectionId,
  SignatureId,
  StartupId,
  SubmissionId,
  TaskAssignmentId,
  TaskTemplateId,
  UserId,
  FallbackCaseId,
} from '../shared/ids';
import type { HourTier } from '../allocation/hours';
import type { Position, PositionStatus } from '../position/position';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ActivityActorRole =
  | 'program_manager'
  | 'operations'
  | 'viewer'
  | 'owner'
  | 'member'
  | 'supervisor'
  | 'candidate'
  | 'system';

export interface ActivityEvent {
  readonly id: ActivityEventId;
  readonly cycleId: CycleId;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly actorId: UserId | null;
  readonly actorRole: ActivityActorRole;
  readonly before: JsonValue;
  readonly after: JsonValue;
  readonly reason: string | null;
  readonly occurredAt: string;
}

export type ParticipationStatus = 'invited' | 'accepted' | 'declined' | 'suspended' | 'archived';

export interface CycleParticipation {
  readonly id: ParticipationId;
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly status: ParticipationStatus;
  readonly requestedTotalHours: number;
  readonly requestedInternCount: number;
  readonly disciplines: readonly string[];
  readonly operatorScore: number | null;
  readonly internalNotes: string | null;
  readonly startupJustification: string | null;
  readonly allocationAcknowledgedAt: string | null;
  readonly allocationAcknowledgedBy: UserId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PrioritizationRunStatus = 'draft' | 'confirmed' | 'superseded';

/**
 * A startup's outcome in one run — including the ones that were never scored.
 *
 * `status` is the field that must never be collapsed. A startup blocked for
 * missing information and a startup scored at 12 both end up with zero hours,
 * and the difference between them is the entire point: one needs chasing, the
 * other needs nothing. Only `scored` outcomes may become allocations.
 */
export interface PrioritizationOutcome {
  readonly participationId: ParticipationId | null;
  readonly startupId: StartupId;
  readonly status: PrioritizationOutcomeStatus;
  readonly score: number | null;
  readonly breakdown: Readonly<Record<string, number>> | null;
  readonly historySource: string | null;
  readonly rank: number | null;
  readonly requestedHours: number;
  readonly maximumHours: HourTier | null;
  readonly proposedHours: HourTier | null;
  /** Set when QSTP changes the proposal before confirming. Needs a reason. */
  readonly adjustedHours: HourTier | null;
  readonly adjustmentReason: string | null;
  readonly waitlistRank: number | null;
  /** True when this startup ties another and the order is not the engine's to pick. */
  readonly requiresTieResolution: boolean;
  readonly blockers: readonly JsonValue[];
  readonly signals: readonly JsonValue[];
  readonly adjustments: readonly JsonValue[];
}

export type PrioritizationOutcomeStatus =
  | 'scored'
  | 'needs_information'
  | 'awaiting_manual_scores'
  | 'not_ready'
  | 'not_fundable';

export interface PrioritizationWaitlistEntry {
  readonly startupId: StartupId;
  readonly score: number;
  /** Shared across a tie group. Display order must not decide who is offered hours. */
  readonly waitlistRank: number;
  readonly tieGroupSize: number;
  readonly requiresTieResolution: boolean;
  readonly reason: string;
}

/** The hours this outcome would actually write, or null if it writes none. */
export function effectiveHours(outcome: PrioritizationOutcome): HourTier | null {
  if (outcome.status !== 'scored') return null;
  return outcome.adjustedHours ?? outcome.proposedHours;
}

export interface PrioritizationRun {
  readonly id: PrioritizationRunId;
  readonly cycleId: CycleId;
  readonly version: number;
  readonly status: PrioritizationRunStatus;
  /** `partial_draft` means at least one startup never reached an outcome. */
  readonly completeness: 'complete_draft' | 'partial_draft';
  readonly policyVersion: string;
  readonly allocationMode: 'priority' | 'broad' | 'distribution';
  readonly allocationStrategy: string;
  readonly budgetHours: number;
  readonly maximumQualifiedHours: number;
  readonly proposedHours: number;
  readonly residualHours: number;
  /** The engine's own verdict — do not re-derive it by summing the outcomes. */
  readonly withinBudget: boolean;
  readonly outcomes: readonly PrioritizationOutcome[];
  readonly waitlist: readonly PrioritizationWaitlistEntry[];
  readonly signals: readonly JsonValue[];
  /** Frozen. Re-reading an old run must not show today's policy. */
  readonly policySnapshot: JsonValue;
  readonly createdBy: UserId;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
}

export const POSITION_LIFECYCLE: readonly PositionStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'resubmitted',
  'approved',
  'locked',
  'filled',
  'closed',
  'withdrawn',
];

const POSITION_TRANSITIONS: Readonly<Record<PositionStatus, readonly PositionStatus[]>> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'withdrawn'],
  under_review: ['changes_requested', 'approved', 'closed'],
  changes_requested: ['resubmitted', 'withdrawn'],
  resubmitted: ['under_review'],
  approved: ['locked', 'changes_requested', 'closed'],
  locked: ['approved', 'filled', 'closed'],
  filled: ['closed'],
  closed: [],
  withdrawn: [],
};

export function canTransitionPosition(from: PositionStatus, to: PositionStatus): boolean {
  return POSITION_TRANSITIONS[from].includes(to);
}

export function reservedPositionHours(positions: readonly Position[]): number {
  return positions
    .filter((position) =>
      ['submitted', 'under_review', 'changes_requested', 'resubmitted', 'approved', 'locked', 'filled'].includes(
        position.status,
      ),
    )
    .reduce((sum, position) => sum + position.hoursPerIntern * position.internCount, 0);
}

export function openSeats(position: Position, confirmedPlacements: number): number {
  return Math.max(0, position.internCount - confirmedPlacements);
}

export type TaskAssignmentStatus = 'assigned' | 'submitted' | 'reviewed' | 'withdrawn';

export interface TaskTemplate {
  readonly id: TaskTemplateId;
  readonly cycleId: CycleId;
  readonly positionId: PositionId;
  readonly title: string;
  readonly instructions: string;
  readonly createdBy: UserId;
  readonly createdAt: string;
}

export interface TaskAssignment {
  readonly id: TaskAssignmentId;
  readonly cycleId: CycleId;
  readonly templateId: TaskTemplateId | null;
  readonly positionId: PositionId;
  readonly candidateId: CandidateId;
  readonly status: TaskAssignmentStatus;
  readonly dueAt: string;
  readonly submittedAt: string | null;
  readonly lateAccepted: boolean;
  readonly fileName: string | null;
  readonly linkUrl: string | null;
  readonly reviewNotes: string | null;
  readonly reviewedBy: UserId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SelectionConflict {
  readonly id: SelectionConflictId;
  readonly cycleId: CycleId;
  readonly candidateId: CandidateId;
  readonly attemptedSelectionId: SelectionId | null;
  readonly blockingSelectionId: SelectionId;
  readonly status: 'open' | 'dismissed' | 'overridden';
  readonly previousStartupId: StartupId;
  readonly requestedStartupId: StartupId;
  readonly resolvedBy: UserId | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface CandidateChoiceFallback {
  readonly id: FallbackCaseId;
  readonly cycleId: CycleId;
  readonly candidateId: CandidateId;
  readonly orderedOfferIds: readonly SelectionId[];
  readonly currentOfferIndex: number;
  readonly responseDeadline: string;
  readonly status: 'open' | 'accepted' | 'exhausted' | 'overridden';
  readonly openedBy: UserId;
  readonly resolvedBy: UserId | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PlacementStatus = 'confirmed' | 'ready_to_start' | 'onboarded' | 'cancelled';

export interface Placement {
  readonly id: PlacementId;
  readonly cycleId: CycleId;
  readonly selectionId: SelectionId;
  readonly candidateId: CandidateId;
  readonly startupId: StartupId;
  readonly positionId: PositionId;
  readonly committedWeeklyHours: number;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly supervisorId: UserId | null;
  readonly supervisorName: string;
  readonly status: PlacementStatus;
  readonly candidateReadyAt: string | null;
  readonly startupReadyAt: string | null;
  readonly detailsFinalizedAt: string | null;
  readonly qstpApprovedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
  readonly replacementForPlacementId: PlacementId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type RequirementOwner = 'candidate' | 'startup' | 'qstp';
export type RequirementStatus =
  | 'requested'
  | 'awaiting_upload'
  | 'uploaded'
  | 'under_review'
  | 'correction_requested'
  | 'resubmitted'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'waived';

export interface DocumentRequirementTemplate {
  readonly id: RequirementTemplateId;
  readonly cycleId: CycleId;
  readonly title: string;
  readonly owner: RequirementOwner;
  readonly required: boolean;
  readonly positionId: PositionId | null;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlacementRequirement {
  readonly id: PlacementRequirementId;
  readonly placementId: PlacementId;
  readonly templateId: RequirementTemplateId | null;
  readonly title: string;
  readonly owner: RequirementOwner;
  readonly required: boolean;
  readonly status: RequirementStatus;
  readonly amendmentReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RequirementSubmission {
  readonly id: SubmissionId;
  readonly requirementId: PlacementRequirementId;
  readonly revision: number;
  readonly fileName: string;
  readonly storagePath: string;
  readonly submittedBy: UserId;
  readonly submittedAt: string;
  readonly extractedFields: readonly { key: string; extracted: string | null; confirmed: string | null }[];
  readonly correctionReason: string | null;
}

/**
 * The three parties to a placement each sign for themselves.
 *
 * The candidate signs too, and that is not a formality: they are the person
 * whose hours, dates and supervisor the agreement fixes. A placement that QSTP
 * and the startup have signed but the candidate has not is an arrangement made
 * about someone rather than with them, so `candidate_agreement` blocks Ready to
 * Start exactly like the other two.
 */
export type SignatureKind = 'qstp_agreement' | 'startup_agreement' | 'candidate_agreement';

export interface PlacementSignature {
  readonly id: SignatureId;
  readonly placementId: PlacementId;
  readonly kind: SignatureKind;
  readonly signerId: UserId;
  readonly signerName: string;
  readonly declarationAccepted: boolean;
  readonly documentOpenedAt: string;
  readonly signedAt: string;
}

/**
 * Which agreement a requirement is, if it is one.
 *
 * Agreements are ordinary document requirements since 0017 — QSTP issues one,
 * each party downloads it, signs it on paper and uploads the signed copy back.
 * They are singled out here only so the readiness list can say "the startup
 * agreement is unsigned" rather than "a required document is incomplete",
 * which is the difference between a blocker somebody can act on and one they
 * have to go looking for.
 */
export const AGREEMENT_TITLES: Readonly<Record<RequirementOwner, string>> = {
  qstp: 'QSTP placement agreement',
  startup: 'Startup placement agreement',
  candidate: 'Candidate placement agreement',
};

export interface PlacementReadinessFacts {
  readonly active: boolean;
  readonly requirements: readonly Pick<PlacementRequirement, 'required' | 'status' | 'title'>[];
  readonly candidateReady: boolean;
  readonly startupReady: boolean;
  readonly detailsFinal: boolean;
  readonly qstpApproved: boolean;
  readonly unresolvedConflict: boolean;
  readonly unresolvedException: boolean;
}

const SETTLED: readonly string[] = ['approved', 'waived'];

export function placementReadinessBlockers(facts: PlacementReadinessFacts): string[] {
  const blockers: string[] = [];
  if (!facts.active) blockers.push('Placement is not active.');

  const agreements = new Set<string>(Object.values(AGREEMENT_TITLES));
  const settled = new Set(
    facts.requirements.filter((row) => SETTLED.includes(row.status)).map((row) => row.title),
  );

  // Named individually, because "a required document is incomplete" sends
  // somebody hunting through a checklist for which one.
  for (const [owner, title] of Object.entries(AGREEMENT_TITLES)) {
    if (!settled.has(title)) blockers.push(`${label(owner)} agreement is not signed and returned.`);
  }

  if (
    facts.requirements.some(
      (row) => row.required && !SETTLED.includes(row.status) && !agreements.has(row.title),
    )
  ) {
    blockers.push('Required documents are incomplete.');
  }

  if (!facts.candidateReady) blockers.push('Candidate readiness is unconfirmed.');
  if (!facts.startupReady) blockers.push('Startup readiness is unconfirmed.');
  if (!facts.detailsFinal) blockers.push('Placement dates, hours, and supervisor are not final.');
  if (!facts.qstpApproved) blockers.push('QSTP final approval is missing.');
  if (facts.unresolvedConflict) blockers.push('A selection conflict is unresolved.');
  if (facts.unresolvedException) blockers.push('An exception is unresolved.');
  return blockers;
}

const label = (owner: string) => (owner === 'qstp' ? 'QSTP' : owner[0]?.toUpperCase() + owner.slice(1));

export type RecoveryStatus =
  | 'potential'
  | 'exception_protected'
  | 'confirmed'
  | 'recovered'
  | 'replacement_protected'
  | 'closed';

export interface RecoveryCase {
  readonly id: RecoveryCaseId;
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly placementId: PlacementId | null;
  readonly recoverableHours: number;
  readonly status: RecoveryStatus;
  readonly protectedUntil: string | null;
  readonly reason: string;
  readonly confirmedBy: UserId | null;
  readonly redistributionRoundId: RedistributionRoundId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type RedistributionStatus =
  | 'draft'
  | 'invitations'
  | 'accelerated_positions'
  | 'accelerated_selection'
  | 'closed'
  | 'cancelled';

export interface RedistributionInvitation {
  readonly startupId: StartupId;
  readonly status: 'invited' | 'accepted' | 'declined' | 'expired';
  readonly proposedHours: HourTier;
  readonly respondedAt: string | null;
}

export interface RedistributionRound {
  readonly id: RedistributionRoundId;
  readonly cycleId: CycleId;
  readonly number: number;
  readonly status: RedistributionStatus;
  readonly availableHours: number;
  readonly invitations: readonly RedistributionInvitation[];
  readonly positionDeadline: string;
  readonly selectionDeadline: string;
  readonly createdBy: UserId;
  readonly createdAt: string;
  readonly closedAt: string | null;
}

export function committedPlacementHours(placements: readonly Placement[]): number {
  return placements
    .filter((placement) => placement.status !== 'cancelled')
    .reduce((sum, placement) => sum + placement.committedWeeklyHours, 0);
}

export function recoverableAllocationHours(allocationHours: number, placements: readonly Placement[]): number {
  return Math.max(0, allocationHours - committedPlacementHours(placements));
}

export interface StageGateCheck {
  readonly key: string;
  readonly label: string;
  readonly severity: 'blocking' | 'warning';
  readonly passed: boolean;
}

export interface StageGateResult {
  readonly canAdvance: boolean;
  readonly checks: readonly StageGateCheck[];
}

export function evaluateStageGate(checks: readonly StageGateCheck[], overrideReason?: string): StageGateResult {
  const hasBlocker = checks.some((check) => check.severity === 'blocking' && !check.passed);
  const hasWarning = checks.some((check) => check.severity === 'warning' && !check.passed);
  return {
    canAdvance: !hasBlocker && (!hasWarning || Boolean(overrideReason?.trim())),
    checks,
  };
}
