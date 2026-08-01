'use client';

import { useState, useTransition } from 'react';
import { ArrowRightLeft, Ban, Check, Lock, MessageSquareText } from 'lucide-react';
import {
  CANDIDATE_BOARD_COLUMNS,
  CANDIDATE_BOARD_LABELS,
  candidateColumnFor,
  checkCandidateMove,
  isSelectable,
  type CandidateBoardColumn,
  type CandidateMoveFacts,
  type CandidateMoveVerdict,
} from '@relayflow/entities';
import type { PoolCandidate, PositionPool } from '@relayflow/logic';
import {
  Badge,
  BoardCard,
  BoardColumn,
  BoardColumnEmpty,
  BoardScroller,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  cn,
} from '@relayflow/ui-web';
import { moveCandidateCardAction } from '@/server/actions';

/**
 * One position's candidates, as a pipeline.
 *
 * This is the board the brief is most emphatic about, and the reason is the
 * last column but one. Dropping a card on **Selected** is not a status change —
 * it reserves that person across the entire programme, and every other startup
 * loses them. So that drop is gated three ways before it is offered (are they
 * still available, does anyone already hold them, has our deadline passed) and
 * even then it asks before it runs. The confirmation is not politeness; a
 * mouse-up you did not mean should not be a hire.
 *
 * The other columns are this startup's own bookkeeping and move freely, save
 * for the two orderings that would be lies: interviewed before an interview
 * exists, and interested before interviewed.
 */

const AVAILABILITY: Record<string, { tone: 'neutral' | 'positive' | 'warning' | 'critical'; label: string }> =
  {
    available: { tone: 'positive', label: 'available' },
    unconfirmed: { tone: 'warning', label: 'not confirmed' },
    employed: { tone: 'critical', label: 'took another job' },
    not_interested: { tone: 'critical', label: 'not interested' },
    temporarily_unavailable: { tone: 'critical', label: 'unavailable' },
    placed: { tone: 'neutral', label: 'placed elsewhere' },
  };

interface Attempt {
  readonly row: PoolCandidate;
  readonly to: CandidateBoardColumn;
  readonly verdict: CandidateMoveVerdict;
}

