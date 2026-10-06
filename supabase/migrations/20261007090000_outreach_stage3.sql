-- ════════════════════════════════════════════════════════════════════════════
-- AgentMakers Outreach — Stage 3: admin read models + review actions
--
-- Additive to 20261006150000_outreach_stage2.sql (apply that one first).
-- NOT applied automatically. Apply manually in the Supabase SQL Editor. Safe to re-run.
-- Same security model: service_role only, tenant checks inside the functions.
-- ════════════════════════════════════════════════════════════════════════════

-- How READY prospects will be handled once sending exists (Stage 4). Nothing is sent in Stage 3.
alter table outreach_runs add column if not exists sending_mode text not null default 'REVIEW_BEFORE_SENDING';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_runs_sending_mode_check') then
    alter table outreach_runs add constraint outreach_runs_sending_mode_check check (sending_mode in ('AUTOPILOT','REVIEW_BEFORE_SENDING'));
  end if;
end $$;

-- Review decisions: add the two exclusion actions.
alter table outreach_review_decisions drop constraint if exists outreach_review_decisions_decision_check;
alter table outreach_review_decisions add constraint outreach_review_decisions_decision_check
  check (decision in ('APPROVE','REJECT','REQUEST_CHANGES','EXCLUDE_COMPANY','EXCLUDE_CONTACT'));

-- Superadmins may narrow to one account (view-as); everyone else only ever sees their own account.
create or replace function outreach_effective_owner(p_actor text, p_is_superadmin boolean, p_owner_filter text)
returns text language sql immutable set search_path = public as $$
  select case when coalesce(p_is_superadmin, false) then nullif(trim(coalesce(p_owner_filter, '')), '') else p_actor end
$$;

create or replace function outreach_set_run_sending_mode(p_run_id uuid, p_actor text, p_is_superadmin boolean, p_mode text)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  r := outreach_assert_run_access(p_run_id, p_actor, p_is_superadmin, true);
  if r.status in ('COMPLETED','STOPPED','FAILED') then raise exception 'OUTREACH_INVALID_TRANSITION: % -> set_mode', r.status; end if;
  if p_mode not in ('AUTOPILOT','REVIEW_BEFORE_SENDING') then raise exception 'OUTREACH_VALIDATION: unknown sending mode'; end if;
  update outreach_runs set sending_mode = p_mode, updated_at = now() where id = r.id;
  perform outreach_event(r.id, null, 'RUN_MODE', p_actor, jsonb_build_object('from', r.sending_mode, 'to', p_mode));
  return outreach_run_view(r.id);
end $$;

-- Funnel per run. Definitions mirror Phase 0 output.funnelFlags:
--   researched = website fetched; decision maker = named contact; business email = named contact with a
--   non-generic email; eligible = business email with ELIGIBLE eligibility.
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
    'cancelled',        count(p.id) filter (where p.queue_state = 'CANCELLED'))
  from outreach_runs r left join outreach_prospects p on p.run_id = r.id
  where r.id = p_run_id
  group by r.id
$$;

create or replace function outreach_list_runs_overview(p_actor text, p_is_superadmin boolean, p_owner_filter text default null, p_limit int default 100)
returns jsonb language plpgsql set search_path = public as $$
declare v_owner text := outreach_effective_owner(p_actor, p_is_superadmin, p_owner_filter);
begin
  return coalesce((
    select jsonb_agg(outreach_run_view(s.id) || jsonb_build_object('funnel', outreach_run_funnel(s.id)) order by s.created_at desc)
    from (select id, created_at from outreach_runs where v_owner is null or owner_user_id = v_owner
          order by created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 200)) s), '[]'::jsonb);
end $$;

create or replace function outreach_get_run_overview(p_run_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  r := outreach_assert_run_access(p_run_id, p_actor, p_is_superadmin, false);
  return jsonb_build_object(
    'run', outreach_run_view(r.id) || jsonb_build_object('funnel', outreach_run_funnel(r.id)),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'company_name', company_name, 'domain', domain, 'queue_state', queue_state,
                                                            'attempts', attempts, 'last_error', last_error, 'updated_at', updated_at) order by updated_at desc)
                        from outreach_prospects where run_id = r.id and (queue_state = 'FAILED' or (last_error is not null and queue_state <> 'DONE'))), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'company_name', company_name, 'domain', domain, 'reasons', outcome_reasons) order by position)
                         from outreach_prospects where run_id = r.id and outcome = 'BLOCKED'), '[]'::jsonb),
    'recent_events', coalesce((select jsonb_agg(e order by e.id desc) from (
                         select id, prospect_id, type, actor, data, created_at from outreach_events where run_id = r.id order by id desc limit 40) e), '[]'::jsonb));
