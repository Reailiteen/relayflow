'use client';

import { useState, useTransition } from 'react';
import type { ExceptionView } from '@relayflow/logic';
import { Badge, Button, cn } from '@relayflow/ui-web';
import { decideExceptionAction } from '@/server/actions';

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

  const decide = (decision: 'approved' | 'rejected') => {
    // Approving must set a new deadline; the use-case rejects one without it.
    // Defaulting to what they asked for is almost always right, and editing it
    // is the exception rather than the norm.
    let grantedDeadline: string | null = null;
    if (decision === 'approved') {
      const answer = window.prompt(
        `Grant an extension until? (YYYY-MM-DD)\n\nThey asked for ${date(request.requestedDeadline)}.`,
        request.requestedDeadline.slice(0, 10),
      );
      if (!answer?.trim()) return;
      grantedDeadline = new Date(`${answer.trim()}T23:59:00.000Z`).toISOString();
    }

    setError(null);
    startTransition(async () => {
      const result = await decideExceptionAction({
        exceptionId: request.id,
        decision,
        grantedDeadline,
        decisionNote: null,
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
            <Button size="xs" variant="secondary" disabled={pending} onClick={() => decide('rejected')}>
              Reject
            </Button>
            <Button size="xs" variant="primary" disabled={pending} onClick={() => decide('approved')}>
              Approve
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mt-1.5 text-sm text-critical-text">{error}</p>}
    </div>
  );
}
