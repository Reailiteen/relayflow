import { err, ok } from '@relayflow/core';
import { positionEntity, positionIntentEntity } from '@relayflow/entities';
import type { CreatePositionCommand, PositionIntentPort, PositionPort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { fromPostgrest } from '../errors';
import { run, runMaybe, runSingle } from '../repository';
import { callRpc } from '../transaction';

/** Positions, and the readiness answers they grow out of. */

/** The jsonb payload `create_position` and `update_position_details` take. */
function positionPayload(input: CreatePositionCommand): Record<string, unknown> {
  return {
    cycleId: input.cycleId,
    startupId: input.startupId,
    intentId: input.intentId ?? null,
    title: input.title,
    description: input.description,
    requiredSkills: input.requiredSkills,
    workArrangement: input.workArrangement,
    additionalRequirements: input.additionalRequirements,
    internCount: input.internCount,
    hoursPerIntern: input.hoursPerIntern,
    durationWeeks: input.durationWeeks,
    supervisorName: input.supervisorName,
    status: input.status ?? 'draft',
    redistributionRoundId: input.redistributionRoundId,
  };
}

export function positionsRepository(client: RlsClient): PositionPort {
  return {
    findById: (id) =>
      runMaybe(client.from('positions').select('*').eq('id', id).maybeSingle(), positionEntity.parse, {
        table: 'positions',
        positionId: id,
      }),

    listForCycle: (cycleId) =>
      run(
        client.from('positions').select('*').eq('cycle_id', cycleId).order('created_at'),
        positionEntity.parseMany,
        { table: 'positions', cycleId },
      ),

    listForStartup: (cycleId, startupId) =>
      run(
        client
          .from('positions')
          .select('*')
          .eq('cycle_id', cycleId)
          .eq('startup_id', startupId)
          .order('created_at'),
        positionEntity.parseMany,
        { table: 'positions', cycleId, startupId },
      ),

    // A submitted position also writes its first review-history row, so both
    // of these are functions rather than plain inserts.
    create: (input) =>
      callRpc(client, 'create_position', { p_position: positionPayload(input) }, positionEntity.parse),

    updateDetails: (id, input) =>
      callRpc(
        client,
        'update_position_details',
        { p_position_id: id, p_position: positionPayload(input) },
        positionEntity.parse,
      ),

    /**
     * The state machine, enforced in SQL.
     *
     * `transition_position` decides who may make which move: a startup takes
     * its own position through draft → submitted → resubmitted, and everything
     * past that is QSTP's. That split is what stops a startup approving its own
     * posting, and it cannot live in the app because the app is not the only
     * thing that can reach the table.
     */
    updateStatus: (id, status, reviewNote) =>
      callRpc(
        client,
        'transition_position',
        { p_position_id: id, p_to_status: status, p_note: reviewNote },
        positionEntity.parse,
      ),
  };
}

export function positionIntentsRepository(client: RlsClient): PositionIntentPort {
  return {
    listForCycle: (cycleId) =>
      run(
        client.from('position_intents').select('*').eq('cycle_id', cycleId),
        positionIntentEntity.parseMany,
        { table: 'position_intents', cycleId },
      ),

    listForStartup: (cycleId, startupId) =>
      run(
        client
          .from('position_intents')
          .select('*')
          .eq('cycle_id', cycleId)
          .eq('startup_id', startupId),
        positionIntentEntity.parseMany,
        { table: 'position_intents', cycleId, startupId },
      ),

    // Single table, and `position_intents_write` already permits the startup —
    // so no function is needed and none is invented.
    save: (input) =>
      runSingle(
        client
          .from('position_intents')
          .upsert({
            ...(input.id ? { id: input.id } : {}),
            cycle_id: input.cycleId,
            startup_id: input.startupId,
            title: input.title,
            category: input.category,
            expected_deliverable: input.expectedDeliverable,
            learning_outcomes: [...input.learningOutcomes],
            work_mode: input.workMode,
            supervisor_name: input.supervisorName,
            supervisor_id: input.supervisorId,
            weekly_supervision_minutes: input.weeklySupervisionMinutes,
            maximum_interns: input.maximumInterns,
            resources_ready: input.resourcesReady,
            onboarding_ready: input.onboardingReady,
            submitted_by: input.submittedBy,
            submitted_at: input.submittedAt,
          })
          .select('*')
          .single(),
        positionIntentEntity.parse,
        { table: 'position_intents', cycleId: input.cycleId, startupId: input.startupId },
      ),

    withdraw: async (id) => {
      const { error } = await client.from('position_intents').delete().eq('id', id);
      if (error) return err(fromPostgrest(error, { table: 'position_intents', intentId: id }));
      return ok(undefined);
    },
  };
}
