-- The non-QSTP write surface, which 0009 + 0010 made unreachable and 0013 opens.
--
-- Every check here runs as `authenticated`, not as the bootstrap superuser.
-- That distinction is the entire test: as superuser, RLS is bypassed and every
-- one of these would pass whether or not the policies say anything at all.
--
-- The pattern each block asserts is the same one 0013 relies on everywhere —
-- the RPC is the door, the table policy is the wall. A startup may reserve a
-- candidate through `reserve_candidate` and may not touch `selections`
-- directly; a candidate may confirm their own readiness and no one else's.

\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
--
-- Tests 01 and 02 left Spring in `positions` and everything else closed. This
-- file needs a cycle in `selection`, and `cycles_single_active_idx` allows one
-- live cycle at a time, so close everything first and reopen exactly one.

begin;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

update cycles set stage = 'closed';
-- Tests 01 and 02 spent 60 of Spring's 100 funded hours between them. This file
-- is about authorization, not the ceiling — 01 already proves the ceiling holds
-- — so widen the budget rather than have every grant below trip it.
update cycles set stage = 'selection', funded_weekly_hours = 300
where id = 'cccccccc-0000-0000-0000-000000000001';

-- The Acme owner from test 01 has a user row but was never made a member of
-- anything, which is why nothing so far has exercised a startup write.
insert into startup_members (startup_id, user_id, role, status)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'owner', 'active')
on conflict do nothing;

-- Two candidates with accounts of their own: one Acme will claim, one to prove
-- a candidate cannot reach the other's records.
insert into auth.users (id) values
  ('55555555-5555-5555-5555-555555555555'),
  ('66666666-6666-6666-6666-666666666666');

insert into users (id, email, full_name) values
  ('55555555-5555-5555-5555-555555555555', 'layla@test.test', 'Layla'),
  ('66666666-6666-6666-6666-666666666666', 'omar@test.test', 'Omar');

insert into candidates (id, cycle_id, user_id, full_name, email, availability) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   '55555555-5555-5555-5555-555555555555', 'Layla', 'layla@test.test', 'available'),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   '66666666-6666-6666-6666-666666666666', 'Omar', 'omar@test.test', 'available');

insert into positions (id, cycle_id, startup_id, title, description,
                       intern_count, hours_per_intern, duration_weeks, status)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Robotics Intern', 'Build arms',
   1, 20, 12, 'approved'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'Analytics Intern', 'Count things',
   1, 20, 12, 'approved');

