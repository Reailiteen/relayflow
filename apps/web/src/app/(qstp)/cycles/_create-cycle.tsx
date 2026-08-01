'use client';

import { useMemo, useState, useTransition } from 'react';
import { Archive, CalendarDays, Copy, Pencil, Plus, Users, WalletCards } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Cycle } from '@relayflow/entities';
import {
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
import { archiveCycleAction, createCycleAction, updateCycleAction } from '@/server/actions';

type Intent = 'create' | 'edit' | 'clone';
type SelectionMode = Cycle['selectionMode'];

interface CycleDraft {
  name: string;
  fundedWeeklyHours: string;
  startsOn: string;
  endsOn: string;
  positionSubmission: string;
  offerWindow: string;
  candidateSelection: string;
  documentSubmission: string;
  selectionMode: SelectionMode;
  cloneParticipationFrom: string;
}

type Issue = { path: string; message: string };

const qatarLocal = (iso: string): string =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Qatar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace(' ', 'T');

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const atQatarTime = (date: string, hour = '17:00'): string => `${date}T${hour}`;
const toIso = (local: string): string => new Date(`${local}:00+03:00`).toISOString();

function newCycleDraft(cycles: readonly Cycle[]): CycleDraft {
  const latestEnd = [...cycles].sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0]?.endsOn;
  const startsOn = addDays(latestEnd ?? new Date().toISOString().slice(0, 10), latestEnd ? 30 : 90);
  const endsOn = addDays(startsOn, 170);
  return {
    name: `${new Date(`${startsOn}T12:00:00Z`).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })} Internship Cycle`,
    fundedWeeklyHours: '500',
    startsOn,
    endsOn,
    positionSubmission: atQatarTime(addDays(startsOn, 21)),
    offerWindow: atQatarTime(addDays(startsOn, 50)),
    candidateSelection: atQatarTime(addDays(startsOn, 60)),
    documentSubmission: atQatarTime(addDays(startsOn, 85)),
    selectionMode: 'first_come',
    cloneParticipationFrom: '',
  };
}

function draftFromCycle(cycle: Cycle, intent: Intent): CycleDraft {
  return {
    name: intent === 'clone' ? `${cycle.name} — copy` : cycle.name,
    fundedWeeklyHours: String(cycle.fundedWeeklyHours),
    startsOn: cycle.startsOn,
    endsOn: cycle.endsOn,
    positionSubmission: qatarLocal(cycle.deadlines.positionSubmission),
    offerWindow: cycle.deadlines.offerWindow ? qatarLocal(cycle.deadlines.offerWindow) : '',
    candidateSelection: qatarLocal(cycle.deadlines.candidateSelection),
    documentSubmission: qatarLocal(cycle.deadlines.documentSubmission),
    selectionMode: cycle.selectionMode,
    cloneParticipationFrom: intent === 'clone' ? cycle.id : '',
  };
}

function validateDraft(draft: CycleDraft): Issue[] {
  const issues: Issue[] = [];
  if (!draft.name.trim()) issues.push({ path: 'name', message: 'Give the cycle a name.' });
  const hours = Number(draft.fundedWeeklyHours);
  if (!Number.isInteger(hours) || hours < 1)
    issues.push({ path: 'fundedWeeklyHours', message: 'Enter at least one whole funded hour.' });
  if (!draft.startsOn) issues.push({ path: 'startsOn', message: 'Choose a cycle start date.' });
  if (!draft.endsOn || draft.endsOn <= draft.startsOn)
    issues.push({ path: 'endsOn', message: 'The cycle must end after it starts.' });
  if (!draft.positionSubmission)
    issues.push({ path: 'positionSubmission', message: 'Choose the position deadline.' });
  if (!draft.candidateSelection || draft.candidateSelection <= draft.positionSubmission) {
    issues.push({
      path: 'candidateSelection',
      message: 'Selection must close after position submission.',
    });
  }
  if (!draft.documentSubmission || draft.documentSubmission <= draft.candidateSelection) {
    issues.push({
      path: 'documentSubmission',
      message: 'Documents must be due after selection closes.',
    });
  }
  if (draft.selectionMode === 'candidate_choice') {
    if (!draft.offerWindow)
      issues.push({
        path: 'offerWindow',
        message: 'Candidate choice needs an offer-window deadline.',
      });
    else if (
      draft.offerWindow <= draft.positionSubmission ||
      draft.offerWindow >= draft.candidateSelection
    ) {
      issues.push({
        path: 'offerWindow',
        message: 'Offers must close after positions and before selection.',
      });
    }
  }
  return issues;
}

