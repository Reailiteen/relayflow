-- Atomic workflow: create an organization and its owning membership together.
--
-- This is the reference implementation of the rule in
-- packages/data/src/transaction.ts — a workflow that writes to more than one
-- table is a single SQL function, so a partial failure rolls back completely.
-- Two sequential PostgREST calls cannot give that guarantee, and the halfway
-- state (an organization with no owner) is unrecoverable through the UI.
--
-- SECURITY DEFINER is required because there is deliberately no insert policy
-- on organizations. The privilege is contained: the function accepts only a
-- name and a slug, always assigns ownership to auth.uid(), and refuses
-- unauthenticated callers.

create or replace function public.create_organization_with_owner(
  p_name text,
  p_slug text
)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_org   public.organizations;
begin
  if v_actor is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slug must be lowercase alphanumeric with hyphens'
      using errcode = '23514';
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_name), lower(p_slug))
  returning * into v_org;

  -- The caller becomes the active owner in the same transaction. If this fails,
  -- the organization insert above is rolled back with it.
  insert into public.memberships (organization_id, user_id, role, status)
  values (v_org.id, v_actor, 'owner', 'active');

  return v_org;
end;
$$;

revoke execute on function public.create_organization_with_owner(text, text) from public;
grant  execute on function public.create_organization_with_owner(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- An organization must never lose its last owner. A partial unique index can
-- stop two owners but cannot stop zero, so this guard runs on the way out.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := coalesce(old.organization_id, new.organization_id);
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
  then
    if not exists (
      select 1 from public.memberships
      where organization_id = v_org
        and role   = 'owner'
        and status = 'active'
        and id <> old.id
    ) then
      raise exception 'an organization must always have an active owner'
        using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger memberships_prevent_last_owner_removal
  before update or delete on public.memberships
  for each row execute function public.prevent_last_owner_removal();
