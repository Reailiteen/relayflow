import { z } from 'zod';
import { err, notFound, ok, type Result } from '@relayflow/core';
import { isCandidate } from '@relayflow/access';
import {
  acceptedOffer,
  openOffers,
  lowConfidenceFields,
  needsCandidateAction,
  unconfirmedFields,
  type Candidate,
  type CandidateDocument,
  type CandidateId,
  type Interview,
  type Position,
  type Selection,
  type Startup,
} from '@relayflow/entities';
import { defineUseCase } from '../use-case';

/**
 * The candidate's view of their own journey.
 *
 * This portal is the smallest of the three and has the least forgiving
 * audience: a student who receives one email, clicks a link, and needs to know
 * what is being asked of them within a few seconds. So the model here is a
 * single linear journey with exactly one current step, not a dashboard.
 *
 * Every read is scoped to the actor's own candidate id. A candidate can see
 * themselves and nothing else — not the pool they are in, not the other people
 * being considered, not the startup's notes about them.
 */

export const JOURNEY_STEPS = [
  'availability',
  'interview',
  'placement',
  'documents',
  'onboarded',
] as const;

export type JourneyStep = (typeof JOURNEY_STEPS)[number];

export type StepState = 'done' | 'current' | 'upcoming' | 'blocked';

export interface JourneyStepView {
  readonly step: JourneyStep;
  readonly label: string;
  readonly state: StepState;
  /** One line describing where this step stands, written for the candidate. */
  readonly summary: string;
}

export interface CandidateOverview {
  readonly candidate: Candidate;
  readonly journey: readonly JourneyStepView[];
  readonly currentStep: JourneyStep;
  /** What to do right now, or null when the ball is in someone else's court. */
  readonly action: { label: string; href: string } | null;
  readonly placement: {
    readonly selection: Selection;
    readonly position: Position | null;
    readonly startup: Startup | null;
  } | null;
  readonly upcomingInterview: Interview | null;
  readonly documentsOutstanding: number;
  readonly documentsRejected: number;
}

function candidateIdOf(actor: Parameters<typeof isCandidate>[0]): CandidateId | null {
  return isCandidate(actor) ? actor.candidateId : null;
}