end $$;

-- Paginated, filtered prospect list across the caller's runs. Text search avoids LIKE wildcards on purpose.
-- filters: run_id, fit, status (outcome, or queue state while not finished), email (eligible|review_only|not_eligible|none|has_email),
--          location, q
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
        'spent_eur', p.spent_eur, 'attempts', p.attempts, 'updated_at', p.updated_at) as item
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

-- ─── Review policy ───────────────────────────────────────────────────────────
-- A human may resolve REVIEW-ONLY reasons; hard prohibitions can never be approved away.
-- Allow-list: any other Phase 0 reason (no named recipient, generic mailbox, invalid email, suppression, duplicate,
-- claim/copy violations, banned phrases, markup, CTA/word-count limits, unknown codes) blocks approval.
-- LOCKED RULE: READY requires a confirmed NAMED decision maker; review can never override its absence.
create or replace function outreach_review_resolvable_reasons() returns text[]
language sql immutable set search_path = public as $$
  select array['FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL','HOOK_LEVEL_B_REVIEW','NO_VALID_HOOK','EMAIL_NOT_ELIGIBLE:REVIEW_ONLY']
$$;

create or replace function outreach_review_blockers(p_prospect_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare p outreach_prospects; v jsonb := '[]'::jsonb; v_reason text;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found then return '["NOT_FOUND"]'::jsonb; end if;
  for v_reason in select jsonb_array_elements_text(coalesce(p.outcome_reasons, '[]'::jsonb)) loop
    if not (v_reason = any (outreach_review_resolvable_reasons())) then v := v || jsonb_build_array(v_reason); end if;
  end loop;
  -- LOCKED: READY requires a confirmed NAMED person in a Phase 0 decision-maker role.
  -- Named person (Phase 0 definition: full name, first name and last name).
  if coalesce(btrim(p.record->'contact'->>'name'), '') = ''
     or coalesce(btrim(p.record->'contact'->>'first_name'), '') = ''
     or coalesce(btrim(p.record->'contact'->>'last_name'), '') = '' then
    v := v || '["NO_NAMED_RECIPIENT"]'::jsonb;
  end if;
  -- Where the contact was found (Phase 0 ContactSource; 'none' = not found).
  if coalesce(btrim(p.record->'contact'->>'source'), 'none') in ('', 'none') then
    v := v || '["CONTACT_SOURCE_UNKNOWN"]'::jsonb;
  end if;
  -- Role: Phase 0 stores role_match only when the title matched the run's decision_maker_priority (roles.ts matchRole).
  -- The title itself is re-checked with the same Phase 0 matchRole on approval (see outreach_review_action).
  if coalesce(btrim(p.record->'contact'->>'title'), '') = '' then
    v := v || '["NO_DECISION_MAKER_ROLE"]'::jsonb;
  elsif jsonb_typeof(p.record->'contact'->'role_match') is distinct from 'object' then
    v := v || '["ROLE_NOT_DECISION_MAKER"]'::jsonb;
  end if;
  if p.email is null then v := v || '["NO_RECIPIENT"]'::jsonb;
  elsif p.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v := v || '["INVALID_EMAIL"]'::jsonb;
  end if;
  if coalesce((p.record->'email_eligibility'->>'is_generic')::boolean, false) then v := v || '["GENERIC_ADDRESS_NOT_A_RECIPIENT"]'::jsonb; end if;
  if p.record->'email_eligibility'->>'eligibility' = 'NOT_ELIGIBLE' then v := v || '["EMAIL_NOT_ELIGIBLE:NOT_ELIGIBLE"]'::jsonb; end if;
  v := v || outreach_blocking_reasons(p.owner_user_id, p.email, p.domain, p.company_key, p.contact_key, p.id, null, false);
  return coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(v) x), '[]'::jsonb);
end $$;

