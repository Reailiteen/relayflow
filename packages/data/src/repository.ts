import type { PostgrestError } from '@supabase/supabase-js';
import { err, ok, type Result } from '@relayflow/core';
import { fromPostgrest } from './errors';

/**
 * Shared plumbing for repositories: run a PostgREST query, translate the error,
 * and parse the rows through their entity schema so nothing untyped escapes
 * this layer.
 */
interface PostgrestResponse<T> {
  data: T | null;
  error: PostgrestError | null;
}

export async function run<TRow, TDomain>(
  query: PromiseLike<PostgrestResponse<TRow[]>>,
  parse: (rows: readonly unknown[]) => TDomain[],
  context: Record<string, unknown> = {},
): Promise<Result<TDomain[]>> {
  const { data, error } = await query;
  if (error) return err(fromPostgrest(error, context));
  return ok(parse(data ?? []));
}

export async function runSingle<TRow, TDomain>(
  query: PromiseLike<PostgrestResponse<TRow>>,
  parse: (row: unknown) => TDomain,
  context: Record<string, unknown> = {},
): Promise<Result<TDomain>> {
  const { data, error } = await query;
  if (error) return err(fromPostgrest(error, context));
  if (data === null) return err(fromPostgrest({ code: 'PGRST116' } as PostgrestError, context));
  return ok(parse(data));
}

/** Same as runSingle, but a missing row is a valid answer rather than an error. */
export async function runMaybe<TRow, TDomain>(
  query: PromiseLike<PostgrestResponse<TRow>>,
  parse: (row: unknown) => TDomain,
  context: Record<string, unknown> = {},
): Promise<Result<TDomain | null>> {
  const { data, error } = await query;
  if (error) {
    if (error.code === 'PGRST116') return ok(null);
    return err(fromPostgrest(error, context));
  }
  return ok(data === null ? null : parse(data));
}
