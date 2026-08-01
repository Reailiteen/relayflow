import Link from 'next/link';
import { can } from '@relayflow/access';
import { listStartupSummaries } from '@relayflow/logic';
import { EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { ViewSwitch } from '@/components/view-switch';
import { StartupCycleBoard } from './_board';
import { StartupTable } from './_table';

export const metadata = { title: 'Startups' };

/**
 * Every startup in the cycle, as a list or as a board.
 *
 * Both come from one read, because they are two shapes of the same answer and
 * must never disagree. The list is for comparing — hours down a column, sorted
 * by who needs chasing. The board is for locating: a tall column is a
 * bottleneck, and you can see it from across the room.
 *
 * The choice lives in the URL rather than in a stored preference, so a link to
 * "the board with everything stuck in review" is a link somebody can send.
 */
export default async function StartupsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ view }, actor, ctx] = await Promise.all([searchParams, getActor(), getContext()]);
  const result = await listStartupSummaries(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const summaries = result.data;
  const board = view === 'board';
  // Dragging a card shares a candidate pool. A viewer gets the board to read,
  // not a board that refuses every move it appears to offer.
  const editable = can(actor, { capability: 'candidate:share_pool' });

  const funded = summaries.filter((summary) => summary.allocatedHours > 0);
  const attention = summaries.filter((summary) => summary.flags.length > 0);
  const atRisk = summaries.filter((summary) => summary.flags.includes('hours_at_risk'));

  return (
    // `h-full` so the board fills the work area and each column scrolls on its
    // own. Without it the tallest column stretches the page and the "which
    // column is longest" read — the entire reason for a board — is lost.
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm text-text-muted">
            {board
              ? 'Each card is a startup. Stages are derived from what has happened, not set by hand.'
              : 'Ordered by what needs attention, not by name.'}
          </p>
          <ViewSwitch
            current={board ? 'board' : 'table'}
            options={[
              { value: 'table', label: 'Table', href: '/startups' },
              { value: 'board', label: 'Board', href: '/startups?view=board' },
            ]}
          />
        </header>

        <MetricBar className="lg:grid-cols-4">
          <Metric label="Startups" value={summaries.length} />
          <Metric label="Funded" value={funded.length} hint="hold hours" />
          <Metric
            label="Need attention"
            value={attention.length}
            tone={attention.length > 0 ? 'warning' : 'default'}
          />
          <Metric
            label="Hours at risk"
            value={atRisk.reduce((total, summary) => total + summary.allocatedHours, 0)}
            hint="per week"
            tone={atRisk.length > 0 ? 'critical' : 'default'}
          />
        </MetricBar>
      </div>

      {summaries.length === 0 ? (
        <div className="mx-auto w-full max-w-[1600px] px-[var(--rf-page-x)] pt-[var(--rf-gap)] pb-10">
          <Panel>
            <EmptyState>No startups in this cycle.</EmptyState>
          </Panel>
        </div>
      ) : board ? (
        <StartupCycleBoard rows={summaries} editable={editable} />
      ) : (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-gap)] pb-10">
          <Panel>
            <PanelHeader
              title="All startups"
              aside={
                <span className="text-xs tabular-nums text-text-muted">{summaries.length}</span>
              }
            />
            <StartupTable rows={summaries} />
          </Panel>

          <p className="px-1 text-xs text-text-muted">
            Hour tiers are assigned on the{' '}
            <Link href="/allocation" className="text-accent hover:underline">
              allocation
            </Link>{' '}
            screen.
          </p>
        </div>
      )}
    </div>
  );
}
