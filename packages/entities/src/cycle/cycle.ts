import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import { cycleId, type CycleId } from '../shared/ids';
import { selectionMode, type SelectionMode } from '../selection/selection';

/**
 * An internship cycle: the container everything else hangs off.
 *
 * Almost every question in this product is really "…in which cycle?", so the
 * cycle id is a required part of most queries. Modelling it explicitly (rather
 * than assuming "the current one") is what makes it possible to run a cycle
 * while last one is still being reported on.
 */

/**
 * Stages run in order, and the current stage decides what the UI offers. They
 * are not merely labels: a startup cannot submit positions before `positions`
 * opens, and redistribution cannot begin until selection has closed.
 */
export const CYCLE_STAGES = [
  'draft', // being set up; nothing visible to startups yet
  'allocation', // QSTP scoring startups and assigning tiers
  'positions', // funded startups submitting roles
  'selection', // pools handed over; interviews and selections happening
  'completion', // recovery, redistribution and onboarding run independently here
  'closed',
] as const;

export const cycleStage = z.enum(CYCLE_STAGES);
export type CycleStage = (typeof CYCLE_STAGES)[number];

export function stageIndex(stage: CycleStage): number {
  return CYCLE_STAGES.indexOf(stage);
}

/** Whether `stage` has been reached — for "is this open yet?" checks. */
export function hasReached(current: CycleStage, stage: CycleStage): boolean {
  return stageIndex(current) >= stageIndex(stage);
}

export interface Cycle {
  readonly id: CycleId;
  readonly name: string;
  readonly stage: CycleStage;
  readonly startsOn: string;
  readonly endsOn: string;
  /** Total funded weekly hours. The ceiling every allocation is checked against. */
  readonly fundedWeeklyHours: number;
  /**
   * How candidates are won this cycle. One setting for the whole programme:
   * running two modes at once would mean explaining to a startup why Select
   * behaved differently on two candidates in the same pool.
   */
  readonly selectionMode: SelectionMode;
  /** Deadlines by the stage they close. Drives every reminder and escalation. */
  readonly deadlines: CycleDeadlines;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CycleDeadlines {
  readonly positionSubmission: string;
  readonly candidateSelection: string;
  readonly documentSubmission: string;
  /**
   * When offers stop being open for the candidate to choose between.
   *
   * Null under `first_come`, where there are no offers to close — the nullable
   * type is what says "this cycle does not have one" rather than leaving a date
   * sitting there meaning nothing.
   *
   * It closes *before* `candidateSelection` because what happens next needs
   * room: the earliest offer is asked whether they still want the candidate,
   * and that conversation cannot start after selection has already shut.
   */
  readonly offerWindow: string | null;
}

const deadlines = z.object({
  positionSubmission: z.iso.datetime({ offset: true }),
  candidateSelection: z.iso.datetime({ offset: true }),
  documentSubmission: z.iso.datetime({ offset: true }),
  offerWindow: z.iso.datetime({ offset: true }).nullable().default(null),
});

export const cycleRow = z.object({
  id: cycleId,
  name: z.string().min(1).max(200),
  stage: cycleStage,
  starts_on: z.iso.date(),
  ends_on: z.iso.date(),
  funded_weekly_hours: z.number().int().min(0),
  selection_mode: selectionMode,
  deadlines,
  archived_at: z.iso.datetime({ offset: true }).nullable().default(null),
  ...auditColumns,
});

export const cycleEntity = defineEntity({
  name: 'Cycle',
  row: cycleRow,
  toDomain: (row): Cycle => ({
    id: row.id,
    name: row.name,
    stage: row.stage,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    fundedWeeklyHours: row.funded_weekly_hours,
    selectionMode: row.selection_mode,
    deadlines: row.deadlines,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
});

export const createCycleInput = z
  .object({
    name: z.string().trim().min(1, 'Give the cycle a name.').max(200),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    fundedWeeklyHours: z
      .number()
      .int('Hours must be a whole number.')
      .min(1, 'A cycle needs at least one funded hour.'),
    selectionMode: selectionMode.default('first_come'),
    deadlines,
  })
  .refine((c) => c.startsOn < c.endsOn, {
    message: 'The cycle must end after it starts.',
    path: ['endsOn'],
  })
  .refine((c) => c.deadlines.positionSubmission < c.deadlines.candidateSelection, {
    // Selecting candidates for positions that have not been submitted yet is
    // not a state the workflow can represent, so it is refused at the source.
    message: 'Positions must close before selection does.',
    path: ['deadlines', 'candidateSelection'],
  })
  .refine((c) => c.deadlines.candidateSelection < c.deadlines.documentSubmission, {
    message: 'Selection must close before documents are due.',
    path: ['deadlines', 'documentSubmission'],
  })
  .refine((c) => c.selectionMode !== 'candidate_choice' || c.deadlines.offerWindow !== null, {
    // Without a closing date a candidate sitting on three offers stalls three
    // startups indefinitely, which is the failure mode the window exists for.
    message: 'A candidate-choice cycle needs a date for offers to close.',
    path: ['deadlines', 'offerWindow'],
  })
  .refine(
    (c) =>
      c.deadlines.offerWindow === null ||
      (c.deadlines.positionSubmission < c.deadlines.offerWindow &&
        c.deadlines.offerWindow < c.deadlines.candidateSelection),
    {
      // The gap after the window is not slack: it is when the earliest offer is
      // asked whether they still want the candidate.
      message: 'Offers must close after positions do, and before selection does.',
      path: ['deadlines', 'offerWindow'],
    },
  );

export type CreateCycleInput = z.infer<typeof createCycleInput>;
