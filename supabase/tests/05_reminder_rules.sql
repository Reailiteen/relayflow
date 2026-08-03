-- The rest of the reminder catalogue: raising, resolving, escalating.
--
-- The assertions that matter here are the negative ones. Any engine can send a
-- message; the ones worth testing are that it stops when the problem is fixed,
-- that a sweep run twice says one thing, and that escalation re-checks rather
-- than firing on a timer.
--
-- Runs after 04, and takes over the cycle it left behind.

\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

begin;

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- A clean slate for counting. Earlier files raised occurrences of their own —
-- 04's placement work trips the conflict trigger — and this file asserts exact
-- numbers.
delete from notifications;
delete from reminder_occurrences;

update cycles set stage = 'closed';
update cycles
set stage = 'selection',
    deadlines = jsonb_build_object(
      'positionSubmission', '2026-04-01T00:00:00Z',
      'candidateSelection', '2026-05-01T00:00:00Z',
      'documentSubmission', '2026-05-20T00:00:00Z'
    )
where id = 'cccccccc-0000-0000-0000-000000000001';

-- Northwind: funded, and about to be reminded about everything.
insert into auth.users (id) values ('77777777-7777-7777-7777-777777777777');
insert into users (id, email, full_name)
values ('77777777-7777-7777-7777-777777777777', 'owner@northwind.test', 'Northwind Owner');
insert into startup_members (startup_id, user_id, role, status)
values ('aaaaaaaa-0000-0000-0000-000000000002',
        '77777777-7777-7777-7777-777777777777', 'owner', 'active');

commit;

select decide_allocation(
  'cccccccc-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  20::hour_tier);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== U2. every rule has an evaluator and a condition ================='

do $$
declare
  v_key text;
  v_missing text[] := '{}';
begin
  -- A rule in the catalogue with no enqueue function is a rule that will never
  -- fire while looking, on the settings screen, exactly like one that does.
  foreach v_key in array reminder_rule_keys()
  loop
    -- `candidate-conflict-raised` is a trigger rather than a sweep, so it is
    -- the one key with no enqueue_* function; it has `notify_selection_conflict`
    -- instead.
    if v_key = 'candidate-conflict-raised' then
      if not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'notify_selection_conflict'
      ) then
        v_missing := v_missing || v_key;
      end if;
      continue;
    end if;

    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname like 'enqueue\_%'
        and pg_get_functiondef(p.oid) like '%' || v_key || '%'
    ) then
      v_missing := v_missing || v_key;
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception 'FAIL: no evaluator for %', array_to_string(v_missing, ', ');
  end if;
  raise notice 'PASS  every catalogued rule has something that raises it';

  -- And a condition, so it can also be resolved. A rule that raises and never
  -- clears escalates forever.
  foreach v_key in array reminder_rule_keys()
  loop
    if pg_get_functiondef(
         (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'reminder_condition_holds')
       ) not like '%' || v_key || '%' then
      raise exception 'FAIL: % has no branch in reminder_condition_holds', v_key;
    end if;
  end loop;
  raise notice 'PASS  and a condition it can be resolved by';
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== V. selection deadline: raised once, then resolved by selecting ==='

do $$
declare
  v_first integer;
  v_second integer;
begin
  -- 72 hours before the 1 May deadline, and Northwind has claimed nobody.
  v_first := enqueue_selection_deadline_reminders('2026-04-28T00:00:00Z');
  v_second := enqueue_selection_deadline_reminders('2026-04-28T06:00:00Z');

  if v_first = 0 then
    raise exception 'FAIL: a startup with no selections was not reminded';
  end if;
  if v_second <> 0 then
    raise exception 'FAIL: a second sweep sent % duplicate rows', v_second;
  end if;
  raise notice 'PASS  the sweep is idempotent within its window';

  -- Outside the window on both sides: too early is silence, and past the
  -- deadline hours-at-risk is the rule that should be speaking.
  if enqueue_selection_deadline_reminders('2026-04-01T00:00:00Z') <> 0 then
    raise exception 'FAIL: reminded before the window opened';
  end if;
  if enqueue_selection_deadline_reminders('2026-05-02T00:00:00Z') <> 0 then
    raise exception 'FAIL: still sending "closes soon" after it closed';
  end if;
  raise notice 'PASS  and silent outside its window on both sides';
end $$;

do $$
declare
  v_selection selections;
