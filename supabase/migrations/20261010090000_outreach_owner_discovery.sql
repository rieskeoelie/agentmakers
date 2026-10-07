-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- Outreach: Owner Discovery ("Eigenaar vinden") — research-only run type
--
-- 1. outreach_runs.prospect_limit: up to 50 companies for Owner Discovery runs only; audience runs keep the
--    Phase 0 cap of 20.
-- 2. outreach_send_gate: Owner Discovery prospects are NEVER sendable (OWNER_DISCOVERY_NOT_SENDABLE), whatever
--    their outcome. Otherwise identical to Stage 4.
-- 3. Identity review: OWNER_EVIDENCE_REVIEW (full name + role from a public source / Hunter position, company
--    identity verified) and DIRECTOR_NOT_OWNER (director found where an owner was asked) are approvable ONLY when
--    the stored owner_discovery record substantiates them. Approval accepts the person/role match; it never turns a
--    director into an owner and never makes anything sendable.
-- 4. outreach_run_funnel: + owner funnel counts. outreach_search_prospects: + 'owner' (record->'owner_discovery').
-- Re-runnable (create or replace / drop-if-exists only). No data is changed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare c record;
begin
  -- Drop the Stage 2 column check (whatever its generated name) before adding the run-type aware one.
  for c in select conname from pg_constraint
           where conrelid = 'public.outreach_runs'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%prospect_limit%'
  loop
    execute format('alter table outreach_runs drop constraint %I', c.conname);
  end loop;
end $$;
alter table outreach_runs add constraint outreach_runs_prospect_limit_owner_check
  check (prospect_limit between 1 and 50 and (prospect_limit <= 20 or coalesce(campaign->>'run_type', '') = 'OWNER_DISCOVERY'));

create or replace function outreach_identity_review_reasons() returns text[]
language sql immutable set search_path = public as $$
  select array['PARTIAL_NAME_MATCH_REVIEW','NEAR_MATCH_IDENTITY_UNCONFIRMED','OWNER_EVIDENCE_REVIEW','DIRECTOR_NOT_OWNER']
$$;