insert into pool_entries (position_id, candidate_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001');

commit;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== M. a startup writes through the RPC and only through the RPC ===='

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare
  v_selection selections;
begin
  -- This is the call that has been failing since 0009: `selections_write` is
  -- QSTP-only and `log_activity` needed `is_qstp()`, so a startup owner
  -- reserving a candidate aborted with 42501 partway through.
  select * into v_selection from reserve_candidate(
    'eeeeeeee-0000-0000-0000-000000000001',
    'dddddddd-0000-0000-0000-000000000001');

  if v_selection.id is null then
    raise exception 'FAIL: a startup owner could not reserve an unclaimed candidate';
  end if;
  if v_selection.selected_by <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'FAIL: selected_by is % rather than the caller', v_selection.selected_by;
  end if;
  raise notice 'PASS  a startup owner reserves a candidate through reserve_candidate';
end $$;

-- The audit row is checked as QSTP, because the startup that just caused it
-- still cannot read `activity_events` — writing the log and reading it are
-- separate privileges and 0013 changed only the first.
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
begin
  if not exists (
    select 1 from activity_events
    where entity_type = 'selection'
      and action = 'reserved'
      and actor_id = '22222222-2222-2222-2222-222222222222'
      and actor_role = 'owner'
  ) then
    raise exception 'FAIL: the reservation was not logged, or was logged as the wrong actor';
  end if;
  raise notice 'PASS  the audit row names the startup owner, derived not claimed';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
begin
  -- The wall. If this ever succeeds, a startup can write itself a confirmed
  -- claim and every guard inside the RPC becomes decorative.
  begin
    insert into selections (position_id, startup_id, candidate_id, status, selected_by)
    values ('eeeeeeee-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001',
            'dddddddd-0000-0000-0000-000000000002', 'confirmed',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'FAIL: a startup inserted a selection row directly';
  exception when insufficient_privilege then
    raise notice 'PASS  the same write refused as a bare INSERT';
  end;
end $$;

do $$
begin
  -- Not their position. The guard reads the position's startup, not a
  -- startup id the caller supplied.
  begin
    perform reserve_candidate('eeeeeeee-0000-0000-0000-000000000002',
                              'dddddddd-0000-0000-0000-000000000002');
    raise exception 'FAIL: a startup reserved against another startup''s position';
  exception when insufficient_privilege then
    raise notice 'PASS  a startup cannot reserve against a position it does not own';
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== N. one offer per startup per candidate per position ============='

do $$
begin
  perform reserve_candidate('eeeeeeee-0000-0000-0000-000000000001',
                            'dddddddd-0000-0000-0000-000000000002', 'offered');
  raise notice 'PASS  an offer coexists with another startup''s blocking claim being absent';

  -- selections_one_live_per_candidate_idx does not cover `offered`, so nothing
  -- stopped the same startup offering the same person the same role twice.
  -- selections_one_open_offer_idx does.
  begin
    perform reserve_candidate('eeeeeeee-0000-0000-0000-000000000001',
                              'dddddddd-0000-0000-0000-000000000002', 'offered');
    raise exception 'FAIL: the same startup offered the same role twice';
  exception when unique_violation then
    raise notice 'PASS  a duplicate offer is refused, and is not recorded as a conflict';
  end;

  if exists (
    select 1 from selection_conflicts
    where candidate_id = 'dddddddd-0000-0000-0000-000000000002'
  ) then
    raise exception 'FAIL: a duplicate offer was recorded as a contest between startups';
  end if;
end $$;

do $$
begin
  -- `accepted` and `confirmed` are reached through accept_offer and
  -- confirm_selection, which have their own guards. Naming one here would
  -- route around both.
  begin
    perform reserve_candidate('eeeeeeee-0000-0000-0000-000000000001',
                              'dddddddd-0000-0000-0000-000000000002', 'confirmed');
    raise exception 'FAIL: a startup minted a confirmed claim directly';
  exception when check_violation then
    raise notice 'PASS  a claim can only start as reserved or offered';
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== O. a candidate confirms their own readiness and nobody else''s ==='

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_selection uuid;
begin
  select id into v_selection from selections
  where candidate_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'reserved';

  perform confirm_selection(v_selection, '2026-03-01', '2026-06-01', 'Karim Nasser');
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);

do $$
declare
  v_placement placements;
begin
  select * into v_placement from placements
  where candidate_id = 'dddddddd-0000-0000-0000-000000000001';

  -- `placements_write` is QSTP-only on purpose: a startup or candidate who
  -- could UPDATE the row could also move the dates. One column each, through
  -- one function.
  select * into v_placement from set_placement_readiness(v_placement.id, 'candidate');
  if v_placement.candidate_ready_at is null then
    raise exception 'FAIL: the candidate could not confirm their own readiness';
  end if;
  raise notice 'PASS  the candidate confirms their own readiness';

  begin
    perform set_placement_readiness(v_placement.id, 'qstp');
    raise exception 'FAIL: a candidate gave QSTP''s final approval';
  exception when insufficient_privilege then
    raise notice 'PASS  and cannot give QSTP''s approval on the same placement';
  end;

  begin
    update placements set starts_on = '2027-01-01' where id = v_placement.id;
    if found then
      raise exception 'FAIL: a candidate moved their own start date';
    end if;
    raise notice 'PASS  and cannot reach the placement row directly';
  end;
end $$;

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);

do $$
declare
  v_placement uuid;
begin
  reset role;
  select id into v_placement from placements
  where candidate_id = 'dddddddd-0000-0000-0000-000000000001';
  set role authenticated;

  begin
    perform set_placement_readiness(v_placement, 'candidate');
    raise exception 'FAIL: one candidate confirmed another candidate''s placement';
  exception when insufficient_privilege then
    raise notice 'PASS  a different candidate is refused on the same placement';
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== P. the audit log cannot be written by the people it audits ======'

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);

do $$
declare
  v_event activity_events;