begin
  -- Northwind does the thing it was asked to do.
  insert into pool_entries (position_id, candidate_id)
  values ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002');
  select * into v_selection from reserve_candidate(
    'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002');

  if resolve_reminder_occurrences('2026-04-29T00:00:00Z') < 1 then
    raise exception 'FAIL: selecting a candidate did not close the reminder';
  end if;
  -- Scoped to Northwind: other funded startups in this cycle have their own
  -- occurrences and have not selected anybody, so those stay open.
  if (select resolved_at from reminder_occurrences
      where rule_key = 'selection-deadline-approaching'
        and subject_id = 'aaaaaaaa-0000-0000-0000-000000000002') is null then
    raise exception 'FAIL: the occurrence is still open after the condition cleared';
  end if;
  raise notice 'PASS  doing the thing you were asked closes the episode';

  -- And it stays closed. Nothing new for Northwind on the next sweep.
  perform enqueue_selection_deadline_reminders('2026-04-29T06:00:00Z');
  if exists (
    select 1 from reminder_occurrences
    where rule_key = 'selection-deadline-approaching'
      and subject_id = 'aaaaaaaa-0000-0000-0000-000000000002'
      and resolved_at is null
  ) then
    raise exception 'FAIL: the reminder came back after being satisfied';
  end if;
  raise notice 'PASS  and it does not come back';
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== W. hours at risk, and what an approved exception does to it ====='

do $$
declare
  v_exception uuid;
begin
  -- Release Northwind's claim so it is idle again, and move past the deadline.
  update selections set status = 'released', released_at = now()
  where startup_id = 'aaaaaaaa-0000-0000-0000-000000000002';

  if not reminder_condition_holds(
    'hours-at-risk', 'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002', '2026-05-05T00:00:00Z') then
    raise exception 'FAIL: funded, idle and past the deadline is not "at risk"';
  end if;
  raise notice 'PASS  funded, idle and past the deadline reads as at risk';

  -- An approved extension is the pressure valve. It must actually relieve the
  -- pressure — a startup granted more time being told daily that its hours are
  -- about to be reclaimed is the system contradicting its own decision.
  insert into exception_requests (
    cycle_id, startup_id, kind, status, reason, requested_deadline,
    granted_deadline, requested_by, decided_by, decided_at
  ) values (
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
    'candidate_selection', 'approved', 'Our lead candidate deferred.',
    '2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z',
    '77777777-7777-7777-7777-777777777777',
    '11111111-1111-1111-1111-111111111111', now()
  ) returning id into v_exception;

  if reminder_condition_holds(
    'hours-at-risk', 'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002', '2026-05-05T00:00:00Z') then
    raise exception 'FAIL: an approved extension did not stop the at-risk warning';
  end if;
  raise notice 'PASS  an approved extension stops it';

  -- And only an approved one. Pending leaves the original deadline standing.
  update exception_requests set status = 'pending', granted_deadline = null
  where id = v_exception;

  if not reminder_condition_holds(
    'hours-at-risk', 'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002', '2026-05-05T00:00:00Z') then
    raise exception 'FAIL: a pending request behaved like a granted one';
  end if;
  raise notice 'PASS  a pending one does not';
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== X. a pending exception chases QSTP, and stops when decided ======'

do $$
declare
  v_first integer;
begin
  update exception_requests
  set created_at = '2026-05-01T00:00:00Z'
  where startup_id = 'aaaaaaaa-0000-0000-0000-000000000002' and status = 'pending';

  v_first := enqueue_exception_pending_reminders('2026-05-03T00:00:00Z');
  if v_first = 0 then
    raise exception 'FAIL: a two-day-old pending exception did not reach QSTP';
  end if;
  raise notice 'PASS  a pending exception reaches QSTP after a day';

  -- The audience is QSTP, not the startup that asked. Getting this backwards
  -- would tell a startup its own request is overdue.
  if exists (
    select 1 from notifications n
    join reminder_occurrences o on o.id = n.occurrence_id
    where o.rule_key = 'exception-awaiting-decision'
      and n.recipient_id = '77777777-7777-7777-7777-777777777777'
  ) then
    raise exception 'FAIL: the requesting startup was told its own request is late';
  end if;
  raise notice 'PASS  and reaches QSTP rather than the startup that asked';

  -- Deciding it closes the episode.
  perform decide_exception(
    (select id from exception_requests
     where startup_id = 'aaaaaaaa-0000-0000-0000-000000000002' and status = 'pending'),
    'rejected', null, 'The cycle cannot extend further.');

  if resolve_reminder_occurrences('2026-05-04T00:00:00Z') < 1 then
    raise exception 'FAIL: deciding the exception did not close the reminder';
  end if;
  raise notice 'PASS  and deciding it closes the episode';
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== Y. a conflict notifies QSTP in the same transaction ============='

