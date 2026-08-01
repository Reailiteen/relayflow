# 01 — Selection models: candidate choice alongside first-come-first-served

## The change

Today a candidate can be claimed by exactly one startup, and the earliest claim
wins. That stays the **default**. Alongside it we add a second mode where several
startups can register interest in the same person without blocking each other,
and **the candidate chooses**.

Two reasons this is worth building. It is fairer to the candidate, who currently
has no say in where they land. And it surfaces demand: three startups wanting the
same person is information QSTP never sees today, because the second and third
are silently refused.

## What exists

`packages/entities/src/selection/selection.ts`

```ts
SELECTION_STATUSES = ['reserved', 'confirmed', 'released', 'lost']
blocksOthers(status)        // reserved | confirmed
winner(claims)              // earliest reservedAt, unless overridden
contenders(claims)          // the losing claims, for the conflict screen
hasConflict(claims)
```

The invariant is enforced in three places, deliberately layered:

1. `selectCandidate` checks before writing — `packages/logic/src/selection/select-candidate.ts`
2. `SelectionPort.reserve` **must** refuse a second active claim — this is the
   contract that actually holds under a race
3. The Supabase adapter will use a partial unique index on
   `(candidate_id) WHERE status IN ('reserved','confirmed')`

Conflict resolution already exists: `resolveConflict` releases the losing claims
and records a mandatory reason. The QSTP screen is `/selection`.

Also relevant: `board.ts` already has an `interested` pool-entry status —
"interviewed and wanted, but not yet claimed". That is the natural home for the
new mode's intermediate state.

## Proposed model

Add a **mode** and a new class of non-blocking claim.

```ts
export const SELECTION_MODES = ['first_come', 'candidate_choice'] as const;

export const SELECTION_STATUSES = [
  'offered',     // NEW — non-blocking. Several may coexist per candidate.
  'reserved',    // blocking. FCFS, or the offer a candidate accepted.
  'confirmed',
  'declined',    // NEW — candidate chose someone else
  'released',
  'lost',
] as const;
```

The invariant generalises rather than being replaced:

> At most one **blocking** selection per candidate. Any number of `offered` ones.

`blocksOthers()` already expresses exactly this and needs no change — `offered`
and `declined` simply return false.

### Resolution becomes mode-aware

`winner()` stays as the FCFS resolver. Add a sibling for the new mode, and a
dispatcher:

```ts
function resolve(mode: SelectionMode, claims: readonly Selection[]): Selection | null
```

- `first_come` → existing `winner()`, unchanged
- `candidate_choice` → the accepted offer, or null while the candidate is deciding

Keeping both as pure functions over a claim list means the conflict screen, the
board and the use-case keep calling one thing.

### New flow

1. Startup expresses interest → `offered`. Nobody is blocked, and the startup is
   told nothing about who else is interested (decision 4).
2. Candidate sees their offers in the candidate portal. With two or more they
   choose; with exactly one there is nothing to choose between, so the portal
   asks them to accept or decline it (decision 6).
3. Accepting sets that offer `reserved` and every sibling `declined`, in one
   atomic write — same shape as `resolveConflict` today, but triggered by the
   candidate, which is a caller the selection use-cases do not have yet.
4. If the window closes with no choice, the offers fall back to first-come order
   on `offeredAt` — but the earliest startup is *asked to confirm* rather than
   awarded automatically (decision 3).

### Hours accounting

In FCFS a reservation is a commitment, and `committed` hours on the dashboard
count it. An *offer* is not a commitment — three startups offering the same
person must not each count those hours, or the budget triple-counts.

Rule: **only blocking statuses consume hours.**

The surface is smaller than it first looks. `reservesHours` in `position.ts` is
keyed on *position* status, not selection status, so offers never reach it — the
same goes for its callers in `startup/views.ts`, `qstp/operations.ts` and
`submit-position.ts`. The only place a selection status feeds hours is the
`committed` computation in `qstp/dashboard.ts`, and that had the check written
out inline rather than calling `blocksOthers`. Replacing it with the shared
helper is the whole fix, and it is what keeps the rule true as statuses are
added.

## Decisions

