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

| File                            | What it does                                                      |
| ------------------------------- | ----------------------------------------------------------------- |
| `0001_extensions_enums.sql`     | `hour_tier` domain, 45 enums, the `updated_at` trigger            |
| `0002_identity.sql`             | users, qstp_staff, startups, startup_members                      |
| `0003_cycle.sql`                | cycles, participations, allocations                               |
| `0004_positions_candidates.sql` | position intents, positions, candidates, pools, interviews, tasks |
| `0005_selection.sql`            | selections, conflicts, candidate choice, exceptions               |
| `0006_onboarding.sql`           | placements, requirements, submissions, signatures, documents      |
| `0007_recovery.sql`             | recovery cases, redistribution rounds and invitations             |
| `0008_prioritisation.sql`       | evidence, extraction, ratings, policy versions, runs, results     |
| `0009_activity_rls.sql`         | the audit log, then default-deny RLS on all 42 tables             |
| `0010_rpc.sql`                  | transactional functions for every multi-table write               |
| `0011_reminder_engine.sql`      | reminder occurrences, channel fan-out, RLS and worker leases      |
| `0012_candidate_agreement.sql`  | the candidate's own signature, and party-scoped signature RLS     |

## Reminder engine

Migration `0011_reminder_engine.sql` is the production storage and dispatch
foundation for [02A — Reminder engine](../docs/design/02-automation-rules.md).
It is Supabase-native even while the applications remain on fixture
repositories:

- `reminder_occurrences` holds one idempotent rule/subject episode.
- `notifications` holds one recipient/channel delivery row. In-app rows are the
  durable record; email, Slack and push rows form the external queue.
- `fanout_reminder_step` applies required/preferred channel policy and recipient
  preferences in one place.
- `enqueue_positions_not_submitted_reminders` is the first scheduled rule.
- `claim_due_notifications` leases work with `FOR UPDATE SKIP LOCKED`.
- `finish_notification_delivery` uses a claim token so a stale worker cannot
  overwrite a later attempt.
- Recipient RLS exposes only a user's in-app rows. QSTP may inspect the complete
  occurrence and delivery audit; clients cannot invoke fan-out or worker RPCs.

The Edge worker lives in `supabase/functions/process-notifications`. It supports
Resend email, Slack bot delivery and Expo push. It intentionally contains no
credentials. WhatsApp is not part of RelayFlow.

> **Hackathon exception:** the deployed worker is intentionally unauthenticated
> and must use `--no-verify-jwt`. Anyone who discovers its URL can trigger a
> queue drain. Restore caller authentication before loading real participant
> data or treating the project as production.

Before enabling external delivery on a hosted project:

1. Apply migrations and regenerate `packages/data/src/generated/database.types.ts`.
2. Deploy the hackathon worker with JWT verification disabled:

   ```bash
   supabase functions deploy process-notifications --no-verify-jwt
   ```

3. Configure `NOTIFICATIONS_FROM`, `APP_URL` and only the provider credentials
   for channels being enabled. Do not expose any of them as public client
   variables.
4. Configure a hosted schedule to call
   `enqueue_positions_not_submitted_reminders()` hourly and invoke the worker
   every minute.
5. Exercise a non-production recipient first, then verify the occurrence,
   in-app record, external delivery row and retry state before widening the
   audience.

The application still needs its broader Supabase auth/repository cutover before
the inbox can replace the fixture-derived bell. That cutover is separate from
the reminder schema and must not be simulated by using a service-role client in
the web application.

### The tenant is the startup

There is no organisation layer. A row is scoped by `startup_id` reached through
`startup_members`, by `candidate_id` for a candidate's own records, or not at
all for QSTP staff, who are deliberately cross-tenant. `cycle_id` is a time
partition, not a tenant.

(An earlier scaffold assumed `organizations`/`memberships`. It was never
correct for this domain and is not migrated.)

### Three things worth knowing before editing

**The budget check lives in `decide_allocation`, not only in the app.** Two
operations staff allocating at the same moment would both pass an application
check made against a stale read, and the overrun surfaces at payroll.

**`selections_one_live_per_candidate_idx` is what actually prevents a double
booking.** `reserve_candidate` inserts and handles the 23505 rather than
checking first, because check-then-insert leaves a window wide enough for both
startups to win. On conflict it returns `NULL` and records the collision — it
deliberately does not re-raise, because raising would roll the conflict row back
with everything else.

**Only `scored` results become allocations.** A startup blocked for missing
information and a startup scored at 12 both end up with zero hours, and the
difference is the entire point of `startup_outcome_status`. `publish_prioritisation_run`
writes no allocation row for the other four statuses, and refuses a
`partial_draft` outright unless the caller acknowledges it.

`docs/ARCHITECTURE.md` explains why RLS is shaped the way it is, and why the
policy helpers are `SECURITY DEFINER`.

## Checking the schema without a project

```bash
./supabase/tests/run.sh
```

Spins up a throwaway Postgres cluster in a temp directory, applies every
migration, and asserts the invariants above — the hour tiers, the rating bounds,
the budget ceiling, the double-booking guard, and the five prioritisation
statuses. No Docker and no network. The cluster is destroyed on exit.

`00_local_auth_shim.sql` supplies the `auth.users` table and `auth.uid()`
function that a hosted project provides. It is never applied to a real project;
`supabase db push` only reads `supabase/migrations`.
