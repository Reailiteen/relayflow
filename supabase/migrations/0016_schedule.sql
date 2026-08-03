-- 0016 — actually running the sweep
--
-- Everything in 0011 and 0015 is machinery nothing was turning. `pg_cron` is
-- what turns it.
--
-- Two jobs with very different shapes, and the difference matters:
--
--   **The sweep** is pure SQL. `run_reminder_sweep()` needs no URL, no
--   credential and no network, so it is scheduled here, unconditionally, and
--   works the moment this migration lands.
--
--   **The worker drain** is an HTTP call to an Edge function, which needs that
--   function's URL and a shared secret. Neither belongs in a migration — a
--   secret in the migration chain is a secret in git forever, and the URL
--   differs per project. So there is a function an operator calls once, with
--   their own values, and the migration ships the mechanism rather than the
--   credentials.
--
-- Local-safe: the test harness in supabase/tests has neither extension, so
-- everything here is guarded on availability and becomes a no-op rather than
-- breaking `./supabase/tests/run.sh`.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  else
    raise notice 'pg_cron unavailable — scheduling skipped (expected locally)';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise notice 'pg_net unavailable — worker scheduling skipped (expected locally)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The sweep, hourly
-- ---------------------------------------------------------------------------
--
-- Hourly rather than every few minutes. Every rule here is measured in hours or
-- days — a deadline 72 hours out, an exception pending for 24 — so a finer
-- cadence would burn database time to deliver the same messages at the same
-- times. The occurrence keys make a missed hour harmless: the next pass raises
-- whatever the missed one would have, because the condition is still true.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  -- Unschedule first so re-running this migration does not stack duplicate
  -- jobs. `cron.unschedule` raises when the job is absent, hence the guard.
  if exists (select 1 from cron.job where jobname = 'relayflow-reminder-sweep') then
    perform cron.unschedule('relayflow-reminder-sweep');
  end if;

  perform cron.schedule(
    'relayflow-reminder-sweep',
    '7 * * * *', -- seven minutes past, to stay clear of the top-of-hour crowd
    $sweep$ select public.run_reminder_sweep(); $sweep$
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The external-delivery worker
-- ---------------------------------------------------------------------------

/**
 * Point the scheduler at the deployed `process-notifications` function.
 *
 * Called once by an operator, not by the migration:
 *
 *   select schedule_notification_worker(
 *     'https://<project-ref>.supabase.co/functions/v1/process-notifications',
 *     '<the same value as the WORKER_SHARED_SECRET function secret>'
 *   );
 *
 * The secret is passed as an argument and lands only in `cron.job.command`,
 * which is `postgres`-owned and unreadable through PostgREST. That is a real
 * improvement on the alternative — a literal in a migration file, which would
 * be in git, in every clone, and in every CI log that echoes a diff.
 *
 * Every minute, because this one is a queue drain rather than an evaluation:
 * the messages already exist and are waiting, and a minute is the difference
 * between "immediately" and "eventually" for someone waiting on an email.
 */
create or replace function schedule_notification_worker(
  p_function_url text,
  p_worker_secret text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_cron and pg_net are both required to schedule the worker'
      using errcode = 'feature_not_supported';
  end if;

  if p_function_url is null or p_function_url !~ '^https://' then
    raise exception 'the worker URL must be https' using errcode = 'check_violation';
  end if;
  if p_worker_secret is null or char_length(p_worker_secret) < 24 then
    -- Short enough to guess is short enough to drain somebody's queue.
    raise exception 'the worker secret must be at least 24 characters'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from cron.job where jobname = 'relayflow-notification-worker') then
    perform cron.unschedule('relayflow-notification-worker');
  end if;

  perform cron.schedule(
    'relayflow-notification-worker',
    '* * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-worker-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
      $job$,
      p_function_url,
      p_worker_secret
    )
  );
end;
$$;

revoke all on function schedule_notification_worker(text, text)
  from public, anon, authenticated;

/** Stop the drain — for a project being taken down, or a provider outage. */
create or replace function unschedule_notification_worker()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from cron.job where jobname = 'relayflow-notification-worker') then
    perform cron.unschedule('relayflow-notification-worker');
  end if;
end;
$$;

revoke all on function unschedule_notification_worker() from public, anon, authenticated;
