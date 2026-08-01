# @relayflow/prioritisation

Scoring, tiering, and budget allocation for a cycle of startups. Pure: no file
access, no network, no database, no logging, no approval. Same inputs, same
draft, every time — which is what makes a run answerable six months later when
somebody asks why a startup got 40 hours.

```ts
import { buildPortfolioDraft } from '@relayflow/prioritisation';

const draft = buildPortfolioDraft({
  cycle: { cycleId, budgetHours: 820 },
  startups: [{ startupId, startupName, extraction, qstpRatings }],
  allocation: { mode: 'priority' },
});
```

## The score

Ninety of the hundred points are six human judgements on a 0–4 scale. The
extraction feeds only the two things a person should not be asked to eyeball.

| Dimension                       | ×    | Max |
| ------------------------------- | ---- | --- |
| `progressAgainstStage`          | 5    | 20  |
| `tractionStrength`              | 5    | 20  |
| `valueToStartup`                | 3.75 | 15  |
| `valueToIntern`                 | 3.75 | 15  |
| `qstpQatarAlignment`            | 2.5  | 10  |
| `researchEcosystemContribution` | 2.5  | 10  |
| platform history                | —    | 10  |

## Five statuses, not one

Three gates run before scoring, each returning a distinct terminal status. This
is the reason the package exists in the shape it does: a startup nobody has
extracted yet and a startup that scored 12 both end up with zero hours, and one
of them needs chasing while the other needs nothing.

| Status                   | Meaning                                    | In the allocation? |
| ------------------------ | ------------------------------------------ | ------------------ |
| `needs_information`      | Position evidence is absent or unresolved  | No                 |
| `awaiting_manual_scores` | Ratings missing or invalid                 | No                 |
| `not_ready`              | No position passes the 10 feasibility checks | No               |
| `not_fundable`           | Role-value ratings below the floor         | No                 |
| `scored` at `0h`         | Fully evaluated, unfunded → waitlist       | Yes                |
| `scored` at `20–60h`     | Fully evaluated, provisionally funded      | Yes                |

`runStatus: 'complete_draft'` means every startup reached a legitimate outcome.
It does **not** mean the portfolio was approved or published.

## Ties

Startups on exactly the same score always receive exactly the same hours. Groups
move together or not at all, which is why a downgrade can strand residual hours
rather than spend them. Where a tie reaches the waitlist the engine refuses to
order it and emits `tied_requires_qstp_resolution` — `displayOrder` is
presentation only and must never decide who is offered released hours.

## The golden fixture is the contract

`src/contracts/examples/` holds a five-startup input and its exact expected
output, copied byte-identical from the experiment this was ported from. It
covers a top-priority startup, an exact-score tie, a budget downgrade, a
waitlisted startup and an infeasible position.

`prioritise.test.ts` asserts `toStrictEqual` against it. Any change that moves
that output is either a bug or a deliberate policy change requiring a
regenerated fixture — `DEFAULT_POLICY.version` is pinned in the same test to
force the choice.

## What this does not buy

The mechanics are verified. **The policy is not validated.** An independent
blind review of the same 30-startup cohort reached 0.58 score correlation and
agreed on 16 of 28 final tiers. Thresholds, weights, the role-value floor and
tie handling are all provisional pending QSTP confirmation.

Treat every output as a draft a person confirms, with rationale and citations
visible. It is defensible because it shows its work, not because it is right.

## Allocation modes

`priority` (concentration) is the recommended default. `broad` is retained as a
comparison baseline. `distribution` targets a requested tier mix via exhaustive
backtracking over exact-score groups — its cost grows with the number of
distinct scores, so bound the cohort before enabling it.
