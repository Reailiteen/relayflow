'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Panel, PanelHeader, TextAreaField, TextField, cn } from '@relayflow/ui-web';
import { submitPositionAction } from '@/server/actions';

/**
 * Submitting a role.
 *
 * The live hours calculation is the whole point of this form. A startup on 40
 * hours does not want to be told after submitting that two interns at 30 hours
 * does not fit — they want to watch the number go red as they type. The server
 * still enforces the rule; this just means they rarely meet it.
 */
export function NewPositionForm({
  allocatedHours,
  usedHours,
}: {
  allocatedHours: number;
  usedHours: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [internCount, setInternCount] = useState(1);
  const [hoursPerIntern, setHoursPerIntern] = useState(20);
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [supervisorName, setSupervisorName] = useState('');

  const remaining = allocatedHours - usedHours;
  const requested = internCount * hoursPerIntern;
  const overBudget = requested > remaining;

  const issueFor = (field: string) => issues.find((i) => i.path === field)?.message;

  const submit = () => {
    setError(null);
    setIssues([]);
    startTransition(async () => {
      const result = await submitPositionAction({
        title,
        description,
        requiredSkills: skills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        internCount,
        hoursPerIntern,
        durationWeeks,
        supervisorName: supervisorName.trim() || null,
      });

      if (result.ok) {
        router.push('/startup/positions');
        router.refresh();
      } else {
        setError(result.message);
        setIssues(result.issues ?? []);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <PanelHeader
          title="New position"
          aside={
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                overBudget ? 'text-critical' : 'text-text-muted',
              )}
            >
              {requested}h of {remaining}h remaining
            </span>
          }
        />

        <div className="flex flex-col gap-3 p-3">
          <TextField
            label="Role title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. AI Developer"
            {...(issueFor('title') ? { error: issueFor('title') } : {})}
          />

          <TextAreaField
            label="What will they work on?"
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A short description of the work and what the intern will learn."
            {...(issueFor('description') ? { error: issueFor('description') } : {})}
          />

          <TextField
            label="Required skills"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            placeholder="Python, PyTorch, Computer Vision"
            hint="Comma separated. Used to match candidates from the pool."
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField
              label="Interns"
              type="number"
              min={1}
              max={20}
              required
              value={internCount}
              onChange={(event) => setInternCount(Number(event.target.value) || 1)}
            />
            <TextField
              label="Hours each / week"
              type="number"
              min={1}
              max={60}
              required
              value={hoursPerIntern}
              onChange={(event) => setHoursPerIntern(Number(event.target.value) || 1)}
            />
            <TextField
              label="Duration (weeks)"
              type="number"
              min={1}
              max={52}
              required
              value={durationWeeks}
              onChange={(event) => setDurationWeeks(Number(event.target.value) || 1)}
            />
          </div>

          <TextField
            label="Supervisor"
            value={supervisorName}
            onChange={(event) => setSupervisorName(event.target.value)}
            placeholder="Who will manage the intern day to day?"
          />

          {/* The constraint, stated before they hit it rather than after. */}
          <div
            className={cn(
              'rounded-md px-2.5 py-2 text-sm',
              overBudget
                ? 'bg-critical-subtle text-critical-text'
                : 'bg-surface-sunken text-text-secondary',
            )}
          >
            {overBudget ? (
              <>
                This role needs <strong>{requested} weekly hours</strong> but you have{' '}
                <strong>{remaining}</strong> left of your {allocatedHours}. Reduce the intern count
                or the hours each.
              </>
            ) : (
              <>
                {internCount} × {hoursPerIntern}h = <strong>{requested} weekly hours</strong>,
                leaving {remaining - requested}h of your {allocatedHours}.
              </>
            )}
          </div>

          {error && <p className="text-sm text-critical-text">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-1.5 border-t border-border px-3 py-2.5">
          <Button variant="ghost" onClick={() => router.push('/startup/positions')}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={pending || overBudget || !title.trim() || !description.trim()}
            onClick={submit}
          >
            {pending ? 'Submitting…' : 'Submit position'}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
