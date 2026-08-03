import type { DocumentKind, ExtractedField } from './document';

/**
 * Reading an identity document.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ SIMULATION. The only provider that exists today is
 * `SimulatedIdVerification`, which invents plausible values and checks nothing
 * against any register. It must not meet a real cohort's documents.
 *
 * The seam is here so a real provider — Sumsub, whose Qatari ID coverage is
 * documented — becomes a second implementation rather than a rewrite. What
 * makes that swap small is that the *shape* below is the real one: a provider
 * returns fields with confidences and takes time doing it, and the candidate
 * confirms every value before QSTP sees any of it. Nothing downstream trusts
 * this output, which is why an honest fake is useful and a dishonest one would
 * not be.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface IdVerificationRequest {
  readonly kind: DocumentKind;
  /** Storage paths, so a real provider can fetch the images itself. */
  readonly frontPath: string;
  readonly backPath: string | null;
}

export type IdVerificationOutcome =
  | { readonly status: 'read'; readonly fields: readonly ExtractedField[] }
  /** Genuinely could not read it — a blurred photo, a cropped corner. */
  | { readonly status: 'unreadable'; readonly reason: string };

export interface IdVerificationProvider {
  readonly name: string;
  /** True when this provider makes claims about a real register. */
  readonly authoritative: boolean;
  read(request: IdVerificationRequest): Promise<IdVerificationOutcome>;
}

/**
 * The steps the candidate is shown while a document is in `extracting`.
 *
 * Named here rather than in the component because they are a claim about what
 * the system is doing, and a claim belongs next to the thing making it. With
 * the simulated provider these are a description of nothing — which is why the
 * screen that renders them also renders the provider's name.
 */
export const VERIFICATION_STEPS = [
  { key: 'quality', label: 'Checking image quality' },
  { key: 'features', label: 'Reading security features' },
  { key: 'mrz', label: 'Reading the machine-readable zone' },
  { key: 'fields', label: 'Extracting details' },
] as const;

export type VerificationStep = (typeof VERIFICATION_STEPS)[number];
