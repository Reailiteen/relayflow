import { type AppError, toAppError } from './errors';

/**
 * Use-cases return Result instead of throwing.
 *
 * The point is that a caller cannot ignore the failure branch by accident: to
 * read `.data` you must first narrow on `.ok`. Throwing is reserved for
 * genuinely exceptional conditions (bugs, unreachable states).
 */
export type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

export const ok = <T>(data: T): Result<T, never> => ({ ok: true, data });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Runs a throwing function and captures the failure as an AppError. */
export async function attempt<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (cause) {
    return err(toAppError(cause));
  }
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.data)) : result;
}

export async function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>> | Result<U, E>,
): Promise<Result<U, E>> {
  return result.ok ? await fn(result.data) : result;
}

/**
 * Escape hatch for call sites that genuinely cannot continue — route handlers
 * that map errors to responses, and tests. Do not use it to skip handling.
 */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.data;
  throw result.error;
}