create or replace function outreach_review_queue(p_actor text, p_is_superadmin boolean, p_owner_filter text default null, p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql set search_path = public as $$
declare v_owner text := outreach_effective_owner(p_actor, p_is_superadmin, p_owner_filter); v_total int;
begin
  select count(*) into v_total from outreach_prospects p where p.outcome = 'NEEDS_REVIEW' and (v_owner is null or p.owner_user_id = v_owner);
  return jsonb_build_object('total', v_total, 'items', coalesce((
    select jsonb_agg(x.item order by x.completed_at) from (
      select p.completed_at, jsonb_build_object(
        'id', p.id, 'run_id', p.run_id, 'run_name', r.name, 'company_name', p.company_name, 'domain', p.domain,
        'website', p.company->>'website', 'city', p.company->>'city',
        'fit', p.record->'fit', 'contact_name', coalesce(p.contact_name, p.record->'contact'->>'name'), 'contact_title', p.record->'contact'->>'title',
        'email', p.email, 'email_source', p.record->'contact'->>'email_source', 'verification_status', p.record->>'verification_status',
        'eligibility', p.record->'email_eligibility', 'outcome_reasons', p.outcome_reasons, 'warnings', p.warnings,
        'blockers', outreach_review_blockers(p.id),
        'role_priority', r.campaign->'decision_maker_priority',
        'evidence', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'ref', e.ref, 'signal', e.signal, 'statement', e.statement,
                                                                  'snippet', e.snippet, 'source_url', e.source_url, 'strength', e.strength) order by e.kind, e.ref)
                              from outreach_evidence e where e.prospect_id = p.id), '[]'::jsonb),
        'hook', p.record->'hook'->'hook', 'email_draft', p.record->'email', 'spent_eur', p.spent_eur) as item
      from outreach_prospects p join outreach_runs r on r.id = p.run_id
      where p.outcome = 'NEEDS_REVIEW' and (v_owner is null or p.owner_user_id = v_owner)
      order by p.completed_at nulls last, p.id
      limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end $$;

-- APPROVE (NEEDS_REVIEW → READY, only without hard blockers) | REJECT (→ BLOCKED) |
-- EXCLUDE_COMPANY / EXCLUDE_CONTACT (account-scoped suppression + → BLOCKED). Every decision is persisted.
-- A blocked approval changes nothing and returns the blockers.
-- p_role_check = the server's Phase 0 matchRole verdict for the stored contact title ({title, qualified, matched_role}).
-- Approval is refused unless it is present, refers to exactly the stored title and says qualified.
drop function if exists outreach_review_action(uuid, text, boolean, text, text, text);
create or replace function outreach_review_action(
  p_prospect_id uuid, p_actor text, p_is_superadmin boolean, p_action text, p_reason text default null, p_notes text default null,
  p_role_check jsonb default null)
returns jsonb language plpgsql set search_path = public as $$
declare p outreach_prospects; v_blockers jsonb; v_outcome text; v_tag text; v_id uuid; v_snapshot jsonb;
begin
  select * into p from outreach_prospects where id = p_prospect_id for update;
  if not found or (not coalesce(p_is_superadmin, false) and p.owner_user_id is distinct from p_actor) then
    raise exception 'OUTREACH_NOT_FOUND';
  end if;
  if p_action not in ('APPROVE','REJECT','EXCLUDE_COMPANY','EXCLUDE_CONTACT') then
    raise exception 'OUTREACH_VALIDATION: unknown review action %', p_action;
  end if;
  if p.queue_state <> 'DONE' or p.outcome is distinct from 'NEEDS_REVIEW' then
    raise exception 'OUTREACH_INVALID_TRANSITION: % -> %', coalesce(p.outcome, p.queue_state), p_action;
  end if;
  v_snapshot := jsonb_build_object('outcome', p.outcome, 'outcome_reasons', p.outcome_reasons, 'email', p.email, 'contact_name', p.contact_name);

  if p_action = 'APPROVE' then
    if p.email is not null then perform pg_advisory_xact_lock(hashtextextended('outreach:email:' || p.email, 0)); end if;
    perform pg_advisory_xact_lock(hashtextextended('outreach:domain:' || p.domain, 0));
    v_blockers := outreach_review_blockers(p.id);
    if coalesce(btrim(p.record->'contact'->>'title'), '') <> '' then
      if p_role_check is null or jsonb_typeof(p_role_check) <> 'object'
         or (p_role_check->>'title') is distinct from (p.record->'contact'->>'title') then
        v_blockers := v_blockers || '["ROLE_NOT_VERIFIED"]'::jsonb;
      elsif (p_role_check->'qualified') is distinct from 'true'::jsonb then
        v_blockers := v_blockers || '["ROLE_NOT_DECISION_MAKER"]'::jsonb;
      end if;
    end if;
    v_blockers := coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(v_blockers) x), '[]'::jsonb);
    v_snapshot := v_snapshot || jsonb_build_object('role_check', p_role_check);
    if jsonb_array_length(v_blockers) > 0 then
      perform outreach_event(p.run_id, p.id, 'REVIEW_APPROVAL_REFUSED', p_actor, jsonb_build_object('blockers', v_blockers));
      return jsonb_build_object('ok', false, 'blockers', v_blockers, 'outcome', p.outcome);
    end if;
    v_outcome := 'READY'; v_tag := 'REVIEW_APPROVED';
  elsif p_action = 'REJECT' then
    v_outcome := 'BLOCKED'; v_tag := 'REVIEW_REJECTED';
  elsif p_action = 'EXCLUDE_COMPANY' then
    insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source, created_by_user_id)
    values (p.owner_user_id, 'DOMAIN', p.domain, 'manual_exclusion', p_reason, 'review', p_actor),
           (p.owner_user_id, 'COMPANY', p.company_key, 'manual_exclusion', p_reason, 'review', p_actor)
    on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing;
    v_outcome := 'BLOCKED'; v_tag := 'EXCLUDED_COMPANY';
  else
    if p.email is null and p.contact_key is null then raise exception 'OUTREACH_VALIDATION: no contact to exclude'; end if;
    if p.email is not null then
      insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source, created_by_user_id)
      values (p.owner_user_id, 'EMAIL', p.email, 'manual_exclusion', p_reason, 'review', p_actor)
      on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing;
    end if;
    if p.contact_key is not null then
      insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source, created_by_user_id)
      values (p.owner_user_id, 'CONTACT', p.contact_key, 'manual_exclusion', p_reason, 'review', p_actor)
      on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing;
    end if;
    v_outcome := 'BLOCKED'; v_tag := 'EXCLUDED_CONTACT';
  end if;

  insert into outreach_review_decisions (prospect_id, run_id, owner_user_id, reviewer_user_id, decision, reason, notes, snapshot)
  values (p.id, p.run_id, p.owner_user_id, p_actor, p_action, p_reason, p_notes, v_snapshot)
  returning id into v_id;
  update outreach_prospects set outcome = v_outcome, outcome_reasons = jsonb_build_array(v_tag) || p.outcome_reasons, updated_at = now()
  where id = p.id;
  perform outreach_event(p.run_id, p.id, 'REVIEW_DECISION', p_actor, jsonb_build_object('decision', p_action, 'outcome', v_outcome));
  return jsonb_build_object('ok', true, 'decision_id', v_id, 'outcome', v_outcome);
