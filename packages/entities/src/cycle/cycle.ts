import { z } from 'zod';
import { defineEntity, auditColumns } from '../shared/entity';
import { cycleId, type CycleId } from '../shared/ids';

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
  'redistribution', // reclaiming unused hours and re-allocating
  'onboarding', // documents, verification, contracts
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
  /** Deadlines by the stage they close. Drives every reminder and escalation. */
  readonly deadlines: CycleDeadlines;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CycleDeadlines {
  readonly positionSubmission: string;
  readonly candidateSelection: string;
  readonly documentSubmission: string;
}

const deadlines = z.object({
  positionSubmission: z.iso.datetime({ offset: true }),
  candidateSelection: z.iso.datetime({ offset: true }),
  documentSubmission: z.iso.datetime({ offset: true }),
});

export const cycleRow = z.object({
  id: cycleId,
  name: z.string().min(1).max(200),
  stage: cycleStage,
  starts_on: z.iso.date(),
  ends_on: z.iso.date(),
  funded_weekly_hours: z.number().int().min(0),
  deadlines,
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
    deadlines: row.deadlines,
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
  });

export type CreateCycleInput = z.infer<typeof createCycleInput>;
