import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  allocationId,
  cycleId,
  startupId,
  userId,
  type AllocationId,
  type CycleId,
  type StartupId,
  type UserId,
  type RedistributionRoundId,
} from '../shared/ids';
import { HOUR_TIERS, type HourTier } from './hours';

/**
 * What QSTP promised one startup in one cycle, and why.
 *
 * The justification is not decoration. Allocations are a funding decision
 * between a public programme and private companies, and "why did they get 60
 * when we got 20" is a question that will be asked. Every allocation records
 * who decided, when, on what score, and — when the tier does not match the
 * score — the override reason.
 */

export const ALLOCATION_STATUSES = [
  'draft', // being worked on, not yet visible to the startup
  'confirmed', // startup can see it and submit positions against it
  'declined', // startup was offered hours and turned them down
  'forfeited', // deadline passed with no selection and no exception
  'superseded', // an immutable prior revision; never consumes the live budget
] as const;

export const allocationStatus = z.enum(ALLOCATION_STATUSES);
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

/** Only confirmed allocations consume budget. The rest are proposals or history. */
export function consumesBudget(status: AllocationStatus): boolean {
  return status === 'confirmed';
}

export interface Allocation {
  readonly id: AllocationId;
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly weeklyHours: HourTier;
  readonly status: AllocationStatus;
  /** Evaluation score, 0–100. Drives the recommended tier. */
  readonly score: number | null;
  /** Set when the assigned tier differs from what the score recommends. */
  readonly overrideReason: string | null;
  readonly justification: string | null;
  /** True when granted in a redistribution round rather than the first pass. */
  readonly fromRedistribution: boolean;
  readonly revision: number;
  readonly supersedesAllocationId: AllocationId | null;
  readonly redistributionRoundId: RedistributionRoundId | null;
  readonly decidedBy: UserId | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const hourTier = z.union(
  HOUR_TIERS.map((tier) => z.literal(tier)) as unknown as [
    z.ZodLiteral<60>,
    z.ZodLiteral<40>,
    z.ZodLiteral<30>,
    z.ZodLiteral<20>,
    z.ZodLiteral<0>,
  ],
);

export const allocationRow = z.object({
  id: allocationId,
  cycle_id: cycleId,
  startup_id: startupId,
  weekly_hours: hourTier,
  status: allocationStatus,
  score: z.number().min(0).max(100).nullable(),
  override_reason: z.string().nullable(),
  justification: z.string().nullable(),
  from_redistribution: z.boolean(),
  revision: z.number().int().min(1).default(1),
  supersedes_allocation_id: allocationId.nullable().default(null),
  redistribution_round_id: z.uuid().nullable().default(null),
  decided_by: userId.nullable(),
  decided_at: z.iso.datetime({ offset: true }).nullable(),
  ...auditColumns,
});

export const allocationEntity = defineEntity({
  name: 'Allocation',
  row: allocationRow,
  toDomain: (row): Allocation => ({
    id: row.id,
    cycleId: row.cycle_id,
    startupId: row.startup_id,
    weeklyHours: row.weekly_hours,
    status: row.status,
    score: row.score,
    overrideReason: row.override_reason,
    justification: row.justification,
    fromRedistribution: row.from_redistribution,
    revision: row.revision,
    supersedesAllocationId: row.supersedes_allocation_id,
    redistributionRoundId: row.redistribution_round_id as Allocation['redistributionRoundId'],
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

/**
 * The score-to-tier ladder. QSTP can override it, but the recommendation is
 * always computed the same way so that overrides are visible as overrides.
 */
export function recommendedTier(score: number): HourTier {
  if (score >= 85) return 60;
  if (score >= 70) return 40;
  if (score >= 55) return 30;
  if (score >= 40) return 20;
  return 0;
}

export function isOverride(score: number | null, tier: HourTier): boolean {
  return score !== null && recommendedTier(score) !== tier;
}

export const allocateInput = z
  .object({
    startupId,
    weeklyHours: hourTier,
    score: z.number().min(0).max(100).nullable(),
    justification: z.string().trim().max(2000).nullable(),
    overrideReason: z.string().trim().max(2000).nullable(),
  })
  .refine((input) => !isOverride(input.score, input.weeklyHours) || !!input.overrideReason?.trim(), {
    // Departing from the scored recommendation is allowed, but never silently.
    message: 'Assigning a tier other than the recommended one requires a reason.',
    path: ['overrideReason'],
  });

export type AllocateInput = z.infer<typeof allocateInput>;
