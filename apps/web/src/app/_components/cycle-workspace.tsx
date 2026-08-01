import Link from 'next/link';
import { CYCLE_STAGES, type ActivityEvent, type Cycle, type PlacementRequirement } from '@relayflow/entities';
import type { CycleWorkspace as CycleWorkspaceData } from '@relayflow/logic';
import { Badge, Card, CardHeading, EmptyState, Metric, MetricBar, Panel, PanelHeader } from '@relayflow/ui-web';
import { FIXTURE_SCENARIO_NAMES } from '@/server/context';
import { resetFixtureScenarioAction } from '@/server/actions';
import { AllocationActions } from './workspace-actions';
import { GateReviewPanel, ParticipationPanel } from './operational-panels';
import {
  ConfirmSelectionPanel,
  ConflictWorkflowPanel,
  CreatePositionPanel,
  CreateRoundPanel,
  FallbackWorkflowPanel,
  PlacementWorkflowPanel,
  PositionWorkflowPanel,
  RecoveryWorkflowPanel,
  RequirementWorkflowPanel,
  RoundWorkflowPanel,
  TaskWorkflowPanel,
} from './core-workflow-panels';

export type Portal = 'qstp' | 'startup' | 'candidate';
export type Workspace = 'allocation' | 'positions' | 'selection' | 'recovery' | 'placements' | 'activity';

const labels: Record<Workspace, string> = {
  allocation: 'Allocation',
  positions: 'Positions',
  selection: 'Selection',
  recovery: 'Recovery',
  placements: 'Ready to Start',
  activity: 'Activity',
};

function basePath(portal: Portal, cycleId: string): string {
  if (portal === 'qstp') return `/cycles/${cycleId}`;
  return `/${portal}/cycles/${cycleId}`;
}

export function CycleSwitcher({ cycles, selected, portal }: { cycles: readonly Cycle[]; selected: Cycle; portal: Portal }) {
  return (
    <nav aria-label="Cycle switcher" className="flex flex-wrap items-center gap-2">
      {cycles.map((cycle) => (
        <Link
          key={cycle.id}
          href={`${basePath(portal, cycle.id)}/allocation`}
          aria-current={cycle.id === selected.id ? 'page' : undefined}
          className={`rounded-control border px-3 py-2 text-xs font-semibold ${
            cycle.id === selected.id
              ? 'border-accent bg-brand-soft text-accent'
              : 'border-hairline bg-panel text-ink-2 hover:border-accent'
          }`}
        >
          {cycle.name}
        </Link>
      ))}
    </nav>
  );
}

