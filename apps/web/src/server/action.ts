import 'server-only';
import type { Result } from '@relayflow/core';
import type { UseCase } from '@relayflow/logic';
import { getContext } from './context';

/**
 * The bridge from a Server Action to a use-case.
 *
 * A Server Action's job is exactly three things: build the request context,
 * call the use-case, and turn the Result into something serializable. It never
 * contains a permission check of its own — that lives in the use-case
 * definition, where it cannot be forgotten.
 *
 * Errors are filtered on the way out: internal failures become a generic
 * message so a stack trace or SQL fragment never reaches the browser.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; issues?: { path: string; message: string }[] };

export function toActionResult<T>(result: Result<T>): ActionResult<T> {
  if (result.ok) return { ok: true, data: result.data };

  const { error } = result;
  return {
    ok: false,
    code: error.code,
    message: error.isUserFacing ? error.message : 'Something went wrong. Please try again.',
    ...(Array.isArray(error.context.issues)
      ? { issues: error.context.issues as { path: string; message: string }[] }
      : {}),
  };
}

/** Wraps a use-case as a callable Server Action. */
export function action<TOutput>(useCase: UseCase<TOutput>) {
  return async (input: unknown): Promise<ActionResult<TOutput>> => {
    const ctx = await getContext();
    return toActionResult(await useCase(ctx, input));
  };
}
