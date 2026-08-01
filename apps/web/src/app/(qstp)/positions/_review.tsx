'use client';

import { useState, useTransition } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  TextAreaField,
} from '@relayflow/ui-web';
import { reviewPositionAction } from '@/server/actions';

/**
 * Approve a role, or send it back.
 *
 * Approving is one click because it is the common case. Sending back opens a
 * dialog because it requires a reason — the startup sees that text and nothing
 * else, so "rejected" alone would leave them guessing.
 */
export function ReviewActions({ positionId, title }: { positionId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');

  const decide = (decision: 'approved' | 'changes_requested', text: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await reviewPositionAction({ positionId, decision, note: text });
      if (result.ok) {
        setAsking(false);
        setNote('');
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        {error && <span className="text-xs text-critical-text">{error}</span>}
        <Button size="xs" variant="secondary" disabled={pending} onClick={() => setAsking(true)}>
          Request changes
        </Button>
        <Button
          size="xs"
          variant="primary"
          disabled={pending}
          onClick={() => decide('approved', null)}
        >
          Approve
        </Button>
      </div>

      <Dialog
        open={asking}
        onOpenChange={(next) => {
          setAsking(next);
          if (!next) setNote('');
        }}
      >
        <DialogContent
          title="Request changes"
          description={`The startup will see this against "${title}" and can resubmit.`}
        >
          <DialogBody>
            <TextAreaField
              label="What needs changing?"
              required
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Two interns at 30 hours exceeds your 40-hour allocation. Reduce to one intern or lower the hours."
              hint="They see this exactly as written."
            />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              disabled={pending || !note.trim()}
              onClick={() => decide('changes_requested', note.trim())}
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PositionStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'approved' || status === 'filled'
      ? 'positive'
      : status === 'submitted'
        ? 'info'
        : status === 'changes_requested'
          ? 'warning'
          : 'neutral';
  return <Badge tone={tone}>{status.replace('_', ' ')}</Badge>;
}
