# RelayFlow — Product Requirements Document

**Status:** Approved · **Version:** 1.0 · **Last updated:** 2026-08-01
**Owner:** QSTP Programme Operations · **Engineering:** RelayFlow monorepo (`relayflow`)

---

## 1. Summary

RelayFlow runs QSTP's startup internship programme end to end: from deciding
which startups get funded hours, through the roles they open and the candidates
they interview, to signed placement agreements and the redistribution of hours
that were never used.

It replaces a process previously run on spreadsheets, email threads and Slack
messages — a process where two startups could believe they had hired the same
person, where a startup's unused hours sat idle until someone noticed, and where
"why did they get 60 hours and we got 20" had no answer on file.

One cycle. One budget. One record of every decision and who made it.

---

## 2. Problem statement

QSTP funds a fixed number of weekly intern hours per cycle. Distributing them
fairly and spending them fully is a coordination problem across three parties
who do not share a system:

| Party | What they need | What went wrong before |
| --- | --- | --- |
| **QSTP staff** | Allocate a finite budget defensibly, and keep it spent | Allocation decisions had no recorded rationale; unused hours were discovered after the cycle closed |
| **Startups** | Get hours, open roles, hire the right interns | No visibility into their own allocation, deadlines, or where a candidate stood |
| **Candidates** | Know where they stand and what to do next | Interviewed for roles already filled; chased for documents by email |

The three most expensive failure modes, all of which RelayFlow makes
structurally impossible:

1. **Double-hiring.** Two startups both believing they claimed the same
   candidate.
2. **Budget overrun.** Allocated hours exceeding the cycle's funded ceiling.
3. **Silent forfeiture.** A startup losing its hours to a missed deadline when
   it had been granted an extension.

---

## 3. Goals and non-goals

### Goals

- **G1** — Every funded hour is traceable from allocation → position → placement.
- **G2** — Every funding decision carries a score, a decider, a timestamp, and a
  written reason when it departs from the recommendation.
- **G3** — A candidate can hold at most one blocking claim across an entire cycle,
  enforced at the database level, not by convention.
- **G4** — Hours that will not be used are detected, reclaimed and reoffered
  before the cycle ends.
- **G5** — Nobody is chased by a human for a deadline the system already knows
  about.
- **G6** — Every role-visible action is gated on a capability, and the UI shows
  exactly what the server will permit.

### Non-goals

- **Sourcing candidates.** RelayFlow imports candidates from Deema or CSV. It
  does not advertise roles, match people to positions, or run assessments.
- **Payroll and stipends.** Hours are the unit of account; money is not modelled.
- **General ATS.** This is a cycle-scoped programme tool, not a hiring product a
  startup would use outside QSTP.
- **Contract authoring.** Agreements are signed in RelayFlow; they are drafted
  elsewhere.

---

## 4. Users and roles

Authorization is **capability-based**. Roles are labels that grant capabilities;
no code branches on a role name. Adding a role cannot silently widen access.

### QSTP staff

| Role | Grant |
| --- | --- |
| `program_manager` | Full programme control: cycle setup, stage advancement, allocation overrides, redistribution |
| `operations` | Day-to-day running: rating, prioritisation, position review, conflict resolution, document verification. **Cannot** create cycles, override allocations, or run redistribution — those reshape the budget and stay with the manager |
| `viewer` | Genuinely read-only. What leadership and auditors get. Reads the reasoning behind every funding decision and can supply none of it |

### Startup

| Role | Grant |
| --- | --- |
| `owner` | Everything a startup can do, including acknowledging its allocation and requesting exceptions |
| `member` | Same as owner minus document access to the startup's own onboarding records |
| `supervisor` | Runs interviews and assesses tasks. Cannot commit the startup to a hire or request a deadline extension |

Every startup grant is scoped to the actor's own startup; the policy layer
re-checks *which* startup on every call.

### Candidate

