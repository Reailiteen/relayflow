-- Local-only stand-in for what Supabase provides.
--
-- The migrations reference `auth.users` and `auth.uid()`, which exist on a
-- hosted Supabase project but not in a bare Postgres. This file creates just
-- enough of them to apply and exercise the schema locally.
--
-- It is NEVER applied to a real project — `supabase db push` only reads
-- supabase/migrations.

create schema if not exists auth;

create table if not exists auth.users (id uuid primary key);

-- Reads the same setting PostgREST populates from the JWT, so policies and
-- RPCs behave the way they will in production.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  end if;
end
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
