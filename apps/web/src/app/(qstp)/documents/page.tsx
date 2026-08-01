import { can } from '@relayflow/access';
import { getVerificationQueue } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { VerificationCard } from './_item';

export const metadata = { title: 'Documents' };

/**
 * Flow 9: verify candidate documents.
 *
 * One queue, oldest first, with everything the verifier needs on the row. The
 * decided list below exists so a mistake made thirty seconds ago is still
 * findable without a search.
 */
export default async function QstpDocumentsPage() {
  const actor = await getActor();
  const ctx = await getContext();
  const result = await getVerificationQueue(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { awaiting, recentlyDecided } = result.data;
  const canVerify = can(actor, { capability: 'document:verify' });

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-text-muted">
          Candidates confirm what the scan read before it reaches you. Corrections are highlighted.
        </p>
      </header>

      <Panel>
        <PanelHeader
          title="Awaiting verification"
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
          awaiting.map((item) => (
            <VerificationCard key={item.document.id} item={item} canVerify={canVerify} />
          ))
        )}
      </Panel>

      {recentlyDecided.length > 0 && (
        <Panel>
          <PanelHeader
            title="Already decided"
            aside={<span className="text-xs text-text-muted">{recentlyDecided.length}</span>}
          />
          {recentlyDecided.map((item) => (
            <VerificationCard key={item.document.id} item={item} canVerify={false} />
          ))}
        </Panel>
      )}

      {!canVerify && (
        <p className="px-1 text-xs text-text-muted">
          Verifying documents requires an operations or programme-manager role.
        </p>
      )}
    </div>
  );
}
