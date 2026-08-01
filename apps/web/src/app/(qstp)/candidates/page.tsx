import { can } from '@relayflow/access';
import { getCandidateAdminView } from '@relayflow/logic';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { ImportButton, SharePoolButton } from './_actions';

export const metadata = { title: 'Candidates' };

const AVAILABILITY = {
  available: { tone: 'positive', label: 'available' },
  unconfirmed: { tone: 'warning', label: 'not confirmed' },
  employed: { tone: 'critical', label: 'employed' },
  not_interested: { tone: 'critical', label: 'not interested' },
  temporarily_unavailable: { tone: 'critical', label: 'unavailable' },
  placed: { tone: 'neutral', label: 'placed' },
} as const;

/**
 * Flow 4: import candidate pools and control the handoff.
 *
 * QSTP is not matching candidates here — the pool comes from Deema or a CSV.
 * What this screen controls is who gets sent where, which is the part of Stage 3
 * that belongs to the programme rather than to the startups.
 */
export default async function CandidatesPage() {
  const actor = await getActor();
  const ctx = await getContext();
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
  const canImport = can(actor, { capability: 'candidate:import' });
  const canShare = can(actor, { capability: 'candidate:share_pool' });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-text-muted">
          Pools are imported, not matched. RelayFlow controls the handoff to startups.
        </p>
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

      <Panel>
        <PanelHeader
          title="Candidate pool"
          aside={
            <>
              {canImport && <ImportButton />}
              {canShare && <SharePoolButton rows={rows} positions={shareablePositions} />}
            </>
          }
        />

        {rows.length === 0 ? (
          <EmptyState>
            No candidates yet. Import a pool from Deema or paste a CSV to get started.
          </EmptyState>
        ) : (
          rows.map((row) => {
            const availability = AVAILABILITY[row.candidate.availability];
            return (
              <div
                key={row.candidate.id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{row.candidate.fullName}</span>
                    <Badge tone={availability.tone}>{availability.label}</Badge>
                    {row.heldBy && <Badge tone="info">held by {row.heldBy}</Badge>}
                    <span className="text-xs text-text-muted">via {row.candidate.source}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-text-muted">
                    {row.candidate.email}
                    {row.candidate.skills.length > 0 && ` · ${row.candidate.skills.join(' · ')}`}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {row.pools.length === 0 ? (
                      <span className="text-accent">Not shared with any position yet</span>
                    ) : (
                      row.pools
                        .map((pool) => `${pool.positionTitle} · ${pool.startupName}`)
                        .join('  |  ')
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </Panel>
    </div>
  );
}