export function CandidateBoard({
  pool,
  deadlinePassed,
  hasApprovedException,
  editable,
}: {
  pool: PositionPool;
  deadlinePassed: boolean;
  hasApprovedException: boolean;
  editable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<PoolCandidate | null>(null);
  const [over, setOver] = useState<CandidateBoardColumn | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [menu, setMenu] = useState<PoolCandidate | null>(null);

  /** Everything the rules need about one candidate, from what the page loaded. */
  const factsFor = (row: PoolCandidate): CandidateMoveFacts => ({
    currentStatus: row.entry.status,
    availability: row.candidate.availability,
    heldByOther: row.takenByOther,
    heldByUs: row.selection !== null,
    hasInterview: row.interview !== null,
    deadlinePassed,
    hasApprovedException,
  });

  const commit = (row: PoolCandidate, to: CandidateBoardColumn) => {
    setBusyId(row.entry.id);
    startTransition(async () => {
      const result = await moveCandidateCardAction({ poolEntryId: row.entry.id, to });
      if (result.ok) {
        setAttempt(null);
      } else {
        // The reservation may have been lost in the seconds since the page
        // rendered. The server's message says exactly what happened.
        setAttempt({ row, to, verdict: { allowed: false, reason: result.message, confirm: null } });
      }
      setBusyId(null);
    });
  };

  /** A move with no consequences beyond this startup runs without a dialog. */
  const start = (row: PoolCandidate, to: CandidateBoardColumn) => {
    const verdict = checkCandidateMove(to, factsFor(row));
    if (verdict.allowed && verdict.confirm === null) {
      commit(row, to);
      return;
    }
    setAttempt({ row, to, verdict });
  };

  return (
    <>
      <BoardScroller className="p-0 pt-2">
        {CANDIDATE_BOARD_COLUMNS.map((column) => {
          const cards = pool.candidates.filter(
            (row) => candidateColumnFor(row.entry.status) === column,
          );

          const verdict =
            dragging && over === column ? checkCandidateMove(column, factsFor(dragging)) : null;

          return (
            <BoardColumn
              key={column}
              title={CANDIDATE_BOARD_LABELS[column]}
              count={cards.length}
              active={verdict?.allowed === true}
              blocked={verdict?.allowed === false}
              className="w-56"
              onDragOver={(event) => {
                if (!dragging) return;
                if (checkCandidateMove(column, factsFor(dragging)).allowed) event.preventDefault();
                setOver(column);
              }}
              onDragLeave={() => setOver((current) => (current === column ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging) start(dragging, column);
                setDragging(null);
                setOver(null);
              }}
            >
              {cards.length === 0 ? (
                <BoardColumnEmpty>Nothing here</BoardColumnEmpty>
              ) : (
                cards.map((row) => (
                  <CandidateCard
                    key={row.entry.id}
                    row={row}
                    editable={editable}
                    busy={busyId === row.entry.id && pending}
                    dragging={dragging?.entry.id === row.entry.id}
                    onDragStart={() => setDragging(row)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onOpenMenu={() => setMenu(row)}
                  />
                ))
              )}
            </BoardColumn>
          );
        })}
      </BoardScroller>

      <Dialog open={attempt !== null} onOpenChange={(next) => !next && setAttempt(null)}>
        {attempt && (
          <DialogContent
            title={
              attempt.verdict.allowed
                ? `Move ${attempt.row.candidate.fullName} to ${CANDIDATE_BOARD_LABELS[attempt.to]}?`
                : 'That move is not possible'
            }
            description={`${attempt.row.candidate.fullName} · ${pool.position.title}`}
          >
            <DialogBody>
              {attempt.verdict.allowed ? (
                <div className="rounded-md bg-info-subtle px-2.5 py-2 text-sm text-info-text">
                  {attempt.verdict.confirm}
                </div>
              ) : (
                <p className="text-sm text-critical-text">{attempt.verdict.reason}</p>
              )}
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{attempt.verdict.allowed ? 'Cancel' : 'Close'}</Button>
              </DialogClose>
              {attempt.verdict.allowed && (
                <Button
                  variant={attempt.to === 'rejected' ? 'danger' : 'primary'}
                  disabled={pending}
                  onClick={() => commit(attempt.row, attempt.to)}
                >
                  {pending
                    ? 'Working…'
                    : attempt.to === 'selected'
                      ? 'Select candidate'
                      : `Move to ${CANDIDATE_BOARD_LABELS[attempt.to]}`}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* The keyboard route, and the place every rule is visible at once. */}
      <Dialog open={menu !== null} onOpenChange={(next) => !next && setMenu(null)}>
        {menu && (
          <DialogContent
            title={`Move ${menu.candidate.fullName}`}
            description={`Currently in ${CANDIDATE_BOARD_LABELS[candidateColumnFor(menu.entry.status)]}.`}
          >
            <DialogBody className="gap-1">
              {CANDIDATE_BOARD_COLUMNS.filter(
                (column) => column !== candidateColumnFor(menu.entry.status),
              ).map((column) => {
                const verdict = checkCandidateMove(column, factsFor(menu));
                return (
                  <button
                    key={column}
                    type="button"
                    disabled={!verdict.allowed || !editable}
                    onClick={() => {
                      setMenu(null);
                      start(menu, column);
                    }}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      verdict.allowed ? 'hover:bg-surface-hover' : 'cursor-not-allowed opacity-70',
                    )}
                  >
                    {verdict.allowed ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-positive" />
                    ) : (
                      <Ban className="mt-0.5 size-3.5 shrink-0 text-text-muted" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text">
                        {CANDIDATE_BOARD_LABELS[column]}
                      </span>
                      {verdict.reason && (
                        <span className="block text-xs text-text-muted">{verdict.reason}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function CandidateCard({
  row,
  editable,
  busy,
  dragging,
  onDragStart,
  onDragEnd,
  onOpenMenu,
}: {
  row: PoolCandidate;
  editable: boolean;
  busy: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenMenu: () => void;
}) {
  const { candidate, entry, selection, takenByOther } = row;
  const availability = AVAILABILITY[candidate.availability] ?? AVAILABILITY.unconfirmed;

  return (
    <BoardCard
      busy={busy}
      dragging={dragging}
      draggable={editable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-medium text-text',
            !isSelectable(candidate.availability) && 'text-text-muted line-through',
          )}
        >
          {candidate.fullName}
        </span>
        {editable && (
          <Button
            size="xs"
            variant="ghost"
            onClick={onOpenMenu}
            aria-label={`Move ${candidate.fullName}`}
            title="Move"
          >
            <ArrowRightLeft className="size-3" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {selection ? (
          <Badge tone="positive">
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

        {entry.status === 'lost' && <Badge tone="critical">lost the race</Badge>}
        {entry.status === 'withdrawn' && <Badge tone="neutral">withdrew</Badge>}

        {row.interview?.status === 'completed' && (
          <Badge tone="info">
            <MessageSquareText className="size-2.5" />
            interviewed
          </Badge>
        )}
        {row.interview?.transcriptStatus === 'failed' && (
          <Badge tone="warning">transcript failed</Badge>
        )}
      </div>

      <p className="truncate text-2xs text-text-muted">
        {candidate.skills.join(' · ') || 'No skills listed'}
      </p>

      {row.interview?.scheduledFor && (
        <p className="text-2xs text-text-muted">
          Interview{' '}
          {new Date(row.interview.scheduledFor).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          })}
        </p>
      )}
    </BoardCard>
  );
}
