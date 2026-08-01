-- 0005 — selection, conflicts, candidate choice, and exceptions
--
-- This is where two startups want the same person. The application resolves it
-- with policy; the database's job is to make the impossible state unreachable
-- even when the application gets it wrong.

create table selections (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  status selection_status not null default 'reserved',

  -- The timestamp the first-confirmed rule actually runs on. Set by the
  -- database, because whoever confirmed first is a fact about the write.
  reserved_at timestamptz not null default now(),
  offered_at timestamptz,
  accepted_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,

  selected_by uuid not null references users (id),
  override_reason text,
  overridden_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The constraint that matters most in the whole schema.
--
-- A candidate can hold only one blocking selection at a time. Without this,
-- two startups racing on the same person both pass an application-level check
-- against a stale read and both commit — and the first anyone learns of it is
-- an intern with two supervisors.
--
-- Covers `accepted` as well as `reserved`/`confirmed`: the domain's
-- `blocksOthers` includes it, even though an older comment in selection.ts
-- listed only two.
create unique index selections_one_live_per_candidate_idx
  on selections (candidate_id)
  where status in ('reserved', 'accepted', 'confirmed');

create index selections_position_idx on selections (position_id);
create index selections_startup_idx on selections (startup_id);
create index selections_candidate_idx on selections (candidate_id);

create trigger selections_updated_at
  before update on selections
  for each row execute function set_updated_at();

-- Recorded, not prevented. Two startups wanting the same candidate is normal
-- for a scarce skill; what QSTP needs is to see it happening and decide.
create table selection_conflicts (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  attempted_selection_id uuid references selections (id) on delete set null,
  blocking_selection_id uuid not null references selections (id) on delete cascade,
  status selection_conflict_status not null default 'open',
  previous_startup_id uuid not null references startups (id),
  requested_startup_id uuid not null references startups (id),
  resolved_by uuid references users (id),
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index selection_conflicts_cycle_idx on selection_conflicts (cycle_id, status);
create index selection_conflicts_candidate_idx on selection_conflicts (candidate_id);

-- The `candidate_choice` cycle mode: the candidate holds several offers and
-- works down an ordered list. Order is data, so it is rows, not an array.
create table candidate_choice_fallbacks (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  current_offer_index integer not null default 0 check (current_offer_index >= 0),
  response_deadline timestamptz not null,
  status fallback_case_status not null default 'open',
  opened_by uuid not null references users (id),
  resolved_by uuid references users (id),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index candidate_choice_fallbacks_open_idx
  on candidate_choice_fallbacks (candidate_id)
  where status = 'open';

create trigger candidate_choice_fallbacks_updated_at
  before update on candidate_choice_fallbacks
  for each row execute function set_updated_at();

create table fallback_offers (
  id uuid primary key default gen_random_uuid(),
  fallback_case_id uuid not null references candidate_choice_fallbacks (id) on delete cascade,
  selection_id uuid not null references selections (id) on delete cascade,
  -- Explicit ordinal. An offer list whose order depends on insertion timing is
  -- an offer list nobody can defend.
  position integer not null check (position >= 0),
  unique (fallback_case_id, position),
  unique (fallback_case_id, selection_id)
);

-- Deadlines are real, and so are the reasons to move one. An exception is the
-- audited way to do it — the alternative is staff quietly ignoring the date.
create table exception_requests (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  kind exception_kind not null,
  status exception_status not null default 'pending',
  reason text not null,
  requested_deadline timestamptz not null,
  granted_deadline timestamptz,
  decision_note text,
  requested_by uuid not null references users (id),
  decided_by uuid references users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exception_requests_cycle_idx on exception_requests (cycle_id, status);
create index exception_requests_startup_idx on exception_requests (startup_id);

create trigger exception_requests_updated_at
  before update on exception_requests
  for each row execute function set_updated_at();
