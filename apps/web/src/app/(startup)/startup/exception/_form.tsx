'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Panel, PanelHeader, TextAreaField, TextField } from '@relayflow/ui-web';
import { requestExceptionAction } from '@/server/actions';

const tomorrow = (iso: string) => {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
};

/**
 * Asking QSTP for more time.
 *
 * The reason field carries real weight — it is the entire basis on which the
 * request is judged, and a startup that writes "need more time" will be
 * refused. So the placeholder shows the shape of an answer that works, and the
 * copy says plainly what happens if the request is not granted.
 */
export function ExceptionForm({ currentDeadline }: { currentDeadline: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(tomorrow(currentDeadline));

  const minDate = currentDeadline.slice(0, 10);
  const tooEarly = date <= minDate;
  const tooShort = reason.trim().length < 10;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await requestExceptionAction({
        kind: 'candidate_selection',
        reason: reason.trim(),
        requestedDeadline: new Date(`${date}T23:59:00.000Z`).toISOString(),
      });
      if (result.ok) {
        router.push('/startup');
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <Panel>
      <PanelHeader title="Request an extension" />

      <div className="flex flex-col gap-4 p-5">
        <div className="rounded-md bg-warning-subtle px-2.5 py-2 text-sm text-warning-text">
          If the deadline passes without an approved extension, your allocated hours return to the
          programme and are offered to other startups.
        </div>

        <TextAreaField
          label="Why do you need more time?"
          required
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Our technical lead was on medical leave for two weeks and we could not complete interviews in time."
          hint="QSTP judges the request on this alone. Be specific about what went wrong."
          {...(reason.length > 0 && tooShort ? { error: 'Give a little more detail.' } : {})}
        />

        <TextField
          label="Extend until"
          type="date"
          required
          min={minDate}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          hint={`The current deadline is ${new Date(currentDeadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.`}
          {...(tooEarly ? { error: 'Pick a date after the current deadline.' } : {})}
        />

        {error && <p className="text-sm text-critical-text">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-1.5 border-t border-border px-3 py-2.5">
        <Button variant="ghost" onClick={() => router.push('/startup')}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={pending || tooShort || tooEarly}
          onClick={submit}
        >
          {pending ? 'Sending…' : 'Send request'}
        </Button>
      </div>
    </Panel>
  );
}
