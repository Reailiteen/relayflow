'use client';

import { useState, useTransition } from 'react';
import { Button } from '@relayflow/ui-web';
import { reclaimHoursAction } from '@/server/actions';

/**
 * One reclaim, one confirmation.
 *
 * Confirming by name rather than a bare "are you sure?" — this ends a company's
 * participation in the cycle, and the dialog should say whose.
 */
export function ReclaimButton({
  startupId,
  startupName,
}: {
  startupId: string;
  startupName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const reclaim = () => {
    if (
      !window.confirm(
        `Reclaim ${startupName}'s hours?\n\n` +
          'Their allocation drops to zero and the hours return to the cycle budget. ' +
          'They will no longer be able to select candidates.',
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await reclaimHoursAction({ startupId, exceptionId: null });
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <Button size="xs" variant="secondary" disabled={pending} onClick={reclaim}>
        {pending ? 'Reclaiming…' : 'Reclaim'}
      </Button>
      {error && <span className="text-xs text-critical-text">{error}</span>}
    </div>
  );
}
