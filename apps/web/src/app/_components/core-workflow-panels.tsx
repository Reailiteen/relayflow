'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, ClipboardCheck, FileUp, History, Plus, RotateCcw, ShieldAlert, Signature, UserRoundCheck } from 'lucide-react';
import type {
  CandidateChoiceFallback,
  Cycle,
  CycleId,
  Placement,
  PlacementRequirement,
  PlacementSignature,
  Position,
  RecoveryCase,
  RedistributionRound,
  RequirementSubmission,
  Selection,
  SelectionConflict,
  TaskAssignment,
} from '@relayflow/entities';
import {
  Badge,
  Button,
  SelectField,
  SidePanel,
  SidePanelBody,
  SidePanelClose,
  SidePanelContent,
  SidePanelFooter,
  TextAreaField,
  TextField,
} from '@relayflow/ui-web';
import {
  cancelPlacementAction,
  closeRedistributionRoundAction,
  confirmPlacementAction,
  createRedistributionRoundAction,
  decideRequirementAction,
  finalizePlacementAction,
  inviteRedistributionAction,
  overrideCandidateChoiceAction,
  protectRecoveryAction,
  resolveSelectionConflictAction,
  respondCandidateChoiceFallbackAction,
  respondRedistributionInvitationAction,
  reviewTaskAction,
  setPlacementReadinessAction,
  signPlacementAgreementAction,
  submitPositionAction,
  submitRequirementAction,
  submitTaskAction,
  transitionPositionAction,
} from '@/server/actions';
import type { Portal } from './cycle-workspace';

type ActionResult = { ok: boolean; message?: string };

function Feedback({ value }: { value: { text: string; error: boolean } | null }) {
  if (!value) return null;
  return <div role="status" className={`rounded-control border px-4 py-3 text-sm ${value.error ? 'border-critical/20 bg-critical-subtle text-critical-text' : 'border-positive/20 bg-positive-subtle text-positive-text'}`}>{value.text}</div>;
}

function usePanelAction(close?: () => void) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const run = (action: () => Promise<ActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback({ text: result.ok ? 'Saved.' : (result.message ?? 'Could not complete this action.'), error: !result.ok });
      if (result.ok) close?.();
    });
  };
  return { pending, feedback, run, clear: () => setFeedback(null) };
}

