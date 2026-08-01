-- 0011 — durable reminder engine and multi-channel delivery queue
--
-- Adapted from the useful parts of Parametra's notification system: one row per
-- recipient/channel, one fan-out function, recipient-scoped RLS, partial hot
-- path indexes, and leased worker claims. RelayFlow adds a separate occurrence
-- record, cycle scoping, required/preferred channel policy, and claim tokens so
-- a stale worker cannot overwrite a job that has already been reclaimed.

create type notification_channel as enum ('in_app', 'email', 'slack', 'push');
create type notification_category as enum (
  'deadline', 'selection', 'exception', 'onboarding', 'candidate', 'system'
);
create type notification_status as enum (
  'queued', 'processing', 'sent', 'delivered', 'failed', 'bounced'
);
create type reminder_subject_type as enum (
  'startup', 'candidate', 'exception', 'document', 'selection'
);

-- Code owns rule definitions. This table stores only the safe configuration
-- QSTP may change without inventing new predicates or executable behaviour.
create table reminder_rule_configurations (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null check (char_length(rule_key) between 1 and 120),
  cycle_id uuid references cycles (id) on delete cascade,
  enabled boolean not null default true,
  schedule_offset_hours integer,
  audience jsonb not null default '{}'::jsonb,
  required_channels notification_channel[] not null default '{in_app}',
  preferred_channels notification_channel[] not null default '{email}',
  mandatory boolean not null default false,
  urgent boolean not null default false,
  updated_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(required_channels) > 0),
  check (required_channels @> array['in_app']::notification_channel[])
);

create unique index reminder_rule_config_global_idx
  on reminder_rule_configurations (rule_key) where cycle_id is null;
create unique index reminder_rule_config_cycle_idx
  on reminder_rule_configurations (rule_key, cycle_id) where cycle_id is not null;

create trigger reminder_rule_configurations_updated_at
  before update on reminder_rule_configurations
  for each row execute function set_updated_at();

-- One occurrence is one concrete rule/subject episode. It is deliberately
-- separate from notifications: escalation may create several notification
-- steps, and every step may fan out to several people and channels.
create table reminder_occurrences (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  rule_key text not null check (char_length(rule_key) between 1 and 120),
  subject_type reminder_subject_type not null,
  subject_id uuid not null,
  occurrence_key text not null unique check (char_length(occurrence_key) between 1 and 500),
  context jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (resolved_at is null or resolved_at >= detected_at)
);

create index reminder_occurrences_cycle_open_idx
  on reminder_occurrences (cycle_id, detected_at)
  where resolved_at is null;
create index reminder_occurrences_subject_idx
  on reminder_occurrences (subject_type, subject_id, detected_at desc);

-- One logical notification becomes one row per recipient/channel. In-app rows
-- are the durable record and are born sent; external rows form the worker queue.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references reminder_occurrences (id) on delete cascade,
  step_key text not null default 'initial' check (char_length(step_key) between 1 and 120),
  recipient_id uuid not null references users (id) on delete cascade,
  channel notification_channel not null,
  category notification_category not null,
  status notification_status not null,
  title text not null check (char_length(title) between 1 and 300),
  body text not null check (char_length(body) between 1 and 5000),
  data jsonb not null default '{}'::jsonb,
  mandatory boolean not null default false,
  read_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  scheduled_for timestamptz not null default now(),
  claim_token uuid,
  claimed_until timestamptz,
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_id, step_key, recipient_id, channel),
  check (channel = 'in_app' or read_at is null),
  check (
    (status = 'processing' and claim_token is not null and claimed_until is not null)
    or
    (status <> 'processing' and claim_token is null and claimed_until is null)
  )
);

create trigger notifications_updated_at
  before update on notifications
  for each row execute function set_updated_at();

create index notifications_inbox_idx
  on notifications (recipient_id, created_at desc)
  where channel = 'in_app';
create index notifications_unread_idx
  on notifications (recipient_id)
  where channel = 'in_app' and read_at is null;
create index notifications_queue_idx
  on notifications (scheduled_for)
  where channel <> 'in_app' and status in ('queued', 'processing');

-- Missing preference rows mean "use the channel default". Mandatory reminders
-- ignore opt-outs, and in-app is always written as the record.
create table notification_preferences (
  user_id uuid not null references users (id) on delete cascade,
  category notification_category not null,
  channel notification_channel not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, channel),
  check (channel <> 'in_app' or enabled)
);

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token text not null unique check (char_length(token) between 1 and 500),
  platform text check (platform in ('ios', 'android', 'web')),
  device_id text check (device_id is null or char_length(device_id) <= 300),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_tokens_user_idx on push_tokens (user_id);

