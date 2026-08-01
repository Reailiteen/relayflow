'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Ban, MoveRight } from 'lucide-react';
import {
  POSITION_REVIEW_LABELS,
  POSITION_REVIEW_STAGES,
  checkPositionMove,
  totalWeeklyHours,
  type PositionMoveVerdict,
  type PositionReviewStage,
} from '@relayflow/entities';
import type { PositionRow } from '@relayflow/logic';
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
  TextAreaField,
  cn,
} from '@relayflow/ui-web';
import { movePositionCardAction } from '@/server/actions';

/**
 * The positions review board.
 *
 * Unlike the startup board, dragging here is the primary interaction: the first
 * three columns are statuses QSTP writes, so moving a card *is* the review. The
 * fourth is not — a role is filled because an intern was confirmed, and a board
 * that let you drop a card there would be asserting a hire that never happened.
 *
 * Sending a role back opens the note dialog rather than moving it silently: the
 * startup sees only that note, so a wordless rejection leaves them guessing.
 *
 * Every drag has a keyboard equivalent. HTML5 drag-and-drop is mouse-only, and
 * a review queue is exactly the screen somebody works through without reaching
 * for the mouse.
 */

interface Attempt {
  readonly row: PositionRow;
  readonly to: PositionReviewStage;
  readonly verdict: PositionMoveVerdict;
}

export function PositionBoard({
  rows,
  editable,
}: {
  rows: readonly PositionRow[];
  editable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<PositionRow | null>(null);
  const [over, setOver] = useState<PositionReviewStage | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Roles that never entered the review queue have no column; showing them
  // would imply a decision that is not QSTP's to make.
  const inReview = rows.filter((row) => row.stage !== null);

  const attemptMove = (row: PositionRow, to: PositionReviewStage) => {
    const verdict = checkPositionMove(to, row.facts);
    setError(null);
    setNote('');
    setAttempt({ row, to, verdict });
  };

  const commit = (row: PositionRow, to: PositionReviewStage, text: string | null) => {
    setBusyId(row.position.id);
    startTransition(async () => {
      const result = await movePositionCardAction({
        positionId: row.position.id,
        to,
        note: text,
      });
      if (result.ok) setAttempt(null);
      else setError(result.message);
      setBusyId(null);
    });
  };

  /** Approving needs no note, so it commits straight from the drop. */
  const drop = (row: PositionRow, to: PositionReviewStage) => {
    const verdict = checkPositionMove(to, row.facts);
    if (verdict.allowed && !verdict.requiresNote) {
      commit(row, to, null);
      return;
    }
    attemptMove(row, to);
  };

  return (
    <>
      <BoardScroller>
        {POSITION_REVIEW_STAGES.map((stage) => {
          const columnRows = inReview.filter((row) => row.stage === stage);
          const hours = columnRows.reduce(
            (total, row) => total + totalWeeklyHours(row.position),
            0,
          );
          const verdict = dragging ? checkPositionMove(stage, dragging.facts) : null;

          return (
            <BoardColumn
              key={stage}
              title={POSITION_REVIEW_LABELS[stage]}
              count={columnRows.length}
              meta={hours > 0 ? `${hours}h` : undefined}
              active={over === stage && verdict?.allowed === true}
              blocked={over === stage && verdict?.allowed === false}
              onDragOver={(event) => {
                if (!dragging || !editable) return;
                event.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                if (dragging && editable) drop(dragging, stage);
                setDragging(null);
              }}
            >
              {columnRows.length === 0 ? (
                <BoardColumnEmpty>Nothing here</BoardColumnEmpty>
              ) : (
                columnRows.map((row) => (
                  <BoardCard
                    key={row.position.id}
                    draggable={editable}
                    busy={busyId === row.position.id && pending}
                    dragging={dragging?.position.id === row.position.id}
                    onDragStart={() => setDragging(row)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {row.position.title}
                      </span>
                      <span className="shrink-0 text-2xs tabular-nums text-text-muted">
                        {totalWeeklyHours(row.position)}h
                      </span>
                    </div>

                    <span className="truncate text-2xs text-text-muted">
                      {row.startup?.name ?? 'Unknown startup'}
                    </span>

                    {row.facts.exceedsAllocation && (
                      <Badge tone="critical">over allocation</Badge>
                    )}

                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-2xs text-text-muted">
                        {row.poolSize} pooled · {row.selectionCount} picked
                      </span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => attemptMove(row, nextStage(row.stage))}
                          title="Move this role"
                          className="rounded-sm p-0.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <MoveRight className="size-3" />
                          <span className="sr-only">Move {row.position.title}</span>
                        </button>
                      )}
                    </div>
                  </BoardCard>
                ))
              )}
            </BoardColumn>
          );
        })}
      </BoardScroller>

      <Dialog
        open={attempt !== null}
        onOpenChange={(next) => {
          if (!next) {
            setAttempt(null);
            setError(null);
            setNote('');
          }
        }}
      >
        {attempt && (
          <DialogContent
            title={attempt.verdict.allowed ? 'Request changes' : 'Cannot move this role'}
            description={`${attempt.row.position.title} · ${attempt.row.startup?.name ?? 'Unknown startup'}`}
          >
            <DialogBody>
              {attempt.verdict.allowed ? (
                <>
                  <p className="text-base text-text-secondary">
                    Moving to <strong>{POSITION_REVIEW_LABELS[attempt.to]}</strong>.
                  </p>
                  {attempt.verdict.requiresNote && (
                    <TextAreaField
                      label="What needs changing?"
                      required
                      autoFocus
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="e.g. Two interns at 30 hours exceeds your 40-hour allocation."
                      hint="The startup sees this exactly as written."
                    />
                  )}
                </>
              ) : (
                <div className="flex items-start gap-2 rounded-md bg-critical-subtle px-2.5 py-2 text-base text-critical-text">
                  <Ban className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{attempt.verdict.reason}</span>
                </div>
              )}

              {/* The other columns, so the keyboard path shows every option at
                  once rather than making somebody guess which is legal. */}
              {!attempt.verdict.allowed && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Move to</span>
                  {POSITION_REVIEW_STAGES.filter((stage) => stage !== attempt.row.stage).map(
                    (stage) => {
                      const verdict = checkPositionMove(stage, attempt.row.facts);
                      return (
                        <button
                          key={stage}
                          type="button"
                          disabled={!verdict.allowed}
                          onClick={() => attemptMove(attempt.row, stage)}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-base',
                            'ring-1 ring-inset transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            verdict.allowed
                              ? 'ring-border hover:bg-surface-hover'
                              : 'cursor-not-allowed opacity-45 ring-border',
                          )}
                        >
                          <span>{POSITION_REVIEW_LABELS[stage]}</span>
                          {!verdict.allowed && (
                            <AlertTriangle className="size-3 shrink-0 text-text-muted" />
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              )}

              {error && <p className="text-sm text-critical-text">{error}</p>}
            </DialogBody>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Close</Button>
              </DialogClose>
              {attempt.verdict.allowed && (
                <Button
                  variant="primary"
                  disabled={pending || (attempt.verdict.requiresNote && !note.trim())}
                  onClick={() => commit(attempt.row, attempt.to, note.trim() || null)}
                >
                  {pending ? 'Saving…' : 'Confirm'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

/** The column a card would most likely go to next, for the keyboard button. */
function nextStage(from: PositionReviewStage | null): PositionReviewStage {
  return from === 'submitted' || from === 'changes_requested' ? 'approved' : 'changes_requested';
}