end $$;

-- Inputs for the server-side Phase 0 role check (stored contact title + the run's decision_maker_priority).
create or replace function outreach_review_role_input(p_prospect_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql stable set search_path = public as $$
declare p outreach_prospects; r outreach_runs;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found or (not coalesce(p_is_superadmin, false) and p.owner_user_id is distinct from p_actor) then
    raise exception 'OUTREACH_NOT_FOUND';
  end if;
  select * into r from outreach_runs where id = p.run_id;
  return jsonb_build_object('title', p.record->'contact'->>'title', 'priority', r.campaign->'decision_maker_priority');
end $$;

create or replace function outreach_get_prospect_detail(p_prospect_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql set search_path = public as $$
declare p outreach_prospects; r outreach_runs;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found or (not coalesce(p_is_superadmin, false) and p.owner_user_id is distinct from p_actor) then
    raise exception 'OUTREACH_NOT_FOUND';
  end if;
  select * into r from outreach_runs where id = p.run_id;
  return jsonb_build_object(
    'prospect', to_jsonb(p) - 'lease_token',
    'run', jsonb_build_object('id', r.id, 'name', r.name, 'status', r.status, 'sending_mode', r.sending_mode,
                              'niche', r.campaign->>'niche', 'country', r.campaign->>'country', 'region', r.campaign->>'region',
                              'landing_url', r.campaign->>'agentmakers_url', 'brain_version', r.campaign_brain->>'version',
                              'decision_maker_priority', r.campaign->'decision_maker_priority'),
    'company_brain', (select to_jsonb(cb) from outreach_company_brains cb where cb.prospect_id = p.id),
    'evidence', coalesce((select jsonb_agg(to_jsonb(e) - 'data' || jsonb_build_object('page_kind', e.data->>'page_kind') order by e.kind, e.ref)
                          from outreach_evidence e where e.prospect_id = p.id), '[]'::jsonb),
    'provider_calls', coalesce((select jsonb_agg(jsonb_build_object('provider', c.provider, 'operation', c.operation, 'cost_eur', c.effective_cost_eur,
                                                                    'result', c.result, 'detail', c.detail, 'called_at', c.called_at) order by c.called_at, c.id)
                                from outreach_provider_calls c where c.prospect_id = p.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.type, 'actor', e.actor, 'data', e.data, 'created_at', e.created_at) order by e.id)
                        from outreach_events e where e.prospect_id = p.id), '[]'::jsonb),
    'review_decisions', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from outreach_review_decisions d where d.prospect_id = p.id), '[]'::jsonb),
    'review_blockers', case when p.outcome = 'NEEDS_REVIEW' then outreach_review_blockers(p.id) else '[]'::jsonb end);
end $$;

-- ─── Security (same as Stage 2): service_role only ───────────────────────────
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

notify pgrst, 'reload schema';
