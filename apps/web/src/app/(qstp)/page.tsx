import {
  CalendarRange,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock,
  FileText,
  PieChart,
  RefreshCcw,
  Send,
  TriangleAlert,
  UserCheck,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { can, type MaybeActor } from '@relayflow/access';
import { getQstpDashboard, type AttentionItem, type CycleMilestone } from '@relayflow/logic';
import {
  Card,
  CardHeading,
  Donut,
  LegendItem,
  ListRow,
  Pill,
  RowAction,
  StatCard,
  Timeline,
  cn,
  type AccentTone,
  type TimelineStep,
} from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';
import { Page, PageHeading } from '@/app/_components/shell';

/**
 * The QSTP dashboard.
 *
 * The brief is explicit that this should be operational rather than decorative,
 * so the layout puts the work queue first: five figures across the top for
 * orientation, then a single ranked list of things that need a human — because
 * the honest answer to "what should I do next?" is one ordered list, not four
 * competing panels. The two cards underneath are context for that list, not
 * competitors to it: where the cycle is, and where the hours went.
 *
 * Every number and every row is derived from current state on each request.
 */

/* ── Attention items ──────────────────────────────────────────────────────── */

/** How each kind of problem should read at a glance. */
const PRESENTATION: Record<
  AttentionItem['kind'],
  { tone: AccentTone; kind: string; icon: React.ReactNode }
> = {
  candidate_conflict: { tone: 'red', kind: 'Conflict', icon: <FilledTriangle /> },
  selection_deadline_missed: { tone: 'red', kind: 'Deadline', icon: <FilledTriangle /> },
  exception_pending: { tone: 'orange', kind: 'Exception', icon: <FilledCircle /> },
  positions_not_submitted: { tone: 'blue', kind: 'Positions', icon: <FilledUser /> },
  hours_reclaimable: { tone: 'orange', kind: 'Hours', icon: <FilledUser /> },
  documents_awaiting_verification: { tone: 'blue', kind: 'Documents', icon: <FilledDoc /> },
};

/**
 * Solid glyphs.
 *
 * Lucide draws strokes, so a filled badge is the same icon with the fill and
 * stroke swapped: the shape becomes the colour and the detail inside it is
 * knocked out in white. Cheaper than a second icon set for six glyphs.
 */
function FilledTriangle() {
  return <TriangleAlert className="size-5" fill="currentColor" stroke="white" strokeWidth={2} />;
}
function FilledCircle() {
  return <CircleAlert className="size-5" fill="currentColor" stroke="white" strokeWidth={2} />;
}
function FilledUser() {
  return <UserRound className="size-5" fill="currentColor" stroke="currentColor" strokeWidth={1.5} />;
}
function FilledDoc() {
  return <FileText className="size-5" fill="currentColor" stroke="white" strokeWidth={2} />;
}

/** Where each kind of problem is dealt with. */
const DESTINATION: Record<AttentionItem['kind'], string> = {
  candidate_conflict: '/selection',
  selection_deadline_missed: '/redistribution',
  exception_pending: '/exceptions',
  hours_reclaimable: '/redistribution',
  positions_not_submitted: '/positions',
  documents_awaiting_verification: '/documents',
};

/** The capability that lets an actor act on each item, if any. */
const ACTION: Partial<
  Record<AttentionItem['kind'], { capability: Parameters<typeof can>[1]['capability']; label: string }>
> = {
  candidate_conflict: { capability: 'selection:resolve_conflict', label: 'Resolve' },
  exception_pending: { capability: 'exception:decide', label: 'Review' },
  hours_reclaimable: { capability: 'redistribution:run', label: 'Redistribute' },
  documents_awaiting_verification: { capability: 'document:verify', label: 'Verify' },
};

function ItemAction({ item, actor }: { item: AttentionItem; actor: MaybeActor }) {
  const action = ACTION[item.kind];
  if (!action) return null;

  // Gated on the same policy the use-case will enforce. An auditor sees the
  // problem and no button, which is the correct read-only experience — not a
  // button that fails when pressed.
  if (!can(actor, { capability: action.capability, startupId: item.startupId ?? undefined })) {
    return null;
  }

  return <RowAction href={DESTINATION[item.kind]}>{action.label}</RowAction>;
}

/* ── Cycle stage ──────────────────────────────────────────────────────────── */

/** The stage, phrased for the badge. Falls back to the raw stage name. */
const STAGE_LABEL: Record<string, string> = {
  draft: 'Draft',
  allocation: 'Allocation Active',
  positions: 'Position Posting Open',
  selection: 'Selection Active',
  redistribution: 'Redistribution Active',
  onboarding: 'Onboarding Active',
  closed: 'Cycle Closed',
};

/* ── Timeline ─────────────────────────────────────────────────────────────── */

const MILESTONE_ICON: Record<CycleMilestone['key'], React.ReactNode> = {
  planning: <CalendarRange />,
  positions: <ClipboardList />,
  selection: <Users />,
  onboarding: <Send />,
};

const MILESTONE_STATUS: Record<CycleMilestone['status'], string> = {
  complete: 'Complete',
  active: 'In Progress',
  upcoming: 'Upcoming',
};

// Fixed locale and time zone: the dates are programme deadlines, and a label
// that shifts by a day depending on where the reader sits is a support ticket.
const DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function toStep(milestone: CycleMilestone): TimelineStep {
  return {
    key: milestone.key,
    label: milestone.label,
    detail: `${DAY.format(new Date(milestone.startsAt))} – ${DAY.format(new Date(milestone.endsAt))}`,
    status: milestone.status,
    icon: MILESTONE_ICON[milestone.key],
    statusLabel: MILESTONE_STATUS[milestone.status],
  };
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

/** Share of the funded total, as the legend and the stat hints phrase it. */
function share(value: number, total: number): string {
  if (total === 0) return '0%';
  const percent = (value / total) * 100;
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

export default async function QstpDashboardPage() {
  const actor = await getActor();
  const ctx = await getContext();
  const result = await getQstpDashboard(ctx, {});

  if (!result.ok) {
    return (
      <Page>
        <Card className="px-[var(--rf-card-pad)] py-10 text-center text-label text-ink-3">
          {result.error.message}
        </Card>
      </Page>
    );
  }

  const { budget, attention, milestones, ...summary } = result.data;
  const urgent = attention.filter((item) => item.severity >= 85).length;

  return (
    <Page>
      {/* The cycle names itself here rather than in the chrome, because on this
          one screen the cycle *is* the subject. */}
      <PageHeading
        title={summary.cycleName}
        badge={<Pill tone="violet">{STAGE_LABEL[summary.stage] ?? summary.stage}</Pill>}
        meta={
          <>
            {summary.startupCount} startups&nbsp; • &nbsp;{summary.pendingSelections} pending
            selections
          </>
        }
      />

      <div className="grid grid-cols-2 gap-[var(--rf-gap-tile)] md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          tone="blue"
          icon={<Clock />}
          value={budget.funded}
          label="Funded Hours"
          hint="/ Week"
        />
        <StatCard
          tone="green"
          icon={<PieChart />}
          value={budget.allocated}
          label="Allocated"
          hint={share(budget.allocated, budget.funded)}
        />
        <StatCard
          tone="violet"
          icon={<Wallet />}
          value={budget.unallocated}
          label="Unallocated"
          hint={share(budget.unallocated, budget.funded)}
        />
        <StatCard
          tone="orange"
          icon={<RefreshCcw />}
          value={summary.reclaimableHours}
          label="Reclaimable"
          hint="Now"
        />
        <StatCard
          tone="teal"
          icon={<UserCheck />}
          value={summary.candidatesOnboarding}
          label="Onboarding"
          hint="Ready"
          hintTone="green"
        />
      </div>

      <Card>
        <CardHeading
          title="Needs Attention"
          aside={
            <>
              {urgent > 0 && <Pill tone="red">{urgent} Urgent</Pill>}
              <span className="text-meta tabular-nums text-ink-3">{attention.length} Items</span>
            </>
          }
        />

        {attention.length === 0 ? (
          <p className="border-t border-hairline px-[var(--rf-card-pad)] py-10 text-center text-label text-ink-3">
            Nothing outstanding. Every startup is on track.
          </p>
        ) : (
          <div className="flex flex-col">
            {attention.map((item, index) => {
              const presentation = PRESENTATION[item.kind];
              return (
                <ListRow
                  key={`${item.kind}-${item.startupId ?? item.candidateId ?? index}`}
                  tone={presentation.tone}
                  icon={presentation.icon}
                  kind={presentation.kind}
                  subject={item.summary}
                  action={<ItemAction item={item} actor={actor} />}
                  href={DESTINATION[item.kind]}
                />
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-[var(--rf-gap)] xl:grid-cols-[0.812fr_1fr]">
        <Card className="min-h-[223px] pb-[var(--rf-card-pad)]">
          <CardHeading title="Cycle Progress" subtitle="Key milestones and dates" />
          {/* Less inset on narrow screens: the padding is what pulls the four
              circles together, and at phone widths the labels need the room. */}
          <div className="mt-2 px-4 sm:px-[54px]">
            <Timeline steps={milestones.map(toStep)} />
          </div>
        </Card>

        <Card className="min-h-[223px] pb-[var(--rf-card-pad)]">
          <CardHeading
            title="Hours Overview"
            subtitle="Distribution of funded hours"
            aside={<PeriodPicker />}
          />

          <div className="flex flex-wrap items-center gap-x-[78px] gap-y-6 pr-[var(--rf-card-pad)] pl-[44px]">
            <Donut
              className="mx-auto sm:mx-0"
              size={132}
              thickness={22}
              total={budget.funded}
              segments={[
                { label: 'Allocated', value: budget.allocated, color: 'var(--rf-green-chart)' },
                { label: 'Unallocated', value: budget.unallocated, color: 'var(--rf-brand)' },
              ]}
            >
              <div className="text-[22px] leading-none font-bold tabular-nums text-ink">
                {budget.funded}
              </div>
              <div className="mt-2 text-meta leading-[1.5] text-ink-3">
                Total Hours
                <br />/ Week
              </div>
            </Donut>

            <dl className="grid min-w-[270px] flex-1 grid-cols-[minmax(0,185px)_auto] gap-y-[13px]">
              <LegendItem
                color="var(--rf-green-chart)"
                label="Allocated"
                value={`${budget.allocated} (${share(budget.allocated, budget.funded)})`}
              />
              <LegendItem
                color="var(--rf-brand)"
                label="Unallocated"
                value={`${budget.unallocated} (${share(budget.unallocated, budget.funded)})`}
              />
              <LegendItem
                color="var(--rf-orange)"
                label="Reclaimable"
                value={`${summary.reclaimableHours} (${share(summary.reclaimableHours, budget.funded)})`}
              />
              <LegendItem
                color="var(--rf-teal)"
                label="Onboarding Ready"
                value={`${summary.candidatesOnboarding} (${share(summary.candidatesOnboarding, budget.funded)})`}
              />
            </dl>
          </div>
        </Card>
      </div>
    </Page>
  );
}

/**
 * The period this card covers.
 *
 * Every hour in RelayFlow is a weekly hour — the allocation tiers, the position
 * budgets and the reclaim all quote hours per week — so there is exactly one
 * period to show. The control is here because the card has to say which period
 * it means, not because there is a second one to switch to.
 */
function PeriodPicker() {
  return (
    <span
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-control border border-hairline-strong',
        'bg-panel px-3.5 text-body font-medium text-ink-2 shadow-control',
      )}
    >
      This Week
      <ChevronDown className="size-4 text-ink-3" aria-hidden="true" />
    </span>
  );
}
