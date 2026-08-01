import { conflict, err, notFound, ok, validation, type Result } from '@relayflow/core';
import { ANY_STARTUP, authorize } from '@relayflow/access';
import {
  blocksOthers,
  candidateColumnFor,
  checkCandidateMove,
  checkPositionMove,
  checkStartupMove,
  effectiveDeadline,
  isSelectable,
  moveCandidateCardInput,
  movePositionCardInput,
  moveStartupCardInput,
  type CandidateId,
  type CandidateMoveFacts,
  type PositionId,
} from '@relayflow/entities';
import type { UseCaseContext } from '../context';
import { defineUseCase, requireActor } from '../use-case';
import { getPositionTracker, listStartupSummaries, reviewPosition, sharePool } from '../qstp/operations';
import { selectCandidate } from '../selection/select-candidate';

/**
 * What a drag actually does.
 *
 * The board is not a second way to edit the database. Every move here either
 * runs the same use-case the equivalent button would, or it is refused with the
 * reason — there is no third path where a card is filed somewhere the data does
 * not support. That matters most in the two places the brief calls out: a pool
 * cannot be sent to a startup with no positions, and a candidate cannot be
 * selected if somebody already holds them.
 *
 * Both use-cases rebuild the facts from storage rather than trusting the ones
 * the browser sent. The client copy exists so an impossible drag snaps back
 * instantly; this is the copy that decides.
 */

// ─── The QSTP startup-cycle board ────────────────────────────────────────────

/**
 * Move a startup card between cycle stages.
 *
 * There is exactly one stage this board can advance by itself — sending the
 * candidate pool — and that is not a limitation to work around, it is the
 * design. Every other column is derived from an event that belongs to someone
 * else: the startup submits its own positions, reserves its own candidates, and
 * the paperwork moves when documents are verified. A drag onto those columns
 * returns the reason and the screen where the real decision is made, which is
 * more useful than a card that moves and changes nothing underneath.
 */
export const moveStartupCard = defineUseCase({
  name: 'board.moveStartupCard',
  input: moveStartupCardInput,

  // Sharing a pool is the only write this can perform, so it is the capability
  // required to attempt any move. A viewer cannot drag.
  authorize: { capability: 'candidate:share_pool' as const },

  execute: async (ctx, input) => {
    const summaries = await listStartupSummaries(ctx, {});
    if (!summaries.ok) return summaries;

    const summary = summaries.data.find((row) => row.startup.id === input.startupId);
    if (!summary) return err(notFound('That startup is not in this cycle.'));

    // The board may have been open while somebody else changed something. Say
    // so plainly rather than applying a move to a card that has since moved.
    if (summary.stage !== input.from) {
      return err(
        conflict(
          `${summary.startup.name} has moved since this board was loaded — it is now in ` +
            `“${summary.stage.replace(/_/g, ' ')}”. Refresh and try again.`,
        ),
      );
    }

    const verdict = checkStartupMove(input.from, input.to, summary.facts);
    if (!verdict.allowed) {
      return err(
        validation(verdict.reason ?? 'That move is not allowed.', {
          context: verdict.handoff ? { handoff: verdict.handoff } : {},
        }),
      );
    }

    if (input.to !== 'pool_sent') {
      // Reachable only if the underlying state already satisfies the target,
      // in which case the derivation has already put the card there.
      return ok({ shared: 0, positions: 0 });
    }

    return sendPools(ctx, input.startupId);
  },
});

/**
 * Build and share a pool for each of a startup's approved positions.
 *
 * Matching is skill overlap, capped per position. It is a stand-in for whatever
 * ranking the programme eventually wants, and it is deliberately conservative:
 * a candidate who is unavailable or already claimed is never put in front of a
 * startup, because the whole complaint the product exists to fix is startups
 * spending interviews on people they cannot hire.
 */
