import { z } from 'zod';
import { attempt, conflict, err, forbidden, notFound, ok, validation } from '@relayflow/core';
import { ANY_STARTUP, authorize, isCandidate, isQstp, isStartup } from '@relayflow/access';
import { DEFAULT_POLICY, buildPortfolioDraft } from '@relayflow/prioritisation';
import { effectiveHours } from '@relayflow/entities';
import { buildEngineInput } from '../prioritisation/build-engine-input';
import { mapDraftToRun } from '../prioritisation/map-draft-to-run';
import {
  CYCLE_STAGES,
  HOUR_TIERS,
  activityEventId,
  candidateId,
  cycleId,
  evaluateStageGate,
  exceptionId,
  effectiveDeadline,
  fallbackCaseId,
  interviewId,
  participationId,
  placementId,
  placementRequirementId,
  placementReadinessBlockers,
  positionId,
  prioritizationRunId,
  recoveryCaseId,
  requirementTemplateId,
  redistributionRoundId,
  selectionId,
  selectionConflictId,
  stageIndex,
  submitPositionInput,
  startupId,
  taskAssignmentId,
  taskTemplateId,
  reservesHours,
  totalWeeklyHours,
  type ActivityActorRole,
  type ActivityEvent,
  type Allocation,
  type Candidate,
  type CandidateId,
  type CandidateChoiceFallback,
  type Cycle,
  type CycleId,
  type CycleParticipation,
  type DocumentRequirementTemplate,
  type ExceptionRequest,
  type JsonValue,
  type Interview,
  type Placement,
  type PositionIntent,
  type PlacementRequirement,
  type PlacementSignature,
  type PoolEntry,
  type Position,
  type PrioritizationRun,
  type RequirementSubmission,
  type RecoveryCase,
  type RedistributionRound,
  type StartupId,
  type Startup,
  type StartupRating,
  type Selection,
  type SelectionConflict,
  type StageGateCheck,
  type TaskAssignment,
  type TaskTemplate,
} from '@relayflow/entities';
import { AUTHENTICATED, defineUseCase, requireActor } from '../use-case';

const cycleInput = z.object({ cycleId });

const cycleSetup = z
  .object({
    name: z.string().trim().min(1).max(200),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    fundedWeeklyHours: z.number().int().min(1),
    selectionMode: z.enum(['first_come', 'candidate_choice']),
    deadlines: z.object({
      positionSubmission: z.iso.datetime({ offset: true }),
      candidateSelection: z.iso.datetime({ offset: true }),
      documentSubmission: z.iso.datetime({ offset: true }),
      offerWindow: z.iso.datetime({ offset: true }).nullable(),
    }),
  })
  .refine((row) => row.startsOn < row.endsOn, {
    message: 'Cycle end must follow its start.',
    path: ['endsOn'],
  })
  .refine((row) => row.deadlines.positionSubmission < row.deadlines.candidateSelection, {
    message: 'Position submission must close before selection.',
    path: ['deadlines', 'candidateSelection'],
  })
  .refine((row) => row.deadlines.candidateSelection < row.deadlines.documentSubmission, {
    message: 'Documents must be due after selection.',
    path: ['deadlines', 'documentSubmission'],
  })
  .refine((row) => row.selectionMode !== 'candidate_choice' || row.deadlines.offerWindow !== null, {
    message: 'Candidate-choice cycles need an offer window.',
    path: ['deadlines', 'offerWindow'],
  });

function actorRole(ctx: Parameters<typeof requireActor>[0]): ActivityActorRole {
  const actor = ctx.actor;
  if (isQstp(actor)) return actor.role;
  if (isCandidate(actor)) return 'candidate';
  if (isStartup(actor)) {
    return actor.affiliations.find((row) => row.status === 'active')?.role ?? 'member';
  }
  return 'system';
}

async function resolveCycle(ctx: Parameters<typeof requireActor>[0], id: CycleId) {
  const result = await ctx.repos.cycles.findById(id);
  if (!result.ok) return result;
  return result.data ? ok(result.data) : err(notFound('Cycle not found.'));
}

async function event(
  ctx: Parameters<typeof requireActor>[0],
  input: {
    cycleId: CycleId;
    entityType: string;
    entityId: string;
    action: string;
    before: JsonValue;
    after: JsonValue;
    reason?: string | null;
    occurredAt: string;
  },
) {
  const actor = requireActor(ctx);
  if (!actor.ok) return actor;
  return ctx.repos.activity.append({
    ...input,
    actorId: actor.data.userId,
    actorRole: actorRole(ctx),
    reason: input.reason ?? null,
  });
}

export const createCycle = defineUseCase({
  name: 'cycle.create',
  input: z.object({ cycle: cycleSetup, cloneParticipationFrom: cycleId.nullable().default(null) }),
  authorize: { capability: 'cycle:create' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const occurredAt = ctx.clock.now().toISOString();
    const created = await ctx.repos.cycles.create({
      cycle: { ...input.cycle, stage: 'draft' },
      cloneParticipationFrom: input.cloneParticipationFrom,
      createdAt: occurredAt,
    });
    if (!created.ok) return created;
    await event(ctx, {
      cycleId: created.data.id,
      entityType: 'cycle',
      entityId: created.data.id,
      action: input.cloneParticipationFrom ? 'created_from_clone' : 'created',
      before: null,
      after: { name: created.data.name, fundedWeeklyHours: created.data.fundedWeeklyHours },
      reason: null,
      occurredAt,
    });
    return ok(created.data);
  },
});

export const listCycles = defineUseCase({
  name: 'cycle.list',
  input: z.object({}),
  authorize: { capability: 'cycle:read' as const },
  execute: async (ctx) => {
    const cycles = await ctx.repos.cycles.list();
    if (!cycles.ok) return cycles;
    const rows = [];
    for (const cycle of cycles.data) {
      const participation = await ctx.repos.participation.listForCycle(cycle.id);
      if (!participation.ok) return participation;
      rows.push({
        cycle,
        participants: participation.data.length,
        acknowledged: participation.data.filter((row) => row.allocationAcknowledgedAt !== null)
          .length,
      });
    }
    return ok(rows);
  },
});

export const updateCycle = defineUseCase({
  name: 'cycle.update',
  input: z.object({ cycleId, cycle: cycleSetup }),
  authorize: { capability: 'cycle:update' as const },
  execute: async (ctx, input) => {
    const before = await resolveCycle(ctx, input.cycleId);
    if (!before.ok) return before;
    const occurredAt = ctx.clock.now().toISOString();
    const updated = await ctx.repos.cycles.update({
      cycleId: input.cycleId,
      ...input.cycle,
      updatedAt: occurredAt,
    });
    if (!updated.ok) return updated;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'cycle',
      entityId: input.cycleId,
      action: 'updated',
      before: { name: before.data.name, fundedWeeklyHours: before.data.fundedWeeklyHours },
      after: { name: updated.data.name, fundedWeeklyHours: updated.data.fundedWeeklyHours },
      occurredAt,
    });
    return ok(updated.data);
  },
});

export const archiveCycle = defineUseCase({
  name: 'cycle.archive',
  input: z.object({ cycleId, reason: z.string().trim().min(1).max(1000) }),
  authorize: { capability: 'cycle:update' as const },
  execute: async (ctx, input) => {
    const occurredAt = ctx.clock.now().toISOString();
    const archived = await ctx.repos.cycles.archive(input.cycleId, occurredAt);
    if (!archived.ok) return archived;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'cycle',
      entityId: input.cycleId,
      action: 'archived',
      before: { archivedAt: null },
      after: { archivedAt: occurredAt },
      reason: input.reason,
      occurredAt,
    });
    return ok(archived.data);
  },
});

export interface CycleWorkspace {
  readonly cycle: Cycle;
  readonly cycles: readonly Cycle[];
  readonly participation: readonly CycleParticipation[];
  readonly allocations: readonly Allocation[];
  readonly allocationHistory: readonly Allocation[];
  readonly prioritizationRuns: readonly PrioritizationRun[];
  /** QSTP-only. Comparative internal judgement, redacted for other portals. */
  readonly ratings: readonly StartupRating[];
  readonly positionIntents: readonly PositionIntent[];
  readonly startups: readonly Startup[];
  readonly candidates: readonly Candidate[];
  readonly poolEntries: readonly { readonly entry: PoolEntry; readonly candidate: Candidate }[];
  readonly selections: readonly Selection[];
  readonly conflicts: readonly SelectionConflict[];
  readonly interviews: readonly Interview[];
  readonly exceptions: readonly ExceptionRequest[];
  readonly positions: readonly Position[];
  readonly placements: readonly Placement[];
  readonly requirements: readonly PlacementRequirement[];
  readonly requirementTemplates: readonly DocumentRequirementTemplate[];
  readonly requirementSubmissions: readonly RequirementSubmission[];
  readonly signatures: readonly PlacementSignature[];
  readonly placementReadiness: readonly {
    readonly placementId: Placement['id'];
    readonly blockers: readonly string[];
  }[];
  readonly recoveryCases: readonly RecoveryCase[];
  readonly rounds: readonly RedistributionRound[];
  readonly activity: readonly ActivityEvent[];
  readonly fallbackCases: readonly CandidateChoiceFallback[];
  readonly tasks: readonly TaskAssignment[];
  readonly taskTemplates: readonly TaskTemplate[];
  readonly stageGateChecks: readonly StageGateCheck[];
  readonly permissions: {
    readonly manageCycle: boolean;
    readonly manageParticipation: boolean;
    readonly manageAllocation: boolean;
    readonly acknowledgeAllocation: boolean;
    readonly rateStartups: boolean;
    readonly submitPositions: boolean;
    readonly reviewPositions: boolean;
    readonly assessTasks: boolean;
    readonly selectCandidates: boolean;
    readonly manageCandidates: boolean;
    readonly resolveSelection: boolean;
    readonly runRedistribution: boolean;
    readonly verifyDocuments: boolean;
    readonly completeOnboarding: boolean;
  };
  readonly totals: {
    readonly allocated: number;
    readonly committed: number;
    readonly recoverable: number;
    readonly openSeats: number;
    readonly readyPlacements: number;
  };
}

