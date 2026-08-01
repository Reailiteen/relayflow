import { z } from 'zod';
import { err, notFound, ok } from '@relayflow/core';
import { ANY_STARTUP, authorize, isStartup } from '@relayflow/access';
import {
  effectiveDeadline,
  isProtected,
  isSelectable,
  remainingStartupHours,
  reservesHours,
  totalWeeklyHours,
  type Allocation,
  type Candidate,
  type ExceptionRequest,
  type Interview,
  type PoolEntry,
  type Position,
  type Selection,
  type StartupId,
} from '@relayflow/entities';
import { defineUseCase, requireActor } from '../use-case';

/**
 * Read models for the startup portal.
 *
 * The brief is emphatic that a startup's first screen should answer "what do I
 * need to do?" rather than show analytics — these companies visit a handful of
 * times per cycle and have no interest in a dashboard. So the home view
 * computes one ranked next action rather than a set of charts.
 *
 * Every one of these resolves the startup from the actor rather than accepting
 * it as input, so a startup cannot read another's data by changing an id.
 */

/** The single startup this actor is acting for. */
function actingStartup(actor: Parameters<typeof isStartup>[0]): StartupId | null {
  if (!isStartup(actor)) return null;
  const active = actor.affiliations.filter((a) => a.status === 'active');
  return active[0]?.startupId ?? null;
}

export interface NextAction {
  readonly kind:
    | 'acknowledge_allocation'
    | 'submit_positions'
    | 'review_candidates'
    | 'complete_interviews'
    | 'select_candidates'
    | 'deadline_passed'
    | 'nothing';
  readonly headline: string;
  readonly detail: string;
  readonly href: string;
  readonly urgent: boolean;
  readonly deadline: string | null;
}

export interface StartupHome {
  readonly startupName: string;
  readonly cycleName: string;
  readonly allocation: Allocation | null;
  readonly allocatedHours: number;
  readonly usedHours: number;
  readonly remainingHours: number;
  readonly positionCount: number;
  readonly candidatesAwaitingReview: number;
  readonly interviewsPending: number;
  readonly selectionsMade: number;
  readonly selectionDeadline: string;
  readonly hasApprovedException: boolean;
  readonly pendingException: ExceptionRequest | null;
  readonly nextAction: NextAction;
}

export const getStartupHome = defineUseCase({
  name: 'startup.home',
  input: z.object({}),
  authorize: { capability: 'allocation:read_own' as const, startupId: ANY_STARTUP },

  execute: async (ctx) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const startupId = actingStartup(ctx.actor);
    if (!startupId) return err(notFound('You are not affiliated with a startup.'));

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [startup, allocation, positions, exceptions, selections] = await Promise.all([
      ctx.repos.startups.findById(startupId),
      ctx.repos.allocations.findForStartup(cycle.id, startupId),
      ctx.repos.positions.listForStartup(cycle.id, startupId),
      ctx.repos.exceptions.listForStartup(cycle.id, startupId),
      ctx.repos.selections.listForCycle(cycle.id),
    ]);
    if (!startup.ok) return err(startup.error);
    if (!allocation.ok) return err(allocation.error);
    if (!positions.ok) return err(positions.error);
    if (!exceptions.ok) return err(exceptions.error);
    if (!selections.ok) return err(selections.error);

    const allocatedHours = allocation.data?.weeklyHours ?? 0;
    const held = positions.data.filter((p) => reservesHours(p.status));
    const usedHours = held.reduce((total, p) => total + totalWeeklyHours(p), 0);

    // Pool counts need one read per position; there is rarely more than a
    // handful, and the alternative is a bespoke aggregate the fixtures adapter
    // would have to fake anyway.
    let awaitingReview = 0;
    for (const position of positions.data) {
      const pool = await ctx.repos.candidates.listPool(position.id);
      if (!pool.ok) return err(pool.error);
      awaitingReview += pool.data.filter(
        (row) => row.entry.status === 'pending' && isSelectable(row.candidate.availability),
      ).length;
    }

    const mine = selections.data.filter(
      (s) => s.startupId === startupId && s.status !== 'released' && s.status !== 'lost',
    );

    const deadline = effectiveDeadline(
      cycle.deadlines.candidateSelection,
      exceptions.data,
      'candidate_selection',
    );
    const now = ctx.clock.now().toISOString();
    const overdue = now > deadline;
    const pendingException = exceptions.data.find((e) => e.status === 'pending') ?? null;

    return ok<StartupHome>({
      startupName: startup.data?.name ?? 'Your startup',
      cycleName: cycle.name,
      allocation: allocation.data,
      allocatedHours,
      usedHours,
      remainingHours: remainingStartupHours(
        allocatedHours,
        held.map((p) => totalWeeklyHours(p)),
      ),
      positionCount: positions.data.length,
      candidatesAwaitingReview: awaitingReview,
      interviewsPending: 0,
      selectionsMade: mine.length,
      selectionDeadline: deadline,
      hasApprovedException: exceptions.data.some((e) => e.status === 'approved'),
      pendingException,
      nextAction: decideNextAction({
        allocatedHours,
        positionCount: positions.data.length,
        awaitingReview,
        selectionsMade: mine.length,
        overdue,
        deadline,
        hasPendingException: pendingException !== null,
      }),
    });
  },
});

