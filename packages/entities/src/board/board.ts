import { z } from 'zod';
import { isSelectable, type AvailabilityStatus, type PoolEntryStatus } from '../candidate/candidate';
import type { PositionStatus } from '../position/position';

/**
 * The two Kanban boards, as domain rules rather than as a UI feature.
 *
 * A board that lets you drag a card anywhere is a whiteboard: it records what
 * someone wishes were true. The value of putting this cycle on a board is the
 * opposite — that a column is a claim about real state, and moving into it is
 * only possible when that state actually holds. So the columns, the derivation
 * of which column a thing is in, and the legality of every move live here,
 * beside the entities they read, and both the screen and the use-case call the
 * same functions. The screen calls them to refuse a drag instantly; the
 * use-case calls them again, on facts it loaded itself, because the screen's
 * copy is a convenience and never the authority.
 *
 * Deliberately absent: scoring, budget arithmetic, document contents, exception
 * detail. Those are tables and forms. A board is for "where is everything, and
 * what is stuck" — asking it to do more is how you end up with Trello.
 */

// ─── Board 1: the QSTP startup cycle ─────────────────────────────────────────

/**
 * Where one startup has got to this cycle.
 *
 * These are derived, never stored. A startup is in "Onboarding" because it has
 * a confirmed intern, not because somebody dragged it there — which is what
 * makes the board trustworthy enough to run a stand-up from. It also means the
 * board cannot lie after a change made on another screen.
 */
export const STARTUP_CYCLE_STAGES = [
  'not_evaluated', // no allocation decision yet
  'allocated', // hours assigned, nothing submitted
  'positions_pending', // roles submitted, pool not yet handed over
  'pool_sent', // candidates shared, startup has not looked
  'reviewing_candidates',
  'candidate_selected', // an active reservation exists
  'onboarding', // reservation confirmed; paperwork in flight
  'completed',
] as const;

export const startupCycleStage = z.enum(STARTUP_CYCLE_STAGES);
export type StartupCycleStage = (typeof STARTUP_CYCLE_STAGES)[number];

export const STARTUP_CYCLE_STAGE_LABELS: Readonly<Record<StartupCycleStage, string>> = {
  not_evaluated: 'Not evaluated',
  allocated: 'Allocated',
  positions_pending: 'Positions pending',
  pool_sent: 'Candidate pool sent',
  reviewing_candidates: 'Reviewing candidates',
  candidate_selected: 'Candidate selected',
  onboarding: 'Onboarding',
  completed: 'Completed',
};

export function startupStageIndex(stage: StartupCycleStage): number {
  return STARTUP_CYCLE_STAGES.indexOf(stage);
}

/**
 * Everything the board needs to know about one startup, flattened.
 *
 * A flat fact sheet rather than the entities themselves, so that the derivation
 * below is a pure function of numbers and booleans — testable without building
 * six object graphs, and small enough to send to the browser so a drag can be
 * refused before it costs a round trip.
 */
export interface StartupCycleFacts {
  /** An allocation decision exists — scored or explicitly zero-rated. */
  readonly evaluated: boolean;
  readonly allocatedHours: number;
  readonly positionsSubmitted: number;
  readonly positionsApproved: number;
  readonly poolSize: number;
  /** Pool entries the startup has actually acted on. */
  readonly poolReviewed: number;
  readonly activeSelections: number;
  readonly confirmedSelections: number;
  readonly documentsTotal: number;
  readonly documentsOutstanding: number;
  readonly documentsAwaitingQstp: number;
  readonly positionsAwaitingReview: number;
  readonly pendingExceptions: number;
  readonly approvedException: boolean;
  /** Past this startup's *effective* selection deadline, exceptions included. */
  readonly overdue: boolean;
}

/**
 * Which column a startup belongs in.
 *
 * Read downward: the furthest thing that has genuinely happened wins. Written
 * this way round rather than as a forward march because state can arrive out of
 * order — a candidate can be confirmed before every position is approved — and
 * the board should show the truest thing about a startup, not the earliest.
 */
export function deriveStartupCycleStage(facts: StartupCycleFacts): StartupCycleStage {
  if (!facts.evaluated) return 'not_evaluated';
  if (facts.confirmedSelections > 0 && facts.documentsTotal > 0 && facts.documentsOutstanding === 0)
    return 'completed';
  if (facts.confirmedSelections > 0) return 'onboarding';
  if (facts.activeSelections > 0) return 'candidate_selected';
  if (facts.poolSize > 0 && facts.poolReviewed > 0) return 'reviewing_candidates';
  if (facts.poolSize > 0) return 'pool_sent';
  if (facts.positionsSubmitted > 0) return 'positions_pending';
  return 'allocated';
}