function cycleStageGateChecks(
  cycle: Cycle,
  participation: readonly CycleParticipation[],
  allocations: readonly Allocation[],
  positions: readonly Position[],
  placements: readonly Placement[],
): StageGateCheck[] {
  if (cycle.stage === 'draft') {
    return [
      {
        key: 'participants',
        label: 'At least one startup accepted',
        severity: 'blocking',
        passed: participation.some((row) => row.status === 'accepted'),
      },
    ];
  }
  if (cycle.stage === 'allocation') {
    return [
      {
        key: 'budget',
        label: 'Published allocations fit budget',
        severity: 'blocking',
        passed:
          allocations.reduce((sum, row) => sum + row.weeklyHours, 0) <= cycle.fundedWeeklyHours,
      },
      {
        key: 'acknowledged',
        label: 'Funded startups acknowledged',
        severity: 'warning',
        passed: participation
          .filter((row) =>
            allocations.some(
              (allocation) => allocation.startupId === row.startupId && allocation.weeklyHours > 0,
            ),
          )
          .every((row) => row.allocationAcknowledgedAt !== null),
      },
    ];
  }
  if (cycle.stage === 'positions') {
    return [
      {
        key: 'approved_positions',
        label: 'Every funded startup has an approved position',
        severity: 'warning',
        passed: allocations
          .filter((row) => row.weeklyHours > 0)
          .every((allocation) =>
            positions.some(
              (position) =>
                position.startupId === allocation.startupId &&
                ['approved', 'locked', 'filled'].includes(position.status),
            ),
          ),
      },
    ];
  }
  if (cycle.stage === 'selection') {
    return [
      {
        key: 'resolved_selection',
        label: 'Selection work has been reviewed',
        severity: 'warning',
        passed: placements.length > 0,
      },
    ];
  }
  return [
    {
      key: 'placements_terminal',
      label: 'Placements are ready, onboarded, or cancelled',
      severity: 'blocking',
      passed: placements.every((row) =>
        ['ready_to_start', 'onboarded', 'cancelled'].includes(row.status),
      ),
    },
  ];
}

/** Cycle-scoped operational read model used by all three canonical portals. */
export const getCycleWorkspace = defineUseCase({
  name: 'cycle.workspace',
  input: cycleInput,
  // Tenant and candidate ownership are resolved after loading the explicit
  // cycle. Denials below intentionally return not_found to avoid existence leaks.
  authorize: AUTHENTICATED,
  execute: async (ctx, input) => {
    const cycleResult = await resolveCycle(ctx, input.cycleId);
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const [
      cycles,
      participation,
      allocations,
      allocationHistory,
      prioritizationRuns,
      startups,
      candidates,
      poolEntries,
      selections,
      conflicts,
      exceptions,
      positions,
      placements,
      requirementTemplates,
      recoveries,
      rounds,
      activity,
      fallbacks,
      tasks,
      ratings,
      positionIntents,
    ] = await Promise.all([
      ctx.repos.cycles.list(),
      ctx.repos.participation.listForCycle(cycle.id),
      ctx.repos.allocations.listForCycle(cycle.id),
      ctx.repos.allocations.listHistoryForCycle(cycle.id),
      ctx.repos.prioritization.listForCycle(cycle.id),
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.candidates.listForCycle(cycle.id),
      ctx.repos.candidates.listPoolForCycle(cycle.id),
      ctx.repos.selections.listForCycle(cycle.id),
      ctx.repos.conflicts.listForCycle(cycle.id),
      ctx.repos.exceptions.listForCycle(cycle.id),
      ctx.repos.positions.listForCycle(cycle.id),
      ctx.repos.placements.listForCycle(cycle.id),
      ctx.repos.requirements.listTemplates(cycle.id),
      ctx.repos.recovery.listForCycle(cycle.id),
      ctx.repos.recovery.listRounds(cycle.id),
      ctx.repos.activity.listForCycle(cycle.id),
      ctx.repos.fallbacks.listForCycle(cycle.id),
      ctx.repos.tasks.listForCycle(cycle.id),
      ctx.repos.ratings.listForCycle(cycle.id),
      ctx.repos.positionIntents.listForCycle(cycle.id),
    ]);
    if (!cycles.ok) return err(cycles.error);
    if (!participation.ok) return err(participation.error);
    if (!allocations.ok) return err(allocations.error);
    if (!allocationHistory.ok) return err(allocationHistory.error);
    if (!prioritizationRuns.ok) return err(prioritizationRuns.error);
    if (!startups.ok) return err(startups.error);
    if (!candidates.ok) return err(candidates.error);
    if (!poolEntries.ok) return err(poolEntries.error);
    if (!selections.ok) return err(selections.error);
    if (!conflicts.ok) return err(conflicts.error);
    if (!exceptions.ok) return err(exceptions.error);
    if (!positions.ok) return err(positions.error);
    if (!placements.ok) return err(placements.error);
    if (!requirementTemplates.ok) return err(requirementTemplates.error);
    if (!recoveries.ok) return err(recoveries.error);
    if (!rounds.ok) return err(rounds.error);
    if (!activity.ok) return err(activity.error);
    if (!fallbacks.ok) return err(fallbacks.error);
    if (!tasks.ok) return err(tasks.error);
    if (!ratings.ok) return err(ratings.error);
    if (!positionIntents.ok) return err(positionIntents.error);

    let allowedStartupIds: Set<StartupId> | null = null;
    let candidateId: CandidateId | null = null;
    if (isStartup(actor.data)) {
      allowedStartupIds = new Set(
        actor.data.affiliations
          .filter((row) => row.status === 'active')
          .map((row) => row.startupId),
      );
      if (!participation.data.some((row) => allowedStartupIds?.has(row.startupId))) {
        return err(notFound('Cycle not found.'));
      }
    } else if (isCandidate(actor.data)) {
      candidateId = actor.data.candidateId;
      const candidate = await ctx.repos.candidates.findById(candidateId);
      if (!candidate.ok) return candidate;
      if (!candidate.data || candidate.data.cycleId !== cycle.id)
        return err(notFound('Cycle not found.'));
    }

    const visibleParticipation = isQstp(actor.data)
      ? participation.data
      : allowedStartupIds
        ? participation.data
            .filter((row) => allowedStartupIds?.has(row.startupId))
            .map((row) => ({ ...row, internalNotes: null, operatorScore: null }))
        : [];
    const visibleAllocations = isQstp(actor.data)
      ? allocations.data
      : allowedStartupIds
        ? allocations.data.filter((row) => allowedStartupIds?.has(row.startupId))
        : [];
    const visiblePositions = isQstp(actor.data)
      ? positions.data
      : allowedStartupIds
        ? positions.data.filter((row) => allowedStartupIds?.has(row.startupId))
        : positions.data.filter((position) =>
            placements.data.some(
              (placement) =>
                placement.positionId === position.id && placement.candidateId === candidateId,
            ),
          );
    const visibleCandidates = isQstp(actor.data)
      ? candidates.data
      : allowedStartupIds
        ? candidates.data.filter((candidate) =>
            poolEntries.data.some(
              (row) =>
                row.candidate.id === candidate.id &&
                visiblePositions.some((position) => position.id === row.entry.positionId),
            ),
          )
        : candidates.data.filter((candidate) => candidate.id === candidateId);
    const visiblePoolEntries = isQstp(actor.data)
      ? poolEntries.data
      : allowedStartupIds
        ? poolEntries.data.filter((row) =>
            visiblePositions.some((position) => position.id === row.entry.positionId),
          )
        : poolEntries.data.filter((row) => row.candidate.id === candidateId);
    const visibleSelections = isQstp(actor.data)
      ? selections.data
      : allowedStartupIds
        ? selections.data.filter((row) => allowedStartupIds?.has(row.startupId))
        : selections.data.filter((row) => row.candidateId === candidateId);
    const cycleInterviews: Interview[] = [];
    for (const candidate of candidates.data) {
      const interviewResult = await ctx.repos.interviews.listForCandidate(candidate.id);
      if (!interviewResult.ok) return err(interviewResult.error);
      cycleInterviews.push(
        ...interviewResult.data.filter((interview) =>
          positions.data.some((position) => position.id === interview.positionId),
        ),
      );
    }
    const visibleInterviews = isQstp(actor.data)
      ? cycleInterviews
      : allowedStartupIds
        ? cycleInterviews.filter((interview) =>
            visiblePositions.some((position) => position.id === interview.positionId),
          )
        : cycleInterviews.filter((interview) => interview.candidateId === candidateId);
    const visiblePlacements = isQstp(actor.data)
      ? placements.data
      : allowedStartupIds
        ? placements.data.filter((row) => allowedStartupIds?.has(row.startupId))
        : placements.data.filter((row) => row.candidateId === candidateId);
    const visibleRecovery = isQstp(actor.data)
      ? recoveries.data
      : allowedStartupIds
        ? recoveries.data.filter((row) => allowedStartupIds?.has(row.startupId))
        : [];
    const visibleRounds = isCandidate(actor.data)
      ? []
      : allowedStartupIds
        ? rounds.data.filter((round) =>
            round.invitations.some((invite) => allowedStartupIds?.has(invite.startupId)),
          )
        : rounds.data;
    const visibleActivity = isQstp(actor.data)
      ? activity.data
      : activity.data.filter((row) => {
          if (allowedStartupIds) {
            const startupScoped = [...allowedStartupIds].some((id) => row.entityId === id);
            const ownedEntity =
              visibleParticipation.some((entity) => entity.id === row.entityId) ||
              visiblePositions.some((entity) => entity.id === row.entityId) ||
              visiblePlacements.some((entity) => entity.id === row.entityId);
            return startupScoped || ownedEntity;
          }
          return visiblePlacements.some((placement) => placement.id === row.entityId);
        });

    const requirements: PlacementRequirement[] = [];
    const requirementSubmissions: RequirementSubmission[] = [];
    const signatures: PlacementSignature[] = [];
    const taskTemplates: TaskTemplate[] = [];
    for (const position of visiblePositions) {
      const templates = await ctx.repos.tasks.listTemplates(position.id);
      if (!templates.ok) return err(templates.error);
      taskTemplates.push(...templates.data);
    }
    for (const placement of visiblePlacements) {
      const result = await ctx.repos.requirements.listForPlacement(placement.id);
      if (!result.ok) return err(result.error);
      requirements.push(...result.data);
      const signatureResult = await ctx.repos.requirements.listSignatures(placement.id);
      if (!signatureResult.ok) return err(signatureResult.error);
      signatures.push(...signatureResult.data);
      for (const requirement of result.data) {
        const mayReadSubmission =
          isQstp(actor.data) ||
          (isCandidate(actor.data) && requirement.owner === 'candidate') ||
          (allowedStartupIds !== null && requirement.owner === 'startup');
        if (!mayReadSubmission) continue;
        const submissionResult = await ctx.repos.requirements.listSubmissions(requirement.id);
        if (!submissionResult.ok) return err(submissionResult.error);
        requirementSubmissions.push(...submissionResult.data);
      }
    }

    const allocated = visibleAllocations
      .filter((row) => row.status === 'confirmed')
      .reduce((sum, row) => sum + row.weeklyHours, 0);
    const committed = visiblePlacements
      .filter((row) => row.status !== 'cancelled')
      .reduce((sum, row) => sum + row.committedWeeklyHours, 0);
    return ok<CycleWorkspace>({
      cycle,
      cycles: cycles.data.filter((row) => row.archivedAt === null),
      participation: visibleParticipation,
      allocations: visibleAllocations,
      allocationHistory: isQstp(actor.data)
        ? allocationHistory.data
        : allocationHistory.data.filter((row) => allowedStartupIds?.has(row.startupId)),
      prioritizationRuns: isQstp(actor.data) ? prioritizationRuns.data : [],
      // Ratings are comparative and internal. A startup learning its own rating
      // learns its standing against its peers, which is not QSTP's to disclose
      // as a side effect of loading a page.
      ratings: isQstp(actor.data) ? ratings.data : [],
      // Intents are the startup's own answers, so it may see them back.
      positionIntents: isQstp(actor.data)
        ? positionIntents.data
        : allowedStartupIds
          ? positionIntents.data.filter((row) => allowedStartupIds?.has(row.startupId))
          : [],
      startups: isQstp(actor.data)
        ? startups.data
        : startups.data.filter(
            (row) =>
              allowedStartupIds?.has(row.id) ||
              visiblePlacements.some((placement) => placement.startupId === row.id),
          ),
      candidates: visibleCandidates,
      poolEntries: visiblePoolEntries,
      selections: visibleSelections,
      conflicts: isQstp(actor.data) ? conflicts.data : [],
      interviews: visibleInterviews,
      exceptions: isQstp(actor.data)
        ? exceptions.data
        : allowedStartupIds
          ? exceptions.data.filter((row) => allowedStartupIds?.has(row.startupId))
          : [],
      positions: visiblePositions,
      placements: visiblePlacements,
      requirements,
      requirementTemplates: isCandidate(actor.data)
        ? []
        : requirementTemplates.data.filter(
            (row) =>
              isQstp(actor.data) ||
              (row.owner === 'startup' &&
                visiblePositions.some((position) => position.id === row.positionId)),
          ),
      requirementSubmissions,
      signatures,
      placementReadiness: visiblePlacements.map((placement) => ({
        placementId: placement.id,
        blockers: placementReadinessBlockers({
          active: placement.status === 'confirmed',
          requirements: requirements.filter((row) => row.placementId === placement.id),
          candidateReady: placement.candidateReadyAt !== null,
          startupReady: placement.startupReadyAt !== null,
          detailsFinal: placement.detailsFinalizedAt !== null,
          qstpApproved: placement.qstpApprovedAt !== null,
          unresolvedConflict: conflicts.data.some(
            (row) => row.candidateId === placement.candidateId && row.status === 'open',
          ),
          unresolvedException: exceptions.data.some(
            (row) =>
              row.startupId === placement.startupId &&
              row.cycleId === placement.cycleId &&
              row.status === 'pending',
          ),
        }),
      })),
      recoveryCases: visibleRecovery,
      rounds: visibleRounds,
      activity: visibleActivity,
      fallbackCases: isQstp(actor.data)
        ? fallbacks.data
        : fallbacks.data.filter((row) => row.candidateId === candidateId),
      tasks: isQstp(actor.data)
        ? tasks.data
        : allowedStartupIds
          ? tasks.data.filter((task) =>
              visiblePositions.some((position) => position.id === task.positionId),
            )
          : tasks.data.filter((task) => task.candidateId === candidateId),
      taskTemplates,
      stageGateChecks: isQstp(actor.data)
        ? cycleStageGateChecks(
            cycle,
            participation.data,
            allocations.data,
            positions.data,
            placements.data,
          )
        : [],
      permissions: {
        manageCycle: authorize(actor.data, { capability: 'cycle:advance_stage' }).ok,
        manageParticipation: authorize(actor.data, { capability: 'startup:manage' }).ok,
        manageAllocation: authorize(actor.data, { capability: 'allocation:decide' }).ok,
        rateStartups: authorize(actor.data, { capability: 'rating:submit' }).ok,
        acknowledgeAllocation:
          allowedStartupIds !== null &&
          [...allowedStartupIds].some(
            (id) =>
              authorize(actor.data, { capability: 'allocation:acknowledge', startupId: id }).ok,
          ),
        submitPositions:
          allowedStartupIds !== null &&
          [...allowedStartupIds].some(
            (id) => authorize(actor.data, { capability: 'position:submit', startupId: id }).ok,
          ),
        reviewPositions: authorize(actor.data, { capability: 'position:review' }).ok,
        assessTasks: authorize(actor.data, { capability: 'task:assess' }).ok,
        selectCandidates:
          allowedStartupIds !== null &&
          [...allowedStartupIds].some(
            (id) => authorize(actor.data, { capability: 'selection:create', startupId: id }).ok,
          ),
        manageCandidates: authorize(actor.data, { capability: 'candidate:import' }).ok,
        resolveSelection: authorize(actor.data, { capability: 'selection:resolve_conflict' }).ok,
        runRedistribution: authorize(actor.data, { capability: 'redistribution:run' }).ok,
        verifyDocuments: authorize(actor.data, { capability: 'document:verify' }).ok,
        completeOnboarding: authorize(actor.data, { capability: 'onboarding:complete' }).ok,
      },
      totals: {
        allocated,
        committed,
        recoverable: Math.max(0, allocated - committed),
        openSeats: visiblePositions.reduce((sum, position) => {
          const filled = visiblePlacements.filter(
            (placement) => placement.positionId === position.id && placement.status !== 'cancelled',
          ).length;
          return sum + Math.max(0, position.internCount - filled);
        }, 0),
        readyPlacements: visiblePlacements.filter((row) => row.status === 'ready_to_start').length,
      },
    });
  },
});

