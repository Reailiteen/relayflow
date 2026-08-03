"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  FileUp,
  History,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  Signature,
  UserRoundCheck,
} from "lucide-react";
import type {
  CandidateChoiceFallback,
  Candidate,
  Cycle,
  CycleId,
  DocumentRequirementTemplate,
  ExceptionRequest,
  Interview,
  Placement,
  PlacementRequirement,
  PoolEntry,
  Position,
  PrioritizationRun,
  RecoveryCase,
  RedistributionRound,
  RequirementSubmission,
  Selection,
  SelectionConflict,
  Startup,
  TaskAssignment,
  TaskTemplate,
} from "@relayflow/entities";
import { AGREEMENT_TITLES } from "@relayflow/entities";
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
} from "@relayflow/ui-web";
import {
  cancelPlacementAction,
  assignTaskAction,
  closeRedistributionRoundAction,
  expireRedistributionInvitationsAction,
  confirmPlacementAction,
  createRedistributionRoundAction,
  decideRequirementAction,
  decideCycleExceptionAction,
  finalizePlacementAction,
  inviteRedistributionAction,
  importCandidatesAction,
  openCandidateChoiceFallbackAction,
  overrideCandidateChoiceAction,
  protectRecoveryAction,
  requestCycleInterviewAction,
  requestCycleExceptionAction,
  resolveSelectionConflictAction,
  respondCandidateChoiceFallbackAction,
  respondRedistributionInvitationAction,
  reviewTaskAction,
  saveRequirementTemplateAction,
  savePositionAction,
  saveTaskTemplateAction,
  saveCycleInterviewFeedbackAction,
  setPlacementReadinessAction,
  sharePoolAction,
  submitRequirementAction,
  submitTaskAction,
  transitionPositionAction,
  transitionCycleInterviewAction,
  adjustPrioritizationAction,
  amendPlacementRequirementAction,
  updateRequirementTemplateAction,
  withdrawTaskAction,
  selectCandidateAction,
  respondToSelectionAction,
  confirmAvailabilityAction,
} from "@/server/actions";
import type { Portal } from "./cycle-workspace";
import { Feedback, usePanelAction } from "./panel-action";

