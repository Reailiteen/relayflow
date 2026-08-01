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
import { recommendedTier } from '../allocation/allocation';
import { HOUR_TIERS, type HourTier } from '../allocation/hours';
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

export interface PrioritizationProposal {
  readonly participationId: ParticipationId;
  readonly startupId: StartupId;
  readonly score: number;
  readonly requestedHours: number;
  readonly proposedHours: HourTier;
  readonly rank: number;
}

export interface PrioritizationRun {
  readonly id: PrioritizationRunId;
  readonly cycleId: CycleId;
  readonly version: number;
  readonly status: PrioritizationRunStatus;
  readonly budgetHours: number;
  readonly proposedHours: number;
  readonly proposals: readonly PrioritizationProposal[];
  readonly createdBy: UserId;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
}

const descendingTiers = [...HOUR_TIERS].sort((a, b) => b - a);

/** Deterministic, replaceable fixture prioritization that always fits the budget. */
export function fitPrioritization(
  participations: readonly CycleParticipation[],
  budgetHours: number,
): PrioritizationProposal[] {
  const ranked = participations
    .filter((row) => row.status === 'accepted' && row.operatorScore !== null)
    .sort(
      (a, b) =>
        (b.operatorScore ?? 0) - (a.operatorScore ?? 0) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.startupId.localeCompare(b.startupId),
    );

  const proposals = ranked.map((row, index): PrioritizationProposal => {
    const recommended = recommendedTier(row.operatorScore ?? 0);
    const requestCeiling = [...descendingTiers].find((tier) => tier <= row.requestedTotalHours) ?? 0;
    return {
      participationId: row.id,
      startupId: row.startupId,
      score: row.operatorScore ?? 0,
      requestedHours: row.requestedTotalHours,
      proposedHours: Math.min(recommended, requestCeiling) as HourTier,
      rank: index + 1,
    };
  });

  let total = proposals.reduce((sum, row) => sum + row.proposedHours, 0);
  // Step the lowest-ranked proposals down one tier at a time until the budget fits.
  for (let index = proposals.length - 1; total > budgetHours && index >= 0; ) {
    const proposal = proposals[index];
    if (!proposal) break;
    const tierIndex = descendingTiers.indexOf(proposal.proposedHours);
    const next = descendingTiers[tierIndex + 1] ?? 0;
    total -= proposal.proposedHours - next;
    proposals[index] = { ...proposal, proposedHours: next };
    if (next === 0) index -= 1;
  }
  return proposals;
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

export interface PlacementSignature {
  readonly id: SignatureId;
  readonly placementId: PlacementId;
  readonly kind: 'qstp_agreement' | 'startup_agreement';
  readonly signerId: UserId;
  readonly signerName: string;
  readonly declarationAccepted: boolean;
  readonly documentOpenedAt: string;
  readonly signedAt: string;
}

export interface PlacementReadinessFacts {
  readonly active: boolean;
  readonly requirements: readonly Pick<PlacementRequirement, 'required' | 'status'>[];
  readonly signatures: readonly Pick<PlacementSignature, 'kind'>[];
  readonly candidateReady: boolean;
  readonly startupReady: boolean;
  readonly detailsFinal: boolean;
  readonly qstpApproved: boolean;
  readonly unresolvedConflict: boolean;
  readonly unresolvedException: boolean;
}

export function placementReadinessBlockers(facts: PlacementReadinessFacts): string[] {
  const blockers: string[] = [];
  if (!facts.active) blockers.push('Placement is not active.');
  if (facts.requirements.some((row) => row.required && !['approved', 'waived'].includes(row.status))) {
    blockers.push('Required documents are incomplete.');
  }
  const signatureKinds = new Set(facts.signatures.map((row) => row.kind));
  if (!signatureKinds.has('qstp_agreement')) blockers.push('QSTP agreement is unsigned.');
  if (!signatureKinds.has('startup_agreement')) blockers.push('Startup agreement is unsigned.');
  if (!facts.candidateReady) blockers.push('Candidate readiness is unconfirmed.');
  if (!facts.startupReady) blockers.push('Startup readiness is unconfirmed.');
  if (!facts.detailsFinal) blockers.push('Placement dates, hours, and supervisor are not final.');
  if (!facts.qstpApproved) blockers.push('QSTP final approval is missing.');
  if (facts.unresolvedConflict) blockers.push('A selection conflict is unresolved.');
  if (facts.unresolvedException) blockers.push('An exception is unresolved.');
  return blockers;
}

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
