import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import { getCandidateOverview } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader, cn } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { PageHeading } from '@/app/_components/shell';
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
      <PageHeading
        title={`Hello, ${candidate.fullName.split(' ')[0]}`}
        meta="Your internship application with QSTP."
      />

      {/* The ask comes first when there is one. */}
      {needsAvailability ? (
        <AvailabilityPrompt current={candidate.availability} cycleId={candidate.cycleId} />
      ) : (
        overview.action && (
          <Link
            href={overview.action.href}
            className={cn(
              'flex items-center justify-between gap-4 rounded-card px-6 py-5',
              'bg-accent text-accent-text shadow-card transition-[filter] hover:brightness-110',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] opacity-80">
                Next step
              </span>
              <span className="mt-1.5 block text-title font-bold">{overview.action.label}</span>
            </span>
            <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
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
          <div className="flex items-start gap-4 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-brand-tint">
              <Building2 className="size-5 text-brand" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-md font-semibold text-ink">
                {placement.position?.title ?? 'Internship'}
              </p>
              <p className="mt-0.5 text-sm text-ink-2">
                {placement.startup?.name ?? 'A QSTP startup'}
              </p>
              {placement.position && (
                <p className="mt-1.5 text-xs text-ink-3">
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
        <div className="p-5">
          <Journey steps={overview.journey} />
        </div>
      </Panel>

      {!needsAvailability && (
        <AvailabilitySummary current={candidate.availability} cycleId={candidate.cycleId} />
      )}
    </div>
  );
}