export function StageGateChecklist({ cycle }: { cycle: Cycle }) {
  const current = CYCLE_STAGES.indexOf(cycle.stage);
  return (
    <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Cycle stages">
      {CYCLE_STAGES.map((stage, index) => (
        <li key={stage} className="flex items-center gap-2 rounded-control border border-hairline bg-panel px-3 py-2">
          <span className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${index <= current ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-3'}`}>
            {index < current ? '✓' : index + 1}
          </span>
          <span className="truncate text-xs font-semibold capitalize text-ink-2">{stage.replaceAll('_', ' ')}</span>
        </li>
      ))}
    </ol>
  );
}

export function ActivityTimeline({ events }: { events: readonly ActivityEvent[] }) {
  if (events.length === 0) return <EmptyState>No activity has been recorded in this workspace yet.</EmptyState>;
  return (
    <ol className="divide-y divide-hairline">
      {events.map((event) => (
        <li key={event.id} className="grid gap-1 px-5 py-4 sm:grid-cols-[150px_1fr_auto] sm:items-center">
          <time className="text-xs tabular-nums text-ink-3" dateTime={event.occurredAt}>
            {new Intl.DateTimeFormat('en-QA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Qatar' }).format(new Date(event.occurredAt))}
          </time>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{event.action.replaceAll('_', ' ')}</p>
            <p className="truncate text-xs text-ink-3">{event.entityType} · {event.entityId}</p>
          </div>
          <Badge tone={event.reason ? 'warning' : 'neutral'}>{event.actorRole}</Badge>
          {event.reason ? <p className="sm:col-start-2 text-xs text-ink-2">Reason: {event.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function RequirementChecklist({ requirements }: { requirements: readonly PlacementRequirement[] }) {
  if (requirements.length === 0) return <EmptyState>No requirements have been snapshotted.</EmptyState>;
  return (
    <ul className="divide-y divide-hairline">
      {requirements.map((requirement) => (
        <li key={requirement.id} className="flex items-center justify-between gap-4 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">{requirement.title}</p>
            <p className="text-xs capitalize text-ink-3">{requirement.owner} · {requirement.required ? 'required' : 'optional'}</p>
          </div>
          <Badge tone={['approved', 'waived'].includes(requirement.status) ? 'positive' : requirement.status === 'correction_requested' ? 'critical' : 'warning'}>
            {requirement.status.replaceAll('_', ' ')}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function SimulatedFile({ fileName, revision }: { fileName: string; revision: number }) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-dashed border-hairline-strong bg-surface-sunken px-4 py-3">
      <span aria-hidden="true">▧</span>
      <div>
        <p className="text-xs font-semibold text-ink">{fileName}</p>
        <p className="text-[11px] text-ink-3">Fixture upload · revision {revision} · private metadata only</p>
      </div>
    </div>
  );
}

function ScenarioSelector() {
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <form action={resetFixtureScenarioAction} className="flex items-center gap-2 rounded-control border border-dashed border-hairline-strong bg-surface-sunken px-3 py-2">
      <label htmlFor="fixture-scenario" className="text-[11px] font-semibold text-ink-3">Fixture scenario</label>
      <select id="fixture-scenario" name="scenario" className="rounded-control border border-hairline bg-panel px-2 py-1 text-xs text-ink">
        {FIXTURE_SCENARIO_NAMES.map((scenario) => <option key={scenario} value={scenario}>{scenario.replaceAll('_', ' ')}</option>)}
      </select>
      <button type="submit" className="rounded-control bg-accent px-3 py-1 text-xs font-semibold text-white">Reset</button>
    </form>
  );
}

export function CycleWorkspaceView({ data, portal, workspace }: { data: CycleWorkspaceData; portal: Portal; workspace: Workspace }) {
  const path = basePath(portal, data.cycle.id);
  const next = CYCLE_STAGES[CYCLE_STAGES.indexOf(data.cycle.stage) + 1] ?? null;
  const mineAcknowledged = data.participation.some((row) => row.allocationAcknowledgedAt !== null);
  const draftRun = data.prioritizationRuns.find((row) => row.status === 'draft');

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2"><Badge tone="info">{data.cycle.stage}</Badge><span className="text-xs text-ink-3">{data.cycle.selectionMode.replaceAll('_', ' ')}</span></div>
          <h1 className="text-display font-bold tracking-[-0.02em] text-ink">{data.cycle.name}</h1>
          <p className="mt-2 text-sm text-ink-3">{data.cycle.startsOn} – {data.cycle.endsOn} · {data.cycle.fundedWeeklyHours} funded weekly hours</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {portal === 'qstp' ? <ScenarioSelector /> : null}
          {portal === 'qstp' ? <GateReviewPanel cycleId={data.cycle.id} stage={data.cycle.stage} next={next} checks={data.stageGateChecks} /> : null}
        </div>
      </header>

      <CycleSwitcher cycles={data.cycles} selected={data.cycle} portal={portal} />
      <StageGateChecklist cycle={data.cycle} />

      <nav className="flex gap-1 overflow-x-auto border-b border-hairline" aria-label="Cycle workspace">
        {(Object.keys(labels) as Workspace[])
          .filter((item) => portal === 'qstp' || (portal === 'startup' ? item !== 'activity' : !['recovery', 'activity'].includes(item)))
          .map((item) => (
            <Link key={item} href={`${path}/${item}`} aria-current={item === workspace ? 'page' : undefined} className={`border-b-2 px-3 py-2 text-xs font-semibold whitespace-nowrap ${item === workspace ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink'}`}>
              {labels[item]}
            </Link>
          ))}
      </nav>

      {workspace === 'allocation' ? (
        <>
          <MetricBar className="lg:grid-cols-4">
            <Metric label="Funded" value={data.cycle.fundedWeeklyHours} />
            <Metric label="Allocated" value={data.totals.allocated} />
            <Metric label="Committed" value={data.totals.committed} />
            <Metric label="Recoverable" value={data.totals.recoverable} tone={data.totals.recoverable > 0 ? 'warning' : 'accent'} />
          </MetricBar>
          <Panel>
            <PanelHeader
              title="Participation and decisions"
              aside={portal === 'candidate' ? null : (
                <AllocationActions
                  cycleId={data.cycle.id}
                  mode={portal}
                  acknowledged={mineAcknowledged}
                  draftRunId={draftRun?.id}
                />
              )}
            />
            {data.participation.length === 0 ? <EmptyState>No participation records are visible.</EmptyState> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-y border-hairline bg-surface-sunken text-ink-3"><tr><th className="px-5 py-2">Startup</th><th>Request</th><th>Score</th><th>Tier</th><th>Acknowledged</th>{portal === 'qstp' ? <th><span className="sr-only">Actions</span></th> : null}</tr></thead><tbody className="divide-y divide-hairline">{data.participation.map((row) => { const allocation = data.allocations.find((item) => item.startupId === row.startupId); const startup = data.startups.find((item) => item.id === row.startupId); return <tr key={row.id}><td className="px-5 py-3 font-medium text-ink">{startup?.name ?? row.startupId}</td><td>{row.requestedTotalHours} h</td><td>{row.operatorScore ?? 'Private'}</td><td>{allocation?.weeklyHours ?? '—'} h</td><td><Badge tone={row.allocationAcknowledgedAt ? 'positive' : 'warning'}>{row.allocationAcknowledgedAt ? 'Yes' : 'Pending'}</Badge></td>{portal === 'qstp' ? <td className="pr-4 text-right"><ParticipationPanel cycleId={data.cycle.id} participation={row} startupName={startup?.name ?? 'Startup'} /></td> : null}</tr>; })}</tbody></table></div>
            )}
          </Panel>
        </>
      ) : null}

      {workspace === 'positions' ? (
        <Panel><PanelHeader title="Position collection and approval" aside={<div className="flex items-center gap-2"><Badge tone="neutral">{data.totals.openSeats} open seats</Badge>{portal === 'startup' ? <CreatePositionPanel cycle={data.cycle} allocatedHours={data.totals.allocated} usedHours={data.positions.filter((row) => !['draft', 'withdrawn', 'closed'].includes(row.status)).reduce((sum, row) => sum + row.hoursPerIntern * row.internCount, 0)} rounds={data.rounds} /> : null}</div>} />
          {data.positions.length === 0 ? <EmptyState>No positions in this cycle.</EmptyState> : <div className="divide-y divide-hairline">{data.positions.map((position) => <div key={position.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="min-w-[220px] flex-1"><p className="font-semibold text-ink">{position.title}</p><p className="text-xs text-ink-3">{position.internCount} seat{position.internCount === 1 ? '' : 's'} · {position.hoursPerIntern} h · {position.workArrangement}</p>{position.reviewNote ? <p className="mt-1 text-xs text-warning-text">{position.reviewNote}</p> : null}</div><Badge tone={['approved', 'locked', 'filled'].includes(position.status) ? 'positive' : position.status === 'changes_requested' ? 'critical' : 'warning'}>{position.status.replaceAll('_', ' ')}</Badge><PositionWorkflowPanel cycleId={data.cycle.id} position={position} portal={portal} /></div>)}</div>}
        </Panel>
      ) : null}

      {workspace === 'selection' ? (
        <><MetricBar className="lg:grid-cols-3"><Metric label="Confirmed placements" value={data.placements.filter((row) => row.status !== 'cancelled').length} /><Metric label="Open seats" value={data.totals.openSeats} /><Metric label="Selection mode" value={data.cycle.selectionMode === 'first_come' ? 'FCFS' : 'Choice'} /></MetricBar><Panel><PanelHeader title="Selection queue" aside={<Badge>{data.selections.length}</Badge>} />{data.selections.length === 0 ? <EmptyState>No selections or offers in this cycle.</EmptyState> : data.selections.map((selection) => { const candidate = data.candidates.find((row) => row.id === selection.candidateId); const position = data.positions.find((row) => row.id === selection.positionId); return <div key={selection.id} className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"><div className="flex-1"><p className="font-semibold text-ink">{candidate?.fullName ?? `Candidate ${selection.candidateId.slice(0, 8)}`}</p><p className="text-xs text-ink-3">{position?.title ?? 'Position'} · startup {selection.startupId.slice(0, 8)}</p></div><Badge tone={selection.status === 'confirmed' || selection.status === 'accepted' ? 'positive' : selection.status === 'declined' || selection.status === 'cancelled' ? 'neutral' : 'warning'}>{selection.status}</Badge>{portal === 'qstp' && selection.status === 'accepted' ? <ConfirmSelectionPanel cycle={data.cycle} selection={selection} position={position} /> : null}</div>; })}</Panel>{portal === 'qstp' && data.conflicts.length > 0 ? <Panel><PanelHeader title="Selection conflicts" aside={<Badge tone="critical">{data.conflicts.filter((row) => row.status === 'open').length} open</Badge>} />{data.conflicts.map((conflict) => <div key={conflict.id} className="flex items-center gap-4 border-t border-hairline px-5 py-4"><div className="flex-1"><p className="font-semibold text-ink">Candidate {conflict.candidateId.slice(0, 8)}</p><p className="text-xs text-ink-3">{conflict.previousStartupId.slice(0, 8)} → {conflict.requestedStartupId.slice(0, 8)}</p></div><Badge tone={conflict.status === 'open' ? 'critical' : 'neutral'}>{conflict.status}</Badge><ConflictWorkflowPanel cycleId={data.cycle.id} conflict={conflict} /></div>)}</Panel> : null}{data.tasks.length > 0 ? <Panel><PanelHeader title="Position tasks" aside={<Badge>{data.tasks.length}</Badge>} />{data.tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"><div className="flex-1"><p className="font-semibold text-ink">Task for {data.candidates.find((row) => row.id === task.candidateId)?.fullName ?? task.candidateId.slice(0, 8)}</p><p className="text-xs text-ink-3">Due {task.dueAt}{task.reviewNotes ? ` · ${task.reviewNotes}` : ''}</p></div><Badge tone={task.status === 'reviewed' ? 'positive' : task.lateAccepted ? 'warning' : 'info'}>{task.status}</Badge><TaskWorkflowPanel cycleId={data.cycle.id} task={task} portal={portal} /></div>)}</Panel> : null}{data.fallbackCases.length > 0 ? <Panel><PanelHeader title="Candidate-choice fallback" />{data.fallbackCases.map((fallback) => <div key={fallback.id} className="flex items-center justify-between gap-4 border-t border-hairline px-5 py-4"><div><p className="font-semibold text-ink">Offer {fallback.currentOfferIndex + 1} of {fallback.orderedOfferIds.length}</p><p className="text-xs text-ink-3">Response due {fallback.responseDeadline}</p></div><div className="flex items-center gap-3"><Badge tone={fallback.status === 'open' ? 'warning' : 'positive'}>{fallback.status}</Badge>{portal === 'qstp' ? <FallbackWorkflowPanel cycleId={data.cycle.id} fallback={fallback} selections={data.selections} /> : null}</div></div>)}</Panel> : null}</>
      ) : null}

      {workspace === 'recovery' ? (
        <><MetricBar className="lg:grid-cols-3"><Metric label="Recovery cases" value={data.recoveryCases.length} /><Metric label="Rounds" value={data.rounds.length} /><Metric label="Recoverable hours" value={data.recoveryCases.filter((row) => row.status !== 'exception_protected').reduce((sum, row) => sum + row.recoverableHours, 0)} tone="warning" /></MetricBar><Panel><PanelHeader title="Recovery review" aside={portal === 'qstp' ? <CreateRoundPanel cycleId={data.cycle.id} cases={data.recoveryCases} /> : null} />{data.recoveryCases.length === 0 ? <EmptyState>No hours need recovery.</EmptyState> : data.recoveryCases.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"><div className="flex-1"><p className="font-semibold text-ink">{item.recoverableHours} hours · {data.startups.find((row) => row.id === item.startupId)?.name ?? item.startupId}</p><p className="text-xs text-ink-3">{item.reason}</p></div><Badge tone={item.status.includes('protected') ? 'info' : item.status === 'potential' ? 'warning' : 'positive'}>{item.status.replaceAll('_', ' ')}</Badge>{portal === 'qstp' ? <RecoveryWorkflowPanel cycleId={data.cycle.id} recoveryCase={item} /> : null}</div>)}</Panel><Panel><PanelHeader title="Redistribution rounds" />{data.rounds.length === 0 ? <EmptyState>Confirm recovery cases, then open a round with accelerated deadlines.</EmptyState> : data.rounds.map((round) => <div key={round.id} className="flex items-center gap-4 border-t border-hairline px-5 py-4"><div className="flex-1"><div className="flex gap-2"><p className="font-semibold text-ink">Round {round.number}</p><Badge>{round.status}</Badge></div><p className="mt-1 text-xs text-ink-3">{round.availableHours} hours · positions {round.positionDeadline} · selection {round.selectionDeadline}</p></div><RoundWorkflowPanel cycleId={data.cycle.id} round={round} portal={portal} startupIds={portal === 'qstp' ? data.participation.map((row) => row.startupId) : data.participation.map((row) => row.startupId)} /></div>)}</Panel></>
      ) : null}

      {workspace === 'placements' ? (
        <div className="grid gap-[var(--rf-gap)] xl:grid-cols-[1fr_1fr]">{data.placements.length === 0 ? <Card className="xl:col-span-2"><EmptyState>No placements have reached onboarding.</EmptyState></Card> : data.placements.map((placement) => <Card key={placement.id}><CardHeading title={`${placement.committedWeeklyHours} h placement`} subtitle={`${placement.startsOn} – ${placement.endsOn} · ${placement.supervisorName}`} aside={<Badge tone={placement.status === 'cancelled' ? 'critical' : placement.status === 'ready_to_start' || placement.status === 'onboarded' ? 'positive' : 'warning'}>{placement.status.replaceAll('_', ' ')}</Badge>} /><ul className="divide-y divide-hairline">{data.requirements.filter((row) => row.placementId === placement.id).map((requirement) => <li key={requirement.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="text-sm font-semibold text-ink">{requirement.title}</p><p className="text-xs capitalize text-ink-3">{requirement.owner} · {requirement.required ? 'required' : 'optional'}</p></div><div className="flex items-center gap-2"><Badge tone={['approved', 'waived'].includes(requirement.status) ? 'positive' : requirement.status === 'correction_requested' ? 'critical' : 'warning'}>{requirement.status.replaceAll('_', ' ')}</Badge><RequirementWorkflowPanel cycleId={data.cycle.id} requirement={requirement} submissions={data.requirementSubmissions.filter((row) => row.requirementId === requirement.id)} portal={portal} /></div></li>)}</ul><div className="flex items-center justify-between gap-3 border-t border-hairline p-5"><p className="text-xs text-ink-3">{data.signatures.filter((row) => row.placementId === placement.id).length}/2 agreements signed</p><PlacementWorkflowPanel cycleId={data.cycle.id} placement={placement} signatures={data.signatures.filter((row) => row.placementId === placement.id)} portal={portal} /></div></Card>)}</div>
      ) : null}

      {workspace === 'activity' ? <Panel><PanelHeader title="Immutable activity timeline" /><ActivityTimeline events={data.activity} /></Panel> : null}
    </div>
  );
}
