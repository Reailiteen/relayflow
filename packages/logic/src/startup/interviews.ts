import { z } from 'zod';
import { conflict, err, forbidden, notFound, ok } from '@relayflow/core';
import { ANY_STARTUP, authorize, isStartup } from '@relayflow/access';
import {
  interviewId,
  isSelectable,
  scheduleInterviewInput,
  type Candidate,
  type Interview,
  type Position,
  type StartupId,
} from '@relayflow/entities';
import { defineUseCase, requireActor } from '../use-case';

/**
 * Interviews, from the startup's side.
 *
 * The AI pieces here are assistive and are modelled as such: the transcript and
 * summary are generated, the *verdict* is not. `feedback` and `recommendation`
 * are only ever written by the interviewer, because a hiring decision attributed
 * to a summariser is one nobody can defend when the candidate asks why.
 */

function actingStartup(actor: Parameters<typeof isStartup>[0]): StartupId | null {
  if (!isStartup(actor)) return null;
  return actor.affiliations.find((a) => a.status === 'active')?.startupId ?? null;
}

export interface StartupInterviewView {
  readonly interview: Interview;
  readonly candidate: Candidate | null;
  readonly position: Position | null;
  /** True when the candidate can still be hired — a stale interview is waste. */
  readonly candidateStillAvailable: boolean;
}

export interface StartupInterviews {
  readonly upcoming: readonly StartupInterviewView[];
  readonly completed: readonly StartupInterviewView[];
  /** Pool entries a startup has asked to interview but not yet scheduled. */
  readonly awaitingSchedule: readonly {
    candidate: Candidate;
    position: Position;
  }[];
}

export const getStartupInterviews = defineUseCase({
  name: 'startup.interviews',
  input: z.object({}),
  authorize: { capability: 'interview:read_own' as const, startupId: ANY_STARTUP },

  execute: async (ctx) => {
    const startupId = actingStartup(ctx.actor);
    if (!startupId) return err(notFound('You are not affiliated with a startup.'));

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const positions = await ctx.repos.positions.listForStartup(cycle.id, startupId);
    if (!positions.ok) return positions;

    const upcoming: StartupInterviewView[] = [];
    const completed: StartupInterviewView[] = [];
    const awaitingSchedule: { candidate: Candidate; position: Position }[] = [];

    for (const position of positions.data) {
      const [interviews, pool] = await Promise.all([
        ctx.repos.interviews.listForPosition(position.id),
        ctx.repos.candidates.listPool(position.id),
      ]);
      if (!interviews.ok) return err(interviews.error);
      if (!pool.ok) return err(pool.error);

      const scheduled = new Set(interviews.data.map((i) => i.candidateId));

      for (const interview of interviews.data) {
        const candidate = pool.data.find((row) => row.candidate.id === interview.candidateId)
          ?.candidate;

        const view: StartupInterviewView = {
          interview,
          candidate: candidate ?? null,
          position,
          candidateStillAvailable: candidate ? isSelectable(candidate.availability) : false,
        };

        if (interview.status === 'completed' || interview.status === 'no_show') completed.push(view);
        else upcoming.push(view);
      }

      // Asked for, never booked. This is the gap where startups quietly lose
      // people, so it gets its own list rather than being inferred from absence.
      for (const row of pool.data) {
        if (row.entry.status !== 'interview_requested') continue;
        if (scheduled.has(row.candidate.id)) continue;
        awaitingSchedule.push({ candidate: row.candidate, position });
      }
    }

    const byDate = (a: StartupInterviewView, b: StartupInterviewView) =>
      (a.interview.scheduledFor ?? '').localeCompare(b.interview.scheduledFor ?? '');

    return ok<StartupInterviews>({
      upcoming: upcoming.sort(byDate),
      // Most recent first: the one just finished is the one being written up.
      completed: completed.sort(byDate).reverse(),
      awaitingSchedule,
    });
  },
});

/** Confirms the position belongs to the acting startup before any write. */
async function ownedPosition(ctx: Parameters<typeof getStartupInterviews>[0], positionId: string) {
  const startupId = actingStartup(ctx.actor);
  if (!startupId) return err(forbidden('You are not affiliated with a startup.'));

  const position = await ctx.repos.positions.findById(
    positionId as Parameters<typeof ctx.repos.positions.findById>[0],
  );
  if (!position.ok) return position;
  if (!position.data) return err(notFound('Position not found.'));

  const scoped = authorize(ctx.actor, {
    capability: 'interview:schedule',
    startupId: position.data.startupId,
  });
  if (!scoped.ok) return scoped;

  return ok(position.data);
}

