-- Reminder engine: schedule window, idempotency, fan-out policy, worker leases,
-- and positive/negative RLS paths.

\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '=== I. reminder occurrence and fan-out are idempotent ==============='

insert into auth.users (id)
values ('44444444-4444-4444-4444-444444444444');

insert into users (id, email, full_name)
values ('44444444-4444-4444-4444-444444444444', 'owner@pearl.test', 'Pearl Owner');

insert into startup_members (startup_id, user_id, role, status)
values (
  'aaaaaaaa-0000-0000-0000-000000000003',
  '44444444-4444-4444-4444-444444444444',
  'owner',
  'active'
);

-- Test 01 left Autumn active. Close both cycles before putting Spring back into
-- the positions stage so the one-active-cycle constraint remains meaningful.
update cycles set stage = 'closed';
update cycles
set stage = 'positions',
    deadlines = jsonb_set(
      deadlines,
      '{positionSubmission}',
      '"2026-08-10T12:00:00Z"'::jsonb
    )
where id = 'cccccccc-0000-0000-0000-000000000001';

-- A new psql connection, so the JWT claim test 01 set is gone and `auth.uid()`
-- is null again. `decide_allocation` is QSTP-guarded since 0013, so seeding
-- through it means acting as the programme manager rather than as nobody.
select set_config(
  'request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select decide_allocation(
  'cccccccc-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000003',
  20::hour_tier
);

do $$
declare
  v_first integer;
  v_second integer;
begin
  select enqueue_positions_not_submitted_reminders('2026-08-08T12:00:00Z') into v_first;
  select enqueue_positions_not_submitted_reminders('2026-08-08T13:00:00Z') into v_second;

  if v_first <> 2 then
    raise exception 'FAIL: expected in-app + email, got % rows', v_first;
  end if;
  if v_second <> 0 then
    raise exception 'FAIL: repeated sweep inserted % duplicate rows', v_second;
  end if;
  if (select count(*) from reminder_occurrences
      where rule_key = 'positions-not-submitted'
        and subject_id = 'aaaaaaaa-0000-0000-0000-000000000003') <> 1 then
    raise exception 'FAIL: expected exactly one reminder occurrence';
  end if;
  if (select count(*) from notifications
      where recipient_id = '44444444-4444-4444-4444-444444444444') <> 2 then
    raise exception 'FAIL: expected exactly two channel rows';
  end if;
  raise notice 'PASS  repeated sweeps create one occurrence and one row per eligible channel';
end $$;

\echo ''
\echo '=== J. preferences and endpoint gates are enforced =================='

insert into notification_preferences (user_id, category, channel, enabled)
values ('44444444-4444-4444-4444-444444444444', 'deadline', 'email', false);

do $$
declare
  v_occurrence uuid;
  v_optional integer;
  v_mandatory integer;
  v_required integer;
begin
  select id into v_occurrence
  from reminder_occurrences
  where rule_key = 'positions-not-submitted'
    and subject_id = 'aaaaaaaa-0000-0000-0000-000000000003';

  select fanout_reminder_step(
    v_occurrence,
    'preference-test',
    array['44444444-4444-4444-4444-444444444444']::uuid[],
    'deadline',
    'Optional test',
    'Email is opted out.',
    '{}'::jsonb,
    array['in_app']::notification_channel[],
    array['email','slack','push']::notification_channel[],
    false
  ) into v_optional;

  if v_optional <> 1 then
    raise exception 'FAIL: optional fan-out should create only in-app, got %', v_optional;
  end if;

  select fanout_reminder_step(
    v_occurrence,
    'mandatory-test',
    array['44444444-4444-4444-4444-444444444444']::uuid[],
    'deadline',
    'Mandatory test',
    'Mandatory ignores the email opt-out.',
    '{}'::jsonb,
    array['in_app']::notification_channel[],
    array['email','slack','push']::notification_channel[],
    true
  ) into v_mandatory;

  if v_mandatory <> 2 then
    raise exception 'FAIL: mandatory fan-out should create in-app + email, got %', v_mandatory;
  end if;
  if exists (
    select 1 from notifications
    where occurrence_id = v_occurrence
      and step_key in ('preference-test', 'mandatory-test')
      and channel in ('slack', 'push')
  ) then
    raise exception 'FAIL: Slack/push queued without a registered endpoint';
  end if;

  select fanout_reminder_step(
    v_occurrence,
    'required-endpoint-test',
    array['44444444-4444-4444-4444-444444444444']::uuid[],
    'deadline',
    'Required endpoint test',
    'A required channel records an attempt even without an endpoint.',
    '{}'::jsonb,
    array['in_app','push']::notification_channel[],
    '{}'::notification_channel[],
    false
  ) into v_required;

  if v_required <> 2 or not exists (
    select 1 from notifications
    where occurrence_id = v_occurrence
      and step_key = 'required-endpoint-test'
      and channel = 'push'
  ) then
    raise exception 'FAIL: required push did not create an auditable delivery row';
  end if;
  raise notice 'PASS  opt-outs, mandatory delivery, endpoint gates, and required attempts agree';
