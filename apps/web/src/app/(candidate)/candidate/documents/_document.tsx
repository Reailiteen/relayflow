'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, ScanLine } from 'lucide-react';
import type { CandidateDocumentView } from '@relayflow/logic';
import { Badge, Button, Panel, PanelHeader, TextField, cn } from '@relayflow/ui-web';
import { confirmDocumentFieldsAction, uploadDocumentAction } from '@/server/actions';

const KIND_LABEL: Record<string, string> = {
  national_id: 'Qatar ID',
  passport: 'Passport',
  bank_statement: 'Bank statement',
  qstp_contract: 'QSTP contract',
  startup_nda: 'Startup NDA',
  other: 'Document',
};

const STATUS: Record<string, { tone: 'neutral' | 'info' | 'positive' | 'warning' | 'critical'; label: string }> = {
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
 * The review step is the important one. OCR is a suggestion, and the person
 * best placed to catch a mis-read IBAN is the one who owns the account — so
 * every extracted value is presented as an editable field, low-confidence ones
 * are called out explicitly, and nothing goes to QSTP until the candidate has
 * confirmed each field.
 */
export function DocumentCard({ view }: { view: CandidateDocumentView }) {
  const { document } = view;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      // No real file picker: there is no storage behind this yet, and pretending
      // otherwise would be the one dishonest thing in the demo.
      const result = await uploadDocumentAction({
        documentId: document.id,
        fileName: `${document.kind}-scan.jpg`,
      });
      if (!result.ok) setError(result.message);
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
        {/* Nothing uploaded yet */}
        {(document.status === 'requested' || document.status === 'rejected') && (
          <>
            <p className="text-base text-text-secondary">
              {document.kind === 'bank_statement'
                ? 'Upload a bank statement or letter showing your name and IBAN. Your salary is paid to this account.'
                : document.kind === 'startup_nda'
                  ? 'Your startup has asked you to sign this before you begin.'
                  : 'Take a clear photo of the whole document, with all four corners visible.'}
            </p>
            <Button variant="primary" size="md" disabled={pending} onClick={upload}>
              <FileUp className="size-4" />
              {pending ? 'Uploading…' : 'Upload photo'}
            </Button>
            <p className="text-sm text-text-muted">
              Demo: no file is stored. Uploading simulates a scan and shows the review step.
            </p>
          </>
        )}

        {/* OCR read something; the candidate checks it */}
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
                      ? { hint: 'We were not confident reading this one — please check it carefully.' }
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

            <Button
              variant="primary"
              size="md"
              disabled={pending || !allFilled}
              onClick={confirm}
            >
              {pending ? 'Sending…' : 'Confirm and send to QSTP'}
            </Button>
          </>
        )}

        {/* Done, from the candidate's side */}
        {document.status === 'submitted' && (
          <>
            <p className="flex items-center gap-2 text-base text-text-secondary">
              <CheckCircle2 className="size-4 shrink-0 text-info" aria-hidden="true" />
              Sent to QSTP. They will confirm it shortly — nothing more to do here.
            </p>
            <FieldSummary view={view} />
          </>
        )}

        {document.status === 'verified' && (
          <>
            <p className="flex items-center gap-2 text-base text-positive-text">
              <CheckCircle2 className="size-4 shrink-0 text-positive" aria-hidden="true" />
              Verified by QSTP.
            </p>
            <FieldSummary view={view} />
          </>
        )}

        {error && <p className="text-sm text-critical-text">{error}</p>}
      </div>
    </Panel>
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
