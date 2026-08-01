# 02 — Automation rules: triggers, audiences, channels

## The change

The brief's stated purpose is replacing "emails, Slack messages, and manual
follow-ups". Today RelayFlow knows Desert Bloom has not submitted positions and
does nothing — a human must open the dashboard and notice. This is the largest
gap between what exists and what was asked for.

**Build a rules engine, not a notification system.** The automations include
non-communication ones (reclaiming hours, expiring exceptions), so the thing to
model is `trigger → audience → effect`, where *notify* is one effect among
several. Building "notifications" first and bolting actions on later produces two
half-systems.

## Shape

```ts
interface AutomationRule {
  id: RuleId;
  name: string;                 // shown to QSTP, e.g. "Chase silent startups"
  enabled: boolean;
  cycleId: CycleId | null;      // null = applies to every cycle

  trigger: Trigger;
  audience: Audience;
  effects: readonly Effect[];

  dedupe: { key: string; cooldownHours: number };
  escalation: EscalationStep[] | null;
  mandatory: boolean;           // recipients cannot mute it
}
```

### Trigger — three kinds, all needed

```ts
type Trigger =
  | { kind: 'schedule'; anchor: DeadlineName; offsetHours: number }  // −72h before selection closes
  | { kind: 'state'; predicate: PredicateName }                      // becomes true
  | { kind: 'event'; event: DomainEvent }                            // selection.reserved
```

`schedule` covers reminders. `state` covers "is something wrong right now".
`event` covers reacting to an action the moment it happens.

### Audience — the three scopes, as you described them

```ts
type Audience = {
  principal: 'qstp' | 'startup' | 'candidate';
  scope:
    | { kind: 'all' }
    | { kind: 'matching'; predicate: PredicateName }
    | { kind: 'explicit'; ids: readonly string[] };
  // For QSTP, optionally narrow by role: only the programme manager, say.
  roles?: readonly string[];
};
```

**The predicate vocabulary already exists and is tested.** `StartupCycleFacts`
and `startupCycleFlags` in `packages/entities/src/board/board.ts` were built for
the board. "Notify every startup whose hours are at risk" should evaluate
`flags.includes('hours_at_risk')` — the same function the board calls.

If the automation and the board ever disagree about who is at risk, one of them
is lying to somebody. Sharing the implementation makes that impossible rather
than unlikely.

### Effects

```ts
type Effect =
  | { kind: 'notify'; template: TemplateId; channels: ChannelPolicy }
  | { kind: 'reclaim_hours' }
  | { kind: 'expire_exception' }
  | { kind: 'escalate'; to: Audience }
  | { kind: 'flag_for_review' };
```

Non-communication effects reuse existing use-cases — `reclaimHours` already
exists in `packages/logic/src/qstp/decisions.ts` and re-checks its own
preconditions, so an automation firing it cannot do something a human could not.

### Channels

In-app, email, Slack, push. **No WhatsApp.** **No quiet hours** (decided).

One rule matters more than the rest:

> **In-app is the record. External channels are copies.**

The notification row is always written. Each external channel is then attempted
and gets its own delivery status. A bounced email loses a copy, never the
notification — and QSTP gets a delivery audit for free, which they will want the
first time a startup claims they were never told.

```ts
interface ChannelPolicy {
  required: readonly Channel[];   // always attempted
  preferred: readonly Channel[];  // subject to recipient preference
}

interface Delivery {
  notificationId; channel; status: 'pending'|'sent'|'failed'|'bounced';
  attempts: number; lastError: string | null; sentAt: string | null;
}
```

## The factors that actually bite

In rough order of pain saved:

**Dedupe key + cooldown.** Without it a state-triggered rule fires on every
evaluation and sends forty emails. This is the one that ruins a launch. The key
should be composed of `(ruleId, subjectId, cycleId)` so "chase Desert Bloom about
positions" is one thing that can be on cooldown.

