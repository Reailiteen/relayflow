import Link from 'next/link';
import {
  CYCLE_STAGES,
  type ActivityEvent,
  type Cycle,
  type PlacementRequirement,
} from '@relayflow/entities';
import type { CycleWorkspace as CycleWorkspaceData } from '@relayflow/logic';
import {
  Badge,
  Card,
  CardHeading,
  EmptyState,
  Metric,
  MetricBar,
  Panel,
  PanelHeader,
} from '@relayflow/ui-web';
import { FIXTURE_SCENARIO_NAMES } from '@/server/context';
import { resetFixtureScenarioAction } from '@/server/actions';
import { AllocationActions } from './workspace-actions';
import { GateReviewPanel, ParticipationPanel } from './operational-panels';
import { RatingPanel } from './rating-panel';
import { PositionIntentPanel } from './position-intent-panel';
import {
  AllocationReviewPanel,
  CandidateAvailabilityPanel,
  CandidateSelectionResponsePanel,
  ConfirmSelectionPanel,
  CandidateImportPanel,
  ConflictWorkflowPanel,
  CreatePositionPanel,
  CreateRoundPanel,
  ExceptionWorkflowPanel,
  FallbackWorkflowPanel,
  InterviewWorkflowPanel,
  OpenFallbackPanel,
  PlacementWorkflowPanel,
  PoolAssignmentPanel,
  PositionWorkflowPanel,
  RecoveryWorkflowPanel,
  RequirementWorkflowPanel,
  RequirementAmendmentPanel,
  RequestInterviewPanel,
  SelectCandidatePanel,
  RequirementTemplatePanel,
  RequirementTemplateEditPanel,
  RoundWorkflowPanel,
  TaskWorkflowPanel,
  TaskAssignmentPanel,
} from './core-workflow-panels';

export type Portal = 'qstp' | 'startup' | 'candidate';
export type Workspace =
  'allocation' | 'positions' | 'selection' | 'recovery' | 'placements' | 'activity';

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

