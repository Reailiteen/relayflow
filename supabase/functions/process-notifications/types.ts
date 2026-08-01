export type NotificationJob = {
  id: string;
  claim_token: string;
  recipient_id: string;
  channel: "email" | "slack" | "push";
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  email: string | null;
  slack_channel_id: string | null;
  attempts: number;
  max_attempts: number;
};

export type DeliveryResult = {
  id: string;
  sent: boolean;
  retryable: boolean;
  error?: string;
  providerMessageId?: string;
};
