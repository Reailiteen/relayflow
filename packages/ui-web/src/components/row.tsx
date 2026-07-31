import { ChevronRight } from 'lucide-react';
import type { StatusTone } from '@relayflow/tokens';
import { cn } from '../cn';
import { StatusDot } from './status';

/**
 * The workhorse of the interface: one actionable item, one line.
 *
 * The brief asks for a dashboard of urgent operational tasks, so the row is
 * built around scanning a queue rather than reading a card. Fixed columns —
 * dot, kind, subject, detail, chevron — mean the eye can travel straight down
 * one column instead of re-parsing each item's layout.
 *
 * Rows are 32px. That is what makes ten items visible without scrolling, which
 * is the entire point of the density choice.
 */

export interface RowProps {
  tone?: StatusTone | undefined;
  pulse?: boolean | undefined;
  /** Short category, e.g. "Conflict" or "Deadline". Fixed-width column. */
  kind: string;
  /** Who or what this concerns. Truncates — it is the flexible column. */
  subject: React.ReactNode;
  /** Right-aligned value: hours, a count, a state. Kept terse. */
  detail?: React.ReactNode | undefined;
  /** Rendered only when the actor may actually act. */
  action?: React.ReactNode | undefined;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  className?: string | undefined;
}

export function Row({
  tone = 'neutral',
  pulse,
  kind,
  subject,
  detail,
  action,
  onClick,
  href,
  className,
}: RowProps) {
  const interactive = Boolean(onClick ?? href);

  const content = (
    <>
      <StatusDot tone={tone} pulse={pulse} className="mt-[7px]" />

      <span className="w-20 shrink-0 truncate text-xs font-medium text-text-secondary">{kind}</span>

      <span className="min-w-0 flex-1 truncate text-base text-text">{subject}</span>

      {detail ? (
        <span className="shrink-0 text-sm tabular-nums text-text-muted">{detail}</span>
      ) : null}

      {action ? <span className="shrink-0">{action}</span> : null}

      {interactive ? (
        <ChevronRight
          className="size-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  const classes = cn(
    'group flex w-full items-start gap-2.5 px-3 py-1.5 text-left',
    'border-b border-border last:border-b-0',
    interactive &&
      cn(
        'cursor-pointer hover:bg-surface-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      ),
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
