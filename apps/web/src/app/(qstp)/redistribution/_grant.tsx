'use client';

import { useState, useTransition } from 'react';
import { HOUR_TIERS, type HourTier } from '@relayflow/entities';
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
import { grantHoursAction } from '@/server/actions';

/**
 * Granting recovered hours to a waitlisted startup.
 *
 * Tiers that would not fit in what is currently available are disabled, with
 * the reason in the title attribute — the same treatment as the first-round
 * allocation table, because it is the same decision being made again.
 */
export function GrantButton({
  startupId,
  startupName,
  currentHours,
  recommended,
  available,
}: {
  startupId: string;
  startupName: string;
  currentHours: number;
  recommended: number | null;
  available: number;
}) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<HourTier | null>(null);
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (tier === null) return;
    setError(null);
    startTransition(async () => {
      const result = await grantHoursAction({
        startupId,
        weeklyHours: tier,
        justification: justification.trim() || null,
      });
      if (result.ok) {
        setOpen(false);
        setTier(null);
        setJustification('');
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <>
      <Button
        size="xs"
        variant="secondary"
        disabled={available === 0}
        title={available === 0 ? 'No hours available to grant' : undefined}
        onClick={() => setOpen(true)}
      >
        Grant hours
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTier(null);
            setError(null);
          }
        }}
      >
        <DialogContent
          title={`Grant hours to ${startupName}`}
          description={`${available} weekly hours are available. They currently hold ${currentHours}.`}
        >
          <DialogBody>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text">
                Weekly hours
                <span className="ml-0.5 text-critical" aria-hidden="true">
                  *
                </span>
              </span>
              <div className="flex gap-0.5" role="group" aria-label="Weekly hours">
                {HOUR_TIERS.map((option) => {
                  // Same delta arithmetic as the first-round table: only the
                  // increase has to fit in what is left.
                  const affordable = option - currentHours <= available;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={!affordable}
                      aria-pressed={tier === option}
                      title={!affordable ? `Only ${available} hours available` : undefined}
                      onClick={() => setTier(option)}
                      className={cn(
                        'h-7 flex-1 rounded-sm text-sm font-medium tabular-nums transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        tier === option
                          ? 'bg-accent text-accent-text'
                          : 'bg-surface-sunken text-text-secondary hover:bg-surface-hover hover:text-text',
                        'disabled:cursor-not-allowed disabled:opacity-35',
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {recommended !== null && (
                <p className="text-xs text-text-muted">
                  Their original score recommended {recommended} hours.
                </p>
              )}
            </div>

            <TextAreaField
              label="Justification"
              rows={2}
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="Optional. Recorded against the allocation."
              hint="This grant is marked as coming from redistribution either way."
            />

            {error && <p className="text-sm text-critical-text">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary" disabled={tier === null || pending} onClick={submit}>
              {pending ? 'Granting…' : tier === null ? 'Choose a tier' : `Grant ${tier} hours`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
