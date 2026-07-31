import type { StatusTone } from '@relayflow/tokens';
import { cn } from '../cn';

/**
 * Status vocabulary.
 *
 * In a console the same five tones have to mean the same five things on every
 * screen, or the interface stops being scannable. They are defined once here
 * and everything else — dots, badges, row accents — reads from this map.
 *
 * Note there is no `primary` tone. Brand maroon is for interactive elements;
 * state gets its own ramp. Mixing them is what makes every row look urgent.
 */

const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-text-muted',
  info: 'bg-info',
  positive: 'bg-positive',
  warning: 'bg-warning',
  critical: 'bg-critical',
};

const TONE_BADGE: Record<StatusTone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary ring-border',
  info: 'bg-info-subtle text-info-text ring-info/20',
  positive: 'bg-positive-subtle text-positive-text ring-positive/20',
  warning: 'bg-warning-subtle text-warning-text ring-warning/25',
  critical: 'bg-critical-subtle text-critical-text ring-critical/25',
};

export interface StatusDotProps {
  tone: StatusTone;
  /** Draws attention to the one or two rows that genuinely cannot wait. */
  pulse?: boolean | undefined;
  className?: string | undefined;
}

export function StatusDot({ tone, pulse = false, className }: StatusDotProps) {
  return (
    <span className={cn('relative flex size-1.5 shrink-0', className)} aria-hidden="true">
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full opacity-60',
            // motion-safe only: a pulsing dot is genuinely painful for some
            // vestibular conditions, and the colour already carries the signal.
            'motion-reduce:hidden',
            TONE_DOT[tone],
          )}
        />
      )}
      <span className={cn('relative inline-flex size-1.5 rounded-full', TONE_DOT[tone])} />
    </span>
  );
}

export interface BadgeProps {
  tone?: StatusTone | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5',
        'text-2xs font-medium whitespace-nowrap uppercase tracking-wide',
        // A ring rather than a border: it does not affect layout, so badges
        // never nudge the tight row rhythm out of alignment.
        'ring-1 ring-inset',
        TONE_BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
