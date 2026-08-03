'use client';

import { useState, useTransition } from 'react';
import { cn } from '@relayflow/ui-web';
import { updateNotificationPreferenceAction } from '@/server/actions';

/**
 * One person's own channel choices, as a category × channel grid.
 *
 * Per category rather than per rule. Eight rules times four channels is
 * thirty-two switches, which is a screen nobody configures and everybody
 * abandons. Categories are the unit people actually think in — "deadlines by
 * email, the rest in-app only" — and there are six of them.
 *
 * Locked cells render as locked and say why. A switch that silently does
 * nothing is worse than an absent one: it teaches people their settings are
 * being ignored, and then they stop reading the notifications too.
 */

export interface PreferenceCellView {
  readonly channel: string;
  readonly enabled: boolean;
  readonly mutable: boolean;
}

export interface PreferenceRowView {
  readonly category: string;
  readonly channels: readonly PreferenceCellView[];
}

const CATEGORY_LABEL: Record<string, string> = {
  deadline: 'Deadlines',
  selection: 'Selection',
  exception: 'Extensions',
  onboarding: 'Onboarding',
  candidate: 'Candidates',
  system: 'System',
};

const LOCKED_REASON: Record<string, string> = {
  in_app: 'The durable record of what you were told. Always on.',
  deadline: 'Deadline notices carry consequences and cannot be muted.',
};

export function NotificationPreferences({ rows }: { rows: readonly PreferenceRowView[] }) {
  const channels = rows[0]?.channels.map((cell) => cell.channel) ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-text-muted">
            <th className="px-3 py-2 text-left font-medium">Category</th>
            {channels.map((channel) => (
              <th key={channel} className="px-3 py-2 text-left font-medium capitalize">
                {channel === 'in_app' ? 'In-app' : channel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2 font-medium">
                {CATEGORY_LABEL[row.category] ?? row.category}
              </td>
              {row.channels.map((cell) => (
                <td key={cell.channel} className="px-3 py-2">
                  <PreferenceToggle category={row.category} cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreferenceToggle({
  category,
  cell,
}: {
  category: string;
  cell: PreferenceCellView;
}) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(cell.enabled);
  const [error, setError] = useState<string | null>(null);

  if (!cell.mutable) {
    return (
      <span
        className="text-xs text-text-muted"
        title={LOCKED_REASON[cell.channel] ?? LOCKED_REASON[category] ?? 'Always on.'}
      >
        Always on
      </span>
    );
  }

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await updateNotificationPreferenceAction({
        category,
        channel: cell.channel,
        enabled: next,
      });
      if (!result.ok) {
        setEnabled(cell.enabled);
        setError(result.message);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${category} by ${cell.channel}`}
        disabled={pending}
        onClick={toggle}
        className={cn(
          'relative h-[18px] w-8 rounded-full transition-colors',
          enabled ? 'bg-accent' : 'bg-hairline-strong',
          pending && 'opacity-50',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] size-[14px] rounded-full bg-white transition-[left]',
            enabled ? 'left-[16px]' : 'left-[2px]',
          )}
        />
      </button>
      {error && <span className="text-xs text-critical-text">{error}</span>}
    </div>
  );
}
