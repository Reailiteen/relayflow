import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { getStartupInterviews } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { InterviewWorkspace } from './_workspace';

export const metadata = { title: 'Interviews' };

/**
 * Flow 4: run and write up interviews.
 *
 * Three groups, in the order a startup cares about them: people they said they
 * wanted to meet and never booked, meetings coming up, and interviews that need
 * writing up. The first group exists because that gap — requested, never
 * scheduled — is where startups quietly lose candidates, and it is invisible
 * unless something names it.
 */
export default async function StartupInterviewsPage() {
  const ctx = await getContext();
  const result = await getStartupInterviews(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { upcoming, completed, awaitingSchedule } = result.data;
  const empty = upcoming.length === 0 && completed.length === 0 && awaitingSchedule.length === 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      {empty && (
        <Panel>
          <PanelHeader title="Interviews" />
          <EmptyState>
            No interviews yet. Request one from a candidate in your{' '}
            <Link href="/startup/candidates" className="text-accent hover:underline">
              pool
            </Link>
            .
          </EmptyState>
        </Panel>
      )}

      {awaitingSchedule.length > 0 && (
        <Panel>
          <PanelHeader
            title="Requested, not yet booked"
            aside={<Badge tone="warning">{awaitingSchedule.length}</Badge>}
          />
          {awaitingSchedule.map((entry) => (
            <div
              key={`${entry.position.id}-${entry.candidate.id}`}
              className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
            >
              <CalendarClock className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{entry.candidate.fullName}</div>
                <p className="text-xs text-text-muted">{entry.position.title}</p>
              </div>
              <Link
                href="/startup/candidates"
                className="shrink-0 text-sm text-accent hover:underline"
              >
                Book it
              </Link>
            </div>
          ))}
        </Panel>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 className="px-1 text-sm font-medium text-text-secondary">Coming up</h2>
          {upcoming.map((view) => (
            <InterviewWorkspace key={view.interview.id} view={view} />
          ))}
        </>
      )}

      {completed.length > 0 && (
        <>
          <h2 className="px-1 text-sm font-medium text-text-secondary">Completed</h2>
          {completed.map((view) => (
            <InterviewWorkspace key={view.interview.id} view={view} />
          ))}
        </>
      )}
    </div>
  );
}