Sees their own journey and nothing else — not the startup's other candidates,
not the pool they sit in. Confirms availability, uploads documents, submits
tasks, accepts an offer, confirms placement readiness.

---

## 5. Core domain model

### The cycle is the spine

Almost every question in this product is really *"…in which cycle?"*. The cycle
id is a required part of nearly every query, which is what makes it possible to
run one cycle while the previous one is still being reported on.

A cycle carries: a name, a date range, a **funded weekly hours** ceiling, a
**selection mode**, and a set of deadlines.

### Stages

Stages run in order and decide what the UI offers. They are gates, not labels — a
startup cannot submit positions before `positions` opens, and redistribution
cannot begin until selection has closed.

```
draft → allocation → positions → selection → completion → closed
```

| Stage | What happens |
| --- | --- |
| `draft` | Cycle being set up. Nothing visible to startups |
| `allocation` | Startups rated, prioritisation engine run, hour tiers assigned and published |
| `positions` | Funded startups submit roles against their allocation; QSTP reviews |
| `selection` | Candidate pools shared; interviews, tasks, selections, offers |
| `completion` | Recovery, redistribution and onboarding run in parallel |
| `closed` | Reporting only |

**Stage gates.** Advancing a stage runs a checklist. Blocking checks stop the
advance outright; warning checks can be overridden with a written reason.

### Hours — the unit of account

Hours are allocated in a **closed set of tiers: 60, 40, 30, 20, 0**. Not a free
number, deliberately: the programme runs on agreed bands, and an arbitrary 37
would mean somebody bypassed the evaluation.

The budget has four buckets, and every stage of the workflow moves numbers
between them:

- **funded** — the cycle's ceiling
- **allocated** — what QSTP has promised startups (only `confirmed` allocations count)
- **committed** — what those startups actually spent by placing interns
- **recoverable** — allocated minus committed, after the selection deadline

Over-allocation is refused at the point of decision, never discovered in a
report afterwards.

### Selection — the sharpest invariant

> **One candidate holds at most one *blocking* claim across the entire cycle.**

Two startups interviewing the same person is fine and expected. Two startups
both believing they hired them is the failure this system exists to prevent.

Claim statuses: `offered` · `reserved` · `accepted` · `confirmed` · `declined` ·
`released` · `lost` · `cancelled`. Only `reserved`, `accepted` and `confirmed`
block. Enforcement is layered — the use-case checks before writing, and a partial
unique index on the database refuses the race the use-case cannot see.

---

## 6. Feature specification

### 6.1 Cycle setup (QSTP)

Create a cycle with name, dates, funded weekly hours, selection mode and four
deadlines. Validation is cross-field and refuses incoherent programmes at the
source:

- The cycle must end after it starts.
- Positions must close before selection does — selecting candidates for
  positions that do not exist is not a state the workflow can represent.
- Selection must close before documents are due.
- A `candidate_choice` cycle **must** have an offer-window date. Without one, a
  candidate sitting on three offers stalls three startups indefinitely.
- The offer window closes *after* positions and *before* selection. The gap is
  not slack: it is when the earliest offer is asked whether they still want the
  candidate.

Cycles can be updated while in draft, advanced stage by stage against gates, and
archived.

### 6.2 Participation intake

Startups are invited to a cycle and record what they want: requested total
hours, requested intern count, disciplines, and a written justification. Status
runs `invited → accepted → declined → suspended → archived`.

### 6.3 Prioritisation engine

The engine turns evidence and human judgement into a ranked, budget-fitted set
of hour proposals. It is a **versioned policy engine** with its own contract and
a golden replay fixture — a stored run is typed by the engine's own output, and
re-reading an old run shows the policy it ran under, never today's.

**Scoring — 100 points.** Ninety of them are six human judgements on a 0–4
scale; the remaining ten come from what the platform already knows.

