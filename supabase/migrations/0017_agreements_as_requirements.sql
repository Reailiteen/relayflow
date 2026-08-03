-- 0017 — agreements are signed on paper and re-uploaded, not by ticking a box
--
-- `placement_signatures` recorded that somebody opened a document and accepted
-- a declaration. What it never recorded was a signed document, because there
-- was none: the "agreement" was a paragraph of placeholder text and the
-- signature was a checkbox. It proved a click.
--
-- The replacement is the flow people already use for anything that matters:
-- QSTP issues the agreement, each party downloads it, signs it, and uploads the
-- signed copy back. That produces an artefact — a countersigned PDF, in
-- storage, with a revision history — which is the thing a dispute actually
-- needs and the thing a checkbox never was.
--
-- The machinery for it already exists. `placement_requirements` is a per-party
-- checklist, `requirement_submissions` keeps every revision, and 0014's storage
-- policies already say who may replace what. So an agreement becomes a
-- requirement, and nothing new is invented.
--
-- `placement_signatures` is left in place, readable, and stops being written.
-- Dropping it would erase the record of who accepted what under the old scheme;
-- those rows are few and historical, and deleting history to tidy up a schema
-- is how you lose the answer to a question nobody has asked yet.

-- ---------------------------------------------------------------------------
-- Agreements as requirements
-- ---------------------------------------------------------------------------

-- One template per party per cycle. `on conflict do nothing` so re-running is
-- safe and so a cycle that already has them is left alone.
insert into document_requirement_templates (cycle_id, title, owner, required, active)
select c.id, t.title, t.owner, true, true
from cycles c
cross join (values
  ('QSTP placement agreement', 'qstp'::requirement_owner),
  ('Startup placement agreement', 'startup'::requirement_owner),
  ('Candidate placement agreement', 'candidate'::requirement_owner)
) as t(title, owner)
where c.archived_at is null
  and not exists (
    select 1 from document_requirement_templates existing
    where existing.cycle_id = c.id and existing.title = t.title
  );

-- Backfill the live placements. A placement mid-onboarding must not suddenly
-- acquire three unmet requirements it was never told about — but it also must
-- not remain gated on a signature nobody can create any more, which is what
-- the readiness change below would otherwise do to it.
--
-- So: `awaiting_upload` where the party has not signed, and `approved` where
-- they had. An old signature is honoured as what it was — that party's
-- agreement, recorded — rather than silently discarded.
insert into placement_requirements (placement_id, template_id, title, owner, required, status)
select
  p.id,
  t.id,
  t.title,
  t.owner,
  true,
  case when exists (
    select 1 from placement_signatures s
    where s.placement_id = p.id
      and s.kind = (t.owner::text || '_agreement')::signature_kind
  ) then 'approved'::requirement_status
  else 'awaiting_upload'::requirement_status
  end
from placements p
join document_requirement_templates t
  on t.cycle_id = p.cycle_id
 and t.title in (
   'QSTP placement agreement',
   'Startup placement agreement',
   'Candidate placement agreement'
 )
where p.status <> 'cancelled'
  and not exists (
    select 1 from placement_requirements existing
    where existing.placement_id = p.id and existing.title = t.title
  );

-- ---------------------------------------------------------------------------
-- Stop writing signatures
-- ---------------------------------------------------------------------------
--
-- Read stays. Write goes. Nobody can create a new signature row through the
-- API, and the ones that exist remain visible to the parties who can see the
-- placement — which is what 0012 opened them up for.

drop policy if exists placement_signatures_insert on placement_signatures;

comment on table placement_signatures is
  'Historical. Superseded by agreement requirements in 0017 — a click is not a '
  'signed document. Read-only: there is no insert policy.';

-- ---------------------------------------------------------------------------
-- A countersigned upload is a new revision
-- ---------------------------------------------------------------------------

/**
 * Approve a submitted requirement, or send it back.
 *
 * `submit_requirement` already handles the upload half — including the revision
 * numbering that makes "download, sign, upload again" work without any new
 * concept. This is the other party's answer to it.
 *
 * Separate from the generic requirement decide path because an agreement has a
 * counterparty rather than a reviewer: the startup approves what the candidate
 * signed, not QSTP alone. The guard says so.
 */
create or replace function decide_requirement(
  p_requirement_id uuid,
  p_decision requirement_status,
  p_reason text default null
) returns placement_requirements
language plpgsql security definer
set search_path = public
as $$
declare
  v_requirement placement_requirements;
  v_placement placements;
begin
  select * into v_requirement from placement_requirements
  where id = p_requirement_id for update;
  if not found then raise exception 'requirement not found' using errcode = 'no_data_found'; end if;

  select * into v_placement from placements where id = v_requirement.placement_id;

  -- QSTP decides anything. A startup decides the requirements it owns, so it
  -- can accept a candidate's countersigned copy of its own agreement without
  -- QSTP standing in the middle of every placement.
  if not (is_qstp() or is_startup_member(v_placement.startup_id)) then
    raise exception 'not yours to decide' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'correction_requested', 'rejected', 'expired', 'waived') then
    raise exception 'that is not a decision' using errcode = 'check_violation';
  end if;

  -- Sending something back without saying what is wrong leaves the other party
  -- with nothing to act on, which is how a placement stalls for a week.
  if p_decision in ('correction_requested', 'rejected')
     and (p_reason is null or char_length(trim(p_reason)) = 0) then
    raise exception 'say what needs fixing' using errcode = 'check_violation';
  end if;

  update placement_requirements
  set status = p_decision,
      amendment_reason = coalesce(p_reason, amendment_reason)
  where id = p_requirement_id returning * into v_requirement;

  perform log_activity(v_placement.cycle_id, 'placement_requirement', p_requirement_id,
    p_decision::text, actor_role_of(auth.uid()),
    null, to_jsonb(v_requirement), p_reason);

  return v_requirement;
end;
$$;

grant execute on function decide_requirement(uuid, requirement_status, text) to authenticated;
