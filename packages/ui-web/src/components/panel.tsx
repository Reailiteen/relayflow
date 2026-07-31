import { cn } from '../cn';

/**
 * The console's structural primitives.
 *
 * Panels are square-ish, hairline-bordered and flush — no drop shadows, no
 * generous padding. Depth in a dense interface comes from borders and surface
 * value, because shadows at this density turn into visual mud.
 */

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg',
        'bg-surface ring-1 ring-border',
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
        'flex h-9 shrink-0 items-center justify-between gap-3',
        'border-b border-border px-3',
        className,
      )}
      {...props}
    >
      <h2 className="truncate text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {title}
      </h2>
      {aside ? <div className="flex shrink-0 items-center gap-1.5">{aside}</div> : null}
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
  default: 'text-text',
  accent: 'text-accent',
  critical: 'text-critical',
  warning: 'text-warning-text',
} as const;

export function Metric({ label, value, hint, tone = 'default', className }: MetricProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 px-3 py-2', className)}>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-xl font-semibold tabular-nums', METRIC_TONE[tone])}>{value}</span>
        {hint ? <span className="truncate text-xs text-text-muted">{hint}</span> : null}
      </div>
      <span className="truncate text-2xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
    </div>
  );
}

/** A horizontal strip of metrics, hairline-divided. */
export function MetricBar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-6',
        // The dividers would otherwise draw an edge along the outer rim.
        'lg:divide-y-0',
        'overflow-hidden rounded-lg bg-surface ring-1 ring-border',
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
    <div className={cn('px-3 py-8 text-center text-sm text-text-muted', className)}>{children}</div>
  );
}
