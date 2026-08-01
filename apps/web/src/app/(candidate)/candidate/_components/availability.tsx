'use client';

import { useState, useTransition } from 'react';
import { Briefcase, CalendarX, CircleCheck, ThumbsDown } from 'lucide-react';
import { Button, Panel, PanelHeader, cn } from '@relayflow/ui-web';
import { confirmAvailabilityAction } from '@/server/actions';

/**
 * "Are you still available?"
 *
 * The brief calls this the answer to one of the programme's biggest problems —
 * startups interviewing people who took another job weeks ago. So it is four
 * large buttons and nothing else: no form, no dropdown, no confirm step. The
 * whole interaction is one tap from an emailed link.
 *
 * The negative options are given the same visual weight as the positive one.
 * Making "I'm no longer interested" hard to find is how you end up with stale
 * data, which is the failure this screen exists to prevent.
 */
const OPTIONS = [
  {
    value: 'available',
    label: "Yes, I'm available",
    detail: 'Keep me in the running for internships.',
    icon: CircleCheck,
    tone: 'positive',
  },
  {
    value: 'employed',
    label: "I've taken another job",
    detail: 'Remove me from consideration.',
    icon: Briefcase,
    tone: 'neutral',
  },
  {
    value: 'not_interested',
    label: 'No longer interested',
    detail: "I'd rather not continue this cycle.",
    icon: ThumbsDown,
    tone: 'neutral',
  },
  {
    value: 'temporarily_unavailable',
    label: 'Not right now',
    detail: 'Unavailable for this cycle, but ask me again.',
    icon: CalendarX,
    tone: 'neutral',
  },
] as const;

export function AvailabilityPrompt({ current }: { current: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const confirm = (status: string) => {
    setError(null);
    setBusy(status);
    startTransition(async () => {
      const result = await confirmAvailabilityAction({ status, note: null });
      if (!result.ok) setError(result.message);
      setBusy(null);
    });
  };

  return (
    <Panel>
      <PanelHeader title="Are you still available?" />

      <div className="flex flex-col gap-1.5 p-3">
        <p className="mb-1 text-base text-text-secondary">
          Startups are reviewing candidates now. Telling us where you stand takes one tap and saves
          everyone a wasted interview.
        </p>

        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = current === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={pending}
              onClick={() => confirm(option.value)}
              aria-pressed={selected}
              className={cn(
                'flex items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                'ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-accent-subtle ring-accent'
                  : 'bg-surface ring-border hover:bg-surface-hover hover:ring-border-strong',
                busy === option.value && 'opacity-50',
                'disabled:cursor-not-allowed',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  option.tone === 'positive' ? 'text-positive' : 'text-text-muted',
                )}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-base font-medium">{option.label}</span>
                <span className="block text-sm text-text-muted">{option.detail}</span>
              </span>
            </button>
          );
        })}

        {error && <p className="mt-1 text-sm text-critical-text">{error}</p>}
      </div>
    </Panel>
  );
}

/** Compact restatement once they have answered, with a way to change it. */
export function AvailabilitySummary({ current }: { current: string }) {
  const [changing, setChanging] = useState(false);
  const option = OPTIONS.find((o) => o.value === current);

  if (changing) return <AvailabilityPrompt current={current} />;

  return (
    <Panel>
      <PanelHeader
        title="Your availability"
        aside={
          <Button size="xs" variant="ghost" onClick={() => setChanging(true)}>
            Change
          </Button>
        }
      />
      <p className="px-3 py-2.5 text-base">
        {current === 'placed'
          ? 'You have been placed for this cycle.'
          : (option?.label ?? 'Not confirmed')}
      </p>
    </Panel>
  );
}
