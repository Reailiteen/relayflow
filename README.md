# Relayflow

A Next.js + React Native monorepo sharing one domain model, one authorization
policy, and one set of design tokens.

## Getting started

```bash
pnpm install
pnpm dev:web                # http://localhost:3000
pnpm dev:mobile             # Expo dev server
```

No environment variables, no database, no accounts. The apps run on seeded
in-memory fixtures until we wire a backend.

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
  ports/      storage interfaces — what the app needs, not who provides it
  access/     capabilities, actor, pure policy decisions
  fixtures/   in-memory adapter, seed data, dev actors   ← what runs today
  data/       Supabase adapter · quarantined admin client ← written, not wired
  logic/      use-cases: parse → authorize → execute
  config/     tsconfig, ESLint, and the layer rules themselves
supabase/
  migrations/ schema, RLS policies, transactional RPCs (spec for later)
docs/
  ARCHITECTURE.md   the boundaries and why each one exists
```

## What is load-bearing here

Four rules hold this together, and each is enforced by a tool rather than by
discipline. `docs/ARCHITECTURE.md` explains the reasoning; the short version:

1. **Dependencies point one way.** A package imports only from layers below it.
   Checked by `packages/config/eslint/layers.mjs` on every `pnpm lint`.
2. **Use-cases depend on interfaces, never on a database.** `@relayflow/logic`
   cannot import either adapter — lint rejects it — so it cannot tell whether it
   is talking to Postgres or to an array. Only `@relayflow/data` touches
   Supabase, and the RLS-bypassing service-role client lives behind a subpath
   apps and use-cases cannot import.
3. **Authorization is a required field.** `defineUseCase` will not typecheck
   without an `authorize` rule, and the framework — not the author — fixes the
   order: parse, authorize, execute.
4. **Multi-table writes are atomic.** The port exposes them as one method whose
   contract requires it; the Supabase adapter uses a transaction, and no
   use-case sequences the writes itself.

## Working without a backend

Screens call the real use-cases, which run the real policy checks against real
domain types. Only storage is a stand-in, so the parts most expensive to get
wrong are exercised from the first screen.

Switch who you are signed in as to check that the UI genuinely respects
capabilities — set the `relayflow_dev_actor` cookie to `owner`, `admin`,
`member`, `suspended` or `anonymous`. If the interface looks identical for all
five, the permission wiring is not real yet.

Wiring Supabase later is a change to two files: `apps/web/src/server/context.ts`
and `apps/mobile/src/session.ts`, both marked with the lines to replace.

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
