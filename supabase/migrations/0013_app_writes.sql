-- 0013 — make the application's writes actually possible
--
-- 0010 declared every transactional function SECURITY INVOKER, on the principle
-- that moving work into the database must not smuggle in extra privilege. The
-- principle is right; the consequence was not noticed.
--
-- Twenty-three of those functions call `log_activity`, and the only insert
-- policy on `activity_events` is `with check (is_qstp())`. The same shape
-- repeats on `selections_write`, `placements_write`,
-- `placement_requirements_write`, `candidate_choice_fallbacks` and
-- `redistribution_rounds_write`, all of which are `has_qstp_role(...)` only. So
-- a startup owner calling `reserve_candidate`, or a candidate calling
-- `accept_offer` or `submit_requirement`, aborts partway through with 42501.
-- The entire non-QSTP write surface fails by construction, and has since 0009.
--
-- The fix is not to widen the table policies. `selections_write` staying
-- QSTP-only is precisely what stops a startup UPDATE-ing its own row to
-- `status = 'confirmed'` and walking past every guard inside the RPC. The
-- table policy is the backstop; the function is the door.
--
-- So the functions become SECURITY DEFINER.
--
-- ⚠ READ THIS BEFORE EDITING ANY FUNCTION BELOW.
--
-- A SECURITY DEFINER function here runs as its owner, and that owner has
-- BYPASSRLS (`postgres` on Supabase, the bootstrap superuser in
-- supabase/tests/run.sh). RLS does not apply inside these bodies AT ALL. The
-- comment at the top of 0010 — "RLS applies to every statement below exactly as
-- it would to the caller's own query" — is no longer true of the functions
-- restated here.
--
-- The compensating control is the explicit guard that opens every body:
--
--     if not (is_qstp() or is_startup_member(v_startup)) then
--       raise exception '...' using errcode = '42501';
--     end if;
--
-- That guard IS the authorization. A function added here without one is not a
-- missing nicety, it is an open door. Grep for `42501` — every granted function
-- below must appear.
--
-- `auth.uid()` still reads the caller's JWT inside a definer function, so the
-- guards, and the `actor_id`/`selected_by` columns, still name the real actor.
-- Only the table policies stop applying.
--
-- Sections:
--   1. Schema additions the application needs
--   2. Activity logging
--   3. 0010's functions, restated as SECURITY DEFINER with guards
--   4. New functions for multi-table writes that had none
--   5. Index and policy corrections
--   6. Grants

-- ===========================================================================
-- 1. Schema additions
-- ===========================================================================

-- A Qatari ID has two sides and both are needed to read it. Two columns on one
-- row rather than two rows, because two rows can drift: one verified, one not,
-- and no constraint that notices.
alter table candidate_documents
  add column if not exists back_file_name text check (char_length(back_file_name) <= 300),
  add column if not exists back_storage_path text check (char_length(back_storage_path) <= 500);

comment on column candidate_documents.back_storage_path is
  'Reverse side, for kinds that have one (national_id). Null for single-sided documents.';

-- A run is supposed to be a frozen record of a funding decision, but two fields
-- the domain reads off an outcome — which participation it belonged to, and how
-- many hours that startup had asked for — lived only on `cycle_participations`.
-- Reading them back through a join would show a six-month-old run today's
-- request, which is exactly what `policy_snapshot` exists to prevent elsewhere.
alter table prioritisation_results
  add column if not exists participation_id uuid
    references cycle_participations (id) on delete set null,
  add column if not exists requested_hours integer not null default 0
    check (requested_hours >= 0);

-- ===========================================================================
-- 2. Activity logging
-- ===========================================================================

-- Now SECURITY DEFINER, and revoked from `authenticated` below.
--
-- Revoking it is the point. If any authenticated caller could reach this
-- directly they could append an audit row naming themselves a program manager,
-- and an audit log that can be written by the people it audits answers nothing.
-- Nested calls from the definer functions in §3 execute as the owner, which
-- keeps its EXECUTE privilege — so the RPCs still log and nobody else can.
create or replace function log_activity(
  p_cycle_id uuid, p_entity_type text, p_entity_id uuid, p_action text,
  p_actor_role activity_actor_role, p_before jsonb, p_after jsonb, p_reason text
) returns void
language sql security definer
set search_path = public
as $$
  insert into activity_events (
    cycle_id, entity_type, entity_id, action, actor_id, actor_role, before, after, reason
  ) values (
    p_cycle_id, p_entity_type, p_entity_id, p_action, auth.uid(), p_actor_role,
    p_before, p_after, p_reason
  );
$$;

/**
 * The caller's real role, derived rather than accepted.
 *
 * `ActivityPort.append` is reached by candidates and startup members, not only
 * QSTP — a candidate confirming availability writes an event. So the public
 * entry point cannot be QSTP-gated. What it can do is refuse to believe the
 * caller about who they are: the role is read from the identity tables, so
 * "actor_role" in the audit log is a fact rather than a claim.
 */
create or replace function actor_role_of(p_user_id uuid)
returns activity_actor_role
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select s.role::text::activity_actor_role from qstp_staff s where s.user_id = p_user_id),
    (select m.role::text::activity_actor_role from startup_members m
      where m.user_id = p_user_id and m.status = 'active' limit 1),
    (select 'candidate'::activity_actor_role from candidates c where c.user_id = p_user_id limit 1),
    'system'::activity_actor_role
  );
$$;

/**
 * Append one audit event and return it.
 *
 * `log_activity` returns void; the port's `append` promises the row back, and a
 * follow-up SELECT would be filtered to nothing for every non-QSTP caller by
 * `activity_events_select`. So this exists, and returns the row it wrote.
 *
 * The caller supplies no actor: `actor_id` is `auth.uid()` and `actor_role` is
 * derived. The two fields nobody may forge are the two fields the caller cannot
 * reach.
 */
create or replace function append_activity(
  p_cycle_id uuid, p_entity_type text, p_entity_id uuid, p_action text,
  p_before jsonb default null, p_after jsonb default null, p_reason text default null
) returns activity_events
language plpgsql security definer
set search_path = public
as $$
declare
  v_event activity_events;
begin
  if auth.uid() is null then
    raise exception 'an audit event needs an actor' using errcode = '42501';
  end if;

  insert into activity_events (
    cycle_id, entity_type, entity_id, action, actor_id, actor_role, before, after, reason
  ) values (
    p_cycle_id, p_entity_type, p_entity_id, p_action, auth.uid(),
    actor_role_of(auth.uid()), p_before, p_after, p_reason
  ) returning * into v_event;

  return v_event;
end;
$$;

-- ===========================================================================
-- 3. 0010's functions, restated as SECURITY DEFINER with explicit guards
-- ===========================================================================
--
-- Bodies are unchanged from 0010 except for the guard at the top. Functions in
-- 0010 that neither log nor touch a table their caller is denied —
-- `save_extraction_run`, `import_candidates`, `share_pool`,
-- `snapshot_placement_requirements` — are QSTP-only and stay SECURITY INVOKER.
-- Leaving them alone is deliberate: fewer definer functions is fewer doors.

-- --- Cycle ------------------------------------------------------------------

create or replace function create_cycle_with_participations(
  p_name text, p_starts_on date, p_ends_on date, p_funded_weekly_hours integer,
  p_selection_mode selection_mode, p_deadlines jsonb, p_clone_from uuid default null
) returns cycles
language plpgsql security definer
set search_path = public
as $$
declare
  v_cycle cycles;
begin
  if not has_qstp_role('program_manager') then
    raise exception 'only a programme manager may create a cycle' using errcode = '42501';
  end if;

  insert into cycles (name, starts_on, ends_on, funded_weekly_hours, selection_mode, deadlines)
  values (p_name, p_starts_on, p_ends_on, p_funded_weekly_hours, p_selection_mode, p_deadlines)
  returning * into v_cycle;

  if p_clone_from is not null then
    insert into cycle_participations (cycle_id, startup_id, status, disciplines)
    select v_cycle.id, startup_id, 'invited', disciplines
    from cycle_participations
    where cycle_id = p_clone_from and status <> 'archived';
  end if;

  perform log_activity(v_cycle.id, 'cycle', v_cycle.id, 'created', 'program_manager',
    null, to_jsonb(v_cycle), null);
  return v_cycle;
end;
$$;

create or replace function advance_cycle_stage(p_cycle_id uuid, p_to_stage cycle_stage)
returns cycles
language plpgsql security definer
set search_path = public
as $$
declare
  v_before cycles;
  v_after cycles;
