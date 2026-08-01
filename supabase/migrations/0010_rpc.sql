-- 0010 — transactional functions
--
-- PostgREST gives one transaction per request. A use-case issuing three
-- .insert() calls has three independent transactions, and a failure on the
-- third leaves the first two committed. So every workflow that writes to more
-- than one table is exposed here as a single function whose contract is
-- atomicity, and the use-case never sequences the writes itself.
--
-- All SECURITY INVOKER: moving work into the database must not smuggle in extra
-- privilege. RLS applies to every statement below exactly as it would to the
-- caller's own query.

-- ---------------------------------------------------------------------------
-- Shared
-- ---------------------------------------------------------------------------

create or replace function log_activity(
  p_cycle_id uuid, p_entity_type text, p_entity_id uuid, p_action text,
  p_actor_role activity_actor_role, p_before jsonb, p_after jsonb, p_reason text
) returns void
language sql security invoker
as $$
  insert into activity_events (
    cycle_id, entity_type, entity_id, action, actor_id, actor_role, before, after, reason
  ) values (
    p_cycle_id, p_entity_type, p_entity_id, p_action, auth.uid(), p_actor_role,
    p_before, p_after, p_reason
  );
$$;

-- ---------------------------------------------------------------------------
-- Cycle
-- ---------------------------------------------------------------------------

create or replace function create_cycle_with_participations(
  p_name text, p_starts_on date, p_ends_on date, p_funded_weekly_hours integer,
  p_selection_mode selection_mode, p_deadlines jsonb, p_clone_from uuid default null
) returns cycles
language plpgsql security invoker
as $$
declare
  v_cycle cycles;
begin
  insert into cycles (name, starts_on, ends_on, funded_weekly_hours, selection_mode, deadlines)
  values (p_name, p_starts_on, p_ends_on, p_funded_weekly_hours, p_selection_mode, p_deadlines)
  returning * into v_cycle;

  -- Carrying the roster forward is the whole reason this is one transaction: a
  -- cycle with half its startups is worse than no cycle at all.
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
language plpgsql security invoker
as $$
declare
  v_before cycles;
  v_after cycles;
begin
  select * into v_before from cycles where id = p_cycle_id for update;
  if not found then raise exception 'cycle not found' using errcode = 'no_data_found'; end if;

  -- Forward only. Reopening a stage is an exception request, not a stage change.
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

-- ---------------------------------------------------------------------------
-- Allocation
-- ---------------------------------------------------------------------------

create or replace function decide_allocation(
  p_cycle_id uuid, p_startup_id uuid, p_weekly_hours hour_tier,
  p_score numeric default null, p_justification text default null,
  p_override_reason text default null, p_redistribution_round_id uuid default null
) returns allocations
language plpgsql security invoker
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
  --
  -- Summing everyone *else* rather than adding a delta means moving a startup
  -- from 60 down to 40 always succeeds, even when the budget is fully committed.
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

  perform log_activity(p_cycle_id, 'allocation', v_next.id, 'decided', 'operations',
    to_jsonb(v_current), to_jsonb(v_next), p_override_reason);
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Prioritisation
-- ---------------------------------------------------------------------------

/**
 * Store a portfolio draft: the run header plus one result row per startup.
 *
 * The engine computed all of this in @relayflow/prioritisation. Nothing here
 * scores, ranks, or allocates — this function only persists, which is what
 * keeps the two adapters from ever disagreeing about a funding decision.
 */
create or replace function create_prioritisation_run(
  p_cycle_id uuid, p_run jsonb, p_results jsonb
) returns prioritisation_runs
language plpgsql security invoker
as $$
declare
  v_version integer;
  v_run prioritisation_runs;
begin
  -- Only one draft at a time; re-running supersedes the previous one.
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
    run_id, startup_id, rating_id, extraction_run_id, status, score, breakdown,
    history_source, rank, tie_group, requires_tie_resolution, maximum_hours, proposed_hours,
    waitlist_rank, waitlist_order_status, waitlist_reason,
    blockers, signals, adjustments, position_checks
  )
  select
    v_run.id,
    (r ->> 'startupId')::uuid,
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
language plpgsql security invoker
as $$
declare
  v_before prioritisation_results;
  v_after prioritisation_results;
  v_cycle uuid;
begin
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

  -- Only a scored startup has a tier to adjust. Handing hours to a blocked one
  -- would paper over the thing that actually needs doing.
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

/**
 * Confirm a draft and write the allocations it proposes.
 *
 * Two guards worth reading twice.
 *
 * Only `scored` results become allocations. The other four statuses —
 * needs_information, awaiting_manual_scores, not_ready, not_fundable — produce
 * NO allocation row at all, because a 0h allocation is indistinguishable from
 * "we evaluated you and you did not qualify", and those startups were never
 * evaluated.
 *
 * And a partial draft cannot be published by accident: publishing one silently
 * drops every un-rated startup from the cycle.
 */
