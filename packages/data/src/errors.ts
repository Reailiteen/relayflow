import type { PostgrestError } from '@supabase/supabase-js';
import { type AppError, conflict, forbidden, internal, notFound, validation } from '@relayflow/core';

/**
 * Postgres error codes, translated once.
 *
 * Without this, an RLS denial arrives as a generic failure and gets logged as a
 * 500 — so the one signal that actually indicates an authorization problem gets
 * buried in noise.
 */
export function fromPostgrest(error: PostgrestError, context: Record<string, unknown> = {}): AppError {
  const detail = { ...context, pgCode: error.code, pgDetail: error.details };

  switch (error.code) {
    case '23505': // unique_violation
      return conflict('That already exists.', { context: detail, cause: error });
    case '23503': // foreign_key_violation
      return validation('A referenced record is missing.', { context: detail, cause: error });
    case '23514': // check_violation
      return validation('That change violates a data rule.', { context: detail, cause: error });
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return conflict('Someone changed this at the same time. Try again.', {
        context: detail,
        cause: error,
      });
    case '42501': // insufficient_privilege — an RLS policy refused the statement
      return forbidden('You do not have access to this record.', { context: detail, cause: error });
    case 'PGRST116': // .single() matched zero rows, often because RLS hid them
      return notFound('Not found.', { context: detail, cause: error });
    default:
      return internal('The database rejected this request.', { context: detail, cause: error });
  }
}
