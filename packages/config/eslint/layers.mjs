/**
 * Architectural layer enforcement.
 *
 * The dependency graph is a strict DAG pointing downward. A package may import
 * from any layer BELOW it and never from a layer above or beside it. This file
 * is the machine-checked version of docs/ARCHITECTURE.md — if the two ever
 * disagree, this file wins, because CI runs it.
 *
 *   apps            (web, mobile)  — choose an adapter, wire it in
 *     └─> logic     use-cases: authorize, then orchestrate
 *           ├─> access    pure policy decisions
 *           └─> ports     storage interfaces — NOT an implementation
 *                 └─> entities   schemas + domain types
 *                       └─> core, logger, tokens
 *
 *   Adapters implement `ports` and sit beside logic, never beneath it:
 *     data      Supabase/PostgREST (the ONLY Supabase caller)
 *     fixtures  in-memory, what UI development runs against
 *
 *   Crucially, `logic` may not import either adapter. Use-cases depend on the
 *   interface only, which is what lets the product be built now against
 *   fixtures and moved onto a database later without touching business rules.
 *
 *   ui-web / ui-native sit beside logic and may only reach entities/tokens/core.
 *   Presentation never talks to a database.
 */

/** @type {Record<string, string[]>} layer -> layers it may NOT import */
const ADAPTERS_AND_UP = ['data', 'fixtures', 'logic', 'ui-web', 'ui-native'];

const FORBIDDEN = {
  core: ['entities', 'ports', 'access', ...ADAPTERS_AND_UP],
  logger: ['entities', 'ports', 'access', ...ADAPTERS_AND_UP],
  tokens: ['entities', 'ports', 'access', ...ADAPTERS_AND_UP],
  entities: ['ports', 'access', ...ADAPTERS_AND_UP],
  ports: ['access', ...ADAPTERS_AND_UP],
  access: ['ports', ...ADAPTERS_AND_UP],
  // Adapters implement ports. They must not know about each other, and must not
  // reach up into the use-cases that consume them.
  data: ['fixtures', 'logic', 'ui-web', 'ui-native'],
  fixtures: ['data', 'logic', 'ui-web', 'ui-native'],
  // The important one: logic talks to ports, never to a concrete adapter.
  logic: ['data', 'fixtures', 'ui-web', 'ui-native'],
  'ui-web': ['data', 'fixtures', 'logic', 'ports', 'access', 'ui-native'],
  'ui-native': ['data', 'fixtures', 'logic', 'ui-web'],
};

const reason = (self, target) =>
  `@relayflow/${self} may not import @relayflow/${target}. ` +
  `Layer direction is enforced — see docs/ARCHITECTURE.md.`;

/**
 * Rules every package gets, regardless of layer. These encode the invariants
 * that the sanadycare audit found broken in production code.
 */
export const universalImportRules = [
  {
    // Only @relayflow/data may speak PostgREST. Everything else goes through a
    // repository, so RLS context and query shape stay in one auditable place.
    group: ['@supabase/supabase-js', '@supabase/ssr', '@supabase/*'],
    message:
      'Only @relayflow/data may import a Supabase client directly. ' +
      'Add or use a repository instead.',
  },
  {
    // The privileged client bypasses RLS. It is quarantined behind a subpath
    // that apps and logic cannot reach; only trusted server entrypoints may.
    group: ['@relayflow/data/admin', '@relayflow/data/admin/*'],
    message:
      'The service-role client bypasses RLS and is not importable here. ' +
      'Privileged work belongs in a reviewed server entrypoint or an RPC.',
  },
  {
    group: ['../../*/src/*', '../../../*'],
    message:
      'Reach into a workspace package by its published name (@relayflow/x), ' +
      'not by a relative path across package boundaries.',
  },
];

/**
 * Build the eslint config block for a package in a given layer.
 *
 * @param {keyof typeof FORBIDDEN} layer
 * @param {{ allowSupabase?: boolean }} [opts]
 */
export function layerConfig(layer, opts = {}) {
  const forbidden = FORBIDDEN[layer] ?? [];
  if (!FORBIDDEN[layer]) {
    throw new Error(`Unknown layer "${layer}". Add it to eslint/layers.mjs first.`);
  }

  const patterns = [
    ...forbidden.map((target) => ({
      group: [`@relayflow/${target}`, `@relayflow/${target}/*`],
      message: reason(layer, target),
    })),
    ...universalImportRules.filter(
      (rule) => !(opts.allowSupabase && rule.group[0].startsWith('@supabase')),
    ),
  ];

  return {
    name: `relayflow/layer/${layer}`,
    rules: {
      'no-restricted-imports': ['error', { patterns }],
    },
  };
}

export { FORBIDDEN as forbiddenLayerImports };
