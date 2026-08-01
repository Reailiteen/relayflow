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
 * The kind column carries the tone colour as well as the dot. In a list of
 * thirty, colour in the word is what you actually read; the dot is the thing
 * that survives being seen out of the corner of your eye.
 */

const TONE_KIND: Record<StatusTone, string> = {
  neutral: 'text-ink-2',
  info: 'text-info',
  positive: 'text-positive',
  warning: 'text-warning-text',
  critical: 'text-critical',
};

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

      <span className={cn('w-24 shrink-0 truncate text-xs font-semibold', TONE_KIND[tone])}>
        {kind}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm text-ink-3">{subject}</span>

      {detail ? <span className="shrink-0 text-xs tabular-nums text-ink-3">{detail}</span> : null}

      {action ? <span className="shrink-0">{action}</span> : null}

      {interactive ? (
        <ChevronRight
          className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  const classes = cn(
    'group flex w-full items-start gap-3 px-5 py-2.5 text-left',
    'border-b border-hairline last:border-b-0',
    interactive &&
      cn(
        'cursor-pointer transition-colors hover:bg-surface-hover',
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
