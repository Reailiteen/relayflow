'use client';

import { useRef, useState } from 'react';
import { Check, FileUp, X } from 'lucide-react';
import { Button, cn } from '@relayflow/ui-web';
import {
  ACCEPTED_DOCUMENT_TYPES,
  rejectionReasonFor,
  uploadToSignedUrl,
} from '@/lib/storage-client';
import { prepareDocumentUploadAction } from '@/server/actions';

/**
 * Choosing a file and getting it into storage.
 *
 * Three steps, of which the person sees one: ask the server for a URL, PUT the
 * bytes straight to Supabase, and hand the filename back so the caller can
 * record it. The bytes never touch the Next server.
 *
 * The picker holds the file rather than uploading on selection, because a
 * two-sided document has to send both or neither — accepting the front of a
 * Qatari ID and then failing on the back leaves a half-uploaded document that
 * nobody can verify and the candidate cannot obviously fix.
 */

export interface PickedFile {
  readonly file: File;
  readonly side: 'front' | 'back';
}

export function FilePicker({
  side,
  label,
  hint,
  file,
  disabled,
  onPick,
}: {
  side: 'front' | 'back';
  label: string;
  hint: string;
  file: File | null;
  disabled: boolean;
  onPick: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  const choose = (chosen: File | null) => {
    if (chosen === null) {
      setRejected(null);
      onPick(null);
      return;
    }
    // Checked here as a courtesy — the bucket enforces both limits again. But
    // telling somebody their 40 MB photo is too large before they spend a
    // minute sending it is worth the duplication.
    const reason = rejectionReasonFor(chosen);
    setRejected(reason);
    onPick(reason === null ? chosen : null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_DOCUMENT_TYPES}
        // Prefers the rear camera on a phone, which is the one pointed at the
        // document rather than at the person holding it.
        capture="environment"
        className="sr-only"
        disabled={disabled}
        aria-label={label}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className={cn(
          'flex items-center gap-2.5 rounded-md border border-dashed px-3 py-2.5 text-left',
          'transition-colors disabled:opacity-50',
          file
            ? 'border-positive bg-positive-subtle'
            : 'border-hairline-strong hover:border-accent',
        )}
      >
        {file ? (
          <Check className="size-4 shrink-0 text-positive" aria-hidden="true" />
        ) : (
          <FileUp className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium">{label}</span>
          <span className="block truncate text-sm text-text-muted">
            {file ? file.name : hint}
          </span>
        </span>
        {file && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remove ${label}`}
            className="shrink-0 rounded p-1 text-ink-3 hover:text-ink"
            onClick={(event) => {
              event.stopPropagation();
              if (input.current) input.current.value = '';
              choose(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.stopPropagation();
              if (input.current) input.current.value = '';
              choose(null);
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </button>

      {rejected && <p className="text-sm text-critical-text">{rejected}</p>}
      <input type="hidden" value={side} readOnly />
    </div>
  );
}

/**
 * Send the chosen files, then tell the caller what to record.
 *
 * Returns the filenames rather than the paths: the paths are the server's to
 * compute, and returning them here would invite a caller to pass them back,
 * which is exactly the thing `documentStoragePath` exists to prevent.
 */
export async function sendFiles(
  documentId: string,
  files: readonly PickedFile[],
): Promise<{ ok: true; fileNames: Record<'front' | 'back', string | null> } | { ok: false; message: string }> {
  const fileNames: Record<'front' | 'back', string | null> = { front: null, back: null };

  for (const picked of files) {
    const prepared = await prepareDocumentUploadAction({
      documentId,
      fileName: picked.file.name,
      side: picked.side,
    });
    if (!prepared.ok) return { ok: false, message: prepared.message };

    // No storage behind this deployment — the fixtures path. Record the file
    // and move on rather than POSTing at a URL that does not exist.
    if (prepared.data.kind === 'signed') {
      const sent = await uploadToSignedUrl({
        bucket: 'candidate-documents',
        path: prepared.data.path,
        token: prepared.data.token,
        file: picked.file,
      });
      if (!sent.ok) return { ok: false, message: sent.message };
    }

    fileNames[picked.side] = picked.file.name;
  }

  return { ok: true, fileNames };
}

export function UploadButton({
  pending,
  disabled,
  label,
  onClick,
}: {
  pending: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="primary" size="md" disabled={pending || disabled} onClick={onClick}>
      <FileUp className="size-4" />
      {pending ? 'Sending…' : label}
    </Button>
  );
}
