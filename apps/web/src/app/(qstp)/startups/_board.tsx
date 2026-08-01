'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Ban, Check } from 'lucide-react';
import {
  BOARD_FLAG_LABELS,
  STARTUP_CYCLE_STAGES,
  STARTUP_CYCLE_STAGE_LABELS,
  checkStartupMove,
  type BoardFlag,
  type StartupCycleStage,
  type StartupMoveVerdict,
} from '@relayflow/entities';
import type { StartupSummary } from '@relayflow/logic';
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
import { moveStartupCardAction } from '@/server/actions';

/**
 * The QSTP startup-cycle board.
 *
 * The thing worth understanding about this screen: a column is a *derived*
 * fact. A startup is in "Onboarding" because it has a confirmed intern, not
 * because somebody put it there. That has a consequence for dragging — most
 * columns cannot be dragged into, because the event that would move the card
 * belongs to somebody else. The startup submits its own positions; the startup
 * reserves its own candidates.
 *
 * So a refused drag does not say "not allowed". It says which rule stopped it
 * and links to the screen where the real decision is made. The one move QSTP
 * can complete here — sending a candidate pool — runs the same use-case the
 * Candidates screen does.
 *
 * Every drag is also available from a keyboard: HTML5 drag-and-drop is
 * mouse-only, and a queue of thirty startups is exactly the kind of screen
 * somebody works through without touching the mouse. The Move dialog is not a
 * fallback — it is the version that shows you all eight rules at once.
 */