-- OAuth tokens remain Edge secrets or a future encrypted integration table.
-- This table stores only the non-secret destination a worker may send to.
create table slack_notification_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  workspace_id text not null check (char_length(workspace_id) between 1 and 100),
  channel_id text not null check (char_length(channel_id) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, channel_id)
);

create index slack_notification_targets_user_idx
  on slack_notification_targets (user_id) where active;

create trigger slack_notification_targets_updated_at
  before update on slack_notification_targets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS and least-privilege grants
-- ---------------------------------------------------------------------------

alter table reminder_rule_configurations enable row level security;
alter table reminder_rule_configurations force row level security;
alter table reminder_occurrences enable row level security;
alter table reminder_occurrences force row level security;
alter table notifications enable row level security;
alter table notifications force row level security;
alter table notification_preferences enable row level security;
alter table notification_preferences force row level security;
alter table push_tokens enable row level security;
alter table push_tokens force row level security;
alter table slack_notification_targets enable row level security;
alter table slack_notification_targets force row level security;

create policy reminder_rule_configurations_read on reminder_rule_configurations
  for select to authenticated using (is_qstp());
create policy reminder_rule_configurations_manage on reminder_rule_configurations
  for all to authenticated
  using (has_qstp_role('program_manager'))
  with check (has_qstp_role('program_manager') and updated_by = auth.uid());

create policy reminder_occurrences_qstp_read on reminder_occurrences
  for select to authenticated using (is_qstp());

-- Recipients see only their in-app record. Provider errors and external-channel
-- audit rows stay QSTP-only so integration details do not leak through the API.
create policy notifications_recipient_read on notifications
  for select to authenticated
  using (recipient_id = auth.uid() and channel = 'in_app');
create policy notifications_recipient_mark_read on notifications
  for update to authenticated
  using (recipient_id = auth.uid() and channel = 'in_app')
  with check (recipient_id = auth.uid() and channel = 'in_app');
create policy notifications_qstp_read on notifications
  for select to authenticated using (is_qstp());

create policy notification_preferences_owner on notification_preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_tokens_owner on push_tokens
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy slack_notification_targets_owner_read on slack_notification_targets
  for select to authenticated using (user_id = auth.uid());
create policy slack_notification_targets_owner_delete on slack_notification_targets
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on reminder_rule_configurations to authenticated;
grant select on reminder_occurrences to authenticated;
grant select on notifications to authenticated;
grant update (read_at) on notifications to authenticated;
grant select, insert, update, delete on notification_preferences to authenticated;
grant select, insert, update, delete on push_tokens to authenticated;
grant select, delete on slack_notification_targets to authenticated;

-- Realtime is optional in the local schema harness but present on Supabase.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table notifications;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fan-out
-- ---------------------------------------------------------------------------

