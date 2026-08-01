-- Schema invariants.
--
-- Not a test of the DDL parsing — `run.sh` already proved that by applying it.
-- These are the rules that are expensive to get wrong and impossible to check
-- by clicking around: the budget ceiling, the one-live-selection-per-candidate
-- index, and the refusal to turn an unevaluated startup into a 0h allocation.
--
-- Each check raises on failure, so a regression fails the script rather than
-- printing something nobody reads.
--
--   ./supabase/tests/run.sh

\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
begin;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into users (id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'pm@qstp.test', 'Programme Manager'),
  ('22222222-2222-2222-2222-222222222222', 'owner@acme.test', 'Acme Owner'),
  ('33333333-3333-3333-3333-333333333333', 'cand@test.test', 'A Candidate');

insert into qstp_staff (user_id, role)
  values ('11111111-1111-1111-1111-111111111111', 'program_manager');

insert into startups (id, name, slug, contact_email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Acme', 'acme', 'a@acme.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Northwind', 'northwind', 'n@nw.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Pearl', 'pearl', 'p@pearl.test');

insert into cycles (id, name, starts_on, ends_on, funded_weekly_hours, stage, deadlines)
values (
  'cccccccc-0000-0000-0000-000000000001', 'Spring 2026', '2026-02-01', '2026-06-01',
  100, 'allocation',
  '{"positionSubmission":"2026-02-10T00:00:00Z","candidateSelection":"2026-03-01T00:00:00Z","documentSubmission":"2026-03-20T00:00:00Z"}'
);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
commit;

\echo ''
\echo '=== A. hour_tier is a closed set ==================================='
do $$ begin
  begin
    insert into allocations (cycle_id, startup_id, weekly_hours)
    values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001', 37);
    raise exception 'FAIL: 37 weekly hours was accepted';
  exception when check_violation then
    raise notice 'PASS  an arbitrary 37 is rejected by the hour_tier domain';
  end;
end $$;

\echo ''
\echo '=== B. ratings are bounded 0..4 ===================================='
do $$
declare v_rating uuid;
begin
  insert into startup_ratings (cycle_id, startup_id, status, rated_by)
  values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'draft','11111111-1111-1111-1111-111111111111')
  returning id into v_rating;
  begin
    insert into startup_rating_items (rating_id, dimension, value, rationale)
    values (v_rating, 'traction_strength', 5, 'off the scale');
    raise exception 'FAIL: a rating of 5 was accepted';
  exception when check_violation then
    raise notice 'PASS  a rating of 5 is rejected';
  end;
  begin
    insert into startup_rating_items (rating_id, dimension, value, rationale)
    values (v_rating, 'traction_strength', 3, '');
    raise exception 'FAIL: an empty rationale was accepted';
  exception when check_violation then
    raise notice 'PASS  a rating with no rationale is rejected';
  end;
end $$;

\echo ''
\echo '=== C. the budget ceiling is enforced inside the write ============='
do $$
declare v_a allocations;
begin
  -- 60 + 40 = 100 of 100 funded. Fits exactly.
  perform decide_allocation('cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001', 60::hour_tier);
  perform decide_allocation('cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002', 40::hour_tier);
  raise notice 'PASS  60 + 40 = 100 of 100 funded hours committed';

  begin
    perform decide_allocation('cccccccc-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000003', 20::hour_tier);
    raise exception 'FAIL: an over-allocation was accepted';
  exception when check_violation then
    raise notice 'PASS  a third startup at 20h is refused — budget is full';
  end;

  -- The delta case: moving DOWN must always work, even at a full budget.
  select * into v_a from decide_allocation('cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001', 40::hour_tier);
  if v_a.weekly_hours <> 40 then raise exception 'FAIL: downgrade was refused'; end if;
  raise notice 'PASS  60 -> 40 succeeds against a fully committed budget';

  -- And the superseded revision is kept, not overwritten.
  if (select count(*) from allocations
      where startup_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FAIL: the prior allocation was not retained';
  end if;
  if (select count(*) from allocations
      where startup_id = 'aaaaaaaa-0000-0000-0000-000000000001'
        and status <> 'superseded') <> 1 then
    raise exception 'FAIL: more than one live allocation';
  end if;
  raise notice 'PASS  the prior revision is superseded, not deleted';
end $$;

\echo ''
\echo '=== D. a candidate cannot be double-booked ========================='
do $$
declare
  v_pos1 uuid; v_pos2 uuid; v_cand uuid;
begin
  insert into positions (cycle_id, startup_id, title, description, intern_count,
                         hours_per_intern, duration_weeks)
  values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'AI Intern','Build things',1,20,12) returning id into v_pos1;
  insert into positions (cycle_id, startup_id, title, description, intern_count,
                         hours_per_intern, duration_weeks)
  values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002',
          'Data Intern','Analyse things',1,20,12) returning id into v_pos2;

  insert into candidates (cycle_id, full_name, email)
  values ('cccccccc-0000-0000-0000-000000000001','Scarce Person','scarce@test.test')
  returning id into v_cand;

  insert into pool_entries (position_id, candidate_id) values (v_pos1, v_cand), (v_pos2, v_cand);

  perform reserve_candidate(v_pos1, v_cand);
  raise notice 'PASS  the first startup reserves the candidate';

  if (select reserve_candidate(v_pos2, v_cand)) is not null then
    raise exception 'FAIL: two startups both hold the same candidate';
  end if;
  raise notice 'PASS  the second startup is blocked by the partial unique index';

  if (select count(*) from selections
      where candidate_id = v_cand and status in ('reserved','accepted','confirmed')) <> 1 then
    raise exception 'FAIL: more than one live selection survived';
  end if;
  raise notice 'PASS  exactly one live selection exists for the candidate';

  -- The record of the collision must SURVIVE the failed insert. Re-raising here
  -- would roll it back, and QSTP would never learn the collision happened.
  if (select count(*) from selection_conflicts where candidate_id = v_cand) <> 1 then
    raise exception 'FAIL: the conflict was not recorded for QSTP';
  end if;
  raise notice 'PASS  the conflict survives the rollback and is visible to QSTP';
