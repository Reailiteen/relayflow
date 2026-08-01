import { Bell, ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@relayflow/ui-web';
import { signOutAction } from '@/server/actions';

/**
 * The right-hand end of the top bar: what needs looking at, and who you are.
 *
 * Both are server components, shared by all three portals. The account menu is
 * a `<details>` rather than a popover library because it has exactly one item —
 * signing out — and that item is a form post, so it works before any JavaScript
 * has loaded.
 */

/**
 * Unread count for the bell.
 *
 * Whatever the portal's own definition of "needs you" is, it is the same number
 * the screen below shows — a badge that disagrees with the list two hundred
 * pixels beneath it is worse than no badge. Rendered only when there is
 * something to say, so a quiet portal gets a quiet bell.
 */
export function Notifications({ count }: { count: number }) {
  return (
    <button
      type="button"
      aria-label={count > 0 ? `Notifications, ${count} urgent` : 'Notifications'}
      className={cn(
        'relative grid size-9 place-items-center rounded-control text-ink-2',
        'transition-colors hover:bg-surface-hover hover:text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      )}
    >
      <Bell className="size-[22px]" strokeWidth={1.75} aria-hidden="true" />
      {count > 0 && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full',
            'bg-red text-[11px] leading-none font-bold text-white tabular-nums',
          )}
          aria-hidden="true"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

export interface AccountMenuProps {
  name: string;
  /** The line under the name. The email, or the startup you are acting for. */
  detail: string;
}

export function AccountMenu({ name, detail }: AccountMenuProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <details className="group relative">
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-3 rounded-control py-1 pr-2 pl-1',
          'transition-colors hover:bg-surface-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-body font-semibold text-white"
          aria-hidden="true"
        >
          {initial}
        </span>

        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block truncate text-body font-semibold text-ink">{name}</span>
          <span className="block truncate text-meta text-ink-3">{detail}</span>
        </span>

        <ChevronDown
          className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div
        className={cn(
          'absolute top-full right-0 z-20 mt-2 w-48 rounded-card border border-hairline',
          'bg-panel p-1.5 shadow-overlay',
        )}
      >
        <form action={signOutAction}>
          <button
            type="submit"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-control px-3 py-2',
              'text-label font-medium text-ink-2 transition-colors',
              'hover:bg-surface-hover hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            )}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
