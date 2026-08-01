import { can } from '@relayflow/access';
import { listExceptions } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { ExceptionRow } from './_row';

export const metadata = { title: 'Exceptions' };

/**
 * Flow 7: review deadline extension requests.
 *
 * Each row states the hours at stake, because that is what makes this a
 * decision rather than a formality — rejecting an exception is what puts a
 * startup's allocation into the redistribution pool.
 */
export default async function ExceptionsPage() {
  const actor = await getActor();
  const ctx = await getContext();
  const result = await listExceptions(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const views = result.data;
  const pending = views.filter((v) => v.request.status === 'pending');
  const decided = views.filter((v) => v.request.status !== 'pending');
  const canDecide = can(actor, { capability: 'exception:decide' });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-text-muted">
          An approved exception protects the startup&rsquo;s hours from redistribution.
        </p>
      </header>

      <Panel>
        <PanelHeader
          title="Awaiting decision"
          aside={
            pending.length > 0 ? (
              <Badge tone="warning">{pending.length}</Badge>
            ) : (
              <Badge tone="positive">clear</Badge>
            )
          }
        />
        {pending.length === 0 ? (
          <EmptyState>Nothing waiting on you.</EmptyState>
        ) : (
          pending.map((view) => (
            <ExceptionRow key={view.request.id} view={view} canDecide={canDecide} />
          ))
        )}
      </Panel>

      {decided.length > 0 && (
        <Panel>
          <PanelHeader title="Decided" aside={<span className="text-xs text-text-muted">{decided.length}</span>} />
          {decided.map((view) => (
            <ExceptionRow key={view.request.id} view={view} canDecide={false} />
          ))}
        </Panel>
      )}
    </div>
  );
}
