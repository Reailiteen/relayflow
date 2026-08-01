import { z } from 'zod';
import { err, notFound, ok } from '@relayflow/core';
import {
  budgetView,
  contenders,
  effectiveDeadline,
  isProtected,
  recommendedTier,
  reservesHours,
  totalWeeklyHours,
  winner,
  type Allocation,
  type BudgetView,
  type Candidate,
  type CandidateId,
  type ExceptionRequest,
  type HourTier,
  type Selection,
  type Startup,
  type StartupId,
} from '@relayflow/entities';
import { defineUseCase } from '../use-case';

/**
 * Read models for the QSTP screens.
 *
 * Each one assembles everything a screen needs in a single call, rather than
 * letting the page fetch four things and join them in JSX. Two reasons: the
 * joins carry real rules (which deadline applies, who won a conflict), and
 * those rules must not be re-implemented per screen where they can drift.
 */

// ─── Allocation workspace ────────────────────────────────────────────────────

export interface AllocationRow {
  readonly startup: Startup;
  readonly allocation: Allocation | null;
  readonly score: number | null;
  /** What the score ladder suggests, so an override is visible as an override. */
  readonly recommended: HourTier | null;
  readonly isOverride: boolean;
  /** Weekly hours the startup has actually committed to positions. */
  readonly positionHours: number;
  readonly positionCount: number;
}

export interface AllocationWorkspace {
  readonly cycleName: string;
  readonly budget: BudgetView;
  readonly rows: readonly AllocationRow[];
}

