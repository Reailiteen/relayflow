import { LogOut } from 'lucide-react';
import { signOutAction } from '@/server/actions';

/**
 * Who you are, and the way out.
 *
 * A server component wrapping a form rather than a dropdown: signing out is the
 * only item, and burying a single action behind a menu costs a click to save
 * nothing. It goes through a Server Action so that when the session becomes
 * real, revoking it server-side is a change inside `signOutAction` and not here.
 */
export function UserMenu({ name, role }: { name: string; role?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right leading-tight sm:block">
        <div className="truncate text-xs font-medium text-text">{name}</div>
        {role && <div className="truncate text-2xs text-text-muted">{role}</div>}
      </div>

      <form action={signOutAction}>
        <button
          type="submit"
          title="Sign out"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}
