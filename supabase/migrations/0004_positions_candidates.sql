-- 0004 — position intents, positions, candidates, pools, interviews, tasks

-- ---------------------------------------------------------------------------
-- Position intents
-- ---------------------------------------------------------------------------

-- The prioritisation engine's feasibility gate asks "can this startup host an
-- intern at all?", and it must be answered BEFORE hours are allocated. But a
-- real Position is a job posting sized against an allocation that does not
-- exist yet, so positions cannot simply move earlier.
--
-- An intent is the readiness question on its own: exactly the ten fields the
-- gate checks, submitted during the `allocation` stage, and later seeded
-- forward to pre-fill the real position. Nothing about the cycle stage order or
-- the Position lifecycle changes.
create table position_intents (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,

  title text not null check (char_length(title) between 1 and 200),
  category text not null check (char_length(category) between 1 and 80),
  expected_deliverable text not null check (char_length(expected_deliverable) between 1 and 2000),
  learning_outcomes text[] not null default '{}',
  work_mode work_arrangement not null,
  supervisor_name text not null check (char_length(supervisor_name) between 1 and 200),
  supervisor_id uuid references users (id),

  -- The two numeric gates. 30 minutes a week is the floor below which the
  -- placement is supervision in name only.
  weekly_supervision_minutes integer not null check (weekly_supervision_minutes >= 0),
  maximum_interns integer not null check (maximum_interns >= 0),

  -- Explicit booleans, not nullable. "We have not said" is not "we are ready",
  -- and the gate must be able to tell them apart.
  resources_ready boolean not null default false,
  onboarding_ready boolean not null default false,

  submitted_by uuid not null references users (id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index position_intents_cycle_idx on position_intents (cycle_id);
create index position_intents_startup_idx on position_intents (cycle_id, startup_id);

create trigger position_intents_updated_at
  before update on position_intents
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Positions
-- ---------------------------------------------------------------------------

create table positions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  -- Provenance: which readiness answer this posting grew out of.
  intent_id uuid references position_intents (id),

  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) <= 5000),
  required_skills text[] not null default '{}',
  work_arrangement work_arrangement not null default 'onsite',
  additional_requirements text check (char_length(additional_requirements) <= 3000),

  intern_count integer not null check (intern_count >= 1),
  hours_per_intern integer not null check (hours_per_intern between 1 and 60),
  duration_weeks integer not null check (duration_weeks between 1 and 52),

  supervisor_id uuid references users (id),
  supervisor_name text check (char_length(supervisor_name) <= 200),

  status position_status not null default 'draft',
  review_note text,
  redistribution_round_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index positions_cycle_idx on positions (cycle_id);
create index positions_startup_idx on positions (cycle_id, startup_id);

create trigger positions_updated_at
  before update on positions
  for each row execute function set_updated_at();

-- A child table rather than a jsonb array. "Who sent it back, and what did they
-- say?" is a question asked of a specific position at a specific moment, and an
-- append to an array is not something two concurrent reviewers can do safely.
create table position_review_history (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions (id) on delete cascade,
  status position_status not null,
  note text,
  actor_id uuid references users (id),
  occurred_at timestamptz not null default now()
);

create index position_review_history_position_idx
  on position_review_history (position_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Candidates and pools
-- ---------------------------------------------------------------------------

create table candidates (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  -- Null until the candidate claims their account. The row exists first because
  -- shortlists arrive from outside the platform.
  user_id uuid references users (id) on delete set null,

  full_name text not null check (char_length(full_name) between 1 and 200),
  email text not null,
  phone text check (char_length(phone) <= 40),
  skills text[] not null default '{}',
  cv_url text,
  portfolio_url text,
  github_url text,

  -- An application from four months ago is not a statement of availability
  -- today. `unconfirmed` is the honest default and the reason this column is
  -- not a boolean.
  availability availability_status not null default 'unconfirmed',
  availability_confirmed_at timestamptz,
  source candidate_source not null default 'manual',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Re-importing a shortlist must update rather than duplicate a person.
  unique (cycle_id, email)
);

create index candidates_cycle_idx on candidates (cycle_id);
create index candidates_user_idx on candidates (user_id) where user_id is not null;

create trigger candidates_updated_at
  before update on candidates
  for each row execute function set_updated_at();

create table pool_entries (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  status pool_entry_status not null default 'pending',
  shared_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sharing a pool twice must be idempotent, not a second copy of everyone.
  unique (position_id, candidate_id)
);

create index pool_entries_candidate_idx on pool_entries (candidate_id);
create index pool_entries_position_idx on pool_entries (position_id, status);

create trigger pool_entries_updated_at
  before update on pool_entries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Interviews
-- ---------------------------------------------------------------------------

-- The stage QSTP currently cannot see. Every column here exists to turn a
-- conversation that happened in someone's inbox into something answerable.
create table interviews (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  mode interview_mode not null default 'online',
  status interview_status not null default 'requested',
  scheduled_for timestamptz,
  duration_minutes integer check (duration_minutes between 5 and 480),
  location text check (char_length(location) <= 2000),
  recording_url text,
  transcript_status transcript_status not null default 'none',
  transcript text,
  ai_summary text,
  feedback text,
  recommendation interview_recommendation,
  interviewer_id uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interviews_position_idx on interviews (position_id);
create index interviews_candidate_idx on interviews (candidate_id);

create trigger interviews_updated_at
  before update on interviews
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

create table task_templates (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  position_id uuid not null references positions (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  instructions text not null,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create index task_templates_position_idx on task_templates (position_id);

create table task_assignments (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  template_id uuid references task_templates (id) on delete set null,
  position_id uuid not null references positions (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  status task_assignment_status not null default 'assigned',
  due_at timestamptz not null,
  submitted_at timestamptz,
  -- Recorded rather than hidden: a late submission that was accepted anyway is
  -- a decision somebody made, and the deadline report should still show it.
  late_accepted boolean not null default false,
  file_name text,
  link_url text,
  review_notes text,
  reviewed_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_assignments_candidate_idx on task_assignments (candidate_id);
create index task_assignments_cycle_idx on task_assignments (cycle_id, status);

create trigger task_assignments_updated_at
  before update on task_assignments
  for each row execute function set_updated_at();
