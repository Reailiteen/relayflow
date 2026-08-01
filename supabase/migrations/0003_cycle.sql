-- 0003 — the cycle, participation, and the hour budget
--
-- A cycle is a time partition, not a tenant. Almost every row in the system
-- carries cycle_id so that "what happened in Spring 2026" is a query rather
-- than an archaeology exercise.
--
-- The hour budget is the spine of the product. Over-allocation is a funding
-- overrun nobody notices until interns are already working, which is why the
-- ceiling is enforced in the write path (see 0010_rpc.sql) and not only in the
-- application.

create table cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  stage cycle_stage not null default 'draft',
  starts_on date not null,
  ends_on date not null,
  funded_weekly_hours integer not null check (funded_weekly_hours >= 0),
  selection_mode selection_mode not null default 'first_come',
  -- Kept as jsonb rather than four columns: the set of deadlines is a policy
  -- decision that has already changed once, and the app validates their
  -- ordering as a unit.
  deadlines jsonb not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on < ends_on)
);

-- At most one cycle actually running. Two would make `findActive()`
-- non-deterministic and silently split a cohort in half.
--
-- `draft` is excluded on purpose: QSTP prepares the next cohort while the
-- current one is still onboarding, and a constraint that forbade that would be
-- worked around rather than respected.
create unique index cycles_single_active_idx
  on cycles ((true))
  where archived_at is null and stage not in ('draft', 'closed');

create trigger cycles_updated_at
  before update on cycles
  for each row execute function set_updated_at();

-- A startup's presence in one cycle, and what it asked for before anything was
-- decided. Separate from `startups` because a startup participates repeatedly
-- and each round has its own answer.
create table cycle_participations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  status participation_status not null default 'invited',
  requested_total_hours integer not null default 0 check (requested_total_hours >= 0),
  requested_intern_count integer not null default 0 check (requested_intern_count >= 0),
  disciplines text[] not null default '{}',
  -- Derived, not entered. Written from the prioritisation engine's score so the
  -- existing read sites keep working; the six ratings behind it live in
  -- startup_ratings.
  operator_score numeric(5, 2) check (operator_score between 0 and 100),
  internal_notes text,
  startup_justification text,
  allocation_acknowledged_at timestamptz,
  allocation_acknowledged_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, startup_id)
);

create index cycle_participations_cycle_idx on cycle_participations (cycle_id);

create trigger cycle_participations_updated_at
  before update on cycle_participations
  for each row execute function set_updated_at();

create table allocations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  weekly_hours hour_tier not null,
  status allocation_status not null default 'draft',
  score numeric(5, 2) check (score between 0 and 100),
  -- Required when the decided tier differs from the one the score recommends.
  -- Enforced in the RPC, where the recommendation is computed.
  override_reason text,
  justification text,
  from_redistribution boolean not null default false,
  revision integer not null default 1 check (revision >= 1),
  supersedes_allocation_id uuid references allocations (id),
  redistribution_round_id uuid,
  decided_by uuid references users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- History is kept as superseded rows, so exactly one live allocation per
-- startup per cycle. A second live row is a double-funded startup.
create unique index allocations_live_idx
  on allocations (cycle_id, startup_id)
  where status <> 'superseded';

create index allocations_cycle_idx on allocations (cycle_id);
create index allocations_startup_idx on allocations (startup_id);

create trigger allocations_updated_at
  before update on allocations
  for each row execute function set_updated_at();
