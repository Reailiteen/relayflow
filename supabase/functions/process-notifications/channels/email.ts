import type { DeliveryResult, NotificationJob } from "../types.ts";

const RATE_LIMIT = 2;
const RATE_WINDOW_MS = 1_100;

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Readonly<Record<string, string>> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return escaped[character] ?? character;
  });
}

function renderHtml(job: NotificationJob): string {
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "");
  const route = typeof job.data.route === "string" ? job.data.route : null;
  const href = route && appUrl ? `${appUrl}${route}` : null;

  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px;font-size:18px">${escapeHtml(job.title)}</h2>
      <p style="margin:0 0 16px;color:#444;font-size:14px;line-height:1.5">${escapeHtml(job.body)}</p>
      ${
        href
          ? `<a href="${escapeHtml(href)}" style="display:inline-block;background:#3157d5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Open RelayFlow</a>`
          : ""
      }
    </div>`;
}

async function sendOne(
  job: NotificationJob,
  apiKey: string,
  from: string,
): Promise<DeliveryResult> {
  if (!job.email) {
    return {
      id: job.id,
      sent: false,
      retryable: false,
      error: "recipient has no email",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "RelayFlow/0.1 notifications",
      },
      body: JSON.stringify({
        from,
        to: job.email,
        subject: job.title,
        html: renderHtml(job),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        id: job.id,
        sent: false,
        retryable: response.status === 429 || response.status >= 500,
        // Do not persist provider response bodies: they may contain recipient
        // details or operational metadata.
        error: `email provider returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    return {
      id: job.id,
      sent: true,
      retryable: false,
      providerMessageId:
        typeof payload?.id === "string" ? payload.id : undefined,
    };
  } catch (error) {
    return {
      id: job.id,
      sent: false,
      retryable: true,
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "email request failed",
    };
  }
}

export async function sendEmails(
  jobs: NotificationJob[],
): Promise<DeliveryResult[]> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFICATIONS_FROM");
  if (!apiKey || !from) {
    return jobs.map((job) => ({
      id: job.id,
      sent: false,
      retryable: false,
      error: "email channel is not configured",
    }));
  }

  const results: DeliveryResult[] = [];
  for (let index = 0; index < jobs.length; index += RATE_LIMIT) {
    const batch = jobs.slice(index, index + RATE_LIMIT);
    results.push(
      ...(await Promise.all(batch.map((job) => sendOne(job, apiKey, from)))),
    );
    if (index + RATE_LIMIT < jobs.length) await wait(RATE_WINDOW_MS);
  }
  return results;
}