// ─── Flags ───────────────────────────────────────────────────────────────────

/**
 * The states that are *not* columns.
 *
 * Overdue is not a stage — a startup is overdue *and* reviewing candidates, and
 * a column for it would either duplicate the card or hide the thing you
 * actually want to know. These ride along as badges so one glance answers both
 * "how far are they?" and "what is wrong?".
 */
export const BOARD_FLAGS = [
  'overdue',
  'exception_requested',
  'waitlisted',
  'hours_at_risk',
  'missing_documents',
  'needs_qstp_action',
] as const;

export const boardFlag = z.enum(BOARD_FLAGS);
export type BoardFlag = (typeof BOARD_FLAGS)[number];

export const BOARD_FLAG_LABELS: Readonly<Record<BoardFlag, string>> = {
  overdue: 'Overdue',
  exception_requested: 'Exception requested',
  waitlisted: 'Waitlisted',
  hours_at_risk: 'Hours at risk',
  missing_documents: 'Missing documents',
  needs_qstp_action: 'Needs QSTP action',
};

export function startupCycleFlags(facts: StartupCycleFacts): BoardFlag[] {
  const flags: BoardFlag[] = [];
  const idle = facts.activeSelections === 0 && facts.confirmedSelections === 0;

  if (facts.overdue && idle) flags.push('overdue');
  if (facts.pendingExceptions > 0) flags.push('exception_requested');
  // Evaluated and given nothing: they are waiting on redistribution, not late.
  if (facts.evaluated && facts.allocatedHours === 0) flags.push('waitlisted');
  // The one flag that costs money: past the deadline, nothing selected, and no
  // approved exception standing between them and a reclaim.
  if (facts.overdue && idle && !facts.approvedException && facts.allocatedHours > 0)
    flags.push('hours_at_risk');
  if (facts.confirmedSelections > 0 && facts.documentsOutstanding > 0)
    flags.push('missing_documents');
  if (
    facts.pendingExceptions > 0 ||
    facts.documentsAwaitingQstp > 0 ||
    facts.positionsAwaitingReview > 0
  )
    flags.push('needs_qstp_action');

  return flags;
}

// ─── Moving a startup card ───────────────────────────────────────────────────

/**
 * The answer to "may this card go there?", written for the person who dragged it.
 *
 * `handoff` exists because most of these stages are not QSTP's to advance — a
 * startup submits its own roles and picks its own interns. Refusing with
 * "not allowed" would be true and useless; refusing with the screen where the
 * thing actually happens is the difference between a board and a barrier.
 */
export interface StartupMoveVerdict {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly handoff: { readonly label: string; readonly href: string } | null;
}

const ALLOW: StartupMoveVerdict = { allowed: true, reason: null, handoff: null };

const refuse = (reason: string, handoff?: { label: string; href: string }): StartupMoveVerdict => ({
  allowed: false,
  reason,
  handoff: handoff ?? null,
});

/**
 * Whether a startup card may move from one column to another.
 *
 * Three layers of rule, in order. First shape: no backwards moves and no
 * skipping, because a stage you did not pass through did not happen. Then the
 * deadline gate, which is the programme's actual policy — a startup cannot keep
 * advancing past its selection deadline without an approved exception. Then the
 * per-column precondition, which is the specific thing the brief asks for: you
 * cannot send a candidate pool to a startup that has submitted no positions.
 */
