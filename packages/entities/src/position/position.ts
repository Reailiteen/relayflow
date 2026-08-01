import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  cycleId,
  positionId,
  startupId,
  userId,
  type CycleId,
  type PositionId,
  type StartupId,
  type UserId,
  type RedistributionRoundId,
} from '../shared/ids';

/**
 * A role a startup wants to fill, and the unit that hours are actually spent on.
 *
 * A position's cost is `hoursPerIntern × internCount`, and the sum of a
 * startup's positions may not exceed its allocated tier. That check lives in
 * the use-case layer (it needs the startup's other positions), but the shape
 * that makes it checkable is here.
 */

export const POSITION_STATUSES = [
  'draft', // startup is still writing it
  'submitted', // waiting on QSTP review
  'under_review',
  'changes_requested',
  'resubmitted',
  'approved', // eligible to receive a candidate pool
  'locked',
  'filled', // every seat has a confirmed intern
  'closed',
  'withdrawn',
] as const;

export const positionStatus = z.enum(POSITION_STATUSES);
export type PositionStatus = (typeof POSITION_STATUSES)[number];

/** Only approved-and-onward positions hold hours against the allocation. */
export function reservesHours(status: PositionStatus): boolean {
  return [
    'submitted',
    'under_review',
    'changes_requested',
    'resubmitted',
    'approved',
    'locked',
    'filled',
  ].includes(status);
}

export interface Position {
  readonly id: PositionId;
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly title: string;
  readonly description: string;
  readonly requiredSkills: readonly string[];
  readonly workArrangement: 'onsite' | 'hybrid' | 'remote';
  readonly additionalRequirements: string | null;
  readonly internCount: number;
  readonly hoursPerIntern: number;
  readonly durationWeeks: number;
  readonly supervisorId: UserId | null;
  readonly supervisorName: string | null;
  readonly status: PositionStatus;
  /** Set when QSTP asks for changes, so the startup knows what to fix. */
  readonly reviewNote: string | null;
  readonly reviewHistory: readonly { status: PositionStatus; note: string | null; occurredAt: string }[];
  readonly redistributionRoundId: RedistributionRoundId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Weekly hours this position consumes from the startup's allocation. */
export function totalWeeklyHours(position: Pick<Position, 'hoursPerIntern' | 'internCount'>): number {
  return position.hoursPerIntern * position.internCount;
}

export const positionRow = z.object({
  id: positionId,
  cycle_id: cycleId,
  startup_id: startupId,
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  required_skills: z.array(z.string().max(60)),
  work_arrangement: z.enum(['onsite', 'hybrid', 'remote']).default('onsite'),
  additional_requirements: z.string().max(3000).nullable().default(null),
  intern_count: z.number().int().min(1),
  hours_per_intern: z.number().int().min(1).max(60),
  duration_weeks: z.number().int().min(1).max(52),
  supervisor_id: userId.nullable(),
  supervisor_name: z.string().max(200).nullable(),
  status: positionStatus,
  review_note: z.string().nullable(),
  review_history: z
    .array(
      z.object({
        status: positionStatus,
        note: z.string().nullable(),
        occurredAt: z.iso.datetime({ offset: true }),
      }),
    )
    .default([]),
  redistribution_round_id: z.uuid().nullable().default(null),
  ...auditColumns,
});

export const positionEntity = defineEntity({
  name: 'Position',
  row: positionRow,
  toDomain: (row): Position => ({
    id: row.id,
    cycleId: row.cycle_id,
    startupId: row.startup_id,
    title: row.title,
    description: row.description,
    requiredSkills: row.required_skills,
    workArrangement: row.work_arrangement,
    additionalRequirements: row.additional_requirements,
    internCount: row.intern_count,
    hoursPerIntern: row.hours_per_intern,
    durationWeeks: row.duration_weeks,
    supervisorId: row.supervisor_id,
    supervisorName: row.supervisor_name,
    status: row.status,
    reviewNote: row.review_note,
    reviewHistory: row.review_history,
    redistributionRoundId: row.redistribution_round_id as Position['redistributionRoundId'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const submitPositionInput = z.object({
  title: z.string().trim().min(1, 'Give the role a title.').max(200),
  description: z.string().trim().min(1, 'Describe the role.').max(5000),
  requiredSkills: z
    .array(z.string().trim().min(1).max(60))
    .max(20, 'Twenty skills is plenty — narrow it down.')
    .default([]),
  workArrangement: z.enum(['onsite', 'hybrid', 'remote']).default('onsite'),
  additionalRequirements: z.string().trim().max(3000).nullable().default(null),
  internCount: z.number().int().min(1, 'At least one intern.').max(20),
  // 60 is the largest tier, so no single intern can exceed it.
  hoursPerIntern: z.number().int().min(1).max(60),
  durationWeeks: z.number().int().min(1).max(52),
  supervisorName: z.string().trim().max(200).nullable(),
});

export type SubmitPositionInput = z.infer<typeof submitPositionInput>;
