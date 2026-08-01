'use client';

import { useState } from 'react';
import { Ban, Send } from 'lucide-react';
import {
  CANDIDATE_PIPELINE_LABELS,
  CANDIDATE_PIPELINE_STAGES,
  checkCandidateHandoff,
  type CandidateHandoffVerdict,
  type CandidatePipelineStage,
} from '@relayflow/entities';
import type { CandidateAdminView, CandidateRow } from '@relayflow/logic';
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
} from '@relayflow/ui-web';
import { SharePoolDialog } from './_actions';

/**
 * The candidate handoff board.
 *
 * The first column is the point of the screen. Everyone in "Imported" is a
 * person the programme has taken on and nobody is looking at — a tall column
 * there is the most actionable thing QSTP can see, and it is invisible in a
 * table sorted any other way.
 *
 * Only one move belongs to QSTP: sending somebody to a startup. Dragging into
 * "Pool sent" opens the share dialog rather than writing anything, because a
 * drag cannot say *which* position it meant and the pool is chosen there. Every
 * other column refuses with the reason and, where there is one, the screen
 * where the real decision happens.
 */

interface Refusal {
  readonly row: CandidateRow;
  readonly to: CandidatePipelineStage;
  readonly verdict: CandidateHandoffVerdict;
}

export function CandidateBoard({
  rows,
  positions,
  editable,
}: {
  rows: readonly CandidateRow[];
  positions: CandidateAdminView['shareablePositions'];
  editable: boolean;
}) {
  const [dragging, setDragging] = useState<CandidateRow | null>(null);
  const [over, setOver] = useState<CandidatePipelineStage | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /** Set when a legal drag lands on "Pool sent" — the share dialog takes over. */
  const [sharing, setSharing] = useState<CandidateRow | null>(null);

  const attempt = (row: CandidateRow, to: CandidatePipelineStage) => {
    const verdict = checkCandidateHandoff(to, row.facts);
    if (verdict.allowed) {
      setSharing(row);
      return;
    }
    setRefusal({ row, to, verdict });
  };

  return (
    <>
      <BoardScroller>
        {CANDIDATE_PIPELINE_STAGES.map((stage) => {
          const columnRows = rows.filter((row) => row.stage === stage);
          const verdict = dragging ? checkCandidateHandoff(stage, dragging.facts) : null;

          return (
            <BoardColumn
              key={stage}
              title={CANDIDATE_PIPELINE_LABELS[stage]}
              count={columnRows.length}
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
                if (dragging && editable) attempt(dragging, stage);
                setDragging(null);
              }}
            >
              {columnRows.length === 0 ? (
                <BoardColumnEmpty>
                  {stage === 'imported' ? 'Everyone has been sent somewhere' : 'Nothing here'}
                </BoardColumnEmpty>
              ) : (
                columnRows.map((row) => (
                  <BoardCard
                    key={row.candidate.id}
                    draggable={editable}
                    dragging={dragging?.candidate.id === row.candidate.id}
                    onDragStart={() => setDragging(row)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  >
                    <span className="truncate text-sm font-medium">{row.candidate.fullName}</span>

                    {row.candidate.skills.length > 0 && (
                      <span className="truncate text-2xs text-text-muted">
                        {row.candidate.skills.join(' · ')}
                      </span>
                    )}

                    {row.heldBy && <Badge tone="info">{row.heldBy}</Badge>}

                    {row.pools.length > 0 && (
                      <span className="truncate text-2xs text-text-muted">
                        {row.pools.length} pool{row.pools.length === 1 ? '' : 's'} ·{' '}
                        {row.pools[0]?.startupName}
                      </span>
                    )}

                    {editable && row.stage === 'imported' && (
                      <button
                        type="button"
                        onClick={() => setSharing(row)}
                        className="mt-0.5 flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-2xs text-accent transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Send className="size-2.5" aria-hidden="true" />
                        Send to a startup
                      </button>
                    )}
                  </BoardCard>
                ))
              )}
            </BoardColumn>
          );
        })}
      </BoardScroller>

      {/* A refused drag: say which rule stopped it, and where the real decision
          is made when it belongs to somebody else. */}
      <Dialog open={refusal !== null} onOpenChange={(next) => !next && setRefusal(null)}>
        {refusal && (
          <DialogContent
            title="Cannot move this candidate"
            description={`${refusal.row.candidate.fullName} → ${CANDIDATE_PIPELINE_LABELS[refusal.to]}`}
          >
            <DialogBody>
              <div className="flex items-start gap-2 rounded-md bg-critical-subtle px-2.5 py-2 text-base text-critical-text">
                <Ban className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{refusal.verdict.reason}</span>
              </div>

              <p className="text-sm text-text-muted">
                Columns past “Pool sent” are derived from what a startup has done. QSTP controls the
                handoff, not the hiring.
              </p>
            </DialogBody>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Close</Button>
              </DialogClose>
              {refusal.verdict.handoff && (
                <a
                  href={refusal.verdict.handoff.href}
                  className="inline-flex h-7 items-center rounded-md bg-accent px-2.5 text-sm font-medium text-accent-text hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {refusal.verdict.handoff.label}
                </a>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Sharing runs the same dialog the toolbar button opens, pre-selecting
          the dragged person, so both routes call one use-case. */}
      <SharePoolDialog
        open={sharing !== null}
        onOpenChange={(next) => !next && setSharing(null)}
        rows={rows}
        positions={positions}
        {...(sharing ? { preselected: [sharing.candidate.id] } : {})}
      />
    </>
  );
}
