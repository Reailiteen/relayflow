import { getStartupPools } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
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
 */
export default async function StartupCandidatesPage() {
  const ctx = await getContext();
  const result = await getStartupPools(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { pools, selectionDeadline } = result.data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-3">
      <p className="text-sm text-text-muted">
        Selection closes {date(selectionDeadline)}. Candidates are reserved first-come-first-served.
      </p>

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
            ) : (
              pool.candidates.map((row) => (
                <PoolCandidateRow key={row.entry.id} row={row} positionId={pool.position.id} />
              ))
            )}
          </Panel>
        ))
      )}
    </div>
  );
}
