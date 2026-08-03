import { ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@relayflow/ui-web';
import { signOutAction } from '@/server/actions';

/**
 * Who you are, at the right-hand end of the top bar.
 *
 * A server component shared by all three portals. The menu is a `<details>`
 * rather than a popover library because it has exactly one item — signing out —
 * and that item is a form post, so it works before any JavaScript has loaded.
 *
 * The bell that sits beside it is `NotificationBell` in `notifications.tsx`.
 * It used to live here as a decorative button counting whatever the portal's
 * dashboard thought was urgent; it now reads the inbox the reminder engine
 * actually writes to.
 */

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
