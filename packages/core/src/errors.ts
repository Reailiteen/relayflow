/**
 * One error taxonomy for the whole system.
 *
 * Every layer throws or returns these, and exactly one place per client turns
 * them into an HTTP status or a toast. That keeps a `forbidden` from silently
 * rendering as a generic 500 — the failure mode that makes authorization bugs
 * invisible in logs.
 */

export const ERROR_CODES = [
  'unauthenticated', // no valid session
  'forbidden', // authenticated, but policy said no
  'not_found', // absent, or hidden from this actor on purpose
  'conflict', // optimistic-concurrency or uniqueness violation
  'validation', // input failed a schema or invariant check
  'rate_limited',
  'upstream', // a third party failed us
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Codes safe to surface verbatim to an end user. */
const USER_FACING = new Set<ErrorCode>([
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'validation',
  'rate_limited',
]);

export interface AppErrorOptions {
  /** Structured detail for logs. Never put secrets or PHI in here. */
  readonly context?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.context = options.context ?? {};
  }

  /**
   * Whether this message can be shown as-is. Internal and upstream failures get
   * a generic string instead, so we never leak a stack trace or a query into UI.
   */
  get isUserFacing(): boolean {
    return USER_FACING.has(this.code);
  }

  static is(value: unknown): value is AppError {
    return value instanceof AppError;
  }
}

export const unauthenticated = (message = 'Sign in to continue.', o?: AppErrorOptions) =>
  new AppError('unauthenticated', message, o);

export const forbidden = (message = 'You do not have access to this.', o?: AppErrorOptions) =>
  new AppError('forbidden', message, o);

export const notFound = (message = 'Not found.', o?: AppErrorOptions) =>
  new AppError('not_found', message, o);

export const conflict = (message: string, o?: AppErrorOptions) =>
  new AppError('conflict', message, o);

export const validation = (message: string, o?: AppErrorOptions) =>
  new AppError('validation', message, o);

export const internal = (message = 'Something went wrong.', o?: AppErrorOptions) =>
  new AppError('internal', message, o);

/** Normalizes anything thrown into an AppError so callers can rely on `.code`. */
export function toAppError(value: unknown): AppError {
  if (AppError.is(value)) return value;
  if (value instanceof Error) {
    return new AppError('internal', value.message, { cause: value });
  }
  return new AppError('internal', 'Unknown error', { context: { thrown: String(value) } });
}
