import type { DeliveryResult, NotificationJob } from "../types.ts";

async function sendOne(
  job: NotificationJob,
  token: string,
): Promise<DeliveryResult> {
  if (!job.slack_channel_id) {
    return {
      id: job.id,
      sent: false,
      retryable: false,
      error: "recipient has no active Slack destination",
    };
  }

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: job.slack_channel_id,
        text: `${job.title}\n${job.body}`,
        unfurl_links: false,
        unfurl_media: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        id: job.id,
        sent: false,
        retryable: response.status === 429 || response.status >= 500,
        error: `Slack returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      ts?: string;
    };
    if (!payload.ok) {
      const retryable =
        payload.error === "ratelimited" || payload.error === "internal_error";
      return {
        id: job.id,
        sent: false,
        retryable,
        error: `Slack rejected delivery: ${payload.error ?? "unknown error"}`,
      };
    }

    return {
      id: job.id,
      sent: true,
      retryable: false,
      providerMessageId: payload.ts,
    };
  } catch (error) {
    return {
      id: job.id,
      sent: false,
      retryable: true,
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Slack request failed",
    };
  }
}

export async function sendSlack(
  jobs: NotificationJob[],
): Promise<DeliveryResult[]> {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) {
    return jobs.map((job) => ({
      id: job.id,
      sent: false,
      retryable: false,
      error: "Slack channel is not configured",
    }));
  }
  return Promise.all(jobs.map((job) => sendOne(job, token)));
}