const participationInput = z.object({
  cycleId,
  startupId,
  status: z.enum(['invited', 'accepted', 'declined', 'suspended', 'archived']),
  requestedTotalHours: z.number().int().min(0).max(600),
  requestedInternCount: z.number().int().min(0).max(30),
  disciplines: z.array(z.string().trim().min(1).max(80)).max(20),
  operatorScore: z.number().min(0).max(100).nullable(),
  internalNotes: z.string().trim().max(3000).nullable(),
  startupJustification: z.string().trim().max(2000).nullable(),
});

export const saveParticipation = defineUseCase({
  name: 'cycle.saveParticipation',
  input: participationInput,
  authorize: { capability: 'startup:manage' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const cycle = await resolveCycle(ctx, input.cycleId);
    if (!cycle.ok) return cycle;
    if (cycle.data.stage !== 'draft' && cycle.data.stage !== 'allocation') {
      return err(validation('Participation can only change during setup or allocation.'));
    }
    const before = await ctx.repos.participation.find(input.cycleId, input.startupId);
    if (!before.ok) return before;
    const occurredAt = ctx.clock.now().toISOString();
    const saved = await ctx.repos.participation.save({
      ...input,
      allocationAcknowledgedAt: before.data?.allocationAcknowledgedAt ?? null,
      allocationAcknowledgedBy: before.data?.allocationAcknowledgedBy ?? null,
      occurredAt,
    });
    if (!saved.ok) return saved;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'participation',
      entityId: saved.data.id,
      action: before.data ? 'updated' : 'created',
      before: before.data
        ? { status: before.data.status, requestedTotalHours: before.data.requestedTotalHours }
        : null,
      after: { status: saved.data.status, requestedTotalHours: saved.data.requestedTotalHours },
      occurredAt,
    });
    return ok(saved.data);
  },
});

export const acknowledgeAllocation = defineUseCase({
  name: 'allocation.acknowledge',
  input: cycleInput,
  authorize: { capability: 'allocation:acknowledge' as const, startupId: ANY_STARTUP },
  execute: async (ctx, input) => {
    if (!isStartup(ctx.actor))
      return err(forbidden('Only a startup can acknowledge an allocation.'));
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const startup = ctx.actor.affiliations.find((row) => row.status === 'active');
    if (!startup) return err(notFound('Cycle not found.'));
    const scoped = authorize(ctx.actor, {
      capability: 'allocation:acknowledge',
      startupId: startup.startupId,
    });
    if (!scoped.ok) return scoped;
    return ctx.repos.participation.acknowledge(
      input.cycleId,
      startup.startupId,
      actor.data.userId,
      ctx.clock.now().toISOString(),
    );
  },
});

export const requestCycleException = defineUseCase({
  name: 'exception.requestForCycle',
  input: z.object({ cycleId, kind: z.enum(['position_submission', 'candidate_selection']), reason: z.string().trim().min(10).max(2000), requestedDeadline: z.iso.datetime({ offset: true }) }),
  authorize: { capability: 'exception:request' as const, startupId: ANY_STARTUP },
  execute: async (ctx, input) => {
    if (!isStartup(ctx.actor)) return err(notFound('Cycle not found.'));
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const startup = ctx.actor.affiliations.find((row) => row.status === 'active');
    if (!startup) return err(notFound('Cycle not found.'));
    const cycle = await resolveCycle(ctx, input.cycleId);
    if (!cycle.ok) return cycle;
    const existing = await ctx.repos.exceptions.listForStartup(input.cycleId, startup.startupId);
    if (!existing.ok) return existing;
    if (existing.data.some((row) => row.kind === input.kind && ['pending', 'approved'].includes(row.status))) return err(conflict('An open or approved exception already exists for this deadline.'));
    const current = input.kind === 'position_submission' ? cycle.data.deadlines.positionSubmission : cycle.data.deadlines.candidateSelection;
    if (ctx.clock.now().toISOString() >= current) return err(conflict('Extension requests must be submitted before the effective deadline.'));
    if (input.requestedDeadline <= current) return err(validation('The requested deadline must be later than the current deadline.'));
    const requested = await ctx.repos.exceptions.request({ cycleId: input.cycleId, startupId: startup.startupId, kind: input.kind, reason: input.reason, requestedDeadline: input.requestedDeadline, requestedBy: actor.data.userId });
    if (!requested.ok) return requested;
    await event(ctx, { cycleId: input.cycleId, entityType: 'exception', entityId: requested.data.id, action: 'requested', before: null, after: { kind: input.kind, requestedDeadline: input.requestedDeadline }, reason: input.reason, occurredAt: requested.data.createdAt });
    return requested;
  },
});

