'use client';

import { useState, useTransition } from 'react';
import { Clock, Trophy } from 'lucide-react';
import type { ConflictView } from '@relayflow/logic';
import { Button, cn } from '@relayflow/ui-web';
import { resolveConflictAction } from '@/server/actions';

/**
 * One conflict, argued chronologically.
 *
 * The design decision here: show the *gap* between claims, not just two
 * timestamps. "1h 45m later" is immediately meaningful; "11:00:00Z" requires
 * the reader to do arithmetic before they can judge whether the race was close.
 */

function gapLabel(earlier: string, later: string): string {
  const ms = new Date(later).getTime() - new Date(earlier).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'seconds later';
  if (minutes < 60) return `${minutes}m later`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours}h later` : `${hours}h ${rest}m later`;
  return `${Math.floor(hours / 24)}d later`;
}

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

export function ConflictCard({
  conflict,
  canResolve,
}: {
  conflict: ConflictView;
  canResolve: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const first = conflict.claims[0];

  const award = (startupId: string, startupName: string) => {
    const reason = window.prompt(
      `Award ${conflict.candidate.fullName} to ${startupName}?\n\n` +
        'Record why — the other startups will be told their claim was released.',
    );
    if (!reason?.trim()) return;

    setError(null);
    startTransition(async () => {
      const result = await resolveConflictAction({
        candidateId: conflict.candidate.id,
        awardTo: startupId,
        reason,
      });
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className={cn('flex flex-col', pending && 'opacity-50')}>
      {error && (
        <p className="border-b border-critical/20 bg-critical-subtle px-3 py-1.5 text-sm text-critical-text">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5 text-sm text-text-secondary">
        <span>{conflict.candidate.email}</span>
        {conflict.candidate.skills.length > 0 && (
          <span className="text-text-muted">{conflict.candidate.skills.join(' · ')}</span>
        )}
      </div>

      {conflict.claims.map((claim, index) => {
        const isFirst = index === 0;
        return (
          <div
            key={claim.selection.id}
            className={cn(
              'flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0',
              claim.isWinner && 'bg-positive-subtle/40',
            )}
          >
            <div className="flex w-5 shrink-0 justify-center">
              {claim.isWinner ? (
                <Trophy className="size-3.5 text-positive" aria-label="Holds the candidate" />
              ) : (
                <span className="text-xs tabular-nums text-text-muted">{index + 1}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-medium">
                {claim.startup?.name ?? 'Unknown startup'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Clock className="size-3" aria-hidden="true" />
                <span className="tabular-nums">{time(claim.selection.reservedAt)}</span>
                {!isFirst && first && (
                  <span className="text-warning-text">
                    · {gapLabel(first.selection.reservedAt, claim.selection.reservedAt)}
                  </span>
                )}
                {claim.selection.status !== 'reserved' && (
                  <span>· {claim.selection.status}</span>
                )}
              </div>
              {claim.selection.overrideReason && (
                <p className="mt-0.5 text-xs text-warning-text">
                  Override: {claim.selection.overrideReason}
                </p>
              )}
            </div>

            {canResolve && !claim.isWinner && claim.selection.status === 'reserved' && (
              <Button
                size="xs"
                variant="secondary"
                disabled={pending}
                onClick={() => award(claim.selection.startupId, claim.startup?.name ?? 'them')}
              >
                Award to this startup
              </Button>
            )}
            {claim.isWinner && (
              <span className="shrink-0 text-xs font-medium text-positive-text">holds</span>
            )}
          </div>
        );
      })}

      {!canResolve && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-text-muted">
          Resolving conflicts requires an operations or programme-manager role.
        </p>
      )}
    </div>
  );
}
