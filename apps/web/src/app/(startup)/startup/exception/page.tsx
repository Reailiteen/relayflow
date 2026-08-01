import { getStartupExceptions } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { redirectToActiveCycleWorkspace } from '@/server/context';
import { ExceptionForm } from './_form';

export const metadata = { title: 'Deadline' };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const TONE = {
  pending: 'warning',
  approved: 'positive',
  rejected: 'critical',
  expired: 'neutral',
} as const;

export default async function StartupExceptionPage() {
  await redirectToActiveCycleWorkspace('startup', 'positions');
  const ctx = await getContext();
  const result = await getStartupExceptions(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { exceptions, originalDeadline, effectiveDeadline } = result.data;
  const extended = effectiveDeadline !== originalDeadline;
  const hasOpenRequest = exceptions.some(
    (request) => request.status === 'pending' || request.status === 'approved',
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <Panel>
        <PanelHeader
          title="Your selection deadline"
          aside={extended ? <Badge tone="positive">extended</Badge> : null}
        />
        <div className="px-3 py-2.5">
          <p className="text-xl font-semibold tabular-nums">{date(effectiveDeadline)}</p>
          {extended && (
            <p className="mt-0.5 text-sm text-text-muted">
              Originally {date(originalDeadline)}.
            </p>
          )}
        </div>
      </Panel>

      {exceptions.length > 0 && (
        <Panel>
          <PanelHeader title="Your requests" />
          {exceptions.map((request) => (
            <div key={request.id} className="border-b border-border px-3 py-2 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[request.status]}>{request.status}</Badge>
                <span className="text-sm text-text-muted">
                  asked until {date(request.requestedDeadline)}
                </span>
                {request.grantedDeadline && (
                  <span className="text-sm text-positive-text">
                    granted until {date(request.grantedDeadline)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-text-secondary">{request.reason}</p>
              {request.decisionNote && (
                <p className="mt-1 text-sm text-text-muted">QSTP: {request.decisionNote}</p>
              )}
            </div>
          ))}
        </Panel>
      )}

      {hasOpenRequest ? (
        <Panel>
          <EmptyState>
            You already have a request with QSTP. They will be in touch — there is nothing more to
            do here.
          </EmptyState>
        </Panel>
      ) : (
        <ExceptionForm currentDeadline={effectiveDeadline} />
      )}
    </div>
  );
}
