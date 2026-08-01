import type { DeliveryResult, NotificationJob } from "../types.ts";

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  details?: { error?: string };
};

export async function sendPush(
  jobs: NotificationJob[],
  tokensByUser: ReadonlyMap<string, readonly string[]>,
): Promise<{ results: DeliveryResult[]; deadTokens: string[] }> {
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const results: DeliveryResult[] = [];
  const deadTokens: string[] = [];

  for (const job of jobs) {
    const tokens = tokensByUser.get(job.recipient_id) ?? [];
    if (tokens.length === 0) {
      results.push({
        id: job.id,
        sent: false,
        retryable: false,
        error: "recipient has no registered push device",
      });
      continue;
    }

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          tokens.map((token) => ({
            to: token,
            title: job.title,
            body: job.body,
            data: job.data,
          })),
        ),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        results.push({
          id: job.id,
          sent: false,
          retryable: response.status === 429 || response.status >= 500,
          error: `push provider returned HTTP ${response.status}`,
        });
        continue;
      }

      const payload = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = payload.data ?? [];
      let acceptedId: string | undefined;
      let lastError = "push provider rejected every device";

      tickets.forEach((ticket, index) => {
        if (ticket.status === "ok") acceptedId ??= ticket.id;
        else {
          const code = ticket.details?.error ?? "unknown push error";
          lastError = code;
          if (code === "DeviceNotRegistered") {
            const token = tokens[index];
            if (token) deadTokens.push(token);
          }
        }
      });

      results.push(
        acceptedId
          ? {
              id: job.id,
              sent: true,
              retryable: false,
              providerMessageId: acceptedId,
            }
          : {
              id: job.id,
              sent: false,
              retryable: lastError !== "DeviceNotRegistered",
              error: lastError,
            },
      );
    } catch (error) {
      results.push({
        id: job.id,
        sent: false,
        retryable: true,
        error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "push request failed",
      });
    }
  }

  return { results, deadTokens: [...new Set(deadTokens)] };
}