end $$;

\echo ''
\echo '=== E. only scored startups become allocations ====================='
do $$
declare
  v_run prioritisation_runs;
  v_cycle uuid := 'cccccccc-0000-0000-0000-000000000002';
begin
  -- Only one cycle may be running at a time; retire the first.
  update cycles set stage = 'closed' where id = 'cccccccc-0000-0000-0000-000000000001';

  insert into cycles (id, name, starts_on, ends_on, funded_weekly_hours, stage, deadlines)
  values (v_cycle, 'Autumn 2026', '2026-09-01', '2026-12-01', 200, 'allocation',
    '{"positionSubmission":"2026-09-10T00:00:00Z","candidateSelection":"2026-10-01T00:00:00Z","documentSubmission":"2026-10-20T00:00:00Z"}');

  select * into v_run from create_prioritisation_run(v_cycle,
    jsonb_build_object(
      'policySnapshot', '{"version":"prioritization-v3-experiment-2"}'::jsonb,
      'budgetHours', 200, 'maximumQualifiedHours', 100, 'proposedHours', 100,
      'residualHours', 100, 'withinBudget', true,
      'allocationMode', 'priority', 'allocationStrategy', 'priority_concentration_equal_ties',
      'completeness', 'partial_draft'),
    jsonb_build_array(
      jsonb_build_object('startupId','aaaaaaaa-0000-0000-0000-000000000001',
        'status','scored','score',88,'rank',1,'maximumHours',60,'proposedHours',60),
      jsonb_build_object('startupId','aaaaaaaa-0000-0000-0000-000000000002',
        'status','scored','score',72,'rank',2,'maximumHours',40,'proposedHours',40),
      -- Never extracted. Must NOT become a 0h allocation.
      jsonb_build_object('startupId','aaaaaaaa-0000-0000-0000-000000000003',
        'status','needs_information',
        'blockers', jsonb_build_array(jsonb_build_object('type','extraction_unavailable')))
    ));
  raise notice 'PASS  a draft run stores all three outcomes, including the blocked one';

  begin
    perform publish_prioritisation_run(v_run.id);
    raise exception 'FAIL: a partial draft was published silently';
  exception when check_violation then
    raise notice 'PASS  publishing a partial draft is refused without acknowledgement';
  end;

  perform publish_prioritisation_run(v_run.id, true, 'chasing Pearl separately');

  if (select count(*) from allocations where cycle_id = v_cycle) <> 2 then
    raise exception 'FAIL: expected exactly 2 allocations, got %',
      (select count(*) from allocations where cycle_id = v_cycle);
  end if;
  raise notice 'PASS  2 allocations written, not 3';

  if exists (select 1 from allocations
             where cycle_id = v_cycle
               and startup_id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'FAIL: the blocked startup was given a 0h allocation';
  end if;
  raise notice 'PASS  the blocked startup has NO allocation row — it needs chasing, not 0h';

  -- It is still visible in the run, which is the whole point.
  if (select status from prioritisation_results
      where run_id = v_run.id
        and startup_id = 'aaaaaaaa-0000-0000-0000-000000000003') <> 'needs_information' then
    raise exception 'FAIL: the blocked startup lost its status';
  end if;
  raise notice 'PASS  and it is still visible in the run as needs_information';
end $$;

\echo ''
\echo '=== F. an adjustment cannot rescue a blocked startup ==============='
do $$
declare v_run uuid;
begin
  select id into v_run from prioritisation_runs
  where cycle_id = 'cccccccc-0000-0000-0000-000000000002';
  begin
    perform adjust_prioritisation_result(v_run,'aaaaaaaa-0000-0000-0000-000000000003',
      20::hour_tier,'they seem fine to me');
    raise exception 'FAIL: a blocked startup was given hours by adjustment';
  exception
    when no_data_found then raise notice 'PASS  a confirmed run cannot be adjusted';
    when check_violation then raise notice 'PASS  only a scored startup can be adjusted';
  end;
end $$;

\echo ''
\echo '=== G. RLS coverage ================================================'
select
  count(*) filter (where c.relrowsecurity) as rls_enabled,
  count(*) filter (where c.relforcerowsecurity) as rls_forced,
  count(*) as tables,
  count(*) filter (where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )) as tables_without_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

\echo ''
\echo '=== H. inventory ==================================================='
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r') as tables,
  (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typtype='e') as enums,
  (select count(*) from pg_policies where schemaname='public') as policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f') as functions,
  (select count(*) from pg_indexes where schemaname='public') as indexes;
