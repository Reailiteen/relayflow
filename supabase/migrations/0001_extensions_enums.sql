-- 0001 — extensions, shared types, and the enum vocabulary
--
-- Every status set in packages/entities is a Postgres enum here rather than a
-- text column with a CHECK. Two reasons: an enum that gains a value is a
-- migration somebody reviews, and a typo in a status string fails at write time
-- instead of quietly creating a row nothing will ever match.
--
-- The names mirror the TypeScript unions exactly. Where the domain names a
-- concept, the database uses the same word.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Hours
-- ---------------------------------------------------------------------------

-- Deliberately a closed set, not a free integer. The programme runs on agreed
-- bands, and an arbitrary 37 would mean somebody bypassed the evaluation.
create domain hour_tier as integer
  check (value in (60, 40, 30, 20, 0));

-- ---------------------------------------------------------------------------
-- Identity and membership
-- ---------------------------------------------------------------------------

create type startup_role as enum ('owner', 'member', 'supervisor');
create type member_status as enum ('invited', 'active', 'suspended');
create type qstp_role as enum ('program_manager', 'operations', 'viewer');

-- ---------------------------------------------------------------------------
-- Cycle and allocation
-- ---------------------------------------------------------------------------

-- Ordered. `advance_cycle_stage` walks this list, so the declaration order is
-- load-bearing, not cosmetic.
create type cycle_stage as enum (
  'draft', 'allocation', 'positions', 'selection', 'completion', 'closed'
);

create type selection_mode as enum ('first_come', 'candidate_choice');

create type participation_status as enum (
  'invited', 'accepted', 'declined', 'suspended', 'archived'
);

create type allocation_status as enum (
  'draft', 'confirmed', 'declined', 'forfeited', 'superseded'
);

-- ---------------------------------------------------------------------------
-- Positions
-- ---------------------------------------------------------------------------

create type position_status as enum (
  'draft', 'submitted', 'under_review', 'changes_requested', 'resubmitted',
  'approved', 'locked', 'filled', 'closed', 'withdrawn'
);

create type work_arrangement as enum ('onsite', 'hybrid', 'remote');

-- ---------------------------------------------------------------------------
-- Candidates, pools, interviews, tasks
-- ---------------------------------------------------------------------------

create type availability_status as enum (
  'unconfirmed', 'available', 'employed', 'not_interested',
  'temporarily_unavailable', 'placed'
);

create type candidate_source as enum ('deema', 'csv', 'manual');

create type pool_entry_status as enum (
  'pending', 'shortlisted', 'interview_requested', 'interviewed', 'interested',
  'selected', 'rejected', 'withdrawn', 'lost'
);

create type interview_mode as enum ('online', 'in_person');

create type interview_status as enum (
  'requested', 'confirmed', 'scheduled', 'completed', 'cancelled', 'no_show'
);

create type transcript_status as enum ('none', 'processing', 'ready', 'failed');

create type interview_recommendation as enum ('advance', 'reject', 'undecided');

create type task_assignment_status as enum (
  'assigned', 'submitted', 'reviewed', 'withdrawn'
);

-- ---------------------------------------------------------------------------
-- Selection
-- ---------------------------------------------------------------------------

create type selection_status as enum (
  'offered', 'reserved', 'accepted', 'confirmed', 'declined', 'released',
  'lost', 'cancelled'
);

create type selection_conflict_status as enum ('open', 'dismissed', 'overridden');

create type fallback_case_status as enum ('open', 'accepted', 'exhausted', 'overridden');

create type exception_kind as enum ('position_submission', 'candidate_selection');
create type exception_status as enum ('pending', 'approved', 'rejected', 'expired');

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------

create type placement_status as enum (
  'confirmed', 'ready_to_start', 'onboarded', 'cancelled'
);

create type requirement_owner as enum ('candidate', 'startup', 'qstp');

create type requirement_status as enum (
  'requested', 'awaiting_upload', 'uploaded', 'under_review',
  'correction_requested', 'resubmitted', 'approved', 'rejected',
  'expired', 'waived'
);

create type signature_kind as enum ('qstp_agreement', 'startup_agreement');

create type document_kind as enum (
  'national_id', 'passport', 'bank_statement', 'qstp_contract',
  'startup_nda', 'other'
);

create type document_status as enum (
  'requested', 'uploaded', 'extracting', 'awaiting_candidate_review',
  'submitted', 'verified', 'rejected'
);

-- ---------------------------------------------------------------------------
-- Recovery and redistribution
-- ---------------------------------------------------------------------------

create type recovery_status as enum (
  'potential', 'exception_protected', 'confirmed', 'recovered',
  'replacement_protected', 'closed'
);

create type redistribution_status as enum (
  'draft', 'invitations', 'accelerated_positions', 'accelerated_selection',
  'closed', 'cancelled'
);

create type redistribution_invitation_status as enum (
  'invited', 'accepted', 'declined', 'expired'
);

-- ---------------------------------------------------------------------------
-- Prioritisation: evidence intake and extraction
-- ---------------------------------------------------------------------------

create type evidence_kind as enum ('note', 'document', 'extracted_section');
create type evidence_source as enum ('manual', 'upload', 'ai_split');

create type extraction_run_status as enum ('queued', 'running', 'succeeded', 'failed');

-- Mirrors the extraction contract. Only `supported` is usable by the engine;
-- the rest exist so a reviewer sees *why* a field could not be used rather than
-- finding a silent zero.
create type evidence_field_status as enum (
  'supported', 'missing', 'conflicting', 'stale', 'not_applicable'
);

-- The model proposes; a person confirms or corrects. Never merged into one
-- column — see candidate_documents for the same pattern applied to OCR.
create type field_review_state as enum ('proposed', 'confirmed', 'corrected');

create type observation_relationship as enum ('primary', 'corroborating', 'conflicting');

-- ---------------------------------------------------------------------------
-- Prioritisation: rating and run
-- ---------------------------------------------------------------------------

create type rating_status as enum ('draft', 'submitted', 'superseded');

-- The six QSTP judgements. Ninety of the hundred score points.
create type rating_key as enum (
  'progress_against_stage', 'traction_strength', 'value_to_startup',
  'value_to_intern', 'qstp_qatar_alignment', 'research_ecosystem_contribution'
);

create type prioritisation_run_status as enum ('draft', 'confirmed', 'superseded');

create type prioritisation_run_completeness as enum ('complete_draft', 'partial_draft');

create type allocation_mode as enum ('priority', 'broad', 'distribution');

-- The distinction this whole column exists to preserve: a startup blocked for
-- missing information and a startup scored at 12 both end up with zero hours,
-- and only one of them needs chasing.
create type startup_outcome_status as enum (
  'scored', 'needs_information', 'awaiting_manual_scores', 'not_ready', 'not_fundable'
);

create type waitlist_order_status as enum ('resolved_by_score', 'tied_requires_qstp_resolution');

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create type activity_actor_role as enum (
  'program_manager', 'operations', 'viewer', 'owner', 'member', 'supervisor',
  'candidate', 'system'
);

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

-- Clients lie about time. `updated_at` is maintained here so it means "when the
-- database accepted this write" rather than "what the caller claimed".
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
