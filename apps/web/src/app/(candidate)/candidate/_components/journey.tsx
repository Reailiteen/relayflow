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
          <li key={step.step} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
                  done && 'bg-positive text-white ring-positive',
                  current && 'bg-panel text-brand ring-2 ring-brand',
                  blocked && 'bg-surface-sunken text-ink-3 ring-hairline-strong',
                  step.state === 'upcoming' && 'bg-canvas text-ink-3 ring-hairline-strong',
                )}
                aria-hidden="true"
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : blocked ? (
                  <X className="size-4" strokeWidth={3} />
                ) : current ? (
                  <CircleDot className="size-4" />
                ) : (
                  <Circle className="size-3" />
                )}
              </span>

              {!last && (
                <span
                  className={cn('w-[3px] flex-1 rounded-full', done ? 'bg-positive' : 'bg-hairline-strong')}
                  aria-hidden="true"
                />
              )}
            </div>

            <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-6')}>
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={cn(
                    'text-sm font-semibold',
                    current ? 'text-brand' : blocked ? 'text-ink-3' : 'text-ink',
                  )}
                >
                  {step.label}
                </h3>
                {current && (
                  <span className="rounded-[6px] bg-brand-tint px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-brand">
                    you are here
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-3">{step.summary}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
