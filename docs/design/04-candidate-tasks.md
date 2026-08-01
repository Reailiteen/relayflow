# 04 — Candidate tasks

## The change

Startups set a piece of work for a candidate as part of assessing them; the
candidate submits it; the startup reviews it beside the interview notes.

This was in the original brief — candidate Flow 3: *"Upload a task, Submit
requested files, Confirm completion, View next steps"* — and was missed when the
interview workspace was built. It is a gap in spec coverage, not a scoping
decision.

It matters more than it looks: for technical roles the take-home is often what
the decision actually turns on, more than the conversation.

## What exists

Nothing. No model, no port, no screen. `grep -ri task packages/` returns
nothing.

What it will hang off:

- `PoolEntry` (`packages/entities/src/candidate/candidate.ts`) — the join between
  a candidate and a position, which is the right anchor. A task is set in the
  context of one role.
- `POOL_ENTRY_STATUSES` already includes `interview_requested`, `interviewed`
  and `interested` — a task sits alongside these rather than replacing them.
- `CandidateDocument` (`onboarding/document.ts`) is a good shape reference for
  the upload/review lifecycle, though tasks are **not** onboarding documents and
  should not share a table. Onboarding documents are QSTP's and highly
  sensitive; task submissions are the startup's and are not.

## Proposed model

```ts
export const TASK_STATUSES = [
  'assigned',     // set, candidate has not started
  'submitted',    // candidate has sent something
  'reviewed',     // startup has looked
  'withdrawn',    // startup pulled it, or the candidate is gone
] as const;

export interface CandidateTask {
  id: TaskId;
  poolEntryId: PoolEntryId;      // position + candidate
  title: string;
  brief: string;                 // what to do
  attachmentUrl: string | null;  // spec, dataset, starter repo
  dueAt: string | null;
  status: TaskStatus;
  assignedBy: UserId;
  assignedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSubmission {
  id: SubmissionId;
  taskId: TaskId;
  note: string | null;           // candidate's own comments
  fileUrls: readonly string[];
  linkUrl: string | null;        // a repo or deployed thing
  submittedAt: string;
}
```

Review lives on the task rather than a separate entity — one startup verdict per
task, same reasoning as interview feedback: it is a judgement a person is
accountable for.

```ts
  reviewNote: string | null;
  reviewedBy: UserId | null;
  reviewedAt: string | null;
```

### Late submission

Model it, do not enforce it. A task submitted after `dueAt` is `submitted` with a
`late` flag derived from the timestamps — not auto-rejected. Whether lateness
matters is the startup's judgement, and a system that decides for them will be
wrong for the candidate whose laptop died.

```ts
export function isLate(task, submission): boolean
```

## Screens

**Startup — candidate row** gains "Set a task" beside "Request interview".
Assignment is a dialog: title, brief, optional attachment, optional due date.

**Startup — interview workspace** shows the submission next to the AI summary and
the notes field. This is the point: the reviewer sees the work and the
conversation together when forming a verdict.

**Candidate — overview** gains the task as a next action when one is outstanding.
This is the flow the brief describes and is currently missing entirely.

**Candidate — a task screen** with the brief, the due date, and an upload. Same
honest-stub treatment as documents: no storage yet, and the UI says so.

**QSTP** — read-only visibility, probably on the candidate detail. QSTP resolves
disputes and needs to see what was asked of somebody, but has no business
grading it.

## Open questions

1. **Before or after the interview, or both?** The model allows any of them.
   Worth knowing which is expected, because it decides where the "Set a task"
   button is most prominent.

2. **Can a startup set more than one task per candidate?** The model allows it.
   Cap at one to keep the candidate screen simple, or allow several?

3. **Are tasks reusable templates?** A startup interviewing six people for one
   role will set the same task six times. A template per position would be an
   obvious win and is cheap — but it is scope.

4. ⚠️ **Does a task submission feed the AI summary?** Sending a candidate's
   submitted code to a model is a different consent question from transcribing an
   interview they agreed to record. Recommend **no** for now, and say so on the
   screen.

5. **Does QSTP see submissions, or only that one exists?** Recommend metadata
   only by default — same reasoning as the startup onboarding screen, which shows
   progress rather than contents.

6. **What file types and size limits?** Needs an answer before storage is real.
   Code archives and PDFs at minimum.

7. **Does a task have its own deadline separate from the selection deadline?**
   `dueAt` assumes yes. Confirm it should not simply inherit.

8. **What happens to tasks when a candidate is lost to another startup?**
   Probably `withdrawn`, and the candidate should be told they need not finish it.
   This is a small kindness that is easy to forget and obvious in hindsight.

## Suggested scope

**Phase 1** — model, port, assign + submit + review, all three screens, no real
storage.

**Phase 2** — templates per position, late handling in the UI, QSTP visibility.

## Tests to write

Mirror the existing tenant-isolation tests in
`packages/logic/src/startup/flows.test.ts`:

- A startup cannot set a task on a candidate outside its own pool
- A candidate cannot submit against another candidate's task — `not_found`, not
  `forbidden`, matching the document rule
- A supervisor can set and review tasks (they run assessment) but still cannot
  select — check this against the capability table
- Submitting after `dueAt` succeeds and is flagged late, not refused
- Withdrawing a task the candidate already submitted keeps the submission