export function checkStartupMove(
  from: StartupCycleStage,
  to: StartupCycleStage,
  facts: StartupCycleFacts,
): StartupMoveVerdict {
  if (from === to) return refuse('That card is already in this column.');

  const step = startupStageIndex(to) - startupStageIndex(from);

  if (step < 0) {
    return refuse(
      'Stages are derived from what has actually happened, so a card cannot be dragged backwards. ' +
        'Undo the underlying decision instead.',
    );
  }
  if (step > 1) {
    return refuse(
      `Move one stage at a time. ${STARTUP_CYCLE_STAGE_LABELS[from]} comes before ` +
        `${STARTUP_CYCLE_STAGE_LABELS[to]}, and the stages in between are not optional.`,
    );
  }

  // The deadline gate, and it applies to exactly one column.
  //
  // `candidate_selected` is the moment a startup carries on participating: it
  // has committed to an intern. Doing that past the deadline with no approved
  // exception is the thing the programme does not allow, and the fix is an
  // exception rather than a shrug.
  //
  // Deliberately *not* applied to `pool_sent`. Sending candidates to a startup
  // that is late is how QSTP unblocks it — gating that would punish the startup
  // for a delay QSTP is in the middle of fixing.
  if (to === 'candidate_selected' && facts.overdue && !facts.approvedException) {
    return refuse(
      'The selection deadline has passed and this startup has no approved exception, ' +
        'so a selection cannot be recorded for it this cycle.',
      { label: 'Review exceptions', href: '/exceptions' },
    );
  }

  switch (to) {
    case 'not_evaluated':
      return refuse('A startup cannot be un-evaluated.');

    case 'allocated':
      return facts.allocatedHours > 0
        ? ALLOW
        : refuse('This startup has no hours yet. Allocation is a scored decision, not a drag.', {
            label: 'Open allocation',
            href: '/allocation',
          });

    case 'positions_pending':
      if (facts.allocatedHours === 0) {
        return refuse('A startup on zero hours cannot be asked for positions.', {
          label: 'Open redistribution',
          href: '/redistribution',
        });
      }
      return refuse('Positions are submitted by the startup itself, from its own portal.', {
        label: 'Review positions',
        href: '/positions',
      });

    // The one move this board performs itself, and the rule the brief names:
    // there is nothing to build a pool against until positions exist.
    case 'pool_sent':
      if (facts.positionsApproved === 0) {
        return refuse(
          facts.positionsSubmitted === 0
            ? 'This startup has not submitted any positions, so there is nothing to share a pool against.'
            : 'None of this startup’s positions are approved yet. Approve one first.',
          { label: 'Review positions', href: '/positions' },
        );
      }
      return ALLOW;

    case 'reviewing_candidates':
      if (facts.poolSize === 0) {
        return refuse('No pool has been shared with this startup yet.');
      }
      return refuse('Reviewing is the startup’s own work — this moves when they open the pool.');

    case 'candidate_selected':
      if (facts.activeSelections === 0) {
        return refuse(
          'No candidate is reserved for this startup. Selection is first-come-first-served and ' +
            'belongs to the startup, not to QSTP.',
          { label: 'Open selection', href: '/selection' },
        );
      }
      return ALLOW;

    case 'onboarding':
      if (facts.confirmedSelections === 0) {
        return refuse('This startup’s reservation is not confirmed yet, so onboarding cannot start.');
      }
      return ALLOW;

    case 'completed':
      if (facts.documentsTotal === 0) {
        return refuse('No onboarding documents have been requested yet.', {
          label: 'Open documents',
          href: '/documents',
        });
      }
      if (facts.documentsOutstanding > 0) {
        return refuse(
          `${facts.documentsOutstanding} document${facts.documentsOutstanding === 1 ? ' is' : 's are'} ` +
            'still unverified. A cycle is not complete until the paperwork is.',
          { label: 'Open documents', href: '/documents' },
        );
      }
      return ALLOW;
  }
}

// ─── Board 2: a startup's candidates, for one position ───────────────────────

/**
 * The candidate columns are pool-entry statuses, not a parallel vocabulary.
 *
 * Reusing the entity's own enum is what keeps the board and the rest of the
 * product from disagreeing about what "interviewed" means. `withdrawn` and
 * `lost` have no column of their own — they are outcomes, not stages — so their
 * cards sit in the last column carrying a badge that says which happened.
 */
export const CANDIDATE_BOARD_COLUMNS = [
  'pending',
  'shortlisted',
  'interview_requested',
  'interviewed',
  'interested',
  'selected',
  'rejected',
] as const satisfies readonly PoolEntryStatus[];

export type CandidateBoardColumn = (typeof CANDIDATE_BOARD_COLUMNS)[number];

export const CANDIDATE_BOARD_LABELS: Readonly<Record<CandidateBoardColumn, string>> = {
  pending: 'New',
  shortlisted: 'Reviewing',
  interview_requested: 'Interview requested',
  interviewed: 'Interviewed',
  interested: 'Interested',
  selected: 'Selected',
  rejected: 'Rejected',
};

