import Link from 'next/link';
import { listStartupSummaries } from '@relayflow/logic';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader, Row } from '@relayflow/ui-web';
import { getContext } from '@/server/context';

export const metadata = { title: 'Startups' };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Every startup in the cycle, worst first.
 *
 * The ordering is the design: problems, then silence, then size. A list sorted
 * alphabetically buries the two companies that actually need chasing behind
 * four that are fine.
 */
export default async function StartupsPage() {
  const ctx = await getContext();
  const result = await listStartupSummaries(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const summaries = result.data;
  const funded = summaries.filter((summary) => summary.allocatedHours > 0);
  const overdue = summaries.filter((summary) => summary.overdue);
  const silent = summaries.filter((summary) => summary.silent);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-text-muted">Ordered by what needs attention, not by name.</p>
      </header>

      <MetricBar className="lg:grid-cols-4">
        <Metric label="Startups" value={summaries.length} />
        <Metric label="Funded" value={funded.length} hint="hold hours" />
        <Metric
          label="No positions"
          value={silent.length}
          tone={silent.length > 0 ? 'warning' : 'default'}
        />
        <Metric
          label="Past deadline"
          value={overdue.length}
          tone={overdue.length > 0 ? 'critical' : 'default'}
        />
      </MetricBar>

      <Panel>
        <PanelHeader
          title="All startups"
          aside={<span className="text-xs tabular-nums text-text-muted">{summaries.length}</span>}
        />
        {summaries.length === 0 ? (
          <EmptyState>No startups in this cycle.</EmptyState>
        ) : (
          summaries.map((summary) => (
            <Row
              key={summary.startup.id}
              tone={
                summary.overdue
                  ? 'critical'
                  : summary.silent
                    ? 'warning'
                    : summary.allocatedHours === 0
                      ? 'neutral'
                      : 'positive'
              }
              kind={summary.allocatedHours === 0 ? 'Waitlisted' : `${summary.allocatedHours}h/week`}
              subject={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{summary.startup.name}</span>
                  {summary.startup.sector && (
                    <span className="text-sm text-text-muted">{summary.startup.sector}</span>
                  )}
                  {summary.hasApprovedException && <Badge tone="positive">extended</Badge>}
                  {summary.overdue && <Badge tone="critical">past deadline</Badge>}
                  {summary.silent && <Badge tone="warning">no positions</Badge>}
                </span>
              }
              detail={
                <span className="hidden sm:inline">
                  {summary.positionCount} role{summary.positionCount === 1 ? '' : 's'} ·{' '}
                  {summary.selectionCount} selected · due {date(summary.selectionDeadline)}
                </span>
              }
              href="/allocation"
            />
          ))
        )}
      </Panel>

      <p className="px-1 text-xs text-text-muted">
        Hour tiers are assigned on the{' '}
        <Link href="/allocation" className="text-accent hover:underline">
          allocation
        </Link>{' '}
        screen.
      </p>
    </div>
  );
}
