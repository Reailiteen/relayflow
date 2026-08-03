import { err, ok } from '@relayflow/core';
import {
  activityEventEntity,
  notificationEntity,
  recoveryCaseEntity,
  redistributionRoundEntity,
} from '@relayflow/entities';
import type { ActivityPort, NotificationPort, RecoveryPort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { fromPostgrest } from '../errors';
import { run, runSingle } from '../repository';
import { callRpc } from '../transaction';

/** The audit log, recovered hours, and a person's own inbox. */

export function activityRepository(client: RlsClient): ActivityPort {
  return {
    /**
     * `actorId` and `actorRole` on the command are ignored.
     *
     * `append_activity` takes the actor from `auth.uid()` and derives the role
     * from the identity tables, so the two fields nobody may forge are the two
     * the caller cannot reach. `log_activity`, which does accept a role, is
     * revoked from `authenticated` for exactly that reason — an audit log the
     * audited can write answers nothing.
     */
    append: (event) =>
      callRpc(
        client,
        'append_activity',
        {
          p_cycle_id: event.cycleId,
          p_entity_type: event.entityType,
          p_entity_id: event.entityId,
          p_action: event.action,
          p_before: event.before,
          p_after: event.after,
          p_reason: event.reason,
        },
        activityEventEntity.parse,
      ),

    listForCycle: (cycleId) =>
      run(
        client
          .from('activity_events')
          .select('*')
          .eq('cycle_id', cycleId)
          .order('occurred_at', { ascending: false })
          .order('id', { ascending: false })
          // A guard rail, not pagination. The audit log grows without bound over
          // a cycle and this method has no cursor yet; capping it loudly beats
          // pulling ten thousand rows into a dashboard.
          .limit(500),
        activityEventEntity.parseMany,
        { table: 'activity_events', cycleId },
      ),

    listForEntity: (cycleId, entityType, entityId) =>
      run(
        client
          .from('activity_events')
          .select('*')
          .eq('cycle_id', cycleId)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('occurred_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(200),
        activityEventEntity.parseMany,
        { table: 'activity_events', cycleId, entityType, entityId },
      ),
  };
}

const ROUND_WITH_INVITATIONS =
  '*, redistribution_invitations(startup_id, status, proposed_hours, responded_at)';

export function recoveryRepository(client: RlsClient): RecoveryPort {
  const reloadRound = (roundId: string) =>
    runSingle(
      client.from('redistribution_rounds').select(ROUND_WITH_INVITATIONS).eq('id', roundId).single(),
      redistributionRoundEntity.parse,
      { table: 'redistribution_rounds', roundId },
    );

  return {
    listForCycle: (cycleId) =>
      run(
        client.from('recovery_cases').select('*').eq('cycle_id', cycleId),
        recoveryCaseEntity.parseMany,
        { table: 'recovery_cases', cycleId },
      ),

    confirm: (caseId, actorId) =>
      runSingle(
        client
          .from('recovery_cases')
          .update({ status: 'confirmed', confirmed_by: actorId })
          .eq('id', caseId)
          .select('*')
          .single(),
        recoveryCaseEntity.parse,
        { table: 'recovery_cases', caseId },
      ),

    /** An approved exception or a replacement placement holds the hours. */
    protect: (caseId, until) =>
      runSingle(
        client
          .from('recovery_cases')
          .update({ status: 'exception_protected', protected_until: until })
          .eq('id', caseId)
          .select('*')
          .single(),
        recoveryCaseEntity.parse,
        { table: 'recovery_cases', caseId },
      ),

    createRound: async (input) => {
      const created = await callRpc(
        client,
        'create_redistribution_round',
        {
          p_cycle_id: input.cycleId,
          p_recovery_case_ids: [...input.recoveryCaseIds],
          p_position_deadline: input.positionDeadline,
          p_selection_deadline: input.selectionDeadline,
        },
        (value) => (value as { id: string }).id,
      );
      if (!created.ok) return created;
      return reloadRound(created.data);
    },

    listRounds: (cycleId) =>
      run(
        client
          .from('redistribution_rounds')
          .select(ROUND_WITH_INVITATIONS)
          .eq('cycle_id', cycleId)
          .order('number'),
        redistributionRoundEntity.parseMany,
        { table: 'redistribution_rounds', cycleId },
      ),

    // The invitation and the round's own status move together — a round in
    // `draft` with invitations already out is a state the screen cannot render
    // honestly.
    invite: async (roundId, startupId, proposedHours) => {
      const invited = await callRpc(
        client,
        'invite_to_redistribution',
        { p_round_id: roundId, p_startup_id: startupId, p_proposed_hours: proposedHours },
        (value) => (value as { id: string }).id,
      );
      if (!invited.ok) return invited;
      return reloadRound(invited.data);
    },

    /**
     * Accepting grants the hours through the same budget check every other
     * allocation goes through — and refuses when the two numbers do not add up
     * to a tier, rather than rounding somebody down by ten hours and recording
     * it as if it were the offer.
     */
    respond: async (roundId, startupId, response) => {
      const responded = await callRpc(
        client,
        'respond_to_redistribution',
        { p_round_id: roundId, p_startup_id: startupId, p_response: response },
        () => roundId,
      );
      if (!responded.ok) return responded;
      return reloadRound(roundId);
    },

    expireInvitations: async (roundId) => {
      const { error } = await client
        .from('redistribution_invitations')
        .update({ status: 'expired', responded_at: new Date().toISOString() })
        .eq('round_id', roundId)
        .eq('status', 'invited');
      if (error) {
        return err(fromPostgrest(error, { table: 'redistribution_invitations', roundId }));
      }
      return reloadRound(roundId);
    },

    closeRound: async (roundId, occurredAt) => {
      const { error } = await client
        .from('redistribution_rounds')
        .update({ status: 'closed', closed_at: occurredAt })
        .eq('id', roundId)
        .not('status', 'in', '("closed","cancelled")');
      if (error) return err(fromPostgrest(error, { table: 'redistribution_rounds', roundId }));
      return reloadRound(roundId);
    },
  };
}

/**
 * A person's own inbox.
 *
 * Every read and write is scoped by `recipientId` in the signature, not by a
 * filter the caller is trusted to remember — and RLS says the same thing again
 * underneath, granting `update (read_at)` and nothing else. There is no
 * `create`: notifications are written by the reminder engine's fan-out, which
 * only the service role may execute, so nothing an end user can reach mints one.
 */
export function notificationsRepository(client: RlsClient): NotificationPort {
  return {
    listForRecipient: (recipientId, options) => {
      let query = client
        .from('notifications')
        .select('*')
        .eq('recipient_id', recipientId)
        .eq('channel', 'in_app')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(options?.limit ?? 50);
      if (options?.unreadOnly) query = query.is('read_at', null);
      return run(query, notificationEntity.parseMany, { table: 'notifications', recipientId });
    },

    countUnread: async (recipientId) => {
      const { count, error } = await client
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', recipientId)
        .eq('channel', 'in_app')
        .is('read_at', null);
      if (error) return err(fromPostgrest(error, { table: 'notifications', recipientId }));
      return ok(count ?? 0);
    },

    /**
     * Idempotent: `read_at is null` in the predicate means marking an
     * already-read row leaves the original timestamp alone. "When did they
     * first see this" is the question the column exists to answer.
     */
    markRead: async (id, recipientId, readAt) => {
      const { error } = await client
        .from('notifications')
        .update({ read_at: readAt })
        .eq('id', id)
        .eq('recipient_id', recipientId)
        .is('read_at', null);
      if (error) return err(fromPostgrest(error, { table: 'notifications', notificationId: id }));

      return runSingle(
        client.from('notifications').select('*').eq('id', id).eq('recipient_id', recipientId).single(),
        notificationEntity.parse,
        { table: 'notifications', notificationId: id },
      );
    },

    /** Returns how many rows this actually changed, so "12 marked read" is true. */
    markAllRead: async (recipientId, readAt) => {
      const { data, error } = await client
        .from('notifications')
        .update({ read_at: readAt })
        .eq('recipient_id', recipientId)
        .eq('channel', 'in_app')
        .is('read_at', null)
        .select('id');
      if (error) return err(fromPostgrest(error, { table: 'notifications', recipientId }));
      return ok((data ?? []).length);
    },
  };
}
