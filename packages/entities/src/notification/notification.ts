import { z } from 'zod';
import { auditColumns, defineEntity } from '../shared/entity';
import { notificationId, userId, type NotificationId, type UserId } from '../shared/ids';

/**
 * One thing the system told one person.
 *
 * The reminder engine writes a row per recipient *per channel*: an email row, a
 * Slack row, and — always — an in-app row. Only the in-app row is modelled here,
 * because it is the only one a person can open, mark read, or argue with. The
 * external rows are a delivery queue owned by the worker, and RLS already keeps
 * their provider errors away from recipients.
 *
 * `readAt` is the only field a recipient may write, which is why it is the only
 * column granted to `authenticated` in migration 0011. Everything else about a
 * notification is a statement of record.
 */

export const NOTIFICATION_CATEGORIES = [
  'deadline',
  'selection',
  'exception',
  'onboarding',
  'candidate',
  'system',
] as const;
export const notificationCategory = z.enum(NOTIFICATION_CATEGORIES);
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'slack', 'push'] as const;
export const notificationChannel = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface Notification {
  readonly id: NotificationId;
  readonly recipientId: UserId;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly body: string;
  /**
   * Where this notification points, already checked to be a path inside the
   * app. Null when there is nothing to open, or when the stored route was not
   * something we are willing to link to — see `internalRoute`.
   */
  readonly route: string | null;
  /** Ignores channel preferences, and says so in the interface. */
  readonly mandatory: boolean;
  readonly readAt: string | null;
  readonly createdAt: string;
}

/** Backslash, the one printable character a path here may not contain. */
const BACKSLASH = 0x5c;

/**
 * The route a notification carries, if it is safe to render as a link.
 *
 * `data` is jsonb written by SQL rules and an Edge worker, so it is the one
 * part of a notification not shaped by the type system. A link built from it
 * lands in an `href`, which makes `javascript:` and `//evil.example` live
 * concerns rather than pedantry. Only a single-slash absolute path with no
 * spaces, control characters or backslashes survives — the ways a string that
 * passes `startsWith('/')` can still become a different URL once a browser has
 * normalised it. Anything else becomes an unlinked notification, which is a
 * worse notification but not a dangerous one.
 */
export function internalRoute(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const route = value.trim();
  if (!route.startsWith('/') || route.startsWith('//')) return null;
  for (const character of route) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === BACKSLASH) return null;
  }
  return route;
}

export const notificationRow = z.object({
  id: notificationId,
  recipient_id: userId,
  channel: notificationChannel,
  category: notificationCategory,
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
  mandatory: z.boolean(),
  read_at: z.iso.datetime({ offset: true }).nullable(),
  ...auditColumns,
});

export const notificationEntity = defineEntity({
  name: 'Notification',
  row: notificationRow,
  toDomain: (row): Notification => ({
    id: row.id,
    recipientId: row.recipient_id,
    category: row.category,
    title: row.title,
    body: row.body,
    route: internalRoute(row.data['route']),
    mandatory: row.mandatory,
    readAt: row.read_at,
    createdAt: row.created_at,
  }),
});

export function isUnread(notification: Notification): boolean {
  return notification.readAt === null;
}

export function countUnread(notifications: readonly Notification[]): number {
  return notifications.reduce((total, row) => total + (isUnread(row) ? 1 : 0), 0);
}

/**
 * Newest first.
 *
 * Read state deliberately does not affect the order. An inbox that floats
 * unread items to the top rearranges itself while you are reading it, and the
 * one thing a list of things-that-happened owes you is a stable chronology.
 */
export function byNewestFirst(a: Notification, b: Notification): number {
  return b.createdAt.localeCompare(a.createdAt);
}
