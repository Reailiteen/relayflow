import type { Repositories } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { cyclesRepository, participationRepository } from './cycles';
import { allocationsRepository, startupsRepository } from './startups';
import { positionIntentsRepository, positionsRepository } from './positions';
import { candidatesRepository, interviewsRepository, tasksRepository } from './candidates';
import {
  conflictsRepository,
  exceptionsRepository,
  fallbacksRepository,
  selectionsRepository,
} from './selection';
import {
  documentsRepository,
  placementsRepository,
  requirementsRepository,
} from './onboarding';
import {
  activityRepository,
  notificationsRepository,
  recoveryRepository,
} from './operations';
import { prioritizationRepository, ratingsRepository } from './prioritisation';
import {
  notificationPreferencesRepository,
  reminderRulesRepository,
} from './reminders';

/**
 * The Supabase adapter.
 *
 * Takes an RLS-bound client and nothing else — no actor parameter, no
 * service-role escape hatch. Who the caller is comes from the JWT the client
 * carries, and every policy in 0009 reads it through `auth.uid()`. A repository
 * that accepted an actor id would be a repository that could be lied to.
 *
 * The layout mirrors `@relayflow/ports` and, deliberately, the fixtures adapter:
 * `repositories/selection.ts` should be diffable against the corresponding
 * section of `packages/fixtures/src/repositories.ts`, because the two must agree
 * about what the product does. Where they cannot agree, the divergence is
 * commented at the point it happens — mostly server-derived actors and
 * timestamps, and the places this adapter is deliberately the stricter of the
 * two.
 */
export function createRepositories(client: RlsClient): Repositories {
  return {
    cycles: cyclesRepository(client),
    startups: startupsRepository(client),
    allocations: allocationsRepository(client),
    positions: positionsRepository(client),
    candidates: candidatesRepository(client),
    selections: selectionsRepository(client),
    exceptions: exceptionsRepository(client),
    interviews: interviewsRepository(client),
    documents: documentsRepository(client),
    participation: participationRepository(client),
    positionIntents: positionIntentsRepository(client),
    ratings: ratingsRepository(client),
    prioritization: prioritizationRepository(client),
    activity: activityRepository(client),
    tasks: tasksRepository(client),
    placements: placementsRepository(client),
    requirements: requirementsRepository(client),
    recovery: recoveryRepository(client),
    conflicts: conflictsRepository(client),
    fallbacks: fallbacksRepository(client),
    notifications: notificationsRepository(client),
    reminderRules: reminderRulesRepository(client),
    notificationPreferences: notificationPreferencesRepository(client),
  };
}