export const decideCycleException = defineUseCase({
  name: 'exception.decideForCycle',
  input: z.object({ cycleId, exceptionId, decision: z.enum(['approved', 'rejected']), grantedDeadline: z.iso.datetime({ offset: true }).nullable().default(null), decisionNote: z.string().trim().max(2000).nullable().default(null) }).refine((row) => row.decision === 'rejected' || row.grantedDeadline !== null, { message: 'Approving requires a granted deadline.', path: ['grantedDeadline'] }),
  authorize: { capability: 'exception:decide' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const rows = await ctx.repos.exceptions.listForCycle(input.cycleId);
    if (!rows.ok) return rows;
    const request = rows.data.find((row) => row.id === input.exceptionId);
    if (!request) return err(notFound('Exception request not found.'));
    if (request.status !== 'pending') return err(conflict('This exception request is no longer pending.'));
    const occurredAt = ctx.clock.now().toISOString();
    const decided = await ctx.repos.exceptions.decide({ exceptionId: input.exceptionId, decision: input.decision, grantedDeadline: input.grantedDeadline, decisionNote: input.decisionNote, decidedBy: actor.data.userId, decidedAt: occurredAt });
    if (!decided.ok) return decided;
    await event(ctx, { cycleId: input.cycleId, entityType: 'exception', entityId: input.exceptionId, action: input.decision, before: { status: request.status }, after: { status: decided.data.status, grantedDeadline: decided.data.grantedDeadline }, reason: input.decisionNote, occurredAt });
    return decided;
  },
});

export const runPrioritization = defineUseCase({
  name: 'allocation.runPrioritization',
  input: cycleInput,
  authorize: { capability: 'prioritization:run' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const cycle = await resolveCycle(ctx, input.cycleId);
    if (!cycle.ok) return cycle;
    if (cycle.data.stage !== 'allocation')
      return err(validation('Prioritization only runs during allocation.'));

    const [startups, participations, intents, ratings] = await Promise.all([
      ctx.repos.startups.listForCycle(input.cycleId),
      ctx.repos.participation.listForCycle(input.cycleId),
      ctx.repos.positionIntents.listForCycle(input.cycleId),
      ctx.repos.ratings.listForCycle(input.cycleId),
    ]);
    if (!startups.ok) return startups;
    if (!participations.ok) return participations;
    if (!intents.ok) return intents;
    if (!ratings.ok) return ratings;

    // The single throw/Result boundary. The engine throws on a broken invariant
    // — an exact tie handed unequal hours, say — and those must not be quietly
    // converted into a Result and published.
    const draft = await attempt(() =>
      buildPortfolioDraft(
        buildEngineInput({
          cycle: cycle.data,
          startups: startups.data,
          participations: participations.data,
          intents: intents.data,
          ratings: ratings.data,
        }),
      ),
    );
    if (!draft.ok) return draft;

    return ctx.repos.prioritization.create(
      mapDraftToRun(
        draft.data,
        participations.data,
        DEFAULT_POLICY,
        actor.data.userId,
        ctx.clock.now().toISOString(),
      ),
    );
  },
});

export const adjustPrioritization = defineUseCase({
  name: 'allocation.adjustPrioritization',
  input: z.object({
    cycleId,
    runId: prioritizationRunId,
    startupId,
    proposedHours: z.union([
      z.literal(0),
      z.literal(20),
      z.literal(30),
      z.literal(40),
      z.literal(60),
    ]),
    reason: z.string().trim().min(10).max(2000),
    /** Explicit acknowledgement that this splits an exact-score tie. */
    breakTie: z.boolean().default(false),
  }),
  authorize: { capability: 'allocation:decide' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const cycle = await resolveCycle(ctx, input.cycleId);
    if (!cycle.ok) return cycle;
    if (cycle.data.stage !== 'allocation') {
      return err(conflict('Allocation proposals can only be adjusted during allocation.'));
    }
    const runs = await ctx.repos.prioritization.listForCycle(input.cycleId);
    if (!runs.ok) return runs;
    const source = runs.data.find((row) => row.id === input.runId && row.status === 'draft');
    if (!source) return err(notFound('Draft prioritization run not found.'));
    const before = source.outcomes.find((row) => row.startupId === input.startupId);
    if (!before) return err(notFound('That startup is not in this run.'));
    if (before.status !== 'scored') {
      return err(
        conflict(
          `${before.status.replace(/_/g, ' ')} is not a tier. Resolve what is blocking this startup and re-run.`,
        ),
      );
    }

    // An exact-score tie must receive identical hours — the engine asserts it
    // and throws on the next run if it does not hold. Moving one member of a
    // tied pair is therefore a decision to break the tie, and it needs to be
    // taken deliberately rather than discovered as an opaque failure later.
    const tied = source.outcomes.filter(
      (row) => row.status === 'scored' && row.score === before.score && row.startupId !== before.startupId,
    );
    if (tied.length > 0 && !input.breakTie) {
      return err(
        conflict(
          `This startup is tied on ${before.score} with ${tied.length} other${tied.length > 1 ? 's' : ''}. ` +
            'Adjusting only one of them breaks the equal-treatment rule — confirm that is what you mean.',
        ),
      );
    }

    const occurredAt = ctx.clock.now().toISOString();
    const adjusted = await ctx.repos.prioritization.adjust(
      source.id,
      input.startupId,
      input.proposedHours,
      input.reason,
      actor.data.userId,
      occurredAt,
    );
    if (!adjusted.ok) return adjusted;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'prioritization_run',
      entityId: adjusted.data.id,
      action: 'proposal_adjusted',
      before: { runId: source.id, startupId: input.startupId, hours: before.proposedHours },
      after: {
        runId: adjusted.data.id,
        startupId: input.startupId,
        hours: input.proposedHours,
        brokeTie: tied.length > 0,
      },
      reason: input.reason,
      occurredAt,
    });
    return adjusted;
  },
});

export const publishAllocations = defineUseCase({
  name: 'allocation.publish',
  input: z.object({
    cycleId,
    runId: prioritizationRunId,
    /**
     * Required when the draft is incomplete. Publishing a partial draft drops
     * every startup that never reached an outcome, so it cannot be the default.
     */
    acknowledgeIncomplete: z.boolean().default(false),
    incompleteReason: z.string().trim().min(10).max(2000).nullable().default(null),
  }),
  authorize: { capability: 'allocation:decide' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const cycle = await resolveCycle(ctx, input.cycleId);
    if (!cycle.ok) return cycle;
    const runs = await ctx.repos.prioritization.listForCycle(input.cycleId);
    if (!runs.ok) return runs;
    const run = runs.data.find((row) => row.id === input.runId);
    if (!run || run.status !== 'draft') return err(notFound('Draft prioritization run not found.'));

    // The engine's own verdict, not a re-sum of the outcomes. A strategy can
    // return a total that happens to fit while still reporting that it could
    // not honour the requested distribution.
    if (!run.withinBudget) return err(validation('Proposals exceed the cycle budget.'));

    const blocked = run.outcomes.filter((row) => row.status !== 'scored');
    if (run.completeness === 'partial_draft') {
      const unevaluated = blocked.filter(
        (row) => row.status === 'needs_information' || row.status === 'awaiting_manual_scores',
      );
      if (!input.acknowledgeIncomplete || !input.incompleteReason) {
        return err(
          validation(
            `${unevaluated.length} startup${unevaluated.length === 1 ? '' : 's'} ` +
              'never reached an outcome. Publishing now leaves them with nothing — ' +
              'confirm that is intended and say why.',
          ),
        );
      }
    }

    const occurredAt = ctx.clock.now().toISOString();

    // Only `scored` startups become allocations.
    //
    // The other four statuses get NO allocation row at all. A 0h allocation is
    // indistinguishable from "we evaluated you and you did not qualify", and
    // these startups were never evaluated — one needs chasing for documents,
    // another needs a rating, another needs to fix its supervision plan. They
    // stay visible on the run, which is where that work is tracked.
    for (const outcome of run.outcomes) {
      if (outcome.status !== 'scored') continue;
      const hours = effectiveHours(outcome);
      if (hours === null) continue;
      const participation = await ctx.repos.participation.find(input.cycleId, outcome.startupId);
      if (!participation.ok) return participation;
      const decided = await ctx.repos.allocations.decide({
        cycleId: input.cycleId,
        startupId: outcome.startupId,
        weeklyHours: hours,
        score: outcome.score,
        justification: participation.data?.startupJustification ?? null,
        overrideReason: outcome.adjustmentReason,
        decidedBy: actor.data.userId,
        decidedAt: occurredAt,
        redistributionRoundId: null,
      });
      if (!decided.ok) return decided;

      // `operatorScore` is now derived, not entered. Writing it here keeps the
      // existing dashboards working while the six ratings behind it stay the
      // real record.
      if (participation.data && outcome.score !== null) {
        const saved = await ctx.repos.participation.save({
          ...participation.data,
          operatorScore: outcome.score,
          occurredAt,
        });
        if (!saved.ok) return saved;
      }
    }

    const confirmed = await ctx.repos.prioritization.confirm(run.id, occurredAt);
    if (!confirmed.ok) return confirmed;

    // Each blocked startup is recorded by name and reason, so "who still needs
    // something from us?" is answerable from the audit log alone.
    for (const outcome of blocked) {
      await event(ctx, {
        cycleId: input.cycleId,
        entityType: 'prioritization_run',
        entityId: run.id,
        action: 'startup_not_allocated',
        before: null,
        after: {
          startupId: outcome.startupId,
          status: outcome.status,
          blockers: outcome.blockers,
        },
        reason: input.incompleteReason,
        occurredAt,
      });
    }

    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'cycle',
      entityId: input.cycleId,
      action: 'allocations_published',
      before: null,
      after: {
        runId: run.id,
        version: run.version,
        hours: run.proposedHours,
        allocated: run.outcomes.filter((row) => row.status === 'scored').length,
        notAllocated: blocked.length,
        residualHours: run.residualHours,
      },
      reason: input.incompleteReason,
      occurredAt,
    });
    return ok(confirmed.data);
  },
});

