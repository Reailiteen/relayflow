import { ChevronRight } from 'lucide-react';
import { cn } from '../cn';

/**
 * The console surface set.
 *
 * These are the pieces the QSTP dashboard is assembled from: a card, its
 * header, the tinted icon tile, the pill, the stat, and the one-line row. They
 * are separate from Panel/Metric/Row in panel.tsx, which are the hairline,
 * 32px-row primitives the data tables are built on. Two sets on purpose — a
 * summary screen and a working table want opposite densities, and collapsing
 * them into one component with a `dense` flag produces something that is wrong
 * for both.
 *
 * Every dimension and colour here resolves to a token in console.css.
 */

/**
 * The accent vocabulary. Wider than StatusTone because this screen also colours
 * things by category rather than by severity — "Unallocated" is not a warning,
 * it just needs to be distinguishable from "Allocated" at a glance.
 */
export type AccentTone = 'blue' | 'green' | 'violet' | 'orange' | 'teal' | 'red';

const TONE_INK: Record<AccentTone, string> = {
  blue: 'text-blue',
  green: 'text-green',
  violet: 'text-violet',
  orange: 'text-orange',
  teal: 'text-teal',
  red: 'text-red',
};

const TONE_TINT: Record<AccentTone, string> = {
  blue: 'bg-blue-tint',
  green: 'bg-green-tint',
  violet: 'bg-violet-tint',
  orange: 'bg-orange-tint',
  teal: 'bg-teal-tint',
  red: 'bg-red-tint',
};

/* ── Card ─────────────────────────────────────────────────────────────────── */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-card border border-hairline bg-panel shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeadingProps {
  title: React.ReactNode;
  /** Sits under the title. Omitted where the title is self-explanatory. */
  subtitle?: React.ReactNode | undefined;
  /** Right-hand counts, filters or controls. */
  aside?: React.ReactNode | undefined;
  className?: string | undefined;
}

/**
 * A card's heading.
 *
 * Fixed to --rf-card-head-h when there is no subtitle, because the attention
 * card's header has to line up with the top of the stat row beside it. With a
 * subtitle it grows instead — the two-line form is only used in the lower
 * cards, where nothing needs to align with it.
 */
export function CardHeading({ title, subtitle, aside, className }: CardHeadingProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-start justify-between gap-4 px-[var(--rf-card-pad)]',
        subtitle ? 'pt-[var(--rf-card-pad)]' : 'h-[var(--rf-card-head-h)] items-center',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-title leading-tight font-bold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 truncate text-meta text-ink-3">{subtitle}</p> : null}
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-4">{aside}</div> : null}
    </div>
  );
}

/* ── Icon tile ────────────────────────────────────────────────────────────── */

export interface IconTileProps {
  tone: AccentTone;
  children: React.ReactNode;
  className?: string | undefined;
}

/** The 36px tinted square a stat is introduced by. */
export function IconTile({ tone, children, className }: IconTileProps) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-tile',
        '[&_svg]:size-[18px]',
        TONE_TINT[tone],
        TONE_INK[tone],
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/* ── Pill ─────────────────────────────────────────────────────────────────── */

export interface PillProps {
  tone: AccentTone;
  children: React.ReactNode;
  className?: string | undefined;
}

export function Pill({ tone, children, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center rounded-[var(--rf-r-pill)] px-3',
        'text-label font-semibold whitespace-nowrap',
        TONE_TINT[tone],
        TONE_INK[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Stat ─────────────────────────────────────────────────────────────────── */

export interface StatCardProps {
  tone: AccentTone;
  icon: React.ReactNode;
  value: number | string;
  label: string;
  /** The line under the label: a share, a period, a readiness state. */
  hint: string;
  /** Colours the hint when it is a state rather than a measurement. */
  hintTone?: AccentTone | undefined;
  className?: string | undefined;
}

/**
 * One figure, its label, and one qualifier.
 *
 * The tile is pinned to the top and the text block to the bottom, so five cards
 * carrying values of different lengths still align on both edges.
 */
export function StatCard({ tone, icon, value, label, hint, hintTone, className }: StatCardProps) {
  return (
    <Card
      className={cn(
        'min-h-[var(--rf-stat-h)] justify-between p-[var(--rf-card-pad)]',
        className,
      )}
    >
      <IconTile tone={tone}>{icon}</IconTile>

      <div className="min-w-0">
        <div className="text-stat leading-none font-bold tracking-[-0.02em] tabular-nums text-ink">
          {value}
        </div>
        <div className="mt-3 truncate text-label font-semibold text-ink-2">{label}</div>
        <div
          className={cn(
            'mt-1.5 truncate text-meta',
            hintTone ? cn(TONE_INK[hintTone], 'font-medium') : 'text-ink-3',
          )}
        >
          {hint}
        </div>
      </div>
    </Card>
  );
}

/* ── List row ─────────────────────────────────────────────────────────────── */

export interface ListRowProps {
  tone: AccentTone;
  icon: React.ReactNode;
  /** Short category, fixed column, coloured by tone. */
  kind: string;
  subject: React.ReactNode;
  /** Rendered only when the actor may actually act on the row. */
  action?: React.ReactNode | undefined;
  href: string;
  className?: string | undefined;
}

/**
 * One item of the queue.
 *
 * Five columns at fixed offsets — icon, kind, subject, action, chevron — so the
 * eye runs straight down the kind column instead of re-reading each line's
 * shape. The row is a link; the action inside it is a separate control, which
 * is why the action is rendered as a sibling rather than nested in the anchor.
 */
export function ListRow({ tone, icon, kind, subject, action, href, className }: ListRowProps) {
  return (
    <div
      className={cn(
        'group relative flex min-h-[var(--rf-row-h)] items-center gap-4',
        'border-t border-hairline px-[var(--rf-card-pad)]',
        'transition-colors hover:bg-brand-soft/50',
        className,
      )}
    >
      <span className={cn('flex size-5 shrink-0 items-center justify-center', TONE_INK[tone])}>
        {icon}
      </span>

      <span className={cn('w-[105px] shrink-0 truncate text-meta font-semibold', TONE_INK[tone])}>
        {kind}
      </span>

      {/* The stretched link covers the row, so the whole line is one target and
          the action button still sits above it on its own stacking context. */}
      <a
        href={href}
        className={cn(
          'min-w-0 flex-1 truncate text-meta text-ink-3',
          'before:absolute before:inset-0 before:content-[""]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
          'focus-visible:ring-brand',
        )}
      >
        {subject}
      </a>

      {action ? <span className="relative shrink-0">{action}</span> : null}

      <ChevronRight
        className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </div>
  );
}

/* ── Row action ───────────────────────────────────────────────────────────── */

/**
 * The outlined control that appears on rows the actor can act on.
 *
 * A link rather than a button: it goes to the screen where the work is done, so
 * making it a button would mean a control that looks like it acts in place and
 * then navigates anyway. Its own component rather than the shared Button
 * because it is 26px — sized to the 34px row, which Button's `xs` would burst.
 */
export function RowAction({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex h-[26px] items-center rounded-control border border-hairline-strong',
        'bg-panel px-3 text-meta font-medium text-ink-2 shadow-control',
        'transition-colors hover:border-brand hover:text-brand',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      {children}
    </a>
  );
}
