import { Check, Circle, CircleDot, X } from 'lucide-react';
import type { JourneyStepView } from '@relayflow/logic';
import { cn } from '@relayflow/ui-web';

/**
 * The candidate's journey as a vertical stepper.
 *
 * A stepper rather than a status list because the value is knowing *where you
 * are in something* — that there are five stages, which are behind you, and how
 * many remain. A list of statuses answers none of that.
 *
 * The connector line between steps is drawn per-step rather than as a single
 * background rule, so it can be coloured to show progress rather than just
 * decorating the column.
 */
export function Journey({ steps }: { steps: readonly JourneyStepView[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const done = step.state === 'done';
        const current = step.state === 'current';
        const blocked = step.state === 'blocked';

        return (
          <li key={step.step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full ring-1',
                  done && 'bg-positive text-white ring-positive',
                  current && 'bg-accent text-accent-text ring-accent',
                  blocked && 'bg-surface-sunken text-text-muted ring-border',
                  step.state === 'upcoming' && 'bg-surface text-text-muted ring-border',
                )}
                aria-hidden="true"
              >
                {done ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : blocked ? (
                  <X className="size-3.5" strokeWidth={3} />
                ) : current ? (
                  <CircleDot className="size-3.5" />
                ) : (
                  <Circle className="size-2.5" />
                )}
              </span>

              {!last && (
                <span
                  className={cn('w-px flex-1', done ? 'bg-positive/40' : 'bg-border')}
                  aria-hidden="true"
                />
              )}
            </div>

            <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-5')}>
              <div className="flex items-center gap-2">
                <h3
                  className={cn(
                    'text-base font-medium',
                    current ? 'text-text' : blocked ? 'text-text-muted' : 'text-text-secondary',
                  )}
                >
                  {step.label}
                </h3>
                {current && (
                  <span className="rounded-sm bg-accent-subtle px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-accent">
                    you are here
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-base text-text-muted">{step.summary}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
