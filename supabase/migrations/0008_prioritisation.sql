-- 0008 — evidence, extraction, ratings, and the prioritisation run
--
-- Three flows, in order, each a prerequisite of the next:
--
--   A. intake + extraction   documents -> normalised evidence   (I/O, LLM, human confirm)
--   B. review + rating       evidence  -> six QSTP ratings      (human judgement)
--   C. prioritisation        ratings   -> portfolio draft       (pure calculation)
--
-- Worth stating plainly, because it is counter-intuitive: extraction
-- contributes almost nothing to the score. It resolves position feasibility and
-- platform history. NINETY of the hundred points are the six human ratings in
-- flow B. Extraction exists so that a person can rate defensibly and cite what
-- they rated from.

-- ---------------------------------------------------------------------------
-- A. Evidence intake
-- ---------------------------------------------------------------------------

-- Append-only. Corrections add a row; they never edit one. Editing history is
-- how you lose the ability to say why a decision was made.
create table evidence_items (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  kind evidence_kind not null,

  -- Null until attribution is CONFIRMED BY A PERSON. Getting this wrong means
  -- one startup's poor numbers being scored against another, so the model's
  -- guess and the human's answer are deliberately different columns.
  startup_id uuid references startups (id) on delete cascade,
  suggested_startup_id uuid references startups (id) on delete set null,
  suggestion_confidence numeric(4, 3) check (suggestion_confidence between 0 and 1),
  confirmed_by uuid references users (id),
  confirmed_at timestamptz,

  title text check (char_length(title) <= 300),
  body text,

  -- Storage path is keyed by evidence id, NOT by startup:
  --   cycles/{cycle_id}/items/{id}{ext}
  -- Attribution changes, and moving an object invalidates every signed URL and
  -- breaks the audit trail. Attribution lives in the row, never in the path.
  storage_path text check (char_length(storage_path) <= 500),
  mime_type text check (char_length(mime_type) <= 200),
  byte_size bigint check (byte_size >= 0),
  checksum_sha256 text check (char_length(checksum_sha256) = 64),

  source evidence_source not null default 'manual',
  -- Set when an AI split produced this section from a combined upload.
  parent_item_id uuid references evidence_items (id) on delete cascade,

  added_by uuid not null references users (id),
  created_at timestamptz not null default now(),

  -- Confirmation is what makes an item usable, so the two must arrive together.
  check ((confirmed_by is null) = (confirmed_at is null)),
  check (confirmed_at is null or startup_id is not null)
);

create index evidence_items_cycle_idx on evidence_items (cycle_id);
create index evidence_items_startup_idx
  on evidence_items (cycle_id, startup_id) where startup_id is not null;
-- The review queue: everything still awaiting a human's attribution.
create index evidence_items_unattributed_idx
  on evidence_items (cycle_id) where confirmed_at is null;

-- ---------------------------------------------------------------------------
-- A. Extraction
-- ---------------------------------------------------------------------------

create table extraction_runs (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  -- Which version of the 23-field contract, and which model produced it. Both
  -- are needed to reproduce or to explain a bad extraction after the fact.
  contract_version text not null,
  model text not null,
  prompt_version text,
  status extraction_run_status not null default 'queued',
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);

create index extraction_runs_startup_idx
  on extraction_runs (cycle_id, startup_id, created_at desc);

-- One row per contract field per run: 23 of them, present or not. A field that
-- is missing is a ROW saying it is missing, not an absent row — the difference
-- between "we looked and there was nothing" and "we never looked".
create table extracted_fields (
  id uuid primary key default gen_random_uuid(),
  extraction_run_id uuid not null references extraction_runs (id) on delete cascade,
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,

  field_path text not null check (char_length(field_path) <= 120),
  status evidence_field_status not null,

  -- What the model concluded, and what a person corrected it to. Separate
  -- columns, same rule as candidate_document_fields: the model's answer stays
  -- readable after a human overrules it, which is the only way to measure how
  -- often the model is wrong.
  resolved_value jsonb,
  corrected_value jsonb,
  review_state field_review_state not null default 'proposed',
  confirmed_by uuid references users (id),
  confirmed_at timestamptz,

  normalized_unit text check (char_length(normalized_unit) <= 60),
  period jsonb,

  unique (extraction_run_id, field_path),
  check ((confirmed_by is null) = (confirmed_at is null)),
  check (review_state <> 'corrected' or corrected_value is not null)
);

create index extracted_fields_startup_idx on extracted_fields (cycle_id, startup_id);
create index extracted_fields_path_idx on extracted_fields (extraction_run_id, field_path);

-- The citation trail. This is what makes "why did Acme get 60 hours?"
-- answerable down to a page and a table cell, rather than down to a number.
create table extracted_field_observations (
  id uuid primary key default gen_random_uuid(),
  extracted_field_id uuid not null references extracted_fields (id) on delete cascade,
  evidence_item_id uuid references evidence_items (id) on delete set null,
  format text check (char_length(format) <= 20),
  -- {type: 'page'|'cell'|'section', page, section, sheet, cell}
  locator jsonb,
  raw_representation text,
  observed_value jsonb,
  unit text check (char_length(unit) <= 60),
  period jsonb,
  qualifier text check (char_length(qualifier) <= 40),
  -- `conflicting` is why a field can be `conflicting` overall: two documents
  -- said different things and neither was silently preferred.
  relationship observation_relationship not null default 'primary'
);

create index extracted_field_observations_field_idx
  on extracted_field_observations (extracted_field_id);

-- ---------------------------------------------------------------------------
-- B. Ratings — where the score actually comes from
-- ---------------------------------------------------------------------------