| Component | Weight | Points | Group |
| --- | --- | --- | --- |
| Progress against stage | ×5 | 20 | Execution (40) |
| Traction strength | ×5 | 20 | Execution |
| Value to startup | ×3.75 | 15 | Role (30) |
| Value to intern | ×3.75 | 15 | Role |
| QSTP / Qatar alignment | ×2.5 | 10 | Strategy (20) |
| Research ecosystem contribution | ×2.5 | 10 | Strategy |
| Platform history | — | 10 | History |

Platform history averages five behavioural rates from prior cycles — deadline
adherence, allocation utilisation, disposition, task reporting and intern
completion. A first-time startup gets a **visible neutral half-score**, never a
zero.

**Three gates run before scoring**, each returning a *distinct terminal status*
rather than a low score. This distinction is the whole point: a startup nobody
has extracted yet and a startup that scored 12 both end up with zero hours, and
one needs chasing while the other needs nothing.

| Gate | Status | Meaning |
| --- | --- | --- |
| Positions unresolved | `needs_information` | We cannot judge readiness we were never shown |
| No feasible position | `not_ready` | Nothing here can host an intern |
| Role value below floor | `not_fundable` | Non-compensatory — excellence elsewhere cannot buy past a poor host |
| — | `awaiting_manual_scores` | Ratings missing or invalid |
| — | `scored` | Eligible for allocation |

**Score-to-tier ladder:** ≥85 → 60h · ≥70 → 40h · ≥50 → 30h · ≥35 → 20h · else 0h.
One ladder, used by both the engine and the manual allocation screen, so an
override renders as an override and nothing else does.

**Allocation modes:** `priority` (fund the top of the ranking fully), `broad`
(spread across more startups), `distribution` (even bands).

**Runs.** A run is `draft` → `confirmed` → `superseded`. Drafts are marked
`complete_draft` or `partial_draft` when at least one startup never reached an
outcome. QSTP can adjust any proposed tier before confirming — with a required
reason. Ties the engine cannot break are flagged `requiresTieResolution` rather
than silently ordered, and a waitlist records who would be next and why.

The engine's `withinBudget` verdict is authoritative and is never re-derived by
summing outcomes downstream.

> **Calibration note.** An independent blind review of the same 30-startup cohort
> reached 0.58 score correlation and agreed on 16 of 28 final tiers. The engine's
> output is a **reviewable draft**, not a validated ranking. Confirmation is a
> human act.

### 6.4 Allocation

Publishing a run writes allocations. Each records the tier, the score, who
decided, when, a justification, and — when the tier differs from the score's
recommendation — an override reason that is **required, not optional**.
Allocations are revisioned: changing one supersedes the prior record rather than
editing it, and superseded revisions never consume budget.

Startups **acknowledge** their allocation before submitting positions.

### 6.5 Positions

A position is a role a startup wants to fill, and the unit hours are actually
spent on. Its cost is `hoursPerIntern × internCount`, and the sum of a startup's
positions may not exceed its allocated tier.

Lifecycle, with legal transitions enforced as a state machine:

```
draft → submitted → under_review → { approved | changes_requested | closed }
changes_requested → resubmitted → under_review
approved → { locked | changes_requested | closed }
locked → { approved | filled | closed }
filled → closed
```

`withdrawn` and `closed` are terminal. Positions in any live state reserve their
hours against the startup's allocation.

### 6.6 Candidate pools

Candidates are imported (Deema or CSV) and shared into position pools by QSTP.
RelayFlow owns their **availability** — the single biggest source of wasted
effort in the old process, where startups interviewed people who had taken
another job weeks earlier. Candidates confirm their own availability; pool
listings filter out anyone already blocked by a claim.

Pool entries track a candidate's state within one position: shared,
`interview_requested`, `interviewed`, `interested`, and so on.

### 6.7 Interviews