1. **The mode lives on the cycle.** One setting, one migration, and every path
   that would need to resolve a claim already loads the cycle. Per-position stays
   possible later without moving the field — a position-level override would read
   the cycle as its default.

2. **The offer window is a fixed date**, stored as a new `offerWindow` entry in
   `CycleDeadlines` alongside the three that exist. It must fall *before*
   `candidateSelection`, because decision 3 needs working days after the window
   closes. This is the one place the two dates could be misconfigured, so cycle
   setup should validate the ordering rather than trust it.

3. **If the candidate never chooses, it reverts to first-come — but the startup
   is asked first.** The earliest `offeredAt` is offered the candidate back, and
   they say whether they still want them. Weeks may have passed and the seat may
   be gone; awarding silently would fill a position nobody wanted any more. A
   decline passes it to the next offer in order.

4. **Startups see nothing about competing interest.** No count, no names. This
   keeps the programme from reading as an auction, at the cost that startups
   cannot judge their odds — which is what makes decision 7 necessary.

5. **A startup can withdraw an offer.** If it was the candidate's only one they
   are told, because otherwise they are silently back to zero and still waiting.

6. **The candidate sees every offer they hold.** The choice UI only appears when
   there are two or more; a single offer is presented as accept-or-decline.

7. **Over-offering is allowed, and self-corrects when the startup fills up.** A
   startup may offer to more candidates than it has seats. The moment its seats
   are all filled, its remaining `offered` claims are withdrawn automatically and
   those candidates are told this company is no longer interested. This is the
   right trade given decision 4 — a startup that cannot see its competition must
   be allowed to hedge — but it makes withdrawal a *cascade* rather than a single
   user action, and that cascade can take away a candidate's only offer, so it
   must fire the same notification as decision 5.

8. **QSTP can override a candidate's choice, but it is a dangerous action.** It
   is not the same act as overriding a timestamp and should not look like one:
   distinct confirmation, distinct wording, and a record that says a person's
   decision was reversed and by whom. In the model, `resolve()` must let an
   override outrank an accepted offer the way `winner()` already lets it outrank
   the clock.

### Opened by these answers

- Decision 3 needs a limit of its own. Walking the offer list one confirmation at
  a time can stall exactly the way the original window did. Simplest answer: the
  walk is visible to QSTP on `/selection` and they can end it by hand.
- Decision 7 needs "filled its seats" defined — across the startup, or per
  position. Per startup is the stricter and probably intended reading.

## Suggested scope

**Phase 1 — built.** `offered`/`declined` statuses with `offeredAt` and
`acceptedAt`, `selectionMode` on the cycle, `offer()` and `acceptOffer()` on
`SelectionPort`, `selection:accept_offer` and `selection:read_own_offers` for the
candidate actor, `resolve()` dispatch, the `blocksOthers` cleanup in
`dashboard.ts`, and `/candidate/offers` with its accept flow.

Two things Phase 1 deliberately left alone. `offerWindow` is stored and enforced
at both ends — a startup cannot offer after it closes and a candidate cannot
accept — but nothing yet *acts* when it passes; that is the confirm-walk in
Phase 2. And QSTP has no view of offers at all: the conflict screen reads
`contenders()`, which offers never produce, so a candidate-choice cycle shows an
empty conflict list. That is correct rather than broken, but it means the
programme currently cannot see the demand this mode was partly built to surface.

**Phase 2** — the `offerWindow` deadline and the confirm-walk fallback, manual
withdrawal, the fill-up cascade, the QSTP override, and visibility of demand
(the "three startups wanted this person" report, which is new information the
programme does not have today).

## Tests to write

The existing `selection.test.ts` covers FCFS thoroughly; mirror it for the new
mode. Specifically:

- Several `offered` claims coexist without conflict
- Accepting one declines the siblings atomically
- `committed` hours count blocking claims only, never offers
- An unavailable candidate cannot be offered to
- An offer is refused when a blocking claim already exists
- Mode is read from the cycle, not from input
- The window closing walks offers in `offeredAt` order, and a declining startup
  passes the candidate to the next
- Filling a startup's last seat withdraws its outstanding offers
- A QSTP override outranks an accepted offer
