import { Check } from 'lucide-react';
import { cn } from '../cn';

/**
 * The two figures the dashboard draws rather than lists.
 *
 * Both are plain SVG and CSS. A charting library would be several hundred
 * kilobytes to render one ring and one row of dots, and neither shape needs
 * axes, scales, tooltips or a resize observer — the ring is a fixed size and
 * the timeline is a flex row.
 */

/* ── Donut ────────────────────────────────────────────────────────────────── */

export interface DonutSegment {
  readonly label: string;
  readonly value: number;
  /** A CSS colour — pass the token, e.g. `var(--rf-green-chart)`. */
  readonly color: string;
}

export interface DonutProps {
  segments: readonly DonutSegment[];
  /** The denominator. Given explicitly so a partial ring stays honest. */
  total: number;
  /** Sits in the hole: the headline figure and its unit. */
  children: React.ReactNode;
  size?: number | undefined;
  thickness?: number | undefined;
  className?: string | undefined;
}

export function Donut({
  segments,
  total,
  children,
  size = 150,
  thickness = 28,
  className,
}: DonutProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // A hairline of canvas between arcs, so two adjacent segments read as two
  // values rather than one shape that changes colour.
  const gap = 3;

  let consumed = 0;
  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const length = total > 0 ? (segment.value / total) * circumference : 0;
      const offset = consumed;
      consumed += length;
      return { ...segment, length, offset };
    });

  return (
    <div
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Rotated so the first segment starts at twelve o'clock, which is where
        // a reader assumes a proportion begins.
        className="col-start-1 row-start-1 -rotate-90"
        role="img"
        aria-label={segments.map((s) => `${s.label} ${s.value} of ${total}`).join(', ')}
      >
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${Math.max(0, arc.length - gap)} ${circumference}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>

      <div className="col-start-1 row-start-1 text-center">{children}</div>
    </div>
  );
}

export interface LegendItemProps {
  color: string;
  label: string;
  value: React.ReactNode;
}

/** One legend line: dot, label, and the value right-aligned in its own column. */
export function LegendItem({ color, label, value }: LegendItemProps) {
  return (
    <>
      <span className="flex items-center gap-2.5">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="truncate text-meta font-medium text-ink-2">{label}</span>
      </span>
      <span className="text-meta tabular-nums text-ink-2">{value}</span>
    </>
  );
}

/* ── Timeline ─────────────────────────────────────────────────────────────── */

export type MilestoneStatus = 'complete' | 'active' | 'upcoming';

export interface TimelineStep {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly status: MilestoneStatus;
  readonly icon: React.ReactNode;
  readonly statusLabel: string;
}

const NODE: Record<MilestoneStatus, string> = {
  complete: 'bg-green text-white',
  active: 'bg-panel text-brand ring-2 ring-brand ring-inset',
  upcoming: 'bg-canvas text-ink-3 ring-1 ring-hairline-strong ring-inset',
};

const STATUS_INK: Record<MilestoneStatus, string> = {
  complete: 'text-green',
  active: 'text-brand',
  upcoming: 'text-ink-3',
};

const CONNECTOR: Record<MilestoneStatus, string> = {
  complete: 'bg-green',
  active: 'bg-brand/25',
  upcoming: 'bg-hairline-strong',
};

/**
 * The cycle's milestones, left to right.
 *
 * Equal grid columns rather than positioned nodes, so the connectors are simply
 * the flexible space either side of each circle and the row stays correct at
 * any width. The grid is then widened by one column and pulled back by half a
 * column at each end, which moves the circles from the middle of their columns
 * onto the ends of the run — first and last sit on the edges, and all the gaps
 * stay equal. The alternative is absolute offsets, which stop being right the
 * moment a label changes length.
 */
export function Timeline({
  steps,
  className,
}: {
  steps: readonly TimelineStep[];
  className?: string | undefined;
}) {
  const count = steps.length;
  const spread =
    count > 1
      ? { width: `${(count / (count - 1)) * 100}%`, marginInline: `-${100 / (2 * (count - 1))}%` }
      : {};

  return (
    <ol
      className={cn('grid', className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, ...spread }}
    >
      {steps.map((step, index) => (
        <li key={step.key} className="flex flex-col items-center">
          <div className="flex w-full items-center">
            <span
              className={cn(
                'h-[3px] flex-1',
                index === 0 ? 'bg-transparent' : CONNECTOR[steps[index - 1]!.status],
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'flex size-[46px] shrink-0 items-center justify-center rounded-full',
                '[&_svg]:size-5',
                NODE[step.status],
              )}
              aria-hidden="true"
            >
              {step.status === 'complete' ? <Check strokeWidth={3} /> : step.icon}
            </span>
            <span
              className={cn(
                'h-[3px] flex-1',
                index === steps.length - 1 ? 'bg-transparent' : CONNECTOR[step.status],
              )}
              aria-hidden="true"
            />
          </div>

          {/* nowrap, not truncate: the end labels are wider than the column
              they are centred in and are meant to overhang it. */}
          <p
            className={cn(
              'mt-3 text-meta font-semibold whitespace-nowrap',
              step.status === 'active' ? 'text-brand' : 'text-ink',
            )}
          >
            {step.label}
          </p>
          <p className="mt-1.5 text-meta whitespace-nowrap text-ink-3">{step.detail}</p>
          <p
            className={cn('mt-1.5 text-meta font-medium whitespace-nowrap', STATUS_INK[step.status])}
          >
            {step.statusLabel}
          </p>
        </li>
      ))}
    </ol>
  );
}