Startups request and schedule interviews (`online` or `in_person`), record
feedback, and attach recordings. Transcript, summary and structured notes are
modelled as **first-class fields with their own status** (`none` · `processing` ·
`ready` · `failed`) rather than as magic properties — so a stalled transcription
never looks like a lost interview.

### 6.8 Candidate tasks

Startups set a piece of work as part of assessment; the candidate submits a file
or link; the startup reviews it beside the interview notes. For technical roles
the take-home is often what the decision actually turns on.

Templates are per-position and reusable. Assignments run
`assigned → submitted → reviewed`, or `withdrawn`. Late submissions are recorded
as late and accepted or not, explicitly. Task submissions belong to the startup
and are **deliberately not stored with onboarding documents**, which are QSTP's
and far more sensitive.

### 6.9 Selection — two modes

The mode is set per cycle. Running two at once would mean explaining to a startup
why Select behaved differently on two candidates in the same pool.

**`first_come`** — the earliest reservation wins. The tiebreaker is a **server**
timestamp, never a client's clock, because the losing startup will ask and "your
browser said 10:04" is not an answer.

**`candidate_choice`** — several startups may hold non-blocking `offered` claims
at once and the candidate decides. The invariant is unchanged, because offers do
not block. A candidate accepting is recorded distinctly from a startup reserving:
the difference between *"this startup got there first"* and *"this person chose
this startup"*, and overriding the second is a much heavier act.

**Conflicts.** When claims collide, a conflict record is opened with the blocking
claim, the contenders and the requested startup. QSTP resolves it by awarding the
candidate, with a mandatory written reason. A QSTP override outranks both the
clock and the candidate's own choice — deliberately, and only ever as a
justified exception.

**Offer-window fallback.** When the window closes with no decision, a fallback
case walks the offers in the order they were made — earliest first — asking each
whether they still want the candidate, with a response deadline per step. Status
runs `open → accepted | exhausted | overridden`. An override here requires an
explicit high-risk confirmation.

### 6.10 Exceptions

A startup asking for more time — the pressure valve on the deadline machinery,
and what decides whether hours get reclaimed in `completion`.

Kinds: `position_submission`, `candidate_selection`. Statuses: `pending` ·
`approved` · `rejected` · `expired`.

**Only an approved exception with a granted date moves a deadline.** Pending,
rejected and expired leave the cycle deadline standing — which is what stops
*"I asked for an extension"* from behaving like *"I was given one"*.

### 6.11 Placements and onboarding

A confirmed selection becomes a **placement**: committed weekly hours, start and
end dates, a named supervisor. Status runs
`confirmed → ready_to_start → onboarded`, or `cancelled`.

**Readiness is computed, never stored.** A placement is ready to start only when
every one of these holds, and the UI shows exactly which are outstanding:

- All required documents are `approved` or `waived`
- Both the QSTP agreement and the startup agreement are signed
- Candidate readiness confirmed
- Startup readiness confirmed
- Dates, hours and supervisor are final
- QSTP has given final approval
- No unresolved selection conflict
- No unresolved exception

**Documents.** QSTP defines requirement templates per cycle, optionally scoped to
a position, each owned by `candidate`, `startup` or `qstp`. Templates are
snapshotted onto a placement at confirmation, so later template changes cannot
rewrite an in-flight checklist; amendments to a live checklist require a reason.

Requirements run `requested → awaiting_upload → uploaded → under_review →
{ approved | correction_requested → resubmitted | rejected | expired | waived }`.
Submissions are revisioned — a correction adds a revision, it does not overwrite.
Uploaded documents are field-extracted, and the candidate **confirms** each
extracted field rather than trusting it.

**Signatures.** Both agreement kinds record the signer, the declaration they
accepted, when they opened the document, and when they signed.

### 6.12 Recovery and redistribution

Hours allocated but not committed are the programme's biggest leak. RelayFlow
closes it.

