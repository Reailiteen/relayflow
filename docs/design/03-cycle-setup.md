# 03 — Cycle setup, with stage gates

## The change

Flow 1 of the brief, and the only unbuilt QSTP flow. Today everything is anchored
to one hardcoded cycle in `packages/fixtures/src/seed.ts`. QSTP cannot create
Spring 2027, set its budget, or define its deadlines.

**Option C was chosen:** creation *plus* explicit stage advancement with
preconditions — "3 startups haven't submitted, advance anyway?" — rather than a
cycle that simply exists and drifts through phases by date. This is what makes a
cycle feel operated rather than configured.

## What exists

`packages/entities/src/cycle/cycle.ts`

```ts
CYCLE_STAGES = ['draft','allocation','positions','selection',
                'redistribution','onboarding','closed']
hasReached(current, stage)
createCycleInput          // already validates deadline ordering
```

The input schema already enforces that positions close before selection, and
selection before documents. `CyclePort.findActive()` returns **one** cycle — see
the first open question.

`cycle:create`, `cycle:update` and `cycle:advance_stage` are already
programme-manager-only in `packages/access/src/capabilities.ts`. Operations
deliberately cannot advance a stage.

## Proposed design

### Creation: clone by default

Nobody retypes a tier ladder. The create screen offers:

- **Clone from previous** — everything pre-filled from the last cycle, dates
  shifted by a year, startups optionally carried over. This is what will actually
  be used every cycle.
- **Start fresh** — the same form, empty.

Fields: name, start/end dates, funded weekly hours, the three deadlines, the tier
ladder, and the selection mode (see doc 01).

A new cycle starts in `draft` and is invisible to startups and candidates until
advanced. That is what `draft` is for and it is already modelled.

### Stage gates

Advancing is a deliberate action with preconditions, not a date passing.

```ts
interface StageGate {
  from: CycleStage;
  to: CycleStage;
  checks: readonly GateCheck[];
}

interface GateCheck {
  id: string;
  label: string;                  // "Every funded startup has submitted positions"
  severity: 'blocking' | 'warning';
  passed: boolean;
  detail: string | null;          // "Desert Bloom, Pearl Diagnostics"
  href: string | null;            // where to go and fix it
}
```

`blocking` cannot be overridden. `warning` can, with a recorded reason — the same
pattern as the allocation override, which already works this way.

The advance screen shows every check with its state, so the manager sees what
they are choosing to ignore rather than being stopped by a single opaque error.

**Proposed checks**, all computable from existing read models:

| Transition | Check | Severity |
| --- | --- | --- |
| draft → allocation | Funded hours > 0 | blocking |
| draft → allocation | At least one startup in the cycle | blocking |
| draft → allocation | Prioritisation has run (see doc 05) | warning |
| allocation → positions | Every startup has an allocation decision | blocking |
| allocation → positions | Allocated ≤ funded | blocking |
| positions → selection | Every funded startup has ≥1 approved position | warning |
| positions → selection | No positions awaiting review | warning |
| selection → redistribution | Selection deadline has passed | warning |
| selection → redistribution | No unresolved candidate conflicts | blocking |
| redistribution → onboarding | No pending exception requests | warning |
| onboarding → closed | All documents verified | warning |
| onboarding → closed | Every confirmed intern is ready to start | warning |

Most are warnings on purpose. A programme runs late; a tool that refuses to let
it proceed gets worked around.

### Going backwards

Proposed: **no**, except `draft` ↔ `allocation` before anything is visible. Once
startups have been told they have hours, un-telling them is a communication
problem rather than a state transition. Reopening a deadline is what exceptions
are for.

### Deadline edits after start

Allowed, manager-only, and it must recompute anything derived from the old date.
Note this interacts with exceptions: an approved extension sets a *later*
deadline for one startup, so moving the cycle deadline forward past it should not
silently shorten their extension. `effectiveDeadline()` already takes the max, so
this behaves correctly — but it needs a test.

## Open questions

1. ⚠️ **Can two cycles be active at once?** The single most important question in
   this doc. Every query is already cycle-scoped and the schema supports it, but
   `findActive()` returns one and every screen assumes that. Overlapping cycles
   are real — Spring onboarding is still running when Autumn allocation starts.
   If the answer is yes, the UI needs a cycle switcher and "active" stops being
   meaningful. **Cheap to decide now, awkward after the backend.**

2. ⚠️ **Is the tier ladder per cycle or global?** Currently `HOUR_TIERS` is a
   module constant in `hours.ts`. Per-cycle is more flexible and makes the
   constant a column. Given the ladder was confirmed as fixed, global may be
   right — but it is a schema decision.

3. **Are startups carried between cycles, or re-added each time?** Clone implies
   carried. If carried, does a startup's history (previous tier, whether they
   used their hours) feed the next prioritisation? That would be valuable and it
   changes what doc 05 reads.

4. **Who can see a `draft` cycle?** QSTP only, presumably. Confirm that includes
   the read-only auditor.

5. **What happens to a cycle when it closes?** Read-only forever, or archived out
   of the default views? Reports will need it.

6. **Can a cycle be deleted or abandoned?** A `draft` created by mistake needs a
   way out. After `allocation`, probably never.

7. **Does advancing a stage notify anyone?** Almost certainly — "positions are
   now open" is exactly the kind of message doc 02 exists to send. Worth wiring
   the two together rather than building stage advancement mute.

## Suggested scope

**Phase 1** — create (fresh + clone), draft state, cycle list screen.

**Phase 2** — the gate model, advance screen with checks, override with reason,
recorded stage history.

**Phase 3** — deadline editing with recomputation, close and archive.

## Tests to write

- Deadline ordering is enforced on create *and* on edit
- A blocking check cannot be overridden; a warning can, and records its reason
- Advancing is refused for operations and the auditor, allowed for the manager
- Moving the cycle deadline does not shorten an approved extension
- A `draft` cycle is invisible to startup and candidate actors
