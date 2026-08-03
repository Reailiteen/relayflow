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

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- Enough of Supabase's storage schema for 0014 to apply and for its policies to
-- be exercised. `foldername` is the important one: every policy in that
-- migration decides by reading an id out of a fixed position in the object's
-- folder name, so a local copy that split paths differently would let a broken
-- policy pass.
--
-- Matches Supabase's definition — the path minus its last segment, so
-- `candidates/{candidateId}/{documentId}/scan.jpg` yields
-- `{candidates, candidateId, documentId}` and `[2]` is the candidate.

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
alter table storage.objects force row level security;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- Table privileges, so RLS is what actually decides.
--
-- A hosted Supabase project grants `anon` and `authenticated` DML on every
-- table in `public` and lets row-level security do the work. A bare cluster
-- grants them nothing, which makes every "this role cannot write that table"
-- assertion pass for the wrong reason — permission denied at the GRANT layer,
-- with the policy never consulted. Matching Supabase here is what makes the
-- negative cases in 03_app_writes.sql mean anything.
--
-- Applied as default privileges because the tables do not exist yet: this file
-- runs before the migrations, as the same role that will create them.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
