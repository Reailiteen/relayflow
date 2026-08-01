# 06 — The real prioritisation engine, and the data behind it

Supersedes the dummy described in [05](05-prioritisation.md). That doc guessed
the shape of the real logic; the logic now exists, and it is stricter than the
guess.

## Three flows, not two

You framed this as two flows — raw data → extracted data, then prioritisation —
with the first a prerequisite of the second. That is correct and it is the single
most important boundary here. But there is a third stage between them, and it is
where most of the score actually comes from.

```
A. intake + extraction     documents → normalised evidence     I/O · LLM · human confirm
B. review + rating         evidence → six QSTP ratings          human judgement
C. prioritisation          ratings + evidence + budget → draft  pure function, no I/O
```

**Extraction contributes almost nothing to the score directly.** It resolves
`positions` (which gates feasibility) and `platformHistory` (10 points). The
other 90 points come from six human ratings on a 0–4 scale. Extraction exists so
a person can rate defensibly and cite what they rated from.

That means the current `operatorScore: number | null` — one number typed into a
box — is not a smaller version of the real thing. It is a different thing. Stage
B needs its own screen and its own tables.

### The score

| Dimension                      | Rating | ×    | Max |
| ------------------------------ | ------ | ---- | --- |
| progressAgainstStage           | 0–4    | 5    | 20  |
| tractionStrength               | 0–4    | 5    | 20  |
| valueToStartup                 | 0–4    | 3.75 | 15  |
| valueToIntern                  | 0–4    | 3.75 | 15  |
| qstpQatarAlignment             | 0–4    | 2.5  | 10  |
| researchEcosystemContribution  | 0–4    | 2.5  | 10  |
| platform history               | —      | —    | 10  |
|                                |        |      | 100 |

Three gates run before scoring, in order, and each produces a distinct terminal
status rather than a low score:

1. `positions` unresolved → `needs_information`
2. no position passes all ten feasibility checks → `not_ready`
3. `valueToStartup` or `valueToIntern` below 2 → `not_fundable` (non‑compensatory:
   a strong startup that is a poor host cannot buy its way past this)

Then thresholds `85/70/50/35` → `60/40/30/20`, below 35 → `0h` and the waitlist.
Then budget fitting by lowest‑priority downgrade, preserving exact‑score ties.

## What this forces

### Positions must move before allocation

Doc 05 open question 1 asked whether positions come before prioritisation. The
engine answers it: `no_feasible_position` is a hard gate, so they must. And the
current `Position` entity cannot satisfy the gate — six of the ten checks have no
field to read:

| Check                        | Field today                     |
| ---------------------------- | ------------------------------- |
| title                        | `title` ✅                      |
| work mode                    | `workArrangement` ✅            |
| supervisor named             | `supervisorName` ✅             |
| category                     | **missing**                     |
| expected deliverable         | **missing**                     |
| learning outcomes            | **missing**                     |
| weekly supervision ≥ 30 min  | **missing**                     |
| maximum interns ≥ 1          | `internCount`, different meaning |
| resources ready              | **missing**                     |
| onboarding ready             | **missing**                     |

Either the position form grows these fields, or extraction supplies them from the
position‑request document, or both. Recommend both: the form is the source of
truth, extraction pre‑fills it.

### Scoring must leave the adapter

`PrioritizationPort.run(cycleId, createdBy, createdAt)` currently computes the
proposals *inside the adapter* — `fitPrioritization` is called by the fixtures
repository. That means Supabase would have to reimplement scoring, and the two
adapters could silently disagree about a funding decision.

The engine is pure and total. It belongs in `entities`, beside `hours.ts`, with
the use‑case calling it and the port reduced to persistence:

```ts
// packages/entities/src/prioritisation/
buildPortfolioDraft(input: PrioritisationInput, policy: Policy): PortfolioDraft
```

```ts
// PrioritizationPort, after
save(run: PrioritizationRun): Promise<Result<PrioritizationRun>>;
listForCycle(cycleId): Promise<Result<PrioritizationRun[]>>;
adjust(...); confirm(...);
```

