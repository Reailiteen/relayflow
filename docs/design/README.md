# Design docs

Five features agreed but not yet built. Each doc is written to be opened cold in
a fresh session: it states what exists today, what is proposed, and — in a
clearly marked section — the questions still to answer.

Read the open questions first. Several change the data model, and answering them
after the backend exists costs a migration.

| Doc                                             | What it is                                       | Blocks the backend?                     |
| ----------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| [01 — Selection models](./01-selection-models.md) | Candidate choice alongside first-come-first-served | **Yes** — changes the selection table    |
| [02 — Automation rules](./02-automation-rules.md) | Triggers, audiences, channels, escalation         | New tables, but additive                |
| [03 — Cycle setup](./03-cycle-setup.md)           | Flow 1, with stage gates                          | **Yes** — concurrent cycles is unanswered |
| [04 — Candidate tasks](./04-candidate-tasks.md)   | Startups setting work for candidates              | New tables, additive                    |
| [05 — Prioritisation](./05-prioritisation.md)     | KPI intake and automatic tiering                  | New tables, additive                    |

## Suggested order

**01 and 03 first.** Both change existing tables, and both are cheapest to
settle before Supabase exists. 03 in particular hinges on one unanswered
question — whether two cycles can run at once — that touches every query.

**04 next.** It is the most self-contained, demos well, and closes a real gap in
the original brief.

**05 then 02.** Prioritisation is the first stage of a cycle so it is more
visible; automation is the larger build and benefits from having more state to
watch.

## Ground rules that apply to all five

These are established in the codebase and should not be relitigated per feature:

- **Rules live in `@relayflow/entities`**, as pure functions, tested without a
  database. Screens and use-cases both call them. See
  `packages/entities/src/board/board.ts` for the pattern.
- **Use-cases never trust the client.** Facts sent to the browser exist so an
  impossible action fails fast; the server rebuilds them before writing.
- **`authorize` is a required field** on every use-case. See
  `packages/logic/src/use-case.ts`.
- **Ports before adapters.** New storage needs go in `@relayflow/ports` first,
  then the fixtures adapter. `@relayflow/data` is still stubbed.
- **Derived over stored** wherever the derivation is cheap. A status that can be
  computed should not also be written, or the two will disagree.
