import Link from 'next/link';
import { Plus } from 'lucide-react';
import { totalWeeklyHours } from '@relayflow/entities';
import { getStartupPositions } from '@relayflow/logic';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getContext } from '@/server/context';

export const metadata = { title: 'Positions' };

const STATUS_TONE = {
  draft: 'neutral',
  submitted: 'info',
  changes_requested: 'warning',
  approved: 'positive',
  filled: 'positive',
  withdrawn: 'neutral',
} as const;

export default async function StartupPositionsPage() {
  const ctx = await getContext();
  const result = await getStartupPositions(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { positions, allocatedHours, usedHours, remainingHours } = result.data;
  const canAddMore = remainingHours > 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-3">
      <MetricBar className="lg:grid-cols-3">
        <Metric label="Allocated" value={allocatedHours} hint="weekly hours" />
        <Metric label="Used by roles" value={usedHours} />
        <Metric label="Remaining" value={remainingHours} tone={canAddMore ? 'accent' : 'default'} />
      </MetricBar>

      <Panel>
        <PanelHeader
          title="Your positions"
          aside={
            canAddMore ? (
              <Link
                href="/startup/positions/new"
                className="inline-flex h-6 items-center gap-1 rounded-md bg-accent px-2 text-xs font-medium text-accent-text hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-3" aria-hidden="true" />
                Add role
              </Link>
            ) : (
              // Not a disabled button: there is a real reason, and stating it
              // is more useful than a greyed control with no explanation.
              <span className="text-xs text-text-muted">
                {allocatedHours === 0 ? 'No hours allocated' : 'All hours assigned'}
              </span>
            )
          }
        />

        {positions.length === 0 ? (
          <EmptyState>
            No roles yet.{' '}
            {allocatedHours > 0 ? (
              <Link href="/startup/positions/new" className="text-accent hover:underline">
                Submit your first position
              </Link>
            ) : (
              'You have not been allocated hours this cycle.'
            )}
          </EmptyState>
        ) : (
          positions.map((position) => (
            <div
              key={position.id}
              className="flex items-start gap-3 border-b border-border px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{position.title}</span>
                  <Badge tone={STATUS_TONE[position.status]}>
                    {position.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-text-muted">
                  {position.internCount} intern{position.internCount === 1 ? '' : 's'} ·{' '}
                  {position.hoursPerIntern}h each · {position.durationWeeks} weeks
                  {position.supervisorName && ` · ${position.supervisorName}`}
                </p>
                {position.requiredSkills.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {position.requiredSkills.join(' · ')}
                  </p>
                )}
                {position.reviewNote && (
                  <p className="mt-1 text-sm text-warning-text">QSTP: {position.reviewNote}</p>
                )}
              </div>

              <span className="shrink-0 text-md font-semibold tabular-nums text-text-secondary">
                {totalWeeklyHours(position)}h
              </span>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
