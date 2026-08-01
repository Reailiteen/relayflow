// Drains RelayFlow's queued email, Slack and push deliveries. This hackathon
// deployment is intentionally callable without JWT or a custom worker secret.
// Restore caller authentication before using it with real participant data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmails } from "./channels/email.ts";
import { sendPush } from "./channels/push.ts";
import { sendSlack } from "./channels/slack.ts";
import type { DeliveryResult, NotificationJob } from "./types.ts";

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const backoffMilliseconds = (attempts: number): number =>
  Math.min(2 ** attempts, 60) * 60_000;

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "notification worker is not configured" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_due_notifications",
    { p_limit: 100 },
  );
  if (claimError)
    return json({ error: "could not claim notification deliveries" }, 500);

  const jobs = (claimed ?? []) as NotificationJob[];
  if (jobs.length === 0)
    return json({ claimed: 0, sent: 0, retried: 0, failed: 0 });

  const results: DeliveryResult[] = [];
  const emailJobs = jobs.filter((job) => job.channel === "email");
  const slackJobs = jobs.filter((job) => job.channel === "slack");
  const pushJobs = jobs.filter((job) => job.channel === "push");

  if (emailJobs.length) results.push(...(await sendEmails(emailJobs)));
  if (slackJobs.length) results.push(...(await sendSlack(slackJobs)));

  if (pushJobs.length) {
    const userIds = [...new Set(pushJobs.map((job) => job.recipient_id))];
    const { data: tokenRows, error: tokenError } = await supabase.rpc(
      "get_push_tokens",
      {
        p_user_ids: userIds,
      },
    );

    if (tokenError) {
      results.push(
        ...pushJobs.map((job) => ({
          id: job.id,
          sent: false,
          retryable: true,
          error: "could not resolve push devices",
        })),
      );
    } else {
      const tokensByUser = new Map<string, string[]>();
      for (const row of (tokenRows ?? []) as {
        user_id: string;
        token: string;
      }[]) {
        const tokens = tokensByUser.get(row.user_id) ?? [];
        tokens.push(row.token);
        tokensByUser.set(row.user_id, tokens);
      }
      const push = await sendPush(pushJobs, tokensByUser);
      results.push(...push.results);
      if (push.deadTokens.length) {
        await supabase
          .from("push_tokens")
          .delete()
          .in("token", push.deadTokens);
      }
    }
  }

  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const completions = await Promise.all(
    results.map(async (result) => {
      const job = jobById.get(result.id);
      if (!job) return { kind: "failed" as const, recorded: false };

      const exhausted = job.attempts >= job.max_attempts;
      const status = result.sent
        ? "sent"
        : result.retryable && !exhausted
          ? "queued"
          : "failed";
      const scheduledFor =
        status === "queued"
          ? new Date(
              Date.now() + backoffMilliseconds(job.attempts),
            ).toISOString()
          : undefined;

      const { data, error } = await supabase.rpc(
        "finish_notification_delivery",
        {
          p_id: job.id,
          p_claim_token: job.claim_token,
          p_status: status,
          p_error: result.error,
          p_scheduled_for: scheduledFor,
          p_provider_message_id: result.providerMessageId,
        },
      );

      return {
        kind:
          status === "sent"
            ? ("sent" as const)
            : status === "queued"
              ? ("retried" as const)
              : ("failed" as const),
        recorded: !error && data === true,
      };
    }),
  );

  return json({
    claimed: jobs.length,
    sent: completions.filter((result) => result.kind === "sent").length,
    retried: completions.filter((result) => result.kind === "retried").length,
    failed: completions.filter((result) => result.kind === "failed").length,
    staleClaims: completions.filter((result) => !result.recorded).length,
  });
});
