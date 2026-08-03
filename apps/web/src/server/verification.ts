import 'server-only';

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION — reads nothing, checks nothing, verifies nobody.
//
// This provider invents values that look like a Qatari ID and returns them with
// plausible confidences. It does not open the uploaded image. It does not
// contact any register. A document it "reads" has been verified by precisely
// nobody.
//
// It lives here, in the app's server layer, rather than in @relayflow/data —
// that package is the storage adapter and this touches no database. When a real
// provider is wired in, this file becomes its client, and the seam it satisfies
// (`IdVerificationProvider` in @relayflow/entities) does not move.
//
// It exists so the onboarding flow can be built and demonstrated end to end
// before a real provider is wired in. Two things keep that honest:
//
//   `authoritative` is false, and the screen renders the provider's name from
//   it, so nobody looking at the interface is told a check happened that did
//   not.
//
//   The candidate confirms every field before QSTP sees any of it, and QSTP
//   verifies against the actual document afterwards. So the invented values are
//   a starting point for a human, never a finding.
//
// Do not enable this against a real cohort's documents.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExtractedField,
  IdVerificationOutcome,
  IdVerificationProvider,
  IdVerificationRequest,
} from '@relayflow/entities';

/**
 * Deterministic per document, so a re-read of the same upload gives the same
 * answer. A provider that returned different values each time would let a
 * candidate refresh until it agreed with them.
 */
function seededFrom(path: string): number {
  let hash = 0;
  for (const character of path) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

const NATIONALITIES = ['Qatari', 'Egyptian', 'Indian', 'Jordanian', 'Pakistani'];

function qatariIdNumber(seed: number): string {
  // 11 digits: century+decade prefix, then the rest. Shaped like the real thing
  // so field validation gets exercised; corresponding to nobody.
  const body = String(seed % 1_000_000_000).padStart(9, '0');
  return `28${body}`;
}

function nationalIdFields(seed: number): ExtractedField[] {
  const expiryYear = 2028 + (seed % 4);
  return [
    {
      key: 'id_number',
      label: 'ID number',
      extracted: qatariIdNumber(seed),
      confirmed: null,
      confidence: 0.96,
    },
    {
      key: 'full_name',
      label: 'Full name',
      extracted: null,
      confirmed: null,
      // Null with a low confidence rather than an invented name: a wrong name
      // pre-filled in a box is one a tired person accepts, and this provider
      // has no basis whatsoever for guessing it.
      confidence: 0.0,
    },
    {
      key: 'nationality',
      label: 'Nationality',
      extracted: NATIONALITIES[seed % NATIONALITIES.length] ?? 'Qatari',
      confirmed: null,
      confidence: 0.72,
    },
    {
      key: 'expiry',
      label: 'Expiry date',
      extracted: `${expiryYear}-${String((seed % 12) + 1).padStart(2, '0')}-15`,
      confirmed: null,
      confidence: 0.81,
    },
  ];
}

function passportFields(seed: number): ExtractedField[] {
  return [
    {
      key: 'passport_number',
      label: 'Passport number',
      extracted: `QA${String(seed % 10_000_000).padStart(7, '0')}`,
      confirmed: null,
      confidence: 0.92,
    },
    { key: 'full_name', label: 'Full name', extracted: null, confirmed: null, confidence: 0.0 },
    {
      key: 'expiry',
      label: 'Expiry date',
      extracted: `${2029 + (seed % 3)}-02-14`,
      confirmed: null,
      confidence: 0.83,
    },
  ];
}

export class SimulatedIdVerification implements IdVerificationProvider {
  readonly name = 'Simulated reader (demo)';
  /** False, and the interface says so. */
  readonly authoritative = false;

  read(request: IdVerificationRequest): Promise<IdVerificationOutcome> {
    const seed = seededFrom(request.frontPath);

    // A Qatari ID is unreadable from one side. Refusing here rather than
    // returning half the fields keeps the failure the same shape a real
    // provider's would be.
    if (request.kind === 'national_id' && request.backPath === null) {
      return Promise.resolve({
        status: 'unreadable',
        reason: 'Both sides of the ID are needed.',
      });
    }

    if (request.kind === 'national_id') {
      return Promise.resolve({ status: 'read', fields: nationalIdFields(seed) });
    }
    if (request.kind === 'passport') {
      return Promise.resolve({ status: 'read', fields: passportFields(seed) });
    }

    return Promise.resolve({
      status: 'unreadable',
      reason: 'This provider only reads identity documents.',
    });
  }
}
