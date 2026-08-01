import { can, type MaybeActor } from '@relayflow/access';
import type { StatusTone } from '@relayflow/tokens';
import { getQstpDashboard, type AttentionItem } from '@relayflow/logic';
import { Badge, Button, EmptyState, Metric, MetricBar, Panel, PanelHeader, Row } from '@relayflow/ui-web';
import { getActor, getContext } from '@/server/context';

/**
 * The QSTP dashboard.
 *
 * The brief is explicit that this should be operational rather than decorative,
 * so the layout puts the work queue first and the analytics nowhere. Six
 * metrics across the top for orientation, then a single ranked list of things
 * that need a human — because the honest answer to "what should I do next?" is
 * one ordered list, not four competing panels.
 *
 * Every number and every row is derived from current state on each request.
 */

/** How each kind of problem should read at a glance. */
const PRESENTATION: Record<
  AttentionItem['kind'],
  { tone: StatusTone; kind: string; pulse?: boolean }
> = {
  candidate_conflict: { tone: 'critical', kind: 'Conflict', pulse: true },
  selection_deadline_missed: { tone: 'critical', kind: 'Deadline' },
  exception_pending: { tone: 'warning', kind: 'Exception' },
  hours_reclaimable: { tone: 'warning', kind: 'Hours' },
  positions_not_submitted: { tone: 'info', kind: 'Positions' },
  documents_awaiting_verification: { tone: 'info', kind: 'Documents' },
};

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

  return (
    <Button size="xs" variant="secondary">
      {action.label}
    </Button>
  );
}

export default async function QstpDashboardPage() {
  const actor = await getActor();
  const ctx = await getContext();
  const result = await getQstpDashboard(ctx, {});

  if (!result.ok) {
    return (
      <div className="p-3">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { budget, attention, ...summary } = result.data;
  const overdue = attention.filter((item) => item.severity >= 85).length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3">
      {/* The cycle name lives in the sidebar and the section name in the top
          bar, so this line carries only what neither of them says. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone="info">{summary.stage}</Badge>
        <p className="text-sm text-text-muted">
          {summary.startupCount} startups · {summary.pendingSelections} pending selections
        </p>
      </header>

      <MetricBar>
        <Metric label="Funded hours / week" value={budget.funded} />
        <Metric label="Allocated" value={budget.allocated} hint={`of ${budget.funded}`} />
        <Metric label="Unallocated" value={budget.unallocated} />
        {/* Idle is the number that matters at this stage: promised but unused. */}
        <Metric label="Idle" value={budget.idle} hint="allocated, unused" />
        <Metric
          label="Reclaimable now"
          value={summary.reclaimableHours}
          tone={summary.reclaimableHours > 0 ? 'warning' : 'default'}
        />
        <Metric label="Onboarding" value={summary.candidatesOnboarding} />
      </MetricBar>

      <Panel>
        <PanelHeader
          title="Needs attention"
          aside={
            <>
              {overdue > 0 && <Badge tone="critical">{overdue} urgent</Badge>}
              <span className="text-xs tabular-nums text-text-muted">{attention.length} items</span>
            </>
          }
        />

        {attention.length === 0 ? (
          <EmptyState>Nothing outstanding. Every startup is on track.</EmptyState>
        ) : (
          <div className="flex flex-col">
            {attention.map((item, index) => {
              const presentation = PRESENTATION[item.kind];
              return (
                <Row
                  key={`${item.kind}-${item.startupId ?? item.candidateId ?? index}`}
                  tone={presentation.tone}
                  pulse={presentation.pulse}
                  kind={presentation.kind}
                  subject={item.summary}
                  action={<ItemAction item={item} actor={actor} />}
                  href={DESTINATION[item.kind]}
                />
              );
            })}
          </div>
        )}
      </Panel>

      <p className="px-1 text-xs text-text-muted">
        In-memory fixtures — no database yet. Use the switcher above to see the same data as a
        different role.
      </p>
    </div>
  );
}
