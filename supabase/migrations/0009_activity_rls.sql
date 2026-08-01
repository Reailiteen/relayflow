-- 0009 — the audit log, and row-level security on every table
--
-- RLS is the backstop, not the primary control. @relayflow/access produces good
-- errors and drives which buttons render; RLS holds when a query is written
-- carelessly, a new endpoint forgets a filter, or an anon key leaks.
--
-- Default deny: every table gets ENABLE and FORCE, and each permitted action is
-- named explicitly. A table with RLS on and no policy is readable by nobody,
-- which is the correct failure direction.

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  -- Deliberately untyped: this table outlives any single entity's schema, and a
  -- foreign key here would mean deleting a position erases the record of who
  -- rejected it.
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references users (id),
  actor_role activity_actor_role not null,
  before jsonb,
  after jsonb,
  reason text,
  occurred_at timestamptz not null default now()
);

create index activity_events_cycle_idx on activity_events (cycle_id, occurred_at desc);
create index activity_events_entity_idx on activity_events (entity_type, entity_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Policy helpers
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER because a policy on startup_members that queries
-- startup_members recurses infinitely. Kept deliberately narrow: each answers
-- one yes/no question and none of them can be used to read rows.

create or replace function is_qstp()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from qstp_staff where user_id = auth.uid());
$$;

create or replace function has_qstp_role(variadic roles qstp_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from qstp_staff where user_id = auth.uid() and role = any (roles)
  );
$$;

/** Active membership only. A suspended founder keeps their row and loses access. */
create or replace function is_startup_member(target_startup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from startup_members
    where user_id = auth.uid()
      and startup_id = target_startup_id
      and status = 'active'
  );
$$;

create or replace function owns_candidate(target_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from candidates where id = target_candidate_id and user_id = auth.uid()
  );
$$;

/** The startup a position belongs to — used to scope pools and interviews. */
create or replace function is_member_of_position_startup(target_position_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from positions p
    join startup_members m on m.startup_id = p.startup_id
    where p.id = target_position_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

/** A startup may see a candidate only through a pool entry it was given. */
create or replace function candidate_shared_with_my_startup(target_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from pool_entries e
    join positions p on p.id = e.position_id
    join startup_members m on m.startup_id = p.startup_id
    where e.candidate_id = target_candidate_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable + force everywhere
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'qstp_staff', 'startups', 'startup_members',
    'cycles', 'cycle_participations', 'allocations',
    'position_intents', 'positions', 'position_review_history',
    'candidates', 'pool_entries', 'interviews', 'task_templates', 'task_assignments',
    'selections', 'selection_conflicts', 'candidate_choice_fallbacks', 'fallback_offers',
    'exception_requests',
    'placements', 'document_requirement_templates', 'placement_requirements',
    'requirement_submissions', 'requirement_submission_fields', 'placement_signatures',
    'candidate_documents', 'candidate_document_fields',
    'recovery_cases', 'redistribution_rounds', 'redistribution_invitations',
    'evidence_items', 'extraction_runs', 'extracted_fields', 'extracted_field_observations',
    'startup_ratings', 'startup_rating_items', 'rating_citations',
    'prioritisation_policy_versions', 'prioritisation_runs', 'prioritisation_results',
    'activity_events'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create policy users_select on users for select to authenticated
  using (id = auth.uid() or is_qstp());
create policy users_update_self on users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Read-only through the API. Granting programme-wide authority is an
-- out-of-band act, not something a request can do.
create policy qstp_staff_select on qstp_staff for select to authenticated
  using (is_qstp());

create policy startups_select on startups for select to authenticated
  using (is_qstp() or is_startup_member(id));
create policy startups_write on startups for all to authenticated
  using (has_qstp_role('program_manager')) with check (has_qstp_role('program_manager'));

create policy startup_members_select on startup_members for select to authenticated
  using (is_qstp() or is_startup_member(startup_id));
create policy startup_members_write on startup_members for all to authenticated
  using (has_qstp_role('program_manager')) with check (has_qstp_role('program_manager'));

-- ---------------------------------------------------------------------------
-- Cycle
-- ---------------------------------------------------------------------------

-- Every portal needs to know what cycle it is in and when things are due.
create policy cycles_select on cycles for select to authenticated using (true);
create policy cycles_write on cycles for all to authenticated
  using (has_qstp_role('program_manager')) with check (has_qstp_role('program_manager'));

-- Note: `internal_notes` and `operator_score` are QSTP-only columns on a row a
-- startup may read. Column-level redaction stays in the use-case layer, which
-- already strips them; RLS scopes the row.
create policy cycle_participations_select on cycle_participations for select to authenticated
  using (is_qstp() or is_startup_member(startup_id));
create policy cycle_participations_write on cycle_participations for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy allocations_select on allocations for select to authenticated
  using (is_qstp() or is_startup_member(startup_id));
create policy allocations_write on allocations for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

-- ---------------------------------------------------------------------------
-- Positions
-- ---------------------------------------------------------------------------

create policy position_intents_select on position_intents for select to authenticated
  using (is_qstp() or is_startup_member(startup_id));
create policy position_intents_write on position_intents for all to authenticated
  using (is_startup_member(startup_id) or has_qstp_role('program_manager', 'operations'))
  with check (is_startup_member(startup_id) or has_qstp_role('program_manager', 'operations'));

create policy positions_select on positions for select to authenticated
  using (is_qstp() or is_startup_member(startup_id));
create policy positions_write on positions for all to authenticated
  using (is_startup_member(startup_id) or has_qstp_role('program_manager', 'operations'))
  with check (is_startup_member(startup_id) or has_qstp_role('program_manager', 'operations'));

create policy position_review_history_select on position_review_history for select to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id));
create policy position_review_history_insert on position_review_history for insert to authenticated
  with check (is_qstp() or is_member_of_position_startup(position_id));

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------

