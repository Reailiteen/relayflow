import { z } from 'zod';
import { auditColumns, defineEntity } from '../shared/entity';
import { cycleId, userId, type CycleId, type UserId } from '../shared/ids';
import { NOTIFICATION_CHANNELS, notificationCategory, notificationChannel } from './notification';
import type { NotificationCategory, NotificationChannel } from './notification';

/**
 * What QSTP may change about a reminder, and what it may not.
 *
 * Rules are code-owned. The predicate — "which startups have not submitted
 * positions" — lives in SQL, next to the tables it reads, and there is no
 * screen through which anyone can invent a new one. What a settings screen can
 * safely offer is timing, audience reach, channel policy and urgency: the
 * things whose worst outcome is a message arriving at an unhelpful moment,
 * rather than a message about something the system cannot actually detect.
 *
 * That boundary is the whole design of this file. Everything here is a knob on
 * an existing rule; nothing here composes one.
 */

/** The code-owned catalogue. A key not in this list has no evaluator. */
export const REMINDER_RULE_KEYS = [
  'positions-not-submitted',
  'selection-deadline-approaching',
  'hours-at-risk',
  'exception-awaiting-decision',
  'documents-awaiting-verification',
  'candidate-availability-unknown',
  'pool-untouched',
  'candidate-conflict-raised',
] as const;

export const reminderRuleKey = z.enum(REMINDER_RULE_KEYS);
export type ReminderRuleKey = (typeof REMINDER_RULE_KEYS)[number];

export type ReminderTriggerKind = 'schedule' | 'state' | 'event';

export interface ReminderRuleDefinition {
  readonly key: ReminderRuleKey;
  readonly name: string;
  /** What it watches for, in the words of somebody who has to configure it. */
  readonly description: string;
  readonly trigger: ReminderTriggerKind;
  readonly category: NotificationCategory;
  /** Who hears about it, for the settings screen to render as read-only. */
  readonly audience: string;
  /** Null when the rule does not escalate; most do not. */
  readonly defaultEscalationHours: number | null;
  /**
   * Whether the timing offset means anything for this rule.
   *
   * A `state` rule fires when a condition becomes true, not at a fixed distance
   * from a date, so an offset field on its settings row would be a control that
   * does nothing — which is worse than no control at all.
   */
  readonly usesScheduleOffset: boolean;
}

/**
 * The catalogue, as the settings screen sees it.
 *
 * Kept beside the SQL rather than derived from it because a settings screen has
 * to explain a rule to somebody deciding whether to turn it off, and a function
 * name does not explain anything. The keys are asserted against the SQL in the
 * schema tests, so the two cannot drift silently.
 */
export const REMINDER_RULES: readonly ReminderRuleDefinition[] = [
  {
    key: 'positions-not-submitted',
    name: 'Positions not submitted',
    description:
      'A funded startup has not submitted any positions as its submission deadline approaches.',
    trigger: 'schedule',
    category: 'deadline',
    audience: 'That startup’s owners and members',
    defaultEscalationHours: 48,
    usesScheduleOffset: true,
  },
  {
    key: 'selection-deadline-approaching',
    name: 'Selection closing',
    description: 'A funded startup has claimed no candidates and selection is about to close.',
    trigger: 'schedule',
    category: 'deadline',
    audience: 'That startup’s owners and members',
    defaultEscalationHours: null,
    usesScheduleOffset: true,
  },
  {
    key: 'hours-at-risk',
    name: 'Hours at risk',
    description:
      'Allocated hours are unspent past the selection deadline with no approved extension, ' +
      'and can be reclaimed.',
    trigger: 'state',
    category: 'deadline',
    audience: 'That startup, escalating to QSTP',
    defaultEscalationHours: 48,
    usesScheduleOffset: false,
  },
  {
    key: 'exception-awaiting-decision',
    name: 'Exception awaiting decision',
    description: 'An extension request has been pending for more than a day.',
    trigger: 'state',
    category: 'exception',
    audience: 'QSTP operations',
    defaultEscalationHours: null,
    usesScheduleOffset: false,
  },
  {
    key: 'documents-awaiting-verification',
    name: 'Documents awaiting verification',
    description: 'Submitted documents have been waiting more than a day to be checked.',
    trigger: 'state',
    category: 'onboarding',
    audience: 'QSTP operations',
    defaultEscalationHours: null,
    usesScheduleOffset: false,
  },
  {
    key: 'candidate-availability-unknown',
    name: 'Candidate availability unknown',
    description:
      'A candidate in an active pool has not confirmed whether they are still available.',
    trigger: 'state',
    category: 'candidate',
    audience: 'The candidate',
    defaultEscalationHours: null,
    usesScheduleOffset: false,
  },
  {
    key: 'pool-untouched',
    name: 'Pool untouched',
    description: 'Candidates shared more than five days ago have not been reviewed.',
    trigger: 'state',
    category: 'candidate',
    audience: 'That startup, escalating to QSTP',
    defaultEscalationHours: 72,
    usesScheduleOffset: false,
  },
  {
    key: 'candidate-conflict-raised',
    name: 'Candidate conflict raised',
    description: 'Two startups have claimed the same candidate and QSTP has to decide.',
    trigger: 'event',
    category: 'selection',
    audience: 'QSTP operations',
    defaultEscalationHours: null,
    usesScheduleOffset: false,
  },
];

export function reminderRule(key: ReminderRuleKey): ReminderRuleDefinition {
  const rule = REMINDER_RULES.find((row) => row.key === key);
  if (!rule) throw new Error(`Unknown reminder rule: ${key}`);
  return rule;
}

