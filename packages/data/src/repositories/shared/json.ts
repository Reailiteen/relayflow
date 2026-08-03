import type { Json } from '../../generated/database.types';

/**
 * A domain value that is already JSON, said in a way `Json` accepts.
 *
 * `Json` requires an index signature; a domain interface like `CycleDeadlines`
 * has named fields and no index signature, so TypeScript refuses the assignment
 * even though every value in it is a string. The mismatch is structural, not
 * semantic.
 *
 * One narrow helper rather than a cast at each call site: there are a handful
 * of jsonb columns and each of them would otherwise grow its own `as unknown
 * as Json`, which is the kind of thing that spreads. If a caller ever passes
 * something genuinely unserialisable — a Date, a Map — Postgres rejects it at
 * the point of the write, which is where a bad value should surface anyway.
 */
export function asJson(value: unknown): Json {
  return value as Json;
}