export function CreatePositionPanel({
  cycle,
  allocatedHours,
  usedHours,
  rounds,
}: {
  cycle: Cycle;
  allocatedHours: number;
  usedHours: number;
  rounds: readonly RedistributionRound[];
}) {
  const [open, setOpen] = useState(false);
  const action = usePanelAction(() => setOpen(false));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [arrangement, setArrangement] = useState<'onsite' | 'hybrid' | 'remote'>('hybrid');
  const [requirements, setRequirements] = useState('');
  const [interns, setInterns] = useState('1');
  const [hours, setHours] = useState('20');
  const [weeks, setWeeks] = useState('12');
  const [supervisor, setSupervisor] = useState('');
  const acceptedRounds = rounds.filter((round) => round.invitations.some((row) => row.status === 'accepted'));
  const [roundId, setRoundId] = useState('');
  const requested = Number(interns) * Number(hours);
  const remaining = Math.max(0, allocatedHours - usedHours);
  const over = requested > remaining;

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button variant="primary" onClick={() => setOpen(true)}><Plus />New position</Button>
      <SidePanelContent title="Create position" description="Define the role, seats, weekly-hour commitment, and day-to-day supervision." width="lg">
        <SidePanelBody className="space-y-6">
          <div className="grid grid-cols-3 gap-3 rounded-control border border-hairline bg-surface-sunken px-4 py-3 text-center"><div><p className="text-[11px] text-ink-3">Allocated</p><p className="mt-1 font-bold text-ink">{allocatedHours} h</p></div><div><p className="text-[11px] text-ink-3">Reserved</p><p className="mt-1 font-bold text-ink">{usedHours} h</p></div><div><p className="text-[11px] text-ink-3">This role</p><p className={`mt-1 font-bold ${over ? 'text-critical-text' : 'text-accent'}`}>{requested} h</p></div></div>
          <TextField label="Role title" required value={title} onChange={(event) => setTitle(event.target.value)} />
          <TextAreaField label="Role description" required rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
          <TextField label="Required skills" value={skills} onChange={(event) => setSkills(event.target.value)} hint="Comma separated." />
          <div className="grid gap-4 sm:grid-cols-3"><TextField label="Seats" type="number" min="1" max="20" value={interns} onChange={(event) => setInterns(event.target.value)} /><TextField label="Hours per seat" type="number" min="1" max="60" value={hours} onChange={(event) => setHours(event.target.value)} /><TextField label="Duration in weeks" type="number" min="1" max="52" value={weeks} onChange={(event) => setWeeks(event.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Work arrangement" value={arrangement} onChange={(event) => setArrangement(event.target.value as typeof arrangement)}><option value="onsite">On site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></SelectField><TextField label="Supervisor" value={supervisor} onChange={(event) => setSupervisor(event.target.value)} /></div>
          <TextAreaField label="Additional requirements" rows={3} value={requirements} onChange={(event) => setRequirements(event.target.value)} />
          {acceptedRounds.length > 0 ? <SelectField label="Submission context" value={roundId} onChange={(event) => setRoundId(event.target.value)}><option value="">Initial allocation</option>{acceptedRounds.map((round) => <option key={round.id} value={round.id}>Redistribution round {round.number} · due {round.positionDeadline}</option>)}</SelectField> : null}
          {over ? <div className="rounded-control border border-critical/20 bg-critical-subtle px-4 py-3 text-sm text-critical-text">This position needs {requested} hours, but only {remaining} remain.</div> : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter><p className="text-xs text-ink-3">Submission reserves {requested} weekly hours.</p><div className="flex gap-2"><SidePanelClose asChild><Button variant="ghost">Cancel</Button></SidePanelClose><Button variant="primary" disabled={action.pending || over || !title.trim() || !description.trim()} onClick={() => action.run(() => submitPositionAction({ cycleId: cycle.id, redistributionRoundId: roundId || null, title, description, requiredSkills: skills.split(',').map((row) => row.trim()).filter(Boolean), workArrangement: arrangement, additionalRequirements: requirements.trim() || null, internCount: Number(interns), hoursPerIntern: Number(hours), durationWeeks: Number(weeks), supervisorName: supervisor.trim() || null }))}>{action.pending ? 'Submitting…' : 'Submit for review'}</Button></div></SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function PositionWorkflowPanel({ cycleId, position, portal, readOnly = false }: { cycleId: CycleId; position: Position; portal: Portal; readOnly?: boolean | undefined }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const action = usePanelAction();
  const qstpTransitions: Partial<Record<Position['status'], Position['status'][]>> = { submitted: ['under_review'], resubmitted: ['under_review'], under_review: ['changes_requested', 'approved', 'closed'], approved: ['locked', 'changes_requested', 'closed'], locked: ['approved', 'filled', 'closed'] };
  const startupTransitions: Partial<Record<Position['status'], Position['status'][]>> = { changes_requested: ['resubmitted', 'withdrawn'], draft: ['submitted', 'withdrawn'], submitted: ['withdrawn'] };
  const transitions = readOnly ? [] : portal === 'qstp' ? (qstpTransitions[position.status] ?? []) : portal === 'startup' ? (startupTransitions[position.status] ?? []) : [];
  const requiresReason = (to: Position['status']) => to === 'changes_requested' || (position.status === 'locked' && to === 'approved');
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>View</Button>
      <SidePanelContent title={position.title} description={`${position.internCount} seat${position.internCount === 1 ? '' : 's'} · ${position.hoursPerIntern} weekly hours each · ${position.workArrangement}`} width="lg">
        <SidePanelBody className="space-y-6">
          <div className="flex flex-wrap gap-2"><Badge tone={['approved', 'locked', 'filled'].includes(position.status) ? 'positive' : position.status === 'changes_requested' ? 'critical' : 'warning'}>{position.status.replaceAll('_', ' ')}</Badge>{position.redistributionRoundId ? <Badge tone="info">Accelerated round</Badge> : null}</div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Role</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-2">{position.description}</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-control border border-hairline p-4"><p className="text-xs text-ink-3">Required skills</p><p className="mt-2 text-sm text-ink">{position.requiredSkills.join(', ') || 'None specified'}</p></div><div className="rounded-control border border-hairline p-4"><p className="text-xs text-ink-3">Supervisor</p><p className="mt-2 text-sm text-ink">{position.supervisorName ?? 'Not assigned'}</p></div></div>
          {position.additionalRequirements ? <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Additional requirements</p><p className="mt-2 text-sm text-ink-2">{position.additionalRequirements}</p></div> : null}
          <section className="border-t border-hairline pt-5"><div className="mb-3 flex items-center gap-2"><History className="size-4 text-ink-3" /><p className="text-sm font-bold text-ink">Review history</p></div>{position.reviewHistory.length === 0 ? <p className="text-sm text-ink-3">No review decisions yet.</p> : <ol className="space-y-2">{position.reviewHistory.map((row, index) => <li key={`${row.occurredAt}-${index}`} className="rounded-control bg-surface-sunken px-3 py-2"><div className="flex justify-between gap-3"><span className="text-xs font-semibold capitalize text-ink">{row.status.replaceAll('_', ' ')}</span><time className="text-[11px] text-ink-3">{row.occurredAt}</time></div>{row.note ? <p className="mt-1 text-xs text-ink-2">{row.note}</p> : null}</li>)}</ol>}</section>
          {transitions.some(requiresReason) ? <TextAreaField label="Decision reason" value={reason} onChange={(event) => setReason(event.target.value)} hint="Required when requesting changes or reopening a locked position." /> : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter><p className="text-xs text-ink-3">All transitions are validated and retained.</p><div className="flex flex-wrap gap-2"><SidePanelClose asChild><Button variant="ghost">Close</Button></SidePanelClose>{transitions.map((to) => <Button key={to} variant={to === 'approved' || to === 'locked' || to === 'submitted' || to === 'resubmitted' ? 'primary' : to === 'closed' || to === 'withdrawn' ? 'danger' : 'secondary'} disabled={action.pending || (requiresReason(to) && !reason.trim())} onClick={() => action.run(() => transitionPositionAction({ cycleId, positionId: position.id, to, reason: requiresReason(to) ? reason : null }))}>{to.replaceAll('_', ' ')}</Button>)}</div></SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function TaskWorkflowPanel({ cycleId, task, portal, readOnly = false }: { cycleId: CycleId; task: TaskAssignment; portal: Portal; readOnly?: boolean | undefined }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('task-submission.pdf');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const action = usePanelAction();
  return <SidePanel open={open} onOpenChange={setOpen}><Button size="xs" variant="secondary" onClick={() => setOpen(true)}>Open task</Button><SidePanelContent title="Candidate task" description={`Due ${task.dueAt} · current status ${task.status}`} width="md"><SidePanelBody className="space-y-5"><div className="rounded-control border border-hairline p-4"><p className="text-xs text-ink-3">Candidate</p><p className="mt-1 font-semibold text-ink">{task.candidateId}</p></div>{task.fileName ? <div className="rounded-control bg-surface-sunken px-4 py-3 text-sm text-ink"><FileUp className="mr-2 inline size-4" />{task.fileName}{task.lateAccepted ? <Badge className="ml-2" tone="warning">Late accepted</Badge> : null}</div> : null}{!readOnly && portal === 'candidate' && task.status === 'assigned' ? <><TextField label="Simulated file name" value={fileName} onChange={(event) => setFileName(event.target.value)} /><TextField label="Submission link" type="url" value={link} onChange={(event) => setLink(event.target.value)} hint="Provide a file name, a link, or both." /></> : null}{!readOnly && portal !== 'candidate' && task.status === 'submitted' ? <TextAreaField label="Accountable review notes" required value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} /> : null}{task.reviewNotes ? <div><p className="text-xs font-semibold text-ink-3">Review notes</p><p className="mt-2 text-sm text-ink-2">{task.reviewNotes}</p></div> : null}<Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Close</Button></SidePanelClose>{!readOnly && portal === 'candidate' && task.status === 'assigned' ? <Button variant="primary" disabled={action.pending || (!fileName.trim() && !link.trim())} onClick={() => action.run(() => submitTaskAction({ cycleId, assignmentId: task.id, fileName: fileName.trim() || null, linkUrl: link.trim() || null }))}>Submit task</Button> : null}{!readOnly && portal !== 'candidate' && task.status === 'submitted' ? <Button variant="primary" disabled={action.pending || !notes.trim()} onClick={() => action.run(() => reviewTaskAction({ cycleId, assignmentId: task.id, notes }))}>Complete review</Button> : null}</SidePanelFooter></SidePanelContent></SidePanel>;
}

export function ConflictWorkflowPanel({ cycleId, conflict, readOnly = false }: { cycleId: CycleId; conflict: SelectionConflict; readOnly?: boolean | undefined }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const action = usePanelAction();
  return <SidePanel open={open} onOpenChange={setOpen}><Button size="xs" variant={conflict.status === 'open' && !readOnly ? 'danger' : 'secondary'} onClick={() => setOpen(true)}>{conflict.status === 'open' && !readOnly ? 'Resolve conflict' : 'View decision'}</Button><SidePanelContent title="Selection conflict" description="Review the blocking claim and attempted startup before making an atomic decision." width="lg"><SidePanelBody className="space-y-5"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-control border border-hairline p-4"><p className="text-xs text-ink-3">Current startup</p><p className="mt-1 font-semibold text-ink">{conflict.previousStartupId}</p></div><div className="rounded-control border border-critical/20 bg-critical-subtle p-4"><p className="text-xs text-critical-text">Attempting startup</p><p className="mt-1 font-semibold text-critical-text">{conflict.requestedStartupId}</p></div></div><div className="rounded-control bg-surface-sunken px-4 py-3 text-xs text-ink-2">Candidate {conflict.candidateId} · blocking selection {conflict.blockingSelectionId}</div>{conflict.status === 'open' && !readOnly ? <TextAreaField label="Decision reason" required value={reason} onChange={(event) => setReason(event.target.value)} hint="Recorded with the previous and requested startup impact." rows={5} /> : <p className="text-sm text-ink-2">{conflict.reason ?? 'Awaiting an authorized operator decision.'}</p>}<Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Close</Button></SidePanelClose>{conflict.status === 'open' && !readOnly ? <div className="flex gap-2"><Button disabled={action.pending || !reason.trim()} onClick={() => action.run(() => resolveSelectionConflictAction({ cycleId, conflictId: conflict.id, decision: 'dismissed', reason }))}>Dismiss attempt</Button><Button variant="danger" disabled={action.pending || !reason.trim()} onClick={() => action.run(() => resolveSelectionConflictAction({ cycleId, conflictId: conflict.id, decision: 'overridden', reason }))}>Override claim</Button></div> : null}</SidePanelFooter></SidePanelContent></SidePanel>;
}

export function FallbackWorkflowPanel({ cycleId, fallback, selections }: { cycleId: CycleId; fallback: CandidateChoiceFallback; selections: readonly Selection[] }) {
  const [open, setOpen] = useState(false); const [deadline, setDeadline] = useState(''); const [reason, setReason] = useState(''); const [chosen, setChosen] = useState(fallback.orderedOfferIds[fallback.currentOfferIndex] ?? ''); const [highRisk, setHighRisk] = useState(false); const action = usePanelAction();
  const offers = selections.filter((row) => fallback.orderedOfferIds.includes(row.id));
  return <SidePanel open={open} onOpenChange={setOpen}><Button size="xs" variant="secondary" onClick={() => setOpen(true)}>Manage fallback</Button><SidePanelContent title="Candidate-choice fallback" description={`Offer ${fallback.currentOfferIndex + 1} of ${fallback.orderedOfferIds.length} · response due ${fallback.responseDeadline}`} width="lg"><SidePanelBody className="space-y-5"><ol className="space-y-2">{offers.map((offer, index) => <li key={offer.id} className="flex items-center justify-between rounded-control border border-hairline px-4 py-3"><div><p className="text-sm font-semibold text-ink">Offer {index + 1} · startup {offer.startupId}</p><p className="text-xs text-ink-3">{offer.status}</p></div>{index === fallback.currentOfferIndex ? <Badge tone="warning">Current</Badge> : null}</li>)}</ol>{fallback.status === 'open' ? <><TextField label="Next response deadline" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} hint="Optional. A declined offer defaults to another 48 hours." /><div className="border-t border-hairline pt-5"><div className="mb-3 flex items-center gap-2"><ShieldAlert className="size-4 text-critical-text" /><p className="text-sm font-bold text-ink">Manager-only override</p></div><SelectField label="Force selected offer" value={chosen} onChange={(event) => setChosen(event.target.value)}>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.startupId} · {offer.status}</option>)}</SelectField><TextAreaField label="Override reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} /><label className="flex items-start gap-3 rounded-control border border-critical/20 bg-critical-subtle px-4 py-3 text-sm text-critical-text"><input type="checkbox" className="mt-0.5" checked={highRisk} onChange={(event) => setHighRisk(event.target.checked)} />I understand this replaces the candidate-choice outcome and affects sibling offers.</label></div></> : null}<Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Close</Button></SidePanelClose>{fallback.status === 'open' ? <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={action.pending} onClick={() => action.run(() => respondCandidateChoiceFallbackAction({ cycleId, fallbackCaseId: fallback.id, response: 'accepted', nextResponseDeadline: null }))}>Accept current offer</Button><Button disabled={action.pending} onClick={() => action.run(() => respondCandidateChoiceFallbackAction({ cycleId, fallbackCaseId: fallback.id, response: 'declined', nextResponseDeadline: deadline ? new Date(`${deadline}:00+03:00`).toISOString() : null }))}>Decline and advance</Button><Button variant="danger" disabled={action.pending || !highRisk || !reason.trim() || !chosen} onClick={() => action.run(() => overrideCandidateChoiceAction({ cycleId, fallbackCaseId: fallback.id, selectionId: chosen, reason, highRiskConfirmed: true }))}>Override choice</Button></div> : null}</SidePanelFooter></SidePanelContent></SidePanel>;
}

export function RequirementWorkflowPanel({ cycleId, requirement, submissions, portal }: { cycleId: CycleId; requirement: PlacementRequirement; submissions: readonly RequirementSubmission[]; portal: Portal }) {
  const [open, setOpen] = useState(false); const [fileName, setFileName] = useState(`${requirement.title.toLowerCase().replaceAll(' ', '-')}.pdf`); const [reason, setReason] = useState(''); const action = usePanelAction();
  const mayUpload = requirement.owner === portal && ['awaiting_upload', 'correction_requested', 'rejected'].includes(requirement.status);
  return <SidePanel open={open} onOpenChange={setOpen}><Button size="xs" variant="secondary" onClick={() => setOpen(true)}>Open</Button><SidePanelContent title={requirement.title} description={`${requirement.owner} owned · ${requirement.required ? 'required' : 'optional'} · ${requirement.status.replaceAll('_', ' ')}`} width="md"><SidePanelBody className="space-y-5">{submissions.length === 0 ? <p className="rounded-control bg-surface-sunken px-4 py-3 text-sm text-ink-3">No submission revisions yet.</p> : <ol className="space-y-2">{submissions.map((submission) => <li key={submission.id} className="rounded-control border border-hairline px-4 py-3"><div className="flex justify-between"><p className="text-sm font-semibold text-ink">Revision {submission.revision} · {submission.fileName}</p><time className="text-xs text-ink-3">{submission.submittedAt}</time></div>{submission.correctionReason ? <p className="mt-2 text-xs text-critical-text">Correction: {submission.correctionReason}</p> : null}{submission.extractedFields.length > 0 ? <div className="mt-3 space-y-1">{submission.extractedFields.map((field) => <p key={field.key} className="text-xs text-ink-2">{field.key}: extracted “{field.extracted ?? '—'}” · confirmed “{field.confirmed ?? '—'}”</p>)}</div> : null}</li>)}</ol>}{mayUpload ? <TextField label="Simulated private file" value={fileName} onChange={(event) => setFileName(event.target.value)} hint="Only metadata is stored in the fixture adapter." /> : null}{portal === 'qstp' && !['approved', 'waived'].includes(requirement.status) ? <TextAreaField label="Decision or correction reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} /> : null}<Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Close</Button></SidePanelClose><div className="flex flex-wrap gap-2">{mayUpload ? <Button variant="primary" disabled={action.pending || !fileName.trim()} onClick={() => action.run(() => submitRequirementAction({ cycleId, requirementId: requirement.id, fileName, extractedFields: [] }))}>Upload revision</Button> : null}{portal === 'qstp' && !['approved', 'waived'].includes(requirement.status) ? <><Button variant="primary" disabled={action.pending} onClick={() => action.run(() => decideRequirementAction({ cycleId, requirementId: requirement.id, decision: 'approved', reason: null }))}>Approve</Button><Button disabled={action.pending || !reason.trim()} onClick={() => action.run(() => decideRequirementAction({ cycleId, requirementId: requirement.id, decision: 'correction_requested', reason }))}>Request correction</Button><Button variant="danger" disabled={action.pending || !reason.trim()} onClick={() => action.run(() => decideRequirementAction({ cycleId, requirementId: requirement.id, decision: 'rejected', reason }))}>Reject</Button><Button disabled={action.pending || (requirement.required && !reason.trim())} onClick={() => action.run(() => decideRequirementAction({ cycleId, requirementId: requirement.id, decision: 'waived', reason: reason || null }))}>Waive</Button></> : null}</div></SidePanelFooter></SidePanelContent></SidePanel>;
}

export function PlacementWorkflowPanel({ cycleId, placement, signatures, portal }: { cycleId: CycleId; placement: Placement; signatures: readonly PlacementSignature[]; portal: Portal }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [signer, setSigner] = useState(''); const [openedAt, setOpenedAt] = useState<string | null>(null); const [accepted, setAccepted] = useState(false); const action = usePanelAction();
  const agreementKind = portal === 'qstp' ? 'qstp_agreement' : portal === 'startup' ? 'startup_agreement' : null;
  const signed = agreementKind ? signatures.some((row) => row.kind === agreementKind) : false;
  return <SidePanel open={open} onOpenChange={setOpen}><Button size="xs" variant="secondary" onClick={() => setOpen(true)}>Review placement</Button><SidePanelContent title="Placement review" description={`${placement.committedWeeklyHours} weekly hours · ${placement.startsOn} to ${placement.endsOn}`} width="lg"><SidePanelBody className="space-y-6"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-control border border-hairline p-4"><p className="text-xs text-ink-3">Supervisor</p><p className="mt-1 font-semibold text-ink">{placement.supervisorName}</p></div><div className="rounded-control border border-hairline p-4"><p className="text-xs text-ink-3">Lifecycle</p><p className="mt-1 font-semibold capitalize text-ink">{placement.status.replaceAll('_', ' ')}</p></div></div><div className="space-y-2">{[['Candidate ready', placement.candidateReadyAt], ['Startup ready', placement.startupReadyAt], ['Details final', placement.detailsFinalizedAt], ['QSTP approved', placement.qstpApprovedAt]].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-control bg-surface-sunken px-4 py-2.5"><span className="text-sm text-ink-2">{label}</span><Badge tone={value ? 'positive' : 'warning'}>{value ? 'Complete' : 'Pending'}</Badge></div>)}</div>{agreementKind && !signed && placement.status !== 'cancelled' ? <section className="space-y-3 border-t border-hairline pt-5"><div className="flex items-center gap-2"><Signature className="size-4 text-accent" /><p className="text-sm font-bold text-ink">Simulated agreement</p></div>{openedAt ? <div className="max-h-36 overflow-y-auto rounded-control border border-hairline bg-surface-sunken p-4 text-xs leading-5 text-ink-2">Fixture agreement for placement {placement.id}. The signer confirms the stated dates, weekly hours, supervision, and programme obligations. This is a workflow simulation and not a generated legal document.</div> : <Button onClick={() => setOpenedAt(new Date().toISOString())}>Open agreement</Button>}{openedAt ? <><TextField label="Signer name" value={signer} onChange={(event) => setSigner(event.target.value)} /><label className="flex items-start gap-3 text-sm text-ink-2"><input type="checkbox" className="mt-1" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I have opened the agreement and accept the declaration.</label></> : null}</section> : null}{placement.status !== 'cancelled' && portal === 'qstp' ? <TextAreaField label="Cancellation reason" value={reason} onChange={(event) => setReason(event.target.value)} hint="Only required if cancelling this placement." rows={3} /> : null}{placement.status === 'cancelled' ? <div className="rounded-control border border-critical/20 bg-critical-subtle px-4 py-3 text-sm text-critical-text">Cancelled {placement.cancelledAt}. Reason: {placement.cancellationReason}</div> : null}<Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Close</Button></SidePanelClose>{placement.status !== 'cancelled' ? <div className="flex flex-wrap gap-2">{agreementKind && !signed && openedAt ? <Button disabled={action.pending || !accepted || !signer.trim()} onClick={() => action.run(() => signPlacementAgreementAction({ cycleId, placementId: placement.id, kind: agreementKind, signerName: signer, declarationAccepted: true, documentOpenedAt: openedAt }))}>Sign agreement</Button> : null}{portal === 'candidate' && !placement.candidateReadyAt ? <Button variant="primary" onClick={() => action.run(() => setPlacementReadinessAction({ cycleId, placementId: placement.id, party: 'candidate' }))}>Confirm readiness</Button> : null}{portal === 'startup' && !placement.startupReadyAt ? <Button variant="primary" onClick={() => action.run(() => setPlacementReadinessAction({ cycleId, placementId: placement.id, party: 'startup' }))}>Confirm readiness</Button> : null}{portal === 'qstp' ? <><Button onClick={() => action.run(() => setPlacementReadinessAction({ cycleId, placementId: placement.id, party: 'details' }))}>Confirm final details</Button><Button onClick={() => action.run(() => setPlacementReadinessAction({ cycleId, placementId: placement.id, party: 'qstp' }))}>Final approval</Button><Button variant="primary" onClick={() => action.run(() => finalizePlacementAction({ cycleId, placementId: placement.id, action: placement.status === 'ready_to_start' ? 'onboard' : 'ready' }))}>{placement.status === 'ready_to_start' ? 'Mark onboarded' : 'Mark Ready to Start'}</Button><Button variant="danger" disabled={!reason.trim()} onClick={() => action.run(() => cancelPlacementAction({ cycleId, placementId: placement.id, reason }))}>Cancel placement</Button></> : null}</div> : null}</SidePanelFooter></SidePanelContent></SidePanel>;
}

export function RecoveryWorkflowPanel({ cycleId, recoveryCase }: { cycleId: CycleId; recoveryCase: RecoveryCase }) {
  const [open, setOpen] = useState(false); const [until, setUntil] = useState(''); const action = usePanelAction();
  return <SidePanel open={open} onOpenChange={setOpen}><Button size="xs" variant="secondary" onClick={() => setOpen(true)}>Review</Button><SidePanelContent title={`${recoveryCase.recoverableHours} recoverable hours`} description={`Startup ${recoveryCase.startupId} · ${recoveryCase.reason}`} width="md"><SidePanelBody className="space-y-5"><div className="rounded-control border border-hairline p-4"><div className="flex justify-between"><span className="text-sm text-ink-2">Current state</span><Badge tone={recoveryCase.status.includes('protected') ? 'info' : recoveryCase.status === 'potential' ? 'warning' : 'positive'}>{recoveryCase.status.replaceAll('_', ' ')}</Badge></div>{recoveryCase.protectedUntil ? <p className="mt-3 text-xs text-ink-3">Protected until {recoveryCase.protectedUntil}</p> : null}</div>{['potential', 'confirmed'].includes(recoveryCase.status) ? <TextField label="Replacement protection until" type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} hint="Protection prevents recovery until this deadline." /> : null}<Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Close</Button></SidePanelClose><div className="flex gap-2">{recoveryCase.status === 'potential' ? <Button variant="primary" onClick={() => action.run(() => import('@/server/actions').then(({ confirmRecoveryAction }) => confirmRecoveryAction({ cycleId, recoveryCaseId: recoveryCase.id })))}>Confirm recovery</Button> : null}{['potential', 'confirmed'].includes(recoveryCase.status) ? <Button disabled={!until || action.pending} onClick={() => action.run(() => protectRecoveryAction({ cycleId, recoveryCaseId: recoveryCase.id, until: new Date(`${until}:00+03:00`).toISOString() }))}>Protect for replacement</Button> : null}</div></SidePanelFooter></SidePanelContent></SidePanel>;
}

