import Link from 'next/link';
import { cn } from '@relayflow/ui-web';

/**
 * Table ⇄ Board.
 *
 * Two links rather than a stateful toggle, so the choice lives in the URL: a
 * bookmark, a refresh and a link pasted into chat all land on the same view.
 * Both views are rendered from the same read model, so switching is a change of
 * shape, never a change of data.
 */
export interface ViewOption {
  readonly value: string;
  readonly label: string;
  readonly href: string;
}

export function ViewSwitch({ options, current }: { options: readonly ViewOption[]; current: string }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md bg-surface-sunken p-0.5 ring-1 ring-inset ring-border"
      role="group"
      aria-label="View"
    >
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'rounded-sm px-2 py-0.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-surface text-text shadow-sm ring-1 ring-inset ring-border'
                : 'text-text-muted hover:text-text',
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
