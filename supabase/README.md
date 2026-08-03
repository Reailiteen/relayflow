# Database

This is the live schema. The web app runs against it whenever
`NEXT_PUBLIC_SUPABASE_URL` and a key are set, and falls back to in-memory
fixtures when they are not — so a fresh clone still runs with no credentials,
and the sign-in page says which mode it is in.

## No local stack

This project targets a **hosted Supabase project only**. There is deliberately
no local development stack:

- no `supabase start` / `supabase stop`
- no Docker, no `config.toml`, no `supabase init`
- no `supabase link` state to keep in sync

Every command talks to the hosted project over its connection string. That
means one source of truth for the schema, and no class of "works locally,
breaks on the project" bugs.

## Setup

1. Create the project in the Supabase dashboard, then `supabase link`.
2. Apply the migrations and seed the demo cohort:

   ```bash
   supabase db push
   ./scripts/generate-types.sh                    # refresh the checked-in types
   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm seed:hosted
   ```

3. Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   in `apps/web/.env.local`. Nothing else needs changing — `context.ts` picks
   the adapter from those two variables.

Type generation reads the catalog off a throwaway cluster rather than the
hosted project (`scripts/generate-types.sh`), so it needs neither Docker nor
the database password. `supabase gen types` requires both.

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
| `0013_app_writes.sql`           | the non-QSTP write surface: definer RPCs with explicit guards     |
| `0014_storage.sql`              | document and submission buckets, and the policies over them       |
| `0015_reminder_rules.sql`       | the rest of the rule catalogue, resolution and escalation         |
| `0016_schedule.sql`             | pg_cron for the sweep; a helper to point it at the worker         |

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

The worker still deploys with `--no-verify-jwt`, because its caller is pg_cron
and there is no signed-in person to have a JWT. It is no longer unauthenticated:
it requires an `x-worker-secret` header matching `WORKER_SHARED_SECRET` and
returns 503 rather than running if that secret is unset. An unfinished
deployment refuses to work instead of quietly working for everybody.

### Enabling delivery on a hosted project

1. Apply migrations and regenerate the types:

   ```bash
   supabase db push
   ./scripts/generate-types.sh
   ```

2. Set the secrets. Only the providers for channels actually being enabled —
   an unset `SLACK_BOT_TOKEN` means Slack rows fail rather than silently
   vanishing, which is the behaviour you want while deciding.

   ```bash
   supabase secrets set WORKER_SHARED_SECRET="$(openssl rand -hex 32)"
   supabase secrets set NOTIFICATIONS_FROM=… APP_URL=…
   supabase secrets set RESEND_API_KEY=…        # email
   supabase secrets set SLACK_BOT_TOKEN=…       # slack
   ```

3. Deploy the worker:

   ```bash
   supabase functions deploy process-notifications --no-verify-jwt
   ```

4. Point the scheduler at it, once, with the same secret. `0016_schedule.sql`
   already schedules the hourly `run_reminder_sweep()`; this is the per-minute
   drain, which needs a URL and a credential and therefore cannot live in a
   migration:

   ```sql
   select schedule_notification_worker(
     'https://<project-ref>.supabase.co/functions/v1/process-notifications',
     '<the same value as WORKER_SHARED_SECRET>'
   );
   ```

5. Exercise a non-production recipient first, then check the occurrence, the
   in-app record, the external delivery row and the retry state before widening
   the audience.

### Reminder rules

`0015_reminder_rules.sql` completes the catalogue from
[02A — Reminder engine](../docs/design/02-automation-rules.md): seven more
evaluators, plus the two halves that were structurally missing —
`resolve_reminder_occurrences` closes an episode when its condition clears, and
`escalate_reminders` raises an unanswered one to QSTP after a per-rule delay,
re-checking the condition first.

Each rule's condition is written **once**, in `reminder_condition_holds`, and
read by both the raising pass and the resolving pass. A condition written twice
eventually disagrees with itself, and the failure is the one users notice: a
reminder that cannot be silenced by doing what it asked for.

To run a sweep by hand — useful when demonstrating, and the fastest way to see
whether a rule fires at all:

```sql
select run_reminder_sweep();
select run_reminder_sweep(now() + interval '30 days');  -- as if time had passed
```

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
