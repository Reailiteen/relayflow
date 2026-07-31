import { z } from 'zod';

/**
 * The entity contract.
 *
 * Postgres speaks snake_case rows; the app speaks camelCase domain objects.
 * Defining both halves in one place — plus the mapping between them — means a
 * column rename breaks the build instead of silently producing `undefined`
 * fields at runtime.
 *
 *   defineEntity({ name, row, toDomain })
 *     .row      parse untrusted DB output
 *     .toDomain map row -> domain
 *     .parse    do both, throwing on drift
 */
export interface EntityDefinition<TRow extends z.ZodTypeAny, TDomain> {
  readonly name: string;
  readonly row: TRow;
  readonly toDomain: (row: z.infer<TRow>) => TDomain;
  readonly parse: (value: unknown) => TDomain;
  readonly parseMany: (values: readonly unknown[]) => TDomain[];
}

export function defineEntity<TRow extends z.ZodTypeAny, TDomain>(config: {
  name: string;
  row: TRow;
  toDomain: (row: z.infer<TRow>) => TDomain;
}): EntityDefinition<TRow, TDomain> {
  const parse = (value: unknown): TDomain => {
    const result = config.row.safeParse(value);
    if (!result.success) {
      // Schema drift between the database and the app is a deploy-ordering bug.
      // Naming the entity here makes it obvious which migration is missing.
      throw new Error(
        `${config.name}: database row did not match its schema — ${result.error.issues
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`,
      );
    }
    return config.toDomain(result.data);
  };

  return {
    name: config.name,
    row: config.row,
    toDomain: config.toDomain,
    parse,
    parseMany: (values) => values.map(parse),
  };
}

/** Columns every table carries. Kept here so they are declared exactly once. */
export const auditColumns = {
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
};

export const softDeleteColumns = {
  deleted_at: z.iso.datetime({ offset: true }).nullable(),
};