create table startup_ratings (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  status rating_status not null default 'draft',
  rated_by uuid not null references users (id),
  -- A revision is a new row pointing back, never an edit. A rating that changed
  -- after a run was published must stay reconstructable.
  supersedes_id uuid references startup_ratings (id),
  revision_reason text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'submitted') = (submitted_at is not null))
);

-- One live submitted rating per startup per cycle.
create unique index startup_ratings_submitted_idx
  on startup_ratings (cycle_id, startup_id)
  where status = 'submitted';

create index startup_ratings_cycle_idx on startup_ratings (cycle_id, status);

create trigger startup_ratings_updated_at
  before update on startup_ratings
  for each row execute function set_updated_at();

create table startup_rating_items (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references startup_ratings (id) on delete cascade,
  dimension rating_key not null,
  -- The 0..4 anchored scale. Bounded here as well as in the engine, because a 7
  -- reaching the formula would silently inflate a funding decision.
  value smallint not null check (value between 0 and 4),
  -- Mandatory. A number without a reason is not reviewable, and reviewability
  -- is the entire claim this system makes.
  rationale text not null check (char_length(rationale) between 1 and 4000),
  unique (rating_id, dimension)
);

-- What the rater actually read. Optional per item, but a submitted rating with
-- no citations anywhere should be visibly flagged in review.
create table rating_citations (
  id uuid primary key default gen_random_uuid(),
  rating_item_id uuid not null references startup_rating_items (id) on delete cascade,
  extracted_field_id uuid references extracted_fields (id) on delete set null,
  evidence_item_id uuid references evidence_items (id) on delete set null,
  note text,
  -- A citation must point at something.
  check (extracted_field_id is not null or evidence_item_id is not null)
);

create index rating_citations_item_idx on rating_citations (rating_item_id);

-- ---------------------------------------------------------------------------
-- C. Policy and the run
-- ---------------------------------------------------------------------------

-- Immutable once a run has used it. Weights, thresholds, buckets, floors and
-- margins are QSTP decisions, and changing them must never retroactively change
-- what a stored run meant.
create table prioritisation_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  definition jsonb not null,
  allocation_mode allocation_mode not null default 'priority',
  active boolean not null default false,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);

create unique index prioritisation_policy_versions_active_idx
  on prioritisation_policy_versions ((true)) where active;

create table prioritisation_runs (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  version integer not null check (version >= 1),
  status prioritisation_run_status not null default 'draft',

  policy_version_id uuid references prioritisation_policy_versions (id),
  -- Frozen copies, not joins. Re-reading a six-month-old run must not silently
  -- show today's policy or today's platform history.
  policy_snapshot jsonb not null,
  history_snapshot jsonb,

  budget_hours integer not null check (budget_hours >= 0),
  maximum_qualified_hours integer not null default 0,
  proposed_hours integer not null default 0,
  residual_hours integer not null default 0,
  -- The engine's own verdict. Checked instead of re-summing the proposals,
  -- because a strategy can return a total that fits while still reporting a
  -- conflict with the requested distribution.
  within_budget boolean not null,

  allocation_mode allocation_mode not null default 'priority',
  allocation_strategy text not null,
  -- `partial_draft` means at least one startup never reached an outcome.
  -- Publishing one without saying so silently drops every un-rated startup.
  completeness prioritisation_run_completeness not null,

  signals jsonb not null default '[]',
  distribution jsonb,

  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references users (id),
  confirmed_at timestamptz,

  unique (cycle_id, version),
  check ((confirmed_by is null) = (confirmed_at is null))
);

create unique index prioritisation_runs_one_draft_idx
  on prioritisation_runs (cycle_id) where status = 'draft';

create unique index prioritisation_runs_one_confirmed_idx
  on prioritisation_runs (cycle_id) where status = 'confirmed';

-- One row per startup per run — INCLUDING the ones that were never scored.
--
-- `status` is the column that must never be collapsed. A startup blocked for
-- missing information and a startup scored at 12 both end up with zero hours,
-- and the difference between them is the whole point: one needs chasing, the
-- other needs nothing. Only `scored` rows may become allocations.
create table prioritisation_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references prioritisation_runs (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  rating_id uuid references startup_ratings (id),
  extraction_run_id uuid references extraction_runs (id),

  status startup_outcome_status not null,
  score numeric(5, 2) check (score between 0 and 100),
  breakdown jsonb,
  history_source text check (char_length(history_source) <= 40),

  rank integer check (rank >= 1),
  -- Startups on exactly the same score share a tie group and must receive
  -- identical hours. The engine asserts this; the column makes it visible.
  tie_group integer,
  requires_tie_resolution boolean not null default false,

  maximum_hours hour_tier,
  proposed_hours hour_tier,
  -- Set only when QSTP changes the proposal before confirming.
  adjusted_hours hour_tier,
  adjustment_reason text,

  waitlist_rank integer check (waitlist_rank >= 1),
  waitlist_order_status waitlist_order_status,
  waitlist_reason text check (char_length(waitlist_reason) <= 60),

  blockers jsonb not null default '[]',
  signals jsonb not null default '[]',
  adjustments jsonb not null default '[]',
  -- Per-position feasibility checks, so "why not_ready?" is answerable per role.
  position_checks jsonb not null default '[]',

  unique (run_id, startup_id),
  -- A scored startup has a score; an unscored one must not pretend to.
  check ((status = 'scored') = (score is not null)),
  check (adjusted_hours is null or adjustment_reason is not null)
);

create index prioritisation_results_run_idx on prioritisation_results (run_id, rank);
create index prioritisation_results_status_idx on prioritisation_results (run_id, status);
create index prioritisation_results_waitlist_idx
  on prioritisation_results (run_id, waitlist_rank) where waitlist_rank is not null;