export function CycleSwitcher({
  cycles,
  selected,
  portal,
}: {
  cycles: readonly Cycle[];
  selected: Cycle;
  portal: Portal;
}) {
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
        <li
          key={stage}
          className="flex items-center gap-2 rounded-control border border-hairline bg-panel px-3 py-2"
        >
          <span
            className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${index <= current ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-3'}`}
          >
            {index < current ? '✓' : index + 1}
          </span>
          <span className="truncate text-xs font-semibold capitalize text-ink-2">
            {stage.replaceAll('_', ' ')}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ActivityTimeline({ events }: { events: readonly ActivityEvent[] }) {
  if (events.length === 0)
    return <EmptyState>No activity has been recorded in this workspace yet.</EmptyState>;
  return (
    <ol className="divide-y divide-hairline">
      {events.map((event) => (
        <li
          key={event.id}
          className="grid gap-1 px-5 py-4 sm:grid-cols-[150px_1fr_auto] sm:items-center"
        >
          <time className="text-xs tabular-nums text-ink-3" dateTime={event.occurredAt}>
            {new Intl.DateTimeFormat('en-QA', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Qatar',
            }).format(new Date(event.occurredAt))}
          </time>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{event.action.replaceAll('_', ' ')}</p>
            <p className="truncate text-xs text-ink-3">
              {event.entityType} · {event.entityId}
            </p>
          </div>
          <Badge tone={event.reason ? 'warning' : 'neutral'}>{event.actorRole}</Badge>
          {event.reason ? (
            <p className="sm:col-start-2 text-xs text-ink-2">Reason: {event.reason}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function RequirementChecklist({
  requirements,
}: {
  requirements: readonly PlacementRequirement[];
}) {
  if (requirements.length === 0)
    return <EmptyState>No requirements have been snapshotted.</EmptyState>;
  return (
    <ul className="divide-y divide-hairline">
      {requirements.map((requirement) => (
        <li key={requirement.id} className="flex items-center justify-between gap-4 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">{requirement.title}</p>
            <p className="text-xs capitalize text-ink-3">
              {requirement.owner} · {requirement.required ? 'required' : 'optional'}
            </p>
          </div>
          <Badge
            tone={
              ['approved', 'waived'].includes(requirement.status)
                ? 'positive'
                : requirement.status === 'correction_requested'
                  ? 'critical'
                  : 'warning'
            }
          >
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
        <p className="text-[11px] text-ink-3">
          Fixture upload · revision {revision} · private metadata only
        </p>
      </div>
    </div>
  );
}

function ScenarioSelector() {
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <form
      action={resetFixtureScenarioAction}
      className="flex items-center gap-2 rounded-control border border-dashed border-hairline-strong bg-surface-sunken px-3 py-2"
    >
      <label htmlFor="fixture-scenario" className="text-[11px] font-semibold text-ink-3">
        Fixture scenario
      </label>
      <select
        id="fixture-scenario"
        name="scenario"
        className="rounded-control border border-hairline bg-panel px-2 py-1 text-xs text-ink"
      >
        {FIXTURE_SCENARIO_NAMES.map((scenario) => (
          <option key={scenario} value={scenario}>
            {scenario.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-control bg-accent px-3 py-1 text-xs font-semibold text-white"
      >
        Reset
      </button>
    </form>
  );
}

export function CycleWorkspaceView({
  data,
  portal,
  workspace,
}: {
  data: CycleWorkspaceData;
  portal: Portal;
  workspace: Workspace;
}) {
  const path = basePath(portal, data.cycle.id);
  const next = CYCLE_STAGES[CYCLE_STAGES.indexOf(data.cycle.stage) + 1] ?? null;
  const mineAcknowledged = data.participation.some((row) => row.allocationAcknowledgedAt !== null);
  const draftRun = data.prioritizationRuns.find((row) => row.status === 'draft');

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="info">{data.cycle.stage}</Badge>
            <span className="text-xs text-ink-3">
              {data.cycle.selectionMode.replaceAll('_', ' ')}
            </span>
          </div>
          <h1 className="text-display font-bold tracking-[-0.02em] text-ink">{data.cycle.name}</h1>
          <p className="mt-2 text-sm text-ink-3">
            {data.cycle.startsOn} – {data.cycle.endsOn} · {data.cycle.fundedWeeklyHours} funded
            weekly hours
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {portal === 'qstp' ? <ScenarioSelector /> : null}
          {portal === 'qstp' && data.permissions.manageCycle ? (
            <GateReviewPanel
              cycleId={data.cycle.id}
              stage={data.cycle.stage}
              next={next}
              checks={data.stageGateChecks}
            />
          ) : null}
        </div>
      </header>

      <CycleSwitcher cycles={data.cycles} selected={data.cycle} portal={portal} />
      <StageGateChecklist cycle={data.cycle} />

      <nav
        className="flex gap-1 overflow-x-auto border-b border-hairline"
        aria-label="Cycle workspace"
      >
        {(Object.keys(labels) as Workspace[])
          .filter(
            (item) =>
              portal === 'qstp' ||
              (portal === 'startup'
                ? item !== 'activity'
                : !['recovery', 'activity'].includes(item)),
          )
          .map((item) => (
            <Link
              key={item}
              href={`${path}/${item}`}
              aria-current={item === workspace ? 'page' : undefined}
              className={`border-b-2 px-3 py-2 text-xs font-semibold whitespace-nowrap ${item === workspace ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink'}`}
            >
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
            <Metric
              label="Recoverable"
              value={data.totals.recoverable}
              tone={data.totals.recoverable > 0 ? 'warning' : 'accent'}
            />
          </MetricBar>
          <Panel>
            <PanelHeader
              title="Participation and decisions"
              aside={
                portal === 'candidate' ||
                (portal === 'qstp' && !data.permissions.manageAllocation) ||
                (portal === 'startup' && !data.permissions.acknowledgeAllocation) ? null : (
                  <div className="flex flex-wrap items-center gap-2">
                    {portal === 'qstp' && draftRun ? (
                      <AllocationReviewPanel
                        cycleId={data.cycle.id}
                        run={draftRun}
                        startups={data.startups}
                      />
                    ) : null}
                    <AllocationActions
                      cycleId={data.cycle.id}
                      mode={portal}
                      acknowledged={mineAcknowledged}
                      draftRunId={draftRun?.id}
                      unevaluatedCount={
                        draftRun?.outcomes.filter(
                          (row) =>
                            row.status === 'needs_information' ||
                            row.status === 'awaiting_manual_scores',
                        ).length ?? 0
                      }
                    />
                  </div>
                )
              }
            />
            {data.participation.length === 0 ? (
              <EmptyState>No participation records are visible.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-y border-hairline bg-surface-sunken text-ink-3">
                    <tr>
                      <th className="px-5 py-2">Startup</th>
                      <th>Request</th>
                      <th>Score</th>
                      <th>Tier</th>
                      <th>Acknowledged</th>
                      {portal === 'qstp' ? <th>Rating</th> : null}
                      {portal === 'startup' ? <th>Readiness</th> : null}
                      {data.permissions.manageParticipation ? (
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {data.participation.map((row) => {
                      const allocation = data.allocations.find(
                        (item) => item.startupId === row.startupId,
                      );
                      const startup = data.startups.find((item) => item.id === row.startupId);
                      return (
                        <tr key={row.id}>
                          <td className="px-5 py-3 font-medium text-ink">
                            {startup?.name ?? row.startupId}
                          </td>
                          <td>{row.requestedTotalHours} h</td>
                          <td>{row.operatorScore ?? 'Private'}</td>
                          <td>{allocation?.weeklyHours ?? '—'} h</td>
                          <td>
                            <Badge tone={row.allocationAcknowledgedAt ? 'positive' : 'warning'}>
                              {row.allocationAcknowledgedAt ? 'Yes' : 'Pending'}
                            </Badge>
                          </td>
                          {/*
                            The two inputs the engine actually runs on. Rating is
                            QSTP's judgement; readiness is the startup's own
                            answer. Neither existed before the real engine landed.
                          */}
                          {portal === 'qstp' && startup ? (
                            <td>
                              <RatingPanel
                                cycleId={data.cycle.id}
                                startup={startup}
                                rating={data.ratings.find(
                                  (item) => item.startupId === row.startupId,
                                )}
                                canRate={data.permissions.rateStartups}
                              />
                            </td>
                          ) : null}
                          {portal === 'startup' ? (
                            <td>
                              <PositionIntentPanel
                                cycleId={data.cycle.id}
                                startupId={row.startupId}
                                intent={data.positionIntents.find(
                                  (item) => item.startupId === row.startupId,
                                )}
                                canSubmit={
                                  data.permissions.submitPositions &&
                                  data.cycle.stage === 'allocation'
                                }
                              />
                            </td>
                          ) : null}
                          {data.permissions.manageParticipation ? (
                            <td className="pr-4 text-right">
                              <ParticipationPanel
                                cycleId={data.cycle.id}
                                participation={row}
                                startupName={startup?.name ?? 'Startup'}
                              />
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          {(data.prioritizationRuns.length > 0 || data.allocationHistory.length > 0) &&
          portal !== 'candidate' ? (
            <Panel>
              <PanelHeader
                title="Allocation history"
                aside={<Badge>{data.allocationHistory.length} decisions</Badge>}
              />
              {portal === 'qstp'
                ? [...data.prioritizationRuns]
                    .sort((a, b) => b.version - a.version)
                    .map((run) => (
                      <div key={run.id} className="flex items-center gap-4 border-t border-hairline px-5 py-3 text-xs">
                        <span className="font-semibold text-ink">Prioritization v{run.version}</span>
                        <span className="flex-1 text-ink-3">
                          {run.proposedHours} / {run.budgetHours} weekly hours
                          {run.residualHours > 0 ? ` · ${run.residualHours}h unspent` : ''}
                          {run.completeness === 'partial_draft' ? ' · incomplete' : ''}
                        </span>
                        <Badge tone={run.status === 'confirmed' ? 'positive' : run.status === 'draft' ? 'warning' : 'neutral'}>{run.status}</Badge>
                      </div>
                    ))
                : null}
              {[...data.allocationHistory]
                .sort((a, b) => b.revision - a.revision)
                .map((allocation) => (
                  <div key={allocation.id} className="flex items-center gap-4 border-t border-hairline px-5 py-3 text-xs">
                    <span className="font-semibold text-ink">{data.startups.find((row) => row.id === allocation.startupId)?.name ?? 'Startup'} · v{allocation.revision}</span>
                    <span className="flex-1 text-ink-3">{allocation.weeklyHours} weekly hours</span>
                    <Badge tone={allocation.status === 'confirmed' ? 'positive' : 'neutral'}>{allocation.status}</Badge>
                  </div>
                ))}
            </Panel>
          ) : null}
        </>
      ) : null}

      {workspace === 'positions' ? (
        <Panel>
          <PanelHeader
            title="Position collection and approval"
            aside={
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{data.totals.openSeats} open seats</Badge>
                {portal === 'startup' && data.permissions.submitPositions ? (
                  <CreatePositionPanel
                    cycle={data.cycle}
                    allocatedHours={data.totals.allocated}
                    usedHours={data.positions
                      .filter((row) => !['draft', 'withdrawn', 'closed'].includes(row.status))
                      .reduce((sum, row) => sum + row.hoursPerIntern * row.internCount, 0)}
                    rounds={data.rounds}
                  />
                ) : null}
              </div>
            }
          />
          {data.positions.length === 0 ? (
            <EmptyState>No positions in this cycle.</EmptyState>
          ) : (
            <div className="divide-y divide-hairline">
              {data.positions.map((position) => (
                <div key={position.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-[220px] flex-1">
                    <p className="font-semibold text-ink">{position.title}</p>
                    <p className="text-xs text-ink-3">
                      {position.internCount} seat{position.internCount === 1 ? '' : 's'} ·{' '}
                      {position.hoursPerIntern} h · {position.workArrangement}
                    </p>
                    {position.reviewNote ? (
                      <p className="mt-1 text-xs text-warning-text">{position.reviewNote}</p>
                    ) : null}
                  </div>
                  <Badge
                    tone={
                      ['approved', 'locked', 'filled'].includes(position.status)
                        ? 'positive'
                        : position.status === 'changes_requested'
                          ? 'critical'
                          : 'warning'
                    }
                  >
                    {position.status.replaceAll('_', ' ')}
                  </Badge>
                  {portal === 'startup' &&
                  data.permissions.submitPositions &&
                  ['draft', 'changes_requested'].includes(position.status) ? (
                    <CreatePositionPanel
                      cycle={data.cycle}
                      allocatedHours={data.totals.allocated}
                      usedHours={data.positions
                        .filter(
                          (row) =>
                            row.id !== position.id &&
                            !['draft', 'withdrawn', 'closed'].includes(row.status),
                        )
                        .reduce((sum, row) => sum + row.hoursPerIntern * row.internCount, 0)}
                      rounds={data.rounds}
                      position={position}
                    />
                  ) : null}
                  <PositionWorkflowPanel
                    cycleId={data.cycle.id}
                    position={position}
                    portal={portal}
                    readOnly={
                      portal === 'qstp'
                        ? !data.permissions.reviewPositions
                        : portal === 'startup'
                          ? !data.permissions.submitPositions
                          : true
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {workspace === 'selection' ? (
        <>
          {portal === 'candidate' && data.candidates[0] ? (
            <Panel>
              <PanelHeader
                title="Your availability"
                aside={
                  <CandidateAvailabilityPanel
                    cycleId={data.cycle.id}
                    candidate={data.candidates[0]}
                  />
                }
              />
              <div className="border-t border-hairline px-5 py-4 text-sm text-ink-2">
                Current status:{' '}
                <strong className="text-ink">
                  {data.candidates[0].availability.replaceAll('_', ' ')}
                </strong>
              </div>
            </Panel>
          ) : null}
          <MetricBar className="lg:grid-cols-3">
            <Metric
              label="Confirmed placements"
              value={data.placements.filter((row) => row.status !== 'cancelled').length}
            />
            <Metric label="Open seats" value={data.totals.openSeats} />
            <Metric
              label="Selection mode"
              value={data.cycle.selectionMode === 'first_come' ? 'FCFS' : 'Choice'}
            />
          </MetricBar>
          <Panel>
            <PanelHeader
              title="Selection queue"
              aside={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{data.selections.length}</Badge>
                  {portal === 'qstp' && data.permissions.manageCandidates ? (
                    <>
                      <CandidateImportPanel cycleId={data.cycle.id} />
                      <PoolAssignmentPanel
                        cycleId={data.cycle.id}
                        candidates={data.candidates}
                        positions={data.positions.filter((row) =>
                          ['approved', 'locked'].includes(row.status),
                        )}
                        poolEntries={data.poolEntries}
                      />
                      {data.cycle.selectionMode === 'candidate_choice' ? (
                        <OpenFallbackPanel
                          cycleId={data.cycle.id}
                          candidates={data.candidates.filter(
                            (candidate) =>
                              data.selections.some(
                                (selection) =>
                                  selection.candidateId === candidate.id &&
                                  selection.status === 'offered',
                              ) &&
                              !data.fallbackCases.some(
                                (fallback) => fallback.candidateId === candidate.id,
                              ),
                          )}
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
              }
            />
            {data.selections.length === 0 ? (
              <EmptyState>No selections or offers in this cycle.</EmptyState>
            ) : (
              data.selections.map((selection) => {
                const candidate = data.candidates.find((row) => row.id === selection.candidateId);
                const position = data.positions.find((row) => row.id === selection.positionId);
                return (
                  <div
                    key={selection.id}
                    className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-ink">
                        {candidate?.fullName ?? `Candidate ${selection.candidateId.slice(0, 8)}`}
                      </p>
                      <p className="text-xs text-ink-3">
                        {position?.title ?? 'Position'} · startup {selection.startupId.slice(0, 8)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        selection.status === 'confirmed' || selection.status === 'accepted'
                          ? 'positive'
                          : selection.status === 'declined' || selection.status === 'cancelled'
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {selection.status}
                    </Badge>
                    {portal === 'qstp' &&
                    data.permissions.completeOnboarding &&
                    selection.status === 'accepted' ? (
                      <ConfirmSelectionPanel
                        cycle={data.cycle}
                        selection={selection}
                        position={position}
                      />
                    ) : null}
                    {portal === 'candidate' &&
                    (selection.status === 'offered' || selection.status === 'reserved') ? (
                      <CandidateSelectionResponsePanel
                        cycleId={data.cycle.id}
                        selection={selection}
                        position={position}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </Panel>
          {data.poolEntries.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Candidate processes"
                aside={<Badge>{data.poolEntries.length} pool entries</Badge>}
              />
              {data.poolEntries.map(({ entry, candidate }) => {
                const position = data.positions.find((row) => row.id === entry.positionId);
                const existingInterview = data.interviews.find(
                  (row) =>
                    row.positionId === entry.positionId &&
                    row.candidateId === candidate.id &&
                    !['completed', 'cancelled', 'no_show'].includes(row.status),
                );
                const activeSelection = data.selections.find(
                  (row) =>
                    row.positionId === entry.positionId &&
                    row.candidateId === candidate.id &&
                    !['declined', 'released', 'lost', 'cancelled'].includes(row.status),
                );
                return (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-ink">{candidate.fullName}</p>
                      <p className="text-xs text-ink-3">
                        {position?.title ?? 'Position'} · shared {entry.sharedAt} ·{' '}
                        {candidate.availability}
                      </p>
                    </div>
                    <Badge tone={entry.status === 'lost' || entry.status === 'withdrawn' ? 'critical' : entry.status === 'pending' ? 'warning' : 'info'}>
                      {entry.status.replaceAll('_', ' ')}
                    </Badge>
                    {portal === 'startup' &&
                    data.permissions.assessTasks &&
                    position &&
                    !existingInterview &&
                    ['available', 'unconfirmed'].includes(candidate.availability) ? (
                      <RequestInterviewPanel
                        cycleId={data.cycle.id}
                        position={position}
                        candidate={candidate}
                      />
                    ) : null}
                    {portal === 'startup' &&
                    data.permissions.selectCandidates &&
                    position &&
                    !activeSelection &&
                    ['available', 'unconfirmed'].includes(candidate.availability) ? (
                      <SelectCandidatePanel
                        position={position}
                        candidate={candidate}
                        mode={data.cycle.selectionMode}
                      />
                    ) : null}
                  </div>
                );
              })}
            </Panel>
          ) : null}
          {data.interviews.length > 0 ? (
            <Panel>
              <PanelHeader title="Interviews" aside={<Badge>{data.interviews.length}</Badge>} />
              {data.interviews.map((interview) => (
                <div
                  key={interview.id}
                  className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-ink">
                      {data.candidates.find((row) => row.id === interview.candidateId)?.fullName ??
                        interview.candidateId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-ink-3">
                      {data.positions.find((row) => row.id === interview.positionId)?.title ??
                        'Position'}{' '}
                      · {interview.scheduledFor ?? 'time pending'}
                    </p>
                  </div>
                  <Badge tone={interview.status === 'completed' ? 'positive' : interview.status === 'cancelled' || interview.status === 'no_show' ? 'critical' : 'warning'}>
                    {interview.status.replaceAll('_', ' ')}
                  </Badge>
                  <InterviewWorkflowPanel
                    cycleId={data.cycle.id}
                    interview={interview}
                    portal={portal}
                    readOnly={portal === 'qstp'}
                  />
                </div>
              ))}
            </Panel>
          ) : null}
          {portal === 'qstp' && data.conflicts.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Selection conflicts"
                aside={
                  <Badge tone="critical">
                    {data.conflicts.filter((row) => row.status === 'open').length} open
                  </Badge>
                }
              />
              {data.conflicts.map((conflict) => (
                <div
                  key={conflict.id}
                  className="flex items-center gap-4 border-t border-hairline px-5 py-4"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-ink">
                      Candidate {conflict.candidateId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-ink-3">
                      {conflict.previousStartupId.slice(0, 8)} →{' '}
                      {conflict.requestedStartupId.slice(0, 8)}
                    </p>
                  </div>
                  <Badge tone={conflict.status === 'open' ? 'critical' : 'neutral'}>
                    {conflict.status}
                  </Badge>
                  <ConflictWorkflowPanel
                    cycleId={data.cycle.id}
                    conflict={conflict}
                    readOnly={!data.permissions.resolveSelection}
                  />
                </div>
              ))}
            </Panel>
          ) : null}
          {data.tasks.length > 0 || data.permissions.assessTasks ? (
            <Panel>
              <PanelHeader
                title="Position tasks"
                aside={
                  <div className="flex items-center gap-2">
                    <Badge>{data.tasks.length}</Badge>
                    {data.permissions.assessTasks ? (
                      <TaskAssignmentPanel
                        cycleId={data.cycle.id}
                        positions={data.positions}
                        poolEntries={data.poolEntries}
                        templates={data.taskTemplates}
                      />
                    ) : null}
                  </div>
                }
              />
              {data.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-ink">
                      Task for{' '}
                      {data.candidates.find((row) => row.id === task.candidateId)?.fullName ??
                        task.candidateId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-ink-3">
                      Due {task.dueAt}
                      {task.reviewNotes ? ` · ${task.reviewNotes}` : ''}
                    </p>
                  </div>
                  <Badge
                    tone={
                      task.status === 'reviewed'
                        ? 'positive'
                        : task.lateAccepted
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {task.status}
                  </Badge>
                  <TaskWorkflowPanel
                    cycleId={data.cycle.id}
                    task={task}
                    portal={portal}
                    readOnly={portal !== 'candidate' && !data.permissions.assessTasks}
                  />
                </div>
              ))}
            </Panel>
          ) : null}
          {data.fallbackCases.length > 0 ? (
            <Panel>
              <PanelHeader title="Candidate-choice fallback" />
              {data.fallbackCases.map((fallback) => (
                <div
                  key={fallback.id}
                  className="flex items-center justify-between gap-4 border-t border-hairline px-5 py-4"
                >
                  <div>
                    <p className="font-semibold text-ink">
                      Offer {fallback.currentOfferIndex + 1} of {fallback.orderedOfferIds.length}
                    </p>
                    <p className="text-xs text-ink-3">Response due {fallback.responseDeadline}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={fallback.status === 'open' ? 'warning' : 'positive'}>
                      {fallback.status}
                    </Badge>
                    {portal === 'qstp' && data.permissions.resolveSelection ? (
                      <FallbackWorkflowPanel
                        cycleId={data.cycle.id}
                        fallback={fallback}
                        selections={data.selections}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </Panel>
          ) : null}
        </>
      ) : null}

      {(workspace === 'positions' || workspace === 'selection') && portal !== 'candidate' ? (
        <Panel>
          <PanelHeader
            title="Deadline exceptions"
            aside={
              portal === 'startup' &&
              !data.exceptions.some(
                (row) =>
                  row.kind ===
                    (workspace === 'positions'
                      ? 'position_submission'
                      : 'candidate_selection') &&
                  ['pending', 'approved'].includes(row.status),
              ) ? (
                <ExceptionWorkflowPanel cycle={data.cycle} portal={portal} />
              ) : null
            }
          />
          {data.exceptions.filter(
            (row) =>
              row.kind ===
              (workspace === 'positions' ? 'position_submission' : 'candidate_selection'),
          ).length === 0 ? (
            <EmptyState>No exception requests for this deadline.</EmptyState>
          ) : (
            data.exceptions
              .filter(
                (row) =>
                  row.kind ===
                  (workspace === 'positions'
                    ? 'position_submission'
                    : 'candidate_selection'),
              )
              .map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-ink">
                      {data.startups.find((row) => row.id === request.startupId)?.name ??
                        request.startupId}
                    </p>
                    <p className="text-xs text-ink-3">
                      Requested {request.requestedDeadline}
                    </p>
                  </div>
                  <Badge
                    tone={
                      request.status === 'approved'
                        ? 'positive'
                        : request.status === 'rejected'
                          ? 'critical'
                          : 'warning'
                    }
                  >
                    {request.status}
                  </Badge>
                  <ExceptionWorkflowPanel cycle={data.cycle} request={request} portal={portal} />
                </div>
              ))
          )}
        </Panel>
      ) : null}

      {workspace === 'recovery' ? (
        <>
          <MetricBar className="lg:grid-cols-3">
            <Metric label="Recovery cases" value={data.recoveryCases.length} />
            <Metric label="Rounds" value={data.rounds.length} />
            <Metric
              label="Recoverable hours"
              value={data.recoveryCases
                .filter((row) => row.status !== 'exception_protected')
                .reduce((sum, row) => sum + row.recoverableHours, 0)}
              tone="warning"
            />
          </MetricBar>
          <Panel>
            <PanelHeader
              title="Recovery review"
              aside={
                portal === 'qstp' && data.permissions.runRedistribution ? (
                  <CreateRoundPanel cycleId={data.cycle.id} cases={data.recoveryCases} />
                ) : null
              }
            />
            {data.recoveryCases.length === 0 ? (
              <EmptyState>No hours need recovery.</EmptyState>
            ) : (
              data.recoveryCases.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-4"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-ink">
                      {item.recoverableHours} hours ·{' '}
                      {data.startups.find((row) => row.id === item.startupId)?.name ??
                        item.startupId}
                    </p>
                    <p className="text-xs text-ink-3">{item.reason}</p>
                  </div>
                  <Badge
                    tone={
                      item.status.includes('protected')
                        ? 'info'
                        : item.status === 'potential'
                          ? 'warning'
                          : 'positive'
                    }
                  >
                    {item.status.replaceAll('_', ' ')}
                  </Badge>
                  {portal === 'qstp' && data.permissions.runRedistribution ? (
                    <RecoveryWorkflowPanel cycleId={data.cycle.id} recoveryCase={item} />
                  ) : null}
                </div>
              ))
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Redistribution rounds" />
            {data.rounds.length === 0 ? (
              <EmptyState>
                Confirm recovery cases, then open a round with accelerated deadlines.
              </EmptyState>
            ) : (
              data.rounds.map((round) => (
                <div
                  key={round.id}
                  className="flex items-center gap-4 border-t border-hairline px-5 py-4"
                >
                  <div className="flex-1">
                    <div className="flex gap-2">
                      <p className="font-semibold text-ink">Round {round.number}</p>
                      <Badge>{round.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-3">
                      {round.availableHours} hours · positions {round.positionDeadline} · selection{' '}
                      {round.selectionDeadline}
                    </p>
                  </div>
                  <RoundWorkflowPanel
                    cycleId={data.cycle.id}
                    round={round}
                    portal={
                      portal === 'qstp' && !data.permissions.runRedistribution
                        ? 'candidate'
                        : portal
                    }
                    startupIds={data.participation.map((row) => row.startupId)}
                  />
                </div>
              ))
            )}
          </Panel>
        </>
      ) : null}

      {workspace === 'placements' ? (
        <div className="grid gap-[var(--rf-gap)] xl:grid-cols-[1fr_1fr]">
          {portal !== 'candidate' ? (
            <Panel className="xl:col-span-2">
              <PanelHeader
                title="Requirement templates"
                aside={
                  (portal === 'qstp' && data.permissions.verifyDocuments) ||
                  (portal === 'startup' && data.permissions.submitPositions) ? (
                    <div className="flex flex-wrap gap-2">
                      {portal === 'qstp' ? (
                        <RequirementAmendmentPanel
                          cycleId={data.cycle.id}
                          placements={data.placements}
                        />
                      ) : null}
                      <RequirementTemplatePanel
                        cycleId={data.cycle.id}
                        positions={data.positions}
                        startupMode={portal === 'startup'}
                      />
                    </div>
                  ) : null
                }
              />
              {data.requirementTemplates.length === 0 ? (
                <EmptyState>No requirement templates are visible.</EmptyState>
              ) : (
                <div className="divide-y divide-hairline">
                  {data.requirementTemplates.map((template) => (
                    <div key={template.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-ink">{template.title}</p>
                        <p className="text-xs text-ink-3">
                          {template.positionId ? 'Position specific' : 'Cycle wide'} ·{' '}
                          {template.owner} owned
                        </p>
                      </div>
                      <Badge tone={template.active ? 'positive' : 'neutral'}>
                        {template.active ? (template.required ? 'Required' : 'Optional') : 'Inactive'}
                      </Badge>
                      {portal === 'qstp' && data.permissions.verifyDocuments ? (
                        <RequirementTemplateEditPanel
                          cycleId={data.cycle.id}
                          template={template}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}
          {data.placements.length === 0 ? (
            <Card className="xl:col-span-2">
              <EmptyState>No placements have reached onboarding.</EmptyState>
            </Card>
          ) : (
            data.placements.map((placement) => (
              <Card key={placement.id}>
                <CardHeading
                  title={`${placement.committedWeeklyHours} h placement`}
                  subtitle={`${placement.startsOn} – ${placement.endsOn} · ${placement.supervisorName}`}
                  aside={
                    <Badge
                      tone={
                        placement.status === 'cancelled'
                          ? 'critical'
                          : placement.status === 'ready_to_start' ||
                              placement.status === 'onboarded'
                            ? 'positive'
                            : 'warning'
                      }
                    >
                      {placement.status.replaceAll('_', ' ')}
                    </Badge>
                  }
                />
                <ul className="divide-y divide-hairline">
                  {data.requirements
                    .filter((row) => row.placementId === placement.id)
                    .map((requirement) => (
                      <li
                        key={requirement.id}
                        className="flex items-center justify-between gap-4 px-5 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-ink">{requirement.title}</p>
                          <p className="text-xs capitalize text-ink-3">
                            {requirement.owner} · {requirement.required ? 'required' : 'optional'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            tone={
                              ['approved', 'waived'].includes(requirement.status)
                                ? 'positive'
                                : requirement.status === 'correction_requested'
                                  ? 'critical'
                                  : 'warning'
                            }
                          >
                            {requirement.status.replaceAll('_', ' ')}
                          </Badge>
                          <RequirementWorkflowPanel
                            cycleId={data.cycle.id}
                            requirement={requirement}
                            submissions={data.requirementSubmissions.filter(
                              (row) => row.requirementId === requirement.id,
                            )}
                            portal={portal}
                            readOnly={
                              placement.status === 'cancelled' ||
                              (portal === 'qstp' && !data.permissions.verifyDocuments)
                            }
                          />
                        </div>
                      </li>
                    ))}
                </ul>
                <div className="flex items-center justify-between gap-3 border-t border-hairline p-5">
                  <p className="text-xs text-ink-3">
                    {data.signatures.filter((row) => row.placementId === placement.id).length}/2
                    agreements signed
                  </p>
                  <PlacementWorkflowPanel
                    cycleId={data.cycle.id}
                    placement={placement}
                    signatures={data.signatures.filter((row) => row.placementId === placement.id)}
                    portal={portal}
                    readOnly={
                      placement.status === 'cancelled' ||
                      (portal === 'qstp' && !data.permissions.completeOnboarding)
                    }
                    blockers={
                      data.placementReadiness.find((row) => row.placementId === placement.id)
                        ?.blockers ?? []
                    }
                  />
                </div>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {workspace === 'activity' ? (
        <Panel>
          <PanelHeader title="Immutable activity timeline" />
          <ActivityTimeline events={data.activity} />
        </Panel>
      ) : null}
    </div>
  );
}
