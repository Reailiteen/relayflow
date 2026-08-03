'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, ScanLine } from 'lucide-react';
import type { CandidateDocumentView } from '@relayflow/logic';
import { VERIFICATION_STEPS, isTwoSided } from '@relayflow/entities';
import { Badge, Button, Panel, PanelHeader, TextField, cn } from '@relayflow/ui-web';
import {
  confirmDocumentFieldsAction,
  documentDownloadUrlAction,
  uploadDocumentAction,
} from '@/server/actions';
import { FilePicker, UploadButton, sendFiles, type PickedFile } from './_upload';

const KIND_LABEL: Record<string, string> = {
  national_id: 'Qatar ID',
  passport: 'Passport',
  bank_statement: 'Bank statement',
  qstp_contract: 'QSTP contract',
  startup_nda: 'Startup NDA',
  other: 'Document',
};

const STATUS: Record<
  string,
  { tone: 'neutral' | 'info' | 'positive' | 'warning' | 'critical'; label: string }
> = {
  requested: { tone: 'warning', label: 'needed' },
  uploaded: { tone: 'info', label: 'uploaded' },
  extracting: { tone: 'info', label: 'reading' },
  awaiting_candidate_review: { tone: 'warning', label: 'check details' },
  submitted: { tone: 'info', label: 'with QSTP' },
  verified: { tone: 'positive', label: 'verified' },
  rejected: { tone: 'critical', label: 'needs fixing' },
};

/**
 * One document, through its whole life.
 *
 * The review step is the important one. Extraction is a suggestion, and the
 * person best placed to catch a mis-read IBAN is the one who owns the account —
 * so every extracted value is an editable field, low-confidence ones are called
 * out, and nothing reaches QSTP until the candidate has confirmed each one.
 */
export function DocumentCard({ view }: { view: CandidateDocumentView }) {
  const { document } = view;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  const twoSided = isTwoSided(document.kind);
  const reviewing = document.status === 'awaiting_candidate_review';
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      document.fields.map((field) => [field.key, field.confirmed ?? field.extracted ?? '']),
    ),
  );

  const lowConfidence = new Set(view.lowConfidence);
  const status = STATUS[document.status] ?? STATUS.requested;

  const upload = () => {
    setError(null);
    startTransition(async () => {
      const picked: PickedFile[] = [];
      if (front) picked.push({ file: front, side: 'front' });
      if (back) picked.push({ file: back, side: 'back' });

      const sent = await sendFiles(document.id, picked);
      if (!sent.ok) {
        setError(sent.message);
        return;
      }

      if (sent.fileNames.front === null) {
        setError('The upload did not finish. Please try again.');
        return;
      }

      const recorded = await uploadDocumentAction({
        documentId: document.id,
        fileName: sent.fileNames.front,
        backFileName: sent.fileNames.back,
      });
      if (!recorded.ok) {
        setError(recorded.message);
        return;
      }

      // The bytes are in storage and the row says `extracting`. Kick the reader
      // off and let the progress panel below watch for the result — the request
      // is not awaited for its answer, because it takes seconds and the page
      // re-renders when the row changes anyway.
      void fetch(`/api/extract/${document.id}`, { method: 'POST' });
    });
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmDocumentFieldsAction({
        documentId: document.id,
        fields: Object.entries(values).map(([key, value]) => ({ key, value })),
      });
      if (!result.ok) setError(result.message);
    });
  };

  const allFilled = document.fields.every((field) => (values[field.key] ?? '').trim().length > 0);
  const readyToSend = front !== null && (!twoSided || back !== null);

  return (
    <Panel>
      <PanelHeader
        title={KIND_LABEL[document.kind] ?? 'Document'}
        aside={<Badge tone={status?.tone ?? 'neutral'}>{status?.label}</Badge>}
      />

      {document.status === 'rejected' && document.rejectionReason && (
        <p className="flex items-start gap-2 border-b border-border bg-critical-subtle px-3 py-2 text-base text-critical-text">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>QSTP needs this fixed. </strong>
            {document.rejectionReason}
          </span>
        </p>
      )}

      <div className="flex flex-col gap-4 p-5">
        {/* Nothing uploaded yet, or QSTP sent it back */}
        {(document.status === 'requested' ||
          document.status === 'rejected' ||
          document.status === 'uploaded') && (
          <>
            <p className="text-base text-text-secondary">
              {document.kind === 'bank_statement'
                ? 'Upload a bank statement or letter showing your name and IBAN. Your salary is paid to this account.'
                : document.kind === 'startup_nda'
                  ? 'Your startup has asked you to sign this before you begin.'
                  : 'Photograph the whole document, with all four corners visible.'}
            </p>

            <FilePicker
              side="front"
              label={twoSided ? 'Front of your Qatar ID' : 'Choose a file or take a photo'}
              hint="JPEG, PNG or PDF, up to 10 MB"
              file={front}
              disabled={pending}
              onPick={setFront}
            />

            {/*
              A Qatari ID is unreadable from one side: the number is on the
              front and the expiry on the back. Asking for both up front beats
              accepting one and rejecting the document later.
            */}
            {twoSided && (
              <FilePicker
                side="back"
                label="Back of your Qatar ID"
                hint="The side with the expiry date"
                file={back}
                disabled={pending}
                onPick={setBack}
              />
            )}

            <UploadButton
              pending={pending}
              disabled={!readyToSend}
              label={twoSided && !back ? 'Add the back to continue' : 'Upload'}
              onClick={upload}
            />
          </>
        )}

        {document.status === 'extracting' && <ExtractionProgress />}

        {/* Something was read; the candidate checks it */}
        {reviewing && (
          <>
            <div className="flex items-start gap-2 rounded-md bg-info-subtle px-2.5 py-2 text-base text-info-text">
              <ScanLine className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                We read the details below from your upload. <strong>Please check each one</strong> —
                correct anything that is wrong before sending it.
              </span>
            </div>

            {document.fields.map((field) => {
              const unsure = lowConfidence.has(field.key);
              return (
                <div key={field.key} className="flex flex-col gap-1">
                  <TextField
                    label={field.label}
                    required
                    value={values[field.key] ?? ''}
                    onChange={(event) =>
                      setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                    }
                    {...(unsure
                      ? {
                          hint: 'We were not confident reading this one — please check it carefully.',
                        }
                      : {})}
                    className={cn(unsure && 'ring-warning')}
                  />
                  {field.extracted !== null && (values[field.key] ?? '') !== field.extracted && (
                    <p className="text-xs text-text-muted">
                      We read: <span className="font-mono">{field.extracted}</span>
                    </p>
                  )}
                </div>
              );
            })}

            <Button variant="primary" size="md" disabled={pending || !allFilled} onClick={confirm}>
              {pending ? 'Sending…' : 'Confirm and send to QSTP'}
            </Button>
          </>
        )}

        {document.status === 'submitted' && (
          <>
            <p className="flex items-center gap-2 text-base text-text-secondary">
              <CheckCircle2 className="size-4 shrink-0 text-info" aria-hidden="true" />
              Sent to QSTP. They will confirm it shortly — nothing more to do here.
            </p>
            <FieldSummary view={view} />
            <DownloadLinks view={view} />
          </>
        )}

        {document.status === 'verified' && (
          <>
            <p className="flex items-center gap-2 text-base text-positive-text">
              <CheckCircle2 className="size-4 shrink-0 text-positive" aria-hidden="true" />
              Verified by QSTP.
            </p>
            <FieldSummary view={view} />
            <DownloadLinks view={view} />
          </>
        )}

        {error && <p className="text-sm text-critical-text">{error}</p>}
      </div>
    </Panel>
  );
}

