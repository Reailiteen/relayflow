import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  candidateId,
  cycleId,
  poolEntryId,
  positionId,
  userId,
  type CandidateId,
  type CycleId,
  type PoolEntryId,
  type PositionId,
  type UserId,
} from '../shared/ids';

/**
 * A person in the candidate pool.
 *
 * Candidates are imported from Deema or CSV — RelayFlow does not source or
 * match them. What it does own is their *availability*, which is the single
 * biggest source of wasted effort in the current process: startups interview
 * people who took another job weeks ago.
 */

export const AVAILABILITY_STATUSES = [
  'unconfirmed', // imported, not yet asked
  'available',
  'employed', // took another role
  'not_interested',
  'temporarily_unavailable',
  'placed', // confirmed into a position in this cycle
] as const;

export const availabilityStatus = z.enum(AVAILABILITY_STATUSES);
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/**
 * Whether a startup can still spend effort on this person. `unconfirmed`
 * counts as selectable — we have not heard otherwise — but the UI should show
 * it differently from a confirmed `available`.
 */
export function isSelectable(status: AvailabilityStatus): boolean {
  return status === 'available' || status === 'unconfirmed';
}

export interface Candidate {
  readonly id: CandidateId;
  readonly cycleId: CycleId;
  /** Set once they log into the candidate portal. Null while imported-only. */
  readonly userId: UserId | null;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly skills: readonly string[];
  readonly cvUrl: string | null;
  readonly portfolioUrl: string | null;
  readonly githubUrl: string | null;
  readonly availability: AvailabilityStatus;
  readonly availabilityConfirmedAt: string | null;
  /** Where this record came from, for when the import needs auditing. */
  readonly source: 'deema' | 'csv' | 'manual';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const candidateRow = z.object({
  id: candidateId,
  cycle_id: cycleId,
  user_id: userId.nullable(),
  full_name: z.string().min(1).max(200),
  email: z.email(),
  phone: z.string().max(40).nullable(),
  skills: z.array(z.string().max(60)),
  cv_url: z.url().nullable(),
  portfolio_url: z.url().nullable(),
  github_url: z.url().nullable(),
  availability: availabilityStatus,
  availability_confirmed_at: z.iso.datetime({ offset: true }).nullable(),
  source: z.enum(['deema', 'csv', 'manual']),
  ...auditColumns,
});

export const candidateEntity = defineEntity({
  name: 'Candidate',
  row: candidateRow,
  toDomain: (row): Candidate => ({
    id: row.id,
    cycleId: row.cycle_id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    skills: row.skills,
    cvUrl: row.cv_url,
    portfolioUrl: row.portfolio_url,
    githubUrl: row.github_url,
    availability: row.availability,
    availabilityConfirmedAt: row.availability_confirmed_at,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

/** What the candidate themselves can tell us, from the portal. */
export const confirmAvailabilityInput = z.object({
  status: z.enum(['available', 'employed', 'not_interested', 'temporarily_unavailable']),
  note: z.string().trim().max(500).nullable().default(null),
});

export type ConfirmAvailabilityInput = z.infer<typeof confirmAvailabilityInput>;

/**
 * One candidate placed in one position's pool — the handoff QSTP controls.
 *
 * The same candidate can sit in several pools at once, which is exactly why
 * selection needs the first-come-first-served rule modelled in `selection.ts`.
 */
export const POOL_ENTRY_STATUSES = [
  'pending', // startup has not looked yet
  'shortlisted',
  'interview_requested',
  'interviewed',
  'selected', // this startup selected them; may still lose the race
  'rejected',
  'withdrawn', // candidate is no longer available
  'lost', // another startup reserved them first
] as const;

export const poolEntryStatus = z.enum(POOL_ENTRY_STATUSES);
export type PoolEntryStatus = (typeof POOL_ENTRY_STATUSES)[number];

export interface PoolEntry {
  readonly id: PoolEntryId;
  readonly positionId: PositionId;
  readonly candidateId: CandidateId;
  readonly status: PoolEntryStatus;
  /** When QSTP handed this pool to the startup — the reminder clock starts here. */
  readonly sharedAt: string;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const poolEntryRow = z.object({
  id: poolEntryId,
  position_id: positionId,
  candidate_id: candidateId,
  status: poolEntryStatus,
  shared_at: z.iso.datetime({ offset: true }),
  reviewed_at: z.iso.datetime({ offset: true }).nullable(),
  ...auditColumns,
});

export const poolEntryEntity = defineEntity({
  name: 'PoolEntry',
  row: poolEntryRow,
  toDomain: (row): PoolEntry => ({
    id: row.id,
    positionId: row.position_id,
    candidateId: row.candidate_id,
    status: row.status,
    sharedAt: row.shared_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});
