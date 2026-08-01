-- 0002 — identity and the tenant boundary
--
-- The tenant is the STARTUP. There is no organisation layer: a startup is the
-- unit a founder belongs to, the unit hours are allocated to, and the unit RLS
-- scopes by. (An earlier scaffold in packages/data assumed organisations and
-- memberships; that was wrong-schema and is not migrated here.)
--
-- Three actor kinds, each reached differently:
--   startup people  -> startup_members, scoped to their startup
--   candidates      -> candidates.user_id, scoped to themselves
--   QSTP staff      -> qstp_staff, deliberately cross-tenant with no membership

create table users (
  -- Mirrors auth.users so RLS can compare against auth.uid() without a join
  -- through a second identity table.
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null check (char_length(full_name) between 1 and 200),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_updated_at
  before update on users
  for each row execute function set_updated_at();

-- QSTP staff are the programme's operators. Membership here is what makes an
-- actor cross-tenant, so this table is the most privileged row set in the
-- database and the one whose writes deserve the most scrutiny.
create table qstp_staff (
  user_id uuid primary key references users (id) on delete cascade,
  role qstp_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger qstp_staff_updated_at
  before update on qstp_staff
  for each row execute function set_updated_at();

create table startups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  slug text not null unique check (char_length(slug) between 2 and 63),
  sector text check (char_length(sector) <= 100),
  contact_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger startups_updated_at
  before update on startups
  for each row execute function set_updated_at();

create table startup_members (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references startups (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role startup_role not null,
  status member_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One membership per person per startup. Two rows with different roles would
  -- make "what may this person do here?" ambiguous at exactly the moment it
  -- matters.
  unique (startup_id, user_id)
);

create index startup_members_user_idx on startup_members (user_id) where status = 'active';
create index startup_members_startup_idx on startup_members (startup_id);

create trigger startup_members_updated_at
  before update on startup_members
  for each row execute function set_updated_at();
