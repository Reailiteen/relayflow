import {
  RATING_KEYS,
  type Candidate,
  type CycleId,
  type PositionIntent,
  type RatingItem,
  type RatingKey,
  type StartupId,
  type StartupRating,
  type UserId,
} from '@relayflow/entities';
import * as seed from './seed';

/**
 * Readiness answers and QSTP ratings for the cycle sitting in `allocation`.
 *
 * These exist for a specific reason. Once scoring moved out of the adapter, a
 * cohort with no ratings and no intents produces a draft with *zero* proposals
 * — every startup comes back `awaiting_manual_scores` — and the failure reads
 * as "expected 3 proposals, got 0" rather than "you forgot the seed data".
 *
 * The seven startups are shaped to exercise every outcome the engine can
 * produce, so the screens have something honest to render:
 *
 *   acme       all 4s, feasible      95    60h
 *   northwind  all 4s, feasible      95    60h   ← exact tie with acme
 *   fintech    all 3s, feasible      72.5  0h    ← downgraded 40→30→20→0, waitlisted
 *   agritech   role value 1                      not_fundable
 *   pearl      onboarding not ready              not_ready
 *   lusail     feasible, unrated                 awaiting_manual_scores
 *   msheireb   no intent at all                  needs_information
 */

const INTENT_PREFIX = '17e70000-0000-4000-8000-';
const RATING_PREFIX = '4a7e0000-0000-4000-8000-';
const ITEM_PREFIX = '4a7e1000-0000-4000-8000-';
const CANDIDATE_PREFIX = 'ca4d2da7-0000-4000-8000-';

const at = (n: number, prefix: string): string => `${prefix}${String(n).padStart(12, '0')}`;

const CREATED = '2026-07-05T09:00:00.000Z';

interface IntentSpec {
  readonly startupId: StartupId;
  readonly title: string;
  readonly category: string;
  readonly deliverable: string;
  /** Set false to fail the gate — the whole role becomes `not_ready`. */
  readonly onboardingReady?: boolean;
  readonly weeklySupervisionMinutes?: number;
}

const INTENTS: readonly IntentSpec[] = [
  {
    startupId: seed.ids.acme,
    title: 'Applied AI Engineering Intern',
    category: 'ai_engineering',
    deliverable: 'A reproducible offline evaluation pipeline and error analysis report.',
  },
  {
    startupId: seed.ids.northwind,
    title: 'Embedded Systems Intern',
    category: 'embedded_systems',
    deliverable: 'A calibrated sensor driver with a documented test rig.',
  },
  {
    startupId: seed.ids.fintech,
    title: 'Risk Analytics Intern',
    category: 'data_analytics',
    deliverable: 'A back-tested scoring model with a written methodology note.',
  },
  {
    startupId: seed.ids.agritech,
    title: 'Field Data Intern',
    category: 'data_analytics',
    deliverable: 'A validated irrigation dataset and a summary dashboard.',
  },
  {
    startupId: seed.ids.pearl,
    title: 'Bioinformatics Intern',
    category: 'bioinformatics',
    deliverable: 'An annotated variant-calling pipeline with reproducible runs.',
    // Nothing wrong with the role — the startup simply is not set up to
    // receive anyone yet. `not_ready`, which is not the same as scoring badly.
    onboardingReady: false,
  },
  {
    startupId: seed.ids.lusail,
    title: 'Urban Data Intern',
    category: 'data_analytics',
    deliverable: 'A mobility dataset pipeline and three documented analyses.',
  },
  // msheireb submits no intent at all, so the engine has nothing to judge and
  // returns `needs_information` rather than guessing.
];

export function positionIntents(cycleId: CycleId, submittedBy: UserId): PositionIntent[] {
  return INTENTS.map((spec, index) => ({
    id: at(index + 1, INTENT_PREFIX) as PositionIntent['id'],
    cycleId,
    startupId: spec.startupId,
    title: spec.title,
    category: spec.category,
    expectedDeliverable: spec.deliverable,
    learningOutcomes: ['Scope a problem with a supervisor', 'Ship and document a reviewed result'],
    workMode: 'hybrid' as const,
    supervisorName: 'Named Supervisor',
    supervisorId: null,
    weeklySupervisionMinutes: spec.weeklySupervisionMinutes ?? 60,
    maximumInterns: 1,
    resourcesReady: true,
    onboardingReady: spec.onboardingReady ?? true,
    submittedBy,
    submittedAt: CREATED,
    createdAt: CREATED,
    updatedAt: CREATED,
  }));
}

