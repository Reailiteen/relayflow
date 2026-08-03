import { describe, expect, it } from 'vitest';
import { asId } from '@relayflow/core';
import {
  AGREEMENT_TITLES,
  committedPlacementHours,
  effectiveHours,
  evaluateStageGate,
  placementReadinessBlockers,
  recoverableAllocationHours,
  type Placement,
  type PrioritizationOutcome,
  type PrioritizationOutcomeStatus,
} from '..';

/** All three agreements returned signed — the readiness baseline. */
const signedAgreements = () =>
  Object.values(AGREEMENT_TITLES).map((title) => ({
    required: true,
    status: 'approved' as const,
    title,
  }));

const cycleId = asId<'CycleId'>('c1c1e000-0000-4000-8000-000000000001');

function outcome(
  status: PrioritizationOutcomeStatus,
  overrides: Partial<PrioritizationOutcome> = {},
): PrioritizationOutcome {
  return {
    participationId: null,
    startupId: asId<'StartupId'>('57a27000-0000-4000-8000-000000000001'),
    status,
    score: status === 'scored' ? 88 : null,
    breakdown: null,
    historySource: null,
    rank: null,
    requestedHours: 60,
    maximumHours: null,
    proposedHours: null,
    adjustedHours: null,
    adjustmentReason: null,
    waitlistRank: null,
    requiresTieResolution: false,
    blockers: [],
    signals: [],
    adjustments: [],
    ...overrides,
  };
}

function placement(index: number, hours: number, status: Placement['status']): Placement {
  return {
    id: asId<'PlacementId'>(`91ace000-0000-4000-8000-${String(index).padStart(12, '0')}`),
    cycleId,
    selectionId: asId<'SelectionId'>(`5e1ec700-0000-4000-8000-${String(index).padStart(12, '0')}`),
    candidateId: asId<'CandidateId'>(`ca4d1da7-0000-4000-8000-${String(index).padStart(12, '0')}`),
    startupId: asId<'StartupId'>('57a27000-0000-4000-8000-000000000001'),
    positionId: asId<'PositionId'>('9051f100-0000-4000-8000-000000000001'),
    committedWeeklyHours: hours,
    startsOn: '2026-04-01',
    endsOn: '2026-07-01',
    supervisorId: null,
    supervisorName: 'Supervisor',
    status,
    candidateReadyAt: null,
    startupReadyAt: null,
    detailsFinalizedAt: null,
    qstpApprovedAt: null,
    cancelledAt: status === 'cancelled' ? '2026-03-20T00:00:00.000Z' : null,
    cancellationReason: status === 'cancelled' ? 'Withdrawn' : null,
    replacementForPlacementId: null,
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
  };
}

describe('fixture-backed operations domain', () => {
  /**
   * The rule the whole five-status design exists to protect. A startup nobody
   * extracted and a startup that scored 12 both end up with zero hours; only
   * the second one has actually been evaluated, and only it may become an
   * allocation row.
   */
  it('gives no hours to any startup that was never scored', () => {
    const unscored: PrioritizationOutcomeStatus[] = [
      'needs_information',
      'awaiting_manual_scores',
      'not_ready',
      'not_fundable',
    ];
    for (const status of unscored) {
      // Even if a proposed tier somehow leaked onto the row.
      expect(effectiveHours(outcome(status, { proposedHours: 40 }))).toBeNull();
    }
    // A scored startup at the bottom of the ladder DOES get a row — for 0h,
    // which is a real decision and puts it on the waitlist.
    expect(effectiveHours(outcome('scored', { proposedHours: 0 }))).toBe(0);
  });

  it('prefers a reviewed adjustment over the engine’s proposal', () => {
    expect(
      effectiveHours(
        outcome('scored', { proposedHours: 40, adjustedHours: 20, adjustmentReason: 'Agreed with founder.' }),
      ),
    ).toBe(20);
    expect(effectiveHours(outcome('scored', { proposedHours: 40 }))).toBe(40);
  });

  it('never counts a cancelled placement as committed hours', () => {
    const rows = [placement(1, 20, 'confirmed'), placement(2, 30, 'cancelled')];
    expect(committedPlacementHours(rows)).toBe(20);
    expect(recoverableAllocationHours(60, rows)).toBe(40);
  });

  it('blocks readiness when even one required requirement is missing', () => {
    const blockers = placementReadinessBlockers({
      active: true,
      requirements: [
        ...signedAgreements(),
        { required: true, status: 'approved', title: 'Passport' },
        { required: true, status: 'awaiting_upload', title: 'Bank details' },
      ],
      candidateReady: true,
      startupReady: true,
      detailsFinal: true,
      qstpApproved: true,
      unresolvedConflict: false,
      unresolvedException: false,
    });
    expect(blockers).toContain('Required documents are incomplete.');
  });

  it('blocks readiness until the candidate has returned a signed agreement too', () => {
    const facts = {
      active: true,
      candidateReady: true,
      startupReady: true,
      detailsFinal: true,
      qstpApproved: true,
      unresolvedConflict: false,
      unresolvedException: false,
    };

    // Confirming readiness is not agreeing. A candidate who has ticked "I am
    // ready" has still not signed anything, and conflating the two would let a
    // placement go live on two agreements.
    expect(
      placementReadinessBlockers({
        ...facts,
        requirements: signedAgreements().filter(
          (row) => row.title !== AGREEMENT_TITLES.candidate,
        ),
      }),
    ).toEqual(['Candidate agreement is not signed and returned.']);

    expect(
      placementReadinessBlockers({ ...facts, requirements: signedAgreements() }),
    ).toEqual([]);
  });

  it('names which agreement is outstanding rather than lumping them together', () => {
    // "A required document is incomplete" sends somebody hunting through a
    // checklist for which one; naming it is the difference between a blocker
    // they can act on and one they have to go looking for.
    const blockers = placementReadinessBlockers({
      active: true,
      requirements: [],
      candidateReady: true,
      startupReady: true,
      detailsFinal: true,
      qstpApproved: true,
      unresolvedConflict: false,
      unresolvedException: false,
    });
    expect(blockers).toEqual([
      'QSTP agreement is not signed and returned.',
      'Startup agreement is not signed and returned.',
      'Candidate agreement is not signed and returned.',
    ]);
  });

  it('treats a waived agreement as settled', () => {
    // Waiving is a decision somebody made and recorded, not an omission.
    const blockers = placementReadinessBlockers({
      active: true,
      requirements: signedAgreements().map((row) =>
        row.title === AGREEMENT_TITLES.startup ? { ...row, status: 'waived' as const } : row,
      ),
      candidateReady: true,
      startupReady: true,
      detailsFinal: true,
      qstpApproved: true,
      unresolvedConflict: false,
      unresolvedException: false,
    });
    expect(blockers).toEqual([]);
  });

  it('requires a reason to override warnings but never permits blocker overrides', () => {
    const warning = [{ key: 'ack', label: 'Acknowledged', severity: 'warning' as const, passed: false }];
    expect(evaluateStageGate(warning).canAdvance).toBe(false);
    expect(evaluateStageGate(warning, 'Reviewed manually.').canAdvance).toBe(true);
    expect(
      evaluateStageGate(
        [{ key: 'budget', label: 'Within budget', severity: 'blocking', passed: false }],
        'Ignore it',
      ).canAdvance,
    ).toBe(false);
  });
});
