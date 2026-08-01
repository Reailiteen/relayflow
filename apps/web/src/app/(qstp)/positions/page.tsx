import { can } from '@relayflow/access';
import { totalWeeklyHours } from '@relayflow/entities';
import { getPositionTracker, type PositionRow as PositionRowData } from '@relayflow/logic';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { PositionStatusBadge, ReviewActions } from './_review';

export const metadata = { title: 'Positions' };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Flow 3: track position submissions and review them.
 *
 * Two panels because there are two different problems. Roles that arrived and
 * need a decision are work QSTP can do now; startups that have submitted
 * nothing are work QSTP has to chase. Mixing them into one list would hide the
 * second behind the first.
 */
export default async function PositionsPage() {
  const actor = await getActor();
  const ctx = await getContext();
  const result = await getPositionTracker(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { rows, notStarted, submissionDeadline, deadlinePassed } = result.data;
  const canReview = can(actor, { capability: 'position:review' });
  const awaiting = rows.filter(
    (row) => row.position.status === 'submitted' || row.position.status === 'changes_requested',
  );
  const settled = rows.filter(
    (row) => row.position.status !== 'submitted' && row.position.status !== 'changes_requested',
  );

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-text-muted">
          Submissions closed {date(submissionDeadline)}
          {deadlinePassed ? ' — the deadline has passed.' : '.'}
        </p>
      </header>

      <MetricBar className="lg:grid-cols-4">
        <Metric label="Roles submitted" value={rows.length} />
        <Metric
          label="Awaiting review"
          value={awaiting.length}
          tone={awaiting.length > 0 ? 'warning' : 'default'}
        />
        <Metric label="Approved" value={rows.filter((r) => r.position.status === 'approved').length} />
        <Metric
          label="Startups silent"
          value={notStarted.length}
          tone={notStarted.length > 0 ? 'critical' : 'default'}
        />
      </MetricBar>

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
          awaiting.map((row) => (
            <PositionRow key={row.position.id} row={row} canReview={canReview} />
          ))
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

      {settled.length > 0 && (
        <Panel>
          <PanelHeader
            title="Decided"
            aside={<span className="text-xs text-text-muted">{settled.length}</span>}
          />
          {settled.map((row) => (
            <PositionRow key={row.position.id} row={row} canReview={false} />
          ))}
        </Panel>
      )}
    </div>
  );
}

function PositionRow({ row, canReview }: { row: PositionRowData; canReview: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{row.position.title}</span>
          <PositionStatusBadge status={row.position.status} />
          <span className="text-sm text-text-muted">{row.startup?.name ?? 'Unknown startup'}</span>
        </div>
        <p className="mt-0.5 text-sm text-text-muted">
          {row.position.internCount} intern{row.position.internCount === 1 ? '' : 's'} ·{' '}
          {row.position.hoursPerIntern}h each ={' '}
          <span className="font-medium text-text-secondary">
            {totalWeeklyHours(row.position)}h/week
          </span>{' '}
          · {row.position.durationWeeks} weeks
          {row.position.supervisorName && ` · ${row.position.supervisorName}`}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {row.poolSize} in pool · {row.selectionCount} selected
        </p>
        {row.position.reviewNote && (
          <p className="mt-1 text-sm text-warning-text">Sent back: {row.position.reviewNote}</p>
        )}
      </div>

      {canReview && <ReviewActions positionId={row.position.id} title={row.position.title} />}
    </div>
  );
}