/**
 * One action, chosen in workflow order.
 *
 * Returning a single item rather than a list is the point: a startup that is
 * shown five things to do does none of them. The order below is the order the
 * cycle actually runs in, so the answer is always the earliest unfinished step.
 */
function decideNextAction(state: {
  allocatedHours: number;
  positionCount: number;
  awaitingReview: number;
  selectionsMade: number;
  overdue: boolean;
  deadline: string;
  hasPendingException: boolean;
}): NextAction {
  if (state.allocatedHours === 0) {
    return {
      kind: 'nothing',
      headline: 'No hours allocated this cycle',
      detail:
        'You have not been allocated internship hours. If hours are redistributed you will be invited to submit roles.',
      href: '/startup',
      urgent: false,
      deadline: null,
    };
  }

  if (state.overdue && state.selectionsMade === 0) {
    return {
      kind: 'deadline_passed',
      headline: 'The selection deadline has passed',
      detail: state.hasPendingException
        ? 'Your extension request is with QSTP. Your hours are held until they decide.'
        : 'Request an extension now, or your allocated hours will be redistributed.',
      href: '/startup/exception',
      urgent: true,
      deadline: state.deadline,
    };
  }

  if (state.positionCount === 0) {
    return {
      kind: 'submit_positions',
      headline: 'Submit your internship positions',
      detail: `You have ${state.allocatedHours} weekly hours to allocate across roles.`,
      href: '/startup/positions/new',
      urgent: true,
      deadline: state.deadline,
    };
  }

  if (state.awaitingReview > 0) {
    return {
      kind: 'review_candidates',
      headline: `Review ${state.awaitingReview} candidate${state.awaitingReview === 1 ? '' : 's'}`,
      detail: 'Candidates are waiting for a first look. Shortlist or reject each one.',
      href: '/startup/candidates',
      urgent: false,
      deadline: state.deadline,
    };
  }

  if (state.selectionsMade === 0) {
    return {
      kind: 'select_candidates',
      headline: 'Select your interns',
      detail: 'Candidates are reserved first-come-first-served, so do not leave it late.',
      href: '/startup/candidates',
      urgent: true,
      deadline: state.deadline,
    };
  }

  return {
    kind: 'nothing',
    headline: 'Nothing needs your attention',
    detail: 'Your selections are in. QSTP will confirm onboarding with each candidate.',
    href: '/startup',
    urgent: false,
    deadline: null,
  };
}

// ─── Positions ───────────────────────────────────────────────────────────────

export interface StartupPositions {
  readonly positions: readonly Position[];
  readonly allocatedHours: number;
  readonly usedHours: number;
  readonly remainingHours: number;
}

export const getStartupPositions = defineUseCase({
  name: 'startup.positions',
  input: z.object({}),
  authorize: { capability: 'position:read_own' as const, startupId: ANY_STARTUP },

  execute: async (ctx) => {
    const startupId = actingStartup(ctx.actor);
    if (!startupId) return err(notFound('You are not affiliated with a startup.'));

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [allocation, positions] = await Promise.all([
      ctx.repos.allocations.findForStartup(cycle.id, startupId),
      ctx.repos.positions.listForStartup(cycle.id, startupId),
    ]);
    if (!allocation.ok) return err(allocation.error);
    if (!positions.ok) return err(positions.error);

    const held = positions.data.filter((p) => reservesHours(p.status));
    const allocatedHours = allocation.data?.weeklyHours ?? 0;

    return ok<StartupPositions>({
      positions: positions.data,
      allocatedHours,
      usedHours: held.reduce((total, p) => total + totalWeeklyHours(p), 0),
      remainingHours: remainingStartupHours(
        allocatedHours,
        held.map((p) => totalWeeklyHours(p)),
      ),
    });
  },
});