export function RoundWorkflowPanel({ cycleId, round, portal, startupIds }: { cycleId: CycleId; round: RedistributionRound; portal: Portal; startupIds: readonly string[] }) {
  const [open, setOpen] = useState(false); const [startupId, setStartupId] = useState(startupIds[0] ?? ''); const [hours, setHours] = useState('20'); const action = usePanelAction();
  const ownInvitation = portal === 'startup' ? round.invitations.find((row) => startupIds.includes(row.startupId)) : null;
  return <SidePanel open={open} onOpenChange={setOpen}><Button size="xs" variant="secondary" onClick={() => setOpen(true)}>Open round</Button><SidePanelContent title={`Redistribution round ${round.number}`} description={`${round.availableHours} recovered hours · ${round.status.replaceAll('_', ' ')}`} width="lg"><SidePanelBody className="space-y-5"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-control border border-hairline p-4"><p className="text-xs text-ink-3">Position deadline</p><p className="mt-1 text-sm font-semibold text-ink">{round.positionDeadline}</p></div><div className="rounded-control border border-hairline p-4"><p className="text-xs text-ink-3">Selection deadline</p><p className="mt-1 text-sm font-semibold text-ink">{round.selectionDeadline}</p></div></div><div className="space-y-2">{round.invitations.map((invite) => <div key={invite.startupId} className="flex items-center justify-between rounded-control bg-surface-sunken px-4 py-3"><div><p className="text-sm font-semibold text-ink">{invite.startupId}</p><p className="text-xs text-ink-3">{invite.proposedHours} hours</p></div><Badge tone={invite.status === 'accepted' ? 'positive' : invite.status === 'declined' || invite.status === 'expired' ? 'neutral' : 'warning'}>{invite.status}</Badge></div>)}</div>{portal === 'qstp' && !['closed', 'cancelled'].includes(round.status) ? <div className="grid gap-4 border-t border-hairline pt-5 sm:grid-cols-2"><SelectField label="Eligible startup" value={startupId} onChange={(event) => setStartupId(event.target.value)}>{startupIds.map((id) => <option key={id} value={id}>{id}</option>)}</SelectField><SelectField label="Proposed hours" value={hours} onChange={(event) => setHours(event.target.value)}>{[0, 20, 30, 40, 60].map((tier) => <option key={tier} value={tier}>{tier} hours</option>)}</SelectField></div> : null}<Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Close</Button></SidePanelClose><div className="flex gap-2">{portal === 'qstp' && !['closed', 'cancelled'].includes(round.status) ? <><Button disabled={!startupId || action.pending} onClick={() => action.run(() => inviteRedistributionAction({ cycleId, roundId: round.id, startupId, proposedHours: Number(hours) }))}>Send invitation</Button><Button variant="danger" onClick={() => action.run(() => closeRedistributionRoundAction({ cycleId, roundId: round.id }))}>Close round</Button></> : null}{portal === 'startup' && ownInvitation?.status === 'invited' ? <><Button variant="primary" onClick={() => action.run(() => respondRedistributionInvitationAction({ cycleId, roundId: round.id, response: 'accepted' }))}>Accept {ownInvitation.proposedHours} hours</Button><Button onClick={() => action.run(() => respondRedistributionInvitationAction({ cycleId, roundId: round.id, response: 'declined' }))}>Decline</Button></> : null}</div></SidePanelFooter></SidePanelContent></SidePanel>;
}