export const advanceCycleStage = defineUseCase({
  name: 'cycle.advanceStage',
  input: z.object({
    cycleId,
    to: z.enum(CYCLE_STAGES),
    warningOverrideReason: z.string().trim().max(2000).nullable().default(null),
  }),
  authorize: { capability: 'cycle:advance_stage' as const },
  execute: async (ctx, input) => {
    const cycle = await resolveCycle(ctx, input.cycleId);
    if (!cycle.ok) return cycle;
    if (stageIndex(input.to) !== stageIndex(cycle.data.stage) + 1) {
      return err(validation('Cycles advance exactly one stage at a time.'));
    }
    const [participation, allocations, positions, placements] = await Promise.all([
      ctx.repos.participation.listForCycle(input.cycleId),
      ctx.repos.allocations.listForCycle(input.cycleId),
      ctx.repos.positions.listForCycle(input.cycleId),
      ctx.repos.placements.listForCycle(input.cycleId),
    ]);
    if (!participation.ok) return err(participation.error);
    if (!allocations.ok) return err(allocations.error);
    if (!positions.ok) return err(positions.error);
    if (!placements.ok) return err(placements.error);
    const checks = cycleStageGateChecks(
      cycle.data,
      participation.data,
      allocations.data,
      positions.data,
      placements.data,
    );
    const gate = evaluateStageGate(checks, input.warningOverrideReason ?? undefined);
    if (!gate.canAdvance) {
      return err(validation('The stage gate is not ready.', { context: { checks: gate.checks } }));
    }
    const occurredAt = ctx.clock.now().toISOString();
    const advanced = await ctx.repos.cycles.advance({
      cycleId: input.cycleId,
      from: cycle.data.stage,
      to: input.to,
      updatedAt: occurredAt,
    });
    if (!advanced.ok) return advanced;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'cycle',
      entityId: input.cycleId,
      action: 'stage_advanced',
      before: { stage: cycle.data.stage },
      after: { stage: input.to },
      reason: input.warningOverrideReason,
      occurredAt,
    });
    return ok({ cycle: advanced.data, gate });
  },
});

export const transitionPosition = defineUseCase({
  name: 'position.transition',
  input: z.object({
    cycleId,
    positionId,
    to: z.enum([
      'submitted',
      'under_review',
      'changes_requested',
      'resubmitted',
      'approved',
      'locked',
      'filled',
      'closed',
      'withdrawn',
    ]),
    reason: z.string().trim().max(2000).nullable().default(null),
  }),
  authorize: (ctx, _input) =>
    isQstp(ctx.actor)
      ? { capability: 'position:review' as const }
      : { capability: 'position:submit' as const, startupId: ANY_STARTUP },
  execute: async (ctx, input) => {
    const position = await ctx.repos.positions.findById(input.positionId);
    if (!position.ok) return position;
    if (!position.data || position.data.cycleId !== input.cycleId)
      return err(notFound('Position not found.'));
    const qstp = isQstp(ctx.actor);
    if (!qstp) {
      const scoped = authorize(ctx.actor, {
        capability: 'position:submit',
        startupId: position.data.startupId,
      });
      if (!scoped.ok) return err(notFound('Position not found.'));
      if (!['submitted', 'resubmitted', 'withdrawn'].includes(input.to))
        return err(forbidden('Only QSTP can review or lock a position.'));
    }
    if (position.data.status === 'locked' && input.to === 'approved' && !input.reason?.trim()) {
      return err(validation('Reopening a locked position requires a reason.'));
    }
    if (input.to === 'changes_requested' && !input.reason?.trim()) {
      return err(validation('Explain what needs changing.'));
    }
    const updated = await ctx.repos.positions.updateStatus(
      input.positionId,
      input.to,
      input.reason,
    );
    if (!updated.ok) return updated;
    const occurredAt = ctx.clock.now().toISOString();
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'position',
      entityId: input.positionId,
      action: input.to,
      before: { status: position.data.status },
      after: { status: input.to },
      reason: input.reason,
      occurredAt,
    });
    return ok(updated.data);
  },
});

export const savePosition = defineUseCase({
  name: 'position.save',
  input: submitPositionInput.extend({
    cycleId,
    positionId: positionId.nullable().default(null),
    redistributionRoundId: redistributionRoundId.nullable().default(null),
    action: z.enum(['draft', 'submit']),
  }),
  authorize: { capability: 'position:submit' as const, startupId: ANY_STARTUP },
  execute: async (ctx, input) => {
    if (!isStartup(ctx.actor)) return err(forbidden('Only a startup can manage positions.'));
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const startup = ctx.actor.affiliations.find((row) => row.status === 'active');
    if (!startup) return err(forbidden('You are not an active member of a startup.'));
    const cycle = await resolveCycle(ctx, input.cycleId);
    if (!cycle.ok) return cycle;
    if (cycle.data.stage !== 'positions' && !(cycle.data.stage === 'completion' && input.redistributionRoundId)) {
      return err(forbidden('Position collection is not open for this cycle.'));
    }
    const [allocation, participation, exceptions, positions] = await Promise.all([
      ctx.repos.allocations.findForStartup(input.cycleId, startup.startupId),
      ctx.repos.participation.find(input.cycleId, startup.startupId),
      ctx.repos.exceptions.listForStartup(input.cycleId, startup.startupId),
      ctx.repos.positions.listForStartup(input.cycleId, startup.startupId),
    ]);
    if (!allocation.ok) return allocation;
    if (!participation.ok) return participation;
    if (!exceptions.ok) return exceptions;
    if (!positions.ok) return positions;
    if (!allocation.data || allocation.data.status !== 'confirmed' || allocation.data.weeklyHours === 0) return err(forbidden('This startup has no funded allocation for position collection.'));
    if (participation.data?.status !== 'accepted' || !participation.data.allocationAcknowledgedAt) return err(forbidden('Acknowledge the published allocation before creating positions.'));
    const existing = input.positionId ? positions.data.find((row) => row.id === input.positionId) : null;
    if (input.positionId && (!existing || !['draft', 'changes_requested'].includes(existing.status))) return err(notFound('Editable position not found.'));
    let deadline = effectiveDeadline(cycle.data.deadlines.positionSubmission, exceptions.data, 'position_submission');
    if (input.redistributionRoundId) {
      const rounds = await ctx.repos.recovery.listRounds(input.cycleId);
      if (!rounds.ok) return rounds;
      const round = rounds.data.find((row) => row.id === input.redistributionRoundId);
      if (!round || !round.invitations.some((row) => row.startupId === startup.startupId && row.status === 'accepted')) return err(notFound('Redistribution invitation not found.'));
      deadline = round.positionDeadline;
    }
    if (input.action === 'submit' && ctx.clock.now().toISOString() > deadline) return err(forbidden('The effective position deadline has passed.'));
    const requested = input.internCount * input.hoursPerIntern;
    const held = positions.data
      .filter((row) => row.id !== input.positionId && reservesHours(row.status))
      .reduce((sum, row) => sum + totalWeeklyHours(row), 0);
    if (input.action === 'submit' && held + requested > allocation.data.weeklyHours) return err(validation(`This role needs ${requested} weekly hours but only ${Math.max(0, allocation.data.weeklyHours - held)} remain.`));
    const details = {
      cycleId: input.cycleId,
      startupId: startup.startupId,
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
      status: input.action === 'draft' ? 'draft' as const : 'submitted' as const,
    };
    const saved = existing
      ? await ctx.repos.positions.updateDetails(existing.id, details)
      : await ctx.repos.positions.create(details);
    if (!saved.ok) return saved;
    let final = saved.data;
    if (existing && input.action === 'submit') {
      const transitioned = await ctx.repos.positions.updateStatus(existing.id, existing.status === 'draft' ? 'submitted' : 'resubmitted', existing.status === 'changes_requested' ? 'Startup resubmitted corrected position details.' : null);
      if (!transitioned.ok) return transitioned;
      final = transitioned.data;
    }
    const occurredAt = ctx.clock.now().toISOString();
    await event(ctx, { cycleId: input.cycleId, entityType: 'position', entityId: final.id, action: existing ? (input.action === 'submit' ? 'resubmitted' : 'draft_updated') : (input.action === 'submit' ? 'submitted' : 'draft_created'), before: existing ? { status: existing.status } : null, after: { status: final.status, weeklyHours: requested }, occurredAt });
    return ok(final);
  },
});

export const confirmPlacement = defineUseCase({
  name: 'placement.confirmSelection',
  input: z
    .object({
      cycleId,
      selectionId,
      startsOn: z.iso.date(),
      endsOn: z.iso.date(),
      supervisorName: z.string().trim().min(1).max(200),
    })
    .refine((row) => row.startsOn < row.endsOn, {
      message: 'Placement end date must follow its start date.',
      path: ['endsOn'],
    }),
  authorize: { capability: 'onboarding:complete' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const cycle = await resolveCycle(ctx, input.cycleId);
    if (!cycle.ok) return cycle;
    const occurredAt = ctx.clock.now().toISOString();
    const confirmed = await ctx.repos.placements.confirmSelection(input.selectionId, {
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      supervisorId: null,
      supervisorName: input.supervisorName,
      confirmedBy: actor.data.userId,
      occurredAt,
    });
    if (!confirmed.ok) return confirmed;
    await event(ctx, { cycleId: input.cycleId, entityType: 'placement', entityId: confirmed.data.id, action: 'confirmed', before: null, after: { selectionId: input.selectionId, committedWeeklyHours: confirmed.data.committedWeeklyHours }, occurredAt });
    return confirmed;
  },
});

export const setPlacementReadiness = defineUseCase({
  name: 'placement.confirmReadiness',
  input: z.object({
    cycleId,
    placementId,
    party: z.enum(['candidate', 'startup', 'details', 'qstp']),
  }),
  authorize: { kind: 'authenticated' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const placement = await ctx.repos.placements.findById(input.placementId);
    if (!placement.ok) return placement;
    if (!placement.data || placement.data.cycleId !== input.cycleId)
      return err(notFound('Placement not found.'));
    const allowed =
      (input.party === 'candidate' &&
        isCandidate(actor.data) &&
        actor.data.candidateId === placement.data.candidateId) ||
      (input.party === 'startup' &&
        isStartup(actor.data) &&
        actor.data.affiliations.some(
          (row) => row.startupId === placement.data?.startupId && row.status === 'active',
        )) ||
      ((input.party === 'details' || input.party === 'qstp') &&
        isQstp(actor.data) &&
        actor.data.role !== 'viewer');
    if (!allowed) return err(notFound('Placement not found.'));
    const occurredAt = ctx.clock.now().toISOString();
    const updated = await ctx.repos.placements.setReadiness({
      placementId: input.placementId,
      party: input.party,
      actorId: actor.data.userId,
      occurredAt,
    });
    if (!updated.ok) return updated;
    await event(ctx, { cycleId: input.cycleId, entityType: 'placement', entityId: input.placementId, action: `${input.party}_readiness_confirmed`, before: null, after: { party: input.party }, occurredAt });
    return updated;
  },
});

