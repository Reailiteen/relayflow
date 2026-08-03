-- 0014 — object storage for the two kinds of file this programme handles
--
-- Until now `storage_path` was a string the fixtures interpolated and nothing
-- ever read. These are the buckets it points into.
--
-- Both are private. `public = true` on a bucket holding Qatari national IDs and
-- IBANs would make every object readable by anyone who guesses a uuid, and no
-- amount of care elsewhere would matter after that.
--
-- The path is the authorization. Every policy below decides by reading an id
-- out of the object's own folder name, which is why the application computes
-- paths from ids it already holds (`documentStoragePath` in
-- @relayflow/entities) and never from anything the browser sends. A client that
-- could choose its folder could choose whose folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'candidate-documents',
    'candidate-documents',
    false,
    10485760, -- 10 MB: a phone photo of an ID, not a video of one
    array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']
  ),
  (
    'requirement-submissions',
    'requirement-submissions',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- candidate-documents — candidates/{candidateId}/{documentId}/{fileName}
-- ---------------------------------------------------------------------------
--
-- `(storage.foldername(name))[2]` is the candidate id. The helpers it is
-- compared against — `owns_candidate`, `is_qstp` — are the same SECURITY
-- DEFINER functions the table policies in 0009 use, so a candidate's reach into
-- storage and their reach into the database are decided by one definition.

drop policy if exists candidate_documents_own_read on storage.objects;
create policy candidate_documents_own_read on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-documents'
    and owns_candidate(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists candidate_documents_own_insert on storage.objects;
create policy candidate_documents_own_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-documents'
    and owns_candidate(((storage.foldername(name))[2])::uuid)
  );

-- Update as well as insert, because a rejected document is re-uploaded to the
-- same path. Without this, "fix the photo and send it again" would need a new
-- filename every time and the storage layer would accumulate every failed
-- attempt of everyone's passport.
drop policy if exists candidate_documents_own_update on storage.objects;
create policy candidate_documents_own_update on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-documents'
    and owns_candidate(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'candidate-documents'
    and owns_candidate(((storage.foldername(name))[2])::uuid)
  );

-- QSTP verifies, so QSTP reads. There is deliberately no insert or update for
-- staff: nobody uploads a candidate's identity document on their behalf, and a
-- policy permitting it would be the shortest path to a document with no
-- accountable owner.
drop policy if exists candidate_documents_qstp_read on storage.objects;
create policy candidate_documents_qstp_read on storage.objects for select to authenticated
  using (bucket_id = 'candidate-documents' and is_qstp());

-- Startups get NO POLICY on this bucket at all, and that absence is the design.
-- Default-deny does the work: a startup can see from `candidate_documents` that
-- its intern has finished their paperwork, and can never see what is in it.
-- Expressing that as a missing policy rather than a clever predicate means
-- there is nothing to get subtly wrong later.

-- ---------------------------------------------------------------------------
-- requirement-submissions — requirements/{requirementId}/{fileName}
-- ---------------------------------------------------------------------------
--
-- `(storage.foldername(name))[2]` is the requirement id. The revision is NOT in
-- the path: `submit_requirement` computes it from what is already stored, so a
-- caller cannot know it when the signed URL is minted. `requirement_submissions`
-- keeps every revision as a row regardless, which is what a dispute actually
-- needs — the object store holds the current file, the table holds the history.

drop policy if exists requirement_submissions_read on storage.objects;
create policy requirement_submissions_read on storage.objects for select to authenticated
  using (
    bucket_id = 'requirement-submissions'
    and (
      is_qstp()
      or exists (
        select 1
        from placement_requirements r
        join placements p on p.id = r.placement_id
        where r.id = ((storage.foldername(name))[2])::uuid
          and (
            owns_candidate(p.candidate_id)
            -- Asymmetric on purpose: a startup opens the agreement it signed,
            -- and not the bank form its intern uploaded.
            or (is_startup_member(p.startup_id) and r.owner <> 'candidate')
          )
      )
    )
  );

-- Whoever owns the requirement is whoever may satisfy it — the same rule
-- `submit_requirement` enforces on the row, said again about the file.
drop policy if exists requirement_submissions_write on storage.objects;
create policy requirement_submissions_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'requirement-submissions'
    and exists (
      select 1
      from placement_requirements r
      join placements p on p.id = r.placement_id
      where r.id = ((storage.foldername(name))[2])::uuid
        and p.status <> 'cancelled'
        and (
          (r.owner = 'candidate' and owns_candidate(p.candidate_id))
          or (r.owner = 'startup' and is_startup_member(p.startup_id))
          or (r.owner = 'qstp' and is_qstp())
        )
    )
  );

-- A countersigned agreement replaces the unsigned one at the same path, which
-- is the whole re-upload flow.
drop policy if exists requirement_submissions_update on storage.objects;
create policy requirement_submissions_update on storage.objects for update to authenticated
  using (
    bucket_id = 'requirement-submissions'
    and exists (
      select 1
      from placement_requirements r
      join placements p on p.id = r.placement_id
      where r.id = ((storage.foldername(name))[2])::uuid
        and p.status <> 'cancelled'
        and (
          (r.owner = 'candidate' and owns_candidate(p.candidate_id))
          or (r.owner = 'startup' and is_startup_member(p.startup_id))
          or (r.owner = 'qstp' and is_qstp())
        )
    )
  )
  with check (bucket_id = 'requirement-submissions');

-- Nothing may be deleted from either bucket by anyone. A verified national ID
-- that vanishes takes the evidence for a placement decision with it, and the
-- retention question — how long these are kept, and who removes them — is a
-- programme policy to be answered deliberately, not a DELETE grant.
