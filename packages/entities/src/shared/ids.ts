import { z } from 'zod';
import type { Uuid } from '@relayflow/core';

/**
 * Every id type in the system, declared once with a matching schema.
 *
 * These are all uuids at runtime, so without branding the compiler would
 * happily let a `CandidateId` be passed where a `PositionId` belongs. In a
 * system whose entire job is keeping track of which candidate is reserved
 * against which position for which startup, that is not a theoretical risk.
 */

export type UserId = Uuid<'UserId'>;
export type CycleId = Uuid<'CycleId'>;
export type StartupId = Uuid<'StartupId'>;
export type StartupMemberId = Uuid<'StartupMemberId'>;
export type AllocationId = Uuid<'AllocationId'>;
export type PositionId = Uuid<'PositionId'>;
export type CandidateId = Uuid<'CandidateId'>;
export type PoolEntryId = Uuid<'PoolEntryId'>;
export type InterviewId = Uuid<'InterviewId'>;
export type SelectionId = Uuid<'SelectionId'>;
export type ExceptionId = Uuid<'ExceptionId'>;
export type DocumentId = Uuid<'DocumentId'>;

const uuid = z.uuid();

export const userId = uuid.transform((v) => v as UserId);
export const cycleId = uuid.transform((v) => v as CycleId);
export const startupId = uuid.transform((v) => v as StartupId);
export const startupMemberId = uuid.transform((v) => v as StartupMemberId);
export const allocationId = uuid.transform((v) => v as AllocationId);
export const positionId = uuid.transform((v) => v as PositionId);
export const candidateId = uuid.transform((v) => v as CandidateId);
export const poolEntryId = uuid.transform((v) => v as PoolEntryId);
export const interviewId = uuid.transform((v) => v as InterviewId);
export const selectionId = uuid.transform((v) => v as SelectionId);
export const exceptionId = uuid.transform((v) => v as ExceptionId);
export const documentId = uuid.transform((v) => v as DocumentId);
