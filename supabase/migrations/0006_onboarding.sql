-- 0006 — placements, document requirements, and signatures
--
-- Everything after "the startup picked someone". The theme running through this
-- file is that extraction assists and a person decides: wherever a model reads
-- a value, the model's reading and the human's confirmation are separate
-- columns, and the first is never overwritten by the second.

create table placements (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  selection_id uuid not null unique references selections (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  startup_id uuid not null references startups (id) on delete cascade,
  position_id uuid not null references positions (id) on delete cascade,

  -- What this placement actually consumes from the allocation, as distinct from
  -- what the startup was promised. The gap between the two is the number the
  -- redistribution round is built on.
  committed_weekly_hours integer not null check (committed_weekly_hours >= 0),
  starts_on date not null,
  ends_on date not null,

  supervisor_id uuid references users (id),
  supervisor_name text not null,
  status placement_status not null default 'confirmed',

  -- Four independent readiness gates. Kept as separate timestamps rather than
  -- one status because they are completed by different parties and stall
  -- independently — which is precisely what the chase-list needs to show.
  candidate_ready_at timestamptz,
  startup_ready_at timestamptz,
  details_finalized_at timestamptz,
  qstp_approved_at timestamptz,

  cancelled_at timestamptz,
  cancellation_reason text,
  replacement_for_placement_id uuid references placements (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on < ends_on)
);

create index placements_cycle_idx on placements (cycle_id, status);
create index placements_candidate_idx on placements (candidate_id);
create index placements_startup_idx on placements (startup_id);

create trigger placements_updated_at
  before update on placements
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Document requirements
-- ---------------------------------------------------------------------------

create table document_requirement_templates (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  owner requirement_owner not null,
  required boolean not null default true,
  -- Null means "every placement". Set means a requirement specific to one role.
  position_id uuid references positions (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_requirement_templates_cycle_idx
  on document_requirement_templates (cycle_id) where active;

create trigger document_requirement_templates_updated_at
  before update on document_requirement_templates
  for each row execute function set_updated_at();

-- A snapshot, not a view over the templates. A checklist that changed under an
-- in-progress placement would move the goalposts on somebody mid-onboarding.
create table placement_requirements (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements (id) on delete cascade,
  template_id uuid references document_requirement_templates (id) on delete set null,
  title text not null,
  owner requirement_owner not null,
  required boolean not null default true,
  status requirement_status not null default 'requested',
  amendment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index placement_requirements_placement_idx
  on placement_requirements (placement_id, status);

create trigger placement_requirements_updated_at
  before update on placement_requirements
  for each row execute function set_updated_at();

create table requirement_submissions (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references placement_requirements (id) on delete cascade,
  -- Corrections are new revisions. Overwriting would erase the evidence of what
  -- was originally submitted, which is the one thing a dispute needs.
  revision integer not null check (revision >= 1),
  file_name text not null,
  storage_path text not null,
  submitted_by uuid not null references users (id),
  submitted_at timestamptz not null default now(),
  correction_reason text,
  unique (requirement_id, revision)
);

-- Extracted values live in their own table, not a jsonb blob on the submission.
-- These are identity and bank details: they deserve their own policy, their own
-- audit, and the ability to be dropped without touching the parent row.
create table requirement_submission_fields (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references requirement_submissions (id) on delete cascade,
  key text not null check (char_length(key) <= 60),
  label text check (char_length(label) <= 120),
  -- What the model read. Never overwritten.
  extracted text check (char_length(extracted) <= 500),
  -- What a person confirmed. Null until they have.
  confirmed text check (char_length(confirmed) <= 500),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  unique (submission_id, key)
);

create table placement_signatures (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements (id) on delete cascade,
  kind signature_kind not null,
  signer_id uuid not null references users (id),
  signer_name text not null,
  declaration_accepted boolean not null,
  -- Recorded so "they never actually opened it" is answerable.
  document_opened_at timestamptz not null,
  signed_at timestamptz not null default now(),
  unique (placement_id, kind)
);

-- ---------------------------------------------------------------------------
-- Candidate documents
-- ---------------------------------------------------------------------------

create table candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  -- Set for startup-specific paperwork such as an NDA; null for QSTP's own.
  startup_id uuid references startups (id) on delete cascade,
  kind document_kind not null,
  status document_status not null default 'requested',
  file_name text check (char_length(file_name) <= 300),
  storage_path text check (char_length(storage_path) <= 500),
  rejection_reason text,
  verified_by uuid references users (id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidate_documents_candidate_idx on candidate_documents (candidate_id, status);
create index candidate_documents_startup_idx
  on candidate_documents (startup_id) where startup_id is not null;

create trigger candidate_documents_updated_at
  before update on candidate_documents
  for each row execute function set_updated_at();

-- Same separation as requirement_submission_fields, and for the same reason:
-- this is where a national ID number and a bank account live.
create table candidate_document_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references candidate_documents (id) on delete cascade,
  key text not null check (char_length(key) <= 60),
  label text check (char_length(label) <= 120),
  extracted text check (char_length(extracted) <= 500),
  confirmed text check (char_length(confirmed) <= 500),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  unique (document_id, key)
);