export const finalizePlacement = defineUseCase({
  name: 'placement.finalize',
  input: z.object({ cycleId, placementId, action: z.enum(['ready', 'onboard']) }),
  authorize: { capability: 'onboarding:complete' as const },
  execute: async (ctx, input) => {
    const placement = await ctx.repos.placements.findById(input.placementId);
    if (!placement.ok) return placement;
    if (!placement.data || placement.data.cycleId !== input.cycleId)
      return err(notFound('Placement not found.'));
    const occurredAt = ctx.clock.now().toISOString();
    const updated = input.action === 'ready'
      ? ctx.repos.placements.markReady(input.placementId, occurredAt)
      : ctx.repos.placements.onboard(input.placementId, occurredAt);
    const resolved = await updated;
    if (!resolved.ok) return resolved;
    await event(ctx, { cycleId: input.cycleId, entityType: 'placement', entityId: input.placementId, action: input.action === 'ready' ? 'ready_to_start' : 'onboarded', before: { status: placement.data.status }, after: { status: resolved.data.status }, occurredAt });
    return resolved;
  },
});

export const cancelPlacement = defineUseCase({
  name: 'placement.cancel',
  input: z.object({ cycleId, placementId, reason: z.string().trim().min(1).max(2000) }),
  authorize: { capability: 'onboarding:complete' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const placement = await ctx.repos.placements.findById(input.placementId);
    if (!placement.ok) return placement;
    if (!placement.data || placement.data.cycleId !== input.cycleId)
      return err(notFound('Placement not found.'));
    return ctx.repos.placements.cancel(
      input.placementId,
      input.reason,
      actor.data.userId,
      ctx.clock.now().toISOString(),
    );
  },
});

export const confirmRecovery = defineUseCase({
  name: 'recovery.confirm',
  input: z.object({ cycleId, recoveryCaseId }),
  authorize: { capability: 'redistribution:run' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const cases = await ctx.repos.recovery.listForCycle(input.cycleId);
    if (!cases.ok) return cases;
    if (!cases.data.some((row) => row.id === input.recoveryCaseId))
      return err(notFound('Recovery case not found.'));
    return ctx.repos.recovery.confirm(
      input.recoveryCaseId,
      actor.data.userId,
      ctx.clock.now().toISOString(),
    );
  },
});

export const createRedistributionRound = defineUseCase({
  name: 'redistribution.createRound',
  input: z.object({
    cycleId,
    recoveryCaseIds: z.array(recoveryCaseId).min(1),
    positionDeadline: z.iso.datetime({ offset: true }),
    selectionDeadline: z.iso.datetime({ offset: true }),
  }),
  authorize: { capability: 'redistribution:run' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    return ctx.repos.recovery.createRound({
      ...input,
      createdBy: actor.data.userId,
      occurredAt: ctx.clock.now().toISOString(),
    });
  },
});

export const inviteRedistribution = defineUseCase({
  name: 'redistribution.invite',
  input: z.object({
    cycleId,
    roundId: redistributionRoundId,
    startupId,
    proposedHours: z.union(
      HOUR_TIERS.map((tier) => z.literal(tier)) as [
        z.ZodLiteral<0>,
        z.ZodLiteral<20>,
        z.ZodLiteral<30>,
        z.ZodLiteral<40>,
        z.ZodLiteral<60>,
      ],
    ),
  }),
  authorize: { capability: 'redistribution:run' as const },
  execute: async (ctx, input) => {
    const rounds = await ctx.repos.recovery.listRounds(input.cycleId);
    if (!rounds.ok) return rounds;
    if (!rounds.data.some((row) => row.id === input.roundId))
      return err(notFound('Redistribution round not found.'));
    return ctx.repos.recovery.invite(
      input.roundId,
      input.startupId,
      input.proposedHours,
      ctx.clock.now().toISOString(),
    );
  },
});

export const openCandidateChoiceFallback = defineUseCase({
  name: 'selection.openFallback',
  input: z.object({
    cycleId,
    candidateId,
    responseDeadline: z.iso.datetime({ offset: true }).nullable().default(null),
  }),
  authorize: { capability: 'selection:resolve_conflict' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const now = ctx.clock.now();
    const responseDeadline =
      input.responseDeadline ?? new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    return ctx.repos.fallbacks.open({
      cycleId: input.cycleId,
      candidateId: input.candidateId,
      responseDeadline,
      openedBy: actor.data.userId,
      occurredAt: now.toISOString(),
    });
  },
});

export const respondCandidateChoiceFallback = defineUseCase({
  name: 'selection.respondFallback',
  input: z.object({
    cycleId,
    fallbackCaseId,
    response: z.enum(['accepted', 'declined']),
    nextResponseDeadline: z.iso.datetime({ offset: true }).nullable().default(null),
  }),
  authorize: { capability: 'selection:resolve_conflict' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const cases = await ctx.repos.fallbacks.listForCycle(input.cycleId);
    if (!cases.ok) return cases;
    if (!cases.data.some((row) => row.id === input.fallbackCaseId)) {
      return err(notFound('Fallback case not found.'));
    }
    const now = ctx.clock.now();
    return ctx.repos.fallbacks.respond({
      caseId: input.fallbackCaseId,
      response: input.response,
      actorId: actor.data.userId,
      nextResponseDeadline:
        input.response === 'declined'
          ? (input.nextResponseDeadline ??
            new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString())
          : null,
      occurredAt: now.toISOString(),
    });
  },
});

export const overrideCandidateChoice = defineUseCase({
  name: 'selection.overrideCandidateChoice',
  input: z.object({
    cycleId,
    fallbackCaseId,
    selectionId,
    reason: z.string().trim().min(1).max(2000),
    highRiskConfirmed: z.literal(true),
  }),
  authorize: (ctx) =>
    isQstp(ctx.actor) && ctx.actor.role === 'program_manager'
      ? { capability: 'selection:resolve_conflict' as const }
      : err(forbidden('Only a programme manager can override a candidate choice.')),
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const cases = await ctx.repos.fallbacks.listForCycle(input.cycleId);
    if (!cases.ok) return cases;
    if (!cases.data.some((row) => row.id === input.fallbackCaseId)) {
      return err(notFound('Fallback case not found.'));
    }
    return ctx.repos.fallbacks.override({
      caseId: input.fallbackCaseId,
      selectionId: input.selectionId,
      actorId: actor.data.userId,
      reason: input.reason,
      highRiskConfirmed: input.highRiskConfirmed,
      occurredAt: ctx.clock.now().toISOString(),
    });
  },
});

export const requestCycleInterview = defineUseCase({
  name: 'interview.request',
  input: z.object({ cycleId, positionId, candidateId, mode: z.enum(['online', 'in_person']) }),
  authorize: { capability: 'interview:schedule' as const, startupId: ANY_STARTUP },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const position = await ctx.repos.positions.findById(input.positionId);
    if (!position.ok) return position;
    if (!position.data || position.data.cycleId !== input.cycleId) return err(notFound('Position not found.'));
    const scoped = authorize(actor.data, { capability: 'interview:schedule', startupId: position.data.startupId });
    if (!scoped.ok) return err(notFound('Position not found.'));
    if (!['approved', 'locked'].includes(position.data.status)) return err(conflict('Only approved positions can request interviews.'));
    const pool = await ctx.repos.candidates.listPool(position.data.id);
    if (!pool.ok) return pool;
    const candidate = pool.data.find((row) => row.candidate.id === input.candidateId)?.candidate;
    if (!candidate) return err(notFound('Candidate process not found.'));
    if (!['available', 'unconfirmed'].includes(candidate.availability)) return err(conflict('The candidate is not available for an interview.'));
    const occurredAt = ctx.clock.now().toISOString();
    const requested = await ctx.repos.interviews.request({ positionId: input.positionId, candidateId: input.candidateId, mode: input.mode, interviewerId: actor.data.userId, createdAt: occurredAt });
    if (!requested.ok) return requested;
    await event(ctx, { cycleId: input.cycleId, entityType: 'interview', entityId: requested.data.id, action: 'requested', before: null, after: { positionId: input.positionId, candidateId: input.candidateId, mode: input.mode }, occurredAt });
    return requested;
  },
});

export const transitionCycleInterview = defineUseCase({
  name: 'interview.transition',
  input: z.object({
    cycleId,
    interviewId,
    action: z.enum(['confirm', 'decline', 'schedule', 'reschedule', 'complete', 'no_show', 'cancel']),
    scheduledFor: z.iso.datetime({ offset: true }).nullable().default(null),
    durationMinutes: z.number().int().min(15).max(240).nullable().default(null),
    location: z.string().trim().max(2000).nullable().default(null),
  }),
  authorize: AUTHENTICATED,
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const interview = await ctx.repos.interviews.findById(input.interviewId);
    if (!interview.ok) return interview;
    if (!interview.data) return err(notFound('Interview not found.'));
    const position = await ctx.repos.positions.findById(interview.data.positionId);
    if (!position.ok) return position;
    if (!position.data || position.data.cycleId !== input.cycleId) return err(notFound('Interview not found.'));
    const candidateAction = input.action === 'confirm' || input.action === 'decline';
    if (candidateAction) {
      if (!isCandidate(actor.data) || actor.data.candidateId !== interview.data.candidateId) return err(notFound('Interview not found.'));
      if (interview.data.status !== 'requested') return err(conflict('This interview request is no longer awaiting a response.'));
    } else {
      const scoped = authorize(actor.data, { capability: 'interview:schedule', startupId: position.data.startupId });
      if (!scoped.ok) return err(notFound('Interview not found.'));
    }
    const status: Interview['status'] = input.action === 'confirm' ? 'confirmed' : input.action === 'decline' || input.action === 'cancel' ? 'cancelled' : input.action === 'complete' ? 'completed' : input.action === 'no_show' ? 'no_show' : 'scheduled';
    if (status === 'scheduled' && (!input.scheduledFor || !input.durationMinutes)) return err(validation('Choose the interview date and duration.'));
    const occurredAt = ctx.clock.now().toISOString();
    const transitioned = await ctx.repos.interviews.transition({ interviewId: input.interviewId, status, scheduledFor: input.scheduledFor, durationMinutes: input.durationMinutes, location: input.location, occurredAt });
    if (!transitioned.ok) return transitioned;
    await event(ctx, { cycleId: input.cycleId, entityType: 'interview', entityId: input.interviewId, action: input.action, before: { status: interview.data.status }, after: { status: transitioned.data.status, scheduledFor: transitioned.data.scheduledFor }, occurredAt });
    return transitioned;
  },
});