end $$;

\echo ''
\echo '=== K. worker claims are leased and compare-and-set ================='

do $$
declare
  v_job record;
  v_wrong boolean;
  v_finished boolean;
begin
  select * into v_job from claim_due_notifications(1);
  if v_job.id is null or v_job.channel <> 'email' or v_job.attempts <> 1 then
    raise exception 'FAIL: expected one claimed email delivery';
  end if;

  select finish_notification_delivery(
    v_job.id,
    gen_random_uuid(),
    'sent',
    null,
    null,
    'wrong-claim'
  ) into v_wrong;
  if v_wrong then
    raise exception 'FAIL: stale claim token completed the delivery';
  end if;

  select finish_notification_delivery(
    v_job.id,
    v_job.claim_token,
    'sent',
    null,
    null,
    'provider-123'
  ) into v_finished;
  if not v_finished then
    raise exception 'FAIL: current claim token could not complete the delivery';
  end if;
  raise notice 'PASS  only the current worker lease can complete a delivery';
end $$;

\echo ''
\echo '=== L. notification RLS allows own inbox and denies other users ======'

set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

do $$
declare
  v_inbox integer;
  v_updated integer;
begin
  select count(*) into v_inbox from notifications;
  if v_inbox <> 4 then
    raise exception 'FAIL: recipient should see four in-app rows, saw %', v_inbox;
  end if;

  update notifications
  set read_at = '2026-08-08T14:00:00Z'
  where channel = 'in_app' and read_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 4 then
    raise exception 'FAIL: recipient could not mark own inbox read';
  end if;

  begin
    perform fanout_reminder_step(
      (select id from reminder_occurrences limit 1),
      'forbidden-client-call',
      array['44444444-4444-4444-4444-444444444444']::uuid[],
      'system', 'Forbidden', 'Clients cannot dispatch reminders.'
    );
    raise exception 'FAIL: authenticated client executed system fan-out';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS  recipient reads/updates only the in-app projection and cannot dispatch';
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare
  v_visible integer;
  v_updated integer;
begin
  select count(*) into v_visible from notifications;
  if v_visible <> 0 then
    raise exception 'FAIL: unrelated startup user saw % notification rows', v_visible;
  end if;

  update notifications
  set read_at = now()
  where recipient_id = '44444444-4444-4444-4444-444444444444';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'FAIL: unrelated startup user updated another inbox';
  end if;
  raise notice 'PASS  unrelated startup user cannot read or update another inbox';
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
begin
  if (select count(*) from reminder_occurrences) < 1 then
    raise exception 'FAIL: QSTP cannot inspect reminder occurrences';
  end if;

  -- Scoped to this rule rather than counting the whole table. 0015 added an
  -- AFTER INSERT trigger on `selection_conflicts`, and test 01 creates one — so
  -- a global count here would measure the conflict rule as well and change
  -- every time the catalogue grows.
  if (
    select count(*) from notifications n
    join reminder_occurrences o on o.id = n.occurrence_id
    where o.rule_key = 'positions-not-submitted'
  ) <> 7 then
    raise exception 'FAIL: QSTP cannot inspect all channel audit rows';
  end if;
  raise notice 'PASS  QSTP can inspect occurrences and every channel audit row';
end $$;

reset role;