create or replace function outreach_identity_review(p_prospect_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare p outreach_prospects; c jsonb; v_reason text; v_ok boolean := false; nm jsonb;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found then return null; end if;
  select x into v_reason from jsonb_array_elements_text(coalesce(p.outcome_reasons, '[]'::jsonb)) x
  where x = any (outreach_identity_review_reasons()) limit 1;
  if v_reason is null then return null; end if;
  c := coalesce(p.record->'contact', '{}'::jsonb);
  nm := c->'near_match';
  if v_reason in ('OWNER_EVIDENCE_REVIEW','DIRECTOR_NOT_OWNER') then
    -- Owner Discovery: a full name + decision-maker title from a named source, on a company whose identity was
    -- verified. The human accepts the person/role match; a director is never relabelled as owner.
    v_ok := jsonb_typeof(p.record->'owner_discovery') = 'object'
      and p.record->'owner_discovery'->'company_identity'->>'state' = 'VERIFIED'
      and jsonb_typeof(p.record->'owner_discovery'->'person') = 'object'
      and p.record->'owner_discovery'->'person'->>'source' in ('WEBSITE','REGISTRY','PUBLIC_SEARCH','HUNTER_POSITION')
      and coalesce(btrim(c->>'first_name'), '') <> '' and coalesce(btrim(c->>'last_name'), '') <> ''
      and jsonb_typeof(c->'role_match') = 'object';
  elsif v_reason = 'NEAR_MATCH_IDENTITY_UNCONFIRMED' then
    v_ok := c->>'identification' = 'near_match_review'
      and c->>'source' = 'public_search_near_match+hunter_email_finder'
      and jsonb_typeof(nm) = 'object'
      and nm->>'similarity' = 'STRONG_BUSINESS_NAME_MATCH'
      and jsonb_typeof(nm->'corroboration') = 'array' and jsonb_array_length(nm->'corroboration') >= 1
      and coalesce(btrim(nm->>'full_name'), '') <> '' and nm->>'full_name' = c->>'name'
      and jsonb_typeof(c->'role_match') = 'object';
  else
    v_ok := c->>'identification' in ('first_name_only','first_name_hunter_match')
      and coalesce(btrim(c->>'first_name'), '') <> ''
      and coalesce(btrim(c->>'title_source_url'), '') <> ''
      and jsonb_typeof(c->'role_match') = 'object'
      and (c->>'identification' = 'first_name_only'
           or (c->>'source' = 'website_title+hunter_domain_search' and coalesce(btrim(c->>'last_name'), '') <> ''));
  end if;
  return jsonb_build_object(
    'reason', v_reason,
    'substantiated', coalesce(v_ok, false),
    'candidate', jsonb_build_object('name', c->'name', 'first_name', c->'first_name', 'last_name', c->'last_name', 'title', c->'title',
                                    'source', c->'source', 'identification', c->'identification', 'title_source_url', c->'title_source_url'),
    'evidence', case when v_reason in ('OWNER_EVIDENCE_REVIEW','DIRECTOR_NOT_OWNER')
                     then jsonb_build_object('owner_discovery', jsonb_build_object(
                            'source', p.record->'owner_discovery'->'person'->'source',
                            'role_class', p.record->'owner_discovery'->'person'->'role_class',
                            'evidence_label', p.record->'owner_discovery'->'evidence_label',
                            'confidence_reason', p.record->'owner_discovery'->'confidence_reason',
                            'company_identity', p.record->'owner_discovery'->'company_identity',
                            'title_source_url', c->'title_source_url'))
                     when v_reason = 'NEAR_MATCH_IDENTITY_UNCONFIRMED'
                     then jsonb_build_object('near_match', nm)
                     else jsonb_build_object('title_source_url', c->'title_source_url', 'surname_source',
                                             case when c->>'identification' = 'first_name_hunter_match' then 'hunter_domain_search' else null end) end);
end $$;

create or replace function outreach_send_gate(p_prospect_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare p outreach_prospects; r outreach_runs; v jsonb := '[]'::jsonb; v_approved boolean;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found then return '["NOT_FOUND"]'::jsonb; end if;
  select * into r from outreach_runs where id = p.run_id;
  if p.queue_state <> 'DONE' or p.outcome is distinct from 'READY' then v := v || jsonb_build_array('NOT_READY:' || coalesce(p.outcome, p.queue_state)); end if;
  if r.status in ('STOPPED','FAILED') then v := v || jsonb_build_array('RUN_' || r.status); end if;
  -- Owner Discovery runs are research only: never sendable, whatever their outcome or review state.
  if r.campaign->>'run_type' = 'OWNER_DISCOVERY' or p.record ? 'owner_discovery' then v := v || '["OWNER_DISCOVERY_NOT_SENDABLE"]'::jsonb; end if;
  v_approved := coalesce(p.outcome_reasons, '[]'::jsonb) ? 'REVIEW_APPROVED';
  if coalesce(btrim(p.record->'email'->>'subject'), '') = '' or coalesce(btrim(p.record->'email'->>'body'), '') = '' then v := v || '["NO_MESSAGE"]'::jsonb; end if;
  if coalesce(btrim(p.record->'contact'->>'first_name'), '') = '' or coalesce(btrim(p.record->'contact'->>'last_name'), '') = '' then
    v := v || '["NO_NAMED_RECIPIENT"]'::jsonb;
  end if;
  if jsonb_typeof(p.record->'contact'->'role_match') is distinct from 'object' and not v_approved then v := v || '["ROLE_NOT_DECISION_MAKER"]'::jsonb; end if;
  if p.email is null then v := v || '["NO_RECIPIENT"]'::jsonb;
  elsif p.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v := v || '["INVALID_EMAIL"]'::jsonb;
  end if;
  if coalesce((p.record->'email_eligibility'->>'is_generic')::boolean, false) then v := v || '["GENERIC_ADDRESS_NOT_A_RECIPIENT"]'::jsonb; end if;
  if coalesce(p.record->'email_eligibility'->>'eligibility', 'UNKNOWN') = 'NOT_ELIGIBLE'
     or (coalesce(p.record->'email_eligibility'->>'eligibility', 'UNKNOWN') <> 'ELIGIBLE' and not v_approved) then
    v := v || jsonb_build_array('EMAIL_NOT_ELIGIBLE:' || coalesce(p.record->'email_eligibility'->>'eligibility', 'UNKNOWN'));
  end if;
  v := v || outreach_suppression_reasons(p.owner_user_id, p.email, p.domain, p.company_key, p.contact_key);
  if p.email is not null and exists (select 1 from outreach_sends s where s.email = p.email and s.prospect_id <> p.id and s.state <> 'CANCELLED') then
    v := v || '["ALREADY_CONTACTED_EMAIL"]'::jsonb;
  end if;
  if exists (select 1 from outreach_sends s where s.domain = p.domain and s.prospect_id <> p.id and s.state <> 'CANCELLED') then
    v := v || '["ALREADY_CONTACTED_DOMAIN"]'::jsonb;
  end if;
  if p.email is not null and exists (select 1 from public.leads l where lower(btrim(l.email)) = p.email
                                     and l.outreach_prospect_id is distinct from p.id) then
    v := v || '["EXISTING_CRM_LEAD"]'::jsonb;
  end if;
  if exists (select 1 from public.leads l where outreach_host_of(l.website) = p.domain and l.outreach_prospect_id is distinct from p.id) then
    v := v || '["EXISTING_CRM_LEAD_DOMAIN"]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(distinct x order by x) from jsonb_array_elements_text(v) x), '[]'::jsonb);
end $$;

create or replace function outreach_run_funnel(p_run_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'discovered',       coalesce((r.discovery_summary->>'returned')::int, 0),
    'selected',         coalesce((r.discovery_summary->>'selected')::int, 0),
    'total',            count(p.id),
    'researched',       count(p.id) filter (where p.record->'stages'->'website_fetch'->>'status' = 'ok'),
    'good_fit',         count(p.id) filter (where p.record->'fit'->>'classification' = 'GOOD_FIT'),
    'possible_fit',     count(p.id) filter (where p.record->'fit'->>'classification' = 'POSSIBLE_FIT'),
    'decision_makers',  count(p.id) filter (where coalesce(p.record->'contact'->>'name', '') <> ''),
    'business_emails',  count(p.id) filter (where coalesce(p.record->'contact'->>'name', '') <> '' and coalesce(p.record->'contact'->>'email', '') <> ''
                                              and coalesce((p.record->'email_eligibility'->>'is_generic')::boolean, false) = false),
    'eligible_emails',  count(p.id) filter (where coalesce(p.record->'contact'->>'name', '') <> '' and coalesce(p.record->'contact'->>'email', '') <> ''
                                              and coalesce((p.record->'email_eligibility'->>'is_generic')::boolean, false) = false
                                              and p.record->'email_eligibility'->>'eligibility' = 'ELIGIBLE'),
    'ready',            count(p.id) filter (where p.outcome = 'READY'),
    'needs_review',     count(p.id) filter (where p.outcome = 'NEEDS_REVIEW'),
    'blocked',          count(p.id) filter (where p.outcome = 'BLOCKED'),
    'skipped',          count(p.id) filter (where p.outcome in ('SKIPPED','CONTACT_NOT_FOUND','DECISION_MAKER_EMAIL_NOT_FOUND','EMAIL_NOT_ELIGIBLE')),
    'failed',           count(p.id) filter (where p.queue_state = 'FAILED'),
    'pending',          count(p.id) filter (where p.queue_state = 'PENDING'),
    'in_progress',      count(p.id) filter (where p.queue_state = 'IN_PROGRESS'),
    'finished',         count(p.id) filter (where p.queue_state in ('DONE','FAILED','CANCELLED')),
    'cancelled',        count(p.id) filter (where p.queue_state = 'CANCELLED'),
    -- Owner Discovery (record->'owner_discovery'); 0 for audience runs.
    'owner_identity_verified', count(p.id) filter (where p.record->'owner_discovery'->'company_identity'->>'state' = 'VERIFIED'),
    'owner_researched',        count(p.id) filter (where jsonb_typeof(p.record->'owner_discovery') = 'object'
                                                     and p.record->'stages'->'contact'->>'status' in ('ok','failed')),
    'owner_person_found',      count(p.id) filter (where jsonb_typeof(p.record->'owner_discovery'->'person') = 'object'),
    'owner_confirmed',         count(p.id) filter (where p.record->'owner_discovery'->>'confidence' = 'VERIFIED'
                                                     and p.record->'owner_discovery'->'person'->>'role_class' = 'OWNER'),
    'owner_business_emails',   count(p.id) filter (where p.record->'owner_discovery'->'email'->>'state' = 'VERIFIED'),
    'owner_found_no_email',    count(p.id) filter (where p.outcome = 'DECISION_MAKER_EMAIL_NOT_FOUND'
                                                     and p.outcome_reasons ? 'OWNER_FOUND_NO_EMAIL'))
  from outreach_runs r left join outreach_prospects p on p.run_id = r.id
  where r.id = p_run_id
  group by r.id
$$;

create or replace function outreach_search_prospects(
  p_actor text, p_is_superadmin boolean, p_owner_filter text default null, p_filters jsonb default '{}'::jsonb, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_owner text := outreach_effective_owner(p_actor, p_is_superadmin, p_owner_filter);
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_run uuid := nullif(f->>'run_id', '')::uuid;
  v_q text := nullif(lower(trim(coalesce(f->>'q', ''))), '');
  v_loc text := nullif(lower(trim(coalesce(f->>'location', ''))), '');
  v_res jsonb;
begin
  select jsonb_build_object('total', coalesce(max(x.total), 0), 'items', coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb)) into v_res
  from (
    select count(*) over () as total, row_number() over (order by p.updated_at desc, p.id) as ord,
      jsonb_build_object(
        'id', p.id, 'run_id', p.run_id, 'run_name', r.name, 'position', p.position, 'company_name', p.company_name, 'domain', p.domain,
        'city', p.company->>'city', 'country', p.company->>'country', 'fit', p.record->'fit'->>'classification',
        'contact_name', coalesce(p.contact_name, p.record->'contact'->>'name'), 'contact_title', p.record->'contact'->>'title',
        'email', p.email, 'verification_status', p.record->>'verification_status', 'eligibility', p.record->'email_eligibility'->>'eligibility',
        'queue_state', p.queue_state, 'current_step', p.current_step, 'outcome', p.outcome, 'outcome_reasons', p.outcome_reasons,
        'spent_eur', p.spent_eur, 'attempts', p.attempts, 'updated_at', p.updated_at,
        'owner', p.record->'owner_discovery') as item
    from outreach_prospects p join outreach_runs r on r.id = p.run_id
    where (v_owner is null or p.owner_user_id = v_owner)
      and (v_run is null or p.run_id = v_run)
      and (nullif(f->>'fit', '') is null or p.record->'fit'->>'classification' = f->>'fit')
      and (nullif(f->>'status', '') is null or coalesce(p.outcome, p.queue_state) = f->>'status')
      and (case coalesce(nullif(f->>'email', ''), 'any')
             when 'eligible' then p.record->'email_eligibility'->>'eligibility' = 'ELIGIBLE'
             when 'review_only' then p.record->'email_eligibility'->>'eligibility' = 'REVIEW_ONLY'
             when 'not_eligible' then p.record->'email_eligibility'->>'eligibility' = 'NOT_ELIGIBLE'
             when 'none' then p.email is null
             when 'has_email' then p.email is not null
             else true end)
      and (v_loc is null or position(v_loc in lower(coalesce(p.company->>'city', '') || ' ' || coalesce(p.company->>'region', '') || ' ' || coalesce(p.company->>'address', ''))) > 0)
      and (v_q is null or position(v_q in lower(p.company_name || ' ' || p.domain || ' ' || coalesce(p.email, '') || ' ' || coalesce(p.contact_name, ''))) > 0)
    order by p.updated_at desc, p.id
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  if (v_res->>'total')::int = 0 and coalesce(p_offset, 0) > 0 then
    -- page beyond the end: still report the real total
    select jsonb_build_object('total', count(*), 'items', '[]'::jsonb) into v_res
    from outreach_prospects p where (v_owner is null or p.owner_user_id = v_owner) and (v_run is null or p.run_id = v_run);
  end if;
  return v_res;
end $$;

-- ─── Security (same as earlier stages): service_role only ───────────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'outreach\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
