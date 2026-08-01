import {
  toEnginePosition,
  toEngineRatings,
  type Cycle,
  type CycleParticipation,
  type PositionIntent,
  type Startup,
  type StartupRating,
} from '@relayflow/entities';
import {
  DEFAULT_POLICY,
  type AllocationMode,
  type Extraction,
  type PortfolioInput,
  type PortfolioStartupInput,
} from '@relayflow/prioritisation';

/**
 * relayflow rows in, engine vocabulary out.
 *
 * This is the only place the two type systems meet. The engine deliberately
 * knows nothing about branded ids or storage, which is what keeps its golden
 * replay fixture meaningful — so the translation is concentrated here rather
 * than smeared across the use-case.
 */

export interface EngineInputSources {
  readonly cycle: Cycle;
  readonly startups: readonly Startup[];
  readonly participations: readonly CycleParticipation[];
  readonly intents: readonly PositionIntent[];
  readonly ratings: readonly StartupRating[];
  readonly mode?: AllocationMode;
}

/**
 * Build the evidence bundle for one startup.
 *
 * Returns `null` when the startup has declared nothing at all. That is not the
 * same as declaring something unusable: a null extraction becomes
 * `needs_information` ("we have nothing to evaluate"), while a submitted but
 * inadequate role becomes `not_ready` ("we looked, and it does not qualify").
 * Two different pieces of work for two different people.
 */
function extractionFor(intents: readonly PositionIntent[]): Extraction | null {
  const submitted = intents.filter((intent) => intent.submittedAt !== null);
  if (submitted.length === 0) return null;

  return {
    fields: [
      {
        fieldPath: 'positions',
        status: 'supported',
        resolvedValue: submitted.map(toEnginePosition),
      },
      {
        // Platform history is not derived yet. The engine reads a non-supported
        // field as "no history" and awards a visible neutral 5 of 10 rather
        // than a zero — honest for a first cycle, since there is no prior cycle
        // to derive anything from. Replace this once one has closed.
        fieldPath: 'platformHistory',
        status: 'not_applicable',
        resolvedValue: null,
      },
    ],
  };
}

export function buildEngineInput({
  cycle,
  startups,
  participations,
  intents,
  ratings,
  mode = 'priority',
}: EngineInputSources): PortfolioInput {
  const namesById = new Map(startups.map((startup) => [startup.id, startup.name]));

  const engineStartups: PortfolioStartupInput[] = participations
    // A startup that declined or was archived is not part of this cohort, and
    // including it would dilute every share the allocator computes.
    .filter((row) => row.status === 'accepted')
    .map((row): PortfolioStartupInput => {
      const own = intents.filter((intent) => intent.startupId === row.startupId);
      const rating = ratings.find(
        (candidate) => candidate.startupId === row.startupId && candidate.status === 'submitted',
      );
      return {
        startupId: row.startupId,
        startupName: namesById.get(row.startupId) ?? row.startupId,
        extraction: extractionFor(own),
        // A draft rating is not a rating. Passing an incomplete one would score
        // a startup on the dimensions somebody happened to fill in first.
        qstpRatings: rating ? toEngineRatings(rating) : null,
      };
    });

  return {
    cycle: {
      cycleId: cycle.id,
      budgetHours: cycle.fundedWeeklyHours,
      submissionCutoffDate: cycle.deadlines.positionSubmission.slice(0, 10),
    },
    startups: engineStartups,
    policy: DEFAULT_POLICY,
    allocation: { mode },
  };
}
