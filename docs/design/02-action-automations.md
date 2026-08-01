# 02B — Action automations: approvals, execution, recovery

## The change

Some automations do more than remind somebody. They change programme state:
reclaiming funded hours, expiring an exception, withdrawing a stale offer or
flagging a case for review. These actions have different authorization, failure
and recovery requirements from message delivery, so they are not effects inside
the reminder engine.

This document owns non-reminder automations. It builds on the trigger,
predicate, subject and occurrence concepts in
[02A — Reminder engine](./02-automation-rules.md), but has a separate executor
and audit lifecycle. A reminder delivery failure cannot block a domain action,
and a failed domain action cannot be mistaken for a bounced message.

## Boundary

```text
trigger evaluation → occurrence
                       ├─ reminder engine → notifications → channel copies
                       └─ action engine   → approval → domain use-case → audit
```

Rules may share a trigger, but reminder and action execution are independent.
For example, "hours at risk" may notify the startup automatically and create a
separate QSTP approval request to reclaim hours.

## Shape

RelayFlow supports all three policies and assigns one to each action:

```ts
type ExecutionPolicy =
  | { kind: 'automatic' }
  | { kind: 'approval_required'; approverRoles: readonly QstpRole[] }
  | { kind: 'manual_only' };

interface ActionAutomationRule {
  id: ActionRuleId;
  key: string;
  name: string;
  enabled: boolean;
  cycleId: CycleId | null;
  trigger: Trigger;
  action: ActionEffect;
}

type ActionEffect =
  | { kind: 'reclaim_hours'; execution: ExecutionPolicy }
  | { kind: 'expire_exception'; execution: ExecutionPolicy }
  | { kind: 'withdraw_stale_offer'; execution: ExecutionPolicy }
  | { kind: 'flag_for_review'; execution: ExecutionPolicy };
```

One rule has one domain action initially. This keeps approval, retry and audit
status unambiguous. Multi-action workflows can be added later as explicit
orchestration rather than an array whose partial failure semantics are unclear.

## The three policies

### Automatic

The engine may execute the action without a person approving that occurrence.
Use it only for low-risk, reversible and completely specified policy.

Automatic domain actions require:

- a distinct system principal rather than impersonating a user;
- an idempotent domain command;
- an audit record naming the rule version and occurrence;
- visible failure handling and bounded retries;
- a documented recovery or reversal path.

### Approval required

The engine prepares a pending action. An authorised user reviews and approves or
declines it. Approval invokes the existing domain use-case as that user, so its
capability check and current-state preconditions remain authoritative.

`reclaimHours` in `packages/logic/src/qstp/decisions.ts` starts here. It remains
programme-manager work and is re-checked after approval in case an exception was
granted while the action waited.

### Manual only

RelayFlow identifies the case and links to the relevant workflow, but the action
engine cannot execute it. This is for high-judgement actions such as overriding
a candidate's choice.

## Initial safety boundary

RelayFlow may autonomously communicate, organise, retry, escalate and add review
flags. It may not initially change funding, eligibility or candidate placement
without human approval.

Changing a policy to a less permissive state is always safe. Relaxing it from
`manual_only` to `approval_required`, or from `approval_required` to `automatic`,
is an explicit QSTP policy decision with a confirmation and audit entry. It must
never happen implicitly through a deployment or default value.

## Execution lifecycle

```ts
type ActionExecutionStatus =
  | 'pending_approval'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'failed';

interface ActionExecution {
  id: ActionExecutionId;
  ruleId: ActionRuleId;
  occurrenceId: OccurrenceId;
  action: ActionEffect['kind'];
  policy: ExecutionPolicy;
  status: ActionExecutionStatus;
  requestedAt: string;
  decidedBy: UserId | null;
  decidedAt: string | null;
  executedAs: UserId | SystemPrincipalId | null;
  completedAt: string | null;
  lastError: string | null;
}
```

The stored policy is a snapshot of the policy used for that occurrence. Editing
the rule later must not rewrite the audit history.

## Authorization and user responsibilities

- **Programme managers** approve funding and other consequential programme
  actions. They may change action policies, subject to the relaxation safeguard.
- **Operations** handle routine exceptions and failures only within their
  existing capabilities. They cannot acquire programme-manager authority from
  an automation rule.
- **Startups and candidates** may receive warnings and see relevant outcomes,
  but cannot approve QSTP actions.
- **Viewers and auditors** can inspect the rule, occurrence, decision and
  execution trail but cannot advance it.
- **The system principal** can execute only action kinds explicitly granted to
  it; it is not a general programme-manager account.

## Preconditions, failure and recovery

Every action re-evaluates its trigger condition and calls the domain use-case's
precondition checks immediately before writing.

- If the underlying condition resolved, record `cancelled`; do not execute or
  retry.
- If the action already completed for the occurrence, return the stored result.
- If a transient dependency fails, record `failed` and retry only when the
  action explicitly declares retry safe.
- If the use-case refuses the action, surface its reason to QSTP. Do not bypass
  it or translate it into success.
- Partial multi-table writes must be atomic in the production adapter.

There is no generic automatic rollback. Each automatic action must document its
own compensating action before it can be enabled.

## Persistence and production boundary

The rule model, evaluator, fixture ports, approval UI and tests can be built
before Supabase is ready. Production execution requires durable storage for
action rules and executions, unique occurrence claims, RLS-protected audit
access and atomic writes. Reliable automatic actions also require a durable
runner.

The action engine should depend on domain use-cases, not write repositories
directly. That preserves one source of truth for authorization and invariants.

## Suggested scope

**Phase 1 — approval queue.** Add action-rule and execution entities, fixture
ports, `pending_approval` UI and audit history. Use `flag_for_review` as the
first automatic action and `reclaim_hours` as the first approval-required one.

**Phase 2 — durable execution.** Add Supabase tables, uniqueness constraints,
RLS, atomic execution paths and operational failure visibility.

**Phase 3 — selective autonomy.** Introduce the restricted system principal and
enable automatic domain effects one at a time only after their recovery and
monitoring requirements are satisfied.

## Initial action catalog

| Action | Trigger | Initial policy | Owner |
| --- | --- | --- | --- |
| Flag hours at risk for review | state: `hours_at_risk` | automatic | QSTP operations |
| Reclaim funded hours | state: `hours_at_risk` after warning window | approval required | programme manager |
| Expire an exception | its explicit expiry time passes | approval required | programme manager |
| Withdraw a stale candidate offer | offer becomes invalid or capacity fills | approval required | authorised owner |
| Override a candidate choice | explicit QSTP judgement | manual only | programme manager |

## Open questions

1. Which role can change an action's execution policy? Programme manager is the
   recommended initial answer.
2. Which action becomes the first truly automatic domain change after launch?
3. What is the compensating action for each automatic action?
4. How long is approval and execution history retained?
5. Should a pending approval expire, and if so, does expiry cancel it or return
   it to the queue for review?