This refactor is a prerequisite for the port, not a follow‑up to it.

### Platform history is already ours

The 10 history points are the mean of five rates, all computable from relayflow's
own cycle data — no extraction needed:

`deadlineRate` · `allocationUtilizationRate` · `dispositionRate` ·
`taskReportingRate` · `internCompletionRate`

A first‑time startup gets a visible neutral 5, not a zero. Compute per cycle and
**freeze the values into the run** so a re‑read of an old run does not silently
change as this cycle progresses.

## The tables

Grouped by flow. Existing tables (`cycle`, `startup`, `cycle_participation`,
`position`, `allocation`, `activity_event`) are unchanged except where noted.

### A — intake and extraction

**Storage.** One private bucket, `startup-evidence`. Path
`cycles/{cycle_id}/items/{evidence_item_id}{ext}` — deliberately *not* keyed by
startup, because attribution changes and moving objects invalidates signed URLs
and breaks the audit trail. Attribution lives in the row, never in the path.

**`evidence_item`** — append-only. Corrections add a row; they never overwrite.
```
id · cycle_id · kind('note'|'document'|'extracted_section')
startup_id            null until attribution is confirmed
suggested_startup_id · suggestion_confidence   ← model's proposal, kept separate
confirmed_by · confirmed_at                    ← the human's answer
title · body · storage_path · mime_type · byte_size · checksum_sha256
source('manual'|'upload'|'ai_split') · parent_item_id · added_by · created_at
```

**`extraction_run`**
```
id · cycle_id · startup_id · contract_version · model · prompt_version
status('queued'|'running'|'succeeded'|'failed') · error
started_at · finished_at · created_by
```

**`extracted_field`** — 23 rows per run, one per contract field path.
```
id · extraction_run_id · cycle_id · startup_id
field_path            identity.name … positions, platformHistory
status('supported'|'conflicting'|'unresolved'|'missing'|'stale'|'not_applicable')
resolved_value jsonb · normalized_unit · period jsonb
review_state('proposed'|'confirmed'|'corrected')
corrected_value jsonb · confirmed_by · confirmed_at
unique (extraction_run_id, field_path)
```
`resolved_value` and `corrected_value` are separate columns for the same reason
`extracted`/`confirmed` are separate in `onboarding/document.ts`: the model's
answer must remain readable after a human overrules it.

**`extracted_field_observation`** — the citation trail. This is what makes
"why did Acme get 60?" answerable down to a page.
```
id · extracted_field_id · evidence_item_id · format
locator jsonb {type,page,section,sheet,cell} · raw_representation
observed_value jsonb · unit · period jsonb
qualifier · relationship('primary'|'corroborating'|'conflicting')
```

### B — review and rating

**`startup_rating`**
```
id · cycle_id · startup_id · status('draft'|'submitted')
rated_by · created_at · submitted_at
unique (cycle_id, startup_id) where status = 'submitted'
```

**`startup_rating_item`** — six per rating, rationale mandatory.
```
id · rating_id
dimension('progress_against_stage'|'traction_strength'|'value_to_startup'
         |'value_to_intern'|'qstp_qatar_alignment'|'research_ecosystem_contribution')
value smallint check (value between 0 and 4)
rationale text not null
unique (rating_id, dimension)
```

**`rating_citation`** — rating_item_id → extracted_field_id. Optional per item,
but a rating with no citation should be visibly flagged in review.

### C — prioritisation

**`prioritisation_policy_version`** — weights, thresholds, buckets, floors,
margins, allocation mode. Versioned and immutable once used by a run.

**`prioritisation_run`**
```
id · cycle_id · version · status('draft'|'confirmed'|'superseded')
policy_version_id · policy_snapshot jsonb        ← frozen, not a join
history_snapshot jsonb                            ← frozen, see above
budget_hours · allocated_hours · residual_hours
allocation_mode('priority_concentration'|'broad_access'|'target_distribution')
created_by · created_at · confirmed_by · confirmed_at
```

