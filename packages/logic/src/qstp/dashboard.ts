import { z } from 'zod';
import { err, ok } from '@relayflow/core';
import {
  blocksOthers,
  budgetView,
  effectiveDeadline,
  hasConflict,
  isProtected,
  reservesHours,
  stageIndex,
  totalWeeklyHours,
  type BudgetView,
  type Cycle,
  type CycleStage,
  type Startup,
  type StartupId,
  type CandidateId,
} from '@relayflow/entities';
import { defineUseCase } from '../use-case';

/**
 * The QSTP dashboard.
 *
 * The brief asks for an operational dashboard rather than a decorative one, so
 * every number here is derived from current state — there is no counter column
 * to drift out of sync, and no cron job that can quietly stop running.
 *
 * It is one use-case rather than a dozen widget endpoints because the items are
 * not independent: whether a startup's missed deadline is a problem depends on
 * its exceptions, and whether its hours are reclaimable depends on both. Pulling
 * that together in one place is what stops two panels contradicting each other.
 */

export interface AttentionItem {
  readonly kind:
    | 'positions_not_submitted'
    | 'selection_deadline_missed'
    | 'candidate_conflict'
    | 'exception_pending'
    | 'documents_awaiting_verification'
    | 'hours_reclaimable';
  readonly startupId: StartupId | null;
  readonly startupName: string | null;
  readonly candidateId: CandidateId | null;
  /** One line, already written for a human. The UI should not re-phrase it. */
  readonly summary: string;
  /** Ordering hint: higher is more urgent. Drives the list, not the styling. */
  readonly severity: number;
}

/**
 * A phase of the cycle, as the dashboard timeline shows it.
 *
 * Derived from the cycle's own stage and deadlines rather than stored, so it
 * cannot disagree with the rest of the screen. The four milestones are coarser
 * than CYCLE_STAGES on purpose: `redistribution` is not a phase a programme
 * manager plans around, it is what happens while selection is being closed out,
 * so it reads as part of Selections.
 */
export interface CycleMilestone {
  readonly key: 'planning' | 'positions' | 'selection' | 'onboarding';
  readonly label: string;
  /** ISO instants. Formatting is the caller's business. */
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: 'complete' | 'active' | 'upcoming';
}

/** Which cycle stages each milestone covers. Order is the timeline's order. */
const MILESTONE_STAGES: readonly {
  key: CycleMilestone['key'];
  label: string;
  stages: readonly CycleStage[];
}[] = [
  { key: 'planning', label: 'Planning', stages: ['draft', 'allocation'] },
  { key: 'positions', label: 'Position Posting', stages: ['positions'] },
  { key: 'selection', label: 'Selections', stages: ['selection'] },
  { key: 'onboarding', label: 'Completion', stages: ['completion', 'closed'] },
];

function milestonesFor(cycle: Cycle): CycleMilestone[] {
  // Each milestone runs from where the previous one ended to its own deadline,
  // so the four spans tile the cycle with no gaps to explain.
  const bounds: Record<CycleMilestone['key'], [string, string]> = {
    planning: [cycle.createdAt, cycle.startsOn],
    positions: [cycle.startsOn, cycle.deadlines.positionSubmission],
    selection: [cycle.deadlines.positionSubmission, cycle.deadlines.candidateSelection],
    onboarding: [cycle.deadlines.candidateSelection, cycle.deadlines.documentSubmission],
  };

  const current = stageIndex(cycle.stage);

  return MILESTONE_STAGES.map(({ key, label, stages }) => {
    const first = stageIndex(stages[0]!);
    const last = stageIndex(stages[stages.length - 1]!);
    const [startsAt, endsAt] = bounds[key];

    return {
      key,
      label,
      startsAt,
      endsAt,
      status: current > last ? 'complete' : current >= first ? 'active' : 'upcoming',
    };
  });
}

export interface QstpDashboard {
  readonly cycleName: string;
  readonly stage: string;
  readonly budget: BudgetView;
  readonly startupCount: number;
  readonly pendingSelections: number;
  readonly candidatesOnboarding: number;
  /** Reclaimable weekly hours, if redistribution ran right now. */
  readonly reclaimableHours: number;
  readonly attention: readonly AttentionItem[];
  /** The cycle's four phases, in order. Empty when there is no active cycle. */
  readonly milestones: readonly CycleMilestone[];
}

