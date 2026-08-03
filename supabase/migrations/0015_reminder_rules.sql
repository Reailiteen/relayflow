-- 0015 — the rest of the reminder catalogue, plus resolution and escalation
--
-- 0011 built the engine and one rule. docs/design/02-automation-rules.md names
-- eight, and the seven missing ones are here — along with the two things that
-- were structurally absent rather than merely unwritten:
--
--   **Resolution.** `reminder_occurrences.resolved_at` existed and nothing ever
--   set it. Without it an occurrence stays open forever, which means escalation
--   never stops and a startup that submitted its positions an hour after being
--   chased gets chased again, harder.
--
--   **Escalation.** `notifications.step_key` existed and was always 'initial'.
--
-- One design decision runs through the whole file: **a rule's condition is
-- written once**, in `reminder_condition_holds`, and both the enqueue pass and
-- the resolve pass read it. Writing "has this startup submitted positions?"
-- twice — once to raise and once to clear — is how you end up with reminders
-- that cannot be silenced by doing the thing they asked for.
--
-- Everything is `security definer` with `search_path = ''` and granted to
-- `service_role` only, matching 0011. These are swept by a scheduler, not
-- called from a request; nothing here consults `auth.uid()` because there is
-- nobody signed in when it runs.

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------

-- How long an unresolved occurrence waits before it is raised again, louder and
-- to somebody else. Null means this rule does not escalate — most do not, and a
-- rule that escalates by default would turn every nudge into a complaint.
alter table reminder_rule_configurations
  add column if not exists escalation_after_hours integer
    check (escalation_after_hours is null or escalation_after_hours between 1 and 720);

/**
 * The rule catalogue, as SQL knows it.
 *
 * It also exists in `REMINDER_RULES` in @relayflow/entities, because a settings
 * screen has to explain a rule to somebody deciding whether to turn it off and
 * a function name explains nothing. Two lists is a drift risk, so both are
 * asserted against this one: `supabase/tests/05_reminder_rules.sql` checks the
 * SQL side and `packages/entities` checks the TypeScript side, and a rule added
 * to one and not the other fails both suites rather than quietly never firing.
 */
create or replace function reminder_rule_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'positions-not-submitted',
    'selection-deadline-approaching',
    'hours-at-risk',
    'exception-awaiting-decision',
    'documents-awaiting-verification',
    'candidate-availability-unknown',
    'pool-untouched',
    'candidate-conflict-raised'
  ]::text[];
$$;

/**
 * How long each rule waits before escalating, when QSTP has not said otherwise.
 *
 * Keyed by rule and resolved inside `reminder_settings`, so no caller passes it
 * — which is the whole point. It was a parameter first, and the enqueue pass
 * supplied it while the escalation pass did not, so `escalation_after_hours`
 * came back null every time and nothing ever escalated. A default that two
 * callers have to agree about is a default that will eventually be wrong in
 * one of them.
 *
 * Null means the rule does not escalate. Most do not: escalation says "the
 * responsible party has not acted", and saying that about a nudge is how people
 * learn to ignore the whole channel.
 */
create or replace function reminder_default_escalation_hours(p_rule_key text)
returns integer
language sql
immutable
as $$
  select case p_rule_key
    -- The one that costs money.
    when 'hours-at-risk' then 48
    when 'positions-not-submitted' then 48
    when 'pool-untouched' then 72
    else null
  end;
$$;