export function CreateRoundPanel({ cycleId, cases }: { cycleId: CycleId; cases: readonly RecoveryCase[] }) {
  const eligible = cases.filter((row) => row.status === 'confirmed'); const [open, setOpen] = useState(false); const [chosen, setChosen] = useState<string[]>([]); const [positionDeadline, setPositionDeadline] = useState(''); const [selectionDeadline, setSelectionDeadline] = useState(''); const action = usePanelAction(() => setOpen(false));
  return <SidePanel open={open} onOpenChange={setOpen}><Button variant="primary" disabled={eligible.length === 0} onClick={() => setOpen(true)}><RotateCcw />Create round</Button><SidePanelContent title="Create redistribution round" description="Combine confirmed recovery cases and set accelerated operating deadlines." width="md"><SidePanelBody className="space-y-5"><div className="space-y-2">{eligible.map((item) => <label key={item.id} className="flex items-center gap-3 rounded-control border border-hairline px-4 py-3"><input type="checkbox" checked={chosen.includes(item.id)} onChange={(event) => setChosen((previous) => event.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id))} /><span className="flex-1 text-sm text-ink">{item.startupId}</span><strong className="text-sm text-ink">{item.recoverableHours} h</strong></label>)}</div><div className="grid gap-4 sm:grid-cols-2"><TextField label="Accelerated position deadline" type="datetime-local" value={positionDeadline} onChange={(event) => setPositionDeadline(event.target.value)} /><TextField label="Accelerated selection deadline" type="datetime-local" value={selectionDeadline} onChange={(event) => setSelectionDeadline(event.target.value)} /></div><div className="rounded-control bg-surface-sunken px-4 py-3 text-sm text-ink-2">Selected total: <strong>{eligible.filter((row) => chosen.includes(row.id)).reduce((sum, row) => sum + row.recoverableHours, 0)} hours</strong></div><Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Cancel</Button></SidePanelClose><Button variant="primary" disabled={action.pending || chosen.length === 0 || !positionDeadline || !selectionDeadline} onClick={() => action.run(() => createRedistributionRoundAction({ cycleId, recoveryCaseIds: chosen, positionDeadline: new Date(`${positionDeadline}:00+03:00`).toISOString(), selectionDeadline: new Date(`${selectionDeadline}:00+03:00`).toISOString() }))}>Create round</Button></SidePanelFooter></SidePanelContent></SidePanel>;
}

