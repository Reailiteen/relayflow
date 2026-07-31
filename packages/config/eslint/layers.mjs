/**
 * Architectural layer enforcement.
 *
 * The dependency graph is a strict DAG pointing downward. A package may import
 * from any layer BELOW it and never from a layer above or beside it. This file
 * is the machine-checked version of docs/ARCHITECTURE.md — if the two ever
 * disagree, this file wins, because CI runs it.
 *
 *   apps            (web, mobile)
 *     └─> logic     use-cases: authorize, then orchestrate
 *           ├─> access    pure policy decisions
 *           └─> data      repositories (the ONLY Supabase caller)
 *                 └─> entities   schemas + domain types
 *                       └─> core, logger, tokens
 *
 *   ui-web / ui-native sit beside logic and may only reach entities/tokens/core.
 *   Presentation never talks to a database.
 */

/** @type {Record<string, string[]>} layer -> layers it may NOT import */
const FORBIDDEN = {
  core: ['entities', 'access', 'data', 'logic', 'ui-web', 'ui-native'],
  logger: ['entities', 'access', 'data', 'logic', 'ui-web', 'ui-native'],
  tokens: ['entities', 'access', 'data', 'logic', 'ui-web', 'ui-native'],
  entities: ['access', 'data', 'logic', 'ui-web', 'ui-native'],
  access: ['data', 'logic', 'ui-web', 'ui-native'],
  data: ['logic', 'ui-web', 'ui-native'],
  logic: ['ui-web', 'ui-native'],
  'ui-web': ['data', 'logic', 'ui-native'],
  'ui-native': ['data', 'logic', 'ui-web'],
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
