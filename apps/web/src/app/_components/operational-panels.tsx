'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleAlert, Pencil, ShieldCheck } from 'lucide-react';
import type { CycleId, CycleParticipation, CycleStage, StageGateCheck } from '@relayflow/entities';
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
import { advanceCycleStageAction, saveParticipationAction } from '@/server/actions';

function ResultMessage({ message, error }: { message: string | null; error?: boolean | undefined }) {
  if (!message) return null;
  return <div role="status" className={`rounded-control border px-4 py-3 text-sm ${error ? 'border-critical/20 bg-critical-subtle text-critical-text' : 'border-positive/20 bg-positive-subtle text-positive-text'}`}>{message}</div>;
}

export function ParticipationPanel({
  cycleId,
  participation,
  startupName,
}: {
  cycleId: CycleId;
  participation: CycleParticipation;
  startupName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(participation.status);
  const [hours, setHours] = useState(String(participation.requestedTotalHours));
  const [interns, setInterns] = useState(String(participation.requestedInternCount));
  const [disciplines, setDisciplines] = useState(participation.disciplines.join(', '));
  const [score, setScore] = useState(participation.operatorScore === null ? '' : String(participation.operatorScore));
  const [internalNotes, setInternalNotes] = useState(participation.internalNotes ?? '');
  const [justification, setJustification] = useState(participation.startupJustification ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveParticipationAction({
        cycleId,
        startupId: participation.startupId,
        status,
        requestedTotalHours: Number(hours),
        requestedInternCount: Number(interns),
        disciplines: disciplines.split(',').map((value) => value.trim()).filter(Boolean),
        operatorScore: score.trim() ? Number(score) : null,
        internalNotes: internalNotes.trim() || null,
        startupJustification: justification.trim() || null,
      });
      setError(!result.ok);
      setMessage(result.ok ? 'Participation updated and recorded in activity.' : result.message);
      if (result.ok) setOpen(false);
    });
  };

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}><Pencil />Edit</Button>
      <SidePanelContent title={`Participation · ${startupName}`} description="Manage this startup's cycle request, operational score, and published explanation." width="lg">
        <SidePanelBody className="space-y-7">
          <section className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Participation status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="invited">Invited</option><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="suspended">Suspended</option><option value="archived">Archived</option>
            </SelectField>
            <TextField label="Operator score" type="number" min="0" max="100" value={score} onChange={(event) => setScore(event.target.value)} hint="Internal 0–100 score used by fixture prioritization." />
            <TextField label="Requested weekly hours" type="number" min="0" max="600" value={hours} onChange={(event) => setHours(event.target.value)} />
            <TextField label="Requested intern count" type="number" min="0" max="30" value={interns} onChange={(event) => setInterns(event.target.value)} />
          </section>
          <TextField label="Broad disciplines" value={disciplines} onChange={(event) => setDisciplines(event.target.value)} hint="Comma separated, for example software, data, product." />
          <div className="grid gap-5 border-t border-hairline pt-6 sm:grid-cols-2">
            <TextAreaField label="Internal rationale" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} hint="Visible to QSTP only. Never included in the startup decision." rows={7} />
            <TextAreaField label="Startup-facing justification" value={justification} onChange={(event) => setJustification(event.target.value)} hint="Published with the allocation tier. Do not include comparative scoring." rows={7} />
          </div>
          <ResultMessage message={message} error={error} />
        </SidePanelBody>
        <SidePanelFooter><p className="text-xs text-ink-3">Every change appends an activity event.</p><div className="flex gap-2"><SidePanelClose asChild><Button variant="ghost">Cancel</Button></SidePanelClose><Button variant="primary" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save participation'}</Button></div></SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export function GateReviewPanel({
  cycleId,
  stage,
  next,
  checks,
}: {
  cycleId: CycleId;
  stage: CycleStage;
  next: CycleStage | null;
  checks: readonly StageGateCheck[];
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!next) return null;
  const blockers = checks.filter((check) => !check.passed && check.severity === 'blocking');
  const warnings = checks.filter((check) => !check.passed && check.severity === 'warning');

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button variant="primary" onClick={() => setOpen(true)}>Review stage gate <ArrowRight /></Button>
      <SidePanelContent title={`Advance to ${next.replaceAll('_', ' ')}`} description={`Review the gate from ${stage.replaceAll('_', ' ')} before changing the cycle lifecycle.`} width="md">
        <SidePanelBody className="space-y-6">
          <div className="space-y-2">
            {checks.map((check) => <div key={check.key} className="flex items-start gap-3 rounded-control border border-hairline px-4 py-3"><span className={`mt-0.5 flex size-5 items-center justify-center rounded-full ${check.passed ? 'bg-positive-subtle text-positive-text' : check.severity === 'blocking' ? 'bg-critical-subtle text-critical-text' : 'bg-warning-subtle text-warning-text'}`}>{check.passed ? <Check className="size-3.5" /> : check.severity === 'blocking' ? <CircleAlert className="size-3.5" /> : <AlertTriangle className="size-3.5" />}</span><div className="flex-1"><p className="text-sm font-semibold text-ink">{check.label}</p><p className="mt-1 text-xs capitalize text-ink-3">{check.passed ? 'Passed' : check.severity}</p></div><Badge tone={check.passed ? 'positive' : check.severity === 'blocking' ? 'critical' : 'warning'}>{check.passed ? 'Ready' : 'Needs review'}</Badge></div>)}
          </div>
          {warnings.length > 0 && blockers.length === 0 ? <TextAreaField label="Warning override reason" required value={reason} onChange={(event) => setReason(event.target.value)} hint="Explain why advancing is safe. This reason is written to the immutable activity timeline." rows={5} /> : null}
          {blockers.length > 0 ? <div className="rounded-control border border-critical/20 bg-critical-subtle px-4 py-3 text-sm text-critical-text"><p className="font-semibold">This gate is blocked.</p><p className="mt-1 text-xs">Resolve {blockers.length} blocking check{blockers.length === 1 ? '' : 's'} before advancing.</p></div> : null}
          <ResultMessage message={message} error />
        </SidePanelBody>
        <SidePanelFooter><div className="flex items-center gap-2 text-xs text-ink-3"><ShieldCheck className="size-4" />Stage changes are permanent and audited.</div><div className="flex gap-2"><SidePanelClose asChild><Button variant="ghost">Cancel</Button></SidePanelClose><Button variant="primary" disabled={pending || blockers.length > 0 || (warnings.length > 0 && !reason.trim())} onClick={() => startTransition(async () => { const result = await advanceCycleStageAction({ cycleId, to: next, warningOverrideReason: warnings.length > 0 ? reason : null }); if (!result.ok) setMessage(result.message); else setOpen(false); })}>{pending ? 'Advancing…' : `Advance to ${next.replaceAll('_', ' ')}`}</Button></div></SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}