export const saveCycleInterviewFeedback = defineUseCase({
  name: 'interview.saveFeedbackForCycle',
  input: z.object({
    cycleId,
    interviewId,
    feedback: z.string().trim().min(1).max(5000),
    recommendation: z.enum(['advance', 'reject', 'undecided']),
  }),
  authorize: { capability: 'interview:record' as const, startupId: ANY_STARTUP },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const interview = await ctx.repos.interviews.findById(input.interviewId);
    if (!interview.ok) return interview;
    if (!interview.data) return err(notFound('Interview not found.'));
    const position = await ctx.repos.positions.findById(interview.data.positionId);
    if (!position.ok) return position;
    if (!position.data || position.data.cycleId !== input.cycleId) {
      return err(notFound('Interview not found.'));
    }
    const scoped = authorize(actor.data, {
      capability: 'interview:record',
      startupId: position.data.startupId,
    });
    if (!scoped.ok) return err(notFound('Interview not found.'));
    if (!['scheduled', 'completed'].includes(interview.data.status)) {
      return err(conflict('Feedback is available after the interview is scheduled.'));
    }
    const occurredAt = ctx.clock.now().toISOString();
    const saved = await ctx.repos.interviews.saveFeedback({
      interviewId: input.interviewId,
      feedback: input.feedback,
      recommendation: input.recommendation,
      savedAt: occurredAt,
    });
    if (!saved.ok) return saved;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'interview',
      entityId: input.interviewId,
      action: 'feedback_saved',
      before: { recommendation: interview.data.recommendation },
      after: { recommendation: input.recommendation },
      occurredAt,
    });
    return saved;
  },
});

export const saveTaskTemplate = defineUseCase({
  name: 'task.saveTemplate',
  input: z.object({
    cycleId,
    positionId,
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().min(1).max(5000),
  }),
  authorize: { capability: 'task:assess' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const position = await ctx.repos.positions.findById(input.positionId);
    if (!position.ok) return position;
    if (!position.data || position.data.cycleId !== input.cycleId)
      return err(notFound('Position not found.'));
    if (isStartup(actor.data)) {
      const scoped = authorize(actor.data, {
        capability: 'task:assess',
        startupId: position.data.startupId,
      });
      if (!scoped.ok) return err(notFound('Position not found.'));
    }
    const occurredAt = ctx.clock.now().toISOString();
    const saved = await ctx.repos.tasks.saveTemplate({
      cycleId: input.cycleId,
      positionId: input.positionId,
      title: input.title,
      instructions: input.instructions,
      createdBy: actor.data.userId,
      createdAt: occurredAt,
    });
    if (!saved.ok) return saved;
    await event(ctx, { cycleId: input.cycleId, entityType: 'task_template', entityId: saved.data.id, action: 'created', before: null, after: { positionId: input.positionId, title: input.title }, occurredAt });
    return saved;
  },
});

export const assignTask = defineUseCase({
  name: 'task.assign',
  input: z.object({
    cycleId,
    positionId,
    candidateId,
    templateId: taskTemplateId.nullable().default(null),
    dueAt: z.iso.datetime({ offset: true }),
  }),
  authorize: { capability: 'task:assess' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const [position, pool] = await Promise.all([
      ctx.repos.positions.findById(input.positionId),
      ctx.repos.candidates.listPool(input.positionId),
    ]);
    if (!position.ok) return position;
    if (!pool.ok) return pool;
    if (!position.data || position.data.cycleId !== input.cycleId)
      return err(notFound('Position not found.'));
    if (!pool.data.some((row) => row.candidate.id === input.candidateId))
      return err(notFound('Candidate process not found.'));
    if (isStartup(actor.data)) {
      const scoped = authorize(actor.data, {
        capability: 'task:assess',
        startupId: position.data.startupId,
      });
      if (!scoped.ok) return err(notFound('Position not found.'));
    }
    const occurredAt = ctx.clock.now().toISOString();
    const assigned = await ctx.repos.tasks.assign({
      cycleId: input.cycleId,
      templateId: input.templateId,
      positionId: input.positionId,
      candidateId: input.candidateId,
      status: 'assigned',
      dueAt: input.dueAt,
      submittedAt: null,
      lateAccepted: false,
      fileName: null,
      linkUrl: null,
      reviewNotes: null,
      reviewedBy: null,
      occurredAt,
    });
    if (!assigned.ok) return assigned;
    await event(ctx, { cycleId: input.cycleId, entityType: 'task_assignment', entityId: assigned.data.id, action: 'assigned', before: null, after: { positionId: input.positionId, candidateId: input.candidateId, dueAt: input.dueAt }, occurredAt });
    return assigned;
  },
});

export const submitTask = defineUseCase({
  name: 'task.submit',
  input: z.object({
    cycleId,
    assignmentId: taskAssignmentId,
    fileName: z.string().trim().max(240).nullable(),
    linkUrl: z.url().nullable(),
  }),
  authorize: { capability: 'task:submit_own' as const },
  execute: async (ctx, input) => {
    if (!isCandidate(ctx.actor)) return err(notFound('Task assignment not found.'));
    const assignments = await ctx.repos.tasks.listAssignments(ctx.actor.candidateId);
    if (!assignments.ok) return assignments;
    if (
      !assignments.data.some(
        (row) => row.id === input.assignmentId && row.cycleId === input.cycleId,
      )
    )
      return err(notFound('Task assignment not found.'));
    const current = assignments.data.find((row) => row.id === input.assignmentId)!;
    const occurredAt = ctx.clock.now().toISOString();
    const submitted = await ctx.repos.tasks.submit(
      input.assignmentId,
      ctx.actor.candidateId,
      input.fileName,
      input.linkUrl,
      occurredAt,
    );
    if (!submitted.ok) return submitted;
    await event(ctx, { cycleId: input.cycleId, entityType: 'task_assignment', entityId: input.assignmentId, action: 'submitted', before: { status: current.status }, after: { status: submitted.data.status, lateAccepted: submitted.data.lateAccepted }, occurredAt });
    return submitted;
  },
});

export const reviewTask = defineUseCase({
  name: 'task.review',
  input: z.object({
    cycleId,
    assignmentId: taskAssignmentId,
    notes: z.string().trim().min(1).max(5000),
  }),
  authorize: { capability: 'task:assess' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const assignments = await ctx.repos.tasks.listForCycle(input.cycleId);
    if (!assignments.ok) return assignments;
    const assignment = assignments.data.find((row) => row.id === input.assignmentId);
    if (!assignment) return err(notFound('Task assignment not found.'));
    const position = await ctx.repos.positions.findById(assignment.positionId);
    if (!position.ok) return position;
    if (isStartup(actor.data) && position.data) {
      const scoped = authorize(actor.data, {
        capability: 'task:assess',
        startupId: position.data.startupId,
      });
      if (!scoped.ok) return err(notFound('Task assignment not found.'));
    }
    const occurredAt = ctx.clock.now().toISOString();
    const reviewed = await ctx.repos.tasks.review(
      input.assignmentId,
      actor.data.userId,
      input.notes,
      occurredAt,
    );
    if (!reviewed.ok) return reviewed;
    await event(ctx, { cycleId: input.cycleId, entityType: 'task_assignment', entityId: input.assignmentId, action: 'reviewed', before: { status: assignment.status }, after: { status: reviewed.data.status }, occurredAt });
    return reviewed;
  },
});

export const withdrawTask = defineUseCase({
  name: 'task.withdraw',
  input: z.object({ cycleId, assignmentId: taskAssignmentId }),
  authorize: { capability: 'task:assess' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const assignments = await ctx.repos.tasks.listForCycle(input.cycleId);
    if (!assignments.ok) return assignments;
    const assignment = assignments.data.find((row) => row.id === input.assignmentId);
    if (!assignment) return err(notFound('Task assignment not found.'));
    const position = await ctx.repos.positions.findById(assignment.positionId);
    if (!position.ok) return position;
    if (isStartup(actor.data) && position.data) {
      const scoped = authorize(actor.data, { capability: 'task:assess', startupId: position.data.startupId });
      if (!scoped.ok) return err(notFound('Task assignment not found.'));
    }
    const occurredAt = ctx.clock.now().toISOString();
    const withdrawn = await ctx.repos.tasks.withdraw(input.assignmentId, occurredAt);
    if (!withdrawn.ok) return withdrawn;
    await event(ctx, { cycleId: input.cycleId, entityType: 'task_assignment', entityId: input.assignmentId, action: 'withdrawn', before: { status: assignment.status }, after: { status: withdrawn.data.status }, occurredAt });
    return withdrawn;
  },
});

export const saveRequirementTemplate = defineUseCase({
  name: 'requirement.saveTemplate',
  input: z.object({
    cycleId,
    title: z.string().trim().min(1).max(200),
    owner: z.enum(['candidate', 'startup', 'qstp']),
    required: z.boolean(),
    positionId: positionId.nullable().default(null),
    active: z.boolean().default(true),
  }),
  authorize: AUTHENTICATED,
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    if (isCandidate(actor.data)) return err(forbidden('Candidates cannot create requirements.'));
    if (isQstp(actor.data)) {
      const allowed = authorize(actor.data, { capability: 'document:verify' });
      if (!allowed.ok) return allowed;
    } else {
      if (!input.positionId || input.owner !== 'startup')
        return err(
          forbidden('Startups can add startup-owned, position-specific requirements only.'),
        );
      const position = await ctx.repos.positions.findById(input.positionId);
      if (!position.ok) return position;
      if (!position.data || position.data.cycleId !== input.cycleId)
        return err(notFound('Position not found.'));
      const scoped = authorize(actor.data, {
        capability: 'position:submit',
        startupId: position.data.startupId,
      });
      if (!scoped.ok) return err(notFound('Position not found.'));
      const placements = await ctx.repos.placements.listForCycle(input.cycleId);
      if (!placements.ok) return placements;
      if (placements.data.some((row) => row.positionId === input.positionId))
        return err(
          conflict('Position-specific requirements must be added before placement confirmation.'),
        );
    }
    const occurredAt = ctx.clock.now().toISOString();
    const saved = await ctx.repos.requirements.saveTemplate({
      ...input,
      occurredAt,
    });
    if (!saved.ok) return saved;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'requirement_template',
      entityId: saved.data.id,
      action: 'created',
      before: null,
      after: { title: input.title, owner: input.owner, required: input.required },
      occurredAt,
    });
    return saved;
  },
});