**Recovery cases** open when a placement is cancelled or a deadline passes with
hours unspent. Status:
`potential → exception_protected | confirmed → recovered | replacement_protected → closed`.
An approved exception protects hours from recovery; a replacement placement
protects them too.

**Redistribution rounds** pool confirmed recoveries and reoffer them. A round
runs `draft → invitations → accelerated_positions → accelerated_selection →
closed`, with its own compressed position and selection deadlines. Startups are
invited with a proposed tier and respond `accepted` or `declined`; unanswered
invitations expire. Grants made this way are flagged `fromRedistribution`, so a
report can always separate first-pass funding from reclaimed funding.

### 6.13 Reminder engine

The system's answer to *"replace emails, Slack messages and manual follow-ups"*.

**Rules** are code-owned; QSTP configures only what is safe to change — enabled,
schedule offset, audience, channel policy, mandatory, urgent. Nobody invents new
predicates or executable behaviour through a settings screen.

**Three trigger kinds:**

- `schedule` — anchored to a named deadline with an hour offset
- `state` — a named predicate over current programme state
- `event` — a named domain event

**Occurrences** are separate from notifications: one occurrence is one concrete
rule/subject episode, deduplicated by a unique occurrence key, and it may
escalate through several steps, each fanning out to several people and channels.

**Channels:** `in_app` (always required — it is the durable record), `email`,
`slack`, `push`. Categories: `deadline`, `selection`, `exception`, `onboarding`,
`candidate`, `system`. Delivery status runs
`queued → processing → sent → delivered`, or `failed` / `bounced`.

Recipients set preferences per category and channel; `mandatory` notifications
cannot be muted and `urgent` ones bypass digesting. Workers claim jobs under a
lease with a claim token, so a stale worker cannot overwrite a job that has
already been reclaimed.

### 6.14 Activity log

Every state change appends an activity event: cycle, entity type and id, action,
actor and actor role (including `system`), the `before` and `after` values, an
optional reason, and when it occurred. This is what answers *"who changed this,
and why"* without reconstructing it from application logs.

---

## 7. Surfaces

### Web (Next.js 16, App Router)

Three portals behind one sign-in, each rendering only what the actor's
capabilities permit.

**QSTP portal** — dashboard, cycles list and cycle workspace, startups,
allocation workspace, prioritisation, positions tracker, candidates, selection
and conflicts, exceptions, redistribution, document verification queue.

**Startup portal** — home, cycle workspace, positions (list and new), candidate
pools, interviews, tasks, documents, exception requests.

**Candidate portal** — overview, cycle workspace, interviews, offers, tasks,
documents.

Every portal is cycle-scoped: URLs carry the cycle id, and there are no
implicit-current-cycle routes.

### Mobile (Expo SDK 57, expo-router, React Native 0.86)

Startup and candidate surfaces, sharing the same domain model, the same
authorization policy and the same design tokens as web.

---

## 8. Architecture requirements

These are product requirements, not implementation preferences — each one exists
because violating it produced a class of bug this programme cannot afford.

### R1 — Dependencies point one way

```
apps/web · apps/mobile
        └── logic (use-cases)
             ├── access (policy) · ports (storage interfaces)
             │        └── entities (schemas · domain types)
             │             └── prioritisation (scoring · allocation policy)
             └── core · logger · tokens
```

Enforced by a custom ESLint rule (`packages/config/eslint/layers.mjs`) on every
lint run, not by discipline.

`prioritisation` sits *below* `entities` because it is a versioned policy engine
with its own contract, not a schema. Being below is what lets a stored run be
typed by the engine's own output instead of a re-declared copy that drifts, and
what keeps its golden fixture replayable.

### R2 — Use-cases depend on interfaces, never a database

`@relayflow/logic` cannot import an adapter — lint rejects it — so it cannot tell
whether it is talking to Postgres or to an array. Every query lives in an
adapter: one place to audit query shape, one place where RLS context is
established, one place to change when the schema moves.