export const getCandidateOverview = defineUseCase({
  name: 'candidate.overview',
  input: z.object({}),
  authorize: { capability: 'candidate:read_self' as const },

  execute: async (ctx) => {
    const candidateId = candidateIdOf(ctx.actor);
    if (!candidateId) return err(notFound('No candidate record for this account.'));

    const [candidateResult, selections, interviews, documents] = await Promise.all([
      ctx.repos.candidates.findById(candidateId),
      ctx.repos.selections.listForCandidate(candidateId),
      ctx.repos.interviews.listForCandidate(candidateId),
      ctx.repos.documents.listForCandidate(candidateId),
    ]);
    if (!candidateResult.ok) return err(candidateResult.error);
    if (!selections.ok) return err(selections.error);
    if (!interviews.ok) return err(interviews.error);
    if (!documents.ok) return err(documents.error);

    const candidate = candidateResult.data;
    if (!candidate) return err(notFound('Candidate record not found.'));

    const held =
      selections.data.find((s) => s.status === 'confirmed') ??
      selections.data.find((s) => s.status === 'accepted') ??
      selections.data.find((s) => s.status === 'reserved') ??
      null;

    let placement: CandidateOverview['placement'] = null;
    if (held) {
      const position = await ctx.repos.positions.findById(held.positionId);
      if (!position.ok) return err(position.error);
      const startup = await ctx.repos.startups.findById(held.startupId);
      if (!startup.ok) return err(startup.error);
      placement = { selection: held, position: position.data, startup: startup.data };
    }

    const upcoming =
      interviews.data.find((i) => i.status === 'scheduled' || i.status === 'requested') ?? null;

    // Offers awaiting their decision. Not the same as "nobody has picked you":
    // under candidate-choice the ball is in the candidate's court, and the
    // placement step below would otherwise tell them the opposite.
    const waiting = openOffers(selections.data);

    const outstanding = documents.data.filter((d) => needsCandidateAction(d.status));
    const rejected = documents.data.filter((d) => d.status === 'rejected');

    // ── Journey ──────────────────────────────────────────────────────────────
    const availabilityDone = candidate.availability !== 'unconfirmed';
    const withdrawn =
      candidate.availability === 'employed' ||
      candidate.availability === 'not_interested' ||
      candidate.availability === 'temporarily_unavailable';

    const interviewDone = interviews.data.some((i) => i.status === 'completed');
    const placed = held !== null;
    const documentsDone = documents.data.length > 0 && outstanding.length === 0;
    const onboarded = documentsDone && documents.data.every((d) => d.status === 'verified');

    let currentStep: JourneyStep = 'availability';
    if (withdrawn) currentStep = 'availability';
    else if (!availabilityDone) currentStep = 'availability';
    else if (!placed && (upcoming ?? !interviewDone)) currentStep = 'interview';
    else if (!placed) currentStep = 'placement';
    else if (!documentsDone) currentStep = 'documents';
    else currentStep = 'onboarded';

    const stateFor = (step: JourneyStep): StepState => {
      if (withdrawn && step !== 'availability') return 'blocked';
      const order = JOURNEY_STEPS.indexOf(step);
      const here = JOURNEY_STEPS.indexOf(currentStep);
      if (order < here) return 'done';
      if (order === here) return (step === 'onboarded' ? 'done' : 'current');
      return 'upcoming';
    };

    const journey: JourneyStepView[] = [
      {
        step: 'availability',
        label: 'Confirm availability',
        state: stateFor('availability'),
        summary: withdrawn
          ? 'You told us you are not available for this cycle.'
          : availabilityDone
            ? 'You confirmed you are available.'
            : 'Let us know whether you are still looking for an internship.',
      },
      {
        step: 'interview',
        label: 'Interview',
        state: stateFor('interview'),
        summary: upcoming
          ? 'You have an interview scheduled.'
          : interviewDone
            ? 'Your interview is complete.'
            : 'A startup will invite you if they would like to meet.',
      },
      {
        step: 'placement',
        label: 'Placement',
        state: stateFor('placement'),
        summary: placement
          ? `${placement.startup?.name ?? 'A startup'} selected you for ${placement.position?.title ?? 'a role'}.`
          : waiting.length > 1
            ? `${waiting.length} startups have offered you a role. The choice is yours.`
            : waiting.length === 1
              ? 'A startup has offered you a role.'
              : 'No startup has selected you yet.',
      },
      {
        step: 'documents',
        label: 'Documents',
        state: stateFor('documents'),
        summary:
          rejected.length > 0
            ? `${rejected.length} document${rejected.length === 1 ? ' needs' : 's need'} fixing.`
            : outstanding.length > 0
              ? `${outstanding.length} document${outstanding.length === 1 ? '' : 's'} still to send.`
              : documents.data.length > 0
                ? 'All your documents are in.'
                : 'Requested once you are placed.',
      },
      {
        step: 'onboarded',
        label: 'Ready to start',
        state: onboarded ? 'done' : stateFor('onboarded'),
        summary: onboarded
          ? 'QSTP has verified everything. You are ready to start.'
          : 'QSTP verifies your documents and confirms your start date.',
      },
    ];

    // One action, matching the current step.
    let action: CandidateOverview['action'] = null;
    if (!availabilityDone) action = { label: 'Confirm your availability', href: '/candidate' };
    // A pending offer outranks everything below it: it is the only item on this
    // list that nobody else can do for them, and it is holding up startups.
    else if (waiting.length > 0) {
      action = {
        label: waiting.length > 1 ? 'Choose between your offers' : 'Respond to your offer',
        href: '/candidate/offers',
      };
    } else if (currentStep === 'documents' && (outstanding.length > 0 || rejected.length > 0)) {
      action = {
        label: rejected.length > 0 ? 'Fix your documents' : 'Send your documents',
        href: '/candidate/documents',
      };
    } else if (upcoming) action = { label: 'View your interview', href: '/candidate/interviews' };

    return ok<CandidateOverview>({
      candidate,
      journey,
      currentStep,
      action,
      placement,
      upcomingInterview: upcoming,
      documentsOutstanding: outstanding.length,
      documentsRejected: rejected.length,
    });
  },
});

// ─── Offers ──────────────────────────────────────────────────────────────────

export interface CandidateOfferView {
  readonly selection: Selection;
  readonly position: Position | null;
  readonly startup: Startup | null;
}

export interface CandidateOffersView {
  readonly offers: readonly CandidateOfferView[];
  /**
   * True when there is more than one to weigh up. With a single offer there is
   * nothing to choose *between*, so the portal asks them to accept or decline
   * it rather than presenting a decision that does not exist.
   */
  readonly isAChoice: boolean;
  /** Set once they have chosen — the portal then shows the outcome, not a form. */
  readonly accepted: CandidateOfferView | null;
  /** When the offers stop being theirs to decide, or null outside this mode. */
  readonly closesAt: string | null;
  readonly closed: boolean;
}

