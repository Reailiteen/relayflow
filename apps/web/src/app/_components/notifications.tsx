import Link from 'next/link';
import type { Notification } from '@relayflow/entities';
import { getNotificationInbox, type NotificationFilter } from '@relayflow/logic';
import { EmptyState, Panel, PanelHeader, cn } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import {
  MarkAllReadButton,
  NotificationBellMenu,
  NotificationList,
  type NotificationView,
} from './notifications-client';

/**
 * The server half of the inbox: it reads, the client half reacts.
 *
 * Both portals' bells and all three notification pages come through here, so
 * "what a notification is" is decided once. The only thing that varies per
 * portal is where the "see all" link points, because the three shells live at
 * different roots.
 */

/**
 * How many rows the bell carries.
 *
 * Small on purpose. The dropdown is for the last few things that happened; the
 * page is for the archive, and shipping fifty rows into every layout render to
 * show eight of them is a cost paid on every navigation.
 */
const BELL_LIMIT = 8;
const PAGE_LIMIT = 100;

function toView(notification: Notification): NotificationView {
  return {
    id: notification.id,
    category: notification.category,
    title: notification.title,
    body: notification.body,
    route: notification.route,
    mandatory: notification.mandatory,
    read: notification.readAt !== null,
    createdAt: notification.createdAt,
  };
}

/**
 * The top-bar bell, for whichever portal renders it.
 *
 * A failed read shows an empty, zero-count bell rather than an error in the
 * chrome: the top bar is not the place to report that a query failed, and the
 * page behind it says so properly. What it must not do is invent a count.
 */
export async function NotificationBell({ centerHref }: { centerHref: string }) {
  const ctx = await getContext();
  const result = await getNotificationInbox(ctx, { limit: BELL_LIMIT });

  return (
    <NotificationBellMenu
      unread={result.ok ? result.data.unread : 0}
      notifications={result.ok ? result.data.notifications.map(toView) : []}
      centerHref={centerHref}
    />
  );
}

/**
 * The notification centre.
 *
 * Two tabs and a list. The filter is a link rather than client state so the
 * unread view is a URL a person can bookmark, come back to, and reload without
 * losing where they were.
 */
export async function NotificationCenter({
  filter,
  basePath,
}: {
  filter: NotificationFilter;
  basePath: string;
}) {
  const ctx = await getContext();
  const result = await getNotificationInbox(ctx, { filter, limit: PAGE_LIMIT });

  if (!result.ok) {
    return (
      <NotificationPage>
        <Panel>
          <PanelHeader title="Notifications" />
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </NotificationPage>
    );
  }

  const { notifications, unread } = result.data;

  return (
    <NotificationPage>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-ink-3">
          Everything the programme has told you, newest first. Opening one marks it read.
        </p>
        {/*
          The way out of a channel you did not want. Put next to the messages
          themselves rather than buried in an account menu, because the moment
          somebody wants to change this is the moment they are reading one.
        */}
        <Link
          href={`${basePath}/settings`}
          className="text-xs text-accent underline-offset-2 hover:underline"
        >
          Settings
        </Link>
      </header>

      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-1">
              <FilterTab href={basePath} active={filter === 'all'}>
                All
              </FilterTab>
              <FilterTab
                href={`${basePath}?filter=unread`}
                active={filter === 'unread'}
                count={unread}
              >
                Unread
              </FilterTab>
            </span>
          }
          aside={<MarkAllReadButton unread={unread} />}
        />

        {notifications.length === 0 ? (
          <EmptyState>
            {filter === 'unread'
              ? 'Nothing unread. You are up to date.'
              : 'No notifications yet. You will be told when something needs you.'}
          </EmptyState>
        ) : (
          <NotificationList notifications={notifications.map(toView)} />
        )}
      </Panel>
    </NotificationPage>
  );
}

/** The column the three portals' notification pages share. */
function NotificationPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--rf-gap)]">{children}</div>
  );
}

function FilterTab({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number | undefined;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-control px-2.5 py-1 text-sm font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        active ? 'bg-surface-sunken text-ink' : 'text-ink-3 hover:text-ink',
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 text-xs text-ink-3 tabular-nums">{count}</span>
      )}
    </Link>
  );
}

/**
 * What the page shows while the read is in flight.
 *
 * Shaped like the list rather than being a spinner, so the layout does not jump
 * when the real rows arrive.
 */
export function NotificationsSkeleton() {
  return (
    <NotificationPage>
      <div className="h-5 w-80 max-w-full rounded-control bg-surface-sunken" />
      <Panel>
        <PanelHeader title="Notifications" />
        <div className="flex flex-col" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
              <div className="size-8 shrink-0 rounded-[9px] bg-surface-sunken" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-3.5 w-1/2 rounded-control bg-surface-sunken" />
                <div className="h-3 w-full rounded-control bg-surface-sunken" />
                <div className="h-3 w-24 rounded-control bg-surface-sunken" />
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <span className="sr-only">Loading notifications</span>
    </NotificationPage>
  );
}

/** The filter a `?filter=` search param asks for, defaulting to everything. */
export function filterFromSearchParams(value: string | string[] | undefined): NotificationFilter {
  return value === 'unread' ? 'unread' : 'all';
}
