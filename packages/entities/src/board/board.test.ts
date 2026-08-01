import { describe, expect, it } from 'vitest';
import {
  checkCandidateHandoff,
  checkCandidateMove,
  checkPositionMove,
  checkStartupMove,
  deriveCandidatePipelineStage,
  deriveStartupCycleStage,
  positionReviewStage,
  startupCycleFlags,
  type CandidateMoveFacts,
  type CandidatePipelineFacts,
  type PositionMoveFacts,
  type StartupCycleFacts,
} from './board';

/**
 * The board's rules, which are the only reason it is worth building.
 *
 * A board that lets anything be dragged anywhere would need no tests, because
 * it would assert nothing. These cover the four refusals the brief names by
 * name, plus the derivation that decides which column a card starts in.
 */

const facts = (over: Partial<StartupCycleFacts> = {}): StartupCycleFacts => ({
  evaluated: true,
  allocatedHours: 40,
  positionsSubmitted: 0,
  positionsApproved: 0,
  poolSize: 0,
  poolReviewed: 0,
  activeSelections: 0,
  confirmedSelections: 0,
  documentsTotal: 0,
  documentsOutstanding: 0,
  documentsAwaitingQstp: 0,
  positionsAwaitingReview: 0,
  pendingExceptions: 0,
  approvedException: false,
  overdue: false,
  ...over,
});

describe('startup cycle stage', () => {
  it('starts a startup with no allocation decision outside the cycle', () => {
    expect(deriveStartupCycleStage(facts({ evaluated: false }))).toBe('not_evaluated');
  });

  it('keeps a zero-hour startup in allocated rather than inventing a column for it', () => {
    const zero = facts({ allocatedHours: 0 });
    expect(deriveStartupCycleStage(zero)).toBe('allocated');
    // The waitlist is a badge, not a stage — the startup is still in the cycle.
    expect(startupCycleFlags(zero)).toContain('waitlisted');
  });

  it('advances through positions, pool and review as each thing actually happens', () => {
    expect(deriveStartupCycleStage(facts({ positionsSubmitted: 2 }))).toBe('positions_pending');
    expect(deriveStartupCycleStage(facts({ positionsSubmitted: 2, poolSize: 5 }))).toBe('pool_sent');
    expect(
      deriveStartupCycleStage(facts({ positionsSubmitted: 2, poolSize: 5, poolReviewed: 1 })),
    ).toBe('reviewing_candidates');
  });

  it('reports the furthest true thing, not the earliest unfinished one', () => {
    // A confirmed intern while a position is still unapproved: onboarding is the
    // truer statement about this startup than "positions pending".
    expect(
      deriveStartupCycleStage(
        facts({ positionsSubmitted: 3, positionsApproved: 1, confirmedSelections: 1 }),
      ),
    ).toBe('onboarding');
  });

  it('only completes a startup once the paperwork is actually verified', () => {
    const onboarding = facts({ confirmedSelections: 1, documentsTotal: 3, documentsOutstanding: 1 });
    expect(deriveStartupCycleStage(onboarding)).toBe('onboarding');
    expect(startupCycleFlags(onboarding)).toContain('missing_documents');

    expect(
      deriveStartupCycleStage({ ...onboarding, documentsOutstanding: 0 }),
    ).toBe('completed');
  });
});

describe('startup cycle flags', () => {
  it('puts hours at risk only when the deadline passed with no protection', () => {
    const late = facts({ overdue: true });
    expect(startupCycleFlags(late)).toContain('hours_at_risk');

    // An approved exception is the difference between late and forgiven.
    expect(startupCycleFlags({ ...late, approvedException: true })).not.toContain('hours_at_risk');
    // So is having actually selected somebody.
    expect(startupCycleFlags({ ...late, activeSelections: 1 })).not.toContain('hours_at_risk');
  });

  it('flags work sitting on QSTP’s side of the desk', () => {
    expect(startupCycleFlags(facts({ pendingExceptions: 1 }))).toContain('needs_qstp_action');
    expect(startupCycleFlags(facts({ documentsAwaitingQstp: 2 }))).toContain('needs_qstp_action');
    expect(startupCycleFlags(facts({ positionsAwaitingReview: 1 }))).toContain('needs_qstp_action');
  });
});