do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from reminder_occurrences
  where rule_key = 'candidate-conflict-raised';

  -- Northwind reaches for the candidate Acme already holds. `reserve_candidate`
  -- writes the conflict; the trigger writes the reminder; both commit together
  -- or neither does.
  insert into pool_entries (position_id, candidate_id)
  values ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001')
  on conflict do nothing;
  perform reserve_candidate(
    'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001');

  select count(*) into v_after from reminder_occurrences
  where rule_key = 'candidate-conflict-raised';

  if v_after <= v_before then
    raise exception 'FAIL: a conflict was recorded with no reminder alongside it';
  end if;
  raise notice 'PASS  a conflict and its reminder are written together';

  if not exists (
    select 1 from notifications n
    join reminder_occurrences o on o.id = n.occurrence_id
    where o.rule_key = 'candidate-conflict-raised'
      and n.recipient_id = '11111111-1111-1111-1111-111111111111'
      and n.channel = 'in_app'
  ) then
    raise exception 'FAIL: QSTP has no in-app record of the conflict';
  end if;
  raise notice 'PASS  and QSTP has the durable in-app record';
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== Z. escalation waits, re-checks, and only fires once ============='

do $$
declare
  v_early integer;
  v_late integer;
  v_again integer;
begin
  -- Give Acme a reason to be chased: funded, idle, past the deadline.
  perform decide_allocation(
    'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000003', 20::hour_tier);

  perform enqueue_hours_at_risk_reminders('2026-05-05T00:00:00Z');

  -- hours-at-risk escalates after 48 hours by default.
  v_early := escalate_reminders('2026-05-05T12:00:00Z');
  if v_early <> 0 then
    raise exception 'FAIL: escalated % rows before the delay elapsed', v_early;
  end if;
  raise notice 'PASS  escalation waits for its delay';

  v_late := escalate_reminders('2026-05-08T00:00:00Z');
  if v_late = 0 then
    raise exception 'FAIL: nothing escalated after the delay elapsed';
  end if;
  raise notice 'PASS  and fires once the delay has passed';

  v_again := escalate_reminders('2026-05-08T06:00:00Z');
  if v_again <> 0 then
    raise exception 'FAIL: escalation repeated, sending % more rows', v_again;
  end if;
  raise notice 'PASS  and does not repeat';

  -- The escalated step is a distinct step_key on the same occurrence, not a
  -- second occurrence — which is what keeps "how many things are wrong" honest.
  if not exists (
    select 1 from notifications where step_key = 'escalation-1'
  ) then
    raise exception 'FAIL: the escalation did not use a distinct step';
  end if;
  raise notice 'PASS  as a second step on the same occurrence';
end $$;

do $$
declare
  v_resolved integer;
begin
  -- Fix the underlying problem, and escalation must stop even though the
  -- occurrence is old enough to qualify.
  insert into pool_entries (position_id, candidate_id)
  values ('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002')
  on conflict do nothing;

  update selections set status = 'reserved', released_at = null
  where startup_id = 'aaaaaaaa-0000-0000-0000-000000000003'
     or startup_id = 'aaaaaaaa-0000-0000-0000-000000000002';

  v_resolved := resolve_reminder_occurrences('2026-05-09T00:00:00Z');
  if v_resolved = 0 then
    raise exception 'FAIL: nothing resolved after the conditions cleared';
  end if;

  if escalate_reminders('2026-05-10T00:00:00Z') <> 0 then
    raise exception 'FAIL: a resolved occurrence escalated anyway';
  end if;
  raise notice 'PASS  a resolved occurrence never escalates';
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== AA. the sweep reports what it did ==============================='

do $$
declare
  v_result jsonb;
begin
  v_result := run_reminder_sweep('2026-05-11T00:00:00Z');

  if v_result ->> 'sweptAt' is null
     or (v_result ->> 'resolved') is null
     or (v_result ->> 'enqueued') is null
     or (v_result ->> 'escalated') is null then
    raise exception 'FAIL: the sweep returned %', v_result;
  end if;
  raise notice 'PASS  run_reminder_sweep returns resolved/enqueued/escalated counts';

  -- Twice in a row is the property that matters: whatever the first pass did,
  -- the second must add nothing.
  if (run_reminder_sweep('2026-05-11T00:10:00Z') ->> 'enqueued')::integer <> 0 then
    raise exception 'FAIL: a second sweep ten minutes later enqueued more';
  end if;
  raise notice 'PASS  and a second sweep enqueues nothing';
end $$;

reset role;
