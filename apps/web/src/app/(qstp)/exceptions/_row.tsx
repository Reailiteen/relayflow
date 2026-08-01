'use client';

import { useState, useTransition } from 'react';
import type { ExceptionView } from '@relayflow/logic';
import { Badge, Button, cn } from '@relayflow/ui-web';
import { decideExceptionAction } from '@/server/actions';
import { ApproveDialog } from './_approve-dialog';

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const TONE = {
  pending: 'warning',
  approved: 'positive',
  rejected: 'critical',
  expired: 'neutral',
} as const;

export function ExceptionRow({ view, canDecide }: { view: ExceptionView; canDecide: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { request } = view;

  const [approving, setApproving] = useState(false);

  const decide = (
    decision: 'approved' | 'rejected',
    grantedDeadline: string | null,
    decisionNote: string | null,
  ) => {
    setError(null);
    setApproving(false);
    startTransition(async () => {
      const result = await decideExceptionAction({
        exceptionId: request.id,
        decision,
        grantedDeadline,
        decisionNote,
      });
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className={cn('border-b border-border px-3 py-2 last:border-b-0', pending && 'opacity-50')}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{view.startup?.name ?? 'Unknown startup'}</span>
            <Badge tone={TONE[request.status]}>{request.status}</Badge>
            <span className="text-xs text-text-muted">
              {request.kind === 'candidate_selection' ? 'selection' : 'positions'} deadline
            </span>
          </div>

          <p className="mt-1 max-w-2xl text-sm text-text-secondary">{request.reason}</p>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
            <span>
              Due <span className="tabular-nums">{date(view.originalDeadline)}</span>
            </span>
            <span>
              Asked for <span className="tabular-nums">{date(request.requestedDeadline)}</span>
            </span>
            {request.grantedDeadline && (
              <span className="text-positive-text">
                Granted <span className="tabular-nums">{date(request.grantedDeadline)}</span>
              </span>
            )}
            {/* The consequence, stated up front. */}
            {view.hoursAtStake > 0 && (
              <span className={request.status === 'pending' ? 'text-warning-text' : undefined}>
                {view.hoursAtStake}h at stake
              </span>
            )}
          </div>

          {request.decisionNote && (
            <p className="mt-1 text-xs text-text-muted">Note: {request.decisionNote}</p>
          )}
        </div>

        {canDecide && request.status === 'pending' && (
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              disabled={pending}
              onClick={() => decide('rejected', null, null)}
            >
              Reject
            </Button>
            <Button
              size="xs"
              variant="primary"
              disabled={pending}
              onClick={() => setApproving(true)}
            >
              Approve
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mt-1.5 text-sm text-critical-text">{error}</p>}

      <ApproveDialog
        view={view}
        open={approving}
        onOpenChange={setApproving}
        onConfirm={(grantedDeadline, note) => decide('approved', grantedDeadline, note)}
      />
    </div>
  );
}
