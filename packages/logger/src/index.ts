/**
 * Structured logging with redaction on by default.
 *
 * The transport is injected, so web (Sentry/console), mobile, and tests all use
 * the same call sites. Redaction happens here rather than at each call site
 * because "remember not to log the token" is not a control.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger that stamps these fields onto every subsequent entry. */
  child(fields: LogFields): Logger;
}

export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: LogFields;
}

export type Transport = (record: LogRecord) => void;

/** Keys whose values are replaced wherever they appear, at any depth. */
const REDACTED_KEYS = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'apikey',
  'api_key',
  'secret',
  'service_role_key',
  'ssn',
  'dob',
  'date_of_birth',
];

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.includes(key.toLowerCase()) ? '[redacted]' : redact(item, depth + 1);
  }
  return out;
}

export const consoleTransport: Transport = (record) => {
  const line = JSON.stringify({ level: record.level, msg: record.message, ...record.fields });
  if (record.level === 'error') console.error(line);
  else if (record.level === 'warn') console.warn(line);
  // eslint-disable-next-line no-console -- the console transport is the point
  else console.log(line);
};

export interface LoggerOptions {
  readonly transport?: Transport;
  readonly minLevel?: LogLevel;
  readonly base?: LogFields;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const transport = options.transport ?? consoleTransport;
  const minLevel = options.minLevel ?? 'info';
  const base = options.base ?? {};

  const emit = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    transport({
      level,
      message,
      fields: redact({ ...base, ...fields }) as LogFields,
    });
  };

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger({ ...options, base: { ...base, ...fields } }),
  };
}

/** Discards everything. Use in tests so assertions are not drowned in output. */
export const silentLogger: Logger = createLogger({ transport: () => undefined, minLevel: 'error' });