create or replace function fanout_reminder_step(
  p_occurrence_id uuid,
  p_step_key text,
  p_recipients uuid[],
  p_category notification_category,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_required_channels notification_channel[] default '{in_app}',
  p_preferred_channels notification_channel[] default '{email}',
  p_mandatory boolean default false
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  if p_occurrence_id is null then
    raise exception 'occurrence is required' using errcode = 'not_null_violation';
  end if;
  if p_recipients is null or cardinality(p_recipients) = 0 then
    return 0;
  end if;

  -- In-app is unconditionally added because it is the record. Required
  -- channels ignore preferences; preferred channels honour them unless the
  -- reminder itself is mandatory.
  insert into public.notifications (
    occurrence_id, step_key, recipient_id, channel, category, status,
    title, body, data, mandatory, scheduled_for, sent_at
  )
  select
    p_occurrence_id,
    p_step_key,
    recipient.user_id,
    chosen.channel,
    p_category,
    case when chosen.channel = 'in_app'
      then 'sent'::public.notification_status
      else 'queued'::public.notification_status
    end,
    p_title,
    p_body,
    p_data,
    p_mandatory,
    now(),
    case when chosen.channel = 'in_app' then now() else null end
  from (
    select distinct user_id
    from unnest(p_recipients) as users(user_id)
  ) recipient
  cross join lateral (
    select distinct channel
    from unnest(
      array_append(
        coalesce(p_required_channels, '{}'::public.notification_channel[]),
        'in_app'::public.notification_channel
      ) || coalesce(p_preferred_channels, '{}'::public.notification_channel[])
    ) as channels(channel)
  ) chosen
  where exists (select 1 from public.users u where u.id = recipient.user_id)
    and (
      chosen.channel = 'in_app'
      or chosen.channel = any(coalesce(p_required_channels, '{}'::public.notification_channel[]))
      or p_mandatory
      or coalesce((
        select preference.enabled
        from public.notification_preferences preference
        where preference.user_id = recipient.user_id
          and preference.category = p_category
          and preference.channel = chosen.channel
      ), true)
    )
    and (
      chosen.channel <> 'push'
      or chosen.channel = any(coalesce(p_required_channels, '{}'::public.notification_channel[]))
      or exists (select 1 from public.push_tokens token where token.user_id = recipient.user_id)
    )
    and (
      chosen.channel <> 'slack'
      or chosen.channel = any(coalesce(p_required_channels, '{}'::public.notification_channel[]))
      or exists (
        select 1 from public.slack_notification_targets target
        where target.user_id = recipient.user_id and target.active
      )
    )
  on conflict (occurrence_id, step_key, recipient_id, channel) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function fanout_reminder_step(
  uuid, text, uuid[], notification_category, text, text, jsonb,
  notification_channel[], notification_channel[], boolean
) from public, anon, authenticated;
grant execute on function fanout_reminder_step(
  uuid, text, uuid[], notification_category, text, text, jsonb,
  notification_channel[], notification_channel[], boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- First scheduled rule: positions not submitted
-- ---------------------------------------------------------------------------

create or replace function enqueue_positions_not_submitted_reminders(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  v_occurrence_id uuid;
  v_recipients uuid[];
  v_enabled boolean;
  v_offset_hours integer;
  v_required public.notification_channel[];
  v_preferred public.notification_channel[];
  v_mandatory boolean;
  v_due_at timestamptz;
  v_enqueued integer := 0;
begin
  for candidate in
    select c.id as cycle_id, c.deadlines, s.id as startup_id, s.name as startup_name
    from public.cycles c
    join public.allocations a
      on a.cycle_id = c.id and a.status = 'confirmed' and a.weekly_hours > 0
    join public.startups s on s.id = a.startup_id
    where c.archived_at is null
      and c.stage = 'positions'
      and not exists (
        select 1 from public.positions p
        where p.cycle_id = c.id
          and p.startup_id = s.id
          and p.status in (
            'submitted', 'under_review', 'changes_requested', 'resubmitted',
            'approved', 'locked', 'filled'
          )
      )
  loop
    select config.enabled, coalesce(config.schedule_offset_hours, -72),
           config.required_channels, config.preferred_channels, config.mandatory
      into v_enabled, v_offset_hours, v_required, v_preferred, v_mandatory
    from public.reminder_rule_configurations config
    where config.rule_key = 'positions-not-submitted'
      and (config.cycle_id = candidate.cycle_id or config.cycle_id is null)
    order by config.cycle_id nulls last
    limit 1;

    if not found then
      v_enabled := true;
      v_offset_hours := -72;
      v_required := array['in_app']::public.notification_channel[];
      v_preferred := array['email', 'slack', 'push']::public.notification_channel[];
      v_mandatory := false;
    end if;
    if not v_enabled then continue; end if;

    v_due_at := (candidate.deadlines ->> 'positionSubmission')::timestamptz
      + make_interval(hours => v_offset_hours);

    -- The reminder is valid from its scheduled instant until the deadline. If
    -- the runner was down for the entire window, an overdue rule should speak
    -- instead of sending a stale "due soon" message.
    if p_now < v_due_at
       or p_now > (candidate.deadlines ->> 'positionSubmission')::timestamptz then
      continue;
    end if;

    insert into public.reminder_occurrences (
      cycle_id, rule_key, subject_type, subject_id, occurrence_key, context, detected_at
    ) values (
      candidate.cycle_id,
      'positions-not-submitted',
      'startup',
      candidate.startup_id,
      'positions-not-submitted:' || candidate.cycle_id::text || ':' ||
        candidate.startup_id::text || ':' || extract(epoch from v_due_at)::bigint::text,
      jsonb_build_object(
        'startupName', candidate.startup_name,
        'deadline', candidate.deadlines ->> 'positionSubmission',
        'route', '/startup/cycles/' || candidate.cycle_id::text || '/positions'
      ),
      p_now
    )
    on conflict (occurrence_key) do update
      set occurrence_key = excluded.occurrence_key
    returning id into v_occurrence_id;

    select array_agg(distinct member.user_id)
      into v_recipients
    from public.startup_members member
    where member.startup_id = candidate.startup_id
      and member.status = 'active'
      and member.role in ('owner', 'member');

    v_enqueued := v_enqueued + public.fanout_reminder_step(
      v_occurrence_id,
      'initial',
      v_recipients,
      'deadline',
      'Positions are due soon',
      candidate.startup_name || ' has not submitted any positions. Submit them before ' ||
        to_char((candidate.deadlines ->> 'positionSubmission')::timestamptz, 'DD Mon YYYY HH24:MI TZ') || '.',
      jsonb_build_object(
        'route', '/startup/cycles/' || candidate.cycle_id::text || '/positions',
        'startupId', candidate.startup_id,
        'cycleId', candidate.cycle_id
      ),
      v_required,
      v_preferred,
      v_mandatory
    );
  end loop;

  return v_enqueued;
end;
$$;

revoke all on function enqueue_positions_not_submitted_reminders(timestamptz)
  from public, anon, authenticated;
grant execute on function enqueue_positions_not_submitted_reminders(timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Leased external-delivery worker
-- ---------------------------------------------------------------------------

create or replace function claim_due_notifications(p_limit integer default 100)
returns table (
  id uuid,
  claim_token uuid,
  recipient_id uuid,
  channel notification_channel,
  category notification_category,
  title text,
  body text,
  data jsonb,
  email text,
  slack_channel_id text,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'claim limit must be between 1 and 500' using errcode = 'check_violation';
  end if;

  return query
  with due as (
    select queued.id
    from public.notifications queued
    where queued.channel <> 'in_app'
      and (
        (queued.status = 'queued' and queued.scheduled_for <= now())
        or
        (queued.status = 'processing' and queued.claimed_until <= now())
      )
    order by queued.scheduled_for, queued.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.notifications notification
    set status = 'processing',
        attempts = notification.attempts + 1,
        claim_token = gen_random_uuid(),
        claimed_until = now() + interval '5 minutes'
    from due
    where notification.id = due.id
    returning notification.*
  )
  select claimed.id, claimed.claim_token, claimed.recipient_id,
         claimed.channel, claimed.category, claimed.title, claimed.body,
         claimed.data, recipient.email,
         slack.channel_id, claimed.attempts, claimed.max_attempts
  from claimed
  join public.users recipient on recipient.id = claimed.recipient_id
  left join lateral (
    select target.channel_id
    from public.slack_notification_targets target
    where target.user_id = claimed.recipient_id and target.active
    order by target.created_at
    limit 1
  ) slack on true;
end;
$$;

create or replace function finish_notification_delivery(
  p_id uuid,
  p_claim_token uuid,
  p_status notification_status,
  p_error text default null,
  p_scheduled_for timestamptz default null,
  p_provider_message_id text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_status not in ('queued', 'sent', 'delivered', 'failed', 'bounced') then
    raise exception 'invalid terminal/retry status' using errcode = 'check_violation';
  end if;
  if p_status = 'queued' and p_scheduled_for is null then
    raise exception 'a retry needs scheduled_for' using errcode = 'not_null_violation';
  end if;

  update public.notifications
  set status = p_status,
      claim_token = null,
      claimed_until = null,
      last_error = left(p_error, 1000),
      scheduled_for = coalesce(p_scheduled_for, scheduled_for),
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      sent_at = case when p_status in ('sent', 'delivered') then now() else sent_at end,
      delivered_at = case when p_status = 'delivered' then now() else delivered_at end
  where id = p_id and status = 'processing' and claim_token = p_claim_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function get_push_tokens(p_user_ids uuid[])
returns table (user_id uuid, token text)
language sql
security definer
set search_path = ''
as $$
  select push.user_id, push.token
  from public.push_tokens push
  where push.user_id = any(p_user_ids);
$$;

revoke all on function claim_due_notifications(integer) from public, anon, authenticated;
revoke all on function finish_notification_delivery(
  uuid, uuid, notification_status, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function get_push_tokens(uuid[]) from public, anon, authenticated;
grant execute on function claim_due_notifications(integer) to service_role;
grant execute on function finish_notification_delivery(
  uuid, uuid, notification_status, text, timestamptz, text
) to service_role;
grant execute on function get_push_tokens(uuid[]) to service_role;

grant select, update on notifications to service_role;
grant select on users, slack_notification_targets, push_tokens to service_role;