const FLAG_TONE: Record<BoardFlag, 'neutral' | 'info' | 'positive' | 'warning' | 'critical'> = {
  overdue: 'critical',
  exception_requested: 'info',
  waitlisted: 'neutral',
  hours_at_risk: 'critical',
  missing_documents: 'warning',
  needs_qstp_action: 'warning',
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

interface Attempt {
  readonly row: StartupSummary;
  readonly to: StartupCycleStage;
  readonly verdict: StartupMoveVerdict;
}

export function StartupCycleBoard({
  rows,
  editable,
}: {
  rows: readonly StartupSummary[];
  editable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  /** The card currently under the pointer, and the column it is over. */
  const [dragging, setDragging] = useState<StartupSummary | null>(null);
  const [over, setOver] = useState<StartupCycleStage | null>(null);
  /** A move that was refused, or one that needs confirming before it runs. */
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  /** Which card's full rule list is open. */
  const [menu, setMenu] = useState<StartupSummary | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const propose = (row: StartupSummary, to: StartupCycleStage) => {
    setNote(null);
    // Checked here for an instant answer, and again on the server against facts
    // it loads itself. This copy is for the cursor, not for the decision.
    setAttempt({ row, to, verdict: checkStartupMove(row.stage, to, row.facts) });
  };

  const commit = (row: StartupSummary, to: StartupCycleStage) => {
    setBusyId(row.startup.id);
    startTransition(async () => {
      const result = await moveStartupCardAction({
        startupId: row.startup.id,
        from: row.stage,
        to,
      });

      if (result.ok) {
        setAttempt(null);
        setNote(`${row.startup.name} — candidate pool sent.`);
      } else {
        // The server refused after all: show its reason, which is the
        // authoritative one, in place of the optimistic verdict.
        setAttempt({
          row,
          to,
          verdict: { allowed: false, reason: result.message, handoff: null },
        });
      }
      setBusyId(null);
    });
  };

  return (
    <>
      {note && (
        <p className="mx-3 mt-2 rounded-md bg-positive-subtle px-2.5 py-1.5 text-sm text-positive-text">
          {note}
        </p>
      )}

      <BoardScroller>
        {STARTUP_CYCLE_STAGES.map((stage) => {
          const cards = rows.filter((row) => row.stage === stage);
          const hours = cards.reduce((total, card) => total + card.allocatedHours, 0);

          // What would happen if the card in hand were dropped here.
          const verdict =
            dragging && over === stage
              ? checkStartupMove(dragging.stage, stage, dragging.facts)
              : null;

          return (
            <BoardColumn
              key={stage}
              title={STARTUP_CYCLE_STAGE_LABELS[stage]}
              count={cards.length}
              meta={hours > 0 ? `${hours}h` : undefined}
              active={verdict?.allowed === true}
              blocked={verdict?.allowed === false}
              onDragOver={(event) => {
                if (!dragging) return;
                // preventDefault is what marks a valid drop target, so an
                // illegal column shows a no-drop cursor rather than lying.
                if (checkStartupMove(dragging.stage, stage, dragging.facts).allowed) {
                  event.preventDefault();
                }
                setOver(stage);
              }}
              onDragLeave={() => setOver((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging) propose(dragging, stage);
                setDragging(null);
                setOver(null);
              }}
            >
              {cards.length === 0 ? (
                <BoardColumnEmpty>Nothing here</BoardColumnEmpty>
              ) : (
                cards.map((row) => (
                  <StartupBoardCard
                    key={row.startup.id}
                    row={row}
                    editable={editable}
                    busy={busyId === row.startup.id && pending}
                    dragging={dragging?.startup.id === row.startup.id}
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

      {/* Refusal, or confirmation. One dialog because they are the same
          conversation: here is what this move means, and whether it can run. */}
      <Dialog open={attempt !== null} onOpenChange={(next) => !next && setAttempt(null)}>
        {attempt && (
          <DialogContent
            title={
              attempt.verdict.allowed
                ? `Send candidate pools to ${attempt.row.startup.name}?`
                : 'That move is not possible'
            }
            description={`${STARTUP_CYCLE_STAGE_LABELS[attempt.row.stage]} → ${
              STARTUP_CYCLE_STAGE_LABELS[attempt.to]
            }`}
          >
            <DialogBody>
              {attempt.verdict.allowed ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-text-secondary">
                    RelayFlow will match available candidates against the required skills on this
                    startup&rsquo;s approved positions and share them for review. Candidates already
                    reserved by another startup are never included.
                  </p>
                  <div className="rounded-md bg-info-subtle px-2.5 py-2 text-sm text-info-text">
                    {attempt.row.positionCount} position
                    {attempt.row.positionCount === 1 ? '' : 's'} · {attempt.row.allocatedHours}h per
                    week
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-critical-text">{attempt.verdict.reason}</p>
                  {attempt.verdict.handoff && (
                    <p className="text-sm text-text-muted">
                      This is decided on another screen —{' '}
                      <Link
                        href={attempt.verdict.handoff.href}
                        className="text-accent hover:underline"
                      >
                        {attempt.verdict.handoff.label}
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}
            </DialogBody>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{attempt.verdict.allowed ? 'Cancel' : 'Close'}</Button>
              </DialogClose>
              {attempt.verdict.allowed && (
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => commit(attempt.row, attempt.to)}
                >
                  {pending ? 'Sending…' : 'Send pool'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* The keyboard path, and the clearest statement of the rules on the
          screen: every column, with the reason each one is or is not open. */}
      <Dialog open={menu !== null} onOpenChange={(next) => !next && setMenu(null)}>
        {menu && (
          <DialogContent
            title={`Move ${menu.startup.name}`}
            description={`Currently in ${STARTUP_CYCLE_STAGE_LABELS[menu.stage]}.`}
          >
            <DialogBody className="gap-1">
              {STARTUP_CYCLE_STAGES.filter((stage) => stage !== menu.stage).map((stage) => {
                const verdict = checkStartupMove(menu.stage, stage, menu.facts);
                return (
                  <button
                    key={stage}
                    type="button"
                    disabled={!verdict.allowed || !editable}
                    onClick={() => {
                      setMenu(null);
                      propose(menu, stage);
                    }}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      verdict.allowed
                        ? 'hover:bg-surface-hover'
                        : 'cursor-not-allowed opacity-70',
                    )}
                  >
                    {verdict.allowed ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-positive" />
                    ) : (
                      <Ban className="mt-0.5 size-3.5 shrink-0 text-text-muted" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text">
                        {STARTUP_CYCLE_STAGE_LABELS[stage]}
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

      {!editable && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-text-muted">
          You have read-only access. Moving a card shares a candidate pool, which requires an
          operations or programme-manager role.
        </p>
      )}
    </>
  );
}

function StartupBoardCard({
  row,
  editable,
  busy,
  dragging,
  onDragStart,
  onDragEnd,
  onOpenMenu,
}: {
  row: StartupSummary;
  editable: boolean;
  busy: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <BoardCard
      busy={busy}
      dragging={dragging}
      draggable={editable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
          {row.startup.name}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-text-secondary">
          {row.allocatedHours > 0 ? `${row.allocatedHours}h` : '—'}
        </span>
      </div>

      <span className="truncate text-2xs text-text-muted">{row.startup.sector ?? 'No sector'}</span>

      {row.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {row.flags.map((flag) => (
            <Badge key={flag} tone={FLAG_TONE[flag]}>
              {BOARD_FLAG_LABELS[flag]}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-2 text-2xs tabular-nums text-text-muted">
        <span>
          {row.positionCount} role{row.positionCount === 1 ? '' : 's'}
        </span>
        <span>· {row.poolSize} pooled</span>
        <span>· {row.selectionCount} selected</span>
      </div>

      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-2xs text-text-muted">
          Due {date(row.selectionDeadline)}
        </span>
        {editable && (
          <Button
            size="xs"
            variant="ghost"
            onClick={onOpenMenu}
            aria-label={`Move ${row.startup.name}`}
            title="Move"
          >
            <ArrowRightLeft className="size-3" />
          </Button>
        )}
      </div>
    </BoardCard>
  );
}
