'use client';

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Cog,
  FileText,
  TriangleAlert,
  UserCheck,
  UserRound,
} from 'lucide-react';
import type { NotificationCategory } from '@relayflow/entities';
import type { StatusTone } from '@relayflow/tokens';
import { Badge, Button, cn } from '@relayflow/ui-web';
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/server/actions';
import { formatStamp } from './format';

/**
 * The in-app inbox, as a person actually meets it: a bell in the top bar and a
 * page behind it.
 *
 * Both render the same rows through the same component, because a notification
 * that reads one way in the dropdown and another way on the page is two
 * notifications as far as the reader is concerned.
 *
 * The interactive parts live on the client and the reads stay on the server —
 * so the dropdown ships a list, not a fetch. Marking read is a Server Action
 * that revalidates, which is what keeps the badge, the dropdown and the page
 * agreeing with each other without any of them holding their own copy of the
 * count.
 */

export interface NotificationView {
  readonly id: string;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly body: string;
  /** Already validated as an internal path by the entity layer. */
  readonly route: string | null;
  readonly mandatory: boolean;
  readonly read: boolean;
  readonly createdAt: string;
}

/**
 * How each of the six categories looks.
 *
 * The tones come from the console's status ramp rather than being picked per
 * category, so a critical notification is the same red as a critical row on
 * every other screen. `system` is deliberately the quietest: it is the category
 * that fires most often and asks for the least.
 */
const CATEGORY: Record<
  NotificationCategory,
  { label: string; icon: typeof Bell; tone: StatusTone; wash: string; ink: string }
> = {
  deadline: {
    label: 'Deadline',
    icon: Clock,
    tone: 'warning',
    wash: 'bg-warning-subtle',
    ink: 'text-warning-text',
  },
  selection: {
    label: 'Selection',
    icon: UserCheck,
    tone: 'info',
    wash: 'bg-info-subtle',
    ink: 'text-info-text',
  },
  exception: {
    label: 'Exception',
    icon: TriangleAlert,
    tone: 'critical',
    wash: 'bg-critical-subtle',
    ink: 'text-critical-text',
  },
  onboarding: {
    label: 'Onboarding',
    icon: FileText,
    tone: 'info',
    wash: 'bg-info-subtle',
    ink: 'text-info-text',
  },
  candidate: {
    label: 'Candidate',
    icon: UserRound,
    tone: 'positive',
    wash: 'bg-positive-subtle',
    ink: 'text-positive-text',
  },
  system: {
    label: 'System',
    icon: Cog,
    tone: 'neutral',
    wash: 'bg-surface-sunken',
    ink: 'text-ink-3',
  },
};

/**
 * One notification.
 *
 * Unread is carried by three things at once — the dot, the weight of the title,
 * and the tinted rail down the left — because colour alone fails for a
 * meaningful share of the people who use this, and a badge on its own is easy
 * to skim past in a list of twenty.
 *
 * Opening it marks it read. That is the whole interaction for most rows; the
 * explicit tick is for the ones a person has decided not to act on, which
 * otherwise sit unread forever and turn the badge into wallpaper.
 */
