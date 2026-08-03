import { conflict, err, ok, type AppError, type Result } from '@relayflow/core';
import { fromPostgrest } from '../../errors';
import type { RlsClient } from '../../client';

/**
 * Calling a function whose NULL return is an answer, not an absence.
 *
 * `reserve_candidate` catches the unique violation on
 * `selections_one_live_per_candidate_idx`, writes a `selection_conflicts` row,
 * and returns NULL — deliberately, because re-raising would roll the conflict
 * row back with everything else, and the conflict record is the entire point.
 *
 * PostgREST surfaces that as `{ data: null, error: null }`. Handing it to an
 * entity's `parse` would throw "database row did not match its schema", which
 * reads like a missing migration and sends whoever is debugging it to entirely
 * the wrong place. So NULL is translated here, once, into the domain error it
 * actually means.
 */
export async function rpcOrConflict<T>(
  client: RlsClient,
  fn: string,
  args: Record<string, unknown>,
  parse: (value: unknown) => T,
  onNull: () => AppError,
): Promise<Result<T>> {
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) return err(fromPostgrest(error, { rpc: fn }));
  if (data === null) return err(onNull());
  return ok(parse(data));
}

/**
 * The `conflict` a duplicate write should produce.
 *
 * Postgres reports both "somebody else holds this candidate" and "you already
 * made this exact offer" as 23505, and `fromPostgrest` maps that to a generic
 * "That already exists." The two need different words in front of a user, and
 * the RPC has already told them apart — this just carries the distinction.
 */
export function duplicateSelection(message: string, context: Record<string, unknown>): AppError {
  return conflict(message, { context });
}
