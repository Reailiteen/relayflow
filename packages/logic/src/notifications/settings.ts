import { z } from 'zod';
import { err, ok, validation } from '@relayflow/core';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  REMINDER_RULES,
  cycleId,
  defaultConfiguration,
  isMutable,
  updatePreferenceInput,
  updateReminderRuleInput,
  type NotificationCategory,
  type NotificationChannel,
  type ReminderRuleConfiguration,
  type ReminderRuleDefinition,
} from '@relayflow/entities';
import { AUTHENTICATED, defineUseCase, requireActor } from '../use-case';

/**
 * Configuring what the system says, and how each person hears it.
 *
 * Two audiences with two different shapes of authority, which is why they are
 * two use-case groups rather than one settings screen:
 *
 *   **QSTP** configures the rules — timing, reach, channel policy, urgency —
 *   for everybody. That is programme-shaping, so it is gated on
 *   `reminder:configure`, which only a programme manager holds.
 *
 *   **Everyone** configures their own channels. That is self-scoped, so it is
 *   `AUTHENTICATED` and the recipient comes from the actor, exactly like the
 *   inbox use-cases next door. There is no capability that would be right: a
 *   viewer, a supervisor and a candidate all have preferences and none of them
 *   may read anyone else's.
 */

// ---------------------------------------------------------------------------
// Rules — QSTP
// ---------------------------------------------------------------------------

export interface ReminderRuleView {
  readonly rule: ReminderRuleDefinition;
  /** What this rule is actually running with, defaults filled in. */
  readonly effective: ReminderRuleConfiguration;
  /**
   * True when a cycle-specific row is overriding the global setting.
   *
   * Worth its own field rather than left to be inferred: "this cycle is
   * different" is the first thing somebody debugging a missing reminder needs
   * to know, and it is invisible if the screen only shows effective values.
   */
  readonly overriddenForCycle: boolean;
  /** True when nobody has ever configured it — it is on the code defaults. */
  readonly usingDefaults: boolean;
}

export const listReminderRules = defineUseCase({
  name: 'reminders.listRules',
  input: z.object({ cycleId: cycleId.nullable().default(null) }),
  authorize: { capability: 'reminder:read' as const },

  execute: async (ctx, input) => {
    const stored = await ctx.repos.reminderRules.listConfigurations(input.cycleId);
    if (!stored.ok) return stored;

    const views: ReminderRuleView[] = REMINDER_RULES.map((rule) => {
      const forCycle =
        input.cycleId === null
          ? undefined
          : stored.data.find((row) => row.ruleKey === rule.key && row.cycleId === input.cycleId);
      const global = stored.data.find((row) => row.ruleKey === rule.key && row.cycleId === null);

      // Cycle beats global beats code, which is the same precedence
      // `reminder_settings` applies in SQL. Said twice, in two languages, and
      // asserted in the schema tests so the two cannot drift.
      const effective = forCycle ?? global ?? defaultConfiguration(rule);

      return {
        rule,
        effective,
        overriddenForCycle: forCycle !== undefined,
        usingDefaults: forCycle === undefined && global === undefined,
      };
    });

    return ok(views);
  },
});

export const updateReminderRule = defineUseCase({
  name: 'reminders.updateRule',
  input: updateReminderRuleInput,
  authorize: { capability: 'reminder:configure' as const },

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const saved = await ctx.repos.reminderRules.saveConfiguration({
      ...input,
      updatedBy: actor.data.userId,
      occurredAt: ctx.clock.now().toISOString(),
    });
    if (!saved.ok) return saved;

    // Worth an audit line of its own. Turning off "hours at risk" is a decision
    // whose consequence is a startup losing funding without being warned, and
    // six months later somebody will ask who did it.
    ctx.logger.info('reminder rule configured', {
      ruleKey: input.ruleKey,
      cycleId: input.cycleId,
      enabled: input.enabled,
      actorId: actor.data.userId,
    });

    return ok(saved.data);
  },
});

// ---------------------------------------------------------------------------
// Preferences — everyone
// ---------------------------------------------------------------------------

export interface PreferenceCell {
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
  /**
   * False when the toggle must render as locked.
   *
   * In-app is the durable record and deadline notices carry consequences a
   * person cannot opt out of having. Rendering those as ordinary switches that
   * silently do nothing is worse than not rendering them: it teaches people
   * their settings are ignored.
   */
  readonly mutable: boolean;
}

export interface PreferenceRow {
  readonly category: NotificationCategory;
  readonly channels: readonly PreferenceCell[];
}

export const getNotificationPreferences = defineUseCase({
  name: 'notifications.preferences',
  input: z.object({}),
  authorize: AUTHENTICATED,

  execute: async (ctx) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const stored = await ctx.repos.notificationPreferences.listForUser(actor.data.userId);
    if (!stored.ok) return stored;

    // A missing row means "use the channel default", which the fan-out reads as
    // enabled. So the grid is built from the full category × channel product
    // and stored rows are laid over it, rather than listing what happens to
    // have been saved.
    const rows: PreferenceRow[] = NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      channels: NOTIFICATION_CHANNELS.map((channel) => ({
        channel,
        enabled:
          stored.data.find((row) => row.category === category && row.channel === channel)
            ?.enabled ?? true,
        mutable: isMutable(category, channel),
      })),
    }));

    return ok(rows);
  },
});

export const updateNotificationPreference = defineUseCase({
  name: 'notifications.updatePreference',
  input: updatePreferenceInput,
  authorize: AUTHENTICATED,

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    // Re-checked here, not only in the schema and not only in the switch that
    // renders disabled. A Server Action is reachable by direct POST, so a
    // toggle the UI drew as locked is a toggle somebody can still submit.
    if (!isMutable(input.category, input.channel) && !input.enabled) {
      return err(
        validation(
          input.channel === 'in_app'
            ? 'In-app notifications are the durable record and cannot be turned off.'
            : 'Deadline notices carry consequences and cannot be muted.',
          { context: { category: input.category, channel: input.channel } },
        ),
      );
    }

    return ctx.repos.notificationPreferences.savePreference(actor.data.userId, input);
  },
});

export const registerPushToken = defineUseCase({
  name: 'notifications.registerPushToken',
  input: z.object({
    token: z.string().trim().min(10).max(300),
    platform: z.enum(['ios', 'android', 'web']),
  }),
  authorize: AUTHENTICATED,

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    return ctx.repos.notificationPreferences.registerPushToken(
      actor.data.userId,
      input.token,
      input.platform,
    );
  },
});

export const removePushToken = defineUseCase({
  name: 'notifications.removePushToken',
  input: z.object({ token: z.string().trim().min(10).max(300) }),
  authorize: AUTHENTICATED,

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;
    return ctx.repos.notificationPreferences.removePushToken(actor.data.userId, input.token);
  },
});
