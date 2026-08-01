import { can } from '@relayflow/access';
import { listConflicts } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { ConflictCard } from './_conflict';

export const metadata = { title: 'Selection' };

/**
 * Flow 6: resolve candidate conflicts.
 *
 * Two startups have claimed the same person. The screen's job is to make the
 * first-come rule legible — claims are listed in the order they arrived, with
 * the winning one marked and the gap between timestamps stated in plain words.
 * QSTP can override, but they should have to look at the clock first.
 */
export default async function SelectionPage() {
  const actor = await getActor();
  const ctx = await getContext();
  const result = await listConflicts(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const conflicts = result.data;
  const canResolve = can(actor, { capability: 'selection:resolve_conflict' });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Selection conflicts</h1>
        <p className="text-sm text-text-muted">
          Resolved first-come-first-served unless QSTP overrides.
        </p>
      </header>

      {conflicts.length === 0 ? (
        <Panel>
          <PanelHeader title="Conflicts" />
          <EmptyState>
            No conflicts. Every reserved candidate is claimed by exactly one startup.
          </EmptyState>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {conflicts.map((conflict) => (
            <Panel key={conflict.candidate.id}>
              <PanelHeader
                title={conflict.candidate.fullName}
                aside={
                  <>
                    {conflict.decidedByOverride && <Badge tone="warning">overridden</Badge>}
                    <Badge tone="critical">{conflict.claims.length} claims</Badge>
                  </>
                }
              />
              <ConflictCard conflict={conflict} canResolve={canResolve} />
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
