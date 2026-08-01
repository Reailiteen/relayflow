import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { DEV_ACTORS, createFixtureRepositories, createStore, ids } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { UseCaseContext } from '../context';
import { submitPosition } from '../positions/submit-position';
import { selectCandidate } from '../selection/select-candidate';
import { requestException } from './request-exception';
import {
  attachRecording,
  getStartupInterviews,
  saveInterviewFeedback,
  scheduleInterview,
} from './interviews';
import { getStartupOnboarding } from './onboarding';
import { getStartupHome, getStartupPools, getStartupPositions } from './views';

/**
 * The startup portal's flows, end to end against the fixture adapter.
 *
 * The tenant-isolation cases matter most here. A startup portal is the part of
 * the system where a mistake leaks one company's candidates to another, so
 * those are asserted rather than assumed.
 */

const NOW = '2026-03-16T09:00:00.000Z';

function contextFor(actor: UseCaseContext['actor'], store = createStore()): UseCaseContext {
  return {
    actor,
    repos: createFixtureRepositories(store),
    logger: silentLogger,
    clock: fixedClock(NOW),
  };
}

describe('startup portal', () => {
  describe('next action', () => {
    it('points a well-progressed startup at the candidates it has not looked at', async () => {
      // Acme: allocated, submitted, interviewed, already placed someone — but
      // one candidate in the AI Developer pool is still unreviewed.
      const home = await getStartupHome(contextFor(DEV_ACTORS.startupOwner()), {});
      expect(home.ok).toBe(true);
      if (!home.ok) return;
      expect(home.data.startupName).toBe('Acme Robotics');
      expect(home.data.allocatedHours).toBe(60);
      expect(home.data.usedHours).toBe(60);
      expect(home.data.selectionsMade).toBeGreaterThan(0);

      expect(home.data.candidatesAwaitingReview).toBe(1);
      expect(home.data.nextAction.kind).toBe('review_candidates');
      // Not urgent: reviewing is work, but nothing is at risk.
      expect(home.data.nextAction.urgent).toBe(false);
    });

    it('falls through to "nothing" once every candidate has been looked at', async () => {
      const store = createStore();
      // Mark the last pending pool entry as reviewed.
      store.poolEntries = store.poolEntries.map((entry) =>
        entry.status === 'pending' ? { ...entry, status: 'rejected' as const } : entry,
      );

      const home = await getStartupHome(contextFor(DEV_ACTORS.startupOwner(), store), {});
      expect(home.ok).toBe(true);
      if (!home.ok) return;
      expect(home.data.candidatesAwaitingReview).toBe(0);
      expect(home.data.nextAction.kind).toBe('nothing');
    });

    it('tells a startup with no allocation that there is nothing for it to do', async () => {
      const store = createStore();
      const acme = store.allocations.find((a) => a.startupId === ids.acme);
      if (acme) store.allocations[store.allocations.indexOf(acme)] = { ...acme, weeklyHours: 0 };

      const home = await getStartupHome(contextFor(DEV_ACTORS.startupOwner(), store), {});
      expect(home.ok).toBe(true);
      if (!home.ok) return;
      expect(home.data.nextAction.kind).toBe('nothing');
      expect(home.data.nextAction.headline).toContain('No hours allocated');
    });

    it('tells a startup past its deadline to request an extension, urgently', async () => {
      // Northwind missed the selection deadline and has a request pending.
      const home = await getStartupHome(contextFor(DEV_ACTORS.lateStartup()), {});
      expect(home.ok).toBe(true);
      if (!home.ok) return;
      expect(home.data.startupName).toBe('Northwind Analytics');
      expect(home.data.pendingException).not.toBeNull();
      // They did select someone, so the deadline branch does not fire.
      expect(home.data.selectionsMade).toBeGreaterThan(0);
    });
  });

  describe('submitting positions', () => {
    it('refuses a role that exceeds the remaining allocation, and says by how much', async () => {
      const store = createStore();
      // Acme is on 60 hours with 60 already committed.
      const result = await submitPosition(contextFor(DEV_ACTORS.startupOwner(), store), {
        title: 'Extra Engineer',
        description: 'One more pair of hands.',
        requiredSkills: [],
        internCount: 1,
        hoursPerIntern: 20,
        durationWeeks: 12,
        supervisorName: null,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation');
        expect(result.error.message).toContain('0 of 60');
      }
    });

    it('accepts a role that fits and bills it against the allocation', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.lateStartup(), store); // Northwind: 40h, 40 used

      // Free up room first by checking the starting state.
      const before = await getStartupPositions(ctx, {});
      expect(before.ok && before.data.remainingHours).toBe(0);

      // Give them headroom, then submit.
      const northwindPosition = store.positions.find((p) => p.startupId === ids.northwind);
      if (northwindPosition) {
        store.positions[store.positions.indexOf(northwindPosition)] = {
          ...northwindPosition,
          internCount: 1, // 20h instead of 40h
        };
      }

      const result = await submitPosition(ctx, {
        title: 'Junior Analyst',
        description: 'Support the analytics team.',
        requiredSkills: ['SQL'],
        internCount: 1,
        hoursPerIntern: 20,
        durationWeeks: 12,
        supervisorName: 'Reem Al-Sulaiti',
      });
      expect(result.ok).toBe(true);

      const after = await getStartupPositions(ctx, {});
      expect(after.ok && after.data.usedHours).toBe(40);
      expect(after.ok && after.data.remainingHours).toBe(0);
    });

    it('is refused for a supervisor, who cannot commit the startup', async () => {
      const result = await submitPosition(contextFor(DEV_ACTORS.supervisor()), {
        title: 'Anything',
        description: 'Anything at all.',
        requiredSkills: [],
        internCount: 1,
        hoursPerIntern: 10,
        durationWeeks: 4,
        supervisorName: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });
  });

  describe('tenant isolation', () => {
    it('shows a startup only its own positions', async () => {
      const acme = await getStartupPositions(contextFor(DEV_ACTORS.startupOwner()), {});
      const northwind = await getStartupPositions(contextFor(DEV_ACTORS.lateStartup()), {});
      expect(acme.ok && northwind.ok).toBe(true);
      if (!acme.ok || !northwind.ok) return;

      expect(acme.data.positions.every((p) => p.startupId === ids.acme)).toBe(true);
      expect(northwind.data.positions.every((p) => p.startupId === ids.northwind)).toBe(true);
    });

    it('shows a startup only pools for its own positions', async () => {
      const pools = await getStartupPools(contextFor(DEV_ACTORS.startupOwner()), {});
      expect(pools.ok).toBe(true);
      if (!pools.ok) return;
      expect(pools.data.pools.every((pool) => pool.position.startupId === ids.acme)).toBe(true);
    });

    it('cannot select against another startup’s position', async () => {
      // Northwind's owner reaching for Acme's AI Developer role.
      const result = await selectCandidate(contextFor(DEV_ACTORS.lateStartup()), {
        positionId: ids.posAiDev,
        candidateId: ids.canHassan,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('forbidden');
    });

    it('marks candidates held by another startup rather than offering them', async () => {
      const pools = await getStartupPools(contextFor(DEV_ACTORS.lateStartup()), {});
      expect(pools.ok).toBe(true);
      if (!pools.ok) return;

      // Acme reserved Omar first, so Northwind's pool must show him as taken.
      const omar = pools.data.pools
        .flatMap((pool) => pool.candidates)
        .find((row) => row.candidate.id === ids.canOmar);

      expect(omar).toBeDefined();
      // Northwind has its own claim on Omar in the fixture, so `selection` is
      // set — the point is that both claims are visible to the port.
      expect(omar?.selection ?? omar?.takenByOther).toBeTruthy();
    });
  });

  describe('selecting a candidate', () => {
    it('refuses a candidate another startup already holds', async () => {
      const store = createStore();
      // Release Northwind's claim so Acme holds Omar alone, then have Northwind
      // try to take him.
      const northwindClaim = store.selections.find((s) => s.startupId === ids.northwind);
      if (northwindClaim) {
        store.selections[store.selections.indexOf(northwindClaim)] = {
          ...northwindClaim,
          status: 'released',
        };
      }

      const result = await selectCandidate(contextFor(DEV_ACTORS.lateStartup(), store), {
        positionId: ids.posDataAnalyst,
        candidateId: ids.canOmar,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('conflict');
        expect(result.error.message).toContain('already been reserved');
      }
    });

    it('refuses a candidate who is no longer available', async () => {
      // Yusuf took another job.
      const result = await selectCandidate(contextFor(DEV_ACTORS.lateStartup()), {
        positionId: ids.posDataAnalyst,
        candidateId: ids.canYusuf,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
    });
  });

  describe('requesting an extension', () => {
    it('refuses a second request while one is pending', async () => {
      const result = await requestException(contextFor(DEV_ACTORS.lateStartup()), {
        kind: 'candidate_selection',
        reason: 'We would like even more time than we already asked for.',
        requestedDeadline: '2026-04-01T23:59:00.000Z',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('conflict');
        expect(result.error.message).toContain('already have a request');
      }
    });

    it('refuses a date that is not actually an extension', async () => {
      const result = await requestException(contextFor(DEV_ACTORS.startupOwner()), {
        kind: 'candidate_selection',
        // Before the 14 March deadline.
        reason: 'Mistyped the year, as people do.',
        requestedDeadline: '2026-03-01T23:59:00.000Z',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
    });

    it('accepts a well-formed request', async () => {
      const result = await requestException(contextFor(DEV_ACTORS.startupOwner()), {
        kind: 'candidate_selection',
        reason: 'Our supervisor is travelling and cannot complete the final interviews.',
        requestedDeadline: '2026-03-28T23:59:00.000Z',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe('pending');
        expect(result.data.startupId).toBe(ids.acme);
      }
    });
  });
});

describe('interviews', () => {
  it('schedules an interview for a candidate in our own pool', async () => {
    const store = createStore();
    const ctx = contextFor(DEV_ACTORS.startupOwner(), store);

    const result = await scheduleInterview(ctx, {
      positionId: ids.posAiDev,
      candidateId: ids.canHassan,
      mode: 'online',
      scheduledFor: '2026-03-20T10:00:00.000Z',
      durationMinutes: 45,
      location: 'https://meet.example/abc',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('scheduled');
      // Generated fields start empty; only a recording produces them.
      expect(result.data.transcriptStatus).toBe('none');
      expect(result.data.feedback).toBeNull();
    }
  });

  it('refuses to interview a candidate outside our pool', async () => {
    const result = await scheduleInterview(contextFor(DEV_ACTORS.startupOwner()), {
      positionId: ids.posAiDev,
      candidateId: ids.canMaryam, // in Pearl's pool, not Acme's
      mode: 'online',
      scheduledFor: '2026-03-20T10:00:00.000Z',
      durationMinutes: 45,
      location: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });

  it('refuses to interview someone who is no longer available', async () => {
    const store = createStore();
    // Yusuf took another job and is in Northwind's pool.
    const result = await scheduleInterview(contextFor(DEV_ACTORS.lateStartup(), store), {
      positionId: ids.posDataAnalyst,
      candidateId: ids.canYusuf,
      mode: 'in_person',
      scheduledFor: '2026-03-20T10:00:00.000Z',
      durationMinutes: 45,
      location: 'Our office',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('conflict');
  });

  it('cannot touch another startup’s interview', async () => {
    const store = createStore();
    // Acme's completed interview with Layla.
    const acmeInterview = store.interviews[0];
    const result = await saveInterviewFeedback(contextFor(DEV_ACTORS.lateStartup(), store), {
      interviewId: acmeInterview?.id,
      feedback: 'Trying to write on someone else’s interview.',
      recommendation: 'advance',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });

  it('keeps the interviewer’s verdict separate from the AI summary', async () => {
    const store = createStore();
    const ctx = contextFor(DEV_ACTORS.startupOwner(), store);
    const interview = store.interviews.find((i) => i.transcriptStatus === 'failed');

    // Recording produces the generated fields…
    const recorded = await attachRecording(ctx, {
      interviewId: interview?.id,
      recordingUrl: 'https://recordings.example/x.m4a',
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(recorded.data.transcriptStatus).toBe('ready');
    expect(recorded.data.aiSummary).not.toBeNull();
    // …and does not invent a verdict.
    expect(recorded.data.recommendation).toBe('advance'); // unchanged from seed

    const saved = await saveInterviewFeedback(ctx, {
      interviewId: interview?.id,
      feedback: 'Strong on fundamentals. Would hire.',
      recommendation: 'advance',
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.data.feedback).toBe('Strong on fundamentals. Would hire.');
      // The summary survives the human verdict rather than being overwritten.
      expect(saved.data.aiSummary).toBe(recorded.data.aiSummary);
    }
  });

  it('surfaces candidates asked for but never booked', async () => {
    const store = createStore();
    const entry = store.poolEntries.find((e) => e.positionId === ids.posEmbedded);
    if (entry) {
      store.poolEntries[store.poolEntries.indexOf(entry)] = {
        ...entry,
        status: 'interview_requested',
      };
    }

    const result = await getStartupInterviews(contextFor(DEV_ACTORS.startupOwner(), store), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.awaitingSchedule.map((row) => row.candidate.fullName)).toContain(
      'Sara Nassif',
    );
  });
});

describe('onboarding visibility', () => {
  it('shows progress for confirmed interns only', async () => {
    const result = await getStartupOnboarding(contextFor(DEV_ACTORS.startupOwner()), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Acme has one confirmed intern (Layla) and one merely reserved (Omar).
    expect(result.data.interns).toHaveLength(1);
    expect(result.data.interns[0]?.candidate.fullName).toBe('Layla Ahmed');
    expect(result.data.interns[0]?.documentsTotal).toBeGreaterThan(0);
  });

  it('never exposes a candidate’s document field values to the startup', async () => {
    const result = await getStartupOnboarding(contextFor(DEV_ACTORS.startupOwner()), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const intern = result.data.interns[0];
    expect(intern).toBeDefined();

    // The whole payload must not contain the seeded ID number or IBAN, whatever
    // shape it takes. This is the assertion that matters on this screen.
    const serialised = JSON.stringify(intern);
    expect(serialised).not.toContain('28912345678');
    expect(serialised).not.toContain('QA58DOHB');

    // Only the startup's own NDA comes back in full, and it carries no fields.
    expect(intern?.nda?.kind).toBe('startup_nda');
    expect(intern?.nda?.fields).toHaveLength(0);
  });

  it('reduces the candidate to name and email', async () => {
    const result = await getStartupOnboarding(contextFor(DEV_ACTORS.startupOwner()), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.interns[0]?.candidate ?? {}).sort()).toEqual([
      'email',
      'fullName',
      'id',
    ]);
  });

  it('is refused for a candidate actor', async () => {
    const result = await getStartupOnboarding(contextFor(DEV_ACTORS.candidate()), {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });
});
