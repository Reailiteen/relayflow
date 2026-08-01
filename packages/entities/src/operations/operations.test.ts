import { describe, expect, it } from 'vitest';
import { asId } from '@relayflow/core';
import {
  committedPlacementHours,
  evaluateStageGate,
  fitPrioritization,
  placementReadinessBlockers,
  recoverableAllocationHours,
  type CycleParticipation,
  type Placement,
} from '..';

const cycleId = asId<'CycleId'>('c1c1e000-0000-4000-8000-000000000001');
function participation(index: number, score: number, request = 60): CycleParticipation {
  return {
    id: asId<'ParticipationId'>(`b1b1e000-0000-4000-8000-${String(index).padStart(12, '0')}`),
    cycleId,
    startupId: asId<'StartupId'>(`57a27000-0000-4000-8000-${String(index).padStart(12, '0')}`),
    status: 'accepted',
    requestedTotalHours: request,
    requestedInternCount: 2,
    disciplines: ['Engineering'],
    operatorScore: score,
    internalNotes: null,
    startupJustification: null,
    allocationAcknowledgedAt: null,
    allocationAcknowledgedBy: null,
    createdAt: `2026-01-${String(index).padStart(2, '0')}T00:00:00.000Z`,
    updatedAt: '2026-01-20T00:00:00.000Z',
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
  it('steps lower-ranked proposals down until the fixed budget fits', () => {
    const proposals = fitPrioritization(
      [participation(1, 95), participation(2, 90), participation(3, 80), participation(4, 72)],
      130,
    );
    expect(proposals.reduce((sum, row) => sum + row.proposedHours, 0)).toBeLessThanOrEqual(130);
    expect(proposals[0]?.proposedHours).toBe(60);
    expect(proposals[3]?.proposedHours).toBe(0);
    expect(proposals.every((row) => [0, 20, 30, 40, 60].includes(row.proposedHours))).toBe(true);
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
        { required: true, status: 'approved' },
        { required: true, status: 'awaiting_upload' },
      ],
      signatures: [{ kind: 'qstp_agreement' }, { kind: 'startup_agreement' }],
      candidateReady: true,
      startupReady: true,
      detailsFinal: true,
      qstpApproved: true,
      unresolvedConflict: false,
      unresolvedException: false,
    });
    expect(blockers).toContain('Required documents are incomplete.');
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
