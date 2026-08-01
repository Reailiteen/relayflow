'use client';

import { useState, useTransition } from 'react';
import { ArrowRight, ScanLine, TriangleAlert } from 'lucide-react';
import type { VerificationItem } from '@relayflow/logic';
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  TextAreaField,
  cn,
} from '@relayflow/ui-web';
import { verifyDocumentAction } from '@/server/actions';

const KIND_LABEL: Record<string, string> = {
  national_id: 'Qatar ID',
  passport: 'Passport',
  bank_statement: 'Bank statement',
  qstp_contract: 'QSTP contract',
  startup_nda: 'Startup NDA',
  other: 'Document',
};

/**
 * One document awaiting verification.
 *
 * The layout is built around what a verifier actually has to decide. Fields the
 * candidate corrected are pulled out and shown as before → after, because a
 * correction is the strongest signal that something is worth reading closely.
 * Fields OCR was unsure about are flagged even when the candidate accepted them
 * unchanged — an unsure read that nobody questioned is the riskiest of all.
 */
export function VerificationCard({
  item,
  canVerify,
}: {
  item: VerificationItem;
  canVerify: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const { document } = item;

  const decide = (decision: 'verified' | 'rejected', rejectionReason: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await verifyDocumentAction({
        documentId: document.id,
        decision,
        rejectionReason,
      });
      if (result.ok) setRejecting(false);
      else setError(result.message);
    });
  };

  const decided = document.status === 'verified' || document.status === 'rejected';

  return (
    <div className={cn('border-b border-border px-3 py-2.5 last:border-b-0', pending && 'opacity-50')}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{item.candidate?.fullName ?? 'Unknown'}</span>
            <Badge tone="neutral">{KIND_LABEL[document.kind] ?? document.kind}</Badge>
            {document.status === 'verified' && <Badge tone="positive">verified</Badge>}
            {document.status === 'rejected' && <Badge tone="critical">rejected</Badge>}
            {item.startup && <span className="text-xs text-text-muted">{item.startup.name}</span>}
          </div>

          {/* What the candidate changed. The most informative thing on screen. */}
          {item.corrected.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-1 rounded-md bg-warning-subtle px-2.5 py-2">
              <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-warning-text">
                <ScanLine className="size-3" aria-hidden="true" />
                Corrected by the candidate
              </span>
              {item.corrected.map((change) => (
                <p key={change.label} className="flex flex-wrap items-baseline gap-1.5 text-sm">
                  <span className="text-text-muted">{change.label}</span>
                  <span className="font-mono text-text-muted line-through">{change.extracted}</span>
                  <ArrowRight className="size-3 text-text-muted" aria-hidden="true" />
                  <span className="font-mono font-medium">{change.confirmed}</span>
                </p>
              ))}
            </div>
          )}

          {item.lowConfidence.length > 0 && (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-warning-text">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              Low scan confidence on {item.lowConfidence.join(', ')} — check against the file.
            </p>
          )}

          <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {document.fields.map((field) => (
              <div key={field.key} className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-sm text-text-muted">{field.label}</dt>
                <dd className="truncate font-mono text-sm">
                  {field.confirmed ?? field.extracted ?? '—'}
                </dd>
              </div>
            ))}
          </dl>

          {document.rejectionReason && (
            <p className="mt-1.5 text-sm text-critical-text">
              Rejected: {document.rejectionReason}
            </p>
          )}

          {error && <p className="mt-1.5 text-sm text-critical-text">{error}</p>}
        </div>

        {canVerify && !decided && (
          <div className="flex shrink-0 gap-1.5">
            <Button size="xs" variant="secondary" disabled={pending} onClick={() => setRejecting(true)}>
              Reject
            </Button>
            <Button
              size="xs"
              variant="primary"
              disabled={pending}
              onClick={() => decide('verified', null)}
            >
              Verify
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={rejecting}
        onOpenChange={(next) => {
          setRejecting(next);
          if (!next) setReason('');
        }}
      >
        <DialogContent
          title="Send this back"
          description={`${item.candidate?.fullName ?? 'The candidate'} will be asked to fix it and re-send.`}
        >
          <DialogBody>
            <TextAreaField
              label="What needs fixing?"
              required
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The IBAN does not match the name on the account. Please upload a statement showing both."
              hint="They see this exactly as written, so make it actionable."
            />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={pending || !reason.trim()}
              onClick={() => decide('rejected', reason.trim())}
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