async function sendPools(
  ctx: UseCaseContext,
  startupId: string,
): Promise<Result<{ shared: number; positions: number }>> {
  const cycleResult = await ctx.repos.cycles.findActive();
  if (!cycleResult.ok) return cycleResult;
  const cycle = cycleResult.data;
  if (!cycle) return err(notFound('There is no active cycle.'));

  const [positions, candidates, selections, pool] = await Promise.all([
    ctx.repos.positions.listForCycle(cycle.id),
    ctx.repos.candidates.listForCycle(cycle.id),
    ctx.repos.selections.listForCycle(cycle.id),
    ctx.repos.candidates.listPoolForCycle(cycle.id),
  ]);
  if (!positions.ok) return err(positions.error);
  if (!candidates.ok) return err(candidates.error);
  if (!selections.ok) return err(selections.error);
  if (!pool.ok) return err(pool.error);

  const claimed = new Set(
    selections.data.filter((s) => blocksOthers(s.status)).map((s) => s.candidateId),
  );

  const open = positions.data.filter(
    (position) =>
      position.startupId === startupId &&
      (position.status === 'approved' || position.status === 'filled'),
  );

  let shared = 0;
  let touched = 0;

  for (const position of open) {
    const already = new Set(
      pool.data
        .filter((row) => row.entry.positionId === position.id)
        .map((row) => row.candidate.id),
    );

    const wanted = position.requiredSkills.map((skill) => skill.toLowerCase());

    const matches = candidates.data
      .filter(
        (candidate) =>
          !already.has(candidate.id) &&
          !claimed.has(candidate.id) &&
          isSelectable(candidate.availability),
      )
      .map((candidate) => ({
        candidate,
        overlap: candidate.skills.filter((skill) => wanted.includes(skill.toLowerCase())).length,
      }))
      .filter((row) => row.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      // Three per seat. A pool of forty is the same problem as no pool at all.
      .slice(0, position.internCount * 3);

    if (matches.length === 0) continue;

    const result = await sharePool(ctx, {
      positionId: position.id,
      candidateIds: matches.map((row) => row.candidate.id),
    });
    if (!result.ok) return result;

    shared += result.data.added;
    touched += 1;
  }

  if (shared === 0) {
    return err(
      validation(
        'No unclaimed candidate matches the skills on these positions. ' +
          'Import more candidates, or share a pool by hand from the Candidates screen.',
        { context: { handoff: { label: 'Open candidates', href: '/candidates' } } },
      ),
    );
  }

  ctx.logger.info('pool sent from board', { startupId, shared, positions: touched });

  return ok({ shared, positions: touched });
}

// ─── The startup candidate board ─────────────────────────────────────────────

/**
 * Move one candidate along a startup's pipeline.
 *
 * Most columns here are the startup's own bookkeeping and a move is a status
 * write. `Selected` is not: it reserves a person across the whole programme, so
 * that drag runs the real `selectCandidate` use-case — the same one the Select
 * button calls, with the same atomic reservation and the same refusal if
 * another startup got there first. The board never gets a shortcut around it.
 */
export const moveCandidateCard = defineUseCase({
  name: 'board.moveCandidateCard',
  input: moveCandidateCardInput,

  // Whose pool it is cannot be known until the entry is loaded; the real,
  // startup-scoped check happens below.
  authorize: { capability: 'candidate:read_pool' as const, startupId: ANY_STARTUP },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const entryResult = await ctx.repos.candidates.findPoolEntry(
      input.poolEntryId as unknown as Parameters<typeof ctx.repos.candidates.findPoolEntry>[0],
    );
    if (!entryResult.ok) return entryResult;
    const entry = entryResult.data;
    if (!entry) return err(notFound('That candidate is not in this pool.'));

    const positionResult = await ctx.repos.positions.findById(entry.positionId);
    if (!positionResult.ok) return positionResult;
    const position = positionResult.data;
    if (!position) return err(notFound('Position not found.'));

    // Now that we know whose pool this is: may this actor touch it?
    const scoped = authorize(ctx.actor, {
      capability: 'candidate:read_pool',
      startupId: position.startupId,
    });
    if (!scoped.ok) return scoped;

    // Selecting commits the startup to a hire. A supervisor may run interviews
    // and move cards through review, but not make that commitment.
    if (input.to === 'selected') {
      const canSelect = authorize(ctx.actor, {
        capability: 'selection:create',
        startupId: position.startupId,
      });
      if (!canSelect.ok) return canSelect;
    }

    const facts = await candidateFacts(ctx, entry.candidateId, position.id, position.startupId);
    if (!facts.ok) return facts;

    const verdict = checkCandidateMove(input.to, facts.data);
    if (!verdict.allowed) {
      return err(validation(verdict.reason ?? 'That move is not allowed.'));
    }

    // The reservation, and everything it guards, stays in one place.
    if (input.to === 'selected') {
      const reserved = await selectCandidate(ctx, {
        positionId: position.id,
        candidateId: entry.candidateId,
      });
      if (!reserved.ok) return reserved;
    }

    const moved = await ctx.repos.candidates.updatePoolEntry({
      poolEntryId: entry.id,
      status: input.to,
      reviewedAt: ctx.clock.now().toISOString(),
    });
    if (!moved.ok) return moved;

    ctx.logger.info('candidate card moved', {
      positionId: position.id,
      from: candidateColumnFor(entry.status),
      to: input.to,
    });

    return ok(moved.data);
  },
});