describe('moving a startup card', () => {
  it('refuses a pool for a startup that has submitted no positions', () => {
    const verdict = checkStartupMove('positions_pending', 'pool_sent', facts());
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/not submitted any positions/i);
    expect(verdict.handoff?.href).toBe('/positions');
  });

  it('refuses a pool while the positions are submitted but unapproved', () => {
    const verdict = checkStartupMove(
      'positions_pending',
      'pool_sent',
      facts({ positionsSubmitted: 2, positionsApproved: 0 }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/approved/i);
  });

  it('allows the pool once a position is approved', () => {
    expect(
      checkStartupMove(
        'positions_pending',
        'pool_sent',
        facts({ positionsSubmitted: 2, positionsApproved: 2 }),
      ).allowed,
    ).toBe(true);
  });

  it('will not record a selection for a startup past its deadline without an exception', () => {
    const late = facts({ poolSize: 4, poolReviewed: 2, activeSelections: 1, overdue: true });

    const blocked = checkStartupMove('reviewing_candidates', 'candidate_selected', late);
    expect(blocked.allowed).toBe(false);
    expect(blocked.handoff?.href).toBe('/exceptions');

    expect(
      checkStartupMove('reviewing_candidates', 'candidate_selected', {
        ...late,
        approvedException: true,
      }).allowed,
    ).toBe(true);
  });

  it('still lets QSTP send a pool to a late startup, since that is the remedy', () => {
    // Gating this would punish a startup for a delay QSTP is in the middle of
    // fixing by giving it candidates.
    expect(
      checkStartupMove(
        'positions_pending',
        'pool_sent',
        facts({ positionsSubmitted: 1, positionsApproved: 1, overdue: true }),
      ).allowed,
    ).toBe(true);
  });

  it('refuses to skip stages, or to go backwards', () => {
    const ready = facts({ positionsSubmitted: 1, positionsApproved: 1 });
    expect(checkStartupMove('allocated', 'candidate_selected', ready).reason).toMatch(
      /one stage at a time/i,
    );
    expect(checkStartupMove('onboarding', 'pool_sent', ready).reason).toMatch(/backwards/i);
  });

  it('will not complete a startup with unverified documents', () => {
    const verdict = checkStartupMove(
      'onboarding',
      'completed',
      facts({ confirmedSelections: 1, documentsTotal: 3, documentsOutstanding: 2 }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/2 documents are still unverified/i);
  });

  it('hands off the stages QSTP does not own instead of just saying no', () => {
    const verdict = checkStartupMove(
      'reviewing_candidates',
      'candidate_selected',
      facts({ poolSize: 4, poolReviewed: 2 }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.handoff?.href).toBe('/selection');
  });
});

const candidate = (over: Partial<CandidateMoveFacts> = {}): CandidateMoveFacts => ({
  currentStatus: 'interviewed',
  availability: 'available',
  heldByOther: false,
  heldByUs: false,
  hasInterview: true,
  deadlinePassed: false,
  hasApprovedException: false,
  ...over,
});

describe('moving a candidate card', () => {
  it('refuses to select a candidate another startup already holds', () => {
    const verdict = checkCandidateMove('selected', candidate({ heldByOther: true }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/first-come-first-served/i);
  });

  it('refuses to select a candidate who is no longer available', () => {
    expect(checkCandidateMove('selected', candidate({ availability: 'employed' })).reason).toMatch(
      /another job/i,
    );
    expect(checkCandidateMove('selected', candidate({ availability: 'placed' })).reason).toMatch(
      /already been placed/i,
    );
  });

  it('warns rather than blocks after the deadline, because reclaiming hours is the penalty', () => {
    // The programme answers a missed deadline by redistributing the hours, not
    // by disabling the button — so the board says what is at stake and lets the
    // startup proceed.
    const late = checkCandidateMove('selected', candidate({ deadlinePassed: true }));
    expect(late.allowed).toBe(true);
    expect(late.confirm).toMatch(/can be reclaimed/i);

    const protectedByException = checkCandidateMove(
      'selected',
      candidate({ deadlinePassed: true, hasApprovedException: true }),
    );
    expect(protectedByException.allowed).toBe(true);
    expect(protectedByException.confirm).not.toMatch(/can be reclaimed/i);
  });

  it('asks before selecting, because a stray mouse-up is not a hire', () => {
    const verdict = checkCandidateMove('selected', candidate());
    expect(verdict.allowed).toBe(true);
    expect(verdict.confirm).toMatch(/reserves this candidate/i);
  });

  it('will not let a reservation be undone by dragging the card out', () => {
    const verdict = checkCandidateMove(
      'interviewed',
      candidate({ currentStatus: 'selected', heldByUs: true }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/release the reservation/i);
  });

  it('keeps the pipeline honest about what has actually happened', () => {
    // Interviewed before an interview exists, and interested before interviewed.
    expect(
      checkCandidateMove('interviewed', candidate({ currentStatus: 'shortlisted', hasInterview: false }))
        .allowed,
    ).toBe(false);
    expect(
      checkCandidateMove('interested', candidate({ currentStatus: 'shortlisted' })).allowed,
    ).toBe(false);
    expect(checkCandidateMove('interested', candidate()).allowed).toBe(true);
  });

  it('settles cards that lost the race or withdrew', () => {
    expect(checkCandidateMove('shortlisted', candidate({ currentStatus: 'lost' })).allowed).toBe(
      false,
    );
    expect(checkCandidateMove('shortlisted', candidate({ currentStatus: 'withdrawn' })).allowed).toBe(
      false,
    );
  });
});

// ─── Positions review board ──────────────────────────────────────────────────

describe('position review moves', () => {
  const facts = (over: Partial<PositionMoveFacts> = {}): PositionMoveFacts => ({
    currentStatus: 'submitted',
    poolShared: false,
    activeSelections: 0,
    exceedsAllocation: false,
    ...over,
  });

  it('approves a submitted role', () => {
    expect(checkPositionMove('approved', facts())).toEqual({
      allowed: true,
      reason: null,
      requiresNote: false,
    });
  });

  it('requires a note when sending a role back', () => {
    const verdict = checkPositionMove('changes_requested', facts());
    expect(verdict.allowed).toBe(true);
    // The startup sees only this note, so a wordless rejection is useless.
    expect(verdict.requiresNote).toBe(true);
  });

  it('refuses to approve a role that exceeds its startup’s allocation', () => {
    // Reaching this means the allocation shrank after submission — exactly the
    // case a human reviewer would miss.
    const verdict = checkPositionMove('approved', facts({ exceedsAllocation: true }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('has not funded');
  });

  it('refuses to send back a role that already has someone reserved', () => {
    const verdict = checkPositionMove(
      'changes_requested',
      facts({ currentStatus: 'approved', activeSelections: 1 }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('already reserved');
  });

  it('never lets a card be dropped into Filled', () => {
    for (const status of ['submitted', 'changes_requested', 'approved'] as const) {
      expect(checkPositionMove('filled', facts({ currentStatus: status })).allowed).toBe(false);
    }
  });

  it('refuses to move a filled role at all', () => {
    for (const to of ['submitted', 'changes_requested', 'approved'] as const) {
      expect(checkPositionMove(to, facts({ currentStatus: 'filled' })).allowed).toBe(false);
    }
  });

  it('has no column for drafts or withdrawn roles', () => {
    expect(positionReviewStage('draft')).toBeNull();
    expect(positionReviewStage('withdrawn')).toBeNull();
    expect(positionReviewStage('approved')).toBe('approved');
  });
});

// ─── Candidate handoff board ─────────────────────────────────────────────────

describe('candidate pipeline', () => {
  const facts = (over: Partial<CandidatePipelineFacts> = {}): CandidatePipelineFacts => ({
    availability: 'available',
    poolCount: 0,
    poolsEngaged: 0,
    hasCompletedInterview: false,
    hasActiveSelection: false,
    hasConfirmedSelection: false,
    ...over,
  });

  it('puts an unpooled candidate in Imported', () => {
    expect(deriveCandidatePipelineStage(facts())).toBe('imported');
  });

  it('moves through shared, reviewing and interviewed as a startup engages', () => {
    expect(deriveCandidatePipelineStage(facts({ poolCount: 1 }))).toBe('shared');
    expect(deriveCandidatePipelineStage(facts({ poolCount: 1, poolsEngaged: 1 }))).toBe('reviewing');
    expect(
      deriveCandidatePipelineStage(facts({ poolCount: 1, hasCompletedInterview: true })),
    ).toBe('interviewed');
  });

  it('lets a confirmed placement outrank availability', () => {
    // `placed` is itself an availability state; the two must not fight.
    expect(
      deriveCandidatePipelineStage(facts({ availability: 'placed', hasConfirmedSelection: true })),
    ).toBe('placed');
  });

  it('shows an unavailable candidate as unavailable rather than mid-review', () => {
    expect(
      deriveCandidatePipelineStage(
        facts({ availability: 'employed', poolCount: 1, poolsEngaged: 1 }),
      ),
    ).toBe('unavailable');
  });

  it('allows exactly one move: sending an imported candidate to a startup', () => {
    expect(checkCandidateHandoff('shared', facts()).allowed).toBe(true);
  });

  it('refuses to share someone who is no longer available', () => {
    const verdict = checkCandidateHandoff('shared', facts({ availability: 'employed' }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('waste an interview');
  });

  it('refuses to un-share a candidate', () => {
    const verdict = checkCandidateHandoff('imported', facts({ poolCount: 1 }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('already seen them');
  });

  it('hands selection back to the startup, with a link', () => {
    const verdict = checkCandidateHandoff('reserved', facts({ poolCount: 1 }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('first-come-first-served');
    expect(verdict.handoff?.href).toBe('/selection');
  });

  it('refuses to mark someone unavailable on their behalf', () => {
    const verdict = checkCandidateHandoff('unavailable', facts({ poolCount: 1 }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('own portal');
  });
});