export const candidateBoardColumn = z.enum(CANDIDATE_BOARD_COLUMNS);

/** Which column a pool entry renders in, including the two that have none. */
export function candidateColumnFor(status: PoolEntryStatus): CandidateBoardColumn {
  return status === 'withdrawn' || status === 'lost' ? 'rejected' : status;
}

export function candidateColumnIndex(column: CandidateBoardColumn): number {
  return CANDIDATE_BOARD_COLUMNS.indexOf(column);
}

export interface CandidateMoveFacts {
  readonly currentStatus: PoolEntryStatus;
  readonly availability: AvailabilityStatus;
  /** Another startup holds an active claim. The single most expensive surprise. */
  readonly heldByOther: boolean;
  readonly heldByUs: boolean;
  readonly hasInterview: boolean;
  readonly deadlinePassed: boolean;
  readonly hasApprovedException: boolean;
}

/**
 * `confirm` is set when the move is legal but consequential — the board must
 * ask before doing it, rather than treating a slip of the mouse as a hire.
 */
export interface CandidateMoveVerdict {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly confirm: string | null;
}

const AVAILABILITY_REFUSAL: Readonly<Record<AvailabilityStatus, string>> = {
  unconfirmed: '',
  available: '',
  employed: 'This candidate has taken another job and can no longer be selected.',
  not_interested: 'This candidate has withdrawn their interest.',
  temporarily_unavailable: 'This candidate is unavailable for this cycle.',
  placed: 'This candidate has already been placed with another startup.',
};

/**
 * Whether a candidate card may move — the rule the brief is most emphatic about.
 *
 * The `selected` column is the one that matters. Dropping a card there is a
 * reservation: it takes the person off the market for every other startup in
 * the programme. So it is gated on availability, on nobody else holding them,
 * and on the selection deadline — and even when all three pass, it returns
 * `confirm` rather than `allowed` alone, because the board should not hire
 * somebody on a drag the user did not mean to finish.
 */
export function checkCandidateMove(
  to: CandidateBoardColumn,
  facts: CandidateMoveFacts,
): CandidateMoveVerdict {
  const from = candidateColumnFor(facts.currentStatus);
  if (from === to) return { allowed: false, reason: 'Already in this column.', confirm: null };

  const no = (reason: string): CandidateMoveVerdict => ({ allowed: false, reason, confirm: null });

  if (facts.currentStatus === 'lost') {
    return no('Another startup reserved this candidate first, so this card is settled.');
  }
  if (facts.currentStatus === 'withdrawn') {
    return no('This candidate withdrew from the pool.');
  }

  // Reservations are released deliberately, never by dragging a card out of a
  // column. Allowing it here would silently free a person the startup believes
  // it has hired.
  if (facts.heldByUs && facts.currentStatus === 'selected') {
    return no('You have reserved this candidate. Release the reservation before moving them.');
  }

  if (to === 'rejected') {
    return {
      allowed: true,
      reason: null,
      confirm: 'Reject this candidate? They return to the pool for other startups.',
    };
  }

  if (to === 'selected') {
    if (!isSelectable(facts.availability)) {
      return no(AVAILABILITY_REFUSAL[facts.availability] || 'This candidate is not available.');
    }
    if (facts.heldByOther) {
      return no(
        'Another startup reserved this candidate first. Selection is first-come-first-served.',
      );
    }

    const reservation =
      'Selecting reserves this candidate immediately, and no other startup can claim them. ' +
      'If someone selected them in the last few seconds this will be refused.';

    // A missed deadline is not a lock on the button — the programme's answer to
    // it is redistribution, and hours are reclaimed rather than selections
    // refused. Saying so here is the difference between a startup that knows it
    // is exposed and one that finds out when its hours disappear.
    if (facts.deadlinePassed && !facts.hasApprovedException) {
      return {
        allowed: true,
        reason: null,
        confirm:
          'Your selection deadline has passed and you have no approved extension, so these ' +
          `hours can be reclaimed and given to another startup. ${reservation}`,
      };
    }

    return { allowed: true, reason: null, confirm: reservation };
  }

  if (to === 'interviewed' && !facts.hasInterview && from !== 'interview_requested') {
    return no('Request an interview before marking this candidate as interviewed.');
  }

  if (to === 'interested' && candidateColumnIndex(from) < candidateColumnIndex('interviewed')) {
    return no('Interest is recorded after an interview, not before one.');
  }

  return { allowed: true, reason: null, confirm: null };
}

