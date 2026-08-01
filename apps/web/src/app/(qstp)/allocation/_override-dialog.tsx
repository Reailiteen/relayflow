'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { HourTier } from '@relayflow/entities';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  TextAreaField,
} from '@relayflow/ui-web';

/**
 * Asked for whenever a tier departs from the scored recommendation.
 *
 * The use-case rejects an override without a reason, so this is not merely
 * ceremony — it is the UI honouring a rule rather than letting the user hit an
 * error. The dialog states both numbers, because "why 30 instead of 20" is the
 * question a reader of the record will have.
 */
export function OverrideDialog({
  open,
  onOpenChange,
  startupName,
  recommended,
  chosen,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startupName: string;
  recommended: HourTier;
  chosen: HourTier;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Record an override"
        description={`${startupName}'s score recommends ${recommended} hours, but you are assigning ${chosen}.`}
      >
        <DialogBody>
          <div className="flex items-start gap-2 rounded-md bg-warning-subtle px-2.5 py-2 text-sm text-warning-text">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>
              Allocations are a funding decision. This reason is kept with the record and will be
              visible if the allocation is questioned later.
            </p>
          </div>

          <TextAreaField
            label="Why this tier?"
            required
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Strategic sector priority for 2026, agreed with the programme board."
            hint="One or two sentences is enough."
          />
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              onConfirm(reason.trim());
              setReason('');
            }}
          >
            Assign {chosen} hours
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
