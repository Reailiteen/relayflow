'use client';

import { useState, useTransition } from 'react';
import { Clock, Trophy } from 'lucide-react';
import type { ConflictView } from '@relayflow/logic';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  TextAreaField,
  cn,
} from '@relayflow/ui-web';
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
  const [award, setAward] = useState<{ startupId: string; startupName: string } | null>(null);
  const [reason, setReason] = useState('');

  const first = conflict.claims[0];

  const confirmAward = () => {
    if (!award || !reason.trim()) return;
    setError(null);
    const target = award;
    const text = reason.trim();
    setAward(null);
    setReason('');

    startTransition(async () => {
      const result = await resolveConflictAction({
        candidateId: conflict.candidate.id,
        awardTo: target.startupId,
        reason: text,
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
                onClick={() =>
                  setAward({
                    startupId: claim.selection.startupId,
                    startupName: claim.startup?.name ?? 'this startup',
                  })
                }
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

      <Dialog
        open={award !== null}
        onOpenChange={(next) => {
          if (!next) {
            setAward(null);
            setReason('');
          }
        }}
      >
        {award && (
          <DialogContent
            title={`Award to ${award.startupName}`}
            description={`${conflict.candidate.fullName} will be reserved for ${award.startupName}. Every other claim is released.`}
          >
            <DialogBody>
              <div className="rounded-md bg-warning-subtle px-2.5 py-2 text-sm text-warning-text">
                This overrides the first-come-first-served order. The startup that claimed first
                will lose the candidate, so the reason needs to stand up to being questioned.
              </div>

              <TextAreaField
                label="Reason for the override"
                required
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Candidate confirmed by phone that they had already withdrawn from the other startup."
              />
            </DialogBody>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button variant="primary" disabled={!reason.trim()} onClick={confirmAward}>
                Award candidate
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
