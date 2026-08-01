import { cn } from '../cn';

/**
 * The working screens' structural primitives.
 *
 * Same material as the console Card in console.tsx — white surface, hairline
 * border, card radius, a shadow that is barely there — at the density a table
 * or a queue wants rather than the density a summary wants. Two sets on purpose:
 * a dashboard tile and a table header want opposite amounts of air, and one
 * component with a `dense` flag ends up wrong for both.
 */

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        // overflow-hidden so rows that run edge to edge clip to the radius.
        'flex min-w-0 flex-col overflow-hidden rounded-card',
        'border border-hairline bg-panel shadow-card',
        className,
      )}
      {...props}
    />
  );
}

// `title` is omitted from the DOM attributes because ours is a ReactNode
// heading, not the string tooltip attribute of the same name.
export interface PanelHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  /** Right-aligned count, filter or action. Kept small and secondary. */
  aside?: React.ReactNode | undefined;
}

export function PanelHeader({ title, aside, className, ...props }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex h-[52px] shrink-0 items-center justify-between gap-3 px-5',
        'border-b border-hairline',
        className,
      )}
      {...props}
    >
      <h2 className="truncate text-md font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      {aside ? <div className="flex shrink-0 items-center gap-2.5">{aside}</div> : null}
    </div>
  );
}

/**
 * A single metric.
 *
 * Values are tabular-nums so digits line up column-wise when several sit in a
 * row — without it, "500" and "190" are visibly different widths and the strip
 * looks broken.
 */
export interface MetricProps {
  label: string;
  value: number | string;
  /** Optional qualifier, e.g. "of 500" or "since Monday". */
  hint?: string | undefined;
  tone?: 'default' | 'accent' | 'critical' | 'warning' | undefined;
  className?: string | undefined;
}

const METRIC_TONE = {
  default: 'text-ink',
  accent: 'text-brand',
  critical: 'text-critical',
  warning: 'text-warning-text',
} as const;

export function Metric({ label, value, hint, tone = 'default', className }: MetricProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 px-5 py-4', className)}>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums',
            METRIC_TONE[tone],
          )}
        >
          {value}
        </span>
        {hint ? <span className="truncate text-xs text-ink-3">{hint}</span> : null}
      </div>
      <span className="truncate text-xs font-medium text-ink-3">{label}</span>
    </div>
  );
}

/** A horizontal strip of metrics, hairline-divided. */
export function MetricBar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-3 lg:grid-cols-6',
        // The dividers would otherwise draw an edge along the outer rim.
        'lg:divide-y-0',
        'overflow-hidden rounded-card border border-hairline bg-panel shadow-card',
        className,
      )}
      {...props}
    />
  );
}

/** Empty state. Deliberately quiet — an empty queue is good news, not an error. */
export function EmptyState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn('px-5 py-10 text-center text-sm text-ink-3', className)}>{children}</div>
  );
}