begin
  if not has_qstp_role('program_manager') then
    raise exception 'only a programme manager may advance a stage' using errcode = '42501';
  end if;

  select * into v_before from cycles where id = p_cycle_id for update;
  if not found then raise exception 'cycle not found' using errcode = 'no_data_found'; end if;

  if array_position(enum_range(null::cycle_stage), p_to_stage)
     <= array_position(enum_range(null::cycle_stage), v_before.stage) then
    raise exception 'cycle stages advance forwards only' using errcode = 'check_violation';
  end if;

  update cycles set stage = p_to_stage where id = p_cycle_id returning * into v_after;
  perform log_activity(p_cycle_id, 'cycle', p_cycle_id, 'stage_advanced', 'program_manager',
    to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$$;

-- --- Allocation -------------------------------------------------------------

/**
 * The allocation write, without an authorization check.
 *
 * Split out because `respond_to_redistribution` is called by a STARTUP owner
 * accepting a grant, and the grant is written through the same budget check as
 * every other allocation. A guarded `decide_allocation` would refuse them —
 * correctly, since a startup may not allocate to itself — so the outer function
 * authorizes the *response* and then reaches the write directly.
 *
 * Revoked from `authenticated` below. It is reachable only from the two
 * functions that have already decided the caller is allowed.
 */
create or replace function decide_allocation_unchecked(
  p_cycle_id uuid, p_startup_id uuid, p_weekly_hours hour_tier,
  p_score numeric default null, p_justification text default null,
  p_override_reason text default null, p_redistribution_round_id uuid default null
) returns allocations
language plpgsql security definer
set search_path = public
as $$
declare
  v_funded integer;
  v_allocated integer;
  v_current allocations;
  v_next allocations;
begin
  select funded_weekly_hours into v_funded from cycles where id = p_cycle_id for update;
  if not found then raise exception 'cycle not found' using errcode = 'no_data_found'; end if;

  select * into v_current
  from allocations
  where cycle_id = p_cycle_id and startup_id = p_startup_id and status <> 'superseded'
  for update;

  -- The budget check runs HERE, inside the write, not only in the application.
  -- Two operations allocating at the same moment would both pass a check made
  -- against a stale read, and the overrun surfaces at payroll.
  select coalesce(sum(weekly_hours), 0) into v_allocated
  from allocations
  where cycle_id = p_cycle_id and status = 'confirmed' and startup_id <> p_startup_id;

  if v_allocated + p_weekly_hours > v_funded then
    raise exception 'allocation exceeds the cycle budget: % of % weekly hours already committed',
      v_allocated, v_funded using errcode = 'check_violation';
  end if;

  if v_current.id is not null then
    update allocations set status = 'superseded' where id = v_current.id;
  end if;

  insert into allocations (
    cycle_id, startup_id, weekly_hours, status, score, justification, override_reason,
    from_redistribution, revision, supersedes_allocation_id, redistribution_round_id,
    decided_by, decided_at
  ) values (
    p_cycle_id, p_startup_id, p_weekly_hours, 'confirmed', p_score, p_justification,
    p_override_reason, p_redistribution_round_id is not null,
    coalesce(v_current.revision, 0) + 1, v_current.id, p_redistribution_round_id,
    auth.uid(), now()
  ) returning * into v_next;

  perform log_activity(p_cycle_id, 'allocation', v_next.id, 'decided',
    actor_role_of(auth.uid()), to_jsonb(v_current), to_jsonb(v_next), p_override_reason);
  return v_next;
end;
$$;

create or replace function decide_allocation(
  p_cycle_id uuid, p_startup_id uuid, p_weekly_hours hour_tier,
  p_score numeric default null, p_justification text default null,
  p_override_reason text default null, p_redistribution_round_id uuid default null
) returns allocations
language plpgsql security definer
set search_path = public
as $$
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may set an allocation' using errcode = '42501';
  end if;
  return decide_allocation_unchecked(
    p_cycle_id, p_startup_id, p_weekly_hours, p_score, p_justification,
    p_override_reason, p_redistribution_round_id);
end;
$$;

-- --- Prioritisation ---------------------------------------------------------

create or replace function create_prioritisation_run(
  p_cycle_id uuid, p_run jsonb, p_results jsonb
) returns prioritisation_runs
language plpgsql security definer
set search_path = public
as $$
declare
  v_version integer;
  v_run prioritisation_runs;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may run prioritisation' using errcode = '42501';
  end if;

  update prioritisation_runs set status = 'superseded'
  where cycle_id = p_cycle_id and status = 'draft';

  select coalesce(max(version), 0) + 1 into v_version
  from prioritisation_runs where cycle_id = p_cycle_id;

  insert into prioritisation_runs (
    cycle_id, version, status, policy_version_id, policy_snapshot, history_snapshot,
    budget_hours, maximum_qualified_hours, proposed_hours, residual_hours, within_budget,
    allocation_mode, allocation_strategy, completeness, signals, distribution, created_by
  ) values (
    p_cycle_id, v_version, 'draft',
    (p_run ->> 'policyVersionId')::uuid,
    p_run -> 'policySnapshot',
    p_run -> 'historySnapshot',
    (p_run ->> 'budgetHours')::integer,
    (p_run ->> 'maximumQualifiedHours')::integer,
    (p_run ->> 'proposedHours')::integer,
    (p_run ->> 'residualHours')::integer,
    (p_run ->> 'withinBudget')::boolean,
    (p_run ->> 'allocationMode')::allocation_mode,
    p_run ->> 'allocationStrategy',
    (p_run ->> 'completeness')::prioritisation_run_completeness,
    coalesce(p_run -> 'signals', '[]'::jsonb),
    p_run -> 'distribution',
    auth.uid()
  ) returning * into v_run;

  insert into prioritisation_results (
    run_id, startup_id, participation_id, requested_hours,
    rating_id, extraction_run_id, status, score, breakdown,
    history_source, rank, tie_group, requires_tie_resolution, maximum_hours, proposed_hours,
    waitlist_rank, waitlist_order_status, waitlist_reason,
    blockers, signals, adjustments, position_checks
  )
  select
    v_run.id,
    (r ->> 'startupId')::uuid,
    (r ->> 'participationId')::uuid,
    coalesce((r ->> 'requestedHours')::integer, 0),
    (r ->> 'ratingId')::uuid,
    (r ->> 'extractionRunId')::uuid,
    (r ->> 'status')::startup_outcome_status,
    (r ->> 'score')::numeric,
    r -> 'breakdown',
    r ->> 'historySource',
    (r ->> 'rank')::integer,
    (r ->> 'tieGroup')::integer,
    coalesce((r ->> 'requiresTieResolution')::boolean, false),
    (r ->> 'maximumHours')::hour_tier,
    (r ->> 'proposedHours')::hour_tier,
    (r ->> 'waitlistRank')::integer,
    (r ->> 'waitlistOrderStatus')::waitlist_order_status,
    r ->> 'waitlistReason',
    coalesce(r -> 'blockers', '[]'::jsonb),
    coalesce(r -> 'signals', '[]'::jsonb),
    coalesce(r -> 'adjustments', '[]'::jsonb),
    coalesce(r -> 'positionChecks', '[]'::jsonb)
  from jsonb_array_elements(p_results) as r;

  perform log_activity(p_cycle_id, 'prioritisation_run', v_run.id, 'created', 'operations',
    null, to_jsonb(v_run), null);
  return v_run;
end;
$$;

create or replace function adjust_prioritisation_result(
  p_run_id uuid, p_startup_id uuid, p_hours hour_tier, p_reason text
) returns prioritisation_results
language plpgsql security definer
set search_path = public
as $$
declare
  v_before prioritisation_results;
  v_after prioritisation_results;
  v_cycle uuid;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may adjust a proposal' using errcode = '42501';
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'an adjustment needs a reason' using errcode = 'check_violation';
  end if;

  select cycle_id into v_cycle from prioritisation_runs
  where id = p_run_id and status = 'draft';
  if not found then
    raise exception 'no draft run to adjust' using errcode = 'no_data_found';
  end if;

  select * into v_before from prioritisation_results
  where run_id = p_run_id and startup_id = p_startup_id for update;

  if v_before.status <> 'scored' then
    raise exception 'only a scored startup can be adjusted (this one is %)', v_before.status
      using errcode = 'check_violation';
  end if;

  update prioritisation_results
  set adjusted_hours = p_hours, adjustment_reason = p_reason
  where id = v_before.id returning * into v_after;

  perform log_activity(v_cycle, 'prioritisation_result', v_after.id, 'adjusted', 'operations',
    to_jsonb(v_before), to_jsonb(v_after), p_reason);
  return v_after;
end;
$$;

create or replace function publish_prioritisation_run(
  p_run_id uuid, p_acknowledge_incomplete boolean default false, p_reason text default null
) returns prioritisation_runs
language plpgsql security definer
set search_path = public
as $$
declare
  v_run prioritisation_runs;
  v_result record;
begin
  if not has_qstp_role('program_manager') then
    raise exception 'only a programme manager may publish allocations' using errcode = '42501';
  end if;

  select * into v_run from prioritisation_runs where id = p_run_id and status = 'draft' for update;
  if not found then
    raise exception 'no draft run to publish' using errcode = 'no_data_found';
  end if;

  if not v_run.within_budget then
    raise exception 'the draft does not fit the cycle budget' using errcode = 'check_violation';
  end if;

  if v_run.completeness = 'partial_draft' and not p_acknowledge_incomplete then
    raise exception
      'this draft is incomplete; publishing it would drop every unevaluated startup'
      using errcode = 'check_violation';
  end if;

  for v_result in
    select * from prioritisation_results
    where run_id = p_run_id and status = 'scored'
    order by rank nulls last
  loop
    perform decide_allocation_unchecked(
      v_run.cycle_id,
      v_result.startup_id,
      coalesce(v_result.adjusted_hours, v_result.proposed_hours),
      v_result.score,
      null,
      v_result.adjustment_reason
    );
  end loop;

  update prioritisation_runs
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_run_id returning * into v_run;

  perform log_activity(v_run.cycle_id, 'prioritisation_run', v_run.id, 'published', 'operations',
    null, to_jsonb(v_run), p_reason);
  return v_run;
end;
$$;

create or replace function submit_startup_rating(
  p_cycle_id uuid, p_startup_id uuid, p_items jsonb, p_revision_reason text default null
) returns startup_ratings
language plpgsql security definer
set search_path = public
as $$
declare
  v_prior uuid;
  v_rating startup_ratings;
  v_count integer;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may rate a startup' using errcode = '42501';
  end if;

  if jsonb_array_length(p_items) <> 6 then
    raise exception 'all six dimensions must be rated together' using errcode = 'check_violation';
  end if;

  select id into v_prior from startup_ratings
  where cycle_id = p_cycle_id and startup_id = p_startup_id and status = 'submitted'
  for update;

  if v_prior is not null then
    if p_revision_reason is null then
      raise exception 'revising a submitted rating needs a reason' using errcode = 'check_violation';
    end if;
    update startup_ratings set status = 'superseded' where id = v_prior;
  end if;

  insert into startup_ratings (
    cycle_id, startup_id, status, rated_by, supersedes_id, revision_reason, submitted_at
  ) values (
    p_cycle_id, p_startup_id, 'submitted', auth.uid(), v_prior, p_revision_reason, now()
  ) returning * into v_rating;

  insert into startup_rating_items (rating_id, dimension, value, rationale)
  select v_rating.id, (i ->> 'dimension')::rating_key, (i ->> 'value')::smallint, i ->> 'rationale'
  from jsonb_array_elements(p_items) as i;

  select count(*) into v_count from startup_rating_items where rating_id = v_rating.id;
  if v_count <> 6 then
    raise exception 'the six ratings must name six distinct dimensions'
      using errcode = 'check_violation';
  end if;

  perform log_activity(p_cycle_id, 'startup_rating', v_rating.id, 'submitted', 'operations',
    null, to_jsonb(v_rating), p_revision_reason);
  return v_rating;
end;
$$;

-- --- Positions --------------------------------------------------------------

create or replace function transition_position(
  p_position_id uuid, p_to_status position_status, p_note text default null
) returns positions
language plpgsql security definer
set search_path = public
as $$
declare
  v_before positions;
  v_after positions;
begin
  select * into v_before from positions where id = p_position_id for update;
  if not found then raise exception 'position not found' using errcode = 'no_data_found'; end if;

  -- A startup moves its own position through draft → submitted → resubmitted.
  -- Everything past that — approving, locking, closing — is QSTP's, and the
  -- split is what stops a startup approving its own posting.
  if p_to_status in ('draft', 'submitted', 'resubmitted', 'withdrawn') then
    if not (is_qstp() or is_startup_member(v_before.startup_id)) then
      raise exception 'not your position' using errcode = '42501';
    end if;
  elsif not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may review a position' using errcode = '42501';
  end if;

  update positions set status = p_to_status, review_note = p_note
  where id = p_position_id returning * into v_after;

  insert into position_review_history (position_id, status, note, actor_id)
  values (p_position_id, p_to_status, p_note, auth.uid());

  perform log_activity(v_after.cycle_id, 'position', p_position_id, 'transitioned',
    actor_role_of(auth.uid()), to_jsonb(v_before), to_jsonb(v_after), p_note);
  return v_after;
end;
$$;

-- --- Candidates -------------------------------------------------------------

create or replace function set_candidate_availability(
  p_candidate_id uuid, p_availability availability_status
) returns candidates
language plpgsql security definer
set search_path = public
as $$
declare
  v_before candidates;
  v_after candidates;
begin
  if not (is_qstp() or owns_candidate(p_candidate_id)) then
    raise exception 'not your record' using errcode = '42501';
  end if;

  -- `placed` is a consequence of a confirmed selection, never a self-report.
  if p_availability = 'placed' and not is_qstp() then
    raise exception 'only QSTP may mark a candidate placed' using errcode = '42501';
  end if;

  select * into v_before from candidates where id = p_candidate_id for update;
  if not found then raise exception 'candidate not found' using errcode = 'no_data_found'; end if;

  update candidates
  set availability = p_availability,
      availability_confirmed_at = case when p_availability = 'unconfirmed' then null else now() end
  where id = p_candidate_id returning * into v_after;

  if p_availability in ('employed', 'not_interested', 'temporarily_unavailable') then
    update pool_entries set status = 'withdrawn'
    where candidate_id = p_candidate_id
      and status not in ('rejected', 'lost', 'withdrawn', 'selected');

    update selections set status = 'released', released_at = now()
    where candidate_id = p_candidate_id and status in ('offered', 'reserved');
  end if;

  perform log_activity(v_after.cycle_id, 'candidate', p_candidate_id, 'availability_set',
    actor_role_of(auth.uid()), to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$$;

-- --- Selection --------------------------------------------------------------

/**
 * Reserve a candidate for a position.
 *
 * On conflict this returns NULL and records a `selection_conflicts` row. It
 * deliberately does NOT re-raise: PostgREST runs one transaction per request,
 * so raising would roll back the conflict row we just wrote along with
 * everything else — and the conflict record is the entire point.
 *
 * Callers must treat NULL as "conflicted, go read the conflict", not as
 * "nothing happened". The TypeScript adapter uses `rpcOrConflict` for exactly
 * this, because parsing NULL through an entity schema would throw an error that
 * reads like a migration bug.
 */
create or replace function reserve_candidate(
  p_position_id uuid, p_candidate_id uuid, p_status selection_status default 'reserved'
) returns selections
language plpgsql security definer
set search_path = public
as $$
declare
  v_startup uuid;
  v_cycle uuid;
  v_selection selections;
  v_blocking selections;
  v_conflict selection_conflicts;
begin
  select startup_id, cycle_id into v_startup, v_cycle from positions where id = p_position_id;
  if not found then raise exception 'position not found' using errcode = 'no_data_found'; end if;

  if not (is_qstp() or is_startup_member(v_startup)) then
    raise exception 'not your position' using errcode = '42501';
  end if;

  -- Only the two claim kinds a startup makes. `accepted`/`confirmed` are
  -- reached through accept_offer and confirm_selection, which have their own
  -- guards; letting a caller name them here would route around both.
  if p_status not in ('reserved', 'offered') then
    raise exception 'a claim starts as reserved or offered' using errcode = 'check_violation';
  end if;

  begin
    insert into selections (position_id, startup_id, candidate_id, status, selected_by)
    values (p_position_id, v_startup, p_candidate_id, p_status, auth.uid())
    returning * into v_selection;
  exception when unique_violation then
    select * into v_blocking from selections
    where candidate_id = p_candidate_id and status in ('reserved', 'accepted', 'confirmed')
    limit 1;

    -- A duplicate offer from the same startup for the same position trips
    -- selections_one_open_offer_idx instead, and there is no blocking claim to
    -- point at. That is a duplicate, not a contest, and gets no conflict row.
    if v_blocking.id is null then
      raise exception 'you have already offered this role to this candidate'
        using errcode = 'unique_violation';
    end if;

    insert into selection_conflicts (
      cycle_id, candidate_id, blocking_selection_id, previous_startup_id, requested_startup_id
    ) values (v_cycle, p_candidate_id, v_blocking.id, v_blocking.startup_id, v_startup)
    returning * into v_conflict;

    perform log_activity(v_cycle, 'selection_conflict', v_conflict.id, 'recorded', 'operations',
      null, to_jsonb(v_conflict), 'candidate already held by another startup');
    return null;
  end;

  update pool_entries set status = 'selected', reviewed_at = now()
  where position_id = p_position_id and candidate_id = p_candidate_id;

  perform log_activity(v_cycle, 'selection', v_selection.id, p_status::text,
    actor_role_of(auth.uid()), null, to_jsonb(v_selection), null);
  return v_selection;
end;
$$;

/** Accept one offer and decline every sibling in the same breath. */
create or replace function accept_offer(p_selection_id uuid)
returns selections
language plpgsql security definer
set search_path = public
as $$
declare
  v_selection selections;
  v_cycle uuid;
begin
  select * into v_selection from selections where id = p_selection_id for update;
  if not found then raise exception 'selection not found' using errcode = 'no_data_found'; end if;

  if not (is_qstp() or owns_candidate(v_selection.candidate_id)) then
    raise exception 'not your offer' using errcode = '42501';
  end if;

  if v_selection.status <> 'offered' then
    raise exception 'this offer is no longer open' using errcode = 'check_violation';
  end if;

  update selections set status = 'reserved', accepted_at = now()
  where id = p_selection_id returning * into v_selection;

  -- Atomic with the accept. A candidate holding a live offer they have already
  -- turned down is how a startup wastes a week chasing them.
  update selections set status = 'declined'
  where candidate_id = v_selection.candidate_id
    and id <> p_selection_id
    and status in ('offered', 'reserved');

  update pool_entries e set status = 'lost'
  from selections s
  where s.candidate_id = v_selection.candidate_id
    and s.id <> p_selection_id
    and e.position_id = s.position_id
    and e.candidate_id = v_selection.candidate_id
    and e.status not in ('rejected', 'lost', 'withdrawn');

  select cycle_id into v_cycle from positions where id = v_selection.position_id;
  perform log_activity(v_cycle, 'selection', p_selection_id, 'accepted', 'candidate',
    null, to_jsonb(v_selection), null);
  return v_selection;
end;
$$;

create or replace function release_selection(p_selection_id uuid, p_reason text default null)
returns selections
language plpgsql security definer
set search_path = public
as $$
declare
  v_selection selections;
  v_cycle uuid;
begin
  select * into v_selection from selections where id = p_selection_id for update;
  if not found then raise exception 'selection not found' using errcode = 'no_data_found'; end if;

  if not (is_qstp() or is_startup_member(v_selection.startup_id)) then
    raise exception 'not your claim' using errcode = '42501';
  end if;

  update selections set status = 'released', released_at = now()
  where id = p_selection_id returning * into v_selection;

  update pool_entries set status = 'rejected'
  where position_id = v_selection.position_id and candidate_id = v_selection.candidate_id;

  -- Back into the pool, not left in limbo.
  update candidates set availability = 'available'
  where id = v_selection.candidate_id and availability = 'placed';

  select cycle_id into v_cycle from positions where id = v_selection.position_id;
  perform log_activity(v_cycle, 'selection', p_selection_id, 'released',
    actor_role_of(auth.uid()), null, to_jsonb(v_selection), p_reason);
  return v_selection;
end;
$$;

create or replace function resolve_selection_conflict(
  p_conflict_id uuid, p_resolution selection_conflict_status, p_reason text
) returns selection_conflicts
language plpgsql security definer
set search_path = public
as $$
declare
  v_conflict selection_conflicts;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may resolve a conflict' using errcode = '42501';
  end if;

  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'resolving a conflict needs a reason' using errcode = 'check_violation';
  end if;

  update selection_conflicts
  set status = p_resolution, resolved_by = auth.uid(), resolved_at = now(), reason = p_reason
  where id = p_conflict_id and status = 'open'
  returning * into v_conflict;
  if not found then raise exception 'no open conflict' using errcode = 'no_data_found'; end if;

  if p_resolution = 'overridden' and v_conflict.attempted_selection_id is not null then
    perform release_selection(v_conflict.blocking_selection_id, p_reason);
    update selections
    set status = 'reserved', override_reason = p_reason, overridden_by = auth.uid()
    where id = v_conflict.attempted_selection_id;
  end if;

  perform log_activity(v_conflict.cycle_id, 'selection_conflict', p_conflict_id, 'resolved',
    'program_manager', null, to_jsonb(v_conflict), p_reason);
  return v_conflict;
end;
$$;

create or replace function decide_exception(
  p_exception_id uuid, p_status exception_status,
  p_granted_deadline timestamptz default null, p_note text default null
) returns exception_requests
language plpgsql security definer
set search_path = public
as $$
declare
  v_exception exception_requests;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may decide an exception' using errcode = '42501';
  end if;

  update exception_requests
  set status = p_status, granted_deadline = p_granted_deadline, decision_note = p_note,
      decided_by = auth.uid(), decided_at = now()
  where id = p_exception_id and status = 'pending'
  returning * into v_exception;
  if not found then raise exception 'no pending exception' using errcode = 'no_data_found'; end if;

  if p_status = 'approved' and p_granted_deadline is not null then
    update recovery_cases
    set status = 'exception_protected', protected_until = p_granted_deadline
    where cycle_id = v_exception.cycle_id
      and startup_id = v_exception.startup_id
      and status = 'potential';
  end if;

  perform log_activity(v_exception.cycle_id, 'exception', p_exception_id, 'decided',
    'program_manager', null, to_jsonb(v_exception), p_note);
  return v_exception;
end;
$$;

-- --- Placement and onboarding -----------------------------------------------

create or replace function confirm_selection(
  p_selection_id uuid, p_starts_on date, p_ends_on date,
  p_supervisor_name text, p_supervisor_id uuid default null
) returns placements
language plpgsql security definer
set search_path = public
as $$
declare
  v_selection selections;
  v_position positions;
  v_placement placements;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may confirm a placement' using errcode = '42501';
  end if;

  select * into v_selection from selections where id = p_selection_id for update;
  if not found then raise exception 'selection not found' using errcode = 'no_data_found'; end if;

  select * into v_position from positions where id = v_selection.position_id for update;

  update selections set status = 'confirmed', confirmed_at = now() where id = p_selection_id;

  insert into placements (
    cycle_id, selection_id, candidate_id, startup_id, position_id,
    committed_weekly_hours, starts_on, ends_on, supervisor_id, supervisor_name
  ) values (
    v_position.cycle_id, p_selection_id, v_selection.candidate_id, v_selection.startup_id,
    v_selection.position_id, v_position.hours_per_intern, p_starts_on, p_ends_on,
    p_supervisor_id, p_supervisor_name
  ) returning * into v_placement;

  update positions set status = 'filled' where id = v_selection.position_id;
  update candidates set availability = 'placed' where id = v_selection.candidate_id;

  perform log_activity(v_position.cycle_id, 'placement', v_placement.id, 'confirmed',
    'operations', null, to_jsonb(v_placement), null);
  return v_placement;
end;
$$;

create or replace function cancel_placement(p_placement_id uuid, p_reason text)
returns placements
language plpgsql security definer
set search_path = public
as $$
declare
  v_placement placements;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may cancel a placement' using errcode = '42501';
  end if;

  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'cancelling a placement needs a reason' using errcode = 'check_violation';
  end if;

  update placements
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
  where id = p_placement_id and status <> 'cancelled'
  returning * into v_placement;
  if not found then raise exception 'placement not found' using errcode = 'no_data_found'; end if;

  -- The recovery case is created in the same transaction, because hours freed
  -- by a cancellation that nobody records are hours the cycle never gets back.
  insert into recovery_cases (
    cycle_id, startup_id, placement_id, recoverable_hours, status, reason
  ) values (
    v_placement.cycle_id, v_placement.startup_id, v_placement.id,
    v_placement.committed_weekly_hours, 'potential', p_reason
  );

  update selections set status = 'cancelled' where id = v_placement.selection_id;
  update positions set status = 'approved' where id = v_placement.position_id;
  -- The fixture adapter also frees the candidate. Matching it here keeps the
  -- two from disagreeing about whether a cancelled intern is available again.
  update candidates set availability = 'available'
  where id = v_placement.candidate_id and availability = 'placed';

  perform log_activity(v_placement.cycle_id, 'placement', p_placement_id, 'cancelled',
    'operations', null, to_jsonb(v_placement), p_reason);
  return v_placement;
end;
$$;

create or replace function submit_requirement(
  p_requirement_id uuid, p_file_name text, p_storage_path text,
  p_fields jsonb default '[]', p_correction_reason text default null
) returns requirement_submissions
language plpgsql security definer
set search_path = public
as $$
declare
  v_revision integer;
  v_submission requirement_submissions;
  v_requirement placement_requirements;
  v_placement placements;
begin
  select * into v_requirement from placement_requirements
  where id = p_requirement_id for update;
  if not found then raise exception 'requirement not found' using errcode = 'no_data_found'; end if;

  select * into v_placement from placements where id = v_requirement.placement_id;

  -- The party who owns the requirement is the party who may satisfy it. A
  -- startup uploading a candidate's bank form on their behalf is not a
  -- convenience, it is an unaccountable document.
  if not (
    is_qstp()
    or (v_requirement.owner = 'candidate' and owns_candidate(v_placement.candidate_id))
    or (v_requirement.owner = 'startup' and is_startup_member(v_placement.startup_id))
  ) then
    raise exception 'this requirement is not yours to satisfy' using errcode = '42501';
  end if;

  if v_requirement.status in ('approved', 'waived') then
    raise exception 'this requirement is already settled' using errcode = 'check_violation';
  end if;

  select coalesce(max(revision), 0) + 1 into v_revision
  from requirement_submissions where requirement_id = p_requirement_id;

  insert into requirement_submissions (
    requirement_id, revision, file_name, storage_path, submitted_by, correction_reason
  ) values (
    p_requirement_id, v_revision, p_file_name, p_storage_path, auth.uid(), p_correction_reason
  ) returning * into v_submission;

  -- `extracted` only. `confirmed` stays null until a person verifies it — the
  -- model's reading is never promoted to a confirmed value by the act of
  -- uploading.
  insert into requirement_submission_fields (submission_id, key, label, extracted, confidence)
  select v_submission.id, f ->> 'key', f ->> 'label', f ->> 'extracted',
         (f ->> 'confidence')::numeric
  from jsonb_array_elements(p_fields) as f;

  update placement_requirements
  set status = case when v_revision > 1 then 'resubmitted' else 'uploaded' end
  where id = p_requirement_id;

  return v_submission;
end;
$$;

-- --- Redistribution ---------------------------------------------------------

create or replace function create_redistribution_round(
  p_cycle_id uuid, p_recovery_case_ids uuid[],
  p_position_deadline timestamptz, p_selection_deadline timestamptz
) returns redistribution_rounds
language plpgsql security definer
set search_path = public
as $$
declare
  v_number integer;
  v_hours integer;
  v_round redistribution_rounds;
begin
  if not has_qstp_role('program_manager') then
    raise exception 'only a programme manager may run redistribution' using errcode = '42501';
  end if;

  select coalesce(sum(recoverable_hours), 0) into v_hours
  from recovery_cases
  where id = any (p_recovery_case_ids) and cycle_id = p_cycle_id and status = 'confirmed';

  if v_hours = 0 then
    raise exception 'no confirmed recoverable hours in this selection'
      using errcode = 'check_violation';
  end if;

  select coalesce(max(number), 0) + 1 into v_number
  from redistribution_rounds where cycle_id = p_cycle_id;

  insert into redistribution_rounds (
    cycle_id, number, status, available_hours, position_deadline, selection_deadline, created_by
  ) values (
    p_cycle_id, v_number, 'draft', v_hours, p_position_deadline, p_selection_deadline, auth.uid()
  ) returning * into v_round;

  update recovery_cases
  set status = 'recovered', redistribution_round_id = v_round.id
  where id = any (p_recovery_case_ids) and status = 'confirmed';

  perform log_activity(p_cycle_id, 'redistribution_round', v_round.id, 'created',
    'program_manager', null, to_jsonb(v_round), null);
  return v_round;
end;
$$;

/**
 * A startup answers an invitation.
 *
 * The hour_tier cast here was a latent bug: a startup already on 40 accepting a
 * grant of 30 produced `70::hour_tier`, and the domain permits only
 * 60/40/30/20/0. The cast raised 23514 mid-transaction with a message about a
 * check constraint, which tells an operator nothing about what to do.
 *
 * Refusing explicitly is the honest answer. The two numbers do not add up to a
 * tier, and the programme runs on agreed bands — silently rounding 70 down to
 * 60 would hand somebody ten hours less than they were promised and record it
 * as if it were the offer.
 */
create or replace function respond_to_redistribution(
  p_round_id uuid, p_startup_id uuid, p_response redistribution_invitation_status
) returns redistribution_invitations
language plpgsql security definer
set search_path = public
as $$
declare
  v_invitation redistribution_invitations;
  v_round redistribution_rounds;
  v_current hour_tier;
  v_next integer;
  v_accepted integer;
begin
  if not (is_qstp() or is_startup_member(p_startup_id)) then
    raise exception 'not your invitation' using errcode = '42501';
  end if;

  select * into v_round from redistribution_rounds where id = p_round_id for update;
  if not found then raise exception 'round not found' using errcode = 'no_data_found'; end if;

  update redistribution_invitations
  set status = p_response, responded_at = now()
  where round_id = p_round_id and startup_id = p_startup_id and status = 'invited'
  returning * into v_invitation;
  if not found then raise exception 'no open invitation' using errcode = 'no_data_found'; end if;

  if p_response = 'accepted' then
    -- The round's own ceiling, checked before the cycle's. Handing out more
    -- than was recovered would be an overrun invented by the recovery process.
    select coalesce(sum(proposed_hours), 0) into v_accepted
    from redistribution_invitations
    where round_id = p_round_id and status = 'accepted' and startup_id <> p_startup_id;

    if v_accepted + v_invitation.proposed_hours > v_round.available_hours then
      raise exception 'the round no longer has enough hours for this grant'
        using errcode = 'check_violation';
    end if;

    select weekly_hours into v_current from allocations
    where cycle_id = v_round.cycle_id and startup_id = p_startup_id and status <> 'superseded';

    v_next := coalesce(v_current, 0) + v_invitation.proposed_hours;
    if v_next not in (0, 20, 30, 40, 60) then
      raise exception
        'granting % hours on top of % does not land on a tier (%)',
        v_invitation.proposed_hours, coalesce(v_current, 0), v_next
        using errcode = 'check_violation';
    end if;

    perform decide_allocation_unchecked(
      v_round.cycle_id, p_startup_id, v_next::hour_tier,
      null, 'redistribution round ' || v_round.number, null, p_round_id
    );

    update redistribution_rounds set status = 'accelerated_positions'
    where id = p_round_id and status = 'invitations';
  end if;

  return v_invitation;
end;
$$;

-- ===========================================================================
-- 4. New functions for multi-table writes that had none
-- ===========================================================================

-- --- Positions --------------------------------------------------------------

/**
 * Create a position, and record its first review-history entry when it is
 * submitted rather than saved as a draft.
 *
 * A jsonb payload rather than fourteen parameters: the shape is
 * `CreatePositionCommand` in @relayflow/ports, and keeping it one argument
 * means adding a field is a schema change in one place, not a signature change
 * that silently reorders at every call site.
 */
create or replace function create_position(p_position jsonb)
returns positions
language plpgsql security definer
set search_path = public
as $$
declare
  v_startup uuid := (p_position ->> 'startupId')::uuid;
  v_status position_status := coalesce((p_position ->> 'status')::position_status, 'draft');
  v_position positions;
begin
  if not (is_qstp() or is_startup_member(v_startup)) then
    raise exception 'not your startup' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'submitted') then
    raise exception 'a new position starts as a draft or a submission'
      using errcode = 'check_violation';
  end if;

  insert into positions (
    cycle_id, startup_id, intent_id, title, description, required_skills,
    work_arrangement, additional_requirements, intern_count, hours_per_intern,
    duration_weeks, supervisor_name, status, redistribution_round_id
  ) values (
    (p_position ->> 'cycleId')::uuid,
    v_startup,
    (p_position ->> 'intentId')::uuid,
    p_position ->> 'title',
    p_position ->> 'description',
    coalesce(array(select jsonb_array_elements_text(p_position -> 'requiredSkills')), '{}'),
    (p_position ->> 'workArrangement')::work_arrangement,
    p_position ->> 'additionalRequirements',
    (p_position ->> 'internCount')::integer,
    (p_position ->> 'hoursPerIntern')::integer,
    (p_position ->> 'durationWeeks')::integer,
    p_position ->> 'supervisorName',
    v_status,
    (p_position ->> 'redistributionRoundId')::uuid
  ) returning * into v_position;

  if v_status = 'submitted' then
    insert into position_review_history (position_id, status, note, actor_id)
    values (v_position.id, v_status, null, auth.uid());
  end if;

  perform log_activity(v_position.cycle_id, 'position', v_position.id, 'created',
    actor_role_of(auth.uid()), null, to_jsonb(v_position), null);
  return v_position;
end;
$$;

create or replace function update_position_details(p_position_id uuid, p_position jsonb)
returns positions
language plpgsql security definer
set search_path = public
as $$
declare
  v_before positions;
  v_after positions;
begin
  select * into v_before from positions where id = p_position_id for update;
  if not found then raise exception 'position not found' using errcode = 'no_data_found'; end if;

  if not (is_qstp() or is_startup_member(v_before.startup_id)) then
    raise exception 'not your position' using errcode = '42501';
  end if;

  -- Editing the terms of a position somebody has already been placed against
  -- would change what an intern agreed to after they agreed to it.
  if v_before.status in ('filled', 'closed', 'withdrawn') then
    raise exception 'a settled position cannot be edited' using errcode = 'check_violation';
  end if;

  update positions set
    title = p_position ->> 'title',
    description = p_position ->> 'description',
    required_skills =
      coalesce(array(select jsonb_array_elements_text(p_position -> 'requiredSkills')), '{}'),
    work_arrangement = (p_position ->> 'workArrangement')::work_arrangement,
    additional_requirements = p_position ->> 'additionalRequirements',
    intern_count = (p_position ->> 'internCount')::integer,
    hours_per_intern = (p_position ->> 'hoursPerIntern')::integer,
    duration_weeks = (p_position ->> 'durationWeeks')::integer,
    supervisor_name = p_position ->> 'supervisorName'
  where id = p_position_id returning * into v_after;

  perform log_activity(v_after.cycle_id, 'position', p_position_id, 'updated',
    actor_role_of(auth.uid()), to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$$;

-- --- Selection --------------------------------------------------------------

/** A candidate accepts a first-come reservation before QSTP confirms it. */
create or replace function accept_reservation(p_selection_id uuid)
returns selections
language plpgsql security definer
set search_path = public
as $$
declare
  v_selection selections;
  v_cycle uuid;
begin
  select * into v_selection from selections where id = p_selection_id for update;
  if not found then raise exception 'selection not found' using errcode = 'no_data_found'; end if;

  if not owns_candidate(v_selection.candidate_id) then
    raise exception 'not your reservation' using errcode = '42501';
  end if;
  if v_selection.status <> 'reserved' then
    raise exception 'this reservation is not awaiting acceptance' using errcode = 'check_violation';
  end if;

  update selections set status = 'accepted', accepted_at = now()
  where id = p_selection_id returning * into v_selection;

  select cycle_id into v_cycle from positions where id = v_selection.position_id;
  perform log_activity(v_cycle, 'selection', p_selection_id, 'reservation_accepted', 'candidate',
    null, to_jsonb(v_selection), null);
  return v_selection;
end;
$$;

/**
 * A candidate turns down an offer or a reservation.
 *
 * The resulting status differs, and the difference is not cosmetic: an offer
 * that was declined was never a claim, while a reservation that was declined
 * was one and has to be released so the hours and the pool entry come back.
 */
create or replace function decline_selection(p_selection_id uuid)
returns selections
language plpgsql security definer
set search_path = public
as $$
declare
  v_selection selections;
  v_cycle uuid;
begin
  select * into v_selection from selections where id = p_selection_id for update;
  if not found then raise exception 'selection not found' using errcode = 'no_data_found'; end if;

  if not owns_candidate(v_selection.candidate_id) then
    raise exception 'not your selection' using errcode = '42501';
  end if;
  if v_selection.status not in ('offered', 'reserved') then
    raise exception 'this selection is no longer awaiting a response'
      using errcode = 'check_violation';
  end if;

  update selections
  set status = case when v_selection.status = 'offered' then 'declined' else 'released' end,
      released_at = now()
  where id = p_selection_id returning * into v_selection;

  update pool_entries set status = 'rejected'
  where position_id = v_selection.position_id
    and candidate_id = v_selection.candidate_id
    and status not in ('rejected', 'lost', 'withdrawn');

  select cycle_id into v_cycle from positions where id = v_selection.position_id;
  perform log_activity(v_cycle, 'selection', p_selection_id, 'declined', 'candidate',
    null, to_jsonb(v_selection), null);
  return v_selection;
end;
$$;

-- --- Candidate-choice fallback ----------------------------------------------

create or replace function open_candidate_choice_fallback(
  p_cycle_id uuid, p_candidate_id uuid, p_response_deadline timestamptz
) returns candidate_choice_fallbacks
language plpgsql security definer
set search_path = public
as $$
declare
  v_cycle cycles;
  v_case candidate_choice_fallbacks;
  v_offers integer;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may open a fallback case' using errcode = '42501';
  end if;

  select * into v_cycle from cycles where id = p_cycle_id;
  if not found then raise exception 'cycle not found' using errcode = 'no_data_found'; end if;
  if v_cycle.selection_mode <> 'candidate_choice' then
    raise exception 'fallback applies only to candidate-choice cycles'
      using errcode = 'check_violation';
  end if;
  if v_cycle.deadlines ->> 'offerWindow' is null
     or now() <= (v_cycle.deadlines ->> 'offerWindow')::timestamptz then
    raise exception 'the candidate offer window is still open' using errcode = 'check_violation';
  end if;

  insert into candidate_choice_fallbacks (
    cycle_id, candidate_id, response_deadline, opened_by
  ) values (p_cycle_id, p_candidate_id, p_response_deadline, auth.uid())
  returning * into v_case;

  -- Earliest offer first. The order is the whole mechanism — "who asked first"
  -- is the only defensible tiebreak once the candidate has stopped answering —
  -- so it is rows with an explicit ordinal, never insertion order.
  insert into fallback_offers (fallback_case_id, selection_id, position)
  select v_case.id, s.id,
         (row_number() over (order by coalesce(s.offered_at, s.created_at), s.id))::integer - 1
  from selections s
  where s.candidate_id = p_candidate_id and s.status = 'offered';

  get diagnostics v_offers = row_count;
  if v_offers = 0 then
    raise exception 'there are no open offers to fall back to' using errcode = 'check_violation';
  end if;

  perform log_activity(p_cycle_id, 'fallback_case', v_case.id, 'opened', 'program_manager',
    null, to_jsonb(v_case), null);
  return v_case;
end;
$$;

/**
 * The candidate — or QSTP on their behalf — answers the current offer.
 *
 * Declining walks to the next offer and needs the next deadline; accepting ends
 * the case. Exhausting the list is a distinct terminal state from accepting
 * one, because a candidate who said no to everybody and a candidate who never
 * answered need different things done about them.
 */
create or replace function respond_to_fallback(
  p_case_id uuid, p_response text, p_next_response_deadline timestamptz default null
) returns candidate_choice_fallbacks
language plpgsql security definer
set search_path = public
as $$
declare
  v_case candidate_choice_fallbacks;
  v_selection uuid;
  v_total integer;
  v_exhausted boolean;
begin
  select * into v_case from candidate_choice_fallbacks where id = p_case_id for update;
  if not found then raise exception 'fallback case not found' using errcode = 'no_data_found'; end if;

  if not (is_qstp() or owns_candidate(v_case.candidate_id)) then
    raise exception 'not your fallback case' using errcode = '42501';
  end if;
  if v_case.status <> 'open' then
    raise exception 'fallback case is already resolved' using errcode = 'check_violation';
  end if;
  if now() > v_case.response_deadline then
    raise exception 'the current fallback response deadline has expired'
      using errcode = 'check_violation';
  end if;

  select selection_id into v_selection from fallback_offers
  where fallback_case_id = p_case_id and position = v_case.current_offer_index;
  if not found then
    raise exception 'there is no current fallback offer' using errcode = 'check_violation';
  end if;

  if p_response = 'accepted' then
    perform accept_offer(v_selection);
    update candidate_choice_fallbacks
    set status = 'accepted', resolved_by = auth.uid()
    where id = p_case_id returning * into v_case;
    return v_case;
  end if;

  perform decline_selection(v_selection);

  select count(*) into v_total from fallback_offers where fallback_case_id = p_case_id;
  v_exhausted := v_case.current_offer_index + 1 >= v_total;

  if not v_exhausted and p_next_response_deadline is null then
    raise exception 'set the next fallback response deadline' using errcode = 'check_violation';
  end if;

  update candidate_choice_fallbacks
  set current_offer_index = v_case.current_offer_index + 1,
      response_deadline = coalesce(p_next_response_deadline, v_case.response_deadline),
      status = case when v_exhausted then 'exhausted' else 'open' end,
      resolved_by = case when v_exhausted then auth.uid() else null end
  where id = p_case_id returning * into v_case;

  return v_case;
end;
$$;

/**
 * QSTP awards the candidate to a startup the candidate did not choose.
 *
 * The heaviest act in the selection model, and the only one that overrules a
 * person's own decision. It requires an explicit high-risk confirmation and a
 * written reason, and it refuses outright while a live placement exists —
 * moving a candidate who has already started is a cancellation first.
 */
create or replace function override_fallback(
  p_case_id uuid, p_selection_id uuid, p_reason text, p_high_risk_confirmed boolean
) returns candidate_choice_fallbacks
language plpgsql security definer
set search_path = public
as $$
declare
  v_case candidate_choice_fallbacks;
  v_target selections;
begin
  if not has_qstp_role('program_manager') then
    raise exception 'only a programme manager may override a candidate choice'
      using errcode = '42501';
  end if;
  if not p_high_risk_confirmed or p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'confirm the high-risk override and record a reason'
      using errcode = 'check_violation';
  end if;

  select * into v_case from candidate_choice_fallbacks where id = p_case_id for update;
  if not found then raise exception 'fallback case not found' using errcode = 'no_data_found'; end if;

  if exists (
    select 1 from placements
    where candidate_id = v_case.candidate_id and status <> 'cancelled'
  ) then
    raise exception 'cancel the existing placement before overriding the candidate choice'
      using errcode = 'check_violation';
  end if;

  select * into v_target from selections
  where id = p_selection_id and candidate_id = v_case.candidate_id;
  if not found then raise exception 'selection not found' using errcode = 'no_data_found'; end if;

  -- Everything else goes first, so the partial unique index never sees two
  -- blocking claims on this candidate at once.
  update selections set status = 'declined', released_at = now()
  where candidate_id = v_case.candidate_id
    and id <> p_selection_id
    and status in ('offered', 'reserved', 'accepted', 'confirmed');

  update selections
  set status = 'accepted', accepted_at = now(), reserved_at = now(), released_at = null,
      override_reason = p_reason, overridden_by = auth.uid()
  where id = p_selection_id;

  update candidate_choice_fallbacks
  set status = 'overridden', resolved_by = auth.uid(), reason = p_reason
  where id = p_case_id returning * into v_case;

  perform log_activity(v_case.cycle_id, 'fallback_case', p_case_id,
    'candidate_choice_overridden', 'program_manager',
    jsonb_build_object('candidateId', v_case.candidate_id),
    jsonb_build_object('selectionId', p_selection_id), p_reason);
  return v_case;
end;
$$;

-- --- Documents --------------------------------------------------------------

/**
 * Record an upload and start extraction.
 *
 * Extraction is asynchronous now — a real OCR pass, not a lookup table — so
 * this can no longer return fields inline. It parks the document in
 * `extracting` for the kinds that have an extractor and moves everything else
 * straight to `submitted`, and `record_document_extraction` finishes the job.
 *
 * Old fields are cleared. A re-upload after a rejection that kept the previous
 * reading would show a candidate values taken from a document they replaced.
 */
create or replace function upload_candidate_document(
  p_document_id uuid, p_file_name text, p_storage_path text,
  p_back_file_name text default null, p_back_storage_path text default null
) returns candidate_documents
language plpgsql security definer
set search_path = public
as $$
declare
  v_document candidate_documents;
  v_extracts boolean;
begin
  select * into v_document from candidate_documents where id = p_document_id for update;
  if not found then raise exception 'document not found' using errcode = 'no_data_found'; end if;

  if not owns_candidate(v_document.candidate_id) then
    raise exception 'not your document' using errcode = '42501';
  end if;
  if v_document.status = 'verified' then
    raise exception 'that document has already been verified' using errcode = 'check_violation';
  end if;

  -- A national ID is unreadable from one side: the number is on the front and
  -- the expiry and issuing details are on the back.
  if v_document.kind = 'national_id' and p_back_storage_path is null then
    raise exception 'a national ID needs both sides' using errcode = 'check_violation';
  end if;

  v_extracts := v_document.kind in ('national_id', 'passport', 'bank_statement');

  delete from candidate_document_fields where document_id = p_document_id;

  update candidate_documents set
    file_name = p_file_name,
    storage_path = p_storage_path,
    back_file_name = p_back_file_name,
    back_storage_path = p_back_storage_path,
    status = case when v_extracts then 'extracting' else 'submitted' end,
    rejection_reason = null,
    verified_by = null,
    verified_at = null
  where id = p_document_id returning * into v_document;

  return v_document;
end;
$$;

/**
 * Store what the extractor read.
 *
 * `p_failed` is a first-class outcome, not an absence. Extraction that fell
 * over drops the document back to `uploaded` so the candidate is asked to try
 * again — a document silently stuck in `extracting` looks identical to one
 * nobody has got to yet, and only one of those needs a person.
 */
create or replace function record_document_extraction(
  p_document_id uuid, p_fields jsonb default '[]', p_failed boolean default false
) returns candidate_documents
language plpgsql security definer
set search_path = public
as $$
declare
  v_document candidate_documents;
begin
  select * into v_document from candidate_documents where id = p_document_id for update;
  if not found then raise exception 'document not found' using errcode = 'no_data_found'; end if;

  if not (is_qstp() or owns_candidate(v_document.candidate_id)) then
    raise exception 'not your document' using errcode = '42501';
  end if;
  if v_document.status <> 'extracting' then
    raise exception 'this document is not awaiting extraction' using errcode = 'check_violation';
  end if;

  if p_failed then
    update candidate_documents set status = 'uploaded'
    where id = p_document_id returning * into v_document;
    return v_document;
  end if;

  -- `confirmed` is left null on purpose. What a model read is a suggestion
  -- until a person says otherwise, and an unreviewed digit in an IBAN puts a
  -- salary in someone else's account.
  insert into candidate_document_fields (document_id, key, label, extracted, confidence)
  select p_document_id, f ->> 'key', f ->> 'label', f ->> 'extracted',
         (f ->> 'confidence')::numeric
  from jsonb_array_elements(p_fields) as f
  on conflict (document_id, key) do update
    set label = excluded.label,
        extracted = excluded.extracted,
        confidence = excluded.confidence,
        confirmed = null;

  update candidate_documents
  set status = case
        when exists (select 1 from candidate_document_fields where document_id = p_document_id)
        then 'awaiting_candidate_review'
        else 'submitted'
      end
  where id = p_document_id returning * into v_document;

  return v_document;
end;
$$;

/**
 * The candidate's corrections.
 *
 * `extracted` is never overwritten — the confirmed value sits beside it, so
 * "we read X, they corrected it to Y" stays answerable and the extractor's
 * accuracy stays measurable.
 *
 * The document only moves to `submitted` once every field has been confirmed.
 * The use-case already refuses a partial confirmation; this is the same rule
 * written where it cannot be skipped, and it is the one place this adapter is
 * deliberately stricter than the fixture.
 */
create or replace function confirm_document_fields(p_document_id uuid, p_fields jsonb)
returns candidate_documents
language plpgsql security definer
set search_path = public
as $$
declare
  v_document candidate_documents;
  v_unconfirmed integer;
begin
  select * into v_document from candidate_documents where id = p_document_id for update;
  if not found then raise exception 'document not found' using errcode = 'no_data_found'; end if;

  if not owns_candidate(v_document.candidate_id) then
    raise exception 'not your document' using errcode = '42501';
  end if;

  update candidate_document_fields f
  set confirmed = v.value
  from jsonb_to_recordset(p_fields) as v(key text, value text)
  where f.document_id = p_document_id and f.key = v.key;

  select count(*) into v_unconfirmed
  from candidate_document_fields
  where document_id = p_document_id and confirmed is null;

  if v_unconfirmed > 0 then
    raise exception 'confirm every field before submitting (% still unconfirmed)', v_unconfirmed
      using errcode = 'check_violation';
  end if;

  update candidate_documents set status = 'submitted', rejection_reason = null
  where id = p_document_id returning * into v_document;

  return v_document;
end;
$$;

-- --- Placement readiness ----------------------------------------------------

/**
 * One party says it is ready.
 *
 * `placements_write` is QSTP-only, deliberately — a startup that could UPDATE a
 * placement row could also move its dates. So the two parties who are not QSTP
 * reach exactly one column each, through here, and the guard is which party
 * they actually are rather than which party they claim to be.
 */
create or replace function set_placement_readiness(p_placement_id uuid, p_party text)
returns placements
language plpgsql security definer
set search_path = public
as $$
declare
  v_placement placements;
  v_permitted boolean;
begin
  select * into v_placement from placements where id = p_placement_id for update;
  if not found then raise exception 'placement not found' using errcode = 'no_data_found'; end if;
  if v_placement.status = 'cancelled' then
    raise exception 'cancelled placements are read-only' using errcode = 'check_violation';
  end if;

  -- Assigned rather than inlined into the IF: plpgsql reads an IF condition up
  -- to the first THEN token without tracking CASE nesting, so `if not case …
  -- when … then` parses as a truncated expression.
  v_permitted := case p_party
    when 'candidate' then owns_candidate(v_placement.candidate_id) or is_qstp()
    when 'startup' then is_startup_member(v_placement.startup_id) or is_qstp()
    when 'details' then has_qstp_role('program_manager', 'operations')
    when 'qstp' then has_qstp_role('program_manager', 'operations')
    else false
  end;

  if not v_permitted then
    raise exception 'that is not yours to confirm' using errcode = '42501';
  end if;

  update placements set
    candidate_ready_at = case when p_party = 'candidate' then now() else candidate_ready_at end,
    startup_ready_at = case when p_party = 'startup' then now() else startup_ready_at end,
    details_finalized_at = case when p_party = 'details' then now() else details_finalized_at end,
    qstp_approved_at = case when p_party = 'qstp' then now() else qstp_approved_at end
  where id = p_placement_id returning * into v_placement;

  perform log_activity(v_placement.cycle_id, 'placement', p_placement_id,
    'readiness_confirmed', actor_role_of(auth.uid()),
    null, jsonb_build_object('party', p_party), null);
  return v_placement;
end;
$$;

/**
 * Cancel, and hand back the recovery case it created.
 *
 * `cancel_placement` returns only the placement, but `PlacementPort.cancel`
 * promises both — and a follow-up SELECT on `recovery_cases` is QSTP-only, so
 * it would silently return nothing for anyone else. Returning the pair from
 * inside the transaction is the only shape that cannot half-answer.
 */
create or replace function cancel_placement_with_recovery(p_placement_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_placement placements;
  v_case recovery_cases;
begin
  v_placement := cancel_placement(p_placement_id, p_reason);

  select * into v_case from recovery_cases
  where placement_id = p_placement_id
  order by created_at desc limit 1;

  return jsonb_build_object(
    'placement', to_jsonb(v_placement),
    'recoveryCase', to_jsonb(v_case)
  );
end;
$$;

-- --- Ratings ----------------------------------------------------------------

/**
 * Save a work-in-progress rating.
 *
 * One draft per (cycle, startup), replaced wholesale rather than merged: a
 * draft that kept the items you did not resend would make deleting a rationale
 * impossible, and half of a rating is not a state the engine should ever read.
 */
create or replace function save_startup_rating_draft(
  p_cycle_id uuid, p_startup_id uuid, p_items jsonb
) returns startup_ratings
language plpgsql security definer
set search_path = public
as $$
declare
  v_rating startup_ratings;
begin
  if not has_qstp_role('program_manager', 'operations') then
    raise exception 'only QSTP may rate a startup' using errcode = '42501';
  end if;

  select * into v_rating from startup_ratings
  where cycle_id = p_cycle_id and startup_id = p_startup_id and status = 'draft'
  for update;

  if found then
    delete from startup_rating_items where rating_id = v_rating.id;
    update startup_ratings set rated_by = auth.uid()
    where id = v_rating.id returning * into v_rating;
  else
    insert into startup_ratings (cycle_id, startup_id, status, rated_by)
    values (p_cycle_id, p_startup_id, 'draft', auth.uid())
    returning * into v_rating;
  end if;

  insert into startup_rating_items (rating_id, dimension, value, rationale)
  select v_rating.id, (i ->> 'dimension')::rating_key, (i ->> 'value')::smallint, i ->> 'rationale'
  from jsonb_array_elements(p_items) as i;

  return v_rating;
end;
$$;

-- --- Redistribution invitations ---------------------------------------------

/**
 * Invite a startup into a round.
 *
 * Two tables — the invitation and the round's own status — so it is one
 * function. A round sitting in `draft` with invitations already out is a state
 * the redistribution screen cannot render honestly.
 */
create or replace function invite_to_redistribution(
  p_round_id uuid, p_startup_id uuid, p_proposed_hours hour_tier
) returns redistribution_rounds
language plpgsql security invoker
as $$
declare
  v_round redistribution_rounds;
  v_offered integer;
begin
  select * into v_round from redistribution_rounds where id = p_round_id for update;
  if not found then raise exception 'round not found' using errcode = 'no_data_found'; end if;
  if v_round.status not in ('draft', 'invitations') then
    raise exception 'this round is no longer taking invitations' using errcode = 'check_violation';
  end if;

  select coalesce(sum(proposed_hours), 0) into v_offered
  from redistribution_invitations
  where round_id = p_round_id and status in ('invited', 'accepted');

  if v_offered + p_proposed_hours > v_round.available_hours then
    raise exception 'that grant is more than the round has left'
      using errcode = 'check_violation';
  end if;

  insert into redistribution_invitations (round_id, startup_id, proposed_hours)
  values (p_round_id, p_startup_id, p_proposed_hours);

  update redistribution_rounds set status = 'invitations'
  where id = p_round_id and status = 'draft';

  -- Re-read rather than use the UPDATE's RETURNING: the round may already have
  -- been in `invitations`, in which case nothing was updated and RETURNING
  -- would hand back a null row for a round that plainly exists.
  select * into v_round from redistribution_rounds where id = p_round_id;
  return v_round;
end;
$$;

-- ===========================================================================
-- 5. Index and policy corrections
-- ===========================================================================

-- 0007 put an `updated_at` trigger on `redistribution_rounds`, which has no
-- `updated_at` column. Every UPDATE on that table raised
-- `record "new" has no field "updated_at"` — so a round could be created and
-- then never invited into, responded to, or closed. It went unnoticed because
-- nothing had ever updated the table: the application is on fixtures.
--
-- Dropping the trigger rather than adding the column, because the round already
-- carries the two timestamps it needs — `created_at` and `closed_at` — and a
-- third that means "something changed" would be a field with no reader.
drop trigger if exists redistribution_rounds_updated_at on redistribution_rounds;

-- `selections_one_live_per_candidate_idx` does not cover `offered`, on purpose:
-- several startups holding offers at once is the whole candidate-choice model.
-- But nothing stopped ONE startup offering the same person the same role twice,
-- which the fixture adapter refuses and the database happily allowed.
create unique index if not exists selections_one_open_offer_idx
  on selections (position_id, candidate_id)
  where status = 'offered';

-- An invited startup could read its invitation and not the round it belongs to,
-- so `respond_to_redistribution`'s follow-up read returned "not found" to the
-- startup that had just responded. It sees the round it was invited into and
-- no other.
drop policy if exists redistribution_rounds_select on redistribution_rounds;
create policy redistribution_rounds_select on redistribution_rounds for select to authenticated
  using (
    is_qstp() or exists (
      select 1 from redistribution_invitations i
      where i.round_id = redistribution_rounds.id and is_startup_member(i.startup_id)
    )
  );

-- Keyset pagination needs the sort key and the tiebreaker in the index, or the
-- `(key, id) < (cursor)` predicate degrades to a sequential scan and keyset is
-- slower than the offset it replaced.
create index if not exists activity_events_cycle_keyset_idx
  on activity_events (cycle_id, occurred_at desc, id desc);
create index if not exists activity_events_entity_keyset_idx
  on activity_events (entity_type, entity_id, occurred_at desc, id desc);
create index if not exists candidates_cycle_keyset_idx
  on candidates (cycle_id, created_at desc, id desc);
create index if not exists selections_cycle_keyset_idx
  on selections (candidate_id, created_at desc, id desc);
create index if not exists allocations_cycle_keyset_idx
  on allocations (cycle_id, created_at desc, id desc);

-- ===========================================================================
-- 6. Grants
-- ===========================================================================

-- Neither of these may be reached from a request. `log_activity` would let a
-- caller name their own role in the audit log; `decide_allocation_unchecked`
-- would let anyone allocate hours to anyone. Both stay reachable from the
-- definer functions above, which execute as the owner.
revoke all on function log_activity(uuid, text, uuid, text, activity_actor_role, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function decide_allocation_unchecked(uuid, uuid, hour_tier, numeric, text, text, uuid)
  from public, anon, authenticated;

grant execute on function append_activity(uuid, text, uuid, text, jsonb, jsonb, text) to authenticated;
grant execute on function actor_role_of(uuid) to authenticated;
grant execute on function create_position(jsonb) to authenticated;
grant execute on function update_position_details(uuid, jsonb) to authenticated;
grant execute on function accept_reservation(uuid) to authenticated;
grant execute on function decline_selection(uuid) to authenticated;
grant execute on function open_candidate_choice_fallback(uuid, uuid, timestamptz) to authenticated;
grant execute on function respond_to_fallback(uuid, text, timestamptz) to authenticated;
grant execute on function override_fallback(uuid, uuid, text, boolean) to authenticated;
grant execute on function upload_candidate_document(uuid, text, text, text, text) to authenticated;
grant execute on function record_document_extraction(uuid, jsonb, boolean) to authenticated;
grant execute on function confirm_document_fields(uuid, jsonb) to authenticated;
grant execute on function set_placement_readiness(uuid, text) to authenticated;
grant execute on function cancel_placement_with_recovery(uuid, text) to authenticated;
grant execute on function save_startup_rating_draft(uuid, uuid, jsonb) to authenticated;
grant execute on function invite_to_redistribution(uuid, uuid, hour_tier) to authenticated;
