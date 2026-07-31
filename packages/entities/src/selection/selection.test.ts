import { describe, expect, it } from 'vitest';
import { asId } from '@relayflow/core';
import type { Selection, SelectionStatus } from './selection';
import { contenders, hasConflict, winner } from './selection';

const claim = (
  id: string,
  startup: string,
  reservedAt: string,
  status: SelectionStatus = 'reserved',
  overrideReason: string | null = null,
): Selection =>
  ({
    id: asId(id),
    positionId: asId('00000000-0000-4000-8000-00000000000a'),
    startupId: asId(startup),
    candidateId: asId('00000000-0000-4000-8000-00000000000c'),
    status,
    reservedAt,
    confirmedAt: null,
    releasedAt: null,
    selectedBy: asId('00000000-0000-4000-8000-00000000000u'),
    overrideReason,
    overriddenBy: null,
    createdAt: reservedAt,
    updatedAt: reservedAt,
  });

const A = '10000000-0000-4000-8000-000000000001';
const B = '20000000-0000-4000-8000-000000000002';

describe('candidate reservation', () => {
  it('awards the candidate to the earliest claim', () => {
    const claims = [
      claim('1', B, '2026-03-02T11:00:00.000Z'),
      claim('2', A, '2026-03-02T09:15:00.000Z'),
    ];
    expect(winner(claims)?.startupId).toBe(asId(A));
  });

  it('ignores released and lost claims when deciding', () => {
    const claims = [
      claim('1', A, '2026-03-01T08:00:00.000Z', 'released'),
      claim('2', B, '2026-03-02T11:00:00.000Z'),
    ];
    // A was first but withdrew, so B holds the candidate.
    expect(winner(claims)?.startupId).toBe(asId(B));
    expect(hasConflict(claims)).toBe(false);
  });

  it('reports no winner when every claim has been released', () => {
    const claims = [claim('1', A, '2026-03-01T08:00:00.000Z', 'released')];
    expect(winner(claims)).toBeNull();
  });

  it('lets a QSTP override beat the earlier timestamp', () => {
    const claims = [
      claim('1', A, '2026-03-02T09:15:00.000Z'),
      claim('2', B, '2026-03-02T11:00:00.000Z', 'reserved', 'Candidate withdrew from A verbally'),
    ];
    expect(winner(claims)?.startupId).toBe(asId(B));
  });

  it('surfaces the losing claims so the conflict can be shown, not just decided', () => {
    const claims = [
      claim('1', A, '2026-03-02T09:15:00.000Z'),
      claim('2', B, '2026-03-02T11:00:00.000Z'),
    ];
    expect(hasConflict(claims)).toBe(true);
    expect(contenders(claims).map((c) => c.startupId)).toEqual([asId(B)]);
  });

  it('treats a confirmed claim as blocking, not just a reserved one', () => {
    const claims = [
      claim('1', A, '2026-03-02T09:15:00.000Z', 'confirmed'),
      claim('2', B, '2026-03-02T11:00:00.000Z'),
    ];
    expect(winner(claims)?.startupId).toBe(asId(A));
    expect(hasConflict(claims)).toBe(true);
  });

  it('has no conflict when only one startup ever claimed', () => {
    expect(hasConflict([claim('1', A, '2026-03-02T09:15:00.000Z')])).toBe(false);
  });
});