export const getAllocationWorkspace = defineUseCase({
  name: 'qstp.allocationWorkspace',
  input: z.object({}),
  authorize: { capability: 'allocation:read_all' as const },

  execute: async (ctx) => {
    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [startups, allocations, positions] = await Promise.all([
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.allocations.listForCycle(cycle.id),
      ctx.repos.positions.listForCycle(cycle.id),
    ]);
    if (!startups.ok) return err(startups.error);
    if (!allocations.ok) return err(allocations.error);
    if (!positions.ok) return err(positions.error);

    const rows: AllocationRow[] = startups.data.map((startup) => {
      const allocation = allocations.data.find((a) => a.startupId === startup.id) ?? null;
      const theirPositions = positions.data.filter(
        (p) => p.startupId === startup.id && reservesHours(p.status),
      );

      return {
        startup,
        allocation,
        score: allocation?.score ?? null,
        recommended: allocation?.score === null ? null : recommendedTier(allocation?.score ?? 0),
        isOverride: allocation?.overrideReason !== null && allocation?.overrideReason !== undefined,
        positionHours: theirPositions.reduce((total, p) => total + totalWeeklyHours(p), 0),
        positionCount: theirPositions.length,
      };
    });

    const allocated = allocations.data
      .filter((a) => a.status === 'confirmed')
      .reduce((total, a) => total + a.weeklyHours, 0);

    return ok<AllocationWorkspace>({
      cycleName: cycle.name,
      budget: budgetView({ funded: cycle.fundedWeeklyHours, allocated, committed: 0 }),
      // Highest score first: the ranking is the point of the screen.
      rows: [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    });
  },
});

// ─── Conflicts ───────────────────────────────────────────────────────────────

export interface ConflictClaim {
  readonly selection: Selection;
  readonly startup: Startup | null;
  readonly isWinner: boolean;
}

export interface ConflictView {
  readonly candidate: Candidate;
  readonly claims: readonly ConflictClaim[];
  /** True when a QSTP override, rather than the clock, decided this. */
  readonly decidedByOverride: boolean;
}

export const listConflicts = defineUseCase({
  name: 'qstp.listConflicts',
  input: z.object({}),
  authorize: { capability: 'selection:read_all' as const },

  execute: async (ctx) => {
    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return ok<ConflictView[]>([]);

    const [selections, startups, candidates] = await Promise.all([
      ctx.repos.selections.listForCycle(cycle.id),
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.candidates.listForCycle(cycle.id),
    ]);
    if (!selections.ok) return err(selections.error);
    if (!startups.ok) return err(startups.error);
    if (!candidates.ok) return err(candidates.error);

    const byCandidate = new Map<CandidateId, Selection[]>();
    for (const selection of selections.data) {
      const list = byCandidate.get(selection.candidateId) ?? [];
      list.push(selection);
      byCandidate.set(selection.candidateId, list);
    }

    const views: ConflictView[] = [];
    for (const [candidateId, claims] of byCandidate) {
      if (contenders(claims).length === 0) continue;

      const candidate = candidates.data.find((c) => c.id === candidateId);
      if (!candidate) continue;

      const held = winner(claims);
      views.push({
        candidate,
        // Earliest first: the screen is an argument about time, so it should
        // read chronologically.
        claims: [...claims]
          .sort((a, b) => a.reservedAt.localeCompare(b.reservedAt))
          .map((selection) => ({
            selection,
            startup: startups.data.find((s) => s.id === selection.startupId) ?? null,
            isWinner: selection.id === held?.id,
          })),
        decidedByOverride: held?.overrideReason !== null && held?.overrideReason !== undefined,
      });
    }

    return ok(views);
  },
});

// ─── Exceptions ──────────────────────────────────────────────────────────────

export interface ExceptionView {
  readonly request: ExceptionRequest;
  readonly startup: Startup | null;
  /** The deadline they missed, so the ask can be judged against it. */
  readonly originalDeadline: string;
  readonly hoursAtStake: number;
}

export const listExceptions = defineUseCase({
  name: 'qstp.listExceptions',
  input: z.object({}),
  authorize: { capability: 'exception:read_all' as const },

  execute: async (ctx) => {
    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return ok<ExceptionView[]>([]);

    const [exceptions, startups, allocations] = await Promise.all([
      ctx.repos.exceptions.listForCycle(cycle.id),
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.allocations.listForCycle(cycle.id),
    ]);
    if (!exceptions.ok) return err(exceptions.error);
    if (!startups.ok) return err(startups.error);
    if (!allocations.ok) return err(allocations.error);

    const views: ExceptionView[] = exceptions.data.map((request) => ({
      request,
      startup: startups.data.find((s) => s.id === request.startupId) ?? null,
      originalDeadline:
        request.kind === 'position_submission'
          ? cycle.deadlines.positionSubmission
          : cycle.deadlines.candidateSelection,
      // What refusing would cost them — the number that makes this a decision
      // rather than a formality.
      hoursAtStake:
        allocations.data.find((a) => a.startupId === request.startupId)?.weeklyHours ?? 0,
    }));

    // Pending first; they are the only ones that need anything.
    const rank = (status: ExceptionRequest['status']) => (status === 'pending' ? 0 : 1);
    return ok(views.sort((a, b) => rank(a.request.status) - rank(b.request.status)));
  },
});

// ─── Redistribution ──────────────────────────────────────────────────────────

export interface ReclaimSource {
  readonly startup: Startup;
  readonly hours: number;
  readonly reason: string;
}

export interface ReclaimCandidate {
  readonly startup: Startup;
  readonly currentHours: number;
  readonly score: number | null;
  readonly recommended: HourTier | null;
}

export interface RedistributionPlan {
  readonly reclaimable: readonly ReclaimSource[];
  readonly totalReclaimable: number;
  /** Startups eligible to receive: zero-hour or below their recommended tier. */
  readonly eligible: readonly ReclaimCandidate[];
  readonly deadlinePassed: boolean;
}

export const getRedistributionPlan = defineUseCase({
  name: 'qstp.redistributionPlan',
  input: z.object({}),
  // Viewing the plan needs only read access; running it is manager-only.
  authorize: { capability: 'allocation:read_all' as const },

  execute: async (ctx) => {
    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [startups, allocations, selections, exceptions] = await Promise.all([
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.allocations.listForCycle(cycle.id),
      ctx.repos.selections.listForCycle(cycle.id),
      ctx.repos.exceptions.listForCycle(cycle.id),
    ]);
    if (!startups.ok) return err(startups.error);
    if (!allocations.ok) return err(allocations.error);
    if (!selections.ok) return err(selections.error);
    if (!exceptions.ok) return err(exceptions.error);

    const now = ctx.clock.now().toISOString();
    const reclaimable: ReclaimSource[] = [];
    const eligible: ReclaimCandidate[] = [];

    for (const allocation of allocations.data.filter((a) => a.status === 'confirmed')) {
      const startup = startups.data.find((s) => s.id === allocation.startupId);
      if (!startup) continue;

      const theirs = exceptions.data.filter((e) => e.startupId === allocation.startupId);
      const deadline = effectiveDeadline(
        cycle.deadlines.candidateSelection,
        theirs,
        'candidate_selection',
      );
      const used = selections.data.filter(
        (s) => s.startupId === allocation.startupId && s.status !== 'released',
      ).length;

      if (allocation.weeklyHours === 0) {
        eligible.push({
          startup,
          currentHours: 0,
          score: allocation.score,
          recommended: allocation.score === null ? null : recommendedTier(allocation.score),
        });
        continue;
      }

      // An approved exception protects the allocation. This single check is the
      // difference between a fair reclaim and taking hours from a startup that
      // had permission to be late.
      if (now > deadline && used === 0 && !isProtected(theirs, 'candidate_selection')) {
        reclaimable.push({
          startup,
          hours: allocation.weeklyHours,
          reason: 'Selection deadline passed with no candidates selected and no approved exception.',
        });
      }
    }

    return ok<RedistributionPlan>({
      reclaimable,
      totalReclaimable: reclaimable.reduce((total, r) => total + r.hours, 0),
      eligible: eligible.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
      deadlinePassed: now > cycle.deadlines.candidateSelection,
    });
  },
});

export type { StartupId };
