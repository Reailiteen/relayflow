import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REMINDER_RULES, defaultConfiguration, isMutable, reminderRule } from './reminder-rule';

/**
 * The rule catalogue exists twice — here, and in `reminder_rule_keys()` in
 * supabase/migrations/0015_reminder_rules.sql — because a settings screen has
 * to explain a rule to somebody deciding whether to turn it off, and SQL is not
 * where you write that explanation.
 *
 * Two lists is a drift risk, so this reads the migration and compares. A rule
 * added to one and not the other fails here and in the schema suite, rather
 * than shipping a settings row for a rule nothing evaluates.
 */
const MIGRATION = new URL(
  '../../../../supabase/migrations/0015_reminder_rules.sql',
  import.meta.url,
);

function sqlRuleKeys(): string[] {
  const source = readFileSync(MIGRATION, 'utf8');
  const start = source.indexOf('create or replace function reminder_rule_keys()');
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf('$$;', start));
  return [...body.matchAll(/'([a-z-]+)'/g)].map((match) => match[1] as string);
}

describe('the reminder rule catalogue', () => {
  it('matches the keys the migration knows about', () => {
    expect([...REMINDER_RULES.map((rule) => rule.key)].sort()).toEqual(sqlRuleKeys().sort());
  });

  it('has no duplicate keys', () => {
    const keys = REMINDER_RULES.map((rule) => rule.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('offers a timing control only where timing means something', () => {
    for (const rule of REMINDER_RULES) {
      // A state or event rule fires when its condition becomes true. An offset
      // on one would be a control somebody sets, saves, and watches do nothing.
      if (rule.trigger !== 'schedule') expect(rule.usesScheduleOffset).toBe(false);
    }
  });

  it('describes every rule in words somebody could act on', () => {
    for (const rule of REMINDER_RULES) {
      expect(rule.name.length).toBeGreaterThan(3);
      expect(rule.description.length).toBeGreaterThan(20);
      expect(rule.audience.length).toBeGreaterThan(3);
    }
  });

  it('throws rather than guessing on an unknown key', () => {
    expect(() => reminderRule('nonsense' as never)).toThrow();
  });
});

describe('defaults', () => {
  it('always requires in-app, because it is the record', () => {
    for (const rule of REMINDER_RULES) {
      expect(defaultConfiguration(rule).requiredChannels).toContain('in_app');
    }
  });

  it('makes the one that costs money unmutable', () => {
    // A startup that could opt out of being told its funding is about to be
    // reclaimed would be opting out of the warning, not the reclaim.
    expect(defaultConfiguration(reminderRule('hours-at-risk')).mandatory).toBe(true);
  });

  it('carries each rule’s escalation delay through to its configuration', () => {
    for (const rule of REMINDER_RULES) {
      expect(defaultConfiguration(rule).escalationAfterHours).toBe(rule.defaultEscalationHours);
    }
  });
});

describe('what a person may switch off', () => {
  it('never lets the in-app record be muted', () => {
    expect(isMutable('candidate', 'in_app')).toBe(false);
    expect(isMutable('system', 'in_app')).toBe(false);
  });

  it('never lets a deadline notice be muted on any channel', () => {
    expect(isMutable('deadline', 'email')).toBe(false);
    expect(isMutable('deadline', 'slack')).toBe(false);
  });

  it('lets everything else be a preference', () => {
    expect(isMutable('candidate', 'email')).toBe(true);
    expect(isMutable('onboarding', 'push')).toBe(true);
  });
});