export const moveStartupCardInput = z.object({
  startupId: z.uuid(),
  from: startupCycleStage,
  to: startupCycleStage,
});

export const moveCandidateCardInput = z.object({
  poolEntryId: z.uuid(),
  to: candidateBoardColumn,
});

// ─── Board 3: positions awaiting QSTP review ─────────────────────────────────

/**
 * The review pipeline for one cycle's roles.
 *
 * Unlike the startup board, these columns are a *stored* status rather than a
 * derived one — `submitted` and `approved` are facts QSTP writes. That makes
 * this the one board where dragging is the primary interaction rather than the
 * exception: moving a card between the first three columns is the review.
 *
 * `filled` stays derived and undraggable. A role is filled because somebody
 * confirmed an intern, and a board that let you claim otherwise would be
 * asserting a hire that never happened.
 */
export const POSITION_REVIEW_STAGES = [
  'submitted',
  'changes_requested',
  'approved',
  'filled',
] as const;

export type PositionReviewStage = (typeof POSITION_REVIEW_STAGES)[number];

export const POSITION_REVIEW_LABELS: Readonly<Record<PositionReviewStage, string>> = {
  submitted: 'Awaiting review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  filled: 'Filled',
};

/**
 * Which column a role sits in.
 *
 * `draft` and `withdrawn` have no column: one has not been sent to QSTP yet and
 * the other has been taken back, so neither is in the review queue at all. The
 * caller filters them out rather than the board inventing a home for them.
 */
export function positionReviewStage(status: PositionStatus): PositionReviewStage | null {
  switch (status) {
    case 'submitted':
      return 'submitted';
    case 'changes_requested':
      return 'changes_requested';
    case 'approved':
      return 'approved';
    case 'filled':
      return 'filled';
    default:
      return null;
  }
}

export interface PositionMoveFacts {
  readonly currentStatus: PositionStatus;
  /** Candidates have already been handed to the startup against this role. */
  readonly poolShared: boolean;
  readonly activeSelections: number;
  /** The role asks for more hours than the startup's allocation allows. */
  readonly exceedsAllocation: boolean;
}

export interface PositionMoveVerdict {
  readonly allowed: boolean;
  readonly reason: string | null;
  /** Set when the move is legal but needs a written note — sending one back. */
  readonly requiresNote: boolean;
}

/**
 * Whether a role may move between review columns.
 *
 * The rule that earns its place here is the last one: approving a role that
 * exceeds its startup's allocation would commit hours the programme has not
 * funded. The startup's own form already refuses to submit one, so reaching
 * this branch means the allocation shrank *after* submission — which is exactly
 * the case a human reviewer would miss.
 */
export function checkPositionMove(
  to: PositionReviewStage,
  facts: PositionMoveFacts,
): PositionMoveVerdict {
  const from = positionReviewStage(facts.currentStatus);

  const no = (reason: string): PositionMoveVerdict => ({
    allowed: false,
    reason,
    requiresNote: false,
  });

  if (from === null) return no('This role has not been submitted for review.');
  if (from === to) return no('That role is already in this column.');

  if (from === 'filled') {
    return no('This role is filled. Release the intern before changing its status.');
  }

  switch (to) {
    case 'filled':
      return no(
        'A role becomes filled when a startup confirms an intern, not by being moved here.',
      );

    case 'submitted':
      return no(
        'Only the startup can resubmit a role. Request changes and they will send it back.',
      );

    case 'changes_requested':
      if (facts.activeSelections > 0) {
        return no(
          'A candidate is already reserved against this role. Resolve the selection before ' +
            'asking the startup to change it.',
        );
      }
      // Legal, but the startup sees only the note — so there has to be one.
      return { allowed: true, reason: null, requiresNote: true };

    case 'approved':
      if (facts.exceedsAllocation) {
        return no(
          'This role needs more weekly hours than the startup has been allocated. ' +
            'Approving it would commit hours the programme has not funded.',
        );
      }
      return { allowed: true, reason: null, requiresNote: false };
  }
}

// ─── Board 4: the candidate handoff ──────────────────────────────────────────

