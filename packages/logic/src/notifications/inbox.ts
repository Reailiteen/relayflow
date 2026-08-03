import { z } from 'zod';
import { ok } from '@relayflow/core';
import { notificationId, type Notification } from '@relayflow/entities';
import { AUTHENTICATED, defineUseCase, requireActor } from '../use-case';

/**
 * A person's own inbox.
 *
 * These are the only use-cases in the system whose scope is a *user* rather
 * than a cycle, a startup or a candidate — which is exactly why they are
 * `AUTHENTICATED` rather than capability-gated. There is no capability that
 * would be right here: a QSTP viewer, a startup supervisor and a candidate all
 * have an inbox, and none of them may read anyone else's. The recipient is
 * taken from the actor and passed to the port explicitly, so no caller can
 * widen it by passing a different id.
 *
 * The engine that writes these rows already exists — reminder rules in SQL,
 * fan-out per recipient and channel, an Edge worker for email, Slack and push.
 * What was missing was anywhere to read the in-app row, which is the one
 * channel that is always written and was the only one with no reader.
 */

export const NOTIFICATION_FILTERS = ['all', 'unread'] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export interface NotificationInbox {
  readonly notifications: readonly Notification[];
  /**
   * Unread across the whole inbox, not within the page above.
   *
   * The bell badge and the "Unread" tab both read this number, so a truncated
   * list or an active filter must not be able to change it. A badge that
   * disagrees with the list it opens is worse than no badge.
   */
  readonly unread: number;
  readonly filter: NotificationFilter;
}

export const getNotificationInbox = defineUseCase({
  name: 'notifications.inbox',
  input: z.object({
    filter: z.enum(NOTIFICATION_FILTERS).default('all'),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  authorize: AUTHENTICATED,

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    const listed = await ctx.repos.notifications.listForRecipient(actor.data.userId, {
      unreadOnly: input.filter === 'unread',
      limit: input.limit,
    });
    if (!listed.ok) return listed;

    const unread = await ctx.repos.notifications.countUnread(actor.data.userId);
    if (!unread.ok) return unread;

    return ok<NotificationInbox>({
      notifications: listed.data,
      unread: unread.data,
      filter: input.filter,
    });
  },
});

/**
 * Marking one read.
 *
 * Deliberately separate from following the link. Opening a notification marks
 * it read because that is what opening means, but a person also needs to be
 * able to clear something they have decided not to act on without being
 * navigated somewhere first.
 */
export const markNotificationRead = defineUseCase({
  name: 'notifications.markRead',
  input: z.object({ notificationId }),
  authorize: AUTHENTICATED,

  execute: async (ctx, input) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    return ctx.repos.notifications.markRead(
      input.notificationId,
      actor.data.userId,
      ctx.clock.now().toISOString(),
    );
  },
});

/** Returns how many rows changed, so the UI can say "12 marked read" honestly. */
export const markAllNotificationsRead = defineUseCase({
  name: 'notifications.markAllRead',
  input: z.object({}),
  authorize: AUTHENTICATED,

  execute: async (ctx) => {
    const actor = requireActor(ctx);
    if (!actor.ok) return actor;

    return ctx.repos.notifications.markAllRead(
      actor.data.userId,
      ctx.clock.now().toISOString(),
    );
  },
});
