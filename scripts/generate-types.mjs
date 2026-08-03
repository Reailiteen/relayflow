#!/usr/bin/env node
//
// Turns the catalog dump from scripts/introspect.sql into the `Database` type
// that `SupabaseClient<Database>` is parameterised by.
//
// Reads the JSON on stdin, writes TypeScript on stdout. Driven by
// scripts/generate-types.sh — see the header there for why this exists rather
// than `supabase gen types`.

import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(0, 'utf8'));

// ---------------------------------------------------------------------------
// Postgres types -> TypeScript
// ---------------------------------------------------------------------------

const SCALARS = {
  bool: 'boolean',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  float4: 'number',
  float8: 'number',
  // PostgREST serialises numeric as a JSON number, not a string.
  numeric: 'number',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  uuid: 'string',
  date: 'string',
  time: 'string',
  timetz: 'string',
  timestamp: 'string',
  timestamptz: 'string',
  json: 'Json',
  jsonb: 'Json',
  bytea: 'string',
  inet: 'string',
  interval: 'string',
};

const enumRef = (name) => `Database["public"]["Enums"]["${name}"]`;

function tsType(type) {
  // Arrays: `_text` with typcategory 'A' and an element type.
  if (type.category === 'A' && type.element) {
    return `${tsType({ name: type.element, kind: type.elementKind })}[]`;
  }
  // Domains — `hour_tier` is an integer with a CHECK. The check does not survive
  // into the type system, which is why every write still parses through the
  // zod `hourTier` union in @relayflow/entities.
  if (type.kind === 'd' && type.base) {
    return tsType({ name: type.base, kind: type.baseKind });
  }
  if (type.kind === 'e') return enumRef(type.name);
  return SCALARS[type.name] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Function signatures
// ---------------------------------------------------------------------------

const NO_ARGS = 'Record<PropertyKey, never>';

/** `p_cycle_id uuid, p_hours hour_tier DEFAULT NULL::hour_tier` -> Args object. */
function parseArguments(signature, byName) {
  if (!signature.trim()) return NO_ARGS;

  const parts = splitTopLevel(signature);
  const fields = parts.map((raw) => {
    const arg = raw.trim().replace(/^(VARIADIC|OUT|INOUT|IN)\s+/i, '');
    const optional = / DEFAULT /i.test(arg);
    const withoutDefault = arg.split(/ DEFAULT /i)[0].trim();
    const space = withoutDefault.indexOf(' ');
    if (space < 0) return null;
    const name = withoutDefault.slice(0, space);
    const sqlType = withoutDefault.slice(space + 1).trim();
    return `          ${name}${optional ? '?' : ''}: ${sqlTypeToTs(sqlType, byName)};`;
  });

  // A parameter we cannot name — an unnamed positional argument — makes the
  // whole signature uncallable through `.rpc()`, so say so rather than emit a
  // half-typed object somebody would trust.
  if (fields.some((f) => f === null)) return NO_ARGS;
  return `{\n${fields.join('\n')}\n        }`;
}

/** Splits on commas that are not inside parentheses or brackets. */
function splitTopLevel(input) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current);
  return out;
}

const SQL_ALIASES = {
  'character varying': 'varchar',
  'timestamp with time zone': 'timestamptz',
  'timestamp without time zone': 'timestamp',
  'time with time zone': 'timetz',
  'time without time zone': 'time',
  'double precision': 'float8',
  integer: 'int4',
  smallint: 'int2',
  bigint: 'int8',
  boolean: 'bool',
  real: 'float4',
  character: 'bpchar',
};

function sqlTypeToTs(sqlType, byName) {
  const cleaned = sqlType.replace(/\(.*\)/, '').trim().toLowerCase();
  if (cleaned.endsWith('[]')) {
    return `${sqlTypeToTs(cleaned.slice(0, -2), byName)}[]`;
  }
  const name = SQL_ALIASES[cleaned] ?? cleaned;
  if (byName.enums.has(name)) return enumRef(name);
  if (byName.domains.has(name)) return byName.domains.get(name);
  if (byName.tables.has(name)) return `Database["public"]["Tables"]["${name}"]["Row"]`;
  return SCALARS[name] ?? 'unknown';
}

