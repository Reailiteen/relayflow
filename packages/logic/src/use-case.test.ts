import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { asId, fixedClock, ok } from '@relayflow/core';
import type { Actor } from '@relayflow/access';
import { ANONYMOUS } from '@relayflow/access';
import type { OrganizationId } from '@relayflow/entities';
import { silentLogger } from '@relayflow/logger';
import type { UseCaseContext } from './context';
import { defineUseCase } from './use-case';

const org = asId<'OrganizationId'>('11111111-1111-4111-8111-111111111111') as OrganizationId;

const actor: Actor = {
  userId: asId<'UserId'>('33333333-3333-4333-8333-333333333333'),
  email: 'person@example.com',
  memberships: [{ organizationId: org, role: 'member', status: 'active' }],
};

function contextFor(who: UseCaseContext['actor']): UseCaseContext {
  return {
    actor: who,
    repos: {} as UseCaseContext['repos'],
    logger: silentLogger,
    clock: fixedClock('2026-01-01T00:00:00Z'),
  };
}

describe('defineUseCase', () => {
  const execute = vi.fn(() => Promise.resolve(ok('done')));

  const gated = defineUseCase({
    name: 'test.gated',
    input: z.object({ organizationId: z.uuid() }),
    authorize: (_ctx, input) => ({
      capability: 'member:remove' as const,
      organizationId: input.organizationId as OrganizationId,
    }),
    execute,
  });

  it('rejects invalid input before authorizing or executing', async () => {
    const result = await gated(contextFor(actor), { organizationId: 'not-a-uuid' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not execute when authorization fails', async () => {
    execute.mockClear();
    // A plain member lacks member:remove.
    const result = await gated(contextFor(actor), { organizationId: org });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not execute for anonymous callers', async () => {
    execute.mockClear();
    const result = await gated(contextFor(ANONYMOUS), { organizationId: org });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unauthenticated');
    expect(execute).not.toHaveBeenCalled();
  });

  it('executes once the actor is permitted', async () => {
    execute.mockClear();
    const owner: Actor = {
      ...actor,
      memberships: [{ organizationId: org, role: 'owner', status: 'active' }],
    };
    const result = await gated(contextFor(owner), { organizationId: org });
    expect(result).toEqual({ ok: true, data: 'done' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('converts an unexpected throw into an internal error rather than crashing', async () => {
    const boom = defineUseCase({
      name: 'test.boom',
      input: z.object({}),
      authorize: { kind: 'public', justification: 'test' },
      execute: () => {
        throw new Error('kaboom');
      },
    });
    const result = await boom(contextFor(ANONYMOUS), {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('internal');
  });
});
