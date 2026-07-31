# Database

Nothing in here runs yet. The apps are on in-memory fixtures; these files are
the specification for when we wire a real project up.

## No local stack

This project targets a **hosted Supabase project only**. There is deliberately
no local development stack:

- no `supabase start` / `supabase stop`
- no Docker, no `config.toml`, no `supabase init`
- no `supabase link` state to keep in sync

Every command talks to the hosted project over its connection string. That
means one source of truth for the schema, and no class of "works locally,
breaks on the project" bugs.

## Setup, when the time comes

1. Create the project in the Supabase dashboard.
2. Copy the connection string from **Project Settings → Database → Connection
   string → URI**, and put it in `.env` as `SUPABASE_DB_URL`.

   It contains the database password, so it is server-only: never a
   `NEXT_PUBLIC_`/`EXPO_PUBLIC_` variable, and never committed.

3. Apply the migrations and generate types:

   ```bash
   pnpm --filter @relayflow/data db:push          # apply supabase/migrations
   pnpm --filter @relayflow/data generate:types   # refresh checked-in types
   ```

4. Point the apps at the project by replacing the two marked lines in
   `apps/web/src/server/context.ts` and `apps/mobile/src/session.ts`.

## Migrations

Plain SQL, applied in filename order. Keep them append-only once they have run
against the project — editing an applied migration means the file no longer
describes what is actually deployed.

| File                                          | What it does                                     |
| --------------------------------------------- | ------------------------------------------------ |
| `0001_identity.sql`                            | users, organizations, memberships; RLS; triggers  |
| `0002_rpc_create_organization_with_owner.sql`  | atomic workspace creation; last-owner guard       |

`docs/ARCHITECTURE.md` explains why RLS is shaped the way it is, and why the
policy helpers are `SECURITY DEFINER`.