The service-role client that bypasses RLS lives behind a subpath apps and
use-cases are forbidden from importing. It refuses to construct in a browser and
demands a written reason from each caller.

### R3 — Authorization is a required field

Every use-case is declared as
`defineUseCase({ name, input, authorize, execute })`. A use-case without
`authorize` **does not typecheck**. Genuinely public entry points must write
`authorize: PUBLIC('reason')` — greppable, and visibly deliberate in review.

The framework fixes the order: **parse → authorize → execute**. So an actor can
never pass one id to the gate and a different one to the query, and authorization
never runs against unvalidated input.

Server Actions are reachable by direct POST, so the app layer adds nothing on
top: it builds the context, calls the use-case, serialises the result. There is
no place in a Server Action to forget a check, because there is no check there to
forget.

Policy itself is pure and synchronous — same actor plus same capability always
yields the same answer — so the full role × capability matrix is asserted in
tests rather than spot-checked.

### R4 — Multi-table writes are transactions

If a workflow writes to more than one table, the port exposes it as a **single
method whose contract requires atomicity**. The use-case never sequences the
writes itself, because at that layer it has no way to make them atomic.
`OrganizationPort.createWithOwner` is the reference case: an organisation with no
owner is unrecoverable through the UI, so no adapter is permitted to produce one.

### R5 — Defence in depth

Application policy and row-level security both enforce the tenant boundary, on
purpose. Application policy produces good errors, drives which buttons render,
and is fast. **RLS is the backstop** — it holds when a query is written
carelessly, when a new endpoint forgets a filter, or when an anon key leaks.

RLS is default-deny: enabled and `FORCE`d on every table, each permitted action
named explicitly. Policy helper functions are `SECURITY DEFINER` (a policy on
`memberships` querying `memberships` recurses forever) and are kept narrow enough
that they answer one yes/no question and cannot be used to read rows.

### R6 — Conventions that hold everywhere

- Code branches on **capabilities**, never on `role === 'admin'`.
- Ids are **branded types**: a `UserId` will not typecheck where a `StartupId`
  belongs, though both are uuids at runtime.
- Pagination is **keyset**, not offset — offset re-scans and duplicates rows when
  the underlying set changes mid-scroll, which in a live list it always does.
- `updated_at` is maintained by database triggers. Clients lie about time.
- Nothing ambient: actor, repositories, logger and **clock** all arrive on the
  use-case context, so DST shifts, expiries and race windows are testable.
- Use-cases return `Result` and do not throw. A caller cannot read `.data`
  without first narrowing on `.ok`.
- **Derived over stored** wherever derivation is cheap. A status that can be
  computed must not also be written, or the two will disagree.
- Rules live in `entities` as pure functions, tested without a database. Screens
  and use-cases call the same function, so a disabled button and a rejected write
  always agree.
- Use-cases never trust the client. Facts sent to the browser exist so an
  impossible action fails fast; the server rebuilds them before writing.
- Errors use one taxonomy across every layer, mapped to transport in exactly one
  place per client. Postgres `42501` becomes `forbidden` and stays legible in
  logs. `internal` and `upstream` failures never reach a browser verbatim.

---

## 9. Data model

47 tables across eleven migrations, all with RLS enabled and forced.

