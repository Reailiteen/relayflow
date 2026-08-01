import { describe, expect, it } from 'vitest';
import { asId } from '@relayflow/core';
import type { CandidateId, StartupId } from '@relayflow/entities';
import { ANONYMOUS, type CandidateActor, type QstpActor, type StartupActor } from './actor';
import { CAPABILITIES, QSTP_CAPABILITIES, STARTUP_CAPABILITIES } from './capabilities';
import { can, decide } from './policy';

const acme = asId<'StartupId'>('a0000000-0000-4000-8000-000000000001') as StartupId;
const rival = asId<'StartupId'>('a0000000-0000-4000-8000-000000000002') as StartupId;
const me = asId<'CandidateId'>('c0000000-0000-4000-8000-000000000001') as CandidateId;
const someoneElse = asId<'CandidateId'>('c0000000-0000-4000-8000-000000000002') as CandidateId;

const uid = asId<'UserId'>('b0000000-0000-4000-8000-000000000001');

const qstp = (role: QstpActor['role']): QstpActor => ({
  kind: 'qstp',
  userId: uid,
  email: 'staff@qstp.org.qa',
  fullName: 'QSTP Staff',
  role,
});

const startup = (
  role: StartupActor['affiliations'][number]['role'],
  status: StartupActor['affiliations'][number]['status'] = 'active',
): StartupActor => ({
  kind: 'startup',
  userId: uid,
  email: 'founder@acme.example',
  fullName: 'Acme Founder',
  affiliations: [{ startupId: acme, role, status }],
});

const candidate = (): CandidateActor => ({
  kind: 'candidate',
  userId: uid,
  email: 'candidate@example.com',
  fullName: 'A Candidate',
  candidateId: me,
});

describe('policy', () => {
  it('denies anonymous callers every capability', () => {
    for (const capability of CAPABILITIES) {
      expect(can(ANONYMOUS, { capability, startupId: acme })).toBe(false);
    }
  });

  describe('QSTP staff', () => {
    it('grants exactly what the role table lists, and nothing more', () => {
      for (const [role, granted] of Object.entries(QSTP_CAPABILITIES)) {
        const actor = qstp(role as QstpActor['role']);
        for (const capability of CAPABILITIES) {
          expect(can(actor, { capability })).toBe(granted.includes(capability));
        }
      }
    });

    it('keeps viewers strictly read-only', () => {
      const viewer = qstp('viewer');
      for (const capability of [
        'allocation:decide',
        'exception:decide',
        'document:verify',
        'redistribution:run',
        'cycle:create',
      ] as const) {
        expect(can(viewer, { capability })).toBe(false);
      }
    });

    it('reserves budget-reshaping actions for the programme manager', () => {
      // Operations runs the cycle day to day but cannot redraw its budget.
      expect(can(qstp('operations'), { capability: 'redistribution:run' })).toBe(false);
      expect(can(qstp('operations'), { capability: 'allocation:override' })).toBe(false);
      expect(can(qstp('operations'), { capability: 'cycle:advance_stage' })).toBe(false);
      expect(can(qstp('program_manager'), { capability: 'redistribution:run' })).toBe(true);
    });
  });

  describe('startup members', () => {
    it('refuses startup-scoped work that does not name a startup', () => {
      // Without this, "submit a position" would pass with no tenant at all.
      expect(decide(startup('owner'), { capability: 'position:submit' })).toEqual({
        allowed: false,
        reason: 'missing_capability',
      });
    });

    it('cannot act for a startup they are not affiliated with', () => {
      expect(decide(startup('owner'), { capability: 'position:submit', startupId: rival })).toEqual({
        allowed: false,
        reason: 'not_affiliated',
      });
    });

    it('denies suspended members even when their role grants the capability', () => {
      expect(
        decide(startup('owner', 'suspended'), { capability: 'position:submit', startupId: acme }),
      ).toEqual({ allowed: false, reason: 'suspended' });
    });

    it('grants exactly what the role table lists for their own startup', () => {
      for (const [role, granted] of Object.entries(STARTUP_CAPABILITIES)) {
        const actor = startup(role as StartupActor['affiliations'][number]['role']);
        for (const capability of CAPABILITIES) {
          expect(can(actor, { capability, startupId: acme })).toBe(granted.includes(capability));
        }
      }
    });

    it('never lets a supervisor commit the startup to a hire or an extension', () => {
      const supervisor = startup('supervisor');
      expect(can(supervisor, { capability: 'selection:create', startupId: acme })).toBe(false);
      expect(can(supervisor, { capability: 'exception:request', startupId: acme })).toBe(false);
      // But they can still run the interview they were brought in for.
      expect(can(supervisor, { capability: 'interview:schedule', startupId: acme })).toBe(true);
    });

    it('never grants a startup member QSTP-only capabilities', () => {
      for (const capability of [
        'allocation:decide',
        'exception:decide',
        'candidate:import',
        'selection:resolve_conflict',
        'document:verify',
      ] as const) {
        expect(can(startup('owner'), { capability, startupId: acme })).toBe(false);
      }
    });
  });

  describe('candidates', () => {
    it('may act on their own record', () => {
      expect(
        can(candidate(), { capability: 'candidate:confirm_availability', candidateId: me }),
      ).toBe(true);
    });

    it('cannot touch another candidate’s record', () => {
      expect(
        decide(candidate(), { capability: 'document:read_own', candidateId: someoneElse }),
      ).toEqual({ allowed: false, reason: 'not_self' });
    });

    it('is refused any startup-scoped question, even for a shared capability', () => {
      // `document:read_own` is granted to candidates *and* startup members, but
      // it means different things to each. Asking it with a startup scope is a
      // startup's question, so a candidate must be turned away rather than
      // passing the gate and failing later on a missing affiliation.
      expect(decide(candidate(), { capability: 'document:read_own', startupId: acme })).toEqual({
        allowed: false,
        reason: 'wrong_portal',
      });
      expect(decide(candidate(), { capability: 'document:read_own', startupId: 'any' })).toEqual({
        allowed: false,
        reason: 'wrong_portal',
      });
      // Unscoped, it is their own paperwork and is allowed.
      expect(can(candidate(), { capability: 'document:read_own' })).toBe(true);
    });

    it('cannot see pools, allocations or anyone else’s data', () => {
      for (const capability of [
        'candidate:read_all',
        'candidate:read_pool',
        'allocation:read_all',
        'position:read_all',
        'selection:read_all',
        'report:read',
      ] as const) {
        expect(can(candidate(), { capability })).toBe(false);
      }
    });
  });
});
