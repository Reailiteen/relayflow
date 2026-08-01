# 05 — Startup prioritisation and KPI intake

## The change

The first stage of every cycle, and currently the biggest hand-wave in the
system: allocation scores appear in the fixtures with no explanation of where
they came from.

QSTP needs somewhere to put what they know about each startup — KPI reports,
notes, documents — and a button that turns all of it, plus the positions
requested and the hours available, into a proposed tier per startup.

The scoring logic itself is coming later. **Build the intake, the run, and the
review as a dummy that produces plausible output**, so the real logic drops into
one function.

## Two halves

### 1. Evidence intake — deliberately not a form

You were explicit that this should not be a form. Three ways in, all landing in
the same place:

- **Free text.** Type or paste anything about a startup. Meeting notes, an email,
  a paragraph of context.
- **Per-startup documents.** Upload a KPI report against a named startup.
- **One combined document, split by AI.** Upload a file covering many startups
  and have it attributed automatically.

That third one is the interesting one, and it needs the same treatment OCR got:

> **Extraction is a suggestion.** The AI proposes "this section is about Acme";
> a person confirms or corrects it before it is attributed. Nothing is filed
> against a startup on the model's say-so alone.

This is the pattern already established in
`packages/entities/src/onboarding/document.ts` — `extracted` and `confirmed` kept
separate, never overwritten. Reuse it. Getting attribution wrong here means one
startup's poor numbers being scored against another.

```ts
export interface EvidenceItem {
  id: EvidenceId;
  cycleId: CycleId;
  startupId: StartupId | null;   // null while attribution is unconfirmed
  kind: 'note' | 'document' | 'extracted_section';
  title: string | null;
  body: string | null;           // text, or extracted section text
  fileUrl: string | null;
  source: 'manual' | 'upload' | 'ai_split';
  // Attribution, kept separate from the content, same as OCR fields
  suggestedStartupId: StartupId | null;
  confidence: number | null;
  confirmedBy: UserId | null;
  confirmedAt: string | null;
  addedBy: UserId;
  createdAt: string;
  updatedAt: string;
}
```

Evidence is **append-only**. Editing history is how you lose the ability to say
why a decision was made. Corrections add an item; they do not overwrite one.

### 2. The run — a proposal, not a write

The prioritise button must **not** silently set allocations. It produces a
proposal QSTP reviews, adjusts and confirms.

Two reasons. Allocation is a funding decision that gets questioned, and the
existing model already records who decided and why. And a model that writes
directly is one nobody will trust enough to press twice.

```ts
export interface PrioritisationRun {
  id: RunId;
  cycleId: CycleId;
  status: 'draft' | 'confirmed' | 'superseded';
  inputs: {
    fundedWeeklyHours: number;
    evidenceCount: number;
    startupCount: number;
    positionsConsidered: number;
  };
  proposals: readonly TierProposal[];
  ranBy: UserId;
  ranAt: string;
  confirmedBy: UserId | null;
  confirmedAt: string | null;
}

export interface TierProposal {
  startupId: StartupId;
  score: number;                 // 0–100, feeds the existing recommendedTier()
  proposedTier: HourTier;
  rationale: string;             // why — shown to QSTP, kept on the record
  evidenceIds: readonly EvidenceId[];   // what it was based on
  // Set when QSTP changes it before confirming
  adjustedTier: HourTier | null;
  adjustmentReason: string | null;
}
```

`evidenceIds` is what makes the output defensible: "why did Acme get 60?" has an
answer that points at specific documents.

Confirming a run writes through `decideAllocation`, the existing use-case — so
the budget ceiling, the override-reason rule and the audit trail all apply
unchanged. The proposal is an input to the existing decision, not a bypass of it.

### The dummy

Until the real logic arrives:

```ts
// packages/entities/src/prioritisation/score.ts
export function scoreStartup(facts: PrioritisationFacts): { score: number; rationale: string }
```

Something defensible and obviously provisional — evidence volume, positions
requested, whether they used their hours last cycle — with the rationale string
saying plainly that it is a placeholder. Then `recommendedTier(score)` already
exists in `allocation.ts` and maps score to tier.

Swapping in the real logic is one function.

### Fitting the budget

Scoring produces tiers independently; the sum may exceed the funded total. The
run should say so and propose a resolution — walk the lowest-ranked startups
down a tier until it fits, and show what it did. `largestAffordableTier` and
`canChangeTier` in `hours.ts` already exist for this.

## Where it sits

Prioritisation is the **first stage of a cycle**, before `allocation`. Its
prerequisites, per your description: KPI evidence, the positions each startup has
asked for, and the hours budget.

That creates a sequencing problem worth naming: **positions are currently
submitted in stage 3, after allocation.** If prioritisation needs to know what
each startup asked for, either positions move earlier, or there is a lighter
"what would you want" expression of interest before allocation. See open
question 1 — this is the one that most affects the cycle model in doc 03.

## Screens

- **Evidence** — a per-startup panel plus an "add anything" box. Unattributed
  items sit at the top awaiting confirmation.
- **Combined upload** — drop a file, see proposed splits with confidence, confirm
  or reassign each.
- **Prioritise** — inputs summary, run button, results table with score, proposed
  tier, rationale and evidence links; each row adjustable with a reason;
  budget-fit banner; confirm-all.
- **Startup profile** — where evidence for one startup lives and can be updated,
  which is the "place to update startup information" you asked for.

## Open questions

1. ⚠️ **How do positions come before allocation?** Prioritisation is said to need
   them, but the cycle submits positions after hours are assigned. Options: move
   position submission earlier; add a lightweight pre-allocation "what would you
   ask for"; or drop positions as a prioritisation input. **Answer this before
   doc 03 is built** — it changes the stage order.

2. ⚠️ **Is evidence per cycle or persistent?** Per cycle is simpler. Persistent
   means last year's performance informs this year's tier, which is more useful
   and probably what QSTP actually wants.

3. **What is the real scoring logic?** Coming from you. The dummy exists so
   nothing else waits on it.

4. **Can a run be re-run?** Assumed yes, superseding the previous draft. A
   *confirmed* run should probably not be re-runnable without an explicit reset.

5. **Who can run it?** `allocation:decide` covers operations and the manager.
   Confirming allocations at the end already requires the same. Should running be
   more restricted than confirming, or less?

6. **What if a startup has no evidence?** Score zero, exclude from the run, or
   flag for manual handling? Silently scoring them last is the wrong answer.

7. **Which document types for the combined split?** PDF and DOCX at minimum.

8. **Does the rationale go to the startup?** Recommend no by default — it is
   QSTP's internal reasoning and comparative. But the brief mentions "allocation
   justification", so confirm which audience that is for.

9. **Does prioritisation also propose zero-hour and waitlist?** The tier ladder
   includes 0, so presumably yes, and the waitlist for redistribution falls out of
   it naturally.

## Suggested scope

**Phase 1** — evidence store, manual text and per-startup upload, startup profile
screen.

**Phase 2** — the run with dummy scoring, results review, adjust with reason,
confirm through `decideAllocation`.

**Phase 3** — combined-document AI split with confirm-before-attribute, budget
fitting.

## Tests to write

- Confirming a run writes allocations through the existing budget check, and is
  refused when the total exceeds funded hours
- An adjusted tier requires a reason, matching the existing override rule
- Evidence with unconfirmed attribution is excluded from a run
- Re-running supersedes a draft but not a confirmed run
- The auditor can read evidence and runs, and can confirm nothing
