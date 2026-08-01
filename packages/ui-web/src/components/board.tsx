import { cn } from '../cn';

/**
 * Board primitives.
 *
 * A board in a console is not a mood board: the columns are narrow, the cards
 * are dense, and the whole point is that thirty of them fit on a screen at once
 * so a bottleneck shows up as a tall column rather than as a number in a table.
 *
 * These are deliberately plain containers and know nothing about startups,
 * candidates or stages — same as every other component here. What may be
 * dragged where is a domain rule and lives in `@relayflow/entities`; the drag
 * state lives in the screen. Presentation never decides whether a move is legal.
 */

/**
 * The horizontal strip of columns.
 *
 * Columns are a fixed width and the strip scrolls sideways. Letting them shrink
 * to fit would make an eight-column board unreadable at exactly the moment it
 * has the most to say.
 */
export function BoardScroller({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden p-3',
        // A scrollbar that appears on hover shifts the layout; reserve the gutter.
        '[scrollbar-gutter:stable]',
        className,
      )}
      {...props}
    />
  );
}

export interface BoardColumnProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  count: number;
  /** Small right-aligned qualifier — a total, a sum of hours. */
  meta?: React.ReactNode | undefined;
  /** A card is over this column and may be dropped. */
  active?: boolean | undefined;
  /** A card is over this column and may not. */
  blocked?: boolean | undefined;
  children: React.ReactNode;
}

export function BoardColumn({
  title,
  count,
  meta,
  active = false,
  blocked = false,
  className,
  children,
  ...props
}: BoardColumnProps) {
  return (
    <div
      className={cn(
        'flex w-64 shrink-0 flex-col overflow-hidden rounded-lg',
        'bg-surface-sunken ring-1 ring-inset transition-colors',
        active && 'ring-2 ring-accent',
        blocked && 'ring-2 ring-critical',
        !active && !blocked && 'ring-border',
        className,
      )}
      {...props}
    >
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-2.5">
        <h3 className="truncate text-2xs font-semibold uppercase tracking-wider text-text-secondary">
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {meta ? <span className="text-2xs text-text-muted">{meta}</span> : null}
          <span className="min-w-4 rounded-sm bg-surface px-1 text-center text-2xs font-medium tabular-nums text-text-secondary ring-1 ring-inset ring-border">
            {count}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">{children}</div>
    </div>
  );
}

export interface BoardCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Dimmed while its move is in flight. */
  busy?: boolean | undefined;
  /** Lifted while the pointer is carrying it. */
  dragging?: boolean | undefined;
  children: React.ReactNode;
}

export function BoardCard({
  busy = false,
  dragging = false,
  className,
  children,
  ...props
}: BoardCardProps) {
  return (
    <article
      className={cn(
        'flex flex-col gap-1 rounded-md bg-surface p-2 text-left',
        'ring-1 ring-inset ring-border transition-[opacity,box-shadow]',
        'focus-within:ring-2 focus-within:ring-ring',
        props.draggable && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-40',
        busy && 'pointer-events-none opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </article>
  );
}

/** Quiet placeholder for a column with nothing in it. An empty column is fine. */
export function BoardColumnEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-2xs text-text-muted">
      {children}
    </p>
  );
}