create policy candidates_select on candidates for select to authenticated
  using (is_qstp() or user_id = auth.uid() or candidate_shared_with_my_startup(id));
create policy candidates_update_self on candidates for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy candidates_write on candidates for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy pool_entries_select on pool_entries for select to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id) or owns_candidate(candidate_id));
create policy pool_entries_write on pool_entries for all to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id))
  with check (is_qstp() or is_member_of_position_startup(position_id));

create policy interviews_select on interviews for select to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id) or owns_candidate(candidate_id));
create policy interviews_write on interviews for all to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id))
  with check (is_qstp() or is_member_of_position_startup(position_id));

create policy task_templates_select on task_templates for select to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id));
create policy task_templates_write on task_templates for all to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id))
  with check (is_qstp() or is_member_of_position_startup(position_id));

create policy task_assignments_select on task_assignments for select to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id) or owns_candidate(candidate_id));
create policy task_assignments_update on task_assignments for update to authenticated
  using (is_qstp() or is_member_of_position_startup(position_id) or owns_candidate(candidate_id))
  with check (is_qstp() or is_member_of_position_startup(position_id) or owns_candidate(candidate_id));
create policy task_assignments_insert on task_assignments for insert to authenticated
  with check (is_qstp() or is_member_of_position_startup(position_id));

-- ---------------------------------------------------------------------------
-- Selection
-- ---------------------------------------------------------------------------

create policy selections_select on selections for select to authenticated
  using (is_qstp() or is_startup_member(startup_id) or owns_candidate(candidate_id));
-- Writes go through RPCs (0010) so the one-live-selection index is checked
-- inside the same transaction as the read that justified it.
create policy selections_write on selections for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

-- Comparative and internal. A startup must not learn who else wanted the same
-- candidate.
create policy selection_conflicts_qstp on selection_conflicts for all to authenticated
  using (is_qstp()) with check (has_qstp_role('program_manager', 'operations'));

create policy fallbacks_select on candidate_choice_fallbacks for select to authenticated
  using (is_qstp() or owns_candidate(candidate_id));
create policy fallbacks_write on candidate_choice_fallbacks for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy fallback_offers_select on fallback_offers for select to authenticated
  using (
    is_qstp() or exists (
      select 1 from candidate_choice_fallbacks c
      where c.id = fallback_case_id and owns_candidate(c.candidate_id)
    )
  );
create policy fallback_offers_write on fallback_offers for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy exception_requests_select on exception_requests for select to authenticated
  using (is_qstp() or is_startup_member(startup_id));
create policy exception_requests_insert on exception_requests for insert to authenticated
  with check (is_startup_member(startup_id) or is_qstp());
create policy exception_requests_update on exception_requests for update to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------

create policy placements_select on placements for select to authenticated
  using (is_qstp() or is_startup_member(startup_id) or owns_candidate(candidate_id));
create policy placements_write on placements for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy requirement_templates_select on document_requirement_templates
  for select to authenticated using (true);
create policy requirement_templates_write on document_requirement_templates
  for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy placement_requirements_select on placement_requirements for select to authenticated
  using (
    is_qstp() or exists (
      select 1 from placements p
      where p.id = placement_id
        and (is_startup_member(p.startup_id) or owns_candidate(p.candidate_id))
    )
  );
create policy placement_requirements_write on placement_requirements for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy requirement_submissions_select on requirement_submissions for select to authenticated
  using (
    is_qstp() or exists (
      select 1 from placement_requirements r
      join placements p on p.id = r.placement_id
      where r.id = requirement_id
        and (is_startup_member(p.startup_id) or owns_candidate(p.candidate_id))
    )
  );
create policy requirement_submissions_insert on requirement_submissions for insert to authenticated
  with check (submitted_by = auth.uid() or is_qstp());

