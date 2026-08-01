import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  candidateId,
  interviewId,
  positionId,
  userId,
  type CandidateId,
  type InterviewId,
  type PositionId,
  type UserId,
} from '../shared/ids';

/**
 * An interview, its recording, and what came out of it.
 *
 * The AI pieces — transcript, summary, structured notes — are stored as plain
 * fields with their own status, not as a magic property of the interview. They
 * fail, they take minutes to arrive, and they need re-running; modelling that
 * explicitly keeps a stalled transcription from looking like a lost interview.
 */

export const INTERVIEW_MODES = ['online', 'in_person'] as const;
export const interviewMode = z.enum(INTERVIEW_MODES);
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_STATUSES = [
  'requested', // startup asked; candidate has not confirmed
  'confirmed', // candidate agreed; startup can now schedule the slot
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
] as const;
export const interviewStatus = z.enum(INTERVIEW_STATUSES);
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

/** Transcription runs asynchronously and can fail; the UI must show which. */
export const TRANSCRIPT_STATUSES = ['none', 'processing', 'ready', 'failed'] as const;
export const transcriptStatus = z.enum(TRANSCRIPT_STATUSES);
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

export interface Interview {
  readonly id: InterviewId;
  readonly positionId: PositionId;
  readonly candidateId: CandidateId;
  readonly mode: InterviewMode;
  readonly status: InterviewStatus;
  readonly scheduledFor: string | null;
  readonly durationMinutes: number | null;
  /** Meeting link for online, address for in-person. */
  readonly location: string | null;
  readonly recordingUrl: string | null;
  readonly transcriptStatus: TranscriptStatus;
  readonly transcript: string | null;
  /** AI-generated. Always shown as a draft for a human to correct. */
  readonly aiSummary: string | null;
  /** The interviewer's own verdict. Never written by the AI. */
  readonly feedback: string | null;
  readonly recommendation: 'advance' | 'reject' | 'undecided' | null;
  readonly interviewerId: UserId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const interviewRow = z.object({
  id: interviewId,
  position_id: positionId,
  candidate_id: candidateId,
  mode: interviewMode,
  status: interviewStatus,
  scheduled_for: z.iso.datetime({ offset: true }).nullable(),
  duration_minutes: z.number().int().min(5).max(480).nullable(),
  location: z.string().max(2000).nullable(),
  recording_url: z.string().nullable(),
  transcript_status: transcriptStatus,
  transcript: z.string().nullable(),
  ai_summary: z.string().nullable(),
  feedback: z.string().nullable(),
  recommendation: z.enum(['advance', 'reject', 'undecided']).nullable(),
  interviewer_id: userId.nullable(),
  ...auditColumns,
});

export const interviewEntity = defineEntity({
  name: 'Interview',
  row: interviewRow,
  toDomain: (row): Interview => ({
    id: row.id,
    positionId: row.position_id,
    candidateId: row.candidate_id,
    mode: row.mode,
    status: row.status,
    scheduledFor: row.scheduled_for,
    durationMinutes: row.duration_minutes,
    location: row.location,
    recordingUrl: row.recording_url,
    transcriptStatus: row.transcript_status,
    transcript: row.transcript,
    aiSummary: row.ai_summary,
    feedback: row.feedback,
    recommendation: row.recommendation,
    interviewerId: row.interviewer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const scheduleInterviewInput = z
  .object({
    positionId,
    candidateId,
    mode: interviewMode,
    scheduledFor: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(240).default(45),
    location: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((i) => i.mode === 'online' || !!i.location?.trim(), {
    message: 'An in-person interview needs a location.',
    path: ['location'],
  });

export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewInput>;
