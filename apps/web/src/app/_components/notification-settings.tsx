import { EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getNotificationPreferences, listReminderRules } from '@relayflow/logic';
import { getContext } from '@/server/context';
import { NotificationPreferences } from './notification-preferences-client';
import { ReminderRulesEditor, type RuleRowView } from './reminder-rules-client';

/**
 * The server half of the settings screens.
 *
 * Two panels with two different audiences — the rules belong to QSTP, the
 * preferences belong to whoever is reading — so they render independently and
 * either can be absent. A startup owner sees only their own preferences and is
 * not shown an empty "you cannot configure rules" panel, because a permission
 * they do not have is not information they need.
 */

export async function ReminderRulesPanel({ cycleId }: { cycleId: string | null }) {
  const ctx = await getContext();
  const result = await listReminderRules(ctx, { cycleId });

  // Not an error state. `reminder:read` is QSTP-only, so a startup or candidate
  // reaching this page simply has no rules panel — which is the correct
  // rendering of "this is not yours", rather than a refusal they must dismiss.
  if (!result.ok) return null;

  const rules: RuleRowView[] = result.data.map((view) => ({
    key: view.rule.key,
    name: view.rule.name,
    description: view.rule.description,
    trigger: view.rule.trigger,
    audience: view.rule.audience,
    usesScheduleOffset: view.rule.usesScheduleOffset,
    enabled: view.effective.enabled,
    scheduleOffsetHours: view.effective.scheduleOffsetHours,
    preferredChannels: view.effective.preferredChannels,
    mandatory: view.effective.mandatory,
    urgent: view.effective.urgent,
    escalationAfterHours: view.effective.escalationAfterHours,
    overriddenForCycle: view.overriddenForCycle,
    usingDefaults: view.usingDefaults,
  }));

  return (
    <Panel>
      <PanelHeader
        title="Reminder rules"
        aside={
          <span className="text-xs text-text-muted">
            {cycleId === null ? 'Programme defaults' : 'This cycle'}
          </span>
        }
      />
      {rules.length === 0 ? (
        <EmptyState>No reminder rules are defined.</EmptyState>
      ) : (
        <ReminderRulesEditor rules={rules} cycleId={cycleId} />
      )}
    </Panel>
  );
}

export async function NotificationPreferencesPanel() {
  const ctx = await getContext();
  const result = await getNotificationPreferences(ctx, {});

  if (!result.ok) {
    return (
      <Panel>
        <PanelHeader title="How you hear from us" />
        <EmptyState>Your preferences could not be loaded.</EmptyState>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="How you hear from us"
        aside={<span className="text-xs text-text-muted">Applies to you only</span>}
      />
      <NotificationPreferences
        rows={result.data.map((row) => ({
          category: row.category,
          channels: row.channels.map((cell) => ({
            channel: cell.channel,
            enabled: cell.enabled,
            mutable: cell.mutable,
          })),
        }))}
      />
    </Panel>
  );
}
