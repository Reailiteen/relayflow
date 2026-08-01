-- 0007 — recovering unused hours and redistributing them
--
-- Hours promised but never used are the programme's most expensive silent
-- failure: the budget shows spent, the startup shows funded, and no intern is
-- working. This is the machinery for noticing and reallocating.

create table recovery_cases (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  placement_id uuid references placements (id) on delete set null,
  recoverable_hours integer not null check (recoverable_hours >= 0),
  status recovery_status not null default 'potential',
  -- A startup that asked for time, or that is mid-replacement, is protected
  -- until this moment. Recovering underneath them is how you turn a delay into
  -- a lost placement.
  protected_until timestamptz,
  reason text not null,
  confirmed_by uuid references users (id),
  redistribution_round_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recovery_cases_cycle_idx on recovery_cases (cycle_id, status);
create index recovery_cases_startup_idx on recovery_cases (startup_id);

create trigger recovery_cases_updated_at
  before update on recovery_cases
  for each row execute function set_updated_at();

create table redistribution_rounds (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  number integer not null check (number >= 1),
  status redistribution_status not null default 'draft',
  available_hours integer not null check (available_hours >= 0),
  -- Compressed deadlines: a redistribution round happens late in a cycle and
  -- cannot run on the original timetable.
  position_deadline timestamptz not null,
  selection_deadline timestamptz not null,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (cycle_id, number)
);

create trigger redistribution_rounds_updated_at
  before update on redistribution_rounds
  for each row execute function set_updated_at();

-- Who was offered released hours, in what quantity, and what they said. This is
-- the table the waitlist feeds into — and the reason the engine refuses to
-- order a tied waitlist group, because this is where that order would bite.
create table redistribution_invitations (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references redistribution_rounds (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  status redistribution_invitation_status not null default 'invited',
  proposed_hours hour_tier not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, startup_id)
);

create index redistribution_invitations_round_idx
  on redistribution_invitations (round_id, status);

create trigger redistribution_invitations_updated_at
  before update on redistribution_invitations
  for each row execute function set_updated_at();

-- Deferred so the three tables that carry a round id can be created in any
-- order relative to the round itself.
alter table allocations
  add constraint allocations_redistribution_round_fk
  foreign key (redistribution_round_id) references redistribution_rounds (id) on delete set null;

alter table positions
  add constraint positions_redistribution_round_fk
  foreign key (redistribution_round_id) references redistribution_rounds (id) on delete set null;

alter table recovery_cases
  add constraint recovery_cases_redistribution_round_fk
  foreign key (redistribution_round_id) references redistribution_rounds (id) on delete set null;
