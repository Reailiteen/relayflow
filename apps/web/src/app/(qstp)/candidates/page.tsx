import { can } from '@relayflow/access';
import { getCandidateAdminView } from '@relayflow/logic';
import { EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { ViewSwitch } from '@/components/view-switch';
import { ImportButton, SharePoolButton } from './_actions';
import { CandidateBoard } from './_board';
import { CandidateTable } from './_table';

export const metadata = { title: 'Candidates' };

/**
 * Flow 4: import candidate pools and control the handoff.
 *
 * QSTP does no matching here — the pool comes from Deema or a CSV. What this
 * screen owns is who gets sent where, which is the part of Stage 3 that belongs
 * to the programme rather than to the startups.
 *
 * The board earns its place on this screen more than anywhere else: "Imported"
 * is a column of people nobody is looking at, and its height is the number that
 * should drive the next hour of work.
 */
export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ view }, actor, ctx] = await Promise.all([searchParams, getActor(), getContext()]);
  const result = await getCandidateAdminView(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { rows, shareablePositions, unassigned, unconfirmed } = result.data;
  const board = view === 'board';
  const canImport = can(actor, { capability: 'candidate:import' });
  const canShare = can(actor, { capability: 'candidate:share_pool' });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 pb-0">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm text-text-muted">
            {board
              ? 'Everyone in “Imported” is waiting on QSTP to send them somewhere.'
              : 'Pools are imported, not matched. RelayFlow controls the handoff.'}
          </p>
          <div className="flex items-center gap-1.5">
            {canImport && <ImportButton />}
            {canShare && <SharePoolButton rows={rows} positions={shareablePositions} />}
            <ViewSwitch
              current={board ? 'board' : 'table'}
              options={[
                { value: 'table', label: 'Table', href: '/candidates' },
                { value: 'board', label: 'Board', href: '/candidates?view=board' },
              ]}
            />
          </div>
        </header>

        <MetricBar className="lg:grid-cols-4">
          <Metric label="In this cycle" value={rows.length} />
          <Metric
            label="Not yet shared"
            value={unassigned}
            tone={unassigned > 0 ? 'accent' : 'default'}
          />
          <Metric
            label="Availability unknown"
            value={unconfirmed}
            tone={unconfirmed > 0 ? 'warning' : 'default'}
          />
          <Metric label="Reserved" value={rows.filter((row) => row.selection !== null).length} />
        </MetricBar>
      </div>

      {rows.length === 0 ? (
        <div className="mx-auto w-full max-w-[1400px] p-3">
          <Panel>
            <EmptyState>
              No candidates yet. Import a pool from Deema or paste a CSV to get started.
            </EmptyState>
          </Panel>
        </div>
      ) : board ? (
        <CandidateBoard rows={rows} positions={shareablePositions} editable={canShare} />
      ) : (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3">
          <Panel>
            <PanelHeader
              title="Candidate pool"
              aside={<span className="text-xs tabular-nums text-text-muted">{rows.length}</span>}
            />
            <CandidateTable rows={rows} />
          </Panel>
        </div>
      )}
    </div>
  );
}
