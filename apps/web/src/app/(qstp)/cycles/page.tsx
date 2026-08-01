import Link from 'next/link';
import { listCycles } from '@relayflow/logic';
import { Archive, CalendarRange, CheckCircle2, Layers3 } from 'lucide-react';
import { Badge, EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { ArchiveCyclePanel, CreateCycleForm, CycleFormPanel } from './_create-cycle';

export const metadata = { title: 'Cycles' };

export default async function CyclesPage() {
  const result = await listCycles(await getContext(), {});
  if (!result.ok) return <div className="p-6"><Panel><EmptyState>{result.error.message}</EmptyState></Panel></div>;
  const cycles = result.data.map((row) => row.cycle);
  const active = result.data.filter(({ cycle }) => cycle.archivedAt === null);
  const totalParticipants = result.data.reduce((sum, row) => sum + row.participants, 0);
  const totalAcknowledged = result.data.reduce((sum, row) => sum + row.acknowledged, 0);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-accent"><Layers3 className="size-3.5" />Programme operations</div><h1 className="text-display font-bold tracking-[-0.02em] text-ink">Cycles</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-3">Create and operate overlapping internship programmes without mixing budgets, decisions, or candidate records.</p></div><CreateCycleForm cycles={cycles} /></header>
      <MetricBar className="lg:grid-cols-3"><Metric label="Active cycles" value={active.length} /><Metric label="Participating startups" value={totalParticipants} /><Metric label="Allocation acknowledgements" value={`${totalAcknowledged}/${totalParticipants}`} tone={totalParticipants > 0 && totalAcknowledged === totalParticipants ? 'accent' : 'warning'} /></MetricBar>
      <Panel>
        <PanelHeader title="Programme cycles" aside={<Badge tone="neutral">{result.data.length} total</Badge>} />
        {result.data.length === 0 ? <EmptyState>Create the first cycle.</EmptyState> : result.data.map(({ cycle, participants, acknowledged }) => (
          <div key={cycle.id} className="grid gap-4 border-t border-hairline px-5 py-4 transition-colors hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <Link href={`/cycles/${cycle.id}/allocation`} className="group min-w-0 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink group-hover:text-accent">{cycle.name}</p><Badge tone={cycle.archivedAt ? 'neutral' : cycle.stage === 'closed' ? 'positive' : 'info'}>{cycle.archivedAt ? 'archived' : cycle.stage}</Badge></div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3"><span className="inline-flex items-center gap-1.5"><CalendarRange className="size-3.5" />{cycle.startsOn} – {cycle.endsOn}</span><span>{cycle.fundedWeeklyHours} funded weekly hours</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5" />{acknowledged}/{participants} acknowledged</span></div></Link>
            <div className="flex flex-wrap items-center justify-end gap-1"><CycleFormPanel cycles={cycles} cycle={cycle} intent="edit" /><CycleFormPanel cycles={cycles} cycle={cycle} intent="clone" />{cycle.archivedAt === null ? <ArchiveCyclePanel cycle={cycle} /> : <span className="inline-flex items-center gap-1 px-2 text-xs text-ink-3"><Archive className="size-3" />Read only</span>}</div>
          </div>
        ))}
      </Panel>
    </div>
  );
}
