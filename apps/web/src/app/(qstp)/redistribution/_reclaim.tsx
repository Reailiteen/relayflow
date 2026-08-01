'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@relayflow/ui-web';
import { reclaimHoursAction } from '@/server/actions';

/**
 * One reclaim, one confirmation.
 *
 * A real dialog rather than `window.confirm` — not for looks, but because the
 * consequence needs more than one line to state, and a native confirm cannot
 * show it. This ends a company's participation in the cycle, so the dialog
 * names them and says exactly what they lose.
 */
export function ReclaimButton({
  startupId,
  startupName,
}: {
  startupId: string;
  startupName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const reclaim = () => {
    setError(null);
    startTransition(async () => {
      const result = await reclaimHoursAction({ startupId, exceptionId: null });
      if (result.ok) setOpen(false);
      else setError(result.message);
    });
  };

  return (
    <>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Reclaim
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent
          title={`Reclaim ${startupName}'s hours?`}
          description="Their allocation drops to zero and the hours return to the cycle budget."
        >
          <DialogBody>
            <div className="flex items-start gap-2 rounded-md bg-critical-subtle px-2.5 py-2 text-sm text-critical-text">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">{startupName} leaves this cycle.</p>
                <p className="mt-0.5">
                  They will no longer be able to select candidates. If they have an approved
                  exception this will be refused — approve their request instead if that was the
                  intent.
                </p>
              </div>
            </div>

            {error && <p className="text-sm text-critical-text">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="danger" disabled={pending} onClick={reclaim}>
              {pending ? 'Reclaiming…' : 'Reclaim hours'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
