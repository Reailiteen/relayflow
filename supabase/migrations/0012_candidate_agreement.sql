-- 0012 — the candidate signs their own placement agreement
--
-- `signature_kind` had two values, so the only party who could not sign the
-- agreement fixing their hours, dates and supervisor was the person doing the
-- work. This adds the third value and opens the read side enough that each
-- party can see whether the other two have signed — without that, "waiting on
-- someone else" and "waiting on me" look identical.

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------

-- Postgres forbids *using* a new enum value in the transaction that adds it, so
-- nothing below may reference 'candidate_agreement' as a literal. The policies
-- in this file are written over `placement_id` and never over `kind`, which is
-- what keeps that true.
alter type signature_kind add value if not exists 'candidate_agreement';

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------

-- The old policy was `is_qstp() or signer_id = auth.uid()`: a candidate could
-- see only the row they had signed themselves, which made the signature count
-- on their own placement unreadable. Scope by placement instead, matching
-- `placements_select` and `placement_requirements_select`.
--
-- Signature rows carry no document body and no personal data beyond a name the
-- other parties already know, so party-wide visibility leaks nothing that
-- `placements_select` did not already grant.
drop policy if exists placement_signatures_select on placement_signatures;
create policy placement_signatures_select on placement_signatures for select to authenticated
  using (
    is_qstp() or exists (
      select 1 from placements p
      where p.id = placement_id
        and (is_startup_member(p.startup_id) or owns_candidate(p.candidate_id))
    )
  );

-- Insert stays first-person — you may only ever create your own signature —
-- but the signer must also be a party to this particular placement. Without the
-- placement check, `signer_id = auth.uid()` alone let any authenticated user
-- sign any placement.
drop policy if exists placement_signatures_insert on placement_signatures;
create policy placement_signatures_insert on placement_signatures for insert to authenticated
  with check (
    signer_id = auth.uid()
    and exists (
      select 1 from placements p
      where p.id = placement_id
        and p.status <> 'cancelled'
        and (is_qstp() or is_startup_member(p.startup_id) or owns_candidate(p.candidate_id))
    )
  );
