import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, TriangleAlert } from 'lucide-react';
import { getStartupHome } from '@relayflow/logic';
import {
  Badge,
  Card,
  EmptyState,
  Metric,
  MetricBar,
  Panel,
  PanelHeader,
  cn,
} from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { PageHeading } from '@/app/_components/shell';

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
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
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
    <div className="mx-auto flex max-w-4xl flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <PageHeading title={home.startupName} meta={home.cycleName} />

      {/* One action, told as a sentence. Not a list, because a startup shown
          five things to do does none of them. The tint is the only place on
          this screen where the surface itself carries the state. */}
      <Card
        className={cn(
          'gap-5 p-6',
          done
            ? 'border-positive/20 bg-positive-subtle/60'
            : nextAction.urgent
              ? 'border-critical/25 bg-critical-subtle/70'
              : 'border-brand/15 bg-brand-soft/70',
        )}
      >
        <div className="flex items-start gap-3">
          {done ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden="true" />
          ) : nextAction.urgent ? (
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-critical" aria-hidden="true" />
          ) : (
            <ArrowRight className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          )}

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Your next action
            </div>
            <h2 className="mt-1.5 text-title font-bold tracking-[-0.01em] text-ink">
              {nextAction.headline}
            </h2>
            <p className="mt-2 max-w-prose text-label text-ink-3">{nextAction.detail}</p>

            {nextAction.deadline && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-meta text-ink-3">
                <CalendarClock className="size-4" aria-hidden="true" />
                Selection deadline {date(nextAction.deadline)}
                {home.hasApprovedException && <Badge tone="positive">extension approved</Badge>}
                {home.pendingException && <Badge tone="warning">extension pending</Badge>}
              </p>
            )}
          </div>
        </div>

        {!done && (
          <Link
            href={nextAction.href}
            className={cn(
              'inline-flex h-9 w-fit items-center gap-2 rounded-control px-4 text-label font-semibold',
              'shadow-control transition-colors focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              nextAction.urgent
                ? 'bg-critical text-white hover:brightness-95'
                : 'bg-accent text-accent-text hover:bg-accent-hover',
            )}
          >
            {nextAction.headline}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </Card>

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
        <dl className="divide-y divide-hairline">
          {[
            ['Positions submitted', String(home.positionCount)],
            ['Candidates awaiting your review', String(home.candidatesAwaitingReview)],
            ['Selection deadline', date(home.selectionDeadline)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-sm text-ink-3">{label}</dt>
              <dd className="shrink-0 text-sm font-semibold tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
