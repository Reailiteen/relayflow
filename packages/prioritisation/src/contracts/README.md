# Prioritization Contracts

These files freeze a portable, framework-independent boundary for the V3 experiment. They are an
integration aid, not an approved QSTP policy or a mandate for the future application's API shape.

## Files

- `prioritization-input.schema.json`: a complete cohort calculation request.
- `prioritization-policy.schema.json`: the policy snapshot used for that calculation.
- `prioritization-output.schema.json`: the reviewable portfolio draft returned by the pure core.
- `examples/minimal-input.json`: five cases covering high priority, an exact tie, a budget downgrade,
  waitlisting, and an infeasible position.
- `examples/expected-output.json`: the exact deterministic output for that input.

Regenerate the output after an intentional algorithm change:

```bash
npm run contracts:generate
```

The fixture is also a portability test. A teammate may rewrite the logic in another framework or
language, then compare the resulting JSON with `expected-output.json`. A deliberate policy or
contract change should bump `schemaVersion` or `policy.version` and update migration notes; it
should not silently overwrite old production runs.

## Boundary rules

- The input is normalized extraction, not raw uploaded documents.
- `extraction: null` and `qstpRatings: null` keep incomplete startups visible.
- Only startups with `status: scored` enter allocation.
- `not_ready` and `not_fundable` are legitimate completed evaluations, not processing failures.
- `0h` is a scored allocation and waitlist state; it is not a substitute for incomplete data.
- Output is a draft. Approval, persistence, publication, notifications, and overrides belong to the
  surrounding application.

JSON Schema cannot express every invariant. The core additionally checks unique startup IDs,
rating upper bounds from the selected policy, exact target-share sums, tier feasibility, budget
safety, score order, and equal treatment of exact-score groups.
