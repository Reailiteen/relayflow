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

1. Startup expresses interest → `offered`. Nobody is blocked. The startup is told
   how many others are interested (see open question below).
2. Candidate sees their offers in the candidate portal and accepts one.
3. Accepting sets that offer `reserved` and every sibling `declined`, in one
   atomic write — same shape as `resolveConflict` today.
4. If the window closes with no choice, a fallback applies (open question).

### Hours accounting

This is the part most likely to bite. In FCFS a reservation is a commitment, and
`committed` hours on the dashboard count it. An *offer* is not a commitment —
three startups offering the same person must not each count those hours, or the
budget triple-counts.

Rule: **only blocking statuses consume hours.** `reservesHours` in
`position.ts` and the `committed` computation in
`packages/logic/src/qstp/dashboard.ts` both need checking against this.

## Open questions

Marked ⚠️ where the answer changes the data model.

1. ⚠️ **Where does the mode live — cycle, position, or candidate?** Per cycle is
   simplest and probably right for a first version. Per position lets QSTP run
   candidate-choice only for scarce, in-demand roles, which is arguably where it
   earns its keep. Per candidate is the most flexible and the hardest to explain.

2. ⚠️ **Is there an offer window, and what closes it?** A fixed deadline, N days
   from first offer, or QSTP closing it by hand. Without one, a candidate sitting
   on three offers stalls three startups indefinitely.

3. **What happens if the candidate never chooses?** Options: fall back to FCFS
   ordering on `offeredAt`; QSTP decides; all offers lapse and the candidate
   returns to the pool. This needs an answer before the window is built.

4. **What does a startup see about competing interest?** Nothing, a count
   ("2 others interested"), or named startups. A count is probably right — it
   conveys urgency without turning the programme into a visible bidding war.
   Named feels like it would change behaviour badly.

5. **Can a startup withdraw an offer?** Presumably yes, but if it is the
   candidate's only offer that should probably notify them.

6. **Does the candidate see who else offered before choosing?** Yes, surely —
   otherwise there is nothing to choose between. Confirm.

7. **Can one startup make offers to more candidates than it has seats?** In FCFS
   this is naturally bounded because reservations block. With offers it is not —
   a startup with one seat could offer to ten people and accept whoever bites,
   which is unfair to the other nine. Cap at seats, or allow over-offering with a
   warning?

8. **Does QSTP override still apply in candidate-choice mode?** The override
   exists for FCFS ("candidate withdrew verbally"). Overriding a candidate's own
   choice is a different and much heavier act.

## Suggested scope

**Phase 1** — `offered`/`declined` statuses, mode on the cycle, resolver
dispatch, hours accounting fixed, candidate-portal offer list with accept.

**Phase 2** — offer window and expiry, withdrawal, QSTP visibility of demand
(the "three startups wanted this person" report, which is new information the
programme does not have today).

## Tests to write

The existing `selection.test.ts` covers FCFS thoroughly; mirror it for the new
mode. Specifically:

- Several `offered` claims coexist without conflict
- Accepting one declines the siblings atomically
- `committed` hours count blocking claims only, never offers
- An unavailable candidate cannot be offered to
- Mode is read from the cycle, not from input