/**
 * What the reader is doing, while it does it.
 *
 * The steps are real work in the sense that the document genuinely sits in
 * `extracting` until something writes fields to it — this is not a spinner
 * dressed up as progress. What it is not is a claim that a government register
 * was consulted, which is why the line underneath names the reader.
 *
 * Polls rather than subscribes: extraction finishes in seconds and this is one
 * screen with one document on it. A realtime subscription would be more
 * machinery than the problem deserves.
 */
function ExtractionProgress() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Paced to look like the work rather than to fill a bar: each step holds
    // long enough to read, and the last one stays put until the row moves on.
    timers.current = VERIFICATION_STEPS.slice(1).map((_, index) =>
      setTimeout(() => setStep(index + 1), (index + 1) * 900),
    );

    // `router.refresh()` re-runs the server component, which re-reads the row.
    // Polling rather than subscribing: extraction finishes in seconds and this
    // is one screen with one document on it. A realtime channel would be more
    // machinery than the problem deserves.
    const poll = setInterval(() => router.refresh(), 2500);

    return () => {
      timers.current.forEach(clearTimeout);
      clearInterval(poll);
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-2.5">
      {VERIFICATION_STEPS.map((entry, index) => (
        <div key={entry.key} className="flex items-center gap-2.5 text-base">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full transition-colors',
              index < step ? 'bg-positive' : index === step ? 'animate-pulse bg-accent' : 'bg-ink-3',
            )}
            aria-hidden="true"
          />
          <span className={index <= step ? 'text-ink' : 'text-text-muted'}>{entry.label}</span>
        </div>
      ))}
      {/*
        The reader names itself. The demo reader invents plausible values and
        checks them against nothing, and somebody looking at this screen is
        entitled to know that rather than to infer a verification that did not
        happen.
      */}
      <p className="text-sm text-text-muted">
        Reading with the demo reader — no external register is contacted. You will be asked to
        check every value before it goes anywhere.
      </p>
    </div>
  );
}

/** Read-only recap of the confirmed values. */
function FieldSummary({ view }: { view: CandidateDocumentView }) {
  if (view.document.fields.length === 0) return null;

  return (
    <dl className="divide-y divide-border rounded-md bg-surface-sunken px-3">
      {view.document.fields.map((field) => (
        <div key={field.key} className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-sm text-text-muted">{field.label}</dt>
          <dd className="truncate font-mono text-sm">{field.confirmed ?? field.extracted}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Opening what was uploaded.
 *
 * The URL is minted on click and lives sixty seconds. A link generated when the
 * page rendered and left sitting in the markup is a permanent bearer token for
 * a national ID — anybody who saw the page source, a screen share, or a log
 * line could open it forever.
 */
function DownloadLinks({ view }: { view: CandidateDocumentView }) {
  const sides = [
    { side: 'front' as const, name: view.document.fileName },
    { side: 'back' as const, name: view.document.backFileName },
  ].filter((entry) => entry.name !== null);

  if (sides.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {sides.map((entry) => (
        <DownloadLink
          key={entry.side}
          documentId={view.document.id}
          side={entry.side}
          name={entry.name ?? 'file'}
        />
      ))}
    </div>
  );
}

function DownloadLink({
  documentId,
  side,
  name,
}: {
  documentId: string;
  side: 'front' | 'back';
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setError(null);
    startTransition(async () => {
      const result = await documentDownloadUrlAction({ documentId, side });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.open(result.data, '_blank', 'noopener,noreferrer');
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Button size="xs" variant="secondary" disabled={pending} onClick={open}>
        <Download className="size-3.5" />
        {pending ? 'Opening…' : name}
      </Button>
      {error && <span className="text-xs text-critical-text">{error}</span>}
    </div>
  );
}