| Migration | Covers |
| --- | --- |
| `0001` | Extensions and enums |
| `0002` | `users`, `qstp_staff`, `startups`, `startup_members` |
| `0003` | `cycles`, `cycle_participations` |
| `0004` | `positions`, `position_review_history`, `candidates`, `pool_entries`, `interviews` |
| `0005` | `selections`, `selection_conflicts`, `candidate_choice_fallbacks`, `fallback_offers`, `exception_requests` |
| `0006` | `placements`, `document_requirement_templates`, `placement_requirements`, `requirement_submissions`, `requirement_submission_fields`, `placement_signatures`, `candidate_documents`, `candidate_document_fields` |
| `0007` | `recovery_cases`, `redistribution_rounds`, `redistribution_invitations` |
| `0008` | `prioritisation_runs`, `prioritisation_results`, `prioritisation_policy_versions`, `startup_ratings`, `startup_rating_items`, `rating_citations`, `position_intents`, `extraction_runs`, `extracted_fields`, `extracted_field_observations`, `evidence_items` |
| `0009` | `activity_events`, RLS policies |
| `0010` | Transactional RPCs |
| `0011` | `reminder_rule_configurations`, `reminder_occurrences`, `notifications`, `notification_preferences`, `push_tokens`, `slack_notification_targets` |

Plus `task_templates` and `task_assignments` for candidate tasks.

Schema invariants and the reminder engine have their own SQL test suites
(`supabase/tests/`), run alongside the TypeScript tests.

---

## 10. Non-functional requirements

| Area | Requirement |
| --- | --- |
| **Correctness** | The candidate-claim invariant and the budget ceiling are enforced at the database level, not only in application code |
| **Auditability** | Every state change produces an activity event with before/after and an actor |
| **Determinism** | A prioritisation run freezes the policy it used; replaying it reproduces it exactly |
| **Testability** | Domain rules are pure functions; the clock is injected; the full role × capability matrix is asserted, not sampled |
| **Reproducibility** | Internal packages ship raw TypeScript — no build step, no `dist/` to go stale |
| **Verification** | `pnpm verify` runs typecheck · lint · test · build, all blocking, on every push |
| **Privacy** | Structured logging with redaction on by default; onboarding documents are separated from startup-owned task submissions at the table level |
| **Localisation** | Design tokens are shared between web CSS and native styles; RTL-capable |

---

## 11. Success metrics

| Metric | Target |
| --- | --- |
| Funded hours actually placed | ≥ 90% per cycle |
| Hours recovered and redistributed before close | ≥ 75% of recoverable |
| Double-hire incidents | 0 |
| Budget overruns | 0 |
| Allocation decisions with a recorded rationale | 100% |
| Manual deadline chases by QSTP staff | ≈ 0 |
| Median time from selection to `onboarded` | ≤ 10 days |
| Interviews conducted with an unavailable candidate | ≤ 2% |

---

## 12. Open decisions

These change the data model and are cheapest to settle early:

1. **Concurrent cycles.** Can two cycles run at once? The model supports it; the
   queries and the UI assume one active cycle at a time. This touches every
   query.
2. **Per-position selection mode.** Deferred as a strict superset of the
   per-cycle setting — a position-level override can default to the cycle's
   value later without moving the field.
3. **Prioritisation calibration.** The current policy version is
   `prioritization-v3-experiment-2`, provisional pending a larger validation
   cohort. Weights and thresholds are policy values, not constants, so revising
   them is a new policy version rather than a code change.

---

## 13. Glossary

| Term | Meaning |
| --- | --- |
| **Cycle** | One run of the internship programme; the scope of nearly every query |
| **Stage** | Where a cycle is in its lifecycle; gates what actions are offered |
| **Tier** | An hour band — 60, 40, 30, 20 or 0 weekly hours |
| **Allocation** | What QSTP promised one startup in one cycle, with its rationale |
| **Position** | A role a startup opens; the unit hours are spent on |
| **Pool entry** | The join between a candidate and a position |
| **Selection** | A startup's claim on a candidate |
| **Blocking claim** | A selection that prevents anyone else claiming the same candidate |
| **Placement** | A confirmed selection with dates, hours and a supervisor |
| **Recovery case** | Allocated hours identified as unlikely to be used |
| **Redistribution round** | A compressed re-run of positions and selection over reclaimed hours |
| **Occurrence** | One concrete reminder episode, deduplicated and escalatable |
| **Capability** | A named permission; the vocabulary all authorization speaks |
