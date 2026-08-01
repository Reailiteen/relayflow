# 02A — Reminder engine: triggers, audiences, channels

## The change

The brief's stated purpose is replacing "emails, Slack messages, and manual
follow-ups". Today RelayFlow knows Desert Bloom has not submitted positions and
does nothing — a human must open the dashboard and notice. This is the largest
gap between what exists and what was asked for.

This document covers reminders only: in-app, email, Slack and push. It owns how
RelayFlow detects something worth communicating, determines who should hear it,
records the notification and delivers external copies.

Automations that change programme state — reclaiming hours, expiring
exceptions, withdrawing offers and similar actions — are intentionally separate.
See [02B — Action automations](./02-action-automations.md).

## Shape

```ts
interface ReminderRule {
  id: RuleId;
  key: string; // stable, code-owned identifier
  name: string; // e.g. "Chase silent startups"
  enabled: boolean;
  cycleId: CycleId | null; // null = applies to every cycle

  trigger: Trigger;
  audience: Audience;
  notification: {
    template: TemplateId;
    channels: ChannelPolicy;
    category: NotificationCategory;
    mandatory: boolean; // recipients cannot mute it
    urgent: boolean; // bypasses digest
  };

  cooldownHours: number | null;
  escalation: readonly EscalationStep[];
}
```

### Trigger — three kinds, all needed

```ts
type Trigger =
  | { kind: "schedule"; anchor: DeadlineName; offsetHours: number }
  | { kind: "state"; predicate: PredicateName }
  | { kind: "event"; event: DomainEventName };
```

`schedule` covers reminders relative to deadlines. `state` covers "is something
wrong right now?" `event` covers communicating immediately after an action.

Predicates should be a closed, typed catalog rather than arbitrary strings.
`StartupCycleFacts` and `startupCycleFlags` in
`packages/entities/src/board/board.ts` are existing ingredients: "hours at risk"
must call the same derivation as the board. Time-based predicates such as
"pending for 24 hours" will need additional pure evaluators beside them.

### Subject and audience are different

The subject is what caused the reminder; the audience is who receives it.

- Positions not submitted: subject = startup; audience = that startup's members.
- Candidate conflict: subject = candidate; audience = QSTP operations.
- Exception pending: subject = exception request; audience = QSTP operations.

Evaluation produces a concrete occurrence before recipients are resolved:

```ts
interface ReminderOccurrence {
  id: OccurrenceId;
  ruleId: RuleId;
  cycleId: CycleId;
  subject: {
    kind: "startup" | "candidate" | "exception" | "document" | "selection";
    id: string;
  };
  occurrenceKey: string;
  detectedAt: string;
  resolvedAt: string | null;
  context: Readonly<Record<string, unknown>>;
}
```

The occurrence's context is the safe, typed data needed to render the message;
templates do not perform fresh domain queries.

```ts
type Audience = {
  principal: "qstp" | "startup" | "candidate";
  scope:
    | { kind: "all" }
    | { kind: "matching"; predicate: PredicateName }
    | { kind: "explicit"; ids: readonly string[] };
  roles?: readonly string[];
};
```

Audience resolution needs a recipient-directory port. The current repositories
can list startup members but cannot generally list QSTP staff or user delivery
details. Candidates may have no `userId`, so email may be possible when in-app
and push are not.

## Channels

In-app, email, Slack, push. **No WhatsApp. No quiet hours** (decided).

> **In-app is the record. External channels are copies.**

An authenticated recipient always gets a notification row. Every external
channel is attempted separately and has its own delivery status. A bounced email
loses a copy, never the notification.

```ts
interface ChannelPolicy {
  required: readonly Channel[];
  preferred: readonly Channel[]; // subject to recipient preference
}

interface Notification {
  id: NotificationId;
  occurrenceId: OccurrenceId;
  recipientId: UserId;
  title: string; // rendered snapshot for the audit trail
  body: string;
  actionHref: string | null;
  readAt: string | null;
  createdAt: string;
}

interface DeliveryAttempt {
  notificationId: NotificationId;
  channel: Channel;
  status: "pending" | "sent" | "failed" | "bounced";
  attempt: number;
  lastError: string | null;
  attemptedAt: string | null;
}
```

Rendered content is stored on the notification. Keeping only a template ID
would let a later template edit rewrite what the audit trail claims was sent.

## The factors that actually bite

### Idempotency and cooldown are separate

A unique `occurrenceKey` makes evaluation safe to retry. Cooldown controls how
often a still-relevant reminder may communicate; it is not the concurrency
guarantee.

- Event: `(ruleId, eventId)`
- Schedule: `(ruleId, subjectId, scheduledInstant)`
- State episode: `(ruleId, subjectId, stateBecameTrueAt)`
- Repeating reminder: `(ruleId, subjectId, windowNumber)`

The production database must enforce occurrence uniqueness. The fixture adapter
can simulate it for development.