function parseReturns(fn, byName) {
  const raw = fn.returns.trim();
  const setof = /^SETOF\s+/i.test(raw);
  const inner = raw.replace(/^SETOF\s+/i, '').trim();

  if (/^TABLE\(/i.test(inner)) {
    const body = inner.slice(inner.indexOf('(') + 1, inner.lastIndexOf(')'));
    const fields = splitTopLevel(body).map((column) => {
      const trimmed = column.trim();
      const space = trimmed.indexOf(' ');
      return `        ${trimmed.slice(0, space)}: ${sqlTypeToTs(trimmed.slice(space + 1), byName)};`;
    });
    return `{\n${fields.join('\n')}\n      }[]`;
  }

  if (/^void$/i.test(inner)) return 'undefined';
  const mapped = sqlTypeToTs(inner, byName);
  return setof ? `${mapped}[]` : mapped;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const byName = {
  enums: new Set(catalog.enums.map((e) => e.name)),
  tables: new Set(catalog.tables.map((t) => t.name)),
  domains: new Map(),
};

for (const table of catalog.tables) {
  for (const column of table.columns) {
    if (column.type.kind === 'd' && column.type.base) {
      byName.domains.set(column.type.name, tsType(column.type));
    }
  }
}

const relationshipsByTable = new Map();
for (const fk of catalog.foreignKeys) {
  const list = relationshipsByTable.get(fk.table) ?? [];
  list.push(fk);
  relationshipsByTable.set(fk.table, list);
}

const lines = [];
const emit = (line = '') => lines.push(line);

emit('/**');
emit(' * GENERATED — do not edit. Run `./scripts/generate-types.sh`.');
emit(' *');
emit(' * Produced from supabase/migrations by applying them to a throwaway cluster and');
emit(' * reading the catalog, rather than from the hosted project. The migrations are');
emit(' * the source of truth for the schema, and generating from them means anyone can');
emit(' * refresh this file without the database password.');
emit(' *');
emit(' * Checked in on purpose: typecheck must work on a clean clone with no database');
emit(' * and no credentials.');
emit(' */');
emit();
emit(
  'export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];',
);
emit();
emit('export interface Database {');
emit('  public: {');
emit('    Tables: {');

for (const table of catalog.tables) {
  emit(`      ${table.name}: {`);

  emit('        Row: {');
  for (const column of table.columns) {
    const type = tsType(column.type);
    emit(`          ${column.name}: ${column.notNull ? type : `${type} | null`};`);
  }
  emit('        };');

  emit('        Insert: {');
  for (const column of table.columns) {
    const type = tsType(column.type);
    // Required on insert only when the column is NOT NULL and has no default.
    const optional = !column.notNull || column.hasDefault;
    emit(
      `          ${column.name}${optional ? '?' : ''}: ${column.notNull ? type : `${type} | null`};`,
    );
  }
  emit('        };');

  emit('        Update: {');
  for (const column of table.columns) {
    const type = tsType(column.type);
    emit(`          ${column.name}?: ${column.notNull ? type : `${type} | null`};`);
  }
  emit('        };');

  const relationships = relationshipsByTable.get(table.name) ?? [];
  if (relationships.length === 0) {
    emit('        Relationships: [];');
  } else {
    emit('        Relationships: [');
    for (const fk of relationships) {
      emit('          {');
      emit(`            foreignKeyName: "${fk.name}";`);
      emit(`            columns: [${fk.columns.map((c) => `"${c}"`).join(', ')}];`);
      emit(`            isOneToOne: ${fk.isOneToOne};`);
      emit(`            referencedRelation: "${fk.referencedTable}";`);
      emit(
        `            referencedColumns: [${fk.referencedColumns.map((c) => `"${c}"`).join(', ')}];`,
      );
      emit('          },');
    }
    emit('        ];');
  }

  emit('      };');
}

emit('    };');
emit('    Views: Record<PropertyKey, never>;');
emit('    Functions: {');
const seen = new Set();
for (const fn of catalog.functions) {
  // `Functions` is keyed by name, so an overload set cannot be represented.
  // Extension functions are filtered out in introspect.sql; this catches any
  // overload we write ourselves, loudly rather than by emitting a duplicate key.
  if (seen.has(fn.name)) {
    throw new Error(
      `Two functions named ${fn.name}: PostgREST types cannot express an overload. ` +
        'Give one of them a distinct name.',
    );
  }
  seen.add(fn.name);

  emit(`      ${fn.name}: {`);
  emit(`        Args: ${parseArguments(fn.arguments, byName)};`);
  emit(`        Returns: ${parseReturns(fn, byName)};`);
  emit('      };');
}
emit('    };');
emit('    Enums: {');
for (const e of catalog.enums) {
  emit(`      ${e.name}: ${e.values.map((v) => `"${v}"`).join(' | ')};`);
}
emit('    };');
emit('    CompositeTypes: Record<PropertyKey, never>;');
emit('  };');
emit('}');
emit();

process.stdout.write(lines.join('\n'));