**`prioritisation_result`** — one row per startup per run.
```
id · run_id · startup_id
status('needs_information'|'awaiting_manual_scores'|'not_ready'
      |'not_fundable'|'scored')
score numeric(5,2) · breakdown jsonb · history_source
rank · tie_group · requires_tie_resolution boolean
proposed_hours · adjusted_hours · adjustment_reason
waitlist_rank · blockers jsonb · signals jsonb · position_checks jsonb
```

`status` is the column that must not be collapsed. A startup blocked for missing
information and a startup scored at 12 both end up with zero hours, and the
difference between them is the whole point — one needs chasing, the other needs
nothing.

## Port plan

The JavaScript is ~1,000 lines across six modules, pure, with nine passing test
files and an exact five-startup contract fixture at
`contracts/examples/expected-output.json`.

**That fixture is the acceptance test.** The TypeScript port reproduces it
byte-for-byte or it is not done. It covers a top-priority startup, an exact-score
tie, budget downgrades, a waitlisted startup and an infeasible position.

| Source (`.mjs`)     | Destination                                          | Lines |
| ------------------- | ---------------------------------------------------- | ----- |
| `v3-policy`         | `entities/prioritisation/policy.ts` + Zod schema      | 63    |
| `v3-normalization`  | `entities/prioritisation/normalise.ts`                | 120   |
| `v3-scoring`        | `entities/prioritisation/score.ts`                    | 100   |
| `v3-allocation`     | `entities/prioritisation/allocate.ts`                 | 390   |
| `v3-prioritize`     | `entities/prioritisation/portfolio.ts`                | 192   |
| `v3-rating-draft`   | *skip* — synthetic rating generator, test-only        | 117   |
| `v3-ratings`        | *skip* — v2→v3 mechanics shim, test-only              | 25    |

`fitPrioritization` in `entities/operations/operations.ts` is deleted, not
adapted. `recommendedTier` in `allocation.ts` is replaced by the policy
thresholds — keeping both is two sources of truth for one funding decision.

The extraction adapter (OpenAI Responses API, strict structured output) is I/O
and belongs in a port + adapter pair, not in `entities`.

## Sequencing

1. Move scoring out of the adapter; port stays green on the dummy.
2. Port the engine to TS; reproduce the contract fixture.
3. Position fields for the feasibility gate.
4. Rating tables + screen (stage B) — this unblocks the engine end to end.
5. Migrations for all of the above. `supabase/migrations/` does not exist yet
   despite what `ARCHITECTURE.md` claims; this is greenfield.
6. Evidence intake + storage bucket.
7. Extraction run + confirm-before-attribute review.

Steps 1–4 give a working real engine on hand-entered ratings. Everything after
is about making the ratings evidence-backed rather than remembered.

## What porting this does not buy

The engine's mechanics are verified. Its **policy is not validated** — an
independent blind review of the same 30 startups reached only 0.58 score
correlation and agreed on 16 of 28 final tiers. Thresholds, weights, the role
floor, and tie handling are all provisional pending QSTP confirmation.

So the output must stay what doc 05 already insisted on: a draft proposal that a
person confirms, with the rationale and the citations visible. It is defensible
because it shows its work, not because the numbers are right.

## Open questions

1. **Is a rating per cycle or carried forward?** Same question doc 05 asked about
   evidence. Carrying forward is more useful and much harder to keep honest.
2. **Who rates?** Rating is judgement; running is arithmetic. `prioritization:run`
   probably should not be the same capability as submitting ratings.
3. **Tied waitlist groups.** The engine marks them `tied_requires_qstp_resolution`
   and refuses to break the tie by id. Someone has to.
4. **Allocation mode.** `priority_concentration` is the current experiment
   default. `target_distribution` was implemented but misses requested mixes by
   more than one startup on tied cohorts.
</content>