export interface ReminderRuleConfiguration {
  readonly ruleKey: ReminderRuleKey;
  /** Null for the global default; set for a cycle-specific override. */
  readonly cycleId: CycleId | null;
  readonly enabled: boolean;
  readonly scheduleOffsetHours: number | null;
  readonly requiredChannels: readonly NotificationChannel[];
  readonly preferredChannels: readonly NotificationChannel[];
  /** Recipients cannot mute this one. */
  readonly mandatory: boolean;
  /** Bypasses digesting. */
  readonly urgent: boolean;
  readonly escalationAfterHours: number | null;
  readonly updatedBy: UserId | null;
  readonly updatedAt: string | null;
}

const channels = z.array(notificationChannel);

export const reminderRuleConfigurationRow = z.object({
  rule_key: reminderRuleKey,
  cycle_id: cycleId.nullable(),
  enabled: z.boolean(),
  schedule_offset_hours: z.number().int().nullable(),
  required_channels: channels,
  preferred_channels: channels,
  mandatory: z.boolean(),
  urgent: z.boolean(),
  escalation_after_hours: z.number().int().nullable(),
  updated_by: userId,
  ...auditColumns,
});

export const reminderRuleConfigurationEntity = defineEntity({
  name: 'ReminderRuleConfiguration',
  row: reminderRuleConfigurationRow,
  toDomain: (row): ReminderRuleConfiguration => ({
    ruleKey: row.rule_key,
    cycleId: row.cycle_id,
    enabled: row.enabled,
    scheduleOffsetHours: row.schedule_offset_hours,
    requiredChannels: row.required_channels,
    preferredChannels: row.preferred_channels,
    mandatory: row.mandatory,
    urgent: row.urgent,
    escalationAfterHours: row.escalation_after_hours,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }),
});

/** A rule nobody has configured, shown as the defaults it is actually running. */
export function defaultConfiguration(rule: ReminderRuleDefinition): ReminderRuleConfiguration {
  return {
    ruleKey: rule.key,
    cycleId: null,
    enabled: true,
    scheduleOffsetHours: rule.usesScheduleOffset ? -72 : null,
    requiredChannels: ['in_app'],
    preferredChannels: ['email'],
    mandatory: rule.key === 'hours-at-risk',
    urgent: rule.key === 'candidate-conflict-raised',
    escalationAfterHours: rule.defaultEscalationHours,
    updatedBy: null,
    updatedAt: null,
  };
}

/**
 * The change a settings screen may submit.
 *
 * `in_app` is forced into the required set rather than validated out of it. It
 * is the durable record — the row a recipient can open, mark read and argue
 * with — and a rule configured to skip it would deliver only to channels that
 * bounce, leaving nothing behind to show anyone was told.
 */
export const updateReminderRuleInput = z
  .object({
    ruleKey: reminderRuleKey,
    cycleId: cycleId.nullable().default(null),
    enabled: z.boolean(),
    scheduleOffsetHours: z.number().int().min(-720).max(0).nullable().default(null),
    preferredChannels: z.array(notificationChannel).max(NOTIFICATION_CHANNELS.length),
    mandatory: z.boolean(),
    urgent: z.boolean(),
    escalationAfterHours: z.number().int().min(1).max(720).nullable().default(null),
  })
  .refine((input) => !input.preferredChannels.includes('in_app'), {
    message: 'In-app delivery is always on and cannot be listed as a preference.',
    path: ['preferredChannels'],
  })
  .refine(
    (input) => input.scheduleOffsetHours === null || reminderRule(input.ruleKey).usesScheduleOffset,
    {
      // A state rule fires when its condition becomes true. An offset would be
      // a number somebody set, saved, and watched do nothing.
      message: 'This rule is not anchored to a deadline, so a timing offset does nothing.',
      path: ['scheduleOffsetHours'],
    },
  );

export type UpdateReminderRuleInput = z.infer<typeof updateReminderRuleInput>;

/**
 * One person's channel choices.
 *
 * Per category and channel rather than per rule: a settings screen with one row
 * for each of eight rules times four channels is a screen nobody configures.
 * Categories are the unit people actually think in — "deadlines by email, the
 * rest in-app only".
 */
export interface NotificationPreference {
  readonly category: NotificationCategory;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
}

export const notificationPreferenceRow = z.object({
  category: notificationCategory,
  channel: notificationChannel,
  enabled: z.boolean(),
});

export const notificationPreferenceEntity = defineEntity({
  name: 'NotificationPreference',
  row: notificationPreferenceRow,
  toDomain: (row): NotificationPreference => ({
    category: row.category,
    channel: row.channel,
    enabled: row.enabled,
  }),
});

export const updatePreferenceInput = z
  .object({
    category: notificationCategory,
    channel: notificationChannel,
    enabled: z.boolean(),
  })
  .refine((input) => input.channel !== 'in_app' || input.enabled, {
    // The in-app row is the record that the person was told. Letting someone
    // switch it off would let them switch off the evidence.
    message: 'In-app notifications are the durable record and cannot be turned off.',
    path: ['channel'],
  });

export type UpdatePreferenceInput = z.infer<typeof updatePreferenceInput>;

/**
 * Whether a channel is actually in play for a category, for rendering.
 *
 * A muted preference does not stop a `mandatory` rule, and the settings screen
 * has to say so rather than showing a toggle that quietly does nothing on the
 * one message that matters most.
 */
export function isMutable(
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  if (channel === 'in_app') return false;
  // Deadline notices carry consequences a person cannot opt out of having.
  return category !== 'deadline';
}
