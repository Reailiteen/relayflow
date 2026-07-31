# Relayflow architecture

This document describes how the codebase is organized and, more importantly,
_why each boundary exists_. Where a rule can be machine-checked it is, and the
check is named alongside the rule. A rule that only lives in prose is a rule
that will be broken.

## The shape

```
                    apps/web (Next.js)    apps/mobile (Expo)
                              │                    │
                              └────────┬───────────┘
                                       │            apps pick an adapter
                              @relayflow/logic          use-cases
                              ┌────────┴────────┐
                     @relayflow/access   @relayflow/ports     policy · storage interfaces
                              └────────┬────────┘
                              @relayflow/entities         schemas · domain types
                                       │
                @relayflow/core · logger · tokens         primitives
```

Two adapters implement `ports`, and they are interchangeable:

| Adapter               | Status                       | Backed by                    |
| --------------------- | ---------------------------- | ---------------------------- |
| `@relayflow/fixtures` | **in use** — what runs today | seeded in-memory data        |
| `@relayflow/data`     | written, not yet wired       | Supabase Postgres + RLS      |

`@relayflow/ui-web` and `@relayflow/ui-native` are reserved for shared
presentation once the UI direction is settled; they will sit beside `logic` and
may reach only `entities`, `tokens`, and `core`. Presentation never queries a
database.

## Current state: no backend

The apps run entirely on in-memory fixtures. `pnpm dev:web` works on a fresh
clone with no environment variables and no database.

This is not a mock layer bolted over the UI. Screens call the real use-cases,
which run the real policy checks against real domain types — only the storage
implementation is a stand-in. So the parts most expensive to get wrong are being
exercised from the first screen, and swapping in Supabase later touches exactly
two files (`apps/web/src/server/context.ts`, `apps/mobile/src/session.ts`), both
marked with the lines to replace.

The schema, RLS policies, and transactional RPCs in `supabase/migrations/` are
written and kept current as the specification for that swap. The CI job that
applies them is gated behind `workflow_dispatch` until then.

## The four rules

### 1. Dependencies point one way

A package imports only from layers strictly below it. This is what keeps the
graph a DAG, and it is why business logic can be tested without a browser and
policy can be tested without a database.

_Enforced by:_ `packages/config/eslint/layers.mjs`, applied in every package's
`eslint.config.mjs`. Violations fail `pnpm lint`.

### 2. Use-cases depend on interfaces, never on a database

`@relayflow/logic` imports `@relayflow/ports` and is forbidden — by lint — from
importing either adapter. It cannot tell whether it is talking to Postgres or to
an array in memory, which is what makes today's fixtures-only setup a genuine
staging post rather than throwaway scaffolding.

Every query lives in an adapter. Apps and use-cases receive an interface, not a
client. One place to audit query shape, one place where RLS context is
established, one place to change when the schema moves.

Only `@relayflow/data` speaks to Supabase.

The service-role client — which bypasses RLS entirely — lives behind
`@relayflow/data/admin`, a subpath the lint rules forbid apps and `logic` from
importing. It also refuses to construct in a browser and demands a written
reason from each caller.

Before reaching for it, ask whether the work can be a `SECURITY DEFINER` SQL
function with a narrow signature. It usually can, and that version is auditable
in one file rather than scattered across request handlers.

_Enforced by:_ `universalImportRules` in the layers config; subpath export in
`packages/data/package.json`.

### 3. Authorization is a required field, not a remembered step

Every use-case is declared with `defineUseCase({ name, input, authorize, execute })`.
`authorize` is not optional — a use-case without it does not typecheck. Genuinely
public entry points must write `authorize: PUBLIC('reason')`, which is greppable
and visibly deliberate in review.

The order is fixed by the framework, not by the author:

1. parse input against its schema,
2. authorize the _parsed_ input,
3. execute.

So an actor can never pass one organization id to the gate and a different one
to the query, and authorization never runs against unvalidated input.

Server Actions are reachable by direct POST — Next's own docs stress this — so
the app layer adds nothing on top: `action(useCase)` builds the context, calls
the use-case, and serializes the result. There is no place in a Server Action to
forget a check, because there is no check there to forget.

Policy itself (`@relayflow/access`) is pure and synchronous: same actor plus
same capability always yields the same answer. That makes the entire
authorization surface unit-testable, and `policy.test.ts` asserts the full
role × capability matrix rather than spot-checking it.

