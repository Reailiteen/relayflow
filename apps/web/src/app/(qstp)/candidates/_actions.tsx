'use client';

import { useState, useTransition } from 'react';
import { Download, Send } from 'lucide-react';
import type { CandidateAdminView, CandidateRow } from '@relayflow/logic';
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
import { importCandidatesAction, sharePoolAction } from '@/server/actions';

/**
 * Importing a candidate pool.
 *
 * The Deema button posts a fixed batch — there is no integration behind it and
 * pretending otherwise would be the one dishonest thing in the demo. The CSV
 * path is real parsing against a real schema, so the error handling is genuine
 * even though the transport is a textarea.
 */

const DEEMA_BATCH = [
  { fullName: 'Nada Al-Emadi', email: 'nada.alemadi@example.com', skills: ['Python', 'NLP'] },
  { fullName: 'Tariq Bin Saeed', email: 'tariq.binsaeed@example.com', skills: ['React', 'Node.js'] },
  { fullName: 'Aisha Mansour', email: 'aisha.mansour@example.com', skills: ['Figma', 'User Research'] },
  { fullName: 'Bilal Haddad', email: 'bilal.haddad@example.com', skills: ['C++', 'Embedded'] },
  { fullName: 'Fatima Zahra', email: 'fatima.zahra@example.com', skills: ['SQL', 'Power BI'] },
];

export function ImportButton() {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (rows: { fullName: string; email: string; skills: string[] }[], source: 'deema' | 'csv') => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await importCandidatesAction({
        source,
        rows: rows.map((row) => ({ ...row, cvUrl: null, githubUrl: null })),
      });
      if (result.ok) {
        const data = result.data as { imported: number; duplicates: number };
        // Saying how many were skipped matters: "imported 40" and "your file had
        // 40 rows" are different claims, and the operator needs to know which.
        setMessage(
          `Imported ${data.imported}` +
            (data.duplicates > 0 ? `, skipped ${data.duplicates} already in this cycle.` : '.'),
        );
        setCsv('');
      } else {
        setError(result.message);
      }
    });
  };

  const importCsv = () => {
    const rows = csv
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [fullName = '', email = '', ...skills] = line.split(',').map((cell) => cell.trim());
        return { fullName, email, skills: skills.filter(Boolean) };
      })
      .filter((row) => row.fullName && row.email);

    if (rows.length === 0) {
      setError('No usable rows. Each line should be: name, email, skill, skill…');
      return;
    }
    run(rows, 'csv');
  };

  return (
    <>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        <Download className="size-3" />
        Import
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setMessage(null);
            setError(null);
          }
        }}
      >
        <DialogContent
          title="Import candidates"
          description="RelayFlow does not source or match candidates — it imports the pool somebody else produced."
        >
          <DialogBody>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">From Deema</span>
              <Button
                variant="secondary"
                size="md"
                disabled={pending}
                onClick={() => run(DEEMA_BATCH, 'deema')}
              >
                {pending ? 'Importing…' : `Pull ${DEEMA_BATCH.length} candidates`}
              </Button>
              <span className="text-xs text-text-muted">
                Demo: posts a fixed batch. No Deema integration is wired up.
              </span>
            </div>

            <TextAreaField
              label="Or paste CSV"
              rows={5}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder={'Nada Al-Emadi, nada@example.com, Python, NLP\nTariq Bin Saeed, tariq@example.com, React'}
              hint="One per line: name, email, then any number of skills."
            />

            {message && <p className="text-sm text-positive-text">{message}</p>}
            {error && <p className="text-sm text-critical-text">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
            <Button variant="primary" disabled={pending || !csv.trim()} onClick={importCsv}>
              Import CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Sharing candidates with a position — the Stage 4 handoff.
 *
 * Multi-select rather than one at a time, because a pool is shared as a batch.
 * Candidates already in the chosen position's pool are disabled rather than
 * hidden, so it is obvious why the count does not match the selection.
 */
export function SharePoolButton({
  rows,
  positions,
}: {
  rows: readonly CandidateRow[];
  positions: CandidateAdminView['shareablePositions'];
}) {
  const [open, setOpen] = useState(false);
  const [positionId, setPositionId] = useState<string | null>(positions[0]?.id ?? null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alreadyIn = (row: CandidateRow) =>
    positionId !== null && row.pools.some((pool) => pool.positionId === positionId);

  const toggle = (id: string) => {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const share = () => {
    if (!positionId || chosen.size === 0) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await sharePoolAction({
        positionId,
        candidateIds: [...chosen],
      });
      if (result.ok) {
        const data = result.data;
        setMessage(
          `Shared with ${data.added} candidate${data.added === 1 ? '' : 's'}` +
            (data.skipped > 0 ? `, ${data.skipped} were already in the pool.` : '.'),
        );
        setChosen(new Set());
      } else {
        setError(result.message);
      }
    });
  };

  if (positions.length === 0) return null;

  return (
    <>
      <Button size="xs" variant="primary" onClick={() => setOpen(true)}>
        <Send className="size-3" />
        Share pool
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Share candidates with a position"
          description="The startup can review and interview whoever you send."
          className="max-w-lg"
        >
          <DialogBody>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Position</span>
              <div className="flex flex-col gap-0.5">
                {positions.map((position) => (
                  <button
                    key={position.id}
                    type="button"
                    onClick={() => setPositionId(position.id)}
                    aria-pressed={positionId === position.id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-base',
                      'ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      positionId === position.id
                        ? 'bg-accent-subtle ring-accent'
                        : 'ring-border hover:bg-surface-hover',
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {position.title}{' '}
                      <span className="text-text-muted">· {position.startupName}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-text-muted">
                      {position.poolSize} in pool
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Candidates{chosen.size > 0 && ` · ${chosen.size} selected`}
              </span>
              <div className="max-h-56 overflow-y-auto rounded-md ring-1 ring-inset ring-border">
                {rows.map((row) => {
                  const disabled = alreadyIn(row);
                  return (
                    <label
                      key={row.candidate.id}
                      className={cn(
                        'flex items-center gap-2 border-b border-border px-2 py-1.5 last:border-b-0',
                        disabled ? 'opacity-45' : 'cursor-pointer hover:bg-surface-hover',
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={chosen.has(row.candidate.id)}
                        onChange={() => toggle(row.candidate.id)}
                        className="size-3.5 accent-[var(--rf-accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-base">
                        {row.candidate.fullName}
                      </span>
                      <span className="shrink-0 text-xs text-text-muted">
                        {disabled ? 'already shared' : (row.candidate.skills[0] ?? '')}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {message && <p className="text-sm text-positive-text">{message}</p>}
            {error && <p className="text-sm text-critical-text">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
            <Button
              variant="primary"
              disabled={pending || chosen.size === 0 || positionId === null}
              onClick={share}
            >
              {pending ? 'Sharing…' : `Share with ${chosen.size || 'no'} candidate${chosen.size === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