-- Identity and bank details. QSTP verifies; the submitting party may re-read
-- their own. Nobody else, ever.
create policy requirement_submission_fields_select on requirement_submission_fields
  for select to authenticated
  using (
    is_qstp() or exists (
      select 1 from requirement_submissions s
      where s.id = submission_id and s.submitted_by = auth.uid()
    )
  );
create policy requirement_submission_fields_write on requirement_submission_fields
  for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy placement_signatures_select on placement_signatures for select to authenticated
  using (is_qstp() or signer_id = auth.uid());
create policy placement_signatures_insert on placement_signatures for insert to authenticated
  with check (signer_id = auth.uid());

create policy candidate_documents_select on candidate_documents for select to authenticated
  using (
    is_qstp()
    or owns_candidate(candidate_id)
    -- A startup sees only its own paperwork (an NDA it issued), never a
    -- candidate's national ID or bank statement.
    or (startup_id is not null and is_startup_member(startup_id))
  );
create policy candidate_documents_insert on candidate_documents for insert to authenticated
  with check (is_qstp() or owns_candidate(candidate_id));
create policy candidate_documents_update on candidate_documents for update to authenticated
  using (is_qstp() or owns_candidate(candidate_id))
  with check (is_qstp() or owns_candidate(candidate_id));

create policy candidate_document_fields_select on candidate_document_fields
  for select to authenticated
  using (
    is_qstp() or exists (
      select 1 from candidate_documents d
      where d.id = document_id and owns_candidate(d.candidate_id)
    )
  );
create policy candidate_document_fields_write on candidate_document_fields
  for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

-- ---------------------------------------------------------------------------
-- Recovery and redistribution
-- ---------------------------------------------------------------------------

create policy recovery_cases_qstp on recovery_cases for all to authenticated
  using (is_qstp()) with check (has_qstp_role('program_manager', 'operations'));

create policy redistribution_rounds_select on redistribution_rounds for select to authenticated
  using (is_qstp());
create policy redistribution_rounds_write on redistribution_rounds for all to authenticated
  using (has_qstp_role('program_manager'))
  with check (has_qstp_role('program_manager'));

-- An invited startup sees its own invitation and nobody else's — the offer
-- order across a tied waitlist group is not something to leak.
create policy redistribution_invitations_select on redistribution_invitations
  for select to authenticated
  using (is_qstp() or is_startup_member(startup_id));
create policy redistribution_invitations_update on redistribution_invitations
  for update to authenticated
  using (is_qstp() or is_startup_member(startup_id))
  with check (is_qstp() or is_startup_member(startup_id));
create policy redistribution_invitations_insert on redistribution_invitations
  for insert to authenticated
  with check (has_qstp_role('program_manager'));

-- ---------------------------------------------------------------------------
-- Prioritisation — QSTP only, all of it
-- ---------------------------------------------------------------------------
--
-- Evidence, extractions, ratings and runs are internal assessment material and
-- comparative by nature. A startup learning its own rating learns its position
-- relative to its peers, which is not QSTP's to disclose as a side effect of a
-- query. `report:read` viewers can see it; nobody outside QSTP can.

create policy evidence_items_select on evidence_items for select to authenticated
  using (is_qstp());
create policy evidence_items_write on evidence_items for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy extraction_runs_select on extraction_runs for select to authenticated
  using (is_qstp());
create policy extraction_runs_write on extraction_runs for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy extracted_fields_select on extracted_fields for select to authenticated
  using (is_qstp());
create policy extracted_fields_write on extracted_fields for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy extracted_field_observations_select on extracted_field_observations
  for select to authenticated using (is_qstp());
create policy extracted_field_observations_write on extracted_field_observations
  for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy startup_ratings_select on startup_ratings for select to authenticated
  using (is_qstp());
create policy startup_ratings_write on startup_ratings for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy startup_rating_items_select on startup_rating_items for select to authenticated
  using (is_qstp());
create policy startup_rating_items_write on startup_rating_items for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy rating_citations_select on rating_citations for select to authenticated
  using (is_qstp());
create policy rating_citations_write on rating_citations for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy policy_versions_select on prioritisation_policy_versions
  for select to authenticated using (is_qstp());
create policy policy_versions_write on prioritisation_policy_versions
  for all to authenticated
  using (has_qstp_role('program_manager')) with check (has_qstp_role('program_manager'));

create policy prioritisation_runs_select on prioritisation_runs for select to authenticated
  using (is_qstp());
create policy prioritisation_runs_write on prioritisation_runs for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

create policy prioritisation_results_select on prioritisation_results for select to authenticated
  using (is_qstp());
create policy prioritisation_results_write on prioritisation_results for all to authenticated
  using (has_qstp_role('program_manager', 'operations'))
  with check (has_qstp_role('program_manager', 'operations'));

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

-- Append-only by construction: there is no update or delete policy, so the log
-- cannot be rewritten even by a program manager.
create policy activity_events_select on activity_events for select to authenticated
  using (is_qstp());
create policy activity_events_insert on activity_events for insert to authenticated
  with check (is_qstp());
