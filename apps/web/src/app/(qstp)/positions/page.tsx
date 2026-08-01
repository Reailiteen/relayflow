import { can } from '@relayflow/access';
import { getPositionTracker } from '@relayflow/logic';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { ViewSwitch } from '@/components/view-switch';
import { PositionBoard } from './_board';
import { PositionTable } from './_table';

export const metadata = { title: 'Positions' };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Flow 3: track submissions and review them.
 *
 * Both views come from one read, so they cannot disagree. The table is for
 * reading the detail of a role — hours, supervisor, what was sent back. The
 * board is for working the queue: everything awaiting review is one column, and
 * a decision is a drag.
 *
 * Startups that submitted nothing sit outside both, in their own panel. They
 * are not a column because they have no card — the work there is chasing, not
 * reviewing, and folding them in would hide it.
 */
export default async function PositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ view }, actor, ctx] = await Promise.all([searchParams, getActor(), getContext()]);
  const result = await getPositionTracker(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { rows, notStarted, submissionDeadline, deadlinePassed } = result.data;
  const board = view === 'board';
  const canReview = can(actor, { capability: 'position:review' });

  const awaiting = rows.filter(
    (row) => row.stage === 'submitted' || row.stage === 'changes_requested',
  );
  const overAllocation = rows.filter((row) => row.facts.exceedsAllocation);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm text-text-muted">
            Submissions closed {date(submissionDeadline)}
            {deadlinePassed ? ' — the deadline has passed.' : '.'}
          </p>
          <ViewSwitch
            current={board ? 'board' : 'table'}
            options={[
              { value: 'table', label: 'Table', href: '/positions' },
              { value: 'board', label: 'Board', href: '/positions?view=board' },
            ]}
          />
        </header>

        <MetricBar className="lg:grid-cols-4">
          <Metric label="Roles submitted" value={rows.length} />
          <Metric
            label="Awaiting review"
            value={awaiting.length}
            tone={awaiting.length > 0 ? 'warning' : 'default'}
          />
          <Metric
            label="Over allocation"
            value={overAllocation.length}
            tone={overAllocation.length > 0 ? 'critical' : 'default'}
          />
          <Metric
            label="Startups silent"
            value={notStarted.length}
            tone={notStarted.length > 0 ? 'critical' : 'default'}
          />
        </MetricBar>
      </div>

      {board ? (
        <PositionBoard rows={rows} editable={canReview} />
      ) : (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-gap)] pb-10">
          <Panel>
            <PanelHeader
              title="Awaiting review"
              aside={
                awaiting.length > 0 ? (
                  <Badge tone="warning">{awaiting.length}</Badge>
                ) : (
                  <Badge tone="positive">clear</Badge>
                )
              }
            />
            {awaiting.length === 0 ? (
              <EmptyState>Nothing waiting on you.</EmptyState>
            ) : (
              <PositionTable rows={awaiting} canReview={canReview} />
            )}
          </Panel>

          {notStarted.length > 0 && (
            <Panel>
              <PanelHeader
                title="Allocated but nothing submitted"
                aside={<Badge tone="critical">{notStarted.length}</Badge>}
              />
              {notStarted.map((entry) => (
                <div
                  key={entry.startup.id}
                  className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{entry.startup.name}</div>
                    <p className="text-xs text-text-muted">
                      Holds {entry.allocatedHours} weekly hours and has submitted no roles.
                    </p>
                  </div>
                  <a
                    href={`mailto:${entry.startup.contactEmail}`}
                    className="shrink-0 text-sm text-accent hover:underline"
                  >
                    Email them
                  </a>
                </div>
              ))}
            </Panel>
          )}

          {rows.length > awaiting.length && (
            <Panel>
              <PanelHeader
                title="Decided"
                aside={
                  <span className="text-xs text-text-muted">{rows.length - awaiting.length}</span>
                }
              />
              <PositionTable
                rows={rows.filter(
                  (row) => row.stage !== 'submitted' && row.stage !== 'changes_requested',
                )}
                canReview={false}
              />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