_Enforced by:_ the type signature of `UseCaseDefinition`; tests in
`packages/logic/src/use-case.test.ts` and `packages/access/src/policy.test.ts`.

### 4. Multi-table writes are transactions

PostgREST gives one transaction per request. A use-case issuing three
`.insert()` calls has three independent transactions, and a failure on the third
leaves the first two committed.

**If a workflow writes to more than one table, the port exposes it as a single
method whose contract requires atomicity**, and each adapter satisfies that
however it can. The use-case never sequences the writes itself, because up there
it has no way to make them atomic.

`OrganizationPort.createWithOwner` is the reference case. The Supabase adapter
implements it with a Postgres function (`create_organization_with_owner`) in one
transaction; the fixtures adapter satisfies it by construction. An organization
with no owner is unrecoverable through the UI, so neither is allowed to produce
one.

SQL functions run as the caller (`SECURITY INVOKER`) unless they have a specific
reason not to, so moving work into the database does not smuggle in extra
privilege.

## Defence in depth

Application policy and row-level security both enforce the tenant boundary, on
purpose:

- **`@relayflow/access`** produces good errors, drives which buttons render, and
  is fast because it works from an already-loaded actor.
- **RLS** is the backstop. It holds even when a query is written carelessly, a
  new endpoint forgets a filter, or an anon key leaks.

RLS is default-deny: enabled and `FORCE`d on every table, with each permitted
action named explicitly. Policy helper functions are `SECURITY DEFINER` — a
policy on `memberships` that queries `memberships` recurses infinitely — and are
kept deliberately narrow so they answer one yes/no question and cannot be used
to read rows.

## Errors

One taxonomy (`@relayflow/core/errors`), used by every layer, mapped to
transport concerns in exactly one place per client. This matters because a
`forbidden` rendered as a generic 500 is an authorization signal buried in
noise — which is how these bugs stay invisible.

Postgres error codes are translated once, in `packages/data/src/errors.ts`; in
particular `42501` (RLS refusal) becomes `forbidden` and stays legible in logs.

User-facing messages are filtered on the way out: `internal` and `upstream`
failures never reach a browser verbatim, so no stack trace or SQL fragment leaks.

## Time, identity, and other ambient state

Nothing is reached for ambiently. `UseCaseContext` carries the actor,
repositories, logger, and clock. Scheduling logic that calls `Date.now()` inline
cannot be tested for the cases that actually break it — DST shifts, expiries,
race windows — so tests inject `fixedClock()`.

## Package layout

| Package               | Path                 | Responsibility                                    |
| --------------------- | -------------------- | ------------------------------------------------- |
| `@relayflow/core`     | `packages/core`      | Result, error taxonomy, env parsing, clock, ids    |
| `@relayflow/logger`   | `packages/logger`    | Structured logging with redaction on by default    |
| `@relayflow/tokens`   | `packages/tokens`    | Design tokens, shared by web CSS and native        |
| `@relayflow/entities` | `packages/entities`  | Zod schemas, domain types, row → domain mapping    |
| `@relayflow/ports`    | `packages/ports`     | Storage interfaces — no implementation             |
| `@relayflow/access`   | `packages/access`    | Capabilities, actor, pure policy decisions         |
| `@relayflow/fixtures` | `packages/fixtures`  | In-memory adapter + seed data + dev actors        |
| `@relayflow/data`     | `packages/data`      | Supabase adapter, quarantined admin client         |
| `@relayflow/logic`    | `packages/logic`     | Use-cases: parse → authorize → execute             |
| `@relayflow/config`   | `packages/config`    | tsconfig, ESLint, and the layer rules themselves   |

Internal packages ship raw TypeScript — no build step, no `dist/` to go stale.
Next transpiles them via `transpilePackages`; Metro compiles them natively.

## Conventions

- Roles are labels; **code branches on capabilities**, never on `role === 'admin'`.
- Ids are branded types. A `UserId` will not typecheck where an `OrganizationId`
  belongs, though both are uuids at runtime.
- Pagination is keyset, not offset: offset re-scans and duplicates rows when the
  underlying set changes mid-scroll, which in a live list it always does.
- `updated_at` is maintained by database triggers. Clients lie about time.
- Use-cases return `Result`; they do not throw. A caller cannot read `.data`
  without first narrowing on `.ok`.
