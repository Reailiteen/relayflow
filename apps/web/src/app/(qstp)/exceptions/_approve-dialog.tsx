'use client';

import { useState } from 'react';
import type { ExceptionView } from '@relayflow/logic';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  TextAreaField,
  TextField,
} from '@relayflow/ui-web';

const day = (iso: string) => iso.slice(0, 10);

const readable = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Approving an extension.
 *
 * Pre-filled with what the startup asked for, because granting exactly that is
 * the common case and QSTP should only have to think when they disagree. The
 * date is editable so a shorter extension can be granted without a separate
 * negotiation.
 */
export function ApproveDialog({
  view,
  open,
  onOpenChange,
  onConfirm,
}: {
  view: ExceptionView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (grantedDeadline: string, note: string | null) => void;
}) {
  const [date, setDate] = useState(day(view.request.requestedDeadline));
  const [note, setNote] = useState('');

  const original = day(view.originalDeadline);
  const valid = date.length === 10 && !Number.isNaN(new Date(date).getTime());
  // Granting a date that is not actually an extension is almost always a typo.
  const notAnExtension = valid && date <= original;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Approve extension"
        description={`${view.startup?.name ?? 'This startup'} asked for ${readable(view.request.requestedDeadline)}.`}
      >
        <DialogBody>
          <div className="rounded-md bg-info-subtle px-2.5 py-2 text-sm text-info-text">
            Approving protects their {view.hoursAtStake} weekly hours from redistribution until the
            new deadline.
          </div>

          <TextField
            label="New deadline"
            type="date"
            required
            value={date}
            min={original}
            onChange={(event) => setDate(event.target.value)}
            hint={`Original deadline was ${readable(view.originalDeadline)}.`}
            {...(notAnExtension
              ? { error: 'That is on or before the original deadline — not an extension.' }
              : {})}
          />

          <TextAreaField
            label="Note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional. Visible to the startup."
          />
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={!valid || notAnExtension}
            onClick={() =>
              onConfirm(new Date(`${date}T23:59:00.000Z`).toISOString(), note.trim() || null)
            }
          >
            Approve until {valid ? readable(`${date}T00:00:00.000Z`) : '—'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
