import { describe, expect, it } from 'vitest';
import { asId } from '@relayflow/core';
import type { OrganizationId } from '@relayflow/entities';
import { ANONYMOUS, type Actor } from './actor';
import { CAPABILITIES, ROLE_CAPABILITIES } from './capabilities';
import { authorize, can, decide } from './policy';

const org = asId<'OrganizationId'>('11111111-1111-4111-8111-111111111111') as OrganizationId;
const otherOrg = asId<'OrganizationId'>('22222222-2222-4222-8222-222222222222') as OrganizationId;

const actorWith = (role: Actor['memberships'][number]['role'], status: 'active' | 'suspended' = 'active'): Actor => ({
  userId: asId<'UserId'>('33333333-3333-4333-8333-333333333333'),
  email: 'person@example.com',
  memberships: [{ organizationId: org, role, status }],
});

describe('policy', () => {
  it('denies anonymous callers every capability', () => {
    for (const capability of CAPABILITIES) {
      expect(can(ANONYMOUS, { capability, organizationId: org })).toBe(false);
    }
  });

  it('denies access to organizations the actor does not belong to', () => {
    const decision = decide(actorWith('owner'), {
      capability: 'organization:read',
      organizationId: otherOrg,
    });
    expect(decision).toEqual({ allowed: false, reason: 'not_a_member' });
  });

  it('denies suspended members even when their role grants the capability', () => {
    const decision = decide(actorWith('admin', 'suspended'), {
      capability: 'member:invite',
      organizationId: org,
    });
    expect(decision).toEqual({ allowed: false, reason: 'suspended' });
  });

  it('grants exactly what the role table lists, and nothing more', () => {
    for (const [role, granted] of Object.entries(ROLE_CAPABILITIES)) {
      const actor = actorWith(role as Actor['memberships'][number]['role']);
      for (const capability of CAPABILITIES) {
        expect(can(actor, { capability, organizationId: org })).toBe(granted.includes(capability));
      }
    }
  });

  it('never lets a non-owner delete an organization', () => {
    for (const role of ['admin', 'member', 'guest'] as const) {
      expect(can(actorWith(role), { capability: 'organization:delete', organizationId: org })).toBe(
        false,
      );
    }
  });

  it('returns an unauthenticated error rather than forbidden for anonymous callers', () => {
    const result = authorize(ANONYMOUS, { capability: 'member:read', organizationId: org });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unauthenticated');
  });
});