/**
 * Where each candidate has got to, from QSTP's side.
 *
 * This is the only board about people rather than work, and its columns answer
 * one question: who is sitting idle. A candidate in `imported` has been paid for
 * by nobody's attention — they are in the system and no startup has seen them.
 * That column being tall is the single most actionable thing on the screen.
 *
 * Everything past `shared` is a startup's doing, so QSTP can only ever perform
 * the first move. The rest refuse with a pointer rather than pretending.
 */
export const CANDIDATE_PIPELINE_STAGES = [
  'imported', // in no pool — nobody is looking at them
  'shared', // handed to a startup, untouched
  'reviewing', // a startup has shortlisted or requested an interview
  'interviewed',
  'reserved', // a startup holds them
  'placed', // reservation confirmed
  'unavailable', // employed, uninterested, withdrawn
] as const;

export type CandidatePipelineStage = (typeof CANDIDATE_PIPELINE_STAGES)[number];

export const CANDIDATE_PIPELINE_LABELS: Readonly<Record<CandidatePipelineStage, string>> = {
  imported: 'Imported',
  shared: 'Pool sent',
  reviewing: 'Being reviewed',
  interviewed: 'Interviewed',
  reserved: 'Reserved',
  placed: 'Placed',
  unavailable: 'Unavailable',
};

export interface CandidatePipelineFacts {
  readonly availability: AvailabilityStatus;
  readonly poolCount: number;
  /** Pool entries a startup has moved beyond `pending`. */
  readonly poolsEngaged: number;
  readonly hasCompletedInterview: boolean;
  readonly hasActiveSelection: boolean;
  readonly hasConfirmedSelection: boolean;
}

/**
 * Which column a candidate sits in.
 *
 * Unavailability wins over everything below `reserved`: somebody who has taken
 * another job should not sit in "Being reviewed" implying there is still a
 * decision to make. But it does *not* override a confirmed placement, because
 * `placed` is itself an availability state and the two would fight.
 */
export function deriveCandidatePipelineStage(
  facts: CandidatePipelineFacts,
): CandidatePipelineStage {
  if (facts.hasConfirmedSelection) return 'placed';
  if (facts.hasActiveSelection) return 'reserved';
  if (!isSelectable(facts.availability)) return 'unavailable';
  if (facts.hasCompletedInterview) return 'interviewed';
  if (facts.poolsEngaged > 0) return 'reviewing';
  if (facts.poolCount > 0) return 'shared';
  return 'imported';
}

export interface CandidateHandoffVerdict {
  readonly allowed: boolean;
  readonly reason: string | null;
  /** The screen or dialog where this actually happens, when it is not here. */
  readonly handoff: { readonly label: string; readonly href: string } | null;
}

/**
 * Whether QSTP may move a candidate card.
 *
 * Exactly one move is theirs: sending someone to a startup. It returns
 * `allowed` with no reason so the screen knows to open the share dialog rather
 * than to write anything itself — the pool is chosen there, and a drag cannot
 * express which position it landed on.
 */
export function checkCandidateHandoff(
  to: CandidatePipelineStage,
  facts: CandidatePipelineFacts,
): CandidateHandoffVerdict {
  const from = deriveCandidatePipelineStage(facts);

  const no = (reason: string, handoff?: { label: string; href: string }): CandidateHandoffVerdict => ({
    allowed: false,
    reason,
    handoff: handoff ?? null,
  });

  if (from === to) return no('That candidate is already here.');

  if (to === 'shared') {
    if (!isSelectable(facts.availability)) {
      return no(
        'This candidate is not available, so sending them to a startup would waste an interview.',
      );
    }
    if (from !== 'imported') {
      return no('This candidate has already been shared with at least one startup.');
    }
    return { allowed: true, reason: null, handoff: null };
  }

  if (to === 'imported') {
    return no('A candidate cannot be un-shared. The startup has already seen them.');
  }

  if (to === 'unavailable') {
    return no('Only the candidate can say they are unavailable, from their own portal.');
  }

  if (to === 'reserved' || to === 'placed') {
    return no(
      'Selection is first-come-first-served and belongs to the startup, not to QSTP.',
      { label: 'Open selection', href: '/selection' },
    );
  }

  return no('This moves when the startup acts on the candidate, not from here.');
}

export const movePositionCardInput = z.object({
  positionId: z.uuid(),
  to: z.enum(POSITION_REVIEW_STAGES),
  /** Required when sending a role back; the startup sees only this. */
  note: z.string().trim().max(2000).nullable().default(null),
});
