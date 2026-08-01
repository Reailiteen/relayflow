import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, TriangleAlert } from 'lucide-react';
import { getStartupHome } from '@relayflow/logic';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader, cn } from '@relayflow/ui-web';
import { getContext } from '@/server/context';

export const metadata = { title: 'Home' };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * The startup's home screen.
 *
 * The brief asks that the first thing a startup sees is "your next action" and
 * explicitly not analytics — these are busy founders visiting a handful of
 * times per cycle, not operators living in a console. So the top of the page is
 * one action, stated as a sentence, with the button that does it. Numbers come
 * second, and only the four that affect what they do next.
 */
export default async function StartupHomePage() {
  const ctx = await getContext();
  const result = await getStartupHome(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const home = result.data;
  const { nextAction } = home;
  const done = nextAction.kind === 'nothing';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-3">
      {/* One action, told as a sentence. Not a list, because a startup shown
          five things to do does none of them. */}
      <section
        className={cn(
          'flex flex-col gap-3 rounded-lg p-4 ring-1',
          done
            ? 'bg-positive-subtle/50 ring-positive/20'
            : nextAction.urgent
              ? 'bg-critical-subtle/60 ring-critical/25'
              : 'bg-surface ring-border',
        )}
      >
        <div className="flex items-start gap-2.5">
          {done ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden="true" />
          ) : nextAction.urgent ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden="true" />
          ) : (
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          )}

          <div className="min-w-0 flex-1">
            <div className="text-2xs font-medium uppercase tracking-wider text-text-muted">
              Your next action
            </div>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{nextAction.headline}</h2>
            <p className="mt-1 max-w-prose text-md text-text-secondary">{nextAction.detail}</p>

            {nextAction.deadline && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-text-muted">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                Selection deadline {date(nextAction.deadline)}
                {home.hasApprovedException && (
                  <Badge tone="positive">extension approved</Badge>
                )}
                {home.pendingException && <Badge tone="warning">extension pending</Badge>}
              </p>
            )}
          </div>
        </div>

        {!done && (
          <Link
            href={nextAction.href}
            className={cn(
              'inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-3 text-base font-medium',
              'transition-colors focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              nextAction.urgent
                ? 'bg-critical text-white hover:brightness-95'
                : 'bg-accent text-accent-text hover:bg-accent-hover',
            )}
          >
            {nextAction.headline}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </section>

      <MetricBar className="lg:grid-cols-4">
        <Metric label="Weekly hours" value={home.allocatedHours} hint="allocated to you" />
        <Metric label="Used by roles" value={home.usedHours} />
        <Metric
          label="Remaining"
          value={home.remainingHours}
          tone={home.remainingHours > 0 && home.allocatedHours > 0 ? 'accent' : 'default'}
        />
        <Metric label="Interns selected" value={home.selectionsMade} />
      </MetricBar>

      <Panel>
        <PanelHeader title="This cycle" aside={<Badge tone="info">{home.cycleName}</Badge>} />
        <dl className="divide-y divide-border">
          {[
            ['Positions submitted', String(home.positionCount)],
            ['Candidates awaiting your review', String(home.candidatesAwaitingReview)],
            ['Selection deadline', date(home.selectionDeadline)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-base text-text-secondary">{label}</dt>
              <dd className="shrink-0 text-base font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