create or replace function publish_prioritisation_run(
  p_run_id uuid, p_acknowledge_incomplete boolean default false, p_reason text default null
) returns prioritisation_runs
language plpgsql security invoker
as $$
declare
  v_run prioritisation_runs;
  v_result record;
begin
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
    perform decide_allocation(
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

/** Submit six ratings and their rationales as one act, superseding any prior. */
create or replace function submit_startup_rating(
  p_cycle_id uuid, p_startup_id uuid, p_items jsonb, p_revision_reason text default null
) returns startup_ratings
language plpgsql security invoker
as $$
declare
  v_prior uuid;
  v_rating startup_ratings;
  v_count integer;
begin
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

  -- The unique (rating_id, dimension) index catches duplicates; this catches a
  -- payload that named the same dimension twice and so covered only five.
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

/** Persist an extraction: the run, its 23 fields, and every observation. */
create or replace function save_extraction_run(
  p_cycle_id uuid, p_startup_id uuid, p_run jsonb, p_fields jsonb
) returns extraction_runs
language plpgsql security invoker
as $$
declare
  v_run extraction_runs;
  v_field jsonb;
  v_field_id uuid;
begin
  insert into extraction_runs (
    cycle_id, startup_id, contract_version, model, prompt_version, status,
    error, started_at, finished_at, created_by
  ) values (
    p_cycle_id, p_startup_id, p_run ->> 'contractVersion', p_run ->> 'model',
    p_run ->> 'promptVersion', coalesce((p_run ->> 'status')::extraction_run_status, 'succeeded'),
    p_run ->> 'error', (p_run ->> 'startedAt')::timestamptz,
    (p_run ->> 'finishedAt')::timestamptz, auth.uid()
  ) returning * into v_run;

  for v_field in select * from jsonb_array_elements(p_fields)
  loop
    insert into extracted_fields (
      extraction_run_id, cycle_id, startup_id, field_path, status,
      resolved_value, normalized_unit, period
    ) values (
      v_run.id, p_cycle_id, p_startup_id, v_field ->> 'fieldPath',
      (v_field ->> 'status')::evidence_field_status,
      v_field -> 'resolvedValue', v_field ->> 'normalizedUnit', v_field -> 'period'
    ) returning id into v_field_id;

    -- The citation trail. Without it "why did Acme get 60?" has no answer that
    -- points at a page.
    insert into extracted_field_observations (
      extracted_field_id, evidence_item_id, format, locator, raw_representation,
      observed_value, unit, period, relationship
    )
    select
      v_field_id, (o ->> 'evidenceItemId')::uuid, o ->> 'format', o -> 'locator',
      o ->> 'rawRepresentation', o -> 'observedValue', o ->> 'unit', o -> 'period',
      coalesce((o ->> 'relationship')::observation_relationship, 'primary')
    from jsonb_array_elements(coalesce(v_field -> 'observations', '[]'::jsonb)) as o;
  end loop;

  return v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- Positions
-- ---------------------------------------------------------------------------

create or replace function transition_position(
  p_position_id uuid, p_to_status position_status, p_note text default null
) returns positions
language plpgsql security invoker
as $$
declare
  v_before positions;
  v_after positions;
begin
  select * into v_before from positions where id = p_position_id for update;
  if not found then raise exception 'position not found' using errcode = 'no_data_found'; end if;

  update positions set status = p_to_status, review_note = p_note
  where id = p_position_id returning * into v_after;

  insert into position_review_history (position_id, status, note, actor_id)
  values (p_position_id, p_to_status, p_note, auth.uid());

  perform log_activity(v_after.cycle_id, 'position', p_position_id, 'transitioned', 'operations',
    to_jsonb(v_before), to_jsonb(v_after), p_note);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------

create or replace function import_candidates(p_cycle_id uuid, p_candidates jsonb)
returns setof candidates
language plpgsql security invoker
as $$
begin
  -- Idempotent by (cycle, email): re-importing a shortlist refreshes people
  -- rather than creating a second copy of each of them.
  return query
  insert into candidates (cycle_id, full_name, email, phone, skills, cv_url, source)
  select
    p_cycle_id, c ->> 'fullName', lower(c ->> 'email'), c ->> 'phone',
    coalesce(array(select jsonb_array_elements_text(c -> 'skills')), '{}'),
    c ->> 'cvUrl', coalesce((c ->> 'source')::candidate_source, 'manual')
  from jsonb_array_elements(p_candidates) as c
  on conflict (cycle_id, email) do update
    set full_name = excluded.full_name,
        phone = coalesce(excluded.phone, candidates.phone),
        skills = excluded.skills,
        cv_url = coalesce(excluded.cv_url, candidates.cv_url)
  returning *;
end;
$$;

create or replace function share_pool(p_position_id uuid, p_candidate_ids uuid[])
returns setof pool_entries
language plpgsql security invoker
as $$
begin
  return query
  insert into pool_entries (position_id, candidate_id)
  select p_position_id, unnest(p_candidate_ids)
  on conflict (position_id, candidate_id) do nothing
  returning *;
end;
$$;

create or replace function set_candidate_availability(
  p_candidate_id uuid, p_availability availability_status
) returns candidates
language plpgsql security invoker
as $$
declare
  v_before candidates;
  v_after candidates;
begin
  select * into v_before from candidates where id = p_candidate_id for update;
  if not found then raise exception 'candidate not found' using errcode = 'no_data_found'; end if;

  update candidates
  set availability = p_availability,
      availability_confirmed_at = case when p_availability = 'unconfirmed' then null else now() end
  where id = p_candidate_id returning * into v_after;

  -- Someone who has become unavailable cannot stay live in anybody's pipeline.
  -- Leaving them there is how a startup interviews a person who took another job.
  if p_availability in ('employed', 'not_interested', 'temporarily_unavailable') then
    update pool_entries set status = 'withdrawn'
    where candidate_id = p_candidate_id
      and status not in ('rejected', 'lost', 'withdrawn', 'selected');

    update selections set status = 'released', released_at = now()
    where candidate_id = p_candidate_id and status in ('offered', 'reserved');
  end if;

  perform log_activity(v_after.cycle_id, 'candidate', p_candidate_id, 'availability_set',
    'candidate', to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- Selection
-- ---------------------------------------------------------------------------

/**
 * Reserve a candidate for a position.
 *
 * The partial unique index does the real work: if another startup already holds
 * this candidate, the insert raises 23505. Checking first and inserting second
 * would leave a window exactly wide enough for both startups to win.
 *
 * On conflict this returns NULL and records a `selection_conflicts` row. It
 * deliberately does NOT re-raise, and that is load-bearing: PostgREST runs one
 * transaction per request, so raising would roll back the conflict row we just
 * wrote along with everything else — and the conflict record is the entire
 * point. Two startups wanting the same scarce person is normal; QSTP being
 * unable to see it happen is the failure.
 *
 * Callers must treat a NULL return as "conflicted, go read the conflict", not
 * as "nothing happened".
 */
create or replace function reserve_candidate(
  p_position_id uuid, p_candidate_id uuid, p_status selection_status default 'reserved'
) returns selections
language plpgsql security invoker
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

  begin
    insert into selections (position_id, startup_id, candidate_id, status, selected_by)
    values (p_position_id, v_startup, p_candidate_id, p_status, auth.uid())
    returning * into v_selection;
  exception when unique_violation then
    select * into v_blocking from selections
    where candidate_id = p_candidate_id and status in ('reserved', 'accepted', 'confirmed')
    limit 1;

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

  perform log_activity(v_cycle, 'selection', v_selection.id, 'reserved', 'owner',
    null, to_jsonb(v_selection), null);
  return v_selection;
end;
$$;

/** Accept one offer and decline every sibling in the same breath. */
create or replace function accept_offer(p_selection_id uuid)
returns selections
language plpgsql security invoker
as $$
declare
  v_selection selections;
  v_cycle uuid;
begin
  select * into v_selection from selections where id = p_selection_id for update;
  if not found then raise exception 'selection not found' using errcode = 'no_data_found'; end if;

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
language plpgsql security invoker
as $$
declare
  v_selection selections;
  v_cycle uuid;
begin
  update selections set status = 'released', released_at = now()
  where id = p_selection_id returning * into v_selection;
  if not found then raise exception 'selection not found' using errcode = 'no_data_found'; end if;

  update pool_entries set status = 'rejected'
  where position_id = v_selection.position_id and candidate_id = v_selection.candidate_id;

  -- Back into the pool, not left in limbo.
  update candidates set availability = 'available'
  where id = v_selection.candidate_id and availability = 'placed';

  select cycle_id into v_cycle from positions where id = v_selection.position_id;
  perform log_activity(v_cycle, 'selection', p_selection_id, 'released', 'operations',
    null, to_jsonb(v_selection), p_reason);
  return v_selection;
end;
$$;

create or replace function resolve_selection_conflict(
  p_conflict_id uuid, p_resolution selection_conflict_status, p_reason text
) returns selection_conflicts
language plpgsql security invoker
as $$
declare
  v_conflict selection_conflicts;
begin
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'resolving a conflict needs a reason' using errcode = 'check_violation';
  end if;

  update selection_conflicts
  set status = p_resolution, resolved_by = auth.uid(), resolved_at = now(), reason = p_reason
  where id = p_conflict_id and status = 'open'
  returning * into v_conflict;
  if not found then raise exception 'no open conflict' using errcode = 'no_data_found'; end if;

  -- An override moves the candidate. The losing selection is released rather
  -- than deleted, so the record still shows who had them first.
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
language plpgsql security invoker
as $$
declare
  v_exception exception_requests;
begin
  update exception_requests
  set status = p_status, granted_deadline = p_granted_deadline, decision_note = p_note,
      decided_by = auth.uid(), decided_at = now()
  where id = p_exception_id and status = 'pending'
  returning * into v_exception;
  if not found then raise exception 'no pending exception' using errcode = 'no_data_found'; end if;

  -- A protected startup must not have its hours recovered underneath it while
  -- the extension it was granted is still running.
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

-- ---------------------------------------------------------------------------
-- Placement and onboarding
-- ---------------------------------------------------------------------------

create or replace function confirm_selection(
  p_selection_id uuid, p_starts_on date, p_ends_on date,
  p_supervisor_name text, p_supervisor_id uuid default null
) returns placements
language plpgsql security invoker
as $$
declare
  v_selection selections;
  v_position positions;
  v_placement placements;
begin
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
language plpgsql security invoker
as $$
declare
  v_placement placements;
begin
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

  perform log_activity(v_placement.cycle_id, 'placement', p_placement_id, 'cancelled',
    'operations', null, to_jsonb(v_placement), p_reason);
  return v_placement;
end;
$$;

/** Freeze the current templates onto a placement as its own checklist. */
create or replace function snapshot_placement_requirements(p_placement_id uuid)
returns setof placement_requirements
language plpgsql security invoker
as $$
declare
  v_placement placements;
begin
  select * into v_placement from placements where id = p_placement_id;
  if not found then raise exception 'placement not found' using errcode = 'no_data_found'; end if;

  return query
  insert into placement_requirements (placement_id, template_id, title, owner, required)
  select p_placement_id, t.id, t.title, t.owner, t.required
  from document_requirement_templates t
  where t.cycle_id = v_placement.cycle_id
    and t.active
    and (t.position_id is null or t.position_id = v_placement.position_id)
  returning *;
end;
$$;

create or replace function submit_requirement(
  p_requirement_id uuid, p_file_name text, p_storage_path text,
  p_fields jsonb default '[]', p_correction_reason text default null
) returns requirement_submissions
language plpgsql security invoker
as $$
declare
  v_revision integer;
  v_submission requirement_submissions;
  v_status requirement_status;
begin
  select status into v_status from placement_requirements where id = p_requirement_id for update;
  if not found then raise exception 'requirement not found' using errcode = 'no_data_found'; end if;
  if v_status in ('approved', 'waived') then
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

-- ---------------------------------------------------------------------------
-- Recovery and redistribution
-- ---------------------------------------------------------------------------

create or replace function create_redistribution_round(
  p_cycle_id uuid, p_recovery_case_ids uuid[],
  p_position_deadline timestamptz, p_selection_deadline timestamptz
) returns redistribution_rounds
language plpgsql security invoker
as $$
declare
  v_number integer;
  v_hours integer;
  v_round redistribution_rounds;
begin
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

create or replace function respond_to_redistribution(
  p_round_id uuid, p_startup_id uuid, p_response redistribution_invitation_status
) returns redistribution_invitations
language plpgsql security invoker
as $$
declare
  v_invitation redistribution_invitations;
  v_round redistribution_rounds;
  v_current hour_tier;
begin
  select * into v_round from redistribution_rounds where id = p_round_id for update;

  update redistribution_invitations
  set status = p_response, responded_at = now()
  where round_id = p_round_id and startup_id = p_startup_id and status = 'invited'
  returning * into v_invitation;
  if not found then raise exception 'no open invitation' using errcode = 'no_data_found'; end if;

  -- Accepting grants the hours in the same transaction, through the same budget
  -- check every other allocation goes through.
  if p_response = 'accepted' then
    select weekly_hours into v_current from allocations
    where cycle_id = v_round.cycle_id and startup_id = p_startup_id and status <> 'superseded';

    perform decide_allocation(
      v_round.cycle_id, p_startup_id,
      (coalesce(v_current, 0) + v_invitation.proposed_hours)::hour_tier,
      null, 'redistribution round ' || v_round.number, null, p_round_id
    );
  end if;

  return v_invitation;
end;
$$;
