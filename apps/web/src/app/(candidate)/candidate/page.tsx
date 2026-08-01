import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import { getCandidateOverview } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader, cn } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { Journey } from './_components/journey';
import { AvailabilityPrompt, AvailabilitySummary } from './_components/availability';

export const metadata = { title: 'Overview' };

/**
 * The candidate's one screen.
 *
 * Order is chosen for someone arriving cold from an email: what do you need
 * from me, where am I in this, and who am I placed with. Everything else is
 * behind a link.
 */
export default async function CandidateOverviewPage() {
  const ctx = await getContext();
  const result = await getCandidateOverview(ctx, {});

  if (!result.ok) {
    return (
      <Panel>
        <EmptyState>{result.error.message}</EmptyState>
      </Panel>
    );
  }

  const overview = result.data;
  const { candidate, placement } = overview;
  const needsAvailability = candidate.availability === 'unconfirmed';

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hello, {candidate.fullName.split(' ')[0]}</h1>
        <p className="mt-0.5 text-base text-text-muted">
          Your internship application with QSTP.
        </p>
      </header>

      {/* The ask comes first when there is one. */}
      {needsAvailability ? (
        <AvailabilityPrompt current={candidate.availability} />
      ) : (
        overview.action && (
          <Link
            href={overview.action.href}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg px-4 py-3',
              'bg-accent text-accent-text transition-[filter] hover:brightness-110',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <span>
              <span className="block text-2xs font-medium uppercase tracking-wider opacity-80">
                Next step
              </span>
              <span className="block text-lg font-semibold">{overview.action.label}</span>
            </span>
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
        )
      )}

      {placement && (
        <Panel>
          <PanelHeader
            title="Your placement"
            aside={
              <Badge tone={placement.selection.status === 'confirmed' ? 'positive' : 'info'}>
                {placement.selection.status === 'confirmed' ? 'confirmed' : 'reserved'}
              </Badge>
            }
          />
          <div className="flex items-start gap-3 px-3 py-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken">
              <Building2 className="size-4 text-text-muted" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-medium">{placement.position?.title ?? 'Internship'}</p>
              <p className="text-base text-text-secondary">
                {placement.startup?.name ?? 'A QSTP startup'}
              </p>
              {placement.position && (
                <p className="mt-0.5 text-sm text-text-muted">
                  {placement.position.hoursPerIntern} hours a week ·{' '}
                  {placement.position.durationWeeks} weeks
                  {placement.position.supervisorName &&
                    ` · supervised by ${placement.position.supervisorName}`}
                </p>
              )}
            </div>
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Your progress" />
        <div className="px-3 py-3">
          <Journey steps={overview.journey} />
        </div>
      </Panel>

      {!needsAvailability && <AvailabilitySummary current={candidate.availability} />}
    </div>
  );
}