function issueFor(issues: readonly Issue[], field: string): string | undefined {
  return issues.find((issue) => issue.path === field || issue.path.endsWith(`.${field}`))?.message;
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-control border border-hairline bg-surface-sunken px-3 py-3">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

export function CycleFormPanel({
  cycles,
  cycle,
  intent = 'create',
}: {
  cycles: readonly Cycle[];
  cycle?: Cycle | undefined;
  intent?: Intent | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initial = useMemo(
    () => (cycle ? draftFromCycle(cycle, intent) : newCycleDraft(cycles)),
    [cycle, cycles, intent],
  );
  const [draft, setDraft] = useState<CycleDraft>(initial);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const source = cycles.find((row) => row.id === draft.cloneParticipationFrom);
  const title =
    intent === 'edit' ? 'Edit cycle' : intent === 'clone' ? 'Clone cycle' : 'Create cycle';
  const description =
    intent === 'edit'
      ? 'Update cycle dates, budget, selection mode, and operating deadlines.'
      : 'Set the operating envelope for allocation, selection, and onboarding.';

  const update = <K extends keyof CycleDraft>(key: K, value: CycleDraft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setIssues((previous) =>
      previous.filter((issue) => issue.path !== key && !issue.path.endsWith(`.${key}`)),
    );
    setError(null);
  };

  const requestOpenChange = (next: boolean) => {
    if (!next && dirty && !pending) {
      setConfirmClose(true);
      return;
    }
    setOpen(next);
    if (next) {
      setDraft(initial);
      setIssues([]);
      setError(null);
      setDirty(false);
      setConfirmClose(false);
    }
  };

  const submit = () => {
    const localIssues = validateDraft(draft);
    if (localIssues.length > 0) {
      setIssues(localIssues);
      setError('Review the highlighted fields before continuing.');
      return;
    }
    setError(null);
    setIssues([]);
    startTransition(async () => {
      const payload = {
        name: draft.name.trim(),
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
        fundedWeeklyHours: Number(draft.fundedWeeklyHours),
        selectionMode: draft.selectionMode,
        deadlines: {
          positionSubmission: toIso(draft.positionSubmission),
          candidateSelection: toIso(draft.candidateSelection),
          documentSubmission: toIso(draft.documentSubmission),
          offerWindow: draft.selectionMode === 'candidate_choice' ? toIso(draft.offerWindow) : null,
        },
      };
      const result =
        intent === 'edit' && cycle
          ? await updateCycleAction({ cycleId: cycle.id, cycle: payload })
          : await createCycleAction({
              cycle: payload,
              cloneParticipationFrom: draft.cloneParticipationFrom || null,
            });
      if (!result.ok) {
        setError(result.message);
        setIssues(result.issues ?? []);
        return;
      }
      setDirty(false);
      setOpen(false);
      if (intent === 'edit') router.refresh();
      else router.push(`/cycles/${result.data.id}/allocation`);
    });
  };

  return (
    <SidePanel open={open} onOpenChange={requestOpenChange}>
      <Button
        variant={intent === 'create' ? 'primary' : 'ghost'}
        size={intent === 'create' ? 'sm' : 'xs'}
        onClick={() => requestOpenChange(true)}
      >
        {intent === 'create' ? <Plus /> : intent === 'edit' ? <Pencil /> : <Copy />}
        {intent === 'create' ? 'Create cycle' : intent === 'edit' ? 'Edit' : 'Clone'}
      </Button>
      <SidePanelContent title={title} description={description} width="lg">
        <SidePanelBody className="space-y-7">
          <section className="space-y-4" aria-labelledby="cycle-basics">
            <div>
              <p id="cycle-basics" className="text-sm font-bold text-ink">
                Cycle basics
              </p>
              <p className="mt-1 text-xs text-ink-3">
                The budget is a hard ceiling across every allocation revision.
              </p>
            </div>
            <TextField
              label="Cycle name"
              required
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
              error={issueFor(issues, 'name')}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Starts"
                type="date"
                required
                value={draft.startsOn}
                onChange={(event) => update('startsOn', event.target.value)}
                error={issueFor(issues, 'startsOn')}
              />
              <TextField
                label="Ends"
                type="date"
                required
                value={draft.endsOn}
                onChange={(event) => update('endsOn', event.target.value)}
                error={issueFor(issues, 'endsOn')}
              />
              <TextField
                label="Funded weekly hours"
                type="number"
                min="1"
                step="1"
                required
                value={draft.fundedWeeklyHours}
                onChange={(event) => update('fundedWeeklyHours', event.target.value)}
                error={issueFor(issues, 'fundedWeeklyHours')}
              />
              <SelectField
                label="Selection mode"
                required
                value={draft.selectionMode}
                onChange={(event) => update('selectionMode', event.target.value as SelectionMode)}
              >
                <option value="first_come">First come — one reservation at a time</option>
                <option value="candidate_choice">Candidate choice — concurrent offers</option>
              </SelectField>
            </div>
          </section>

          <section
            className="space-y-4 border-t border-hairline pt-6"
            aria-labelledby="cycle-deadlines"
          >
            <div>
              <p id="cycle-deadlines" className="text-sm font-bold text-ink">
                Operating deadlines
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Times are entered and displayed in Qatar time (UTC+3).
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Position submission"
                type="datetime-local"
                required
                value={draft.positionSubmission}
                onChange={(event) => update('positionSubmission', event.target.value)}
                error={issueFor(issues, 'positionSubmission')}
              />
              {draft.selectionMode === 'candidate_choice' ? (
                <TextField
                  label="Offer window closes"
                  type="datetime-local"
                  required
                  value={draft.offerWindow}
                  onChange={(event) => update('offerWindow', event.target.value)}
                  error={issueFor(issues, 'offerWindow')}
                />
              ) : null}
              <TextField
                label="Candidate selection"
                type="datetime-local"
                required
                value={draft.candidateSelection}
                onChange={(event) => update('candidateSelection', event.target.value)}
                error={issueFor(issues, 'candidateSelection')}
              />
              <TextField
                label="Document submission"
                type="datetime-local"
                required
                value={draft.documentSubmission}
                onChange={(event) => update('documentSubmission', event.target.value)}
                error={issueFor(issues, 'documentSubmission')}
              />
            </div>
          </section>

          {intent !== 'edit' ? (
            <section
              className="space-y-4 border-t border-hairline pt-6"
              aria-labelledby="cycle-clone"
            >
              <div>
                <p id="cycle-clone" className="text-sm font-bold text-ink">
                  Participation context
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  Optionally carry forward the startup roster and contextual profile data.
                </p>
              </div>
              <SelectField
                label="Clone participants from"
                value={draft.cloneParticipationFrom}
                onChange={(event) => update('cloneParticipationFrom', event.target.value)}
              >
                <option value="">Start with an empty roster</option>
                {cycles
                  .filter((row) => row.archivedAt === null)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </SelectField>
              {source ? (
                <div className="rounded-control border border-blue/20 bg-blue-tint px-4 py-3 text-xs leading-5 text-ink-2">
                  <p className="font-semibold text-ink">Cloning from {source.name}</p>
                  <p className="mt-1">
                    Startup participation and contextual profile data will be copied. Scores,
                    allocations, positions, selections, placements, decisions, and prior activity
                    will not be copied.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-3" aria-label="Cycle summary">
            <SummaryItem
              icon={<CalendarDays className="size-4" />}
              label="Duration"
              value={
                draft.startsOn && draft.endsOn
                  ? `${draft.startsOn} → ${draft.endsOn}`
                  : 'Incomplete'
              }
            />
            <SummaryItem
              icon={<WalletCards className="size-4" />}
              label="Budget"
              value={`${draft.fundedWeeklyHours || '0'} weekly hours`}
            />
            <SummaryItem
              icon={<Users className="size-4" />}
              label="Selection"
              value={draft.selectionMode === 'first_come' ? 'First come' : 'Candidate choice'}
            />
          </section>

          {error ? (
            <div
              role="alert"
              className="rounded-control border border-critical/20 bg-critical-subtle px-4 py-3 text-sm text-critical-text"
            >
              <p className="font-semibold">Could not save the cycle</p>
              <p className="mt-1 text-xs">{error}</p>
            </div>
          ) : null}
        </SidePanelBody>

        <SidePanelFooter>
          <p className="text-xs text-ink-3">
            {dirty
              ? 'Unsaved changes'
              : intent === 'edit'
                ? 'No changes yet'
                : 'The new cycle starts in draft.'}
          </p>
          <div className="flex gap-2">
            <SidePanelClose asChild>
              <Button variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </SidePanelClose>
            <Button variant="primary" size="md" disabled={pending} onClick={submit}>
              {pending ? 'Saving…' : intent === 'edit' ? 'Save changes' : 'Create cycle'}
            </Button>
          </div>
        </SidePanelFooter>

        {confirmClose ? (
          <div
            className="absolute inset-x-0 bottom-0 z-10 border-t border-warning/30 bg-warning-subtle px-5 py-4 shadow-overlay sm:px-6"
            role="alert"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Discard unsaved changes?</p>
                <p className="mt-1 text-xs text-ink-3">Your cycle details have not been saved.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setConfirmClose(false)}>
                  Keep editing
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setDirty(false);
                    setConfirmClose(false);
                    setOpen(false);
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SidePanelContent>
    </SidePanel>
  );
}

export function CreateCycleForm({ cycles }: { cycles: readonly Cycle[] }) {
  return <CycleFormPanel cycles={cycles} />;
}

export function ArchiveCyclePanel({ cycle }: { cycle: Cycle }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <Archive />
        Archive
      </Button>
      <SidePanelContent
        title="Archive cycle"
        description="Remove this cycle from active workspaces while preserving its complete history."
        width="md"
      >
        <SidePanelBody className="space-y-5">
          <div className="rounded-control border border-critical/20 bg-critical-subtle px-4 py-4">
            <p className="font-semibold text-critical-text">{cycle.name}</p>
            <p className="mt-1 text-xs leading-5 text-critical-text">
              Archiving is intentionally separate from closing the programme lifecycle. Existing
              decisions and audit events remain available.
            </p>
          </div>
          <TextAreaField
            label="Reason for archiving"
            required
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            error={error ?? undefined}
            hint="Recorded permanently in the activity timeline."
            rows={5}
          />
        </SidePanelBody>
        <SidePanelFooter>
          <p className="text-xs text-ink-3">A reason is required.</p>
          <div className="flex gap-2">
            <SidePanelClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SidePanelClose>
            <Button
              variant="danger"
              disabled={pending || !reason.trim()}
              onClick={() =>
                startTransition(async () => {
                  const result = await archiveCycleAction({ cycleId: cycle.id, reason });
                  if (!result.ok) setError(result.message);
                  else {
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? 'Archiving…' : 'Archive cycle'}
            </Button>
          </div>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}
