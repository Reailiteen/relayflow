import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import { DEV_ACTORS, createFixtureRepositories, createStore } from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { Actor } from '@relayflow/access';
import { REMINDER_RULES } from '@relayflow/entities';
import type { UseCaseContext } from '../context';
import {
  getNotificationPreferences,
  listReminderRules,
  updateNotificationPreference,
  updateReminderRule,
} from './settings';

const contextFor = (actor: Actor, store = createStore()): UseCaseContext => ({
  actor,
  repos: createFixtureRepositories(store),
  clock: fixedClock('2026-03-16T09:00:00.000Z'),
  logger: silentLogger,
});

describe('reminder settings', () => {
  describe('who may configure', () => {
    it('lets a programme manager change a rule', async () => {
      const ctx = contextFor(DEV_ACTORS.manager());

      const saved = await updateReminderRule(ctx, {
        ruleKey: 'pool-untouched',
        cycleId: null,
        enabled: false,
        preferredChannels: ['email'],
        mandatory: false,
        urgent: false,
        escalationAfterHours: 24,
      });

      expect(saved.ok).toBe(true);
    });

    /**
     * Operations runs the programme day to day and cannot reshape what it says
     * to everybody — the same line drawn around cycle setup and allocation
     * overrides.
     */
    it('refuses operations, who may read the rules but not change them', async () => {
      const ctx = contextFor(DEV_ACTORS.operations());

      const listed = await listReminderRules(ctx, { cycleId: null });
      expect(listed.ok).toBe(true);

      const saved = await updateReminderRule(ctx, {
        ruleKey: 'pool-untouched',
        cycleId: null,
        enabled: false,
        preferredChannels: [],
        mandatory: false,
        urgent: false,
        escalationAfterHours: null,
      });
      expect(saved.ok).toBe(false);
      if (!saved.ok) expect(saved.error.code).toBe('forbidden');
    });

    it('refuses a startup owner entirely', async () => {
      const ctx = contextFor(DEV_ACTORS.startupOwner());
      const listed = await listReminderRules(ctx, { cycleId: null });
      expect(listed.ok).toBe(false);
      if (!listed.ok) expect(listed.error.code).toBe('forbidden');
    });
  });

  describe('what a rule shows before anybody has configured it', () => {
    it('lists every code-owned rule, running on its defaults', async () => {
      const ctx = contextFor(DEV_ACTORS.manager());
      const listed = await listReminderRules(ctx, { cycleId: null });

      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data).toHaveLength(REMINDER_RULES.length);
      expect(listed.data.every((view) => view.usingDefaults)).toBe(true);

      // The one that costs money is unmutable out of the box. A startup that
      // could opt out of being told its funding is about to be reclaimed would
      // be opting out of the warning, not the reclaim.
      const atRisk = listed.data.find((view) => view.rule.key === 'hours-at-risk');
      expect(atRisk?.effective.mandatory).toBe(true);
      expect(atRisk?.effective.escalationAfterHours).toBe(48);
    });

    it('marks a cycle row as overriding the global one', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);
      const cycleId = store.cycles[0]?.id;

      await updateReminderRule(ctx, {
        ruleKey: 'positions-not-submitted',
        cycleId: null,
        enabled: true,
        scheduleOffsetHours: -72,
        preferredChannels: ['email'],
        mandatory: false,
        urgent: false,
        escalationAfterHours: 48,
      });
      await updateReminderRule(ctx, {
        ruleKey: 'positions-not-submitted',
        cycleId,
        enabled: false,
        scheduleOffsetHours: -24,
        preferredChannels: [],
        mandatory: false,
        urgent: false,
        escalationAfterHours: null,
      });

      const listed = await listReminderRules(ctx, { cycleId });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;

      const view = listed.data.find((row) => row.rule.key === 'positions-not-submitted');
      // Cycle beats global beats code — the same precedence `reminder_settings`
      // applies in SQL.
      expect(view?.overriddenForCycle).toBe(true);
      expect(view?.effective.enabled).toBe(false);
      expect(view?.effective.scheduleOffsetHours).toBe(-24);
    });
  });

  describe('what a rule may not be configured to do', () => {
    it('refuses in-app as a preference, because it is not optional', async () => {
      const ctx = contextFor(DEV_ACTORS.manager());
      const saved = await updateReminderRule(ctx, {
        ruleKey: 'pool-untouched',
        cycleId: null,
        enabled: true,
        preferredChannels: ['in_app', 'email'],
        mandatory: false,
        urgent: false,
        escalationAfterHours: null,
      });

      expect(saved.ok).toBe(false);
      if (!saved.ok) expect(saved.error.code).toBe('validation');
    });

    it('refuses a timing offset on a rule that is not anchored to a deadline', async () => {
      const ctx = contextFor(DEV_ACTORS.manager());
      const saved = await updateReminderRule(ctx, {
        ruleKey: 'hours-at-risk',
        cycleId: null,
        enabled: true,
        // `hours-at-risk` fires when the condition becomes true. An offset here
        // is a number somebody would set and watch do nothing.
        scheduleOffsetHours: -48,
        preferredChannels: ['email'],
        mandatory: true,
        urgent: false,
        escalationAfterHours: 48,
      });

      expect(saved.ok).toBe(false);
      if (!saved.ok) expect(saved.error.code).toBe('validation');
    });

    it('always stores in-app as required, whatever was submitted', async () => {
      const store = createStore();
      const ctx = contextFor(DEV_ACTORS.manager(), store);

      const saved = await updateReminderRule(ctx, {
        ruleKey: 'pool-untouched',
        cycleId: null,
        enabled: true,
        preferredChannels: [],
        mandatory: false,
        urgent: false,
        escalationAfterHours: null,
      });

      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      expect(saved.data.requiredChannels).toEqual(['in_app']);
    });
  });
});