// ─── Candidate pools ─────────────────────────────────────────────────────────

export interface PoolCandidate {
  readonly entry: PoolEntry;
  readonly candidate: Candidate;
  readonly interview: Interview | null;
  /** Our own claim, if we have made one. */
  readonly selection: Selection | null;
  /** True when another startup holds them — the pool must say so. */
  readonly takenByOther: boolean;
}

export interface PositionPool {
  readonly position: Position;
  readonly candidates: readonly PoolCandidate[];
}

export interface StartupPools {
  readonly pools: readonly PositionPool[];
  readonly selectionDeadline: string;
  /**
   * Both are here rather than left to the screen because "has the deadline
   * passed?" needs a server clock, and the candidate board refuses a selection
   * on the answer. A browser's clock is not a fact about the programme.
   */
  readonly deadlinePassed: boolean;
  readonly hasApprovedException: boolean;
}

export const getStartupPools = defineUseCase({
  name: 'startup.pools',
  input: z.object({}),
  authorize: { capability: 'candidate:read_pool' as const, startupId: ANY_STARTUP },

  execute: async (ctx) => {
    const startupId = actingStartup(ctx.actor);
    if (!startupId) return err(notFound('You are not affiliated with a startup.'));

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [positions, selections, exceptions] = await Promise.all([
      ctx.repos.positions.listForStartup(cycle.id, startupId),
      ctx.repos.selections.listForCycle(cycle.id),
      ctx.repos.exceptions.listForStartup(cycle.id, startupId),
    ]);
    if (!positions.ok) return err(positions.error);
    if (!selections.ok) return err(selections.error);
    if (!exceptions.ok) return err(exceptions.error);

    const pools: PositionPool[] = [];

    for (const position of positions.data) {
      const [pool, interviews] = await Promise.all([
        ctx.repos.candidates.listPool(position.id),
        ctx.repos.interviews.listForPosition(position.id),
      ]);
      if (!pool.ok) return err(pool.error);
      if (!interviews.ok) return err(interviews.error);

      pools.push({
        position,
        candidates: pool.data.map((row) => {
          const claims = selections.data.filter(
            (s) =>
              s.candidateId === row.candidate.id &&
              (s.status === 'reserved' || s.status === 'confirmed'),
          );
          const ours = claims.find((s) => s.startupId === startupId) ?? null;

          return {
            entry: row.entry,
            candidate: row.candidate,
            interview: interviews.data.find((i) => i.candidateId === row.candidate.id) ?? null,
            selection: ours,
            // Someone else holds them. Showing this up front saves a startup
            // from interviewing a person they can no longer hire.
            takenByOther: ours === null && claims.length > 0,
          };
        }),
      });
    }

    const deadline = effectiveDeadline(
      cycle.deadlines.candidateSelection,
      exceptions.data,
      'candidate_selection',
    );

    return ok<StartupPools>({
      pools,
      selectionDeadline: deadline,
      deadlinePassed: ctx.clock.now().toISOString() > deadline,
      hasApprovedException: isProtected(exceptions.data, 'candidate_selection'),
    });
  },
});

// ─── Exceptions ──────────────────────────────────────────────────────────────

export const getStartupExceptions = defineUseCase({
  name: 'startup.exceptions',
  input: z.object({}),
  authorize: { capability: 'exception:request' as const, startupId: ANY_STARTUP },

  execute: async (ctx) => {
    const startupId = actingStartup(ctx.actor);
    if (!startupId) return err(notFound('You are not affiliated with a startup.'));

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const scoped = authorize(ctx.actor, { capability: 'exception:request', startupId });
    if (!scoped.ok) return scoped;

    const exceptions = await ctx.repos.exceptions.listForStartup(cycle.id, startupId);
    if (!exceptions.ok) return exceptions;

    return ok({
      exceptions: exceptions.data,
      originalDeadline: cycle.deadlines.candidateSelection,
      effectiveDeadline: effectiveDeadline(
        cycle.deadlines.candidateSelection,
        exceptions.data,
        'candidate_selection',
      ),
    });
  },
});