/**
 * The offers on the table, for the candidate deciding between them.
 *
 * They see every startup that offered, because otherwise there is nothing to
 * choose between — this is the one place the programme deliberately shows a
 * candidate who else wanted them. The reverse is not true: a startup is told
 * nothing about its competition.
 */
export const getCandidateOffers = defineUseCase({
  name: 'candidate.offers',
  input: z.object({}),
  authorize: { capability: 'selection:read_own_offers' as const },

  execute: async (ctx) => {
    const candidateId = candidateIdOf(ctx.actor);
    if (!candidateId) return err(notFound('No candidate record for this account.'));

    const [selections, cycleResult] = await Promise.all([
      ctx.repos.selections.listForCandidate(candidateId),
      ctx.repos.cycles.findActive(),
    ]);
    if (!selections.ok) return err(selections.error);
    if (!cycleResult.ok) return err(cycleResult.error);

    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const decorate = async (selection: Selection): Promise<Result<CandidateOfferView>> => {
      const position = await ctx.repos.positions.findById(selection.positionId);
      if (!position.ok) return err(position.error);
      const startup = await ctx.repos.startups.findById(selection.startupId);
      if (!startup.ok) return err(startup.error);
      return ok({ selection, position: position.data, startup: startup.data });
    };

    const open: CandidateOfferView[] = [];
    for (const selection of openOffers(selections.data)) {
      const view = await decorate(selection);
      if (!view.ok) return err(view.error);
      open.push(view.data);
    }

    const chosen = acceptedOffer(selections.data);
    let accepted: CandidateOfferView | null = null;
    if (chosen) {
      const view = await decorate(chosen);
      if (!view.ok) return err(view.error);
      accepted = view.data;
    }

    const closesAt = cycle.deadlines.offerWindow;

    return ok<CandidateOffersView>({
      offers: open,
      isAChoice: open.length > 1,
      accepted,
      closesAt,
      closed: closesAt !== null && ctx.clock.now().toISOString() > closesAt,
    });
  },
});

// ─── Documents ───────────────────────────────────────────────────────────────

export interface CandidateDocumentView {
  readonly document: CandidateDocument;
  readonly needsAction: boolean;
  /** Fields the candidate has not confirmed yet. */
  readonly unconfirmed: number;
  /** Fields OCR was unsure about — these want a second look. */
  readonly lowConfidence: readonly string[];
}

export const getCandidateDocuments = defineUseCase({
  name: 'candidate.documents',
  input: z.object({}),
  authorize: { capability: 'document:read_own' as const },

  execute: async (ctx) => {
    const candidateId = candidateIdOf(ctx.actor);
    if (!candidateId) return err(notFound('No candidate record for this account.'));

    const documents = await ctx.repos.documents.listForCandidate(candidateId);
    if (!documents.ok) return documents;

    return ok(
      documents.data.map(
        (document): CandidateDocumentView => ({
          document,
          needsAction: needsCandidateAction(document.status),
          unconfirmed: unconfirmedFields(document.fields).length,
          lowConfidence: lowConfidenceFields(document.fields).map((field) => field.key),
        }),
      ),
    );
  },
});

// ─── Interviews ──────────────────────────────────────────────────────────────

export interface CandidateInterviewView {
  readonly interview: Interview;
  readonly position: Position | null;
  readonly startup: Startup | null;
}

export const getCandidateInterviews = defineUseCase({
  name: 'candidate.interviews',
  input: z.object({}),
  authorize: { capability: 'interview:read_own' as const },

  execute: async (ctx) => {
    const candidateId = candidateIdOf(ctx.actor);
    if (!candidateId) return err(notFound('No candidate record for this account.'));

    const interviews = await ctx.repos.interviews.listForCandidate(candidateId);
    if (!interviews.ok) return interviews;

    const views: CandidateInterviewView[] = [];
    for (const interview of interviews.data) {
      const position = await ctx.repos.positions.findById(interview.positionId);
      if (!position.ok) return err(position.error);
      const startup = position.data
        ? await ctx.repos.startups.findById(position.data.startupId)
        : null;
      if (startup && !startup.ok) return err(startup.error);

      views.push({
        interview,
        position: position.data,
        startup: startup?.ok ? startup.data : null,
      });
    }

    return ok(views);
  },
});