### Escalation ladder

Escalation is part of the reminder rule rather than several independent rules:

```ts
interface EscalationStep {
  afterHours: number;
  audience: Audience;
  template: TemplateId;
}
```

Before every step, the engine re-evaluates the underlying condition. If it has
resolved, the occurrence closes and no further reminder is created.

### Mandatory versus mutable

Deadline and legal notices cannot be muted; nudges can. Preferences are per
user, category and channel rather than per rule, or the settings screen becomes
unusable.

### Digest

Non-urgent notifications are batched per recipient. Urgent notifications bypass
the digest. A fixed daily digest is the simplest initial policy.

### Delivery retry

External delivery retries use capped exponential backoff. Exhausted retries are
visible to QSTP operations; they never delete or invalidate the in-app record.

## Evaluation

Two paths feed the same occurrence store:

- **Scheduled sweep** evaluates schedule and state triggers. The fixture-backed
  demonstration may invoke it on page load; production needs a durable runner.
- **Event dispatch** evaluates event triggers after a use-case commits. A
  production version needs a durable event/outbox boundary so a successful
  domain write cannot lose its reminder.

Both paths are idempotent through `occurrenceKey`.

## Authoring boundary

Start with a code-owned rule catalog plus safe QSTP configuration:

- enable or disable a rule;
- edit timing offsets and escalation delays;
- edit recipient roles and channel policy;
- choose whether a reminder is urgent or part of a digest.

Do not initially expose arbitrary predicates, templates or rule composition.
Global rules act as defaults; a cycle-specific configuration overrides a global
rule by stable `key` rather than causing both to fire.

## Open questions

1. **Do candidates get Slack?** Presumably not — email, push and in-app only.
2. **Do startups get Slack?** The brief can be read as including them, but their
   workspace/account model does not yet exist.
3. **Digest frequency.** Fixed daily initially, or configurable per user?
4. **How long are notifications and delivery attempts retained?** They are an
   audit trail and also personal data.
5. **Escalation targets.** Roles are safer defaults; are named people needed?
6. **Preview/test send.** Strongly recommended before external delivery is
   enabled.

## Suggested scope

**Phase 1 — engine and in-app.** Pure trigger evaluation, typed predicates,
audience resolution, occurrence idempotency, fixture ports, notification centre,
unread count and mark-as-read.

**Phase 2 — channels.** Email, Slack and push adapters behind one delivery port.
Simulate them in fixtures exactly as OCR and transcription are today.

**Phase 3 — escalation, digest and preferences.** Add the durable runner and
outbox when Supabase becomes the real adapter.

## Supabase implementation base

The durable backend begins in
`supabase/migrations/0011_reminder_engine.sql`, using the proven parts of
Parametra's notification design while preserving RelayFlow's boundaries:

- occurrences are separate from per-recipient/channel delivery rows;
- one SQL fan-out function owns channel policy and preferences;
- recipient RLS exposes only in-app rows, while QSTP retains the delivery audit;
- partial indexes serve inbox, unread-count and worker-queue paths;
- external jobs are claimed with `FOR UPDATE SKIP LOCKED` and a five-minute
  lease;
- claim-token compare-and-set prevents a stale worker from completing a job
  after another worker has reclaimed it;
- the worker supports email, Slack and push. Its hackathon deployment is
  intentionally unauthenticated; caller authentication is required before real
  participant data or production use.

The first database evaluator is `enqueue_positions_not_submitted_reminders`.
It runs only during the configured pre-deadline window, resolves active startup
owners/members, records a stable occurrence and fans it out idempotently. The
fixture-backed web application remains unchanged until real Supabase auth and
the full repository adapter replace the development context.

The first vertical slice is **Positions not submitted**: evaluate it 72 hours
before the submission deadline, notify matching startup members in-app, and
prove repeated evaluation creates only one occurrence and one notification per
recipient.

## Reminders worth shipping with

| Reminder                        | Trigger                               | Audience                    | Delivery behavior          |
| ------------------------------- | ------------------------------------- | --------------------------- | -------------------------- |
| Positions not submitted         | −72h before submission deadline       | startups matching `silent`  | notify, escalate after 48h |
| Selection deadline approaching  | −72h before selection closes          | startups with no selections | notify                     |
| Hours at risk                   | state: `hours_at_risk`                | that startup, then QSTP     | notify, escalate           |
| Exception awaiting decision     | state: pending > 24h                  | QSTP operations             | notify                     |
| Candidate conflict raised       | event: second claim                   | QSTP                        | notify immediately         |
| Documents awaiting verification | state: submitted > 24h                | QSTP operations             | digest                     |
| Candidate availability unknown  | state: `unconfirmed` and in a pool    | candidate                   | notify                     |
| Pool untouched                  | state: shared > 5 days, none reviewed | startup                     | notify, escalate           |
