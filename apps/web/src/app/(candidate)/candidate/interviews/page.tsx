import { CalendarClock, MapPin, Video } from 'lucide-react';
import { getCandidateInterviews } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { redirectToActiveCycleWorkspace } from '@/server/context';

export const metadata = { title: 'Interviews' };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

const TONE = {
  requested: 'warning',
  confirmed: 'info',
  scheduled: 'info',
  completed: 'positive',
  cancelled: 'neutral',
  no_show: 'critical',
} as const;

/**
 * Interviews the candidate has been invited to.
 *
 * Note what is deliberately absent: the startup's feedback, the AI summary and
 * the recommendation. Those belong to the startup's hiring decision, and
 * showing a candidate "second choice behind Layla" would be indefensible.
 */
export default async function CandidateInterviewsPage() {
  await redirectToActiveCycleWorkspace('candidate', 'selection');
  const ctx = await getContext();
  const result = await getCandidateInterviews(ctx, {});

  if (!result.ok) {
    return (
      <Panel>
        <EmptyState>{result.error.message}</EmptyState>
      </Panel>
    );
  }

  const views = result.data;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
        <p className="mt-0.5 text-base text-text-muted">
          Startups invite you here once they have reviewed your profile.
        </p>
      </header>

      {views.length === 0 ? (
        <Panel>
          <EmptyState>No interviews yet. You will get an email when one is arranged.</EmptyState>
        </Panel>
      ) : (
        views.map(({ interview, position, startup }) => (
          <Panel key={interview.id}>
            <PanelHeader
              title={startup?.name ?? 'A QSTP startup'}
              aside={<Badge tone={TONE[interview.status]}>{interview.status.replace('_', ' ')}</Badge>}
            />
            <div className="flex flex-col gap-2 px-3 py-3">
              <p className="text-lg font-medium">{position?.title ?? 'Internship role'}</p>

              {interview.scheduledFor && (
                <p className="flex items-center gap-2 text-base text-text-secondary">
                  <CalendarClock className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                  {when(interview.scheduledFor)}
                  {interview.durationMinutes && ` · ${interview.durationMinutes} minutes`}
                </p>
              )}

              {interview.location && (
                <p className="flex items-start gap-2 text-base text-text-secondary">
                  {interview.mode === 'online' ? (
                    <Video className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
                  ) : (
                    <MapPin className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
                  )}
                  {interview.mode === 'online' ? (
                    <a href={interview.location} className="break-all text-accent hover:underline">
                      Join the meeting
                    </a>
                  ) : (
                    <span>{interview.location}</span>
                  )}
                </p>
              )}
            </div>
          </Panel>
        ))
      )}
    </div>
  );
}
