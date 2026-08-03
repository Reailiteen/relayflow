-- Storage policies.
--
-- These decide by reading an id out of an object's folder name, which makes
-- them unusually easy to get subtly wrong: an off-by-one in the array index
-- silently compares the wrong segment and every check still "passes" for the
-- happy path. So each block below writes as one party and reads as another.
--
-- Runs after 03, and reuses the placement and candidates it left behind.

\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

begin;

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- 03 cancelled Layla's placement in order to test redistribution, and a
-- cancelled placement is read-only. Give her a live one to hang requirements
-- off — a second position, a second reservation, a second confirmation.
insert into positions (id, cycle_id, startup_id, title, description,
                       intern_count, hours_per_intern, duration_weeks, status)
values ('eeeeeeee-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 'Storage Intern', 'Hold things',
        1, 20, 12, 'approved');

insert into pool_entries (position_id, candidate_id)
values ('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001');

commit;

do $$
declare
  v_selection selections;
  v_placement placements;
begin
  select * into v_selection from reserve_candidate(
    'eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001');
  select * into v_placement from confirm_selection(
    v_selection.id, '2026-03-01', '2026-06-01', 'Karim Nasser');

  -- One requirement per owner, so the asymmetry below has something to bite on.
  insert into placement_requirements (id, placement_id, title, owner, required, status)
  values
    ('ffffffff-0000-0000-0000-000000000001', v_placement.id,
     'Bank details', 'candidate', true, 'awaiting_upload'),
    ('ffffffff-0000-0000-0000-000000000002', v_placement.id,
     'Startup agreement', 'startup', true, 'awaiting_upload');
end $$;

-- Candidate documents need a row before the policy has a folder to compare.
insert into candidate_documents (id, candidate_id, kind, status)
values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001', 'bank_statement', 'requested'),
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000002', 'bank_statement', 'requested');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== R. a candidate writes into their own folder and no other ========'

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('candidate-documents',
          'candidates/dddddddd-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001/statement.pdf');
  raise notice 'PASS  a candidate uploads into their own folder';

  -- The whole point of computing the path server-side. If this succeeded, a
  -- browser that chose its own folder could write into anyone's.
  begin
    insert into storage.objects (bucket_id, name)
    values ('candidate-documents',
            'candidates/dddddddd-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000002/statement.pdf');
    raise exception 'FAIL: a candidate wrote into another candidate''s folder';
  exception when insufficient_privilege then
    raise notice 'PASS  and cannot write into another candidate''s folder';
  end;

  if (select count(*) from storage.objects where bucket_id = 'candidate-documents') <> 1 then
    raise exception 'FAIL: the candidate sees % objects, expected only their own',
      (select count(*) from storage.objects where bucket_id = 'candidate-documents');
  end if;
  raise notice 'PASS  and reads only their own';
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== S. a startup never sees a candidate''s identity documents ======='

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
begin
  -- There is no policy for startups on this bucket at all. Default-deny is what
  -- answers here, and this asserts the absence is doing its job.
  if (select count(*) from storage.objects where bucket_id = 'candidate-documents') <> 0 then
    raise exception 'FAIL: a startup can see a candidate''s documents in storage';
  end if;
  raise notice 'PASS  a startup sees nothing in candidate-documents';

  begin
    insert into storage.objects (bucket_id, name)
    values ('candidate-documents',
            'candidates/dddddddd-0000-0000-0000-000000000001/forged/statement.pdf');
    raise exception 'FAIL: a startup uploaded into a candidate''s folder';
  exception when insufficient_privilege then
    raise notice 'PASS  and cannot upload into one';
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== T. QSTP reads every document and uploads none ==================='

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'candidate-documents') <> 1 then
    raise exception 'FAIL: QSTP cannot read the documents it has to verify';
  end if;
  raise notice 'PASS  QSTP reads every candidate document';

  -- Deliberate: nobody uploads a candidate's identity document on their behalf.
  begin
    insert into storage.objects (bucket_id, name)
    values ('candidate-documents',
            'candidates/dddddddd-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001/staff-upload.pdf');
    raise exception 'FAIL: QSTP uploaded a document on a candidate''s behalf';
  exception when insufficient_privilege then
    raise notice 'PASS  and cannot upload one on their behalf';
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== U. a requirement is satisfied by the party that owns it ========='

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('requirement-submissions',
          'requirements/ffffffff-0000-0000-0000-000000000001/bank-form.pdf');
  raise notice 'PASS  the candidate uploads against a candidate-owned requirement';

  begin
    insert into storage.objects (bucket_id, name)
    values ('requirement-submissions',
            'requirements/ffffffff-0000-0000-0000-000000000002/agreement.pdf');
    raise exception 'FAIL: the candidate satisfied the startup''s own requirement';
  exception when insufficient_privilege then
    raise notice 'PASS  and cannot satisfy the startup''s';
  end;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('requirement-submissions',
          'requirements/ffffffff-0000-0000-0000-000000000002/agreement.pdf');
  raise notice 'PASS  the startup uploads against its own requirement';

  -- Re-upload is the signing flow now: the same path, replaced by a
  -- countersigned copy. The update policy is what makes that possible.
  update storage.objects set updated_at = now()
  where name = 'requirements/ffffffff-0000-0000-0000-000000000002/agreement.pdf';
  if not found then
    raise exception 'FAIL: the startup cannot replace its own submission';
  end if;
  raise notice 'PASS  and can replace it with a signed copy';

  -- The asymmetry: it opens the agreement it signed, never the bank form.
  if exists (
    select 1 from storage.objects
    where name = 'requirements/ffffffff-0000-0000-0000-000000000001/bank-form.pdf'
  ) then
    raise exception 'FAIL: the startup can read its intern''s bank form';
  end if;
  raise notice 'PASS  and cannot read the candidate-owned bank form';
end $$;

reset role;