export function CandidateAvailabilityPanel({
  cycleId,
  candidate,
}: {
  cycleId: CycleId;
  candidate: Candidate;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<
    "available" | "employed" | "not_interested" | "temporarily_unavailable"
  >(
    candidate.availability === "available"
      ? "available"
      : "temporarily_unavailable",
  );
  const [note, setNote] = useState("");
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Confirm availability
      </Button>
      <SidePanelContent
        title="Confirm your availability"
        description="This response applies to every startup pool in this cycle."
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <SelectField
            label="Current status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="available">Available for placement</option>
            <option value="temporarily_unavailable">
              Temporarily unavailable
            </option>
            <option value="employed">Already employed</option>
            <option value="not_interested">No longer interested</option>
          </SelectField>
          <TextAreaField
            label="Optional note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
          />
          <div className="rounded-control bg-surface-sunken px-4 py-3 text-xs leading-5 text-ink-2">
            Choosing an unavailable status removes you from active consideration
            across this cycle. Existing history is retained.
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={action.pending}
            onClick={() =>
              action.run(() =>
                confirmAvailabilityAction({
                  cycleId,
                  status,
                  note: note || null,
                }),
              )
            }
          >
            Save availability
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function AllocationReviewPanel({
  cycleId,
  run,
  startups,
}: {
  cycleId: CycleId;
  run: PrioritizationRun;
  startups: readonly Startup[];
}) {
  const [open, setOpen] = useState(false);
  // Only a scored startup has a tier to move. The rest are blocked on work
  // somebody has to do, and offering them a tier dropdown would suggest the
  // blocker can be adjusted away.
  const scored = run.outcomes.filter((row) => row.status === "scored");
  const blocked = run.outcomes.filter((row) => row.status !== "scored");
  const [startup, setStartup] = useState(scored[0]?.startupId ?? "");
  const outcome = scored.find((row) => row.startupId === startup);
  const [hours, setHours] = useState(String(outcome?.proposedHours ?? 0));
  const [reason, setReason] = useState("");
  const action = usePanelAction(() => setOpen(false));
  const nameOf = (id: string) =>
    startups.find((item) => item.id === id)?.name ?? id;
  const changeStartup = (id: string) => {
    setStartup(id);
    setHours(
      String(scored.find((row) => row.startupId === id)?.proposedHours ?? 0),
    );
  };
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Review draft v{run.version}
      </Button>
      <SidePanelContent
        title={`Prioritization draft v${run.version}`}
        description={`${run.proposedHours} of ${run.budgetHours} weekly hours proposed${
          run.residualHours > 0 ? `, ${run.residualHours}h unspent` : ""
        }.`}
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <div className="overflow-hidden rounded-control border border-hairline">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-sunken text-ink-3">
                <tr>
                  <th className="px-3 py-2">Rank</th>
                  <th>Startup</th>
                  <th>Score</th>
                  <th>Request</th>
                  <th>Proposal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {scored.map((row) => (
                  <tr key={row.startupId}>
                    <td className="px-3 py-2">{row.rank}</td>
                    <td className="font-medium text-ink">
                      {nameOf(row.startupId)}
                      {row.requiresTieResolution ? (
                        <span className="ml-2 text-ink-3">tied</span>
                      ) : null}
                    </td>
                    <td>{row.score}</td>
                    <td>{row.requestedHours}h</td>
                    <td>
                      {row.adjustedHours ?? row.proposedHours}h
                      {row.proposedHours !== null &&
                      row.maximumHours !== null &&
                      row.proposedHours < row.maximumHours ? (
                        <span className="ml-1 text-ink-3">
                          (from {row.maximumHours}h)
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/*
            Blocked startups are shown, never silently dropped. Each of these is
            a different piece of work for a different person, and publishing
            without seeing them is how a startup falls out of a cycle unnoticed.
          */}
          {blocked.length > 0 ? (
            <div className="rounded-control border border-hairline px-4 py-3 text-xs leading-5">
              <p className="font-medium text-ink">
                {blocked.length} startup{blocked.length === 1 ? "" : "s"} will
                receive no allocation
              </p>
              <ul className="mt-2 space-y-1 text-ink-2">
                {blocked.map((row) => (
                  <li key={row.startupId}>
                    <span className="text-ink">{nameOf(row.startupId)}</span>
                    {" — "}
                    {row.status.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <SelectField
            label="Startup to adjust"
            value={startup}
            onChange={(event) => changeStartup(event.target.value)}
          >
            {scored.map((row) => (
              <option key={row.startupId} value={row.startupId}>
                {nameOf(row.startupId)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Adjusted fixed tier"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          >
            {[0, 20, 30, 40, 60].map((tier) => (
              <option key={tier} value={tier}>
                {tier} weekly hours
              </option>
            ))}
          </SelectField>
          <TextAreaField
            label="Adjustment reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            hint="Required for the immutable activity timeline."
          />
          <div className="rounded-control bg-surface-sunken px-4 py-3 text-xs leading-5 text-ink-2">
            An adjustment creates a new draft version. The current draft remains
            in history as superseded and the total must remain within budget.
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={action.pending || !startup || reason.trim().length < 10}
            onClick={() =>
              action.run(() =>
                adjustPrioritizationAction({
                  cycleId,
                  runId: run.id,
                  startupId: startup,
                  proposedHours: Number(hours),
                  reason,
                }),
              )
            }
          >
            Create adjusted draft
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function SelectCandidatePanel({
  position,
  candidate,
  mode,
}: {
  position: Position;
  candidate: Candidate;
  mode: Cycle["selectionMode"];
}) {
  const [open, setOpen] = useState(false);
  const action = usePanelAction(() => setOpen(false));
  const label =
    mode === "candidate_choice" ? "Send offer" : "Reserve candidate";
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="primary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <SidePanelContent
        title={label}
        description={`${candidate.fullName} · ${position.title}`}
      >
        <SidePanelBody className="space-y-5">
          <div className="rounded-control border border-hairline p-4 text-sm leading-6 text-ink-2">
            {mode === "candidate_choice"
              ? "This creates a non-blocking offer. The candidate may compare multiple offers before accepting one."
              : "This atomically reserves the candidate. If another startup has already reserved them, a conflict case is created for QSTP."}
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={action.pending}
            onClick={() =>
              action.run(() =>
                selectCandidateAction({
                  cycleId: position.cycleId,
                  positionId: position.id,
                  candidateId: candidate.id,
                }),
              )
            }
          >
            Confirm {mode === "candidate_choice" ? "offer" : "reservation"}
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function CandidateSelectionResponsePanel({
  cycleId,
  selection,
  position,
}: {
  cycleId: CycleId;
  selection: Selection;
  position?: Position | undefined;
}) {
  const [open, setOpen] = useState(false);
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="primary" onClick={() => setOpen(true)}>
        Respond
      </Button>
      <SidePanelContent
        title={
          selection.status === "offered"
            ? "Respond to offer"
            : "Respond to reservation"
        }
        description={position?.title ?? "Placement opportunity"}
      >
        <SidePanelBody className="space-y-5">
          <p className="text-sm leading-6 text-ink-2">
            Accepting commits this opportunity for QSTP confirmation. In
            candidate-choice mode, accepting one offer atomically declines your
            other open offers.
          </p>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          <Button
            variant="danger"
            disabled={action.pending}
            onClick={() =>
              action.run(() =>
                respondToSelectionAction({
                  cycleId,
                  selectionId: selection.id,
                  decision: "declined",
                }),
              )
            }
          >
            Decline
          </Button>
          <Button
            variant="primary"
            disabled={action.pending}
            onClick={() =>
              action.run(() =>
                respondToSelectionAction({
                  cycleId,
                  selectionId: selection.id,
                  decision: "accepted",
                }),
              )
            }
          >
            Accept
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function OpenFallbackPanel({
  cycleId,
  candidates,
}: {
  cycleId: CycleId;
  candidates: readonly Candidate[];
}) {
  const [open, setOpen] = useState(false);
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");
  const defaultDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const [deadline, setDeadline] = useState(defaultDeadline);
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button disabled={candidates.length === 0} onClick={() => setOpen(true)}>
        Open fallback case
      </Button>
      <SidePanelContent title="Open candidate-choice fallback" description="Start an ordered fallback response after the offer window closes." width="md">
        <SidePanelBody className="space-y-5">
          <SelectField label="Candidate" value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
            {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.fullName}</option>)}
          </SelectField>
          <TextField label="First response deadline" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} hint="Defaults to 48 hours; QSTP can choose another deadline." />
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter><SidePanelClose asChild><Button variant="ghost">Cancel</Button></SidePanelClose><Button variant="primary" disabled={action.pending || !candidateId || !deadline} onClick={() => action.run(() => openCandidateChoiceFallbackAction({ cycleId, candidateId, responseDeadline: new Date(`${deadline}:00+03:00`).toISOString() }))}>Open fallback</Button></SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function CandidateImportPanel({ cycleId }: { cycleId: CycleId }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const action = usePanelAction();
  const rows = csv
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [fullName = "", email = "", ...skills] = line
        .split(",")
        .map((cell) => cell.trim());
      return {
        fullName,
        email,
        skills: skills.filter(Boolean),
        cvUrl: null,
        githubUrl: null,
      };
    })
    .filter((row) => row.fullName && row.email);
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <FileUp />
        Import candidates
      </Button>
      <SidePanelContent
        title="Import candidate pool"
        description="Preview a fixture-backed CSV batch and report duplicates within this cycle."
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <TextAreaField
            label="CSV rows"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={9}
            placeholder={
              "Nada Al-Emadi, nada@example.com, Python, NLP\nTariq Bin Saeed, tariq@example.com, React"
            }
            hint="Name, email, then any number of skills."
          />
          <div className="rounded-control border border-hairline bg-surface-sunken px-4 py-3 text-sm text-ink-2">
            <strong>{rows.length}</strong> usable row
            {rows.length === 1 ? "" : "s"} ready to import. Duplicate email
            reporting comes from the cycle-scoped adapter.
          </div>
          {rows.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-control border border-hairline">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface-sunken text-ink-3">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th>Email</th>
                    <th>Skills</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rows.map((row) => (
                    <tr key={row.email}>
                      <td className="px-3 py-2 font-medium text-ink">
                        {row.fullName}
                      </td>
                      <td>{row.email}</td>
                      <td>{row.skills.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={action.pending || rows.length === 0}
            onClick={() =>
              action.run(() =>
                importCandidatesAction({ cycleId, source: "csv", rows }),
              )
            }
          >
            {action.pending ? "Importing…" : `Import ${rows.length} candidates`}
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function PoolAssignmentPanel({
  cycleId,
  candidates,
  positions,
  poolEntries,
}: {
  cycleId: CycleId;
  candidates: readonly Candidate[];
  positions: readonly Position[];
  poolEntries: readonly { entry: PoolEntry; candidate: Candidate }[];
}) {
  const [open, setOpen] = useState(false);
  const [positionId, setPositionId] = useState(positions[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const action = usePanelAction();
  const already = new Set(
    poolEntries
      .filter((row) => row.entry.positionId === positionId)
      .map((row) => row.candidate.id),
  );
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button
        variant="primary"
        disabled={positions.length === 0}
        onClick={() => setOpen(true)}
      >
        <Plus />
        Assign pool
      </Button>
      <SidePanelContent
        title="Assign candidate pool"
        description="Share selected candidates with one approved or locked position."
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <SelectField
            label="Position"
            value={positionId}
            onChange={(event) => {
              setPositionId(event.target.value);
              setSelected([]);
            }}
          >
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title} · {position.status}
              </option>
            ))}
          </SelectField>
          <div className="max-h-[55vh] overflow-y-auto rounded-control border border-hairline">
            <ul className="divide-y divide-hairline">
              {candidates.map((candidate) => {
                const disabled =
                  already.has(candidate.id) ||
                  !["available", "unconfirmed"].includes(
                    candidate.availability,
                  );
                return (
                  <li key={candidate.id}>
                    <label
                      className={`flex items-start gap-3 px-4 py-3 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-surface-hover"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={disabled}
                        checked={selected.includes(candidate.id)}
                        onChange={(event) =>
                          setSelected((previous) =>
                            event.target.checked
                              ? [...previous, candidate.id]
                              : previous.filter((id) => id !== candidate.id),
                          )
                        }
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-ink">
                          {candidate.fullName}
                        </span>
                        <span className="mt-1 block text-xs text-ink-3">
                          {candidate.skills.join(", ") || "No skills"} ·{" "}
                          {already.has(candidate.id)
                            ? "already shared"
                            : candidate.availability}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <p className="text-xs text-ink-3">{selected.length} selected</p>
          <div className="flex gap-2">
            <SidePanelClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SidePanelClose>
            <Button
              variant="primary"
              disabled={action.pending || !positionId || selected.length === 0}
              onClick={() =>
                action.run(() =>
                  sharePoolAction({
                    cycleId,
                    positionId,
                    candidateIds: selected,
                  }),
                )
              }
            >
              Share candidate pool
            </Button>
          </div>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function TaskAssignmentPanel({
  cycleId,
  positions,
  poolEntries,
  templates,
}: {
  cycleId: CycleId;
  positions: readonly Position[];
  poolEntries: readonly { entry: PoolEntry; candidate: Candidate }[];
  templates: readonly TaskTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [positionId, setPositionId] = useState(positions[0]?.id ?? "");
  const candidates = poolEntries.filter(
    (row) => row.entry.positionId === positionId,
  );
  const [candidateId, setCandidateId] = useState("");
  const [templateId, setTemplateId] = useState("new");
  const positionTemplates = templates.filter((row) => row.positionId === positionId);
  const [title, setTitle] = useState("Take-home task");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const assign = () =>
    startTransition(async () => {
      setFeedback(null);
      const template =
        templateId === "new"
          ? await saveTaskTemplateAction({ cycleId, positionId, title, instructions })
          : { ok: true as const, data: { id: templateId } };
      if (!template.ok) { setFeedback({ text: template.message, error: true }); return; }
      const result = await assignTaskAction({
        cycleId,
        positionId,
        candidateId,
        templateId: template.data.id,
        dueAt: new Date(`${dueAt}:00+03:00`).toISOString(),
      });
      setFeedback({
        text: result.ok ? "Task assigned." : result.message,
        error: !result.ok,
      });
      if (result.ok) setOpen(false);
    });
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button disabled={positions.length === 0} onClick={() => setOpen(true)}>
        <ClipboardCheck />
        Assign task
      </Button>
      <SidePanelContent
        title="Assign candidate task"
        description="Create a reusable position task template and assign it to one candidate process."
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <SelectField
            label="Position"
            value={positionId}
            onChange={(event) => {
              setPositionId(event.target.value);
              setCandidateId("");
              setTemplateId("new");
            }}
          >
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title}
              </option>
            ))}
          </SelectField>
          <SelectField label="Task template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="new">Create a new reusable template</option>
            {positionTemplates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
          </SelectField>
          <SelectField
            label="Candidate"
            value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
          >
            <option value="">Choose a candidate</option>
            {candidates.map((row) => (
              <option key={row.candidate.id} value={row.candidate.id}>
                {row.candidate.fullName}
              </option>
            ))}
          </SelectField>
          {templateId === "new" ? (
            <>
              <TextField label="Template title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <TextAreaField label="Instructions" required value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={7} />
            </>
          ) : null}
          <TextField
            label="Submission deadline"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
          <Feedback value={feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={
              pending ||
              !positionId ||
              !candidateId ||
              (templateId === "new" && (!title.trim() || !instructions.trim())) ||
              !dueAt
            }
            onClick={assign}
          >
            {pending ? "Assigning…" : templateId === "new" ? "Create template and assign" : "Assign from template"}
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function RequestInterviewPanel({
  cycleId,
  position,
  candidate,
}: {
  cycleId: CycleId;
  position: Position;
  candidate: Candidate;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"online" | "in_person">("online");
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" onClick={() => setOpen(true)}>
        Request interview
      </Button>
      <SidePanelContent
        title="Request interview"
        description={`Invite ${candidate.fullName} to interview for ${position.title}.`}
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <SelectField
            label="Interview mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as typeof mode)}
          >
            <option value="online">Online</option>
            <option value="in_person">In person</option>
          </SelectField>
          <div className="rounded-control bg-surface-sunken px-4 py-3 text-xs leading-5 text-ink-2">
            The candidate must confirm before the startup schedules a time. A
            second interview is created as a new request, preserving the first
            interview.
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={action.pending}
            onClick={() =>
              action.run(() =>
                requestCycleInterviewAction({
                  cycleId,
                  positionId: position.id,
                  candidateId: candidate.id,
                  mode,
                }),
              )
            }
          >
            Send request
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function InterviewWorkflowPanel({
  cycleId,
  interview,
  portal,
  readOnly = false,
}: {
  cycleId: CycleId;
  interview: Interview;
  portal: Portal;
  readOnly?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(
    interview.scheduledFor
      ? new Date(interview.scheduledFor).toISOString().slice(0, 16)
      : "",
  );
  const [duration, setDuration] = useState(
    String(interview.durationMinutes ?? 45),
  );
  const [location, setLocation] = useState(interview.location ?? "");
  const [feedback, setFeedback] = useState(interview.feedback ?? "");
  const [recommendation, setRecommendation] = useState<
    NonNullable<Interview["recommendation"]>
  >(interview.recommendation ?? "undecided");
  const action = usePanelAction();
  const schedule = (kind: "schedule" | "reschedule") =>
    action.run(() =>
      transitionCycleInterviewAction({
        cycleId,
        interviewId: interview.id,
        action: kind,
        scheduledFor: scheduledFor
          ? new Date(`${scheduledFor}:00+03:00`).toISOString()
          : null,
        durationMinutes: Number(duration),
        location: location.trim() || null,
      }),
    );
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Open interview
      </Button>
      <SidePanelContent
        title="Interview process"
        description={`${interview.mode.replaceAll("_", " ")} · ${interview.status.replaceAll("_", " ")}`}
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Candidate</p>
              <p className="mt-1 font-semibold text-ink">
                {interview.candidateId}
              </p>
            </div>
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Scheduled</p>
              <p className="mt-1 font-semibold text-ink">
                {interview.scheduledFor ?? "Awaiting confirmation"}
              </p>
            </div>
          </div>
          {!readOnly &&
          portal === "startup" &&
          ["confirmed", "scheduled"].includes(interview.status) ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={
                  interview.status === "scheduled"
                    ? "Reschedule for"
                    : "Schedule for"
                }
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
              <TextField
                label="Duration in minutes"
                type="number"
                min="15"
                max="240"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
              <TextField
                className="sm:col-span-2"
                label={
                  interview.mode === "online" ? "Meeting link" : "Location"
                }
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
          ) : null}
          {/*
            Assessment material, and deliberately not the candidate's to read —
            same reasoning as the interviewer's feedback below. Gated here rather
            than filtered in the read model because a startup and QSTP both need
            it on this same screen; the candidate simply is not shown it.
          */}
          {interview.aiSummary && portal !== "candidate" ? (
            <div className="rounded-control border border-blue/20 bg-blue-tint px-4 py-3">
              <p className="text-xs font-semibold text-ink">AI draft summary</p>
              <p className="mt-2 text-sm leading-6 text-ink-2">
                {interview.aiSummary}
              </p>
            </div>
          ) : null}
          {portal === "startup" &&
          ["scheduled", "completed"].includes(interview.status) ? (
            <div className="space-y-4 border-t border-hairline pt-5">
              <TextAreaField
                label="Accountable interview feedback"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={5}
              />
              <SelectField
                label="Recommendation"
                value={recommendation}
                onChange={(event) =>
                  setRecommendation(event.target.value as typeof recommendation)
                }
              >
                <option value="advance">Advance</option>
                <option value="undecided">Undecided</option>
                <option value="reject">Reject</option>
              </SelectField>
            </div>
          ) : interview.feedback && portal !== "candidate" ? (
            <div>
              <p className="text-xs font-semibold text-ink-3">
                Accountable feedback
              </p>
              <p className="mt-2 text-sm text-ink-2">{interview.feedback}</p>
            </div>
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              {portal === "candidate" && interview.status === "requested" ? (
                <>
                  <Button
                    variant="primary"
                    onClick={() =>
                      action.run(() =>
                        transitionCycleInterviewAction({
                          cycleId,
                          interviewId: interview.id,
                          action: "confirm",
                          scheduledFor: null,
                          durationMinutes: null,
                          location: null,
                        }),
                      )
                    }
                  >
                    Confirm interview
                  </Button>
                  <Button
                    onClick={() =>
                      action.run(() =>
                        transitionCycleInterviewAction({
                          cycleId,
                          interviewId: interview.id,
                          action: "decline",
                          scheduledFor: null,
                          durationMinutes: null,
                          location: null,
                        }),
                      )
                    }
                  >
                    Decline
                  </Button>
                </>
              ) : null}
              {portal === "startup" && interview.status === "confirmed" ? (
                <Button
                  variant="primary"
                  disabled={!scheduledFor}
                  onClick={() => schedule("schedule")}
                >
                  Schedule
                </Button>
              ) : null}
              {portal === "startup" && interview.status === "scheduled" ? (
                <>
                  <Button
                    disabled={!scheduledFor}
                    onClick={() => schedule("reschedule")}
                  >
                    Reschedule
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      action.run(() =>
                        transitionCycleInterviewAction({
                          cycleId,
                          interviewId: interview.id,
                          action: "complete",
                          scheduledFor: null,
                          durationMinutes: null,
                          location: null,
                        }),
                      )
                    }
                  >
                    Mark complete
                  </Button>
                  <Button
                    onClick={() =>
                      action.run(() =>
                        transitionCycleInterviewAction({
                          cycleId,
                          interviewId: interview.id,
                          action: "no_show",
                          scheduledFor: null,
                          durationMinutes: null,
                          location: null,
                        }),
                      )
                    }
                  >
                    No-show
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      action.run(() =>
                        transitionCycleInterviewAction({
                          cycleId,
                          interviewId: interview.id,
                          action: "cancel",
                          scheduledFor: null,
                          durationMinutes: null,
                          location: null,
                        }),
                      )
                    }
                  >
                    Cancel
                  </Button>
                </>
              ) : null}
              {portal === "startup" &&
              ["scheduled", "completed"].includes(interview.status) ? (
                <Button
                  variant="primary"
                  disabled={!feedback.trim()}
                  onClick={() =>
                    action.run(() =>
                      saveCycleInterviewFeedbackAction({
                        cycleId,
                        interviewId: interview.id,
                        feedback,
                        recommendation,
                      }),
                    )
                  }
                >
                  Save feedback
                </Button>
              ) : null}
            </div>
          ) : null}
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function RequirementTemplatePanel({
  cycleId,
  positions,
  startupMode = false,
}: {
  cycleId: CycleId;
  positions: readonly Position[];
  startupMode?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<"candidate" | "startup" | "qstp">(
    startupMode ? "startup" : "candidate",
  );
  const [required, setRequired] = useState(true);
  const [positionId, setPositionId] = useState(
    startupMode ? (positions[0]?.id ?? "") : "",
  );
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add requirement
      </Button>
      <SidePanelContent
        title="Add document requirement"
        description={
          startupMode
            ? "Add a startup-owned requirement to a position before placement confirmation."
            : "Create a cycle policy template. New placements snapshot it at confirmation."
        }
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <TextField
            label="Requirement title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {!startupMode ? (
            <SelectField
              label="Owner"
              value={owner}
              onChange={(event) => setOwner(event.target.value as typeof owner)}
            >
              <option value="candidate">Candidate</option>
              <option value="startup">Startup</option>
              <option value="qstp">QSTP</option>
            </SelectField>
          ) : null}
          <SelectField
            label="Scope"
            value={positionId}
            onChange={(event) => setPositionId(event.target.value)}
          >
            <option value="">All placements in this cycle</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title}
              </option>
            ))}
          </SelectField>
          <label className="flex items-center gap-3 rounded-control border border-hairline px-4 py-3 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
            />
            Required for Ready to Start
          </label>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={
              action.pending || !title.trim() || (startupMode && !positionId)
            }
            onClick={() =>
              action.run(() =>
                saveRequirementTemplateAction({
                  cycleId,
                  title,
                  owner,
                  required,
                  positionId: positionId || null,
                  active: true,
                }),
              )
            }
          >
            Add requirement
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function RequirementTemplateEditPanel({
  cycleId,
  template,
}: {
  cycleId: CycleId;
  template: DocumentRequirementTemplate;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(template.title);
  const [owner, setOwner] = useState(template.owner);
  const [required, setRequired] = useState(template.required);
  const [active, setActive] = useState(template.active);
  const [reason, setReason] = useState("");
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Edit policy
      </Button>
      <SidePanelContent
        title="Edit requirement policy"
        description="Changes apply to newly confirmed placements only. Existing snapshots remain unchanged."
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <TextField label="Requirement title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <SelectField label="Owner" value={owner} onChange={(event) => setOwner(event.target.value as typeof owner)}>
            <option value="candidate">Candidate</option><option value="startup">Startup</option><option value="qstp">QSTP</option>
          </SelectField>
          <label className="flex items-center gap-3 rounded-control border border-hairline px-4 py-3 text-sm text-ink-2"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />Required for Ready to Start</label>
          <label className="flex items-center gap-3 rounded-control border border-hairline px-4 py-3 text-sm text-ink-2"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Active for new placements</label>
          <TextAreaField label="Change reason" required value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild><Button variant="ghost">Cancel</Button></SidePanelClose>
          <Button variant="primary" disabled={action.pending || !title.trim() || reason.trim().length < 10} onClick={() => action.run(() => updateRequirementTemplateAction({ cycleId, templateId: template.id, title, owner, required, active, reason }))}>Save policy revision</Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function RequirementAmendmentPanel({
  cycleId,
  placements,
}: {
  cycleId: CycleId;
  placements: readonly Placement[];
}) {
  const [open, setOpen] = useState(false);
  const [placementId, setPlacementId] = useState(placements[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<"candidate" | "startup" | "qstp">(
    "candidate",
  );
  const [required, setRequired] = useState(true);
  const [reason, setReason] = useState("");
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button disabled={placements.length === 0} onClick={() => setOpen(true)}>
        <Plus />
        Amend checklist
      </Button>
      <SidePanelContent
        title="Amend placement checklist"
        description="Add a requirement to one existing placement without changing the policy snapshot for others."
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <SelectField
            label="Placement"
            value={placementId}
            onChange={(event) => setPlacementId(event.target.value)}
          >
            {placements
              .filter((row) => row.status !== "cancelled")
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.committedWeeklyHours}h · {row.startsOn} ·{" "}
                  {row.supervisorName}
                </option>
              ))}
          </SelectField>
          <TextField
            label="Requirement title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <SelectField
            label="Owner"
            value={owner}
            onChange={(event) => setOwner(event.target.value as typeof owner)}
          >
            <option value="candidate">Candidate</option>
            <option value="startup">Startup</option>
            <option value="qstp">QSTP</option>
          </SelectField>
          <label className="flex items-center gap-3 rounded-control border border-hairline px-4 py-3 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
            />
            Required for Ready to Start
          </label>
          <TextAreaField
            label="Amendment reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            hint="Recorded permanently on the placement timeline."
          />
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={
              action.pending ||
              !placementId ||
              !title.trim() ||
              reason.trim().length < 10
            }
            onClick={() =>
              action.run(() =>
                amendPlacementRequirementAction({
                  cycleId,
                  placementId,
                  title,
                  owner,
                  required,
                  reason,
                }),
              )
            }
          >
            Add to checklist
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function ExceptionWorkflowPanel({
  cycle,
  request,
  portal,
}: {
  cycle: Cycle;
  request?: ExceptionRequest | undefined;
  portal: Portal;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExceptionRequest["kind"]>(
    request?.kind ?? "position_submission",
  );
  const current =
    kind === "position_submission"
      ? cycle.deadlines.positionSubmission
      : cycle.deadlines.candidateSelection;
  const [deadline, setDeadline] = useState(
    request
      ? new Date(request.requestedDeadline).toISOString().slice(0, 16)
      : "",
  );
  const [reason, setReason] = useState(request?.reason ?? "");
  const [note, setNote] = useState(request?.decisionNote ?? "");
  const action = usePanelAction();
  const decide = (decision: "approved" | "rejected") =>
    action.run(() =>
      decideCycleExceptionAction({
        cycleId: cycle.id,
        exceptionId: request?.id,
        decision,
        grantedDeadline:
          decision === "approved" && deadline
            ? new Date(`${deadline}:00+03:00`).toISOString()
            : null,
        decisionNote: note.trim() || null,
      }),
    );
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button
        size="xs"
        variant={
          request?.status === "pending" && portal === "qstp"
            ? "primary"
            : "secondary"
        }
        onClick={() => setOpen(true)}
      >
        {request
          ? request.status === "pending" && portal === "qstp"
            ? "Decide request"
            : "View request"
          : "Request extension"}
      </Button>
      <SidePanelContent
        title={request ? "Deadline exception" : "Request deadline extension"}
        description="Approved extensions change the effective deadline and protect affected hours."
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <SelectField
            label="Deadline"
            disabled={Boolean(request)}
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="position_submission">Position submission</option>
            <option value="candidate_selection">Candidate selection</option>
          </SelectField>
          <div className="rounded-control bg-surface-sunken px-4 py-3 text-xs text-ink-2">
            Current cycle deadline: {current}
          </div>
          <TextField
            label={
              portal === "qstp" ? "Granted deadline" : "Requested deadline"
            }
            type="datetime-local"
            disabled={Boolean(request) && portal !== "qstp"}
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
          <TextAreaField
            label="Reason"
            disabled={Boolean(request)}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={5}
          />
          {request && portal === "qstp" && request.status === "pending" ? (
            <TextAreaField
              label="Decision note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
            />
          ) : null}
          {request ? (
            <div className="flex items-center justify-between rounded-control border border-hairline px-4 py-3">
              <span className="text-sm text-ink-2">Request status</span>
              <Badge
                tone={
                  request.status === "approved"
                    ? "positive"
                    : request.status === "rejected"
                      ? "critical"
                      : "warning"
                }
              >
                {request.status}
              </Badge>
            </div>
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          {!request && portal === "startup" ? (
            <Button
              variant="primary"
              disabled={
                action.pending || !deadline || reason.trim().length < 10
              }
              onClick={() =>
                action.run(() =>
                  requestCycleExceptionAction({
                    cycleId: cycle.id,
                    kind,
                    reason,
                    requestedDeadline: new Date(
                      `${deadline}:00+03:00`,
                    ).toISOString(),
                  }),
                )
              }
            >
              Submit request
            </Button>
          ) : null}
          {request && portal === "qstp" && request.status === "pending" ? (
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={action.pending}
                onClick={() => decide("rejected")}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                disabled={action.pending || !deadline}
                onClick={() => decide("approved")}
              >
                Approve extension
              </Button>
            </div>
          ) : null}
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function CreatePositionPanel({
  cycle,
  allocatedHours,
  usedHours,
  rounds,
  position,
}: {
  cycle: Cycle;
  allocatedHours: number;
  usedHours: number;
  rounds: readonly RedistributionRound[];
  position?: Position | undefined;
}) {
  const [open, setOpen] = useState(false);
  const action = usePanelAction(() => setOpen(false));
  const [title, setTitle] = useState(position?.title ?? "");
  const [description, setDescription] = useState(position?.description ?? "");
  const [skills, setSkills] = useState(
    position?.requiredSkills.join(", ") ?? "",
  );
  const [arrangement, setArrangement] = useState<
    "onsite" | "hybrid" | "remote"
  >(position?.workArrangement ?? "hybrid");
  const [requirements, setRequirements] = useState(
    position?.additionalRequirements ?? "",
  );
  const [interns, setInterns] = useState(String(position?.internCount ?? 1));
  const [hours, setHours] = useState(String(position?.hoursPerIntern ?? 20));
  const [weeks, setWeeks] = useState(String(position?.durationWeeks ?? 12));
  const [supervisor, setSupervisor] = useState(position?.supervisorName ?? "");
  const acceptedRounds = rounds.filter((round) =>
    round.invitations.some((row) => row.status === "accepted"),
  );
  const [roundId, setRoundId] = useState(position?.redistributionRoundId ?? "");
  const requested = Number(interns) * Number(hours);
  const remaining = Math.max(0, allocatedHours - usedHours);
  const over = requested > remaining;

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button
        variant={position ? "ghost" : "primary"}
        size={position ? "xs" : "sm"}
        onClick={() => setOpen(true)}
      >
        {position ? <Pencil /> : <Plus />}
        {position ? "Edit details" : "New position"}
      </Button>
      <SidePanelContent
        title={position ? "Edit position" : "Create position"}
        description="Define the role, seats, weekly-hour commitment, and day-to-day supervision."
        width="lg"
      >
        <SidePanelBody className="space-y-6">
          <div className="grid grid-cols-3 gap-3 rounded-control border border-hairline bg-surface-sunken px-4 py-3 text-center">
            <div>
              <p className="text-[11px] text-ink-3">Allocated</p>
              <p className="mt-1 font-bold text-ink">{allocatedHours} h</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-3">Reserved</p>
              <p className="mt-1 font-bold text-ink">{usedHours} h</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-3">This role</p>
              <p
                className={`mt-1 font-bold ${over ? "text-critical-text" : "text-accent"}`}
              >
                {requested} h
              </p>
            </div>
          </div>
          <TextField
            label="Role title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextAreaField
            label="Role description"
            required
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <TextField
            label="Required skills"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            hint="Comma separated."
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Seats"
              type="number"
              min="1"
              max="20"
              value={interns}
              onChange={(event) => setInterns(event.target.value)}
            />
            <TextField
              label="Hours per seat"
              type="number"
              min="1"
              max="60"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
            <TextField
              label="Duration in weeks"
              type="number"
              min="1"
              max="52"
              value={weeks}
              onChange={(event) => setWeeks(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Work arrangement"
              value={arrangement}
              onChange={(event) =>
                setArrangement(event.target.value as typeof arrangement)
              }
            >
              <option value="onsite">On site</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
            </SelectField>
            <TextField
              label="Supervisor"
              value={supervisor}
              onChange={(event) => setSupervisor(event.target.value)}
            />
          </div>
          <TextAreaField
            label="Additional requirements"
            rows={3}
            value={requirements}
            onChange={(event) => setRequirements(event.target.value)}
          />
          {acceptedRounds.length > 0 ? (
            <SelectField
              label="Submission context"
              value={roundId}
              onChange={(event) => setRoundId(event.target.value)}
            >
              <option value="">Initial allocation</option>
              {acceptedRounds.map((round) => (
                <option key={round.id} value={round.id}>
                  Redistribution round {round.number} · due{" "}
                  {round.positionDeadline}
                </option>
              ))}
            </SelectField>
          ) : null}
          {over ? (
            <div className="rounded-control border border-critical/20 bg-critical-subtle px-4 py-3 text-sm text-critical-text">
              This position needs {requested} hours, but only {remaining}{" "}
              remain.
            </div>
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <p className="text-xs text-ink-3">
            Drafts do not reserve hours. Submission reserves {requested} weekly
            hours.
          </p>
          <div className="flex flex-wrap gap-2">
            <SidePanelClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SidePanelClose>
            <Button
              disabled={action.pending || !title.trim() || !description.trim()}
              onClick={() =>
                action.run(() =>
                  savePositionAction({
                    cycleId: cycle.id,
                    positionId: position?.id ?? null,
                    redistributionRoundId: roundId || null,
                    action: "draft",
                    title,
                    description,
                    requiredSkills: skills
                      .split(",")
                      .map((row) => row.trim())
                      .filter(Boolean),
                    workArrangement: arrangement,
                    additionalRequirements: requirements.trim() || null,
                    internCount: Number(interns),
                    hoursPerIntern: Number(hours),
                    durationWeeks: Number(weeks),
                    supervisorName: supervisor.trim() || null,
                  }),
                )
              }
            >
              Save draft
            </Button>
            <Button
              variant="primary"
              disabled={
                action.pending || over || !title.trim() || !description.trim()
              }
              onClick={() =>
                action.run(() =>
                  savePositionAction({
                    cycleId: cycle.id,
                    positionId: position?.id ?? null,
                    redistributionRoundId: roundId || null,
                    action: "submit",
                    title,
                    description,
                    requiredSkills: skills
                      .split(",")
                      .map((row) => row.trim())
                      .filter(Boolean),
                    workArrangement: arrangement,
                    additionalRequirements: requirements.trim() || null,
                    internCount: Number(interns),
                    hoursPerIntern: Number(hours),
                    durationWeeks: Number(weeks),
                    supervisorName: supervisor.trim() || null,
                  }),
                )
              }
            >
              {action.pending
                ? "Submitting…"
                : position?.status === "changes_requested"
                  ? "Resubmit corrections"
                  : "Submit for review"}
            </Button>
          </div>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function PositionWorkflowPanel({
  cycleId,
  position,
  portal,
  readOnly = false,
}: {
  cycleId: CycleId;
  position: Position;
  portal: Portal;
  readOnly?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const action = usePanelAction();
  const qstpTransitions: Partial<
    Record<Position["status"], Position["status"][]>
  > = {
    submitted: ["under_review"],
    resubmitted: ["under_review"],
    under_review: ["changes_requested", "approved", "closed"],
    approved: ["locked", "changes_requested", "closed"],
    locked: ["approved", "filled", "closed"],
  };
  const startupTransitions: Partial<
    Record<Position["status"], Position["status"][]>
  > = {
    changes_requested: ["withdrawn"],
    draft: ["withdrawn"],
    submitted: ["withdrawn"],
  };
  const transitions = readOnly
    ? []
    : portal === "qstp"
      ? (qstpTransitions[position.status] ?? [])
      : portal === "startup"
        ? (startupTransitions[position.status] ?? [])
        : [];
  const requiresReason = (to: Position["status"]) =>
    to === "changes_requested" ||
    (position.status === "locked" && to === "approved");
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        View
      </Button>
      <SidePanelContent
        title={position.title}
        description={`${position.internCount} seat${position.internCount === 1 ? "" : "s"} · ${position.hoursPerIntern} weekly hours each · ${position.workArrangement}`}
        width="lg"
      >
        <SidePanelBody className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge
              tone={
                ["approved", "locked", "filled"].includes(position.status)
                  ? "positive"
                  : position.status === "changes_requested"
                    ? "critical"
                    : "warning"
              }
            >
              {position.status.replaceAll("_", " ")}
            </Badge>
            {position.redistributionRoundId ? (
              <Badge tone="info">Accelerated round</Badge>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
              Role
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-2">
              {position.description}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Required skills</p>
              <p className="mt-2 text-sm text-ink">
                {position.requiredSkills.join(", ") || "None specified"}
              </p>
            </div>
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Supervisor</p>
              <p className="mt-2 text-sm text-ink">
                {position.supervisorName ?? "Not assigned"}
              </p>
            </div>
          </div>
          {position.additionalRequirements ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                Additional requirements
              </p>
              <p className="mt-2 text-sm text-ink-2">
                {position.additionalRequirements}
              </p>
            </div>
          ) : null}
          <section className="border-t border-hairline pt-5">
            <div className="mb-3 flex items-center gap-2">
              <History className="size-4 text-ink-3" />
              <p className="text-sm font-bold text-ink">Review history</p>
            </div>
            {position.reviewHistory.length === 0 ? (
              <p className="text-sm text-ink-3">No review decisions yet.</p>
            ) : (
              <ol className="space-y-2">
                {position.reviewHistory.map((row, index) => (
                  <li
                    key={`${row.occurredAt}-${index}`}
                    className="rounded-control bg-surface-sunken px-3 py-2"
                  >
                    <div className="flex justify-between gap-3">
                      <span className="text-xs font-semibold capitalize text-ink">
                        {row.status.replaceAll("_", " ")}
                      </span>
                      <time className="text-[11px] text-ink-3">
                        {row.occurredAt}
                      </time>
                    </div>
                    {row.note ? (
                      <p className="mt-1 text-xs text-ink-2">{row.note}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
          {transitions.some(requiresReason) ? (
            <TextAreaField
              label="Decision reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              hint="Required when requesting changes or reopening a locked position."
            />
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <p className="text-xs text-ink-3">
            All transitions are validated and retained.
          </p>
          <div className="flex flex-wrap gap-2">
            <SidePanelClose asChild>
              <Button variant="ghost">Close</Button>
            </SidePanelClose>
            {transitions.map((to) => (
              <Button
                key={to}
                variant={
                  to === "approved" ||
                  to === "locked" ||
                  to === "submitted" ||
                  to === "resubmitted"
                    ? "primary"
                    : to === "closed" || to === "withdrawn"
                      ? "danger"
                      : "secondary"
                }
                disabled={
                  action.pending || (requiresReason(to) && !reason.trim())
                }
                onClick={() =>
                  action.run(() =>
                    transitionPositionAction({
                      cycleId,
                      positionId: position.id,
                      to,
                      reason: requiresReason(to) ? reason : null,
                    }),
                  )
                }
              >
                {to.replaceAll("_", " ")}
              </Button>
            ))}
          </div>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function TaskWorkflowPanel({
  cycleId,
  task,
  portal,
  readOnly = false,
}: {
  cycleId: CycleId;
  task: TaskAssignment;
  portal: Portal;
  readOnly?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("task-submission.pdf");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const action = usePanelAction();
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Open task
      </Button>
      <SidePanelContent
        title="Candidate task"
        description={`Due ${task.dueAt} · current status ${task.status}`}
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <div className="rounded-control border border-hairline p-4">
            <p className="text-xs text-ink-3">Candidate</p>
            <p className="mt-1 font-semibold text-ink">{task.candidateId}</p>
          </div>
          {task.fileName ? (
            <div className="rounded-control bg-surface-sunken px-4 py-3 text-sm text-ink">
              <FileUp className="mr-2 inline size-4" />
              {task.fileName}
              {task.lateAccepted ? (
                <Badge className="ml-2" tone="warning">
                  Late accepted
                </Badge>
              ) : null}
            </div>
          ) : null}
          {!readOnly && portal === "candidate" && task.status === "assigned" ? (
            <>
              <TextField
                label="Simulated file name"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
              />
              <TextField
                label="Submission link"
                type="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                hint="Provide a file name, a link, or both."
              />
            </>
          ) : null}
          {!readOnly &&
          portal !== "candidate" &&
          task.status === "submitted" ? (
            <TextAreaField
              label="Accountable review notes"
              required
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
            />
          ) : null}
          {task.reviewNotes ? (
            <div>
              <p className="text-xs font-semibold text-ink-3">Review notes</p>
              <p className="mt-2 text-sm text-ink-2">{task.reviewNotes}</p>
            </div>
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          {!readOnly && portal === "candidate" && task.status === "assigned" ? (
            <Button
              variant="primary"
              disabled={action.pending || (!fileName.trim() && !link.trim())}
              onClick={() =>
                action.run(() =>
                  submitTaskAction({
                    cycleId,
                    assignmentId: task.id,
                    fileName: fileName.trim() || null,
                    linkUrl: link.trim() || null,
                  }),
                )
              }
            >
              Submit task
            </Button>
          ) : null}
          {!readOnly &&
          portal !== "candidate" &&
          ["assigned", "submitted"].includes(task.status) ? (
            <Button
              variant="danger"
              disabled={action.pending}
              onClick={() =>
                action.run(() =>
                  withdrawTaskAction({ cycleId, assignmentId: task.id }),
                )
              }
            >
              Withdraw task
            </Button>
          ) : null}
          {!readOnly &&
          portal !== "candidate" &&
          task.status === "submitted" ? (
            <Button
              variant="primary"
              disabled={action.pending || !notes.trim()}
              onClick={() =>
                action.run(() =>
                  reviewTaskAction({ cycleId, assignmentId: task.id, notes }),
                )
              }
            >
              Complete review
            </Button>
          ) : null}
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function ConflictWorkflowPanel({
  cycleId,
  conflict,
  readOnly = false,
}: {
  cycleId: CycleId;
  conflict: SelectionConflict;
  readOnly?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const action = usePanelAction();
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button
        size="xs"
        variant={
          conflict.status === "open" && !readOnly ? "danger" : "secondary"
        }
        onClick={() => setOpen(true)}
      >
        {conflict.status === "open" && !readOnly
          ? "Resolve conflict"
          : "View decision"}
      </Button>
      <SidePanelContent
        title="Selection conflict"
        description="Review the blocking claim and attempted startup before making an atomic decision."
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Current startup</p>
              <p className="mt-1 font-semibold text-ink">
                {conflict.previousStartupId}
              </p>
            </div>
            <div className="rounded-control border border-critical/20 bg-critical-subtle p-4">
              <p className="text-xs text-critical-text">Attempting startup</p>
              <p className="mt-1 font-semibold text-critical-text">
                {conflict.requestedStartupId}
              </p>
            </div>
          </div>
          <div className="rounded-control bg-surface-sunken px-4 py-3 text-xs text-ink-2">
            Candidate {conflict.candidateId} · blocking selection{" "}
            {conflict.blockingSelectionId}
          </div>
          {conflict.status === "open" && !readOnly ? (
            <TextAreaField
              label="Decision reason"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              hint="Recorded with the previous and requested startup impact."
              rows={5}
            />
          ) : (
            <p className="text-sm text-ink-2">
              {conflict.reason ?? "Awaiting an authorized operator decision."}
            </p>
          )}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          {conflict.status === "open" && !readOnly ? (
            <div className="flex gap-2">
              <Button
                disabled={action.pending || !reason.trim()}
                onClick={() =>
                  action.run(() =>
                    resolveSelectionConflictAction({
                      cycleId,
                      conflictId: conflict.id,
                      decision: "dismissed",
                      reason,
                    }),
                  )
                }
              >
                Dismiss attempt
              </Button>
              <Button
                variant="danger"
                disabled={action.pending || !reason.trim()}
                onClick={() =>
                  action.run(() =>
                    resolveSelectionConflictAction({
                      cycleId,
                      conflictId: conflict.id,
                      decision: "overridden",
                      reason,
                    }),
                  )
                }
              >
                Override claim
              </Button>
            </div>
          ) : null}
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function FallbackWorkflowPanel({
  cycleId,
  fallback,
  selections,
}: {
  cycleId: CycleId;
  fallback: CandidateChoiceFallback;
  selections: readonly Selection[];
}) {
  const [open, setOpen] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [chosen, setChosen] = useState(
    fallback.orderedOfferIds[fallback.currentOfferIndex] ?? "",
  );
  const [highRisk, setHighRisk] = useState(false);
  const action = usePanelAction();
  const offers = selections.filter((row) =>
    fallback.orderedOfferIds.includes(row.id),
  );
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Manage fallback
      </Button>
      <SidePanelContent
        title="Candidate-choice fallback"
        description={`Offer ${fallback.currentOfferIndex + 1} of ${fallback.orderedOfferIds.length} · response due ${fallback.responseDeadline}`}
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <ol className="space-y-2">
            {offers.map((offer, index) => (
              <li
                key={offer.id}
                className="flex items-center justify-between rounded-control border border-hairline px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Offer {index + 1} · startup {offer.startupId}
                  </p>
                  <p className="text-xs text-ink-3">{offer.status}</p>
                </div>
                {index === fallback.currentOfferIndex ? (
                  <Badge tone="warning">Current</Badge>
                ) : null}
              </li>
            ))}
          </ol>
          {fallback.status === "open" ? (
            <>
              <TextField
                label="Next response deadline"
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                hint="Optional. A declined offer defaults to another 48 hours."
              />
              <div className="border-t border-hairline pt-5">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldAlert className="size-4 text-critical-text" />
                  <p className="text-sm font-bold text-ink">
                    Manager-only override
                  </p>
                </div>
                <SelectField
                  label="Force selected offer"
                  value={chosen}
                  onChange={(event) => setChosen(event.target.value)}
                >
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.startupId} · {offer.status}
                    </option>
                  ))}
                </SelectField>
                <TextAreaField
                  label="Override reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                />
                <label className="flex items-start gap-3 rounded-control border border-critical/20 bg-critical-subtle px-4 py-3 text-sm text-critical-text">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={highRisk}
                    onChange={(event) => setHighRisk(event.target.checked)}
                  />
                  I understand this replaces the candidate-choice outcome and
                  affects sibling offers.
                </label>
              </div>
            </>
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          {fallback.status === "open" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={action.pending}
                onClick={() =>
                  action.run(() =>
                    respondCandidateChoiceFallbackAction({
                      cycleId,
                      fallbackCaseId: fallback.id,
                      response: "accepted",
                      nextResponseDeadline: null,
                    }),
                  )
                }
              >
                Accept current offer
              </Button>
              <Button
                disabled={action.pending}
                onClick={() =>
                  action.run(() =>
                    respondCandidateChoiceFallbackAction({
                      cycleId,
                      fallbackCaseId: fallback.id,
                      response: "declined",
                      nextResponseDeadline: deadline
                        ? new Date(`${deadline}:00+03:00`).toISOString()
                        : null,
                    }),
                  )
                }
              >
                Decline and advance
              </Button>
              <Button
                variant="danger"
                disabled={
                  action.pending || !highRisk || !reason.trim() || !chosen
                }
                onClick={() =>
                  action.run(() =>
                    overrideCandidateChoiceAction({
                      cycleId,
                      fallbackCaseId: fallback.id,
                      selectionId: chosen,
                      reason,
                      highRiskConfirmed: true,
                    }),
                  )
                }
              >
                Override choice
              </Button>
            </div>
          ) : null}
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

/**
 * What "OCR" reads off an upload in the demo, keyed by requirement title.
 *
 * Simulated, and labelled as such on screen. It exists because the step it
 * drives is real: the candidate is the only person who can say whether the scan
 * read their IBAN correctly, and a single generic field could not express that.
 * The IBAN is deliberately the one that comes back wrong — a transposed digit
 * there sends a salary to a stranger, which is the whole reason a human
 * confirms before QSTP verifies.
 */
const SIMULATED_EXTRACTION: Record<string, readonly { key: string; label: string; extracted: string }[]> = {
  "national id": [
    { key: "id_number", label: "ID number", extracted: "28904177351" },
    { key: "full_name", label: "Full name", extracted: "LAYLA AHMED" },
    { key: "expiry", label: "Expiry date", extracted: "2029-06-30" },
  ],
  passport: [
    { key: "passport_number", label: "Passport number", extracted: "QA8842107" },
    { key: "full_name", label: "Full name", extracted: "LAYLA AHMED" },
    { key: "expiry", label: "Expiry date", extracted: "2031-02-14" },
  ],
  "bank statement": [
    { key: "iban", label: "IBAN", extracted: "QA58DOHB0000I234567890ABCDEFG" },
    { key: "account_holder", label: "Account holder", extracted: "LAYLA AHMED" },
    { key: "bank_name", label: "Bank", extracted: "Doha Bank" },
  ],
};

function extractionFor(title: string): readonly { key: string; label: string; extracted: string }[] {
  return SIMULATED_EXTRACTION[title.trim().toLowerCase()] ?? [];
}

export function RequirementWorkflowPanel({
  cycleId,
  requirement,
  submissions,
  portal,
  readOnly = false,
}: {
  cycleId: CycleId;
  requirement: PlacementRequirement;
  submissions: readonly RequirementSubmission[];
  portal: Portal;
  readOnly?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState(
    `${requirement.title.toLowerCase().replaceAll(" ", "-")}.pdf`,
  );
  const fields = extractionFor(requirement.title);
  // Pre-filled with what the scan read, so confirming an accurate read is one
  // click and only a correction costs typing. Blanking a field is a valid
  // answer — it means "the scan invented this".
  const [confirmed, setConfirmed] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.extracted])),
  );
  const [reason, setReason] = useState("");
  const action = usePanelAction();
  const mayUpload =
    !readOnly &&
    requirement.owner === portal &&
    ["awaiting_upload", "correction_requested", "rejected"].includes(
      requirement.status,
    );
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Open
      </Button>
      <SidePanelContent
        title={requirement.title}
        description={`${requirement.owner} owned · ${requirement.required ? "required" : "optional"} · ${requirement.status.replaceAll("_", " ")}`}
        width="md"
      >
        <SidePanelBody className="space-y-5">
          {submissions.length === 0 ? (
            <p className="rounded-control bg-surface-sunken px-4 py-3 text-sm text-ink-3">
              No submission revisions yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {submissions.map((submission) => (
                <li
                  key={submission.id}
                  className="rounded-control border border-hairline px-4 py-3"
                >
                  <div className="flex justify-between">
                    <p className="text-sm font-semibold text-ink">
                      Revision {submission.revision} · {submission.fileName}
                    </p>
                    <time className="text-xs text-ink-3">
                      {submission.submittedAt}
                    </time>
                  </div>
                  {submission.correctionReason ? (
                    <p className="mt-2 text-xs text-critical-text">
                      Correction: {submission.correctionReason}
                    </p>
                  ) : null}
                  {submission.extractedFields.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {submission.extractedFields.map((field) => {
                        // A corrected field is the one a verifier should look at
                        // twice, so it is called out rather than left for them to
                        // spot by comparing two quoted strings.
                        const corrected =
                          field.confirmed !== null &&
                          field.confirmed !== field.extracted;
                        return (
                          <p key={field.key} className="text-xs text-ink-2">
                            <span className="text-ink-3">{field.key}:</span>{" "}
                            {field.confirmed ?? "not confirmed"}
                            {corrected ? (
                              <span className="text-warning-text">
                                {" "}
                                · corrected from “{field.extracted ?? "—"}”
                              </span>
                            ) : null}
                          </p>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          {mayUpload ? (
            <div className="space-y-4">
              <TextField
                label="Simulated private file"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                hint="Only metadata is stored in the fixture adapter."
              />
              {portal === "candidate" && fields.length > 0 ? (
                <section className="space-y-3 rounded-control border border-hairline p-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Check what the scan read
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      Correct anything that is wrong before this goes to QSTP.
                      Only you and QSTP can read these values — the startup
                      cannot.
                    </p>
                  </div>
                  {fields.map((field) => {
                    const value = confirmed[field.key] ?? "";
                    const changed = value !== field.extracted;
                    return (
                      <div key={field.key} className="space-y-1">
                        <TextField
                          label={field.label}
                          value={value}
                          onChange={(event) =>
                            setConfirmed((previous) => ({
                              ...previous,
                              [field.key]: event.target.value,
                            }))
                          }
                        />
                        <p className="text-xs text-ink-3">
                          Scan read “{field.extracted}”
                          {changed ? " · you corrected this" : ""}
                        </p>
                      </div>
                    );
                  })}
                </section>
              ) : null}
            </div>
          ) : null}
          {!readOnly &&
          portal === "qstp" &&
          !["approved", "waived"].includes(requirement.status) ? (
            <TextAreaField
              label="Decision or correction reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
            />
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          <div className="flex flex-wrap gap-2">
            {mayUpload ? (
              <Button
                variant="primary"
                disabled={action.pending || !fileName.trim()}
                onClick={() =>
                  action.run(() =>
                    submitRequirementAction({
                      cycleId,
                      requirementId: requirement.id,
                      fileName,
                      // Both halves are kept: what the scan read and what the
                      // candidate said it should be. Merging them would destroy
                      // the only record of who corrected what.
                      extractedFields:
                        portal === "candidate"
                          ? fields.map((field) => ({
                              key: field.key,
                              extracted: field.extracted,
                              confirmed: confirmed[field.key]?.trim() || null,
                            }))
                          : [],
                    }),
                  )
                }
              >
                Upload revision
              </Button>
            ) : null}
            {!readOnly &&
            portal === "qstp" &&
            !["approved", "waived"].includes(requirement.status) ? (
              <>
                <Button
                  variant="primary"
                  disabled={action.pending}
                  onClick={() =>
                    action.run(() =>
                      decideRequirementAction({
                        cycleId,
                        requirementId: requirement.id,
                        decision: "approved",
                        reason: null,
                      }),
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  disabled={action.pending || !reason.trim()}
                  onClick={() =>
                    action.run(() =>
                      decideRequirementAction({
                        cycleId,
                        requirementId: requirement.id,
                        decision: "correction_requested",
                        reason,
                      }),
                    )
                  }
                >
                  Request correction
                </Button>
                <Button
                  variant="danger"
                  disabled={action.pending || !reason.trim()}
                  onClick={() =>
                    action.run(() =>
                      decideRequirementAction({
                        cycleId,
                        requirementId: requirement.id,
                        decision: "rejected",
                        reason,
                      }),
                    )
                  }
                >
                  Reject
                </Button>
                <Button
                  disabled={action.pending || !reason.trim()}
                  onClick={() =>
                    action.run(() =>
                      decideRequirementAction({
                        cycleId,
                        requirementId: requirement.id,
                        decision: "expired",
                        reason,
                      }),
                    )
                  }
                >
                  Mark expired
                </Button>
                <Button
                  disabled={
                    action.pending || (requirement.required && !reason.trim())
                  }
                  onClick={() =>
                    action.run(() =>
                      decideRequirementAction({
                        cycleId,
                        requirementId: requirement.id,
                        decision: "waived",
                        reason: reason || null,
                      }),
                    )
                  }
                >
                  Waive
                </Button>
              </>
            ) : null}
          </div>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

/** Declared in signing order, which is also the order the parties expect. */
const AGREEMENT_LABELS = {
  qstp_agreement: "QSTP agreement",
  startup_agreement: "Startup agreement",
  candidate_agreement: "Candidate agreement",
} as const;

const AGREEMENT_PARTIES = (["qstp", "startup", "candidate"] as const).map(
  (owner) => ({
    owner,
    title: AGREEMENT_TITLES[owner],
    label: AGREEMENT_LABELS[`${owner}_agreement`],
  }),
);

export function PlacementWorkflowPanel({
  cycleId,
  placement,
  requirements,
  portal,
  readOnly = false,
  blockers = [],
}: {
  cycleId: CycleId;
  placement: Placement;
  requirements: readonly PlacementRequirement[];
  portal: Portal;
  readOnly?: boolean | undefined;
  blockers?: readonly string[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const action = usePanelAction();

  // Which agreement is this reader's to return. Agreements are ordinary
  // document requirements since 0017 — issued by QSTP, signed on paper,
  // uploaded back — so the panel points at the checklist rather than offering
  // a checkbox that would prove only that somebody clicked.
  const ownAgreement = readOnly
    ? null
    : portal === "qstp"
      ? AGREEMENT_TITLES.qstp
      : portal === "startup"
        ? AGREEMENT_TITLES.startup
        : AGREEMENT_TITLES.candidate;
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Review placement
      </Button>
      <SidePanelContent
        title="Placement review"
        description={`${placement.committedWeeklyHours} weekly hours · ${placement.startsOn} to ${placement.endsOn}`}
        width="lg"
      >
        <SidePanelBody className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Supervisor</p>
              <p className="mt-1 font-semibold text-ink">
                {placement.supervisorName}
              </p>
            </div>
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Lifecycle</p>
              <p className="mt-1 font-semibold capitalize text-ink">
                {placement.status.replaceAll("_", " ")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              ["Candidate ready", placement.candidateReadyAt],
              ["Startup ready", placement.startupReadyAt],
              ["Details final", placement.detailsFinalizedAt],
              ["QSTP approved", placement.qstpApprovedAt],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-control bg-surface-sunken px-4 py-2.5"
              >
                <span className="text-sm text-ink-2">{label}</span>
                <Badge tone={value ? "positive" : "warning"}>
                  {value ? "Complete" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
          {blockers.length > 0 && placement.status === "confirmed" ? (
            <section className="rounded-control border border-warning/25 bg-warning-subtle px-4 py-3">
              <p className="text-xs font-semibold text-ink">
                Ready to Start blockers
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-2">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {/*
            Who has signed, for all three parties rather than just the reader's
            own line. "Waiting on me" and "waiting on someone else" prompt
            completely different behaviour, and a bare count cannot tell them
            apart — least of all for the candidate, who is last in the chain and
            has no other way to see where the placement is stuck.
          */}
          <section className="space-y-2 border-t border-hairline pt-5">
            <div className="flex items-center gap-2">
              <Signature className="size-4 text-accent" />
              <p className="text-sm font-bold text-ink">Agreements</p>
            </div>
            <p className="text-xs text-ink-3">
              Each party downloads the agreement, signs it, and uploads the signed
              copy on their documents page. The returned file is the record.
            </p>
            {AGREEMENT_PARTIES.map(({ owner, title, label }) => {
              const row = requirements.find((item) => item.title === title);
              const settled =
                row !== undefined && ["approved", "waived"].includes(row.status);
              return (
                <div
                  key={owner}
                  className="flex items-center justify-between gap-3 rounded-control bg-surface-sunken px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink-2">{label}</p>
                    {!settled && title === ownAgreement ? (
                      <p className="text-xs text-ink-3">Yours to sign and return.</p>
                    ) : !settled && row ? (
                      <p className="truncate text-xs text-ink-3">
                        {row.status.replaceAll("_", " ")}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={settled ? "positive" : "warning"}>
                    {settled ? "Returned" : "Outstanding"}
                  </Badge>
                </div>
              );
            })}
          </section>
          {!readOnly &&
          placement.status !== "cancelled" &&
          portal === "qstp" ? (
            <TextAreaField
              label="Cancellation reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              hint="Only required if cancelling this placement."
              rows={3}
            />
          ) : null}
          {placement.status === "cancelled" ? (
            <div className="rounded-control border border-critical/20 bg-critical-subtle px-4 py-3 text-sm text-critical-text">
              Cancelled {placement.cancelledAt}. Reason:{" "}
              {placement.cancellationReason}
            </div>
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          {!readOnly && placement.status !== "cancelled" ? (
            <div className="flex flex-wrap gap-2">
              {portal === "candidate" && !placement.candidateReadyAt ? (
                <Button
                  variant="primary"
                  onClick={() =>
                    action.run(() =>
                      setPlacementReadinessAction({
                        cycleId,
                        placementId: placement.id,
                        party: "candidate",
                      }),
                    )
                  }
                >
                  Confirm readiness
                </Button>
              ) : null}
              {portal === "startup" && !placement.startupReadyAt ? (
                <Button
                  variant="primary"
                  onClick={() =>
                    action.run(() =>
                      setPlacementReadinessAction({
                        cycleId,
                        placementId: placement.id,
                        party: "startup",
                      }),
                    )
                  }
                >
                  Confirm readiness
                </Button>
              ) : null}
              {portal === "qstp" ? (
                <>
                  <Button
                    onClick={() =>
                      action.run(() =>
                        setPlacementReadinessAction({
                          cycleId,
                          placementId: placement.id,
                          party: "details",
                        }),
                      )
                    }
                  >
                    Confirm final details
                  </Button>
                  <Button
                    onClick={() =>
                      action.run(() =>
                        setPlacementReadinessAction({
                          cycleId,
                          placementId: placement.id,
                          party: "qstp",
                        }),
                      )
                    }
                  >
                    Final approval
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      action.run(() =>
                        finalizePlacementAction({
                          cycleId,
                          placementId: placement.id,
                          action:
                            placement.status === "ready_to_start"
                              ? "onboard"
                              : "ready",
                        }),
                      )
                    }
                  >
                    {placement.status === "ready_to_start"
                      ? "Mark onboarded"
                      : "Mark Ready to Start"}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={!reason.trim()}
                    onClick={() =>
                      action.run(() =>
                        cancelPlacementAction({
                          cycleId,
                          placementId: placement.id,
                          reason,
                        }),
                      )
                    }
                  >
                    Cancel placement
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function RecoveryWorkflowPanel({
  cycleId,
  recoveryCase,
}: {
  cycleId: CycleId;
  recoveryCase: RecoveryCase;
}) {
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState("");
  const action = usePanelAction();
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Review
      </Button>
      <SidePanelContent
        title={`${recoveryCase.recoverableHours} recoverable hours`}
        description={`Startup ${recoveryCase.startupId} · ${recoveryCase.reason}`}
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <div className="rounded-control border border-hairline p-4">
            <div className="flex justify-between">
              <span className="text-sm text-ink-2">Current state</span>
              <Badge
                tone={
                  recoveryCase.status.includes("protected")
                    ? "info"
                    : recoveryCase.status === "potential"
                      ? "warning"
                      : "positive"
                }
              >
                {recoveryCase.status.replaceAll("_", " ")}
              </Badge>
            </div>
            {recoveryCase.protectedUntil ? (
              <p className="mt-3 text-xs text-ink-3">
                Protected until {recoveryCase.protectedUntil}
              </p>
            ) : null}
          </div>
          {["potential", "confirmed"].includes(recoveryCase.status) ? (
            <TextField
              label="Replacement protection until"
              type="datetime-local"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              hint="Protection prevents recovery until this deadline."
            />
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          <div className="flex gap-2">
            {recoveryCase.status === "potential" ? (
              <Button
                variant="primary"
                onClick={() =>
                  action.run(() =>
                    import("@/server/actions").then(
                      ({ confirmRecoveryAction }) =>
                        confirmRecoveryAction({
                          cycleId,
                          recoveryCaseId: recoveryCase.id,
                        }),
                    ),
                  )
                }
              >
                Confirm recovery
              </Button>
            ) : null}
            {["potential", "confirmed"].includes(recoveryCase.status) ? (
              <Button
                disabled={!until || action.pending}
                onClick={() =>
                  action.run(() =>
                    protectRecoveryAction({
                      cycleId,
                      recoveryCaseId: recoveryCase.id,
                      until: new Date(`${until}:00+03:00`).toISOString(),
                    }),
                  )
                }
              >
                Protect for replacement
              </Button>
            ) : null}
          </div>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function RoundWorkflowPanel({
  cycleId,
  round,
  portal,
  startupIds,
}: {
  cycleId: CycleId;
  round: RedistributionRound;
  portal: Portal;
  startupIds: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [startupId, setStartupId] = useState(startupIds[0] ?? "");
  const [hours, setHours] = useState("20");
  const action = usePanelAction();
  const ownInvitation =
    portal === "startup"
      ? round.invitations.find((row) => startupIds.includes(row.startupId))
      : null;
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Open round
      </Button>
      <SidePanelContent
        title={`Redistribution round ${round.number}`}
        description={`${round.availableHours} recovered hours · ${round.status.replaceAll("_", " ")}`}
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Position deadline</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {round.positionDeadline}
              </p>
            </div>
            <div className="rounded-control border border-hairline p-4">
              <p className="text-xs text-ink-3">Selection deadline</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {round.selectionDeadline}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {round.invitations.map((invite) => (
              <div
                key={invite.startupId}
                className="flex items-center justify-between rounded-control bg-surface-sunken px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {invite.startupId}
                  </p>
                  <p className="text-xs text-ink-3">
                    {invite.proposedHours} hours
                  </p>
                </div>
                <Badge
                  tone={
                    invite.status === "accepted"
                      ? "positive"
                      : invite.status === "declined" ||
                          invite.status === "expired"
                        ? "neutral"
                        : "warning"
                  }
                >
                  {invite.status}
                </Badge>
              </div>
            ))}
          </div>
          {portal === "qstp" &&
          !["closed", "cancelled"].includes(round.status) ? (
            <div className="grid gap-4 border-t border-hairline pt-5 sm:grid-cols-2">
              <SelectField
                label="Eligible startup"
                value={startupId}
                onChange={(event) => setStartupId(event.target.value)}
              >
                {startupIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Proposed hours"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              >
                {[0, 20, 30, 40, 60].map((tier) => (
                  <option key={tier} value={tier}>
                    {tier} hours
                  </option>
                ))}
              </SelectField>
            </div>
          ) : null}
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          <div className="flex gap-2">
            {portal === "qstp" &&
            !["closed", "cancelled"].includes(round.status) ? (
              <>
                <Button
                  disabled={!startupId || action.pending}
                  onClick={() =>
                    action.run(() =>
                      inviteRedistributionAction({
                        cycleId,
                        roundId: round.id,
                        startupId,
                        proposedHours: Number(hours),
                      }),
                    )
                  }
                >
                  Send invitation
                </Button>
                <Button
                  disabled={
                    action.pending ||
                    !round.invitations.some((row) => row.status === "invited")
                  }
                  onClick={() =>
                    action.run(() =>
                      expireRedistributionInvitationsAction({
                        cycleId,
                        roundId: round.id,
                      }),
                    )
                  }
                >
                  Process invitation expiry
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    action.run(() =>
                      closeRedistributionRoundAction({
                        cycleId,
                        roundId: round.id,
                      }),
                    )
                  }
                >
                  Close round
                </Button>
              </>
            ) : null}
            {portal === "startup" && ownInvitation?.status === "invited" ? (
              <>
                <Button
                  variant="primary"
                  onClick={() =>
                    action.run(() =>
                      respondRedistributionInvitationAction({
                        cycleId,
                        roundId: round.id,
                        response: "accepted",
                      }),
                    )
                  }
                >
                  Accept {ownInvitation.proposedHours} hours
                </Button>
                <Button
                  onClick={() =>
                    action.run(() =>
                      respondRedistributionInvitationAction({
                        cycleId,
                        roundId: round.id,
                        response: "declined",
                      }),
                    )
                  }
                >
                  Decline
                </Button>
              </>
            ) : null}
          </div>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function CreateRoundPanel({
  cycleId,
  cases,
}: {
  cycleId: CycleId;
  cases: readonly RecoveryCase[];
}) {
  const eligible = cases.filter((row) => row.status === "confirmed");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [positionDeadline, setPositionDeadline] = useState("");
  const [selectionDeadline, setSelectionDeadline] = useState("");
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button
        variant="primary"
        disabled={eligible.length === 0}
        onClick={() => setOpen(true)}
      >
        <RotateCcw />
        Create round
      </Button>
      <SidePanelContent
        title="Create redistribution round"
        description="Combine confirmed recovery cases and set accelerated operating deadlines."
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <div className="space-y-2">
            {eligible.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-3 rounded-control border border-hairline px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(item.id)}
                  onChange={(event) =>
                    setChosen((previous) =>
                      event.target.checked
                        ? [...previous, item.id]
                        : previous.filter((id) => id !== item.id),
                    )
                  }
                />
                <span className="flex-1 text-sm text-ink">
                  {item.startupId}
                </span>
                <strong className="text-sm text-ink">
                  {item.recoverableHours} h
                </strong>
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Accelerated position deadline"
              type="datetime-local"
              value={positionDeadline}
              onChange={(event) => setPositionDeadline(event.target.value)}
            />
            <TextField
              label="Accelerated selection deadline"
              type="datetime-local"
              value={selectionDeadline}
              onChange={(event) => setSelectionDeadline(event.target.value)}
            />
          </div>
          <div className="rounded-control bg-surface-sunken px-4 py-3 text-sm text-ink-2">
            Selected total:{" "}
            <strong>
              {eligible
                .filter((row) => chosen.includes(row.id))
                .reduce((sum, row) => sum + row.recoverableHours, 0)}{" "}
              hours
            </strong>
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={
              action.pending ||
              chosen.length === 0 ||
              !positionDeadline ||
              !selectionDeadline
            }
            onClick={() =>
              action.run(() =>
                createRedistributionRoundAction({
                  cycleId,
                  recoveryCaseIds: chosen,
                  positionDeadline: new Date(
                    `${positionDeadline}:00+03:00`,
                  ).toISOString(),
                  selectionDeadline: new Date(
                    `${selectionDeadline}:00+03:00`,
                  ).toISOString(),
                }),
              )
            }
          >
            Create round
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function ConfirmSelectionPanel({
  cycle,
  selection,
  position,
}: {
  cycle: Cycle;
  selection: Selection;
  position: Position | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [startsOn, setStartsOn] = useState(cycle.startsOn);
  const [endsOn, setEndsOn] = useState(cycle.endsOn);
  const [supervisor, setSupervisor] = useState(position?.supervisorName ?? "");
  const action = usePanelAction(() => setOpen(false));
  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="primary" onClick={() => setOpen(true)}>
        <UserRoundCheck />
        Confirm placement
      </Button>
      <SidePanelContent
        title="Confirm placement"
        description="This atomic decision commits hours, occupies a seat, and creates the onboarding checklist."
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <div className="rounded-control border border-hairline bg-surface-sunken px-4 py-3 text-sm text-ink-2">
            Candidate {selection.candidateId}
            <br />
            Position {position?.title ?? selection.positionId}
            <br />
            <strong>
              {position?.hoursPerIntern ?? 0} committed weekly hours
            </strong>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Placement starts"
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
            <TextField
              label="Placement ends"
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </div>
          <TextField
            label="Final supervisor"
            value={supervisor}
            onChange={(event) => setSupervisor(event.target.value)}
          />
          <div className="flex items-start gap-3 rounded-control border border-warning/20 bg-warning-subtle px-4 py-3 text-xs leading-5 text-ink-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-text" />
            Confirmation marks the candidate placed for this cycle. Filling the
            final seat releases remaining open offers without deleting their
            history.
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={
              action.pending || !supervisor.trim() || startsOn >= endsOn
            }
            onClick={() =>
              action.run(() =>
                confirmPlacementAction({
                  cycleId: cycle.id,
                  selectionId: selection.id,
                  startsOn,
                  endsOn,
                  supervisorName: supervisor,
                }),
              )
            }
          >
            <ClipboardCheck />
            Confirm placement
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}
