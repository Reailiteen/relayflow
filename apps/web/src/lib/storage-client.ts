'use client';

import { createWebBrowserClient } from '@relayflow/data/web';

/**
 * Putting bytes into object storage, from the browser.
 *
 * The only client-side module allowed to touch `@relayflow/data` — the ESLint
 * rule in this app makes that exception here and in the three server seam
 * files, and nowhere else.
 *
 * The file goes straight from the browser to Supabase and never through the
 * Next server. Two reasons, and the second is the real one:
 *
 *   A phone photo of a Qatari ID is three to six megabytes, and a Server Action
 *   caps its request body at one by default.
 *
 *   The signed URL was minted server-side under the candidate's own JWT, so the
 *   storage policy already decided whether this write is allowed — at the
 *   moment the URL was created, rather than after several megabytes have
 *   already crossed the wire.
 */

export type UploadOutcome = { ok: true } | { ok: false; message: string };

function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createWebBrowserClient(url, key);
}

export async function uploadToSignedUrl(input: {
  bucket: 'candidate-documents' | 'requirement-submissions';
  path: string;
  token: string;
  file: File;
}): Promise<UploadOutcome> {
  const client = browserClient();
  if (!client) {
    // The server handed back a signed URL, so storage exists there. Reaching
    // here means the public variables are missing from the browser bundle,
    // which is a build problem rather than something the person can fix.
    return { ok: false, message: 'Uploads are not configured. Please tell QSTP.' };
  }

  const { error } = await client.storage
    .from(input.bucket)
    .uploadToSignedUrl(input.path, input.token, input.file, {
      contentType: input.file.type,
      // Re-uploading after a rejection replaces the file at the same path,
      // which is what the update policy in 0014 exists for.
      upsert: true,
    });

  if (error) {
    return { ok: false, message: 'The upload did not finish. Please try again.' };
  }
  return { ok: true };
}

/**
 * What the browser will accept before anything is sent.
 *
 * The bucket enforces both limits again server-side — this is a courtesy, not
 * a control. Telling somebody their 40 MB photo is too large before they spend
 * a minute uploading it is worth the duplication.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_DOCUMENT_TYPES = 'image/jpeg,image/png,image/heic,image/webp,application/pdf';

export function rejectionReasonFor(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB — try photographing it again at a lower resolution.`;
  }
  if (file.size === 0) return 'That file is empty.';
  return null;
}