-- The resolved settings for one rule in one cycle: the cycle-specific row if
-- there is one, the global row otherwise, and the code-owned defaults if
-- neither exists. Returned as a row so a rule body reads its configuration in
-- one statement instead of six variables and a `not found` branch.
create or replace function reminder_settings(
  p_rule_key text,
  p_cycle_id uuid,
  p_default_offset_hours integer default null,
  p_default_preferred notification_channel[] default array['email']::notification_channel[]
) returns table (
  enabled boolean,
  offset_hours integer,
  required_channels notification_channel[],
  preferred_channels notification_channel[],
  mandatory boolean,
  urgent boolean,
  escalation_after_hours integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(config.enabled, true),
    coalesce(config.schedule_offset_hours, p_default_offset_hours),
    coalesce(config.required_channels, array['in_app']::public.notification_channel[]),
    coalesce(config.preferred_channels, p_default_preferred),
    coalesce(config.mandatory, false),
    coalesce(config.urgent, false),
    coalesce(config.escalation_after_hours, public.reminder_default_escalation_hours(p_rule_key))
  from (select 1) as always
  left join public.reminder_rule_configurations config
    on config.rule_key = p_rule_key
   and (config.cycle_id = p_cycle_id or config.cycle_id is null)
  order by config.cycle_id nulls last
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

/**
 * The deadline a startup is actually held to.
 *
 * An approved exception with a granted date moves it; a pending, rejected or
 * expired one does not. That distinction is the entire point of the exception
 * mechanism — it is what stops "I asked for an extension" behaving like "I was
 * given one" — so every rule that talks about lateness reads it from here
 * rather than from `cycles.deadlines` directly.
 */
create or replace function effective_selection_deadline(p_cycle_id uuid, p_startup_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select max(e.granted_deadline)
      from public.exception_requests e
      where e.cycle_id = p_cycle_id
        and e.startup_id = p_startup_id
        and e.kind = 'candidate_selection'
        and e.status = 'approved'
        and e.granted_deadline is not null
    ),
    (select (c.deadlines ->> 'candidateSelection')::timestamptz
     from public.cycles c where c.id = p_cycle_id)
  );
$$;

/** Who hears about a programme-level problem. Viewers read; they do not chase. */
create or replace function qstp_operations_recipients()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(s.user_id), '{}'::uuid[])
  from public.qstp_staff s
  where s.role in ('program_manager', 'operations');
$$;

create or replace function startup_recipients(p_startup_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.user_id), '{}'::uuid[])
  from public.startup_members m
  where m.startup_id = p_startup_id
    and m.status = 'active'
    and m.role in ('owner', 'member');
$$;

/**
 * Record an episode and tell people about it, once.
 *
 * The occurrence key is the idempotency guarantee: a sweep that runs twice, or
 * a runner that restarts mid-pass, upserts the same row and fans out to the
 * same `(occurrence, step, recipient, channel)` tuples, which the unique
 * constraint on `notifications` refuses a second time. Nothing here needs to
 * ask "have I already sent this?" — the schema answers.
 */