/** Uniform score across all six dimensions, with per-dimension overrides. */
function ratingItems(
  base: number,
  offset: number,
  overrides: Partial<Record<RatingKey, number>> = {},
): RatingItem[] {
  return RATING_KEYS.map((dimension, index) => ({
    id: at(offset * 10 + index + 1, ITEM_PREFIX) as RatingItem['id'],
    dimension,
    value: overrides[dimension] ?? base,
    rationale: `Provisional synthetic rating for development. Anchored at ${
      overrides[dimension] ?? base
    } against the published rubric; not a QSTP judgement.`,
    citations: [],
  }));
}

interface RatingSpec {
  readonly startupId: StartupId;
  readonly base: number;
  readonly overrides?: Partial<Record<RatingKey, number>>;
}

const RATINGS: readonly RatingSpec[] = [
  { startupId: seed.ids.acme, base: 4 },
  { startupId: seed.ids.northwind, base: 4 },
  { startupId: seed.ids.fintech, base: 3 },
  // Strong on every other axis, but a poor host. The role-value floor is
  // non-compensatory, so this lands as `not_fundable` rather than a low score.
  { startupId: seed.ids.agritech, base: 3, overrides: { valueToStartup: 1 } },
  { startupId: seed.ids.pearl, base: 3 },
  // lusail is deliberately absent — a feasible role nobody has rated yet.
];

/**
 * A candidate pool for the cycle still in `allocation`.
 *
 * Without these you can drive a cycle from evaluation through role approval and
 * then hit a wall: there is nobody to shortlist, so stages 4 onwards cannot be
 * exercised at all on a cycle you started yourself. The Spring fixtures have a
 * full pool but sit at `completion`, which shows the end state without letting
 * you reach it.
 *
 * The availability mix is deliberate. A pool where everyone is available hides
 * the failure this whole product exists to prevent — a startup spending an
 * interview on somebody who took another job two months ago.
 */
export function autumnCandidates(cycleId: CycleId): Candidate[] {
  const rows: readonly [string, string, string[], Candidate['availability']][] = [
    ['Noor Abdulla', 'noor.abdulla@example.com', ['TypeScript', 'React'], 'available'],
    ['Ali Farouk', 'ali.farouk@example.com', ['Python', 'FastAPI'], 'available'],
    ['Zainab Haddad', 'zainab.haddad@example.com', ['Rust', 'Embedded'], 'available'],
    ['Tariq Mansour', 'tariq.mansour@example.com', ['SQL', 'dbt'], 'available'],
    // Applied months ago and never confirmed. Must not be treated as available.
    ['Huda Sameer', 'huda.sameer@example.com', ['Figma', 'User research'], 'unconfirmed'],
    // Already took something else.
    ['Bilal Aziz', 'bilal.aziz@example.com', ['Go', 'Kubernetes'], 'employed'],
  ];

  return rows.map(([fullName, email, skills, availability], index) => ({
    id: at(index + 1, CANDIDATE_PREFIX) as Candidate['id'],
    cycleId,
    userId: null,
    fullName,
    email,
    phone: null,
    skills,
    cvUrl: null,
    portfolioUrl: null,
    githubUrl: null,
    availability,
    availabilityConfirmedAt: availability === 'available' ? CREATED : null,
    source: 'deema',
    createdAt: CREATED,
    updatedAt: CREATED,
  }));
}

export function startupRatings(cycleId: CycleId, ratedBy: UserId): StartupRating[] {
  return RATINGS.map((spec, index) => ({
    id: at(index + 1, RATING_PREFIX) as StartupRating['id'],
    cycleId,
    startupId: spec.startupId,
    status: 'submitted' as const,
    items: ratingItems(spec.base, index, spec.overrides),
    ratedBy,
    supersedesId: null,
    revisionReason: null,
    submittedAt: CREATED,
    createdAt: CREATED,
    updatedAt: CREATED,
  }));
}
