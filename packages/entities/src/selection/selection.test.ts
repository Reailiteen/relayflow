import { describe, expect, it } from 'vitest';
import { asId } from '@relayflow/core';
import type { Selection, SelectionStatus } from './selection';
import { acceptedOffer, contenders, hasConflict, openOffers, resolve, winner } from './selection';

const claim = (
  id: string,
  startup: string,
  reservedAt: string,
  status: SelectionStatus = 'reserved',
  overrideReason: string | null = null,
  extra: Partial<Selection> = {},
): Selection =>
  ({
    id: asId(id),
    positionId: asId('00000000-0000-4000-8000-00000000000a'),
    startupId: asId(startup),
    candidateId: asId('00000000-0000-4000-8000-00000000000c'),
    status,
    reservedAt,
    offeredAt: null,
    acceptedAt: null,
    confirmedAt: null,
    releasedAt: null,
    selectedBy: asId('00000000-0000-4000-8000-00000000000u'),
    overrideReason,
    overriddenBy: null,
    createdAt: reservedAt,
    updatedAt: reservedAt,
    ...extra,
  });

/** A live offer — non-blocking, stamped with when it was made. */
const offer = (id: string, startup: string, offeredAt: string): Selection =>
  claim(id, startup, offeredAt, 'offered', null, { offeredAt });

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

describe('candidate choice', () => {
  const C = '30000000-0000-4000-8000-000000000003';

  it('lets several startups offer the same candidate without conflict', () => {
    const claims = [
      offer('1', A, '2026-03-02T09:15:00.000Z'),
      offer('2', B, '2026-03-02T11:00:00.000Z'),
      offer('3', C, '2026-03-03T08:00:00.000Z'),
    ];
    // The whole point: three offers, nobody blocked, nothing to resolve.
    expect(hasConflict(claims)).toBe(false);
    expect(openOffers(claims)).toHaveLength(3);
    expect(resolve('candidate_choice', claims)).toBeNull();
  });

  it('holds no one while the candidate is still deciding', () => {
    const claims = [offer('1', A, '2026-03-02T09:15:00.000Z')];
    // An offer is interest, not a commitment — so it must not read as a claim.
    expect(winner(claims)).toBeNull();
    expect(resolve('candidate_choice', claims)).toBeNull();
    expect(contenders(claims)).toEqual([]);
  });

  it('awards the candidate to the offer they accepted, not the earliest one', () => {
    const claims = [
      claim('1', A, '2026-03-02T09:15:00.000Z', 'declined', null, {
        offeredAt: '2026-03-02T09:15:00.000Z',
        releasedAt: '2026-03-04T10:00:00.000Z',
      }),
      claim('2', B, '2026-03-04T10:00:00.000Z', 'reserved', null, {
        offeredAt: '2026-03-02T11:00:00.000Z',
        acceptedAt: '2026-03-04T10:00:00.000Z',
      }),
    ];
    // A offered first. Under first-come A would win; the candidate picked B.
    expect(resolve('candidate_choice', claims)?.startupId).toBe(asId(B));
    expect(acceptedOffer(claims)?.startupId).toBe(asId(B));
    expect(openOffers(claims)).toEqual([]);
  });

  it('does not settle a candidate-choice tie by the clock', () => {
    // Two blocking claims should be impossible — the unique index forbids it.
    // If one ever slips through, the person's decision decides it, not whoever
    // happened to be written first.
    const claims = [
      claim('1', A, '2026-03-02T09:15:00.000Z'),
      claim('2', B, '2026-03-04T10:00:00.000Z', 'reserved', null, {
        offeredAt: '2026-03-02T11:00:00.000Z',
        acceptedAt: '2026-03-04T10:00:00.000Z',
      }),
    ];
    expect(winner(claims)?.startupId).toBe(asId(A));
    expect(resolve('candidate_choice', claims)?.startupId).toBe(asId(B));
  });

  it('lets a QSTP override outrank the candidate’s own choice', () => {
    const claims = [
      claim('1', A, '2026-03-05T09:00:00.000Z', 'reserved', 'Candidate withdrew verbally'),
      claim('2', B, '2026-03-04T10:00:00.000Z', 'reserved', null, {
        offeredAt: '2026-03-02T11:00:00.000Z',
        acceptedAt: '2026-03-04T10:00:00.000Z',
      }),
    ];
    expect(resolve('candidate_choice', claims)?.startupId).toBe(asId(A));
  });

  it('orders open offers oldest first, which is the order the fallback walks', () => {
    const claims = [
      offer('1', B, '2026-03-03T08:00:00.000Z'),
      offer('2', A, '2026-03-02T09:15:00.000Z'),
      claim('3', C, '2026-03-01T08:00:00.000Z', 'declined'),
    ];
    expect(openOffers(claims).map((o) => o.startupId)).toEqual([asId(A), asId(B)]);
  });

  it('keeps first-come behaviour untouched when the cycle runs that mode', () => {
    const claims = [
      claim('1', B, '2026-03-02T11:00:00.000Z'),
      claim('2', A, '2026-03-02T09:15:00.000Z'),
    ];
    expect(resolve('first_come', claims)).toEqual(winner(claims));
  });
});
