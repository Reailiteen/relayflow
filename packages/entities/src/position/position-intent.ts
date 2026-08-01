import { z } from 'zod';
import type { PositionResult, PrioritisationPolicy } from '@relayflow/prioritisation';
import { DEFAULT_POLICY, evaluateV3Positions } from '@relayflow/prioritisation';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  cycleId,
  positionIntentId,
  startupId,
  userId,
  type CycleId,
  type PositionIntentId,
  type StartupId,
  type UserId,
} from '../shared/ids';

/**
 * "Could this startup host an intern?" — asked before hours are allocated.
 *
 * The prioritisation engine gates on position feasibility, so it needs an
 * answer during the `allocation` stage. But a real `Position` is a job posting
 * sized against an allocation that does not exist yet, and moving position
 * submission earlier would invert the rule that a startup on 40 hours cannot
 * request 60 hours of roles.
 *
 * So this is the readiness question on its own: exactly the ten fields the gate
 * checks, and nothing else. Later, at the `positions` stage, it seeds the real
 * position — `Position.intentId` records which readiness answer a posting grew
 * out of.
 *
 * Every field here is required. "We have not said yet" is not "we are ready",
 * and a gate that cannot tell those apart will pass startups that are not.
 */
export interface PositionIntent {
  readonly id: PositionIntentId;
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly title: string;
  /** Discipline, e.g. `ai_engineering`. Lower-cased by the engine. */
  readonly category: string;
  /** What the intern will actually produce. Placeholder prose fails the gate. */
  readonly expectedDeliverable: string;
  readonly learningOutcomes: readonly string[];
  readonly workMode: 'onsite' | 'hybrid' | 'remote';
  readonly supervisorName: string;
  readonly supervisorId: UserId | null;
  /** Below the policy floor (30/week) this is supervision in name only. */
  readonly weeklySupervisionMinutes: number;
  readonly maximumInterns: number;
  readonly resourcesReady: boolean;
  readonly onboardingReady: boolean;
  readonly submittedBy: UserId;
  /** Null while the startup is still drafting. Only submitted intents count. */
  readonly submittedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Translate to the shape the engine's feasibility gate reads.
 *
 * Lives here rather than in the mapper because the startup portal wants the
 * same answer *before* submitting — telling someone their role will be rejected
 * while they can still fix it is worth more than telling QSTP afterwards.
 */
export function toEnginePosition(intent: PositionIntentDraft): Record<string, unknown> {
  return {
    id: intent.id ?? null,
    title: intent.title,
    category: intent.category,
    expectedDeliverable: intent.expectedDeliverable,
    learningOutcomes: intent.learningOutcomes,
    workMode: intent.workMode,
    supervisor: intent.supervisorName,
    weeklySupervisionMinutes: intent.weeklySupervisionMinutes,
    maximumInterns: intent.maximumInterns,
    resourcesReady: intent.resourcesReady,
    onboardingReady: intent.onboardingReady,
  };
}

/**
 * Run the gate over one intent, so a startup can see what is still missing.
 *
 * Policy defaults so the form can call this without reaching past `entities`
 * for the engine package — the whole value of this function is that it runs in
 * the browser while somebody is still typing.
 */
export function checkIntentFeasibility(
  intent: PositionIntentDraft,
  policy: PrioritisationPolicy = DEFAULT_POLICY,
): PositionResult | null {
  return evaluateV3Positions([toEnginePosition(intent)], policy)[0] ?? null;
}

/** The parts of an intent the gate actually reads. */
export type PositionIntentDraft = Pick<
  PositionIntent,
  | 'title'
  | 'category'
  | 'expectedDeliverable'
  | 'learningOutcomes'
  | 'workMode'
  | 'supervisorName'
  | 'weeklySupervisionMinutes'
  | 'maximumInterns'
  | 'resourcesReady'
  | 'onboardingReady'
> & { readonly id?: PositionIntentId };

/** Human-readable names for the ten checks, in the order the form shows them. */
export const INTENT_CHECK_LABELS: Readonly<Record<string, string>> = {
  title: 'Role title',
  category: 'Discipline',
  expectedDeliverable: 'A real deliverable',
  learningOutcomes: 'Learning outcomes',
  workMode: 'Work arrangement',
  supervisor: 'Named supervisor',
  supervisorCapacity: 'Capacity for at least one intern',
  supervisionCommitment: 'At least 30 minutes of supervision a week',
  resourcesReady: 'Resources ready',
  onboardingReady: 'Onboarding ready',
};

export const positionIntentRow = z.object({
  id: positionIntentId,
  cycle_id: cycleId,
  startup_id: startupId,
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  expected_deliverable: z.string().min(1).max(2000),
  learning_outcomes: z.array(z.string().max(200)).default([]),
  work_mode: z.enum(['onsite', 'hybrid', 'remote']),
  supervisor_name: z.string().min(1).max(200),
  supervisor_id: userId.nullable().default(null),
  weekly_supervision_minutes: z.number().int().min(0),
  maximum_interns: z.number().int().min(0),
  resources_ready: z.boolean().default(false),
  onboarding_ready: z.boolean().default(false),
  submitted_by: userId,
  submitted_at: z.iso.datetime({ offset: true }).nullable().default(null),
  ...auditColumns,
});

export const positionIntentEntity = defineEntity({
  name: 'PositionIntent',
  row: positionIntentRow,
  toDomain: (row): PositionIntent => ({
    id: row.id,
    cycleId: row.cycle_id,
    startupId: row.startup_id,
    title: row.title,
    category: row.category,
    expectedDeliverable: row.expected_deliverable,
    learningOutcomes: row.learning_outcomes,
    workMode: row.work_mode,
    supervisorName: row.supervisor_name,
    supervisorId: row.supervisor_id,
    weeklySupervisionMinutes: row.weekly_supervision_minutes,
    maximumInterns: row.maximum_interns,
    resourcesReady: row.resources_ready,
    onboardingReady: row.onboarding_ready,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const submitPositionIntentInput = z.object({
  startupId,
  title: z.string().trim().min(1, 'Give the role a title.').max(200),
  category: z.string().trim().min(1, 'Which discipline is this?').max(80),
  expectedDeliverable: z
    .string()
    .trim()
    .min(1, 'Say what the intern will produce — "to be defined" will not pass review.')
    .max(2000),
  learningOutcomes: z
    .array(z.string().trim().min(1).max(200))
    .min(1, 'Name at least one thing the intern will learn.')
    .max(10),
  workMode: z.enum(['onsite', 'hybrid', 'remote']),
  supervisorName: z.string().trim().min(1, 'Who will supervise them?').max(200),
  weeklySupervisionMinutes: z
    .number()
    .int()
    .min(0)
    .max(2400, 'That is more than a working week.'),
  maximumInterns: z.number().int().min(0).max(20),
  resourcesReady: z.boolean(),
  onboardingReady: z.boolean(),
});

export type SubmitPositionIntentInput = z.infer<typeof submitPositionIntentInput>;
