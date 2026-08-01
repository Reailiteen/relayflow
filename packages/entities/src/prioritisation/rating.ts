import { z } from 'zod';
import { RATING_KEYS, type QstpRatings, type RatingKey } from '@relayflow/prioritisation';
import { defineEntity, auditColumns } from '../shared/entity';
import {
  cycleId,
  ratingItemId,
  startupId,
  startupRatingId,
  userId,
  type CycleId,
  type RatingItemId,
  type StartupId,
  type StartupRatingId,
  type UserId,
} from '../shared/ids';

/**
 * A QSTP reviewer's judgement of one startup.
 *
 * This is where the score actually comes from. Ninety of the hundred points are
 * these six numbers; extraction only resolves position feasibility and platform
 * history. The old `operatorScore` — one 0–100 number typed into a box — is not
 * a smaller version of this, it is a different thing, and it is now derived
 * *from* a submitted rating rather than entered by hand.
 *
 * Two rules make the output defensible rather than merely produced:
 *
 *   Every dimension carries a mandatory rationale. A number without a reason is
 *   not reviewable, and reviewability is the entire claim this system makes.
 *
 *   A revision is a new row, never an edit. A rating that changed after a run
 *   was published must stay reconstructable, or "why did Acme get 60?" has no
 *   honest answer.
 */

export { RATING_KEYS, type RatingKey };

export const RATING_LABELS: Readonly<Record<RatingKey, string>> = {
  progressAgainstStage: 'Progress against stage',
  tractionStrength: 'Traction strength',
  valueToStartup: 'Value of the role to the startup',
  valueToIntern: 'Value of the role to the intern',
  qstpQatarAlignment: 'Alignment with QSTP and Qatar',
  researchEcosystemContribution: 'Contribution to the research ecosystem',
};

/** Maximum for every dimension. Mirrors `DEFAULT_POLICY.ratingMaximum`. */
export const RATING_MAXIMUM = 4;

export const RATING_STATUSES = ['draft', 'submitted', 'superseded'] as const;
export const ratingStatus = z.enum(RATING_STATUSES);
export type RatingStatus = (typeof RATING_STATUSES)[number];

/**
 * What the rater read, kept beside what they concluded.
 *
 * `fieldPath` is the extraction contract's own key space, which is what joins a
 * judgement back to a specific page of a specific document. `extracted` mirrors
 * the pattern in `onboarding/document.ts`: the model's reading stays readable
 * after a human overrules it, which is the only way to measure how often the
 * model is wrong.
 */
export interface RatingCitation {
  readonly fieldPath: string;
  readonly extracted: string | null;
  readonly note: string | null;
}

export interface RatingItem {
  readonly id: RatingItemId;
  readonly dimension: RatingKey;
  /** 0..4, or null while the rating is still a draft. */
  readonly value: number | null;
  readonly rationale: string | null;
  readonly citations: readonly RatingCitation[];
}

export interface StartupRating {
  readonly id: StartupRatingId;
  readonly cycleId: CycleId;
  readonly startupId: StartupId;
  readonly status: RatingStatus;
  readonly items: readonly RatingItem[];
  readonly ratedBy: UserId;
  readonly supersedesId: StartupRatingId | null;
  readonly revisionReason: string | null;
  readonly submittedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** True when all six dimensions have a value and a rationale. */
export function isComplete(rating: Pick<StartupRating, 'items'>): boolean {
  return RATING_KEYS.every((key) => {
    const item = rating.items.find((row) => row.dimension === key);
    return (
      item !== undefined &&
      item.value !== null &&
      item.rationale !== null &&
      item.rationale.trim().length > 0
    );
  });
}

/**
 * Convert to the engine's rating input, or `null` if incomplete.
 *
 * Returning null rather than defaulting the gaps to zero is deliberate: an
 * unrated startup must reach the engine as `awaiting_manual_scores`, not as a
 * startup somebody rated badly.
 */
export function toEngineRatings(rating: Pick<StartupRating, 'items'>): QstpRatings | null {
  if (!isComplete(rating)) return null;
  const values = {} as Record<RatingKey, number>;
  for (const key of RATING_KEYS) {
    const item = rating.items.find((row) => row.dimension === key);
    if (item?.value === null || item?.value === undefined) return null;
    values[key] = item.value;
  }
  return values;
}

/** Which dimensions still need work, for the reviewer's own checklist. */
export function missingDimensions(rating: Pick<StartupRating, 'items'>): readonly RatingKey[] {
  return RATING_KEYS.filter((key) => {
    const item = rating.items.find((row) => row.dimension === key);
    return item === undefined || item.value === null || !item.rationale?.trim();
  });
}

const ratingCitationSchema = z.object({
  fieldPath: z.string().min(1).max(120),
  extracted: z.string().max(2000).nullable().default(null),
  note: z.string().max(2000).nullable().default(null),
});

export const startupRatingRow = z.object({
  id: startupRatingId,
  cycle_id: cycleId,
  startup_id: startupId,
  status: ratingStatus,
  items: z
    .array(
      z.object({
        id: ratingItemId,
        dimension: z.enum(RATING_KEYS),
        value: z.number().int().min(0).max(RATING_MAXIMUM).nullable(),
        rationale: z.string().max(4000).nullable(),
        citations: z.array(ratingCitationSchema).default([]),
      }),
    )
    .default([]),
  rated_by: userId,
  supersedes_id: startupRatingId.nullable().default(null),
  revision_reason: z.string().nullable().default(null),
  submitted_at: z.iso.datetime({ offset: true }).nullable().default(null),
  ...auditColumns,
});

export const startupRatingEntity = defineEntity({
  name: 'StartupRating',
  row: startupRatingRow,
  toDomain: (row): StartupRating => ({
    id: row.id,
    cycleId: row.cycle_id,
    startupId: row.startup_id,
    status: row.status,
    items: row.items,
    ratedBy: row.rated_by,
    supersedesId: row.supersedes_id,
    revisionReason: row.revision_reason,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

const ratingItemInput = z.object({
  dimension: z.enum(RATING_KEYS),
  value: z.number().int().min(0).max(RATING_MAXIMUM).nullable(),
  rationale: z.string().trim().max(4000).nullable().default(null),
  citations: z.array(ratingCitationSchema).max(20).default([]),
});

export const draftStartupRatingInput = z.object({
  startupId,
  items: z.array(ratingItemInput).max(RATING_KEYS.length),
});

export const submitStartupRatingInput = z.object({
  startupId,
  items: z
    .array(
      ratingItemInput.extend({
        value: z
          .number()
          .int()
          .min(0)
          .max(RATING_MAXIMUM, `Ratings run from 0 to ${RATING_MAXIMUM}.`),
        // The whole point. A score nobody explained cannot be defended when a
        // founder asks why they were funded less than the startup next door.
        rationale: z
          .string()
          .trim()
          .min(1, 'Say why. A rating without a reason cannot be reviewed.')
          .max(4000),
      }),
    )
    .length(RATING_KEYS.length, 'All six dimensions must be rated together.'),
  /** Required when replacing an already-submitted rating. */
  revisionReason: z.string().trim().min(1).max(2000).nullable().default(null),
});

export type DraftStartupRatingInput = z.infer<typeof draftStartupRatingInput>;
export type SubmitStartupRatingInput = z.infer<typeof submitStartupRatingInput>;
