import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  cycleId,
  exceptionId,
  startupId,
  userId,
  type CycleId,
  type ExceptionId,
  type StartupId,
  type UserId,
} from '../shared/ids';

/**
 * A startup asking for more time.
 *
 * This is the pressure valve on the deadline machinery, and it is what decides
 * whether a startup's hours get reclaimed in Stage 4. An *approved* exception
 * protects the allocation; a pending or rejected one does not. Getting that
 * wrong takes hours away from a startup that had permission to be late, which
 * is the kind of mistake that ends programme participation.
 */

export const EXCEPTION_KINDS = ['position_submission', 'candidate_selection'] as const;
export const exceptionKind = z.enum(EXCEPTION_KINDS);
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const EXCEPTION_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export const exceptionStatus = z.enum(EXCEPTION_STATUSES);
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export interface ExceptionRequest {
  readonly id: ExceptionId;
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly kind: ExceptionKind;
  readonly status: ExceptionStatus;
  readonly reason: string;
  readonly requestedDeadline: string;
  /** What QSTP actually granted, which may be less than was asked for. */
  readonly grantedDeadline: string | null;
  readonly decisionNote: string | null;
  readonly requestedBy: UserId;
  readonly decidedBy: UserId | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const exceptionRow = z.object({
  id: exceptionId,
  cycle_id: cycleId,
  startup_id: startupId,
  kind: exceptionKind,
  status: exceptionStatus,
  reason: z.string().min(1),
  requested_deadline: z.iso.datetime({ offset: true }),
  granted_deadline: z.iso.datetime({ offset: true }).nullable(),
  decision_note: z.string().nullable(),
  requested_by: userId,
  decided_by: userId.nullable(),
  decided_at: z.iso.datetime({ offset: true }).nullable(),
  ...auditColumns,
});

export const exceptionEntity = defineEntity({
  name: 'ExceptionRequest',
  row: exceptionRow,
  toDomain: (row): ExceptionRequest => ({
    id: row.id,
    cycleId: row.cycle_id,
    startupId: row.startup_id,
    kind: row.kind,
    status: row.status,
    reason: row.reason,
    requestedDeadline: row.requested_deadline,
    grantedDeadline: row.granted_deadline,
    decisionNote: row.decision_note,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

/**
 * The deadline that actually applies to a startup, after any exception.
 *
 * Only an approved exception with a granted date moves the deadline. Everything
 * else — pending, rejected, expired — leaves the cycle deadline standing, which
 * is what stops "I asked for an extension" from behaving like "I was given one".
 */
export function effectiveDeadline(
  cycleDeadline: string,
  exceptions: readonly ExceptionRequest[],
  kind: ExceptionKind,
): string {
  const granted = exceptions
    .filter((e) => e.kind === kind && e.status === 'approved' && e.grantedDeadline !== null)
    .map((e) => e.grantedDeadline as string);

  // Latest granted extension wins, if any beats the original.
  return granted.reduce((latest, date) => (date > latest ? date : latest), cycleDeadline);
}

/** Whether missing this deadline should cost the startup its hours. */
export function isProtected(exceptions: readonly ExceptionRequest[], kind: ExceptionKind): boolean {
  return exceptions.some((e) => e.kind === kind && e.status === 'approved');
}

export const requestExceptionInput = z.object({
  kind: exceptionKind,
  reason: z.string().trim().min(10, 'Explain why the extension is needed.').max(2000),
  requestedDeadline: z.iso.datetime({ offset: true }),
});

export type RequestExceptionInput = z.infer<typeof requestExceptionInput>;

export const decideExceptionInput = z
  .object({
    exceptionId,
    decision: z.enum(['approved', 'rejected']),
    grantedDeadline: z.iso.datetime({ offset: true }).nullable().default(null),
    decisionNote: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((input) => input.decision === 'rejected' || input.grantedDeadline !== null, {
    message: 'Approving an exception requires a new deadline.',
    path: ['grantedDeadline'],
  });

export type DecideExceptionInput = z.infer<typeof decideExceptionInput>;