create or replace function emit_reminder(
  p_cycle_id uuid,
  p_rule_key text,
  p_subject_type reminder_subject_type,
  p_subject_id uuid,
  p_occurrence_key text,
  p_context jsonb,
  p_step_key text,
  p_recipients uuid[],
  p_category notification_category,
  p_title text,
  p_body text,
  p_required_channels notification_channel[],
  p_preferred_channels notification_channel[],
  p_mandatory boolean,
  p_now timestamptz
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence_id uuid;
begin
  if p_recipients is null or cardinality(p_recipients) = 0 then
    -- Nobody to tell. Still worth recording that the condition was detected —
    -- "we noticed and there was no one to notify" is a different fact from "we
    -- never noticed", and only one of them is a configuration problem.
    insert into public.reminder_occurrences (
      cycle_id, rule_key, subject_type, subject_id, occurrence_key, context, detected_at
    ) values (
      p_cycle_id, p_rule_key, p_subject_type, p_subject_id,
      p_occurrence_key, p_context, p_now
    )
    on conflict (occurrence_key) do nothing;
    return 0;
  end if;

  insert into public.reminder_occurrences (
    cycle_id, rule_key, subject_type, subject_id, occurrence_key, context, detected_at
  ) values (
    p_cycle_id, p_rule_key, p_subject_type, p_subject_id, p_occurrence_key, p_context, p_now
  )
  on conflict (occurrence_key) do update
    set occurrence_key = excluded.occurrence_key
  returning id into v_occurrence_id;

  return public.fanout_reminder_step(
    v_occurrence_id, p_step_key, p_recipients, p_category,
    p_title, p_body, p_context,
    p_required_channels, p_preferred_channels, p_mandatory
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The condition catalogue
-- ---------------------------------------------------------------------------

/**
 * Does the thing this occurrence was raised about still hold?
 *
 * One function, one branch per rule, read by both `resolve_reminder_occurrences`
 * and `escalate_reminders`. A rule whose condition is written twice will
 * eventually disagree with itself, and the failure mode is the worst kind: a
 * reminder that cannot be stopped by fixing the problem.
 *
 * Schedule-triggered rules resolve on their subject having done the thing, not
 * on the clock — a startup that submits its positions after the deadline has
 * still submitted them, and chasing it further is noise.
 */
create or replace function reminder_condition_holds(
  p_rule_key text,
  p_cycle_id uuid,
  p_subject_id uuid,
  p_now timestamptz default now()
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  case p_rule_key

    when 'positions-not-submitted' then
      return not exists (
        select 1 from public.positions p
        where p.cycle_id = p_cycle_id and p.startup_id = p_subject_id
          and p.status in ('submitted', 'under_review', 'changes_requested',
                           'resubmitted', 'approved', 'locked', 'filled')
      );

    when 'selection-deadline-approaching' then
      return not exists (
        select 1
        from public.selections s
        join public.positions p on p.id = s.position_id
        where p.cycle_id = p_cycle_id and s.startup_id = p_subject_id
          and s.status in ('offered', 'reserved', 'accepted', 'confirmed')
      );

    -- `startupCycleFlags` in packages/entities/src/board/board.ts, said in SQL:
    -- past the effective deadline, nothing claimed, no approved exception
    -- standing in the way of a reclaim, and hours actually at stake. The board
    -- and the reminder must agree about which startups are in trouble, so this
    -- is the one predicate with a vitest asserting the two match.
    when 'hours-at-risk' then
      return
        p_now > public.effective_selection_deadline(p_cycle_id, p_subject_id)
        and exists (
          select 1 from public.allocations a
          where a.cycle_id = p_cycle_id and a.startup_id = p_subject_id
            and a.status = 'confirmed' and a.weekly_hours > 0
        )
        and not exists (
          select 1
          from public.selections s
          join public.positions p on p.id = s.position_id
          where p.cycle_id = p_cycle_id and s.startup_id = p_subject_id
            and s.status in ('offered', 'reserved', 'accepted', 'confirmed')
        )
        and not exists (
          select 1 from public.exception_requests e
          where e.cycle_id = p_cycle_id and e.startup_id = p_subject_id
            and e.status = 'approved' and e.granted_deadline is not null
            and e.granted_deadline > p_now
        );

    when 'exception-awaiting-decision' then
      return exists (
        select 1 from public.exception_requests e
        where e.id = p_subject_id and e.status = 'pending'
      );

    when 'documents-awaiting-verification' then
      return exists (
        select 1 from public.candidate_documents d
        where d.id = p_subject_id and d.status = 'submitted'
      );

    when 'candidate-availability-unknown' then
      return exists (
        select 1 from public.candidates c
        where c.id = p_subject_id and c.availability = 'unconfirmed'
      );

    when 'pool-untouched' then
      return exists (
        select 1
        from public.pool_entries e
        join public.positions p on p.id = e.position_id
        where p.cycle_id = p_cycle_id and p.startup_id = p_subject_id
          and e.reviewed_at is null
          -- `pending` is where a pool entry starts. Every other status is the
          -- startup having done something with it, which is precisely what
          -- "untouched" means it has not.
          and e.status = 'pending'
      );

    -- An event, not a state. A conflict that has been resolved is over.
    when 'candidate-conflict-raised' then
      return exists (
        select 1 from public.selection_conflicts c
        where c.id = p_subject_id and c.status = 'open'
      );

    else
      -- An unknown rule key. Returning true keeps the occurrence open rather
      -- than quietly closing episodes for a rule somebody renamed — an
      -- unresolved reminder is visible, a wrongly-resolved one is not.
      return true;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule-triggered rules
-- ---------------------------------------------------------------------------

/**
 * Selection closes soon and this startup has claimed nobody.
 *
 * Anchored to the *effective* deadline, so a startup with an approved extension
 * is chased relative to the date it was actually given.
 */
create or replace function enqueue_selection_deadline_reminders(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject record;
  settings record;
  v_deadline timestamptz;
  v_due_at timestamptz;
  v_enqueued integer := 0;
begin
  for subject in
    select c.id as cycle_id, s.id as startup_id, s.name as startup_name
    from public.cycles c
    join public.allocations a
      on a.cycle_id = c.id and a.status = 'confirmed' and a.weekly_hours > 0
    join public.startups s on s.id = a.startup_id
    where c.archived_at is null and c.stage = 'selection'
  loop
    if not public.reminder_condition_holds(
      'selection-deadline-approaching', subject.cycle_id, subject.startup_id, p_now
    ) then
      continue;
    end if;

    select * into settings from public.reminder_settings(
      'selection-deadline-approaching', subject.cycle_id, -72,
      array['email', 'slack', 'push']::public.notification_channel[]);
    if not settings.enabled then continue; end if;

    v_deadline := public.effective_selection_deadline(subject.cycle_id, subject.startup_id);
    if v_deadline is null then continue; end if;
    v_due_at := v_deadline + make_interval(hours => settings.offset_hours);

    -- Valid from its scheduled instant until the deadline itself. Past that,
    -- `hours-at-risk` is the rule that should be speaking, and it says something
    -- much more serious.
    if p_now < v_due_at or p_now > v_deadline then continue; end if;

    v_enqueued := v_enqueued + public.emit_reminder(
      subject.cycle_id, 'selection-deadline-approaching', 'startup', subject.startup_id,
      'selection-deadline-approaching:' || subject.cycle_id::text || ':' ||
        subject.startup_id::text || ':' || extract(epoch from v_due_at)::bigint::text,
      jsonb_build_object(
        'startupName', subject.startup_name,
        'deadline', v_deadline,
        'route', '/startup/cycles/' || subject.cycle_id::text || '/selection'
      ),
      'initial',
      public.startup_recipients(subject.startup_id),
      'deadline',
      'Selection closes soon',
      subject.startup_name || ' has not selected any candidates. Selection closes ' ||
        to_char(v_deadline, 'DD Mon YYYY HH24:MI TZ') || '.',
      settings.required_channels, settings.preferred_channels, settings.mandatory,
      p_now
    );
  end loop;

  return v_enqueued;
end;
$$;

-- ---------------------------------------------------------------------------
-- State-triggered rules
-- ---------------------------------------------------------------------------

/**
 * Allocated hours about to be reclaimed.
 *
 * The one reminder that costs money if ignored, so it is `mandatory` by default
 * — a startup cannot mute the message telling it that it is about to lose its
 * funding — and it escalates to QSTP after 48 hours.
 */
create or replace function enqueue_hours_at_risk_reminders(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject record;
  settings record;
  v_window bigint;
  v_enqueued integer := 0;
begin
  for subject in
    select c.id as cycle_id, s.id as startup_id, s.name as startup_name,
           a.weekly_hours
    from public.cycles c
    join public.allocations a
      on a.cycle_id = c.id and a.status = 'confirmed' and a.weekly_hours > 0
    join public.startups s on s.id = a.startup_id
    where c.archived_at is null and c.stage in ('selection', 'completion')
  loop
    if not public.reminder_condition_holds(
      'hours-at-risk', subject.cycle_id, subject.startup_id, p_now
    ) then
      continue;
    end if;

    select * into settings from public.reminder_settings(
      'hours-at-risk', subject.cycle_id, null,
      array['email', 'slack', 'push']::public.notification_channel[]);
    if not settings.enabled then continue; end if;

    -- A state that stays true does not deserve a message every hour. One
    -- occurrence per day keeps it visible without becoming wallpaper — and
    -- because the key is the day, a sweep that runs twelve times in that day
    -- still produces one.
    v_window := floor(extract(epoch from p_now) / 86400)::bigint;

    v_enqueued := v_enqueued + public.emit_reminder(
      subject.cycle_id, 'hours-at-risk', 'startup', subject.startup_id,
      'hours-at-risk:' || subject.cycle_id::text || ':' || subject.startup_id::text ||
        ':' || v_window::text,
      jsonb_build_object(
        'startupName', subject.startup_name,
        'hours', subject.weekly_hours,
        'route', '/startup/cycles/' || subject.cycle_id::text || '/selection'
      ),
      'initial',
      public.startup_recipients(subject.startup_id),
      'deadline',
      'Your hours are at risk',
      subject.weekly_hours || ' weekly hours allocated to ' || subject.startup_name ||
        ' are unspent past the selection deadline, and can be reclaimed and offered ' ||
        'to another startup. Select a candidate or request an extension.',
      settings.required_channels, settings.preferred_channels,
      -- Mandatory unless QSTP has explicitly said otherwise.
      coalesce(settings.mandatory, true) or settings.mandatory is not false,
      p_now
    );
  end loop;

  return v_enqueued;
end;
$$;

/** An exception request nobody has decided, 24 hours on. Subject: the request. */
create or replace function enqueue_exception_pending_reminders(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject record;
  settings record;
  v_window bigint;
  v_recipients uuid[];
  v_enqueued integer := 0;
begin
  v_recipients := public.qstp_operations_recipients();

  for subject in
    select e.id, e.cycle_id, e.startup_id, e.kind, e.created_at, s.name as startup_name
    from public.exception_requests e
    join public.startups s on s.id = e.startup_id
    join public.cycles c on c.id = e.cycle_id and c.archived_at is null
    where e.status = 'pending'
      and p_now >= e.created_at + interval '24 hours'
  loop
    select * into settings from public.reminder_settings(
      'exception-awaiting-decision', subject.cycle_id, null,
      array['email']::public.notification_channel[]);
    if not settings.enabled then continue; end if;

    v_window := floor(extract(epoch from p_now) / 86400)::bigint;

    v_enqueued := v_enqueued + public.emit_reminder(
      subject.cycle_id, 'exception-awaiting-decision', 'exception', subject.id,
      'exception-awaiting-decision:' || subject.id::text || ':' || v_window::text,
      jsonb_build_object(
        'startupName', subject.startup_name,
        'kind', subject.kind,
        'route', '/exceptions'
      ),
      'initial',
      v_recipients,
      'exception',
      'An extension request is waiting',
      subject.startup_name || ' asked for a ' || replace(subject.kind::text, '_', ' ') ||
        ' extension on ' || to_char(subject.created_at, 'DD Mon') ||
        ' and it has not been decided. Until it is, the original deadline stands.',
      settings.required_channels, settings.preferred_channels, settings.mandatory,
      p_now
    );
  end loop;

  return v_enqueued;
end;
$$;

/**
 * Documents sitting in the verification queue.
 *
 * Digested rather than sent one per document: an operations person opening
 * their inbox to fourteen separate "a document is waiting" messages learns
 * nothing they could not have learned from one. So the subject is the cycle,
 * the count is in the body, and the occurrence key is the day.
 */
create or replace function enqueue_document_verification_reminders(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject record;
  settings record;
  v_window bigint;
  v_recipients uuid[];
  v_enqueued integer := 0;
begin
  v_recipients := public.qstp_operations_recipients();
  v_window := floor(extract(epoch from p_now) / 86400)::bigint;

  for subject in
    select c.id as cycle_id, count(*) as waiting
    from public.candidate_documents d
    join public.candidates cand on cand.id = d.candidate_id
    join public.cycles c on c.id = cand.cycle_id and c.archived_at is null
    where d.status = 'submitted'
      and p_now >= d.updated_at + interval '24 hours'
    group by c.id
  loop
    select * into settings from public.reminder_settings(
      'documents-awaiting-verification', subject.cycle_id, null,
      array['email']::public.notification_channel[]);
    if not settings.enabled then continue; end if;

    v_enqueued := v_enqueued + public.emit_reminder(
      subject.cycle_id, 'documents-awaiting-verification', 'document', subject.cycle_id,
      'documents-awaiting-verification:' || subject.cycle_id::text || ':' || v_window::text,
      jsonb_build_object('waiting', subject.waiting, 'route', '/documents'),
      'initial',
      v_recipients,
      'onboarding',
      subject.waiting || ' document' || case when subject.waiting = 1 then '' else 's' end ||
        ' waiting for verification',
      'Candidates have submitted ' || subject.waiting ||
        ' document' || case when subject.waiting = 1 then '' else 's' end ||
        ' that have been waiting more than a day. Nobody can start until they are checked.',
      settings.required_channels, settings.preferred_channels, settings.mandatory,
      p_now
    );
  end loop;

  return v_enqueued;
end;
$$;

/**
 * A candidate in somebody's pool who has not said whether they are still
 * available.
 *
 * The highest-value question in the product — startups interviewing people who
 * took another job weeks ago is the single biggest source of waste the brief
 * names — and the only rule whose audience is the candidate themselves.
 * Candidates with no account get an occurrence and no notification, which is
 * `emit_reminder`'s empty-recipients branch doing exactly what it is for.
 */
create or replace function enqueue_candidate_availability_reminders(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject record;
  settings record;
  v_window bigint;
  v_enqueued integer := 0;
begin
  v_window := floor(extract(epoch from p_now) / 86400)::bigint;

  for subject in
    select distinct cand.id as candidate_id, cand.cycle_id, cand.user_id, cand.full_name
    from public.candidates cand
    join public.pool_entries e on e.candidate_id = cand.id
    join public.positions p on p.id = e.position_id
    join public.cycles c on c.id = cand.cycle_id and c.archived_at is null
    where cand.availability = 'unconfirmed'
      and c.stage = 'selection'
      and e.status not in ('rejected', 'lost', 'withdrawn')
  loop
    select * into settings from public.reminder_settings(
      'candidate-availability-unknown', subject.cycle_id, null,
      -- No Slack: candidates have no workspace, and offering a channel that
      -- cannot reach them would show as an opt-out they never had.
      array['email', 'push']::public.notification_channel[]);
    if not settings.enabled then continue; end if;

    v_enqueued := v_enqueued + public.emit_reminder(
      subject.cycle_id, 'candidate-availability-unknown', 'candidate', subject.candidate_id,
      'candidate-availability-unknown:' || subject.candidate_id::text || ':' || v_window::text,
      jsonb_build_object('route', '/candidate'),
      'initial',
      case when subject.user_id is null then '{}'::uuid[] else array[subject.user_id] end,
      'candidate',
      'Are you still available?',
      'Startups are reviewing you for internships this cycle. Confirming whether you ' ||
        'are still available takes a moment and stops you being interviewed for roles ' ||
        'you no longer want.',
      settings.required_channels, settings.preferred_channels, settings.mandatory,
      p_now
    );
  end loop;

  return v_enqueued;
end;
$$;

/** A pool shared five days ago that the startup has not opened. */
create or replace function enqueue_pool_untouched_reminders(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject record;
  settings record;
  v_window bigint;
  v_enqueued integer := 0;
begin
  v_window := floor(extract(epoch from p_now) / 86400)::bigint;

  for subject in
    select p.cycle_id, p.startup_id, s.name as startup_name, count(*) as waiting
    from public.pool_entries e
    join public.positions p on p.id = e.position_id
    join public.startups s on s.id = p.startup_id
    join public.cycles c on c.id = p.cycle_id and c.archived_at is null
    where e.status = 'pending'
      and e.reviewed_at is null
      and p_now >= e.shared_at + interval '5 days'
      and c.stage = 'selection'
    group by p.cycle_id, p.startup_id, s.name
  loop
    select * into settings from public.reminder_settings(
      'pool-untouched', subject.cycle_id, null,
      array['email', 'slack']::public.notification_channel[]);
    if not settings.enabled then continue; end if;

    v_enqueued := v_enqueued + public.emit_reminder(
      subject.cycle_id, 'pool-untouched', 'startup', subject.startup_id,
      'pool-untouched:' || subject.cycle_id::text || ':' || subject.startup_id::text ||
        ':' || v_window::text,
      jsonb_build_object(
        'startupName', subject.startup_name,
        'waiting', subject.waiting,
        'route', '/startup/candidates'
      ),
      'initial',
      public.startup_recipients(subject.startup_id),
      'candidate',
      'Candidates are waiting for you',
      subject.waiting || ' candidate' || case when subject.waiting = 1 then '' else 's' end ||
        ' shared with ' || subject.startup_name ||
        ' have been waiting more than five days without being reviewed. They are being ' ||
        'considered by other startups in the meantime.',
      settings.required_channels, settings.preferred_channels, settings.mandatory,
      p_now
    );
  end loop;

  return v_enqueued;
end;
$$;

-- ---------------------------------------------------------------------------
-- Event-triggered: a candidate conflict
-- ---------------------------------------------------------------------------

/**
 * Two startups want the same person, and QSTP has to decide.
 *
 * A trigger rather than a sweep, and that is the point: the conflict row and
 * the reminder are written in the same transaction, so a committed conflict
 * cannot exist without its notification. A sweep would leave a window — small,
 * but exactly the window in which the startup that lost is on the phone.
 *
 * Urgent by default. This one bypasses digesting because the losing startup is
 * blocked until it is resolved.
 */
create or replace function notify_selection_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings record;
  v_candidate text;
  v_requested text;
  v_previous text;
begin
  select * into settings from public.reminder_settings(
    'candidate-conflict-raised', new.cycle_id, null,
    array['email', 'slack']::public.notification_channel[]);
  if not settings.enabled then return new; end if;

  select full_name into v_candidate from public.candidates where id = new.candidate_id;
  select name into v_requested from public.startups where id = new.requested_startup_id;
  select name into v_previous from public.startups where id = new.previous_startup_id;

  perform public.emit_reminder(
    new.cycle_id, 'candidate-conflict-raised', 'selection', new.id,
    'candidate-conflict-raised:' || new.id::text,
    jsonb_build_object(
      'candidateName', v_candidate,
      'route', '/selection'
    ),
    'initial',
    public.qstp_operations_recipients(),
    'selection',
    'Two startups want the same candidate',
    coalesce(v_requested, 'A startup') || ' tried to claim ' ||
      coalesce(v_candidate, 'a candidate') || ', who is already held by ' ||
      coalesce(v_previous, 'another startup') || '. Both are waiting on a decision.',
    settings.required_channels, settings.preferred_channels, settings.mandatory,
    now()
  );

  return new;
end;
$$;

drop trigger if exists selection_conflicts_notify on selection_conflicts;
create trigger selection_conflicts_notify
  after insert on selection_conflicts
  for each row execute function notify_selection_conflict();

-- ---------------------------------------------------------------------------
-- Resolution
-- ---------------------------------------------------------------------------

/**
 * Close every occurrence whose condition no longer holds.
 *
 * The half of the engine that was missing. Without it, escalation never stops
 * and the audit of "what were we chasing on the 12th" grows forever — but the
 * behaviour that actually matters is smaller and more human: a startup that
 * submitted its positions an hour after being nudged should not be nudged
 * again, and this is what makes that true.
 */
create or replace function resolve_reminder_occurrences(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurrence record;
  v_resolved integer := 0;
begin
  for occurrence in
    select id, rule_key, cycle_id, subject_id
    from public.reminder_occurrences
    where resolved_at is null
  loop
    if not public.reminder_condition_holds(
      occurrence.rule_key, occurrence.cycle_id, occurrence.subject_id, p_now
    ) then
      update public.reminder_occurrences
      set resolved_at = p_now
      where id = occurrence.id;
      v_resolved := v_resolved + 1;
    end if;
  end loop;

  return v_resolved;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escalation
-- ---------------------------------------------------------------------------

/**
 * Raise it again, to somebody who can do something about it.
 *
 * Re-evaluates the condition before every step, so an occurrence that has
 * quietly become true again — or was resolved between passes — cannot escalate.
 * `resolve_reminder_occurrences` runs first in the sweep for that reason.
 *
 * The escalated audience is QSTP operations, always. Escalation means "the
 * party responsible has not acted", and the only people above a startup in this
 * programme are the people funding it. Named individuals were considered and
 * rejected: a rule that escalates to a person breaks when that person leaves.
 *
 * Idempotent through `unique (occurrence_id, step_key, recipient_id, channel)`,
 * so running the sweep twice in the escalation window sends one message.
 */
create or replace function escalate_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurrence record;
  settings record;
  v_recipients uuid[];
  v_subject text;
  v_enqueued integer := 0;
begin
  v_recipients := public.qstp_operations_recipients();
  if cardinality(v_recipients) = 0 then return 0; end if;

  for occurrence in
    select o.id, o.rule_key, o.cycle_id, o.subject_id, o.context, o.detected_at
    from public.reminder_occurrences o
    where o.resolved_at is null
  loop
    select * into settings from public.reminder_settings(
      occurrence.rule_key, occurrence.cycle_id, null,
      array['email']::public.notification_channel[]);
    if not settings.enabled or settings.escalation_after_hours is null then continue; end if;
    if p_now < occurrence.detected_at + make_interval(hours => settings.escalation_after_hours) then
      continue;
    end if;

    -- Re-checked, not assumed. Between the sweep that raised this and now, the
    -- startup may have done exactly what it was asked.
    if not public.reminder_condition_holds(
      occurrence.rule_key, occurrence.cycle_id, occurrence.subject_id, p_now
    ) then
      continue;
    end if;

    v_subject := coalesce(occurrence.context ->> 'startupName', 'A startup');

    v_enqueued := v_enqueued + public.fanout_reminder_step(
      occurrence.id,
      'escalation-1',
      v_recipients,
      'deadline',
      'Unanswered: ' || replace(occurrence.rule_key, '-', ' '),
      v_subject || ' was reminded ' || settings.escalation_after_hours ||
        ' hours ago and nothing has changed. This may need a call rather than another email.',
      occurrence.context,
      array['in_app']::public.notification_channel[],
      settings.preferred_channels,
      true
    );
  end loop;

  return v_enqueued;
end;
$$;

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------

/**
 * One entry point, so the order lives in SQL rather than in cron configuration.
 *
 * Resolve first. Raising a reminder about something that has already been
 * fixed, and only then noticing it was fixed, would send a message that was
 * wrong at the moment it was written — and escalation reads the same open set,
 * so an occurrence resolved in this pass must not also be escalated in it.
 */
create or replace function run_reminder_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolved integer;
  v_enqueued integer := 0;
  v_escalated integer;
begin
  v_resolved := public.resolve_reminder_occurrences(p_now);

  v_enqueued := v_enqueued + public.enqueue_positions_not_submitted_reminders(p_now);
  v_enqueued := v_enqueued + public.enqueue_selection_deadline_reminders(p_now);
  v_enqueued := v_enqueued + public.enqueue_hours_at_risk_reminders(p_now);
  v_enqueued := v_enqueued + public.enqueue_exception_pending_reminders(p_now);
  v_enqueued := v_enqueued + public.enqueue_document_verification_reminders(p_now);
  v_enqueued := v_enqueued + public.enqueue_candidate_availability_reminders(p_now);
  v_enqueued := v_enqueued + public.enqueue_pool_untouched_reminders(p_now);

  v_escalated := public.escalate_reminders(p_now);

  return jsonb_build_object(
    'resolved', v_resolved,
    'enqueued', v_enqueued,
    'escalated', v_escalated,
    'sweptAt', p_now
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- Service role only, like everything in 0011. A client that could run a sweep
-- could mint notifications for anybody.

revoke all on function reminder_settings(
  text, uuid, integer, notification_channel[]) from public, anon, authenticated;
revoke all on function reminder_default_escalation_hours(text) from public, anon, authenticated;
revoke all on function emit_reminder(
  uuid, text, reminder_subject_type, uuid, text, jsonb, text, uuid[],
  notification_category, text, text, notification_channel[], notification_channel[],
  boolean, timestamptz) from public, anon, authenticated;
revoke all on function reminder_condition_holds(text, uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function effective_selection_deadline(uuid, uuid) from public, anon, authenticated;
revoke all on function qstp_operations_recipients() from public, anon, authenticated;
revoke all on function startup_recipients(uuid) from public, anon, authenticated;
revoke all on function enqueue_selection_deadline_reminders(timestamptz)
  from public, anon, authenticated;
revoke all on function enqueue_hours_at_risk_reminders(timestamptz)
  from public, anon, authenticated;
revoke all on function enqueue_exception_pending_reminders(timestamptz)
  from public, anon, authenticated;
revoke all on function enqueue_document_verification_reminders(timestamptz)
  from public, anon, authenticated;
revoke all on function enqueue_candidate_availability_reminders(timestamptz)
  from public, anon, authenticated;
revoke all on function enqueue_pool_untouched_reminders(timestamptz)
  from public, anon, authenticated;
revoke all on function resolve_reminder_occurrences(timestamptz) from public, anon, authenticated;
revoke all on function escalate_reminders(timestamptz) from public, anon, authenticated;
revoke all on function run_reminder_sweep(timestamptz) from public, anon, authenticated;

grant execute on function run_reminder_sweep(timestamptz) to service_role;
grant execute on function resolve_reminder_occurrences(timestamptz) to service_role;
grant execute on function escalate_reminders(timestamptz) to service_role;
grant execute on function enqueue_selection_deadline_reminders(timestamptz) to service_role;
grant execute on function enqueue_hours_at_risk_reminders(timestamptz) to service_role;
grant execute on function enqueue_exception_pending_reminders(timestamptz) to service_role;
grant execute on function enqueue_document_verification_reminders(timestamptz) to service_role;
grant execute on function enqueue_candidate_availability_reminders(timestamptz) to service_role;
grant execute on function enqueue_pool_untouched_reminders(timestamptz) to service_role;
