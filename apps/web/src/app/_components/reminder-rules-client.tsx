'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, cn } from '@relayflow/ui-web';
import { updateReminderRuleAction } from '@/server/actions';

/**
 * The reminder settings screen.
 *
 * What is deliberately absent here matters as much as what is present: there is
 * no way to write a predicate, name a template, or create a rule. Those live in
 * SQL next to the tables they read, and a settings screen that could express
 * them could express a wrong one — a rule watching for a condition the system
 * cannot detect, silently never firing, and looking configured the whole time.
 *
 * So every control below is a knob on a rule that already exists, and the worst
 * a mistake here can do is make a message arrive at an unhelpful moment.
 */

export interface RuleRowView {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly trigger: 'schedule' | 'state' | 'event';
  readonly audience: string;
  readonly usesScheduleOffset: boolean;
  readonly enabled: boolean;
  readonly scheduleOffsetHours: number | null;
  readonly preferredChannels: readonly string[];
  readonly mandatory: boolean;
  readonly urgent: boolean;
  readonly escalationAfterHours: number | null;
  readonly overriddenForCycle: boolean;
  readonly usingDefaults: boolean;
}

const OPTIONAL_CHANNELS = ['email', 'slack', 'push'] as const;

const TRIGGER_LABEL: Record<RuleRowView['trigger'], string> = {
  schedule: 'before a deadline',
  state: 'while something is wrong',
  event: 'the moment it happens',
};

const select =
  'rounded-[6px] border border-hairline-strong bg-surface px-2 py-1 text-xs text-ink-2';

export function ReminderRulesEditor({
  rules,
  cycleId,
}: {
  rules: readonly RuleRowView[];
  cycleId: string | null;
}) {
  return (
    <div>
      {rules.map((rule) => (
        <RuleRow key={rule.key} rule={rule} cycleId={cycleId} />
      ))}
    </div>
  );
}

function RuleRow({ rule, cycleId }: { rule: RuleRowView; cycleId: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(rule);

  const save = (next: RuleRowView) => {
    setDraft(next);
    setError(null);
    startTransition(async () => {
      const result = await updateReminderRuleAction({
        ruleKey: next.key,
        cycleId,
        enabled: next.enabled,
        scheduleOffsetHours: next.usesScheduleOffset ? next.scheduleOffsetHours : null,
        preferredChannels: next.preferredChannels,
        mandatory: next.mandatory,
        urgent: next.urgent,
        escalationAfterHours: next.escalationAfterHours,
      });
      // Put the control back where it was. One that stays where you left it
      // after a failed save is a control that lies about what is stored.
      if (!result.ok) {
        setDraft(rule);
        setError(result.message);
      }
    });
  };

  const toggleChannel = (channel: string) => {
    save({
      ...draft,
      preferredChannels: draft.preferredChannels.includes(channel)
        ? draft.preferredChannels.filter((row) => row !== channel)
        : [...draft.preferredChannels, channel],
    });
  };

  return (
    <div
      className={cn(
        'border-b border-border px-3 py-2.5 last:border-b-0',
        pending && 'opacity-50',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{rule.name}</span>
            {!draft.enabled && <Badge tone="neutral">off</Badge>}
            {rule.overriddenForCycle && <Badge tone="warning">cycle override</Badge>}
            <span className="text-xs text-text-muted">{TRIGGER_LABEL[rule.trigger]}</span>
          </div>

          <p className="mt-1 max-w-2xl text-sm text-text-secondary">{rule.description}</p>
          <p className="mt-0.5 text-xs text-text-muted">Goes to {rule.audience.toLowerCase()}.</p>
        </div>

        <Button
          size="xs"
          variant={draft.enabled ? 'secondary' : 'primary'}
          disabled={pending}
          onClick={() => save({ ...draft, enabled: !draft.enabled })}
        >
          {draft.enabled ? 'Turn off' : 'Turn on'}
        </Button>
      </div>

      {draft.enabled && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
          {/*
            Only for schedule rules. A state rule fires when its condition
            becomes true, so an offset here would be a number somebody sets,
            saves, and watches do nothing.
          */}
          {rule.usesScheduleOffset && (
            <label className="flex items-center gap-1.5">
              Send
              <select
                className={select}
                value={String(draft.scheduleOffsetHours ?? -72)}
                disabled={pending}
                onChange={(event) =>
                  save({ ...draft, scheduleOffsetHours: Number(event.target.value) })
                }
              >
                <option value="-24">a day before</option>
                <option value="-48">2 days before</option>
                <option value="-72">3 days before</option>
                <option value="-168">a week before</option>
              </select>
            </label>
          )}

          <div className="flex items-center gap-1.5">
            Also by
            {OPTIONAL_CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                disabled={pending}
                onClick={() => toggleChannel(channel)}
                className={cn(
                  'rounded-[6px] px-2 py-[3px] text-[10px] font-bold uppercase',
                  'tracking-[0.04em] ring-1 ring-inset transition-colors',
                  draft.preferredChannels.includes(channel)
                    ? 'text-accent ring-accent'
                    : 'text-ink-3 ring-hairline hover:text-ink-2',
                )}
              >
                {channel}
              </button>
            ))}
            {/*
              In-app is not offered as a choice because it is not one. It is the
              durable record — the row a person can open, mark read and argue
              with — and a rule that skipped it could deliver only to channels
              that bounce, leaving nothing to show anyone was told.
            */}
            <span>· in-app always</span>
          </div>

          <label className="flex items-center gap-1.5" title="Recipients cannot mute this one.">
            <input
              type="checkbox"
              checked={draft.mandatory}
              disabled={pending}
              onChange={(event) => save({ ...draft, mandatory: event.target.checked })}
            />
            Cannot be muted
          </label>

          <label
            className="flex items-center gap-1.5"
            title="Sent immediately rather than batched into a digest."
          >
            <input
              type="checkbox"
              checked={draft.urgent}
              disabled={pending}
              onChange={(event) => save({ ...draft, urgent: event.target.checked })}
            />
            Urgent
          </label>

          <label className="flex items-center gap-1.5">
            Escalate to QSTP after
            <select
              className={select}
              value={String(draft.escalationAfterHours ?? '')}
              disabled={pending}
              onChange={(event) =>
                save({
                  ...draft,
                  escalationAfterHours:
                    event.target.value === '' ? null : Number(event.target.value),
                })
              }
            >
              <option value="">never</option>
              <option value="24">a day</option>
              <option value="48">2 days</option>
              <option value="72">3 days</option>
            </select>
          </label>
        </div>
      )}

      {error && <p className="mt-1.5 text-sm text-critical-text">{error}</p>}
    </div>
  );
}
