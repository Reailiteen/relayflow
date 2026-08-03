import { err, ok } from '@relayflow/core';
import {
  notificationPreferenceEntity,
  reminderRuleConfigurationEntity,
} from '@relayflow/entities';
import type { NotificationPreferencePort, ReminderRulePort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { fromPostgrest } from '../errors';
import { run, runSingle } from '../repository';

/**
 * Reminder configuration, and each person's own channel choices.
 *
 * Both tables were created in 0011 with correct RLS and never read or written
 * by anything. The policies already say what these repositories may do —
 * `reminder_rule_configurations` is `has_qstp_role('program_manager')` to
 * write, preferences are `user_id = auth.uid()` — so both are plain PostgREST.
 * No functions, because neither touches a second table.
 */

export function reminderRulesRepository(client: RlsClient): ReminderRulePort {
  return {
    /**
     * The global rows plus one cycle's overrides.
     *
     * Both, not one or the other: the screen shows what a rule is doing here
     * *and* whether that differs from the default, and "this cycle overrides
     * the global setting" is the single most useful thing it can say.
     */
    listConfigurations: (cycleId) => {
      const query = client.from('reminder_rule_configurations').select('*');
      return run(
        cycleId === null
          ? query.is('cycle_id', null)
          : query.or(`cycle_id.is.null,cycle_id.eq.${cycleId}`),
        reminderRuleConfigurationEntity.parseMany,
        { table: 'reminder_rule_configurations', cycleId },
      );
    },

    /**
     * Upsert on the natural key.
     *
     * `in_app` is added to the required set here rather than trusted from the
     * caller. It is the durable record, the table has a CHECK insisting on it,
     * and a request that omitted it would fail at the constraint with a message
     * about an array — which tells whoever is reading the log nothing.
     */
    saveConfiguration: (input) =>
      runSingle(
        client
          .from('reminder_rule_configurations')
          .upsert(
            {
              rule_key: input.ruleKey,
              cycle_id: input.cycleId,
              enabled: input.enabled,
              schedule_offset_hours: input.scheduleOffsetHours,
              required_channels: ['in_app'],
              preferred_channels: [...input.preferredChannels],
              mandatory: input.mandatory,
              urgent: input.urgent,
              escalation_after_hours: input.escalationAfterHours,
              updated_by: input.updatedBy,
            },
            {
              // Two partial unique indexes, one for global rows and one for
              // cycle rows, so the conflict target differs by which we are
              // writing. PostgREST needs to be told which.
              onConflict: input.cycleId === null ? 'rule_key' : 'rule_key,cycle_id',
            },
          )
          .select('*')
          .single(),
        reminderRuleConfigurationEntity.parse,
        { table: 'reminder_rule_configurations', ruleKey: input.ruleKey },
      ),
  };
}

export function notificationPreferencesRepository(
  client: RlsClient,
): NotificationPreferencePort {
  return {
    listForUser: (userId) =>
      run(
        client.from('notification_preferences').select('*').eq('user_id', userId),
        notificationPreferenceEntity.parseMany,
        { table: 'notification_preferences', userId },
      ),

    // A missing row means "use the channel default", which `fanout_reminder_step`
    // reads as enabled. So this only ever writes a deliberate choice, and the
    // absence of a row is itself meaningful.
    savePreference: (userId, input) =>
      runSingle(
        client
          .from('notification_preferences')
          .upsert(
            {
              user_id: userId,
              category: input.category,
              channel: input.channel,
              enabled: input.enabled,
            },
            { onConflict: 'user_id,category,channel' },
          )
          .select('*')
          .single(),
        notificationPreferenceEntity.parse,
        { table: 'notification_preferences', userId },
      ),

    registerPushToken: async (userId, token, platform) => {
      const { error } = await client
        .from('push_tokens')
        .upsert({ user_id: userId, token, platform }, { onConflict: 'token' });
      if (error) return err(fromPostgrest(error, { table: 'push_tokens', userId }));
      return ok(undefined);
    },

    /**
     * Removing matters as much as adding.
     *
     * A token for an uninstalled app bounces on every send, forever, and the
     * worker already harvests `DeviceNotRegistered` for that reason. This is
     * the other path: somebody signing out on a device they are handing on.
     */
    removePushToken: async (userId, token) => {
      const { error } = await client
        .from('push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token', token);
      if (error) return err(fromPostgrest(error, { table: 'push_tokens', userId }));
      return ok(undefined);
    },
  };
}
