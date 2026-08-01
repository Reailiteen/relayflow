# RelayFlow Core Workflow UI Brief

Date: 2026-08-01
Source: RelayFlow Fixture-Backed Core System Plan and follow-up UI direction

## Objective

Expose every implemented Stage 1–5 fixture-backed behavior as a complete, role-appropriate web workflow. The UI must remain a direct projection of the existing use cases, repository contracts, permissions, lifecycle rules, and activity history. It must not invent a second set of client-side business rules.

## Primary users

- QSTP programme managers and operations staff configure cycles, review and decide work, resolve exceptions and conflicts, redistribute hours, and approve onboarding.
- Startup owners and members manage participation, positions, candidate assessment, exceptions, and placement readiness.
- Startup supervisors assess candidates and tasks but cannot select candidates.
- Candidates confirm availability, respond to interviews and offers, complete tasks and documents, sign declarations, and confirm readiness.

## Interaction direction

- Keep the existing light, dense RelayFlow console aesthetic and existing tokens.
- Use right-side panels for extensive create, edit, inspect, and decision workflows.
- Side panels must not render a dark overlay or backdrop. The panel itself provides separation through its border and shadow.
- Preserve the current page behind the panel so users retain operational context.
- Reserve compact confirmation dialogs for short, high-risk acknowledgements only; do not place multi-field forms in centered dialogs.
- Use sticky panel headers and footers, scrollable bodies, explicit unsaved-change handling, inline field errors, and server-returned failure messages.
- Canonical workflow URLs remain cycle-scoped. Opening and closing a panel should be deep-linkable where practical through route/query state without losing the selected cycle or workspace.

## Cycle creation quality bar

Cycle creation is the first and highest-priority slice. Replace the current inline grid with a polished side-panel workflow that:

- opens from the cycle list without shifting the page;
- supports creating empty or cloning participation context from an existing cycle;
- conditionally requests an offer-window deadline only for candidate-choice mode;
- validates date order and deadline order before submission while treating the server as authoritative;
- uses Qatar-local date/time semantics and does not silently fabricate UTC timestamps from bare dates;
- previews the selected source cycle and clearly states what cloning does and does not copy;
- displays field-level and form-level errors without losing entered values;
- prevents duplicate submission, supports cancellation and Escape, and warns about unsaved changes;
- closes and routes to the newly created cycle's allocation workspace only after a successful write;
- is reused for cycle editing, with archive handled as a separate reasoned action.

## Required workflow coverage

The completed UI must cover cycle setup and participation; prioritization and allocation; position creation and review; candidate import and pool handoff; interviews and tasks; first-come and candidate-choice selection; conflicts, fallback, and exceptions; recovery and redistribution; placement confirmation and cancellation; requirement templates and submissions; simulated signing; readiness and onboarding; and immutable activity history.

## State and privacy requirements

- Every action exposes loading, success, validation failure, authorization failure, stale/conflict failure, empty, and read-only states where applicable.
- UI visibility follows server-authorized read models; hiding a control is not the authorization boundary.
- Startup views show checklist progress for candidate-owned requirements but never candidate ID/banking contents or private file paths.
- Cancelled placements and superseded decisions remain inspectable and read-only.
- QSTP viewer accounts see operational data but no mutation controls.
- All new actions carry an explicit `cycleId`; canonical UI must not fall back to `findActive()`.

## Verification

- Focused component/use-case tests cover form state and role/state control visibility.
- Playwright fixture journeys cover QSTP, startup, and candidate workflows, cycle switching, direct URL isolation, side-panel behavior, and failure states.
- `pnpm verify` and the browser smoke suite must pass after each numbered phase.