export const amendPlacementRequirement = defineUseCase({
  name: 'requirement.amendPlacementChecklist',
  input: z.object({
    cycleId,
    placementId,
    title: z.string().trim().min(1).max(200),
    owner: z.enum(['candidate', 'startup', 'qstp']),
    required: z.boolean(),
    reason: z.string().trim().min(10).max(2000),
  }),
  authorize: { capability: 'document:verify' as const },
  execute: async (ctx, input) => {
    const placement = await ctx.repos.placements.findById(input.placementId);
    if (!placement.ok) return placement;
    if (!placement.data || placement.data.cycleId !== input.cycleId) {
      return err(notFound('Placement not found.'));
    }
    if (placement.data.status === 'cancelled') {
      return err(conflict('Cancelled placements are read-only.'));
    }
    const occurredAt = ctx.clock.now().toISOString();
    const amended = await ctx.repos.requirements.amend({
      placementId: input.placementId,
      templateId: null,
      title: input.title,
      owner: input.owner,
      required: input.required,
      status: input.owner === 'qstp' ? 'requested' : 'awaiting_upload',
      amendmentReason: null,
      reason: input.reason,
      occurredAt,
    });
    if (!amended.ok) return amended;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'placement_requirement',
      entityId: amended.data.id,
      action: 'checklist_amended',
      before: null,
      after: { placementId: input.placementId, title: input.title, owner: input.owner, required: input.required },
      reason: input.reason,
      occurredAt,
    });
    return amended;
  },
});

export const updateRequirementTemplate = defineUseCase({
  name: 'requirement.updateTemplate',
  input: z.object({
    cycleId,
    templateId: requirementTemplateId,
    title: z.string().trim().min(1).max(200),
    owner: z.enum(['candidate', 'startup', 'qstp']),
    required: z.boolean(),
    active: z.boolean(),
    reason: z.string().trim().min(10).max(2000),
  }),
  authorize: { capability: 'document:verify' as const },
  execute: async (ctx, input) => {
    const templates = await ctx.repos.requirements.listTemplates(input.cycleId);
    if (!templates.ok) return templates;
    const template = templates.data.find((row) => row.id === input.templateId);
    if (!template) return err(notFound('Requirement template not found.'));
    const occurredAt = ctx.clock.now().toISOString();
    const updated = await ctx.repos.requirements.updateTemplate(input.templateId, {
      title: input.title,
      owner: input.owner,
      required: input.required,
      active: input.active,
      occurredAt,
    });
    if (!updated.ok) return updated;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'requirement_template',
      entityId: input.templateId,
      action: input.active ? 'updated' : 'deactivated',
      before: { title: template.title, owner: template.owner, required: template.required, active: template.active },
      after: { title: input.title, owner: input.owner, required: input.required, active: input.active },
      reason: input.reason,
      occurredAt,
    });
    return updated;
  },
});

async function findPlacementRequirement(
  ctx: Parameters<typeof requireActor>[0],
  cycle: CycleId,
  requirementId: z.infer<typeof placementRequirementId>,
) {
  const placements = await ctx.repos.placements.listForCycle(cycle);
  if (!placements.ok) return err(placements.error);
  for (const placement of placements.data) {
    const requirements = await ctx.repos.requirements.listForPlacement(placement.id);
    if (!requirements.ok) return err(requirements.error);
    const requirement = requirements.data.find((row) => row.id === requirementId);
    if (requirement) return ok({ placement, requirement });
  }
  return err(notFound('Requirement not found.'));
}

export const submitRequirement = defineUseCase({
  name: 'requirement.submit',
  input: z.object({
    cycleId,
    requirementId: placementRequirementId,
    fileName: z.string().trim().min(1).max(240),
    extractedFields: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(100),
          extracted: z.string().nullable(),
          confirmed: z.string().nullable(),
        }),
      )
      .max(30)
      .default([]),
  }),
  authorize: AUTHENTICATED,
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const found = await findPlacementRequirement(ctx, input.cycleId, input.requirementId);
    if (!found.ok) return found;
    if (found.data.placement.status === 'cancelled') {
      return err(conflict('Cancelled placements are read-only.'));
    }
    const owns =
      (found.data.requirement.owner === 'candidate' &&
        isCandidate(actor.data) &&
        actor.data.candidateId === found.data.placement.candidateId) ||
      (found.data.requirement.owner === 'startup' &&
        isStartup(actor.data) &&
        actor.data.affiliations.some(
          (row) => row.startupId === found.data.placement.startupId && row.status === 'active',
        )) ||
      (found.data.requirement.owner === 'qstp' &&
        isQstp(actor.data) &&
        actor.data.role !== 'viewer');
    if (!owns) return err(notFound('Requirement not found.'));
    const occurredAt = ctx.clock.now().toISOString();
    const submitted = await ctx.repos.requirements.submit({
      requirementId: input.requirementId,
      fileName: input.fileName,
      submittedBy: actor.data.userId,
      extractedFields: input.extractedFields,
      occurredAt,
    });
    if (!submitted.ok) return submitted;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'placement_requirement',
      entityId: input.requirementId,
      action: submitted.data.revision > 1 ? 'resubmitted' : 'uploaded',
      before: { status: found.data.requirement.status },
      after: { revision: submitted.data.revision, fileName: submitted.data.fileName },
      occurredAt,
    });
    return submitted;
  },
});

export const decideRequirement = defineUseCase({
  name: 'requirement.decide',
  input: z.object({
    cycleId,
    requirementId: placementRequirementId,
    decision: z.enum(['approved', 'correction_requested', 'rejected', 'expired', 'waived']),
    reason: z.string().trim().max(2000).nullable().default(null),
  }),
  authorize: { capability: 'document:verify' as const },
  execute: async (ctx, input) => {
    const found = await findPlacementRequirement(ctx, input.cycleId, input.requirementId);
    if (!found.ok) return found;
    if (found.data.placement.status === 'cancelled') {
      return err(conflict('Cancelled placements are read-only.'));
    }
    if (['correction_requested', 'rejected', 'expired'].includes(input.decision) && !input.reason) {
      return err(validation('This decision requires a reason.'));
    }
    const occurredAt = ctx.clock.now().toISOString();
    const decided = await ctx.repos.requirements.decide({
      requirementId: input.requirementId,
      decision: input.decision,
      reason: input.reason,
      occurredAt,
    });
    if (!decided.ok) return decided;
    await event(ctx, {
      cycleId: input.cycleId,
      entityType: 'placement_requirement',
      entityId: input.requirementId,
      action: input.decision,
      before: { status: found.data.requirement.status },
      after: { status: decided.data.status },
      reason: input.reason,
      occurredAt,
    });
    return decided;
  },
});

export const protectRecovery = defineUseCase({
  name: 'recovery.protect',
  input: z.object({ cycleId, recoveryCaseId, until: z.iso.datetime({ offset: true }) }),
  authorize: { capability: 'redistribution:run' as const },
  execute: async (ctx, input) => {
    const cases = await ctx.repos.recovery.listForCycle(input.cycleId);
    if (!cases.ok) return cases;
    if (!cases.data.some((row) => row.id === input.recoveryCaseId))
      return err(notFound('Recovery case not found.'));
    return ctx.repos.recovery.protect(
      input.recoveryCaseId,
      input.until,
      ctx.clock.now().toISOString(),
    );
  },
});

export const respondRedistributionInvitation = defineUseCase({
  name: 'redistribution.respond',
  input: z.object({
    cycleId,
    roundId: redistributionRoundId,
    response: z.enum(['accepted', 'declined']),
  }),
  authorize: AUTHENTICATED,
  execute: async (ctx, input) => {
    if (!isStartup(ctx.actor)) return err(notFound('Invitation not found.'));
    const startupActor = ctx.actor;
    const roundResult = await ctx.repos.recovery.listRounds(input.cycleId);
    if (!roundResult.ok) return roundResult;
    const round = roundResult.data.find((row) => row.id === input.roundId);
    const invitation = round?.invitations.find((row) =>
      startupActor.affiliations.some(
        (affiliation) => affiliation.status === 'active' && affiliation.startupId === row.startupId,
      ),
    );
    if (!round || !invitation) return err(notFound('Invitation not found.'));
    return ctx.repos.recovery.respond(
      input.roundId,
      invitation.startupId,
      input.response,
      ctx.clock.now().toISOString(),
    );
  },
});

export const closeRedistributionRound = defineUseCase({
  name: 'redistribution.close',
  input: z.object({ cycleId, roundId: redistributionRoundId }),
  authorize: { capability: 'redistribution:run' as const },
  execute: async (ctx, input) => {
    const rounds = await ctx.repos.recovery.listRounds(input.cycleId);
    if (!rounds.ok) return rounds;
    if (!rounds.data.some((row) => row.id === input.roundId))
      return err(notFound('Redistribution round not found.'));
    return ctx.repos.recovery.closeRound(input.roundId, ctx.clock.now().toISOString());
  },
});

export const expireRedistributionInvitations = defineUseCase({
  name: 'redistribution.expireInvitations',
  input: z.object({ cycleId, roundId: redistributionRoundId }),
  authorize: { capability: 'redistribution:run' as const },
  execute: async (ctx, input) => {
    const rounds = await ctx.repos.recovery.listRounds(input.cycleId);
    if (!rounds.ok) return rounds;
    const round = rounds.data.find((row) => row.id === input.roundId);
    if (!round) return err(notFound('Redistribution round not found.'));
    const occurredAt = ctx.clock.now().toISOString();
    const expired = await ctx.repos.recovery.expireInvitations(input.roundId, occurredAt);
    if (!expired.ok) return expired;
    await event(ctx, { cycleId: input.cycleId, entityType: 'redistribution_round', entityId: input.roundId, action: 'invitations_expired', before: { open: round.invitations.filter((row) => row.status === 'invited').length }, after: { open: 0 }, occurredAt });
    return expired;
  },
});

export const resolveSelectionConflict = defineUseCase({
  name: 'selection.resolveRecordedConflict',
  input: z.object({
    cycleId,
    conflictId: selectionConflictId,
    decision: z.enum(['dismissed', 'overridden']),
    reason: z.string().trim().min(1).max(2000),
  }),
  authorize: { capability: 'selection:resolve_conflict' as const },
  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    const conflicts = await ctx.repos.conflicts.listForCycle(input.cycleId);
    if (!conflicts.ok) return conflicts;
    if (!conflicts.data.some((row) => row.id === input.conflictId))
      return err(notFound('Selection conflict not found.'));
    return ctx.repos.conflicts.resolve(
      input.conflictId,
      input.decision,
      actor.data.userId,
      input.reason,
      ctx.clock.now().toISOString(),
    );
  },
});

// Referenced schemas remain exported from this module for server actions and tests.
export const coreSystemIds = {
  activityEventId,
  participationId,
  placementId,
  prioritizationRunId,
};