export const getQstpDashboard = defineUseCase({
  name: 'qstp.dashboard',
  input: z.object({}),

  // Anyone who can read the cycle can see the dashboard; the read-only auditor
  // included. What differs by role is which actions the screen offers, not
  // whether the numbers are visible.
  authorize: { capability: 'cycle:read' as const },

  execute: async (ctx) => {
    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;

    if (!cycle) {
      return ok<QstpDashboard>({
        cycleName: 'No active cycle',
        stage: 'draft',
        budget: budgetView({ funded: 0, allocated: 0, committed: 0 }),
        startupCount: 0,
        pendingSelections: 0,
        candidatesOnboarding: 0,
        reclaimableHours: 0,
        attention: [],
        milestones: [],
      });
    }

    const [startups, allocations, positions, selections, exceptions, documents] = await Promise.all([
      ctx.repos.startups.listForCycle(cycle.id),
      ctx.repos.allocations.listForCycle(cycle.id),
      ctx.repos.positions.listForCycle(cycle.id),
      ctx.repos.selections.listForCycle(cycle.id),
      ctx.repos.exceptions.listForCycle(cycle.id),
      ctx.repos.documents.listAwaitingVerification(cycle.id),
    ]);

    // Any failed read makes the whole dashboard untrustworthy — showing five of
    // six numbers with no indication which is missing is worse than an error.
    if (!startups.ok) return err(startups.error);
    if (!allocations.ok) return err(allocations.error);
    if (!positions.ok) return err(positions.error);
    if (!selections.ok) return err(selections.error);
    if (!exceptions.ok) return err(exceptions.error);
    if (!documents.ok) return err(documents.error);

    const nameOf = (id: StartupId): string =>
      startups.data.find((s: Startup) => s.id === id)?.name ?? 'Unknown startup';

    const confirmed = allocations.data.filter((a) => a.status === 'confirmed');
    const allocated = confirmed.reduce((total, a) => total + a.weeklyHours, 0);

    // Committed = hours on positions that actually have someone reserved.
    //
    // `blocksOthers` rather than a status list written out here: an offer is
    // interest, not a commitment, and three startups offering the same person
    // must not each count those hours or the budget triple-counts. Asking the
    // invariant is what keeps this true as statuses are added.
    const heldPositionIds = new Set(
      selections.data.filter((s) => blocksOthers(s.status)).map((s) => s.positionId),
    );
    const committed = positions.data
      .filter((p) => reservesHours(p.status) && heldPositionIds.has(p.id))
      .reduce((total, p) => total + totalWeeklyHours(p), 0);

    const budget = budgetView({
      funded: cycle.fundedWeeklyHours,
      allocated,
      committed,
    });

    const now = ctx.clock.now().toISOString();
    const attention: AttentionItem[] = [];
    let reclaimableHours = 0;

    for (const allocation of confirmed) {
      if (allocation.weeklyHours === 0) continue;

      const startupName = nameOf(allocation.startupId);
      const theirs = exceptions.data.filter((e) => e.startupId === allocation.startupId);
      const theirPositions = positions.data.filter((p) => p.startupId === allocation.startupId);

      // Stage 2: allocated hours but nothing submitted.
      if (theirPositions.length === 0) {
        const deadline = effectiveDeadline(
          cycle.deadlines.positionSubmission,
          theirs,
          'position_submission',
        );
        attention.push({
          kind: 'positions_not_submitted',
          startupId: allocation.startupId,
          startupName,
          candidateId: null,
          summary:
            now > deadline
              ? `${startupName} has not submitted any positions and the deadline has passed.`
              : `${startupName} has not submitted any positions yet.`,
          severity: now > deadline ? 80 : 40,
        });
      }

      // Stage 3/4: deadline passed with nothing selected.
      const selectionDeadline = effectiveDeadline(
        cycle.deadlines.candidateSelection,
        theirs,
        'candidate_selection',
      );
      const theirSelections = selections.data.filter(
        (s) => s.startupId === allocation.startupId && s.status !== 'released',
      );
      const missedSelection = now > selectionDeadline && theirSelections.length === 0;
      const protectedByException = isProtected(theirs, 'candidate_selection');

      if (missedSelection && !protectedByException) {
        attention.push({
          kind: 'selection_deadline_missed',
          startupId: allocation.startupId,
          startupName,
          candidateId: null,
          summary: `${startupName} missed the selection deadline with no approved exception.`,
          severity: 90,
        });

        // Their hours are the ones redistribution reclaims. An approved
        // exception would have protected them — that check is the whole
        // difference between a fair reclaim and an unfair one.
        reclaimableHours += allocation.weeklyHours;
        attention.push({
          kind: 'hours_reclaimable',
          startupId: allocation.startupId,
          startupName,
          candidateId: null,
          summary: `${allocation.weeklyHours} weekly hours from ${startupName} can be redistributed.`,
          severity: 70,
        });
      }
    }

    // Candidate conflicts: two startups holding the same person.
    const byCandidate = new Map<CandidateId, typeof selections.data>();
    for (const selection of selections.data) {
      const list = byCandidate.get(selection.candidateId) ?? [];
      list.push(selection);
      byCandidate.set(selection.candidateId, list);
    }
    for (const [candidateId, claims] of byCandidate) {
      if (!hasConflict(claims)) continue;
      const names = claims.map((c) => nameOf(c.startupId));
      attention.push({
        kind: 'candidate_conflict',
        startupId: null,
        startupName: null,
        candidateId,
        summary: `Two startups have claimed the same candidate: ${names.join(' and ')}.`,
        severity: 95,
      });
    }

    for (const exception of exceptions.data.filter((e) => e.status === 'pending')) {
      attention.push({
        kind: 'exception_pending',
        startupId: exception.startupId,
        startupName: nameOf(exception.startupId),
        candidateId: null,
        summary: `${nameOf(exception.startupId)} has requested a deadline extension.`,
        severity: 85,
      });
    }

    if (documents.data.length > 0) {
      attention.push({
        kind: 'documents_awaiting_verification',
        startupId: null,
        startupName: null,
        candidateId: null,
        summary: `${documents.data.length} document${documents.data.length === 1 ? '' : 's'} awaiting verification.`,
        severity: 60,
      });
    }

    return ok<QstpDashboard>({
      cycleName: cycle.name,
      stage: cycle.stage,
      budget,
      startupCount: startups.data.length,
      pendingSelections: selections.data.filter((s) => s.status === 'reserved' || s.status === 'accepted').length,
      candidatesOnboarding: new Set(
        selections.data.filter((s) => s.status === 'confirmed').map((s) => s.candidateId),
      ).size,
      reclaimableHours,
      attention: attention.sort((a, b) => b.severity - a.severity),
      milestones: milestonesFor(cycle),
    });
  },
});
