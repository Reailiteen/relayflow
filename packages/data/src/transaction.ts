import { err, ok, type Result } from '@relayflow/core';
import type { RlsClient } from './client';
import { fromPostgrest } from './errors';

/**
 * Atomic multi-write.
 *
 * PostgREST gives one transaction per request, so a use-case that issues three
 * `.insert()` calls has three independent transactions — and a failure on the
 * third leaves the first two committed. The audit found exactly this pattern in
 * booking and payment flows.
 *
 * The rule here: **if a workflow writes to more than one table, it is a Postgres
 * function**, defined in supabase/migrations and invoked through this wrapper.
 * The function runs under the caller's RLS context (SECURITY INVOKER), so
 * moving work into SQL does not smuggle in extra privilege.
 */
export async function callRpc<TResult>(
  client: RlsClient,
  fn: string,
  args: Record<string, unknown>,
  parse: (value: unknown) => TResult,
): Promise<Result<TResult>> {
  // Cast to never: the generated Functions map keys `rpc` to literal names, and
  // this wrapper is deliberately generic over all of them. The call site names
  // the function, and `parse` validates whatever comes back.
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) return err(fromPostgrest(error, { rpc: fn }));
  return ok(parse(data));
}