describe('notification preferences', () => {
  it('gives everybody a full grid, defaulting to on', async () => {
    const ctx = contextFor(DEV_ACTORS.candidate());
    const rows = await getNotificationPreferences(ctx, {});

    expect(rows.ok).toBe(true);
    if (!rows.ok) return;
    // Six categories, four channels. Built from the product rather than from
    // whatever happens to have been saved, because a missing row means "use the
    // default" rather than "no opinion recorded".
    expect(rows.data).toHaveLength(6);
    expect(rows.data.every((row) => row.channels.length === 4)).toBe(true);
    expect(rows.data.every((row) => row.channels.every((cell) => cell.enabled))).toBe(true);
  });

  it('marks in-app and deadline cells as locked', async () => {
    const ctx = contextFor(DEV_ACTORS.startupOwner());
    const rows = await getNotificationPreferences(ctx, {});
    expect(rows.ok).toBe(true);
    if (!rows.ok) return;

    const deadline = rows.data.find((row) => row.category === 'deadline');
    expect(deadline?.channels.every((cell) => !cell.mutable)).toBe(true);

    const candidate = rows.data.find((row) => row.category === 'candidate');
    expect(candidate?.channels.find((cell) => cell.channel === 'in_app')?.mutable).toBe(false);
    expect(candidate?.channels.find((cell) => cell.channel === 'email')?.mutable).toBe(true);
  });

  it('saves a mutable choice and reads it back', async () => {
    const store = createStore();
    const ctx = contextFor(DEV_ACTORS.candidate(), store);

    const saved = await updateNotificationPreference(ctx, {
      category: 'candidate',
      channel: 'email',
      enabled: false,
    });
    expect(saved.ok).toBe(true);

    const rows = await getNotificationPreferences(ctx, {});
    expect(rows.ok).toBe(true);
    if (!rows.ok) return;
    const cell = rows.data
      .find((row) => row.category === 'candidate')
      ?.channels.find((row) => row.channel === 'email');
    expect(cell?.enabled).toBe(false);
  });

  /**
   * A Server Action is reachable by direct POST, so a toggle the UI drew as
   * locked is a toggle somebody can still submit. Both of these have to be
   * refused on the server, not merely disabled in the browser.
   */
  it('refuses turning the in-app record off', async () => {
    const ctx = contextFor(DEV_ACTORS.candidate());
    const saved = await updateNotificationPreference(ctx, {
      category: 'candidate',
      channel: 'in_app',
      enabled: false,
    });

    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.error.code).toBe('validation');
  });

  it('refuses muting deadline notices', async () => {
    const ctx = contextFor(DEV_ACTORS.startupOwner());
    const saved = await updateNotificationPreference(ctx, {
      category: 'deadline',
      channel: 'email',
      enabled: false,
    });

    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.error.code).toBe('validation');
  });

  it('keeps one person’s preferences out of another’s', async () => {
    const store = createStore();
    const candidate = contextFor(DEV_ACTORS.candidate(), store);
    const owner = contextFor(DEV_ACTORS.startupOwner(), store);

    await updateNotificationPreference(candidate, {
      category: 'candidate',
      channel: 'email',
      enabled: false,
    });

    const theirs = await getNotificationPreferences(owner, {});
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;
    const cell = theirs.data
      .find((row) => row.category === 'candidate')
      ?.channels.find((row) => row.channel === 'email');
    expect(cell?.enabled).toBe(true);
  });
});
