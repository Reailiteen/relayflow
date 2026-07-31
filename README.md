# Relayflow

A Next.js + React Native monorepo sharing one domain model, one authorization
policy, and one set of design tokens.

## Getting started

```bash
pnpm install
cp .env.example .env        # fill in your Supabase project values

pnpm dev:web                # http://localhost:3000
pnpm dev:mobile             # Expo dev server
```

Before pushing:

```bash
pnpm verify                 # typecheck · lint · test · build, all blocking
```

## Layout

```
apps/
  web/        Next.js 16 · App Router · Tailwind v4
  mobile/     Expo SDK 57 · expo-router · React Native 0.86
packages/
  core/       Result, error taxonomy, env parsing, clock, branded ids
  logger/     structured logging, redaction on by default
  tokens/     design tokens shared by web CSS and native styles
  entities/   Zod schemas, domain types, row → domain mapping
  access/     capabilities, actor, pure policy decisions
  data/       repositories · RPC wrapper · quarantined admin client
  logic/      use-cases: parse → authorize → execute
  config/     tsconfig, ESLint, and the layer rules themselves
supabase/
  migrations/ schema, RLS policies, transactional RPCs
docs/
  ARCHITECTURE.md   the boundaries and why each one exists
```

## What is load-bearing here

Four rules hold this together, and each is enforced by a tool rather than by
discipline. `docs/ARCHITECTURE.md` explains the reasoning; the short version:

1. **Dependencies point one way.** A package imports only from layers below it.
   Checked by `packages/config/eslint/layers.mjs` on every `pnpm lint`.
2. **Only `@relayflow/data` touches Supabase.** The service-role client, which
   bypasses RLS, lives behind a subpath apps and use-cases cannot import.
3. **Authorization is a required field.** `defineUseCase` will not typecheck
   without an `authorize` rule, and the framework — not the author — fixes the
   order: parse, authorize, execute.
4. **Multi-table writes are transactions.** More than one table means a Postgres
   function invoked through `callRpc`, never a sequence of PostgREST calls.

Application policy and row-level security both enforce the tenant boundary, on
purpose: policy gives good errors and drives the UI, RLS holds even when a query
is written carelessly.

## Internal packages have no build step

They ship raw TypeScript. Next compiles them via `transpilePackages`, Metro
compiles them natively. There is no `dist/` to go stale and nothing to rebuild
between editing a package and seeing the change.

## Database

```bash
supabase start
supabase db reset                          # apply migrations from scratch
pnpm --filter @relayflow/data generate:types
```

CI regenerates those types and fails on any diff, so schema drift breaks the
build rather than surfacing later as a runtime parse error.