export function ConfirmSelectionPanel({ cycle, selection, position }: { cycle: Cycle; selection: Selection; position: Position | undefined }) {
  const [open, setOpen] = useState(false); const [startsOn, setStartsOn] = useState(cycle.startsOn); const [endsOn, setEndsOn] = useState(cycle.endsOn); const [supervisor, setSupervisor] = useState(position?.supervisorName ?? ''); const action = usePanelAction(() => setOpen(false));
  return <SidePanel open={open} onOpenChange={setOpen}><Button size="xs" variant="primary" onClick={() => setOpen(true)}><UserRoundCheck />Confirm placement</Button><SidePanelContent title="Confirm placement" description="This atomic decision commits hours, occupies a seat, and creates the onboarding checklist." width="md"><SidePanelBody className="space-y-5"><div className="rounded-control border border-hairline bg-surface-sunken px-4 py-3 text-sm text-ink-2">Candidate {selection.candidateId}<br />Position {position?.title ?? selection.positionId}<br /><strong>{position?.hoursPerIntern ?? 0} committed weekly hours</strong></div><div className="grid gap-4 sm:grid-cols-2"><TextField label="Placement starts" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /><TextField label="Placement ends" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></div><TextField label="Final supervisor" value={supervisor} onChange={(event) => setSupervisor(event.target.value)} /><div className="flex items-start gap-3 rounded-control border border-warning/20 bg-warning-subtle px-4 py-3 text-xs leading-5 text-ink-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-text" />Confirmation marks the candidate placed for this cycle. Filling the final seat releases remaining open offers without deleting their history.</div><Feedback value={action.feedback} /></SidePanelBody><SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Cancel</Button></SidePanelClose><Button variant="primary" disabled={action.pending || !supervisor.trim() || startsOn >= endsOn} onClick={() => action.run(() => confirmPlacementAction({ cycleId: cycle.id, selectionId: selection.id, startsOn, endsOn, supervisorName: supervisor }))}><ClipboardCheck />Confirm placement</Button></SidePanelFooter></SidePanelContent></SidePanel>;
}