**Escalation ladder.** A property of the rule, not three separate rules:

```ts
interface EscalationStep {
  afterHours: number;
  audience: Audience;      // widen: startup → startup + QSTP → QSTP alone
  template: TemplateId;
}
```

Escalation stops when the underlying state resolves. That means the engine needs
to re-evaluate the predicate before each step, not just fire on a timer.

**Mandatory vs mutable.** Deadline and legal notices cannot be muted; nudges can.
If everything is opt-out-able people mute the important ones, and if nothing is
they filter you entirely.

**Digest window.** Batch non-urgent notifications per recipient into one message.
Three separate "candidate reviewed" emails trains someone to ignore you. Urgent
ones bypass the digest.

**Delivery retry.** Exponential backoff, capped. A failed send that silently
never retries is worse than not sending.

**Preferences.** Per user, per category, per channel. Categories rather than
per-rule, or the settings screen becomes unusable.

## Evaluation

Two paths:

- **Scheduled sweep** — a cron-ish job evaluating `schedule` and `state` triggers.
  Hackathon version: evaluate on page load, which is enough to demo and needs no
  infrastructure.
- **Event dispatch** — `event` triggers fire inline after the use-case commits.

Both must be idempotent, which is what the dedupe key buys.

## Open questions

1. ⚠️ **Who authors rules?** Three options with very different builds: hardcoded
   set with on/off toggles (smallest); QSTP manager composes them in a UI
   (largest); hardcoded set plus editable timings and audiences (middle, probably
   right).

2. ⚠️ **Are rules per-cycle or global?** The `cycleId: null` field above assumes
   both are possible. Confirm that is wanted rather than just permitted.

3. **Do candidates get Slack?** Presumably not — they are students, not staff.
   Email, push and in-app only?

4. **Do startups get Slack?** The brief mentions Slack for "internal alerts and
   startup notifications", which reads like both. Confirm.

5. **Digest frequency.** Daily is the obvious default. Configurable per user, or
   fixed?

6. **How long are delivery records kept?** They are an audit trail; they are also
   personal data with a retention question attached.

7. **Escalation targets — fixed or configurable?** "Escalate to the programme
   manager" is probably always right, but a named person may be wanted.

8. **Is there a preview / test send?** Strongly recommended before anything goes
   to real startups, and cheap while the channels are still simulated.

9. **What is the failure policy for a non-communication effect?** If
   `reclaim_hours` is refused because an exception was approved between
   evaluation and execution, is that a logged no-op or does it need surfacing?

## Suggested scope

You asked for all of it rather than a cut-down version, so:

**Phase 1 — engine and in-app.** Rule model in entities as pure functions,
trigger evaluation, audience resolution reusing the board predicates, dedupe,
in-app notification centre with a bell and unread count, delivery record.

**Phase 2 — channels.** Email, Slack, push as adapters behind one `deliver()`
port. Simulated in fixtures exactly as OCR and transcription are today, so the
whole thing demos without credentials.

**Phase 3 — escalation, digest, preferences, non-communication effects.**

## Rules worth shipping with

A starter set, all derivable from state that already exists:

| Rule | Trigger | Audience | Effect |
| --- | --- | --- | --- |
| Positions not submitted | −72h before submission deadline | startups matching `silent` | notify, escalate after 48h |
| Selection deadline approaching | −72h before selection closes | startups with no selections | notify |
| Hours at risk | state: `hours_at_risk` | that startup, then QSTP | notify, escalate |
| Exception awaiting decision | state: pending > 24h | QSTP operations | notify |
| Candidate conflict raised | event: second claim | QSTP | notify immediately |
| Documents awaiting verification | state: submitted > 24h | QSTP operations | digest |
| Candidate availability unknown | state: `unconfirmed` and in a pool | candidate | notify |
| Pool untouched | state: shared > 5 days, none reviewed | startup | notify, escalate |
