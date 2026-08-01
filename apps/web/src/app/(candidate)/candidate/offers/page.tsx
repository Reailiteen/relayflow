import { CircleCheck } from 'lucide-react';
import { getCandidateOffers } from '@relayflow/logic';
import { EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { OfferChoice, type OfferCard } from './_offers';

export const metadata = { title: 'Offers' };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

/**
 * The offers on the table, and the decision that goes with them.
 *
 * This is the screen the whole candidate-choice mode exists for: the point
 * where the person being placed gets a say. So it shows every startup that
 * offered — the one place the programme deliberately reveals competing
 * interest, because without it there is nothing to choose between.
 */
export default async function CandidateOffersPage() {
  const ctx = await getContext();
  const result = await getCandidateOffers(ctx, {});

  if (!result.ok) {
    return (
      <Panel>
        <EmptyState>{result.error.message}</EmptyState>
      </Panel>
    );
  }

  const { offers, isAChoice, accepted, closesAt, closed } = result.data;

  const cards: OfferCard[] = offers.map((offer) => ({
    selectionId: offer.selection.id,
    startupName: offer.startup?.name ?? 'A QSTP startup',
    positionTitle: offer.position?.title ?? 'Internship role',
    hoursPerWeek: offer.position?.hoursPerIntern ?? null,
    durationWeeks: offer.position?.durationWeeks ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Offers</h1>
        <p className="mt-0.5 text-base text-text-muted">
          {accepted
            ? 'You have chosen where you would like to work.'
            : isAChoice
              ? 'More than one startup would like you to join them. The choice is yours.'
              : 'A startup would like you to join them.'}
        </p>
      </header>

      {accepted ? (
        <Panel>
          <PanelHeader
            title={accepted.startup?.name ?? 'A QSTP startup'}
            aside={
              <span className="flex items-center gap-1.5 text-xs text-positive">
                <CircleCheck className="size-3.5" aria-hidden="true" />
                Accepted
              </span>
            }
          />
          <div className="px-3 py-3">
            <p className="text-lg font-medium">{accepted.position?.title ?? 'Internship role'}</p>
            <p className="mt-1 text-base text-text-secondary">
              QSTP and the startup will be in touch about your documents and start date.
            </p>
          </div>
        </Panel>
      ) : cards.length === 0 ? (
        <Panel>
          <EmptyState>
            No offers yet. Startups make them after interviewing, and you will get an email when
            one arrives.
          </EmptyState>
        </Panel>
      ) : closed ? (
        // The window closing does not void the offers — it hands the decision
        // back to the startups, so the honest message is "we will be in touch",
        // not "you have lost them".
        <>
          <Panel>
            <EmptyState>
              The time to choose has passed. QSTP will be in touch about what happens next.
            </EmptyState>
          </Panel>
        </>
      ) : (
        <>
          {closesAt && (
            <p className="text-sm text-text-muted">
              {isAChoice ? 'Your choice is open' : 'This offer is open'} until {day(closesAt)}.
            </p>
          )}
          <OfferChoice offers={cards} isAChoice={isAChoice} />
        </>
      )}
    </div>
  );
}
