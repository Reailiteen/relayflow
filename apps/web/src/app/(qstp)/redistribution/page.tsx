import { can } from '@relayflow/access';
import { getQstpDashboard, getRedistributionPlan } from '@relayflow/logic';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { redirectToActiveCycleWorkspace } from '@/server/context';
import { ReclaimButton } from './_reclaim';
import { GrantButton } from './_grant';

export const metadata = { title: 'Redistribution' };

const number = (n: number) => new Intl.NumberFormat('en-GB').format(n);

/**
 * Flow 8: reclaim unused hours and offer them to waitlisted startups.
 *
 * Two panels, deliberately in this order: what can be taken back, then who
 * could receive it. Reclaiming is destructive to a company's participation in
 * the cycle, so each one is its own button with its own reason shown — there is
 * no "reclaim all".
 */
export default async function RedistributionPage() {
  await redirectToActiveCycleWorkspace('qstp', 'recovery');
  const actor = await getActor();
  const ctx = await getContext();
  const result = await getRedistributionPlan(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const plan = result.data;
  const canRun = can(actor, { capability: 'redistribution:run' });

  // Hours free to hand out right now. Reclaimed hours only become grantable
  // once they have actually been reclaimed, which is why this reads the live
  // budget rather than adding `totalReclaimable` to it.
  const dashboard = await getQstpDashboard(ctx, {});
  const available = dashboard.ok ? dashboard.data.budget.unallocated : 0;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-text-muted">
          {plan.deadlinePassed
            ? 'Selection has closed — unused hours can be reclaimed.'
            : 'Selection is still open. Nothing can be reclaimed yet.'}
        </p>
      </header>

      <MetricBar className="lg:grid-cols-3">
        <Metric
          label="Reclaimable now"
          value={number(plan.totalReclaimable)}
          hint="weekly hours"
          tone={plan.totalReclaimable > 0 ? 'warning' : 'default'}
        />
        <Metric label="From startups" value={plan.reclaimable.length} />
        <Metric label="Waiting to receive" value={plan.eligible.length} />
      </MetricBar>

      <Panel>
        <PanelHeader
          title="Hours that can be reclaimed"
          aside={
            plan.totalReclaimable > 0 ? (
              <Badge tone="warning">{plan.totalReclaimable} h</Badge>
            ) : (
              <Badge tone="positive">none</Badge>
            )
          }
        />
        {plan.reclaimable.length === 0 ? (
          <EmptyState>
            Every funded startup either selected candidates or holds an approved exception.
          </EmptyState>
        ) : (
          plan.reclaimable.map((source) => (
            <div
              key={source.startup.id}
              className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{source.startup.name}</div>
                <p className="truncate text-xs text-text-muted">{source.reason}</p>
              </div>
              <span className="shrink-0 text-md font-semibold tabular-nums text-warning-text">
                {source.hours}h
              </span>
              {canRun && (
                <ReclaimButton startupId={source.startup.id} startupName={source.startup.name} />
              )}
            </div>
          ))
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Eligible to receive"
          aside={
            <>
              <Badge tone={available > 0 ? 'positive' : 'neutral'}>{available} h available</Badge>
              <span className="text-xs text-text-muted">by score</span>
            </>
          }
        />
        {plan.eligible.length === 0 ? (
          <EmptyState>No waitlisted startups.</EmptyState>
        ) : (
          plan.eligible.map((row) => (
            <div
              key={row.startup.id}
              className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{row.startup.name}</div>
                <p className="text-xs text-text-muted">
                  Currently {row.currentHours}h
                  {row.recommended !== null && ` · scored for ${row.recommended}h`}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-text-secondary">
                {row.score ?? '—'}
              </span>
              {canRun && (
                <GrantButton
                  startupId={row.startup.id}
                  startupName={row.startup.name}
                  currentHours={row.currentHours}
                  recommended={row.recommended}
                  available={available}
                />
              )}
            </div>
          ))
        )}
      </Panel>

      {!canRun && (
        <p className="px-1 text-xs text-text-muted">
          Reclaiming hours reshapes the cycle budget and is restricted to the programme manager.
        </p>
      )}
    </div>
  );
}
