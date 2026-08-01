'use client';

import { useState, useTransition } from 'react';
import { Building2, Clock, CircleCheck } from 'lucide-react';
import { Button, Panel, PanelHeader, cn } from '@relayflow/ui-web';
import { acceptOfferAction } from '@/server/actions';

/**
 * Choosing between offers.
 *
 * Accepting one declines the others, so this is the only place in the candidate
 * portal with a confirm step. Everything else here is one tap by design; this
 * is not, because it is irreversible and the consequence — "the other two will
 * be told no" — has to be stated before the tap, not after it.
 *
 * The offers are shown in a plain list with no ranking, no "recommended" badge
 * and no ordering by hours. The programme has an obvious interest in where a
 * candidate lands, and putting a thumb on that scale in the UI would undo the
 * point of asking them.
 */

export interface OfferCard {
  readonly selectionId: string;
  readonly startupName: string;
  readonly positionTitle: string;
  readonly hoursPerWeek: number | null;
  readonly durationWeeks: number | null;
}

export function OfferChoice({ offers, isAChoice }: { offers: OfferCard[]; isAChoice: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = (selectionId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await acceptOfferAction({ selectionId });
      if (!result.ok) {
        setError(result.message);
        setConfirming(null);
      }
      // On success the page re-renders from the server with the accepted state,
      // so there is nothing to set here.
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p
          role="alert"
          className="rounded-control bg-critical-subtle px-4 py-3 text-sm text-critical-text"
        >
          {error}
        </p>
      )}

      {offers.map((offer) => {
        const isConfirming = confirming === offer.selectionId;
        const others = offers.length - 1;

        return (
          <Panel key={offer.selectionId} className={cn(isConfirming && 'ring-2 ring-accent')}>
            <PanelHeader
              title={offer.startupName}
              aside={
                <span className="flex items-center gap-1.5 text-xs text-ink-2">
                  <Building2 className="size-3.5" aria-hidden="true" />
                  Offer
                </span>
              }
            />
            <div className="flex flex-col gap-4 p-5">
              <div>
                <p className="text-md font-semibold text-ink">{offer.positionTitle}</p>
                {offer.hoursPerWeek !== null && (
                  <p className="mt-1.5 flex items-center gap-2 text-sm text-ink-3">
                    <Clock className="size-4 shrink-0" aria-hidden="true" />
                    {offer.hoursPerWeek} hours a week
                    {offer.durationWeeks !== null && ` · ${offer.durationWeeks} weeks`}
                  </p>
                )}
              </div>

              {isConfirming ? (
                <div className="flex flex-col gap-3 rounded-tile bg-surface-hover p-4">
                  <p className="text-sm text-ink">
                    Accept the role at {offer.startupName}?
                    {others > 0 && (
                      <>
                        {' '}
                        {others === 1 ? 'The other offer' : `The other ${others} offers`} will be
                        turned down, and this cannot be undone.
                      </>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="md"
                      disabled={pending}
                      onClick={() => accept(offer.selectionId)}
                    >
                      <CircleCheck aria-hidden="true" />
                      {pending ? 'Accepting…' : 'Yes, accept'}
                    </Button>
                    <Button size="md" disabled={pending} onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={pending}
                    onClick={() => setConfirming(offer.selectionId)}
                  >
                    {isAChoice ? 'Choose this one' : 'Accept this offer'}
                  </Button>
                </div>
              )}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
