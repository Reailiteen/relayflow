import { isTwoSided } from '@relayflow/entities';
import { getDocumentDownloadUrl, recordDocumentExtraction } from '@relayflow/logic';
import { getContext } from '@/server/context';
import { SimulatedIdVerification } from '@/server/verification';

/**
 * Reading an uploaded document, after the bytes have landed.
 *
 * A route handler rather than a Server Action because it is slow and it calls
 * out: PaddleOCR takes seconds over a bank statement, and an identity provider
 * takes seconds more. Both are things the browser should be able to fire and
 * watch, rather than block a form submission on.
 *
 * Two providers behind one endpoint, chosen by document kind:
 *
 *   **Bank statements** go to the PaddleOCR service in `services/ocr` — real
 *   extraction, with the IBAN validated by mod-97 and dropped entirely if it
 *   cannot be, because a wrong IBAN pre-filled in a box is worse than an empty
 *   one.
 *
 *   **Identity documents** go to `SimulatedIdVerification`, which reads
 *   nothing and checks nothing. It exists so the flow can be demonstrated
 *   before a real provider is wired in, and the screen renders its name so
 *   nobody is told a check happened that did not.
 *
 * Authorization is the use-case's, not this file's. `getDocumentDownloadUrl`
 * and `recordDocumentExtraction` both re-derive the candidate from the actor
 * and refuse a document that is not theirs, so a handler that guessed at its
 * own check would be adding a second opinion rather than a safeguard.
 */

export const maxDuration = 60;

interface ExtractedFieldPayload {
  key: string;
  label: string;
  extracted: string | null;
  confidence: number | null;
}

const failed = (documentId: string, ctx: Awaited<ReturnType<typeof getContext>>) =>
  recordDocumentExtraction(ctx, { documentId, fields: [], failed: true });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const ctx = await getContext();

  const document = await ctx.repos.documents.findById(documentId as never);
  if (!document.ok || !document.data) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  const { kind, storagePath, backStoragePath } = document.data;

  if (storagePath === null) {
    return Response.json({ error: 'nothing uploaded' }, { status: 409 });
  }

  try {
    const fields =
      kind === 'bank_statement'
        ? await readBankStatement(ctx, documentId)
        : await readIdentityDocument(kind, storagePath, backStoragePath);

    if (fields === null) {
      // A read that failed is a first-class outcome: the document drops back to
      // `uploaded` and the candidate is asked to try again. One left in
      // `extracting` looks exactly like one nobody has got to yet, and only one
      // of those needs a person.
      const recorded = await failed(documentId, ctx);
      return Response.json(
        { extracted: false },
        { status: recorded.ok ? 200 : 500 },
      );
    }

    const recorded = await recordDocumentExtraction(ctx, { documentId, fields });
    if (!recorded.ok) {
      return Response.json({ error: recorded.error.message }, { status: 400 });
    }
    return Response.json({ extracted: true, fieldCount: fields.length });
  } catch {
    // Never let an exception leave the document mid-extraction. The provider
    // being down is not the candidate's problem, but a stalled document is.
    await failed(documentId, ctx);
    return Response.json({ extracted: false }, { status: 200 });
  }
}

/**
 * PaddleOCR, over a signed URL.
 *
 * The file is fetched here and forwarded rather than handing the OCR service a
 * signed URL to fetch itself: a URL that opens a national ID should not leave
 * this process, and the service holds no Supabase credentials of its own by
 * design.
 */
async function readBankStatement(
  ctx: Awaited<ReturnType<typeof getContext>>,
  documentId: string,
): Promise<ExtractedFieldPayload[] | null> {
  const serviceUrl = process.env.OCR_SERVICE_URL;
  const secret = process.env.OCR_SHARED_SECRET;

  // Not configured is not an error. The candidate fills the fields in by hand,
  // which is a worse experience and an honest one — better than an extraction
  // that silently never completes.
  if (!serviceUrl || !secret) return emptyBankFields();

  const link = await getDocumentDownloadUrl(ctx, { documentId, side: 'front' });
  if (!link.ok) return null;

  const file = await fetch(link.data);
  if (!file.ok) return null;

  const form = new FormData();
  form.append('file', await file.blob(), 'statement');

  const response = await fetch(`${serviceUrl}/extract/bank-statement`, {
    method: 'POST',
    headers: { 'x-ocr-secret': secret },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { fields: ExtractedFieldPayload[] };
  return payload.fields;
}

/**
 * The fields a bank statement needs, unfilled.
 *
 * Returned rather than nothing when there is no OCR service, so the candidate
 * still gets the review screen with the right boxes on it — the flow is the
 * same, the values are just theirs to type.
 */
function emptyBankFields(): ExtractedFieldPayload[] {
  return [
    { key: 'iban', label: 'IBAN', extracted: null, confidence: null },
    { key: 'account_holder', label: 'Account holder', extracted: null, confidence: null },
    { key: 'bank_name', label: 'Bank', extracted: null, confidence: null },
  ];
}

async function readIdentityDocument(
  kind: 'national_id' | 'passport' | 'bank_statement' | 'qstp_contract' | 'startup_nda' | 'other',
  frontPath: string,
  backPath: string | null,
): Promise<ExtractedFieldPayload[] | null> {
  if (kind !== 'national_id' && kind !== 'passport') return null;
  if (isTwoSided(kind) && backPath === null) return null;

  const provider = new SimulatedIdVerification();
  const outcome = await provider.read({ kind, frontPath, backPath });
  if (outcome.status !== 'read') return null;

  return outcome.fields.map((field) => ({
    key: field.key,
    label: field.label,
    extracted: field.extracted,
    confidence: field.confidence,
  }));
}
