'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, ExternalLink, Lock, MessageSquareText, XCircle } from 'lucide-react';
import type { PoolCandidate } from '@relayflow/logic';
import { isSelectable } from '@relayflow/entities';
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  cn,
} from '@relayflow/ui-web';
import { selectCandidateAction } from '@/server/actions';

/**
 * One candidate in a position's pool.
 *
 * The design problem here is that a startup can lose a candidate between
 * loading this page and clicking Select. Three things address it: candidates
 * already held by another startup are shown as such rather than offered;
 * unavailable candidates are visibly struck out; and if the reservation is
 * refused anyway, the error names what happened rather than saying "failed".
 */

const AVAILABILITY: Record<string, { tone: 'neutral' | 'positive' | 'warning' | 'critical'; label: string }> = {
  available: { tone: 'positive', label: 'available' },
  unconfirmed: { tone: 'warning', label: 'not confirmed' },
  employed: { tone: 'critical', label: 'took another job' },
  not_interested: { tone: 'critical', label: 'not interested' },
  temporarily_unavailable: { tone: 'critical', label: 'unavailable' },
  placed: { tone: 'neutral', label: 'placed elsewhere' },
};

export function PoolCandidateRow({ row, positionId }: { row: PoolCandidate; positionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { candidate, selection, takenByOther } = row;
  const availability = AVAILABILITY[candidate.availability] ?? AVAILABILITY.unconfirmed;
  const selectable = isSelectable(candidate.availability) && !takenByOther && selection === null;

  const select = () => {
    setError(null);
    startTransition(async () => {
      const result = await selectCandidateAction({ positionId, candidateId: candidate.id });
      if (result.ok) setConfirming(false);
      else setError(result.message);
    });
  };

  return (
    <div className={cn('border-b border-border px-3 py-2 last:border-b-0', pending && 'opacity-50')}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'truncate font-medium',
                !isSelectable(candidate.availability) && 'text-text-muted line-through',
              )}
            >
              {candidate.fullName}
            </span>

            {selection ? (
              <Badge tone="positive">
                <CheckCircle2 className="size-2.5" />
                {selection.status === 'confirmed' ? 'confirmed' : 'reserved by you'}
              </Badge>
            ) : takenByOther ? (
              <Badge tone="neutral">
                <Lock className="size-2.5" />
                taken
              </Badge>
            ) : (
              <Badge tone={availability?.tone ?? 'neutral'}>{availability?.label}</Badge>
            )}

            {row.interview?.status === 'completed' && (
              <Badge tone="info">
                <MessageSquareText className="size-2.5" />
                interviewed
              </Badge>
            )}
          </div>

          <p className="mt-0.5 truncate text-sm text-text-muted">
            {candidate.skills.join(' · ') || 'No skills listed'}
          </p>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {candidate.cvUrl && (
              <a
                href={candidate.cvUrl}
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                CV <ExternalLink className="size-2.5" aria-hidden="true" />
              </a>
            )}
            {candidate.githubUrl && (
              <a
                href={candidate.githubUrl}
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                GitHub <ExternalLink className="size-2.5" aria-hidden="true" />
              </a>
            )}
            <span className="text-text-muted">{candidate.email}</span>
          </div>

          {row.interview?.aiSummary && (
            <p className="mt-1.5 max-w-prose rounded-md bg-surface-sunken px-2 py-1.5 text-sm text-text-secondary">
              <span className="font-medium text-text">Interview summary </span>
              {row.interview.aiSummary}
            </p>
          )}
          {row.interview?.transcriptStatus === 'failed' && (
            <p className="mt-1 text-xs text-warning-text">
              Transcription failed for this interview — the recording is still available.
            </p>
          )}

          {error && <p className="mt-1.5 text-sm text-critical-text">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {selectable && (
            <>
              <Button size="xs" variant="ghost" disabled={pending}>
                <XCircle className="size-3" />
                Reject
              </Button>
              <Button
                size="xs"
                variant="primary"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Select
              </Button>
            </>
          )}
          {takenByOther && (
            <span className="text-xs text-text-muted">Reserved by another startup</span>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title={`Select ${candidate.fullName}?`}
          description="They are reserved for you immediately, and no other startup can claim them."
        >
          <DialogBody>
            <div className="rounded-md bg-info-subtle px-2.5 py-2 text-sm text-info-text">
              Candidates are reserved first-come-first-served. If another startup selected them in
              the last few seconds, this will be refused and you will be told.
            </div>
            {error && <p className="text-sm text-critical-text">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary" disabled={pending} onClick={select}>
              {pending ? 'Reserving…' : 'Select candidate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
