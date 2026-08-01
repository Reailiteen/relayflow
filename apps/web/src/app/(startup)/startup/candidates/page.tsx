import { ANY_STARTUP, can } from '@relayflow/access';
import { redirect } from 'next/navigation';
import { getStartupPools } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { ViewSwitch } from '@/components/view-switch';
import { CandidateBoard } from './_board';
import { PoolCandidateRow } from './_pool';

export const metadata = { title: 'Candidates' };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * Candidate pools, grouped by the position they were shared against.
 *
 * Grouping by position rather than showing one flat list matters because the
 * same candidate can appear in two of a startup's pools, and "which role am I
 * hiring them for?" is the question a selection answers.
 *
 * The list view is for reading a candidate properly — CV links, interview
 * summary, the whole record. The board view is for running the process: who is
 * waiting on us, who is stuck before an interview, and how close the deadline
 * is. Same pools, same rules, two ways of standing in front of them.
 */
export default async function StartupCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ view }, actor, ctx] = await Promise.all([searchParams, getActor(), getContext()]);
  const activeCycle = await ctx.repos.cycles.findActive();
  if (activeCycle.ok && activeCycle.data) {
    redirect(`/startup/cycles/${activeCycle.data.id}/selection`);
  }
  const result = await getStartupPools(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { pools, selectionDeadline, deadlinePassed, hasApprovedException } = result.data;
  const board = view === 'board';
  // A supervisor runs interviews but does not commit the startup to a hire, so
  // they get a board they can read rather than one that refuses them at the end.
  const editable = can(actor, { capability: 'selection:create', startupId: ANY_STARTUP });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-sm text-text-muted">
          {deadlinePassed ? 'Selection closed' : 'Selection closes'} {date(selectionDeadline)}.
          Candidates are reserved first-come-first-served.
        </p>
        <ViewSwitch
          current={board ? 'board' : 'list'}
          options={[
            { value: 'list', label: 'List', href: '/startup/candidates' },
            { value: 'board', label: 'Board', href: '/startup/candidates?view=board' },
          ]}
        />
      </header>

      {pools.length === 0 ? (
        <Panel>
          <PanelHeader title="Candidate pools" />
          <EmptyState>
            No pools yet. QSTP shares candidates once your positions are approved.
          </EmptyState>
        </Panel>
      ) : (
        pools.map((pool) => (
          <Panel key={pool.position.id}>
            <PanelHeader
              title={pool.position.title}
              aside={
                <>
                  <Badge tone="neutral">
                    {pool.position.internCount} seat{pool.position.internCount === 1 ? '' : 's'}
                  </Badge>
                  <span className="text-xs text-text-muted">{pool.candidates.length} in pool</span>
                </>
              }
            />
            {pool.candidates.length === 0 ? (
              <EmptyState>No candidates shared for this role yet.</EmptyState>
            ) : board ? (
              <CandidateBoard
                pool={pool}
                deadlinePassed={deadlinePassed}
                hasApprovedException={hasApprovedException}
                editable={editable}
              />
            ) : (
              pool.candidates.map((row) => (
                <PoolCandidateRow key={row.entry.id} row={row} positionId={pool.position.id} />
              ))
            )}
          </Panel>
        ))
      )}

      {board && !editable && (
        <p className="px-1 text-xs text-text-muted">
          You can follow the pipeline but not change it. Selecting a candidate commits the startup
          to a hire and is reserved for owners and members.
        </p>
      )}
    </div>
  );
}
