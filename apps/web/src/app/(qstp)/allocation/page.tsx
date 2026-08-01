import { can } from '@relayflow/access';
import { getAllocationWorkspace } from '@relayflow/logic';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { redirectToActiveCycleWorkspace } from '@/server/context';
import { AllocationTable } from './_table';

export const metadata = { title: 'Allocation' };

/**
 * Stage 1: score startups and assign hour tiers.
 *
 * The screen is a single ranked table rather than a card per startup, because
 * allocation is a comparative decision — you are deciding who gets 60 relative
 * to everyone else, so they have to be readable side by side.
 *
 * The remaining-hours counter is pinned above the table and updates as tiers
 * change, since "can I afford this?" is the question being asked on every row.
 */
export default async function AllocationPage() {
  await redirectToActiveCycleWorkspace('qstp', 'allocation');
  const actor = await getActor();
  const ctx = await getContext();
  const result = await getAllocationWorkspace(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { budget, rows } = result.data;
  const editable = can(actor, { capability: 'allocation:decide' });

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-text-muted">
          {editable ? 'Assign weekly hour tiers.' : 'Read-only — you cannot change allocations.'}
        </p>
      </header>

      <MetricBar className="lg:grid-cols-4">
        <Metric label="Funded / week" value={budget.funded} />
        <Metric label="Allocated" value={budget.allocated} hint={`of ${budget.funded}`} />
        <Metric
          label="Remaining to allocate"
          value={budget.unallocated}
          tone={budget.unallocated === 0 ? 'critical' : 'accent'}
        />
        <Metric label="Startups" value={rows.length} />
      </MetricBar>

      <Panel>
        <PanelHeader
          title="Startups by score"
          aside={
            <Badge tone={budget.unallocated > 0 ? 'positive' : 'warning'}>
              {budget.unallocated} h available
            </Badge>
          }
        />
        {rows.length === 0 ? (
          <EmptyState>No startups in this cycle yet.</EmptyState>
        ) : (
          <AllocationTable rows={rows} remaining={budget.unallocated} editable={editable} />
        )}
      </Panel>
    </div>
  );
}