/** The facts `checkCandidateMove` needs, gathered from storage. */
async function candidateFacts(
  ctx: UseCaseContext,
  candidateId: CandidateId,
  positionId: PositionId,
  startupId: string,
): Promise<Result<CandidateMoveFacts>> {
  const [candidate, claims, interviews, cycleResult] = await Promise.all([
    ctx.repos.candidates.findById(candidateId),
    ctx.repos.selections.listForCandidate(candidateId),
    ctx.repos.interviews.listForCandidate(candidateId),
    ctx.repos.cycles.findActive(),
  ]);
  if (!candidate.ok) return err(candidate.error);
  if (!claims.ok) return err(claims.error);
  if (!interviews.ok) return err(interviews.error);
  if (!cycleResult.ok) return err(cycleResult.error);

  const cycle = cycleResult.data;
  if (!cycle) return err(notFound('There is no active cycle.'));
  if (!candidate.data) return err(notFound('Candidate not found.'));

  const exceptions = await ctx.repos.exceptions.listForStartup(
    cycle.id,
    startupId as Parameters<typeof ctx.repos.exceptions.listForStartup>[1],
  );
  if (!exceptions.ok) return err(exceptions.error);

  const pool = await ctx.repos.candidates.listPool(positionId);
  if (!pool.ok) return err(pool.error);
  const entry = pool.data.find((row) => row.candidate.id === candidateId);
  if (!entry) return err(notFound('That candidate is not in this pool.'));

  const active = claims.data.filter((claim) => blocksOthers(claim.status));
  const deadline = effectiveDeadline(
    cycle.deadlines.candidateSelection,
    exceptions.data,
    'candidate_selection',
  );

  return ok<CandidateMoveFacts>({
    currentStatus: entry.entry.status,
    availability: candidate.data.availability,
    heldByOther: active.some((claim) => claim.startupId !== startupId),
    heldByUs: active.some((claim) => claim.startupId === startupId),
    hasInterview: interviews.data.some((interview) => interview.positionId === positionId),
    deadlinePassed: ctx.clock.now().toISOString() > deadline,
    hasApprovedException: exceptions.data.some(
      (e) => e.kind === 'candidate_selection' && e.status === 'approved',
    ),
  });
}

// ─── The positions review board ──────────────────────────────────────────────

/**
 * Move a role between review columns.
 *
 * This is the one board where a drag is the primary action rather than the
 * exception, because `submitted` and `approved` are statuses QSTP writes rather
 * than facts it observes. So the move runs `reviewPosition` — the same use-case
 * the Approve button calls — and inherits its rules rather than restating them.
 *
 * The facts are rebuilt here from storage. The browser's copy exists so an
 * illegal drag snaps back without a round trip; it is never what decides.
 */
export const movePositionCard = defineUseCase({
  name: 'board.movePositionCard',
  input: movePositionCardInput,
  authorize: { capability: 'position:review' as const },

  execute: async (ctx, input) => {
    const tracker = await getPositionTracker(ctx, {});
    if (!tracker.ok) return tracker;

    const row = tracker.data.rows.find((candidate) => candidate.position.id === input.positionId);
    if (!row) return err(notFound('Position not found.'));

    const verdict = checkPositionMove(input.to, row.facts);
    if (!verdict.allowed) {
      return err(conflict(verdict.reason ?? 'That move is not allowed.'));
    }

    // `filled` and `submitted` are refused above, so only the two review
    // decisions reach here.
    const decision = input.to === 'approved' ? 'approved' : 'changes_requested';

    if (verdict.requiresNote && !input.note?.trim()) {
      return err(validation('Say what needs changing — the startup sees only this note.'));
    }

    return reviewPosition(ctx, {
      positionId: input.positionId,
      decision,
      note: input.note?.trim() ? input.note.trim() : null,
    });
  },
});