export const scheduleInterview = defineUseCase({
  name: 'startup.scheduleInterview',
  input: scheduleInterviewInput,
  authorize: { capability: 'interview:schedule' as const, startupId: ANY_STARTUP },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const position = await ownedPosition(ctx, input.positionId);
    if (!position.ok) return position;

    const pool = await ctx.repos.candidates.listPool(position.data.id);
    if (!pool.ok) return pool;

    const row = pool.data.find((entry) => entry.candidate.id === input.candidateId);
    // Not "not found": the startup can see this position, so an unfamiliar
    // candidate id means they are reaching outside their pool.
    if (!row) return err(forbidden('That candidate is not in this position’s pool.'));

    if (!isSelectable(row.candidate.availability)) {
      return err(
        conflict('That candidate is no longer available, so an interview would be wasted.'),
      );
    }

    const scheduled = await ctx.repos.interviews.schedule({
      positionId: position.data.id,
      candidateId: input.candidateId,
      mode: input.mode,
      scheduledFor: input.scheduledFor,
      durationMinutes: input.durationMinutes,
      location: input.location,
      interviewerId: actor.data.userId,
      createdAt: ctx.clock.now().toISOString(),
    });
    if (!scheduled.ok) return scheduled;

    ctx.logger.info('interview scheduled', {
      positionId: position.data.id,
      candidateId: input.candidateId,
      mode: input.mode,
    });

    return ok(scheduled.data);
  },
});

/**
 * Attaches a recording and kicks off transcription.
 *
 * There is no upload here — in production the audio goes straight to storage
 * from the client and a worker transcribes it. What this records is that a
 * recording exists, which is what moves the interview forward.
 */
export const attachRecording = defineUseCase({
  name: 'startup.attachRecording',

  input: z.object({ interviewId, recordingUrl: z.string().trim().min(1).max(1000) }),

  authorize: { capability: 'interview:record' as const, startupId: ANY_STARTUP },

  execute: async (ctx, input) => {
    const interview = await ctx.repos.interviews.findById(input.interviewId);
    if (!interview.ok) return interview;
    if (!interview.data) return err(notFound('Interview not found.'));

    const position = await ownedPosition(ctx, interview.data.positionId);
    if (!position.ok) return position;

    const recorded = await ctx.repos.interviews.attachRecording({
      interviewId: input.interviewId,
      recordingUrl: input.recordingUrl,
      recordedAt: ctx.clock.now().toISOString(),
    });
    if (!recorded.ok) return recorded;

    ctx.logger.info('recording attached', { interviewId: input.interviewId });

    return ok(recorded.data);
  },
});

/**
 * The interviewer's verdict.
 *
 * Kept separate from the AI summary on purpose: one is a suggestion the model
 * produced, the other is a judgement a person is accountable for, and merging
 * them would make it impossible to say later which was which.
 */
export const saveInterviewFeedback = defineUseCase({
  name: 'startup.saveInterviewFeedback',

  input: z.object({
    interviewId,
    feedback: z.string().trim().min(1, 'Write a line or two.').max(4000),
    recommendation: z.enum(['advance', 'reject', 'undecided']),
  }),

  authorize: { capability: 'interview:record' as const, startupId: ANY_STARTUP },

  execute: async (ctx, input) => {
    const interview = await ctx.repos.interviews.findById(input.interviewId);
    if (!interview.ok) return interview;
    if (!interview.data) return err(notFound('Interview not found.'));

    const position = await ownedPosition(ctx, interview.data.positionId);
    if (!position.ok) return position;

    const saved = await ctx.repos.interviews.saveFeedback({
      interviewId: input.interviewId,
      feedback: input.feedback,
      recommendation: input.recommendation,
      savedAt: ctx.clock.now().toISOString(),
    });
    if (!saved.ok) return saved;

    ctx.logger.info('interview feedback saved', {
      interviewId: input.interviewId,
      recommendation: input.recommendation,
    });

    return ok(saved.data);
  },
});
