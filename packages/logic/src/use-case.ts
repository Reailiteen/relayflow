import type { z } from 'zod';
import { err, ok, toAppError, unauthenticated, validation, type Result } from '@relayflow/core';
import { authorize, isAuthenticated, type AccessQuery, type Actor } from '@relayflow/access';
import type { UseCaseContext } from './context';

/**
 * Every write and every non-trivial read in the system is a use-case defined
 * here, and `authorize` is a required field of that definition.
 *
 * This is the structural answer to the audit's central finding. Previously the
 * check was a convention — a line you were supposed to remember to write at the
 * top of each Server Action — and the ones that were forgotten were invisible.
 * Now a use-case without an authorization rule does not typecheck. Genuinely
 * public entry points must say `authorize: PUBLIC`, which is greppable and
 * shows up in review as a deliberate choice.
 *
 * Order is fixed and not up to the author: parse input, authorize, execute.
 * Authorization never runs against unvalidated input, and execution never runs
 * against an unauthorized actor.
 */

/** Explicit opt-out for genuinely unauthenticated entry points. */
export interface PublicAccess {
  readonly kind: 'public';
  readonly justification: string;
}

export const PUBLIC = (justification: string): PublicAccess => ({
  kind: 'public',
  justification,
});

/**
 * A signed-in user, with no tenant-scoped capability required. Correct only for
 * actions that create or read something belonging to the actor alone.
 */
export interface AuthenticatedAccess {
  readonly kind: 'authenticated';
}

export const AUTHENTICATED: AuthenticatedAccess = { kind: 'authenticated' };

export type AccessRule = AccessQuery | PublicAccess | AuthenticatedAccess | Result<void>;

export type AuthorizationRule<TInput> =
  | AccessQuery
  | PublicAccess
  | AuthenticatedAccess
  | ((ctx: UseCaseContext, input: TInput) => AccessRule);

export interface UseCaseDefinition<TSchema extends z.ZodTypeAny, TOutput> {
  /** Dotted name, e.g. "organizations.create". Used in logs and traces. */
  readonly name: string;
  readonly input: TSchema;
  /** Not optional. See the note above. */
  readonly authorize: AuthorizationRule<z.infer<TSchema>>;
  readonly execute: (ctx: UseCaseContext, input: z.infer<TSchema>) => Promise<Result<TOutput>>;
}

/**
 * Note the input is `unknown`: a use-case is called across a network boundary
 * (Server Action, route handler) where the caller cannot be trusted to have
 * validated anything. Parsing is the use-case's own first step.
 */
export type UseCase<TOutput> = (
  ctx: UseCaseContext,
  rawInput: unknown,
) => Promise<Result<TOutput>>;

export function defineUseCase<TSchema extends z.ZodTypeAny, TOutput>(
  definition: UseCaseDefinition<TSchema, TOutput>,
): UseCase<TOutput> {
  return async function run(ctx, rawInput) {
    const logger = ctx.logger.child({ useCase: definition.name });

    // 1. Parse. Input from a client is untrusted regardless of what the caller
    //    claims to have already checked.
    const parsed = definition.input.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      logger.warn('input rejected', { issues });
      return err(validation('Some fields need attention.', { context: { issues } }));
    }
    const input = parsed.data;

    // 2. Authorize, against the parsed input.
    const rule =
      typeof definition.authorize === 'function'
        ? definition.authorize(ctx, input)
        : definition.authorize;

    const decision = evaluate(ctx, rule);
    if (decision && !decision.ok) {
      logger.warn('access denied', { code: decision.error.code, ...decision.error.context });
      return decision;
    }

    // 3. Execute. Unexpected throws become AppErrors so callers keep one shape.
    try {
      const result = await definition.execute(ctx, input);
      if (!result.ok) {
        logger.warn('use case failed', { code: result.error.code, ...result.error.context });
      }
      return result;
    } catch (cause) {
      const error = toAppError(cause);
      logger.error('use case threw', { code: error.code, message: error.message });
      return err(error);
    }
  };
}

/** Returns null when the rule permits the call, or the denial to return. */
function evaluate(ctx: UseCaseContext, rule: AccessRule): Result<void> | null {
  if ('kind' in rule) {
    if (rule.kind === 'public') return null;
    return isAuthenticated(ctx.actor) ? null : err(unauthenticated());
  }
  if ('ok' in rule) return rule.ok ? null : rule;
  const decision = authorize(ctx.actor, rule);
  return decision.ok ? null : decision;
}

/**
 * Narrows the context's actor inside `execute`. Use it whenever a use-case
 * needs the caller's identity — it makes the authenticated assumption explicit
 * to the compiler instead of leaving it implied by the authorize rule.
 */
export function requireActor(ctx: UseCaseContext): Result<Actor> {
  return isAuthenticated(ctx.actor) ? ok(ctx.actor) : err(unauthenticated());
}

export { ok, err };
