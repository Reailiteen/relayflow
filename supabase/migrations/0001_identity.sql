-- Identity and tenancy: users, organizations, memberships.
--
-- Row-level security is the backstop, not the primary gate. Application policy
-- (@relayflow/access) produces good errors and drives the UI; RLS guarantees
-- that a query written carelessly — or a stolen anon key — still cannot read
-- another tenant's rows.

create extension if not exists "pgcrypto";
-- citext so slugs are case-insensitively unique: "Acme" and "acme" must not
-- both be claimable.
create extension if not exists "citext";

create type membership_role   as enum ('owner', 'admin', 'member', 'guest');
create type membership_status as enum ('invited', 'active', 'suspended');

-- Application profile. Credentials stay in auth.users; this table mirrors only
-- what the product displays.
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text        not null,
  display_name text        not null check (length(trim(display_name)) between 1 and 200),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       citext      not null unique,
  name       text        not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid              not null references public.organizations (id) on delete cascade,
  user_id         uuid              not null references public.users (id)         on delete cascade,
  role            membership_role   not null default 'member',
  status          membership_status not null default 'invited',
  created_at      timestamptz       not null default now(),
  updated_at      timestamptz       not null default now(),
  unique (organization_id, user_id)
);

-- Every tenant-scoped query filters on organization_id; index it accordingly.
create index memberships_organization_id_idx on public.memberships (organization_id);
create index memberships_user_id_idx         on public.memberships (user_id);

-- An organization must always have at least one owner. Enforced by a trigger in
-- 0002 rather than a constraint, because it spans rows.
create unique index memberships_single_owner_idx
  on public.memberships (organization_id)
  where role = 'owner' and status = 'active';

-- updated_at maintained by the database, never by application code — clients
-- lie about time and clock skew makes "last write wins" unreliable.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function public.touch_updated_at();

create trigger memberships_touch_updated_at
  before update on public.memberships
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization helpers
--
-- These are SECURITY DEFINER on purpose: a policy on memberships that queries
-- memberships recurses infinitely. Isolating the lookup in a definer function
-- breaks the cycle. Each one is deliberately narrow — it answers a single
-- yes/no question about the *calling* user and cannot be used to read rows.
-- ---------------------------------------------------------------------------

create or replace function public.is_active_member(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and status  = 'active'
  );
$$;

create or replace function public.has_role_in(p_organization_id uuid, p_roles membership_role[])
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and status  = 'active'
      and role    = any (p_roles)
  );
$$;

revoke execute on function public.is_active_member(uuid) from public;
revoke execute on function public.has_role_in(uuid, membership_role[]) from public;
grant  execute on function public.is_active_member(uuid) to authenticated;
grant  execute on function public.has_role_in(uuid, membership_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security. Default deny: RLS is enabled and every allowed action is
-- named explicitly. Note there is no blanket policy for the anon role anywhere.
-- ---------------------------------------------------------------------------

alter table public.users         enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;

alter table public.users         force row level security;
alter table public.organizations force row level security;
alter table public.memberships   force row level security;

-- users: you can always read and edit yourself, plus read people you share an
-- organization with.
create policy users_select_self on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_select_coworkers on public.users
  for select to authenticated
  using (
    exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.organization_id = mine.organization_id
      where mine.user_id  = auth.uid()
        and mine.status   = 'active'
        and theirs.user_id = public.users.id
        and theirs.status  = 'active'
    )
  );

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- organizations: visible to active members; mutable only by owners and admins.
create policy organizations_select_members on public.organizations
  for select to authenticated
  using (public.is_active_member(id));

create policy organizations_update_admins on public.organizations
  for update to authenticated
  using (public.has_role_in(id, array['owner', 'admin']::membership_role[]))
  with check (public.has_role_in(id, array['owner', 'admin']::membership_role[]));

create policy organizations_delete_owner on public.organizations
  for delete to authenticated
  using (public.has_role_in(id, array['owner']::membership_role[]));

-- Inserts go exclusively through create_organization_with_owner (0002), which
-- is the only path that also creates the owning membership. No insert policy
-- exists here on purpose.

-- memberships: members see their organization's roster; admins manage it.
create policy memberships_select_members on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_active_member(organization_id));

create policy memberships_insert_admins on public.memberships
  for insert to authenticated
  with check (
    public.has_role_in(organization_id, array['owner', 'admin']::membership_role[])
    -- Only an owner may mint another owner.
    and (role <> 'owner' or public.has_role_in(organization_id, array['owner']::membership_role[]))
  );

create policy memberships_update_admins on public.memberships
  for update to authenticated
  using (public.has_role_in(organization_id, array['owner', 'admin']::membership_role[]))
  with check (
    public.has_role_in(organization_id, array['owner', 'admin']::membership_role[])
    and (role <> 'owner' or public.has_role_in(organization_id, array['owner']::membership_role[]))
  );

create policy memberships_delete_admins on public.memberships
  for delete to authenticated
  using (
    public.has_role_in(organization_id, array['owner', 'admin']::membership_role[])
    and role <> 'owner'
  );