begin
  -- log_activity takes the actor_role from its caller, so it is revoked. A
  -- candidate reaching it could append a row calling themselves a programme
  -- manager, and a log the audited can write answers nothing.
  begin
    perform log_activity('cccccccc-0000-0000-0000-000000000001', 'cycle',
      'cccccccc-0000-0000-0000-000000000001', 'forged', 'program_manager',
      null, null, null);
    raise exception 'FAIL: a candidate called log_activity directly';
  exception when insufficient_privilege then
    raise notice 'PASS  log_activity is unreachable from a request';
  end;

  -- append_activity is the public entry point, and derives the role instead.
  select * into v_event from append_activity(
    'cccccccc-0000-0000-0000-000000000001', 'candidate',
    'dddddddd-0000-0000-0000-000000000001', 'availability_set');

  if v_event.actor_role <> 'candidate' then
    raise exception 'FAIL: append_activity recorded the role as %', v_event.actor_role;
  end if;
  if v_event.actor_id <> '55555555-5555-5555-5555-555555555555' then
    raise exception 'FAIL: append_activity recorded the wrong actor';
  end if;
  raise notice 'PASS  append_activity writes a row whose actor and role are derived';

  -- Written but not readable: activity_events_select is QSTP-only, and nothing
  -- in 0013 changed that.
  if (select count(*) from activity_events) <> 0 then
    raise exception 'FAIL: a candidate can read the audit log';
  end if;
  raise notice 'PASS  and the writer still cannot read the log back';
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== Q. a redistribution grant must land on a tier ==================='

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_placement uuid;
  v_case uuid;
  v_round redistribution_rounds;
begin
  select id into v_placement from placements
  where candidate_id = 'dddddddd-0000-0000-0000-000000000001';

  perform cancel_placement_with_recovery(v_placement, 'The intern took another role.');
  select id into v_case from recovery_cases where placement_id = v_placement;
  update recovery_cases set status = 'confirmed' where id = v_case;

  select * into v_round from create_redistribution_round(
    'cccccccc-0000-0000-0000-000000000001', array[v_case],
    '2026-05-01T00:00:00Z', '2026-05-15T00:00:00Z');

  -- Acme already holds 20 from test 01's budget checks? It holds none here, so
  -- give it 40 first, then offer 30 on top: 70 is not a tier.
  perform decide_allocation('cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001', 40::hour_tier);
  perform invite_to_redistribution(v_round.id,
    'aaaaaaaa-0000-0000-0000-000000000001', 20::hour_tier);
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare
  v_round uuid;
begin
  select id into v_round from redistribution_rounds order by created_at desc limit 1;
  if v_round is null then
    raise exception 'FAIL: an invited startup cannot see the round it was invited into';
  end if;
  raise notice 'PASS  an invited startup can read the round it was invited into';

  -- 40 + 20 = 60, which is a tier, so this one is allowed to succeed and the
  -- startup — not QSTP — is the caller writing an allocation.
  perform respond_to_redistribution(v_round,
    'aaaaaaaa-0000-0000-0000-000000000001', 'accepted');

  if (select weekly_hours from allocations
      where cycle_id = 'cccccccc-0000-0000-0000-000000000001'
        and startup_id = 'aaaaaaaa-0000-0000-0000-000000000001'
        and status = 'confirmed') <> 60 then
    raise exception 'FAIL: the accepted grant did not land on 60 hours';
  end if;
  raise notice 'PASS  a startup accepting a grant writes an allocation it cannot write directly';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_case uuid;
  v_round redistribution_rounds;
begin
  -- Now the failing arithmetic: Acme is on 60, so any further grant overshoots
  -- every tier. Before 0013 this raised 23514 from a cast, with a message
  -- about a check constraint and nothing an operator could act on.
  insert into recovery_cases (cycle_id, startup_id, recoverable_hours, status, reason)
  values ('cccccccc-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000002', 20, 'confirmed', 'Unused hours.')
  returning id into v_case;

  select * into v_round from create_redistribution_round(
    'cccccccc-0000-0000-0000-000000000001', array[v_case],
    '2026-05-20T00:00:00Z', '2026-05-30T00:00:00Z');

  perform invite_to_redistribution(v_round.id,
    'aaaaaaaa-0000-0000-0000-000000000001', 20::hour_tier);

  begin
    perform respond_to_redistribution(v_round.id,
      'aaaaaaaa-0000-0000-0000-000000000001', 'accepted');
    raise exception 'FAIL: 60 + 20 was accepted as a tier';
  exception when check_violation then
    raise notice 'PASS  a grant that does not land on a tier is refused, not rounded';
  end;
end $$;

reset role;