function NotificationItem({
  notification,
  onNavigate,
}: {
  notification: NotificationView;
  onNavigate?: (() => void) | undefined;
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const category = CATEGORY[notification.category];
  const Icon = category.icon;
  // Optimistic, and honest about it: the row is dimmed as soon as it is
  // clicked, and put back if the write comes back a failure.
  const [readLocally, setReadLocally] = useState(false);
  const read = notification.read || readLocally;

  const markRead = useCallback(() => {
    if (read) return;
    setReadLocally(true);
    setFailed(false);
    startTransition(async () => {
      const result = await markNotificationReadAction({ notificationId: notification.id });
      if (!result.ok) {
        setReadLocally(false);
        setFailed(true);
      }
    });
  }, [notification.id, read]);

  const body = (
    <>
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px]',
          category.wash,
          category.ink,
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" strokeWidth={1.9} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 text-sm leading-snug',
              read ? 'font-medium text-ink-2' : 'font-semibold text-ink',
            )}
          >
            {notification.title}
          </span>
          {!read && (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
              aria-hidden="true"
            />
          )}
        </span>

        <span className="line-clamp-2 text-xs leading-relaxed text-ink-3">{notification.body}</span>

        <span className="mt-0.5 flex flex-wrap items-center gap-2">
          <Badge tone={category.tone}>{category.label}</Badge>
          {notification.mandatory && <Badge tone="critical">Required</Badge>}
          <span className="text-2xs text-ink-3 tabular-nums">
            {formatStamp(notification.createdAt)}
          </span>
          {!read && <span className="sr-only">Unread</span>}
        </span>

        {failed && (
          <span role="alert" className="text-2xs text-critical-text">
            Could not mark this read. Try again.
          </span>
        )}
      </span>
    </>
  );

  const shell = cn(
    'group relative flex w-full items-start gap-3 px-4 py-3 text-left',
    'border-l-2 transition-colors',
    read ? 'border-l-transparent' : 'border-l-accent bg-brand-tint/30',
    'hover:bg-surface-hover',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
  );

  return (
    <li className="relative border-b border-hairline last:border-b-0">
      {notification.route ? (
        <Link
          href={notification.route}
          className={shell}
          onClick={() => {
            markRead();
            onNavigate?.();
          }}
        >
          {body}
        </Link>
      ) : (
        // Nothing to open. Still a button, because marking it read is the one
        // thing there is to do with it.
        <button type="button" onClick={markRead} disabled={read || pending} className={shell}>
          {body}
        </button>
      )}

      {!read && notification.route && (
        <button
          type="button"
          onClick={markRead}
          disabled={pending}
          aria-label={`Mark "${notification.title}" as read`}
          className={cn(
            'absolute top-2.5 right-2 grid size-7 place-items-center rounded-control',
            'text-ink-3 transition-colors hover:bg-surface-sunken hover:text-ink',
            // Revealed on hover or focus, so twenty rows are not twenty ticks —
            // but always present for keyboard and touch, which never hover.
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            'max-sm:opacity-100',
          )}
        >
          <Check className="size-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

export function NotificationList({
  notifications,
  onNavigate,
  className,
}: {
  notifications: readonly NotificationView[];
  onNavigate?: (() => void) | undefined;
  className?: string | undefined;
}) {
  return (
    <ul className={cn('flex flex-col', className)}>
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

/** Marks everything read. Disabled — not hidden — when there is nothing to mark. */
export function MarkAllReadButton({
  unread,
  size = 'sm',
}: {
  unread: number;
  size?: 'xs' | 'sm' | undefined;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-2xs text-critical-text">
          {error}
        </span>
      )}
      <Button
        variant="ghost"
        size={size}
        disabled={unread === 0 || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markAllNotificationsReadAction({});
            if (!result.ok) setError(result.message);
          });
        }}
      >
        <CheckCheck aria-hidden="true" />
        {pending ? 'Marking…' : 'Mark all read'}
      </Button>
    </span>
  );
}

/**
 * The bell.
 *
 * A dropdown rather than a link straight to the page: most notifications are
 * read and dismissed without leaving whatever screen you were working on, and
 * making that cost a navigation each way is how an inbox stops being opened.
 *
 * The count is the true unread total, not the length of the list below it —
 * the list is capped, the badge is not.
 */
export function NotificationBellMenu({
  unread,
  notifications,
  centerHref,
}: {
  unread: number;
  notifications: readonly NotificationView[];
  centerHref: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    // Opening is the moment the list has to be right. There is no realtime
    // subscription yet — the reads go through the repository port, and the
    // fixtures adapter has nothing to push — so this is the seam where one
    // arrives: a refresh here keeps the dropdown honest across tabs today, and
    // becomes redundant rather than wrong once the port is Supabase-backed.
    router.refresh();

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close, router]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'
        }
        className={cn(
          'relative grid size-9 place-items-center rounded-control text-ink-2',
          'transition-colors hover:bg-surface-hover hover:text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          open && 'bg-surface-hover text-ink',
        )}
      >
        <Bell className="size-[22px]" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full',
              'bg-red text-[11px] leading-none font-bold text-white tabular-nums',
            )}
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className={cn(
            'absolute top-full right-0 z-30 mt-2 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col',
            'overflow-hidden rounded-card border border-hairline bg-panel shadow-overlay',
          )}
        >
          <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-hairline pr-2 pl-4">
            <h2 className="text-sm font-semibold text-ink">
              Notifications
              {unread > 0 && <span className="ml-1.5 text-ink-3 tabular-nums">({unread})</span>}
            </h2>
            <MarkAllReadButton unread={unread} size="xs" />
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-3">
              Nothing here yet. You will be told when something needs you.
            </p>
          ) : (
            <NotificationList
              notifications={notifications}
              onNavigate={() => close(false)}
              className="max-h-[min(70vh,420px)] overflow-y-auto"
            />
          )}

          <Link
            href={centerHref}
            onClick={() => close(false)}
            className={cn(
              'shrink-0 border-t border-hairline px-4 py-2.5 text-center',
              'text-xs font-medium text-accent transition-colors hover:bg-surface-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
            )}
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
