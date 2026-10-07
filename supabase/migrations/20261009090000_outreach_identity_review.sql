-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- Outreach: human identity review (narrow approval path)
--
-- Two machine review reasons mean "the decision maker's IDENTITY needs a human":
--   PARTIAL_NAME_MATCH_REVIEW        first-name-only owner on the company's own site ("Richard — Eigenaar"),
--                                    optionally matched to exactly one Hunter contact on the company domain
--   NEAR_MATCH_IDENTITY_UNCONFIRMED  public-search person at a strongly matching business name, corroborated by an
--                                    independent company-specific signal (locality / domain / phone / address)
-- They are approvable ONLY when the stored record substantiates them; otherwise IDENTITY_REVIEW_NOT_SUBSTANTIATED
-- is a hard blocker. outreach_review_resolvable_reasons() is NOT changed.
--
-- Human approval = "I accept this person/company identity match". It is NOT a send and bypasses nothing else:
--   - every other review blocker still applies (generic mailbox, invalid/ineligible email, suppression,
--     duplicates/CRM, role, hard reasons);
--   - missing recipient data (no email / no surname) never becomes READY: the identity acceptance is recorded and
--     the prospect leaves review as DECISION_MAKER_EMAIL_NOT_FOUND;
--   - no surname is ever created by approval; the stored contact/machine reasons are never rewritten.
-- Audit: review decision snapshot (identity_review incl. visible evidence, resulting outcome) + record
-- 'human_identity_approval' (reviewer, time, reason, candidate, decision id) + REVIEW_DECISION event.
-- Re-runnable (create or replace only).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function outreach_identity_review_reasons() returns text[]
language sql immutable set search_path = public as $$
  select array['PARTIAL_NAME_MATCH_REVIEW','NEAR_MATCH_IDENTITY_UNCONFIRMED']
$$;

-- Review data that may be MISSING after an identity approval (prospect then stays non-READY); never approved away.
create or replace function outreach_missing_recipient_blockers() returns text[]
language sql immutable set search_path = public as $$
  select array['NO_RECIPIENT','NO_NAMED_RECIPIENT','DECISION_MAKER_EMAIL_NOT_FOUND']
$$;

-- Identity-review verdict for a prospect: null when no identity reason applies; otherwise the reason, whether the
-- stored evidence substantiates it, the candidate and the evidence a reviewer sees.
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
  if v_reason = 'NEAR_MATCH_IDENTITY_UNCONFIRMED' then
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
    'evidence', case when v_reason = 'NEAR_MATCH_IDENTITY_UNCONFIRMED'
                     then jsonb_build_object('near_match', nm)
                     else jsonb_build_object('title_source_url', c->'title_source_url', 'surname_source',
                                             case when c->>'identification' = 'first_name_hunter_match' then 'hunter_domain_search' else null end) end);
end $$;

-- Review blockers: unchanged from Stage 3 except that (1) a SUBSTANTIATED identity reason is resolvable and an
-- unsubstantiated one is replaced by the hard blocker IDENTITY_REVIEW_NOT_SUBSTANTIATED, and (2) "not eligible" is
-- reported only for an existing address (a missing address is NO_RECIPIENT, which still blocks every READY).
create or replace function outreach_review_blockers(p_prospect_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare p outreach_prospects; v jsonb := '[]'::jsonb; v_reason text; v_identity jsonb;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found then return '["NOT_FOUND"]'::jsonb; end if;
  v_identity := outreach_identity_review(p.id);
  for v_reason in select jsonb_array_elements_text(coalesce(p.outcome_reasons, '[]'::jsonb)) loop
    if v_reason = any (outreach_identity_review_reasons()) then
      if not coalesce((v_identity->>'substantiated')::boolean, false) then v := v || '["IDENTITY_REVIEW_NOT_SUBSTANTIATED"]'::jsonb; end if;
    elsif not (v_reason = any (outreach_review_resolvable_reasons())) then
      v := v || jsonb_build_array(v_reason);
    end if;
  end loop;
  -- LOCKED: READY requires a confirmed NAMED person in a Phase 0 decision-maker role.
  if coalesce(btrim(p.record->'contact'->>'name'), '') = ''
     or coalesce(btrim(p.record->'contact'->>'first_name'), '') = ''
     or coalesce(btrim(p.record->'contact'->>'last_name'), '') = '' then
    v := v || '["NO_NAMED_RECIPIENT"]'::jsonb;
  end if;
  if coalesce(btrim(p.record->'contact'->>'source'), 'none') in ('', 'none') then
    v := v || '["CONTACT_SOURCE_UNKNOWN"]'::jsonb;
  end if;
  if coalesce(btrim(p.record->'contact'->>'title'), '') = '' then
    v := v || '["NO_DECISION_MAKER_ROLE"]'::jsonb;
  elsif jsonb_typeof(p.record->'contact'->'role_match') is distinct from 'object' then
    v := v || '["ROLE_NOT_DECISION_MAKER"]'::jsonb;
  end if;
  if p.email is null then v := v || '["NO_RECIPIENT"]'::jsonb;
  elsif p.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v := v || '["INVALID_EMAIL"]'::jsonb;
  end if;
  if coalesce((p.record->'email_eligibility'->>'is_generic')::boolean, false) then v := v || '["GENERIC_ADDRESS_NOT_A_RECIPIENT"]'::jsonb; end if;
  -- An ADDRESS that is not eligible is a hard blocker; no address at all is NO_RECIPIENT (above), not a second blocker.
  if p.email is not null and p.record->'email_eligibility'->>'eligibility' = 'NOT_ELIGIBLE' then v := v || '["EMAIL_NOT_ELIGIBLE:NOT_ELIGIBLE"]'::jsonb; end if;
  v := v || outreach_blocking_reasons(p.owner_user_id, p.email, p.domain, p.company_key, p.contact_key, p.id, null, false);
  return coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(v) x), '[]'::jsonb);
end $$;

-- Review queue: Stage 3 item + 'identity_review'.
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
        'identity_review', outreach_identity_review(p.id),
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

-- Review action: Stage 3 behaviour, plus the identity-approval path for substantiated identity reviews.
create or replace function outreach_review_action(
  p_prospect_id uuid, p_actor text, p_is_superadmin boolean, p_action text, p_reason text default null, p_notes text default null,
  p_role_check jsonb default null)
returns jsonb language plpgsql set search_path = public as $$
declare p outreach_prospects; v_blockers jsonb; v_outcome text; v_tags jsonb; v_id uuid; v_snapshot jsonb;
        v_identity jsonb; v_missing jsonb := '[]'::jsonb; v_hard jsonb;
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
  v_identity := outreach_identity_review(p.id);
  v_snapshot := jsonb_build_object('outcome', p.outcome, 'outcome_reasons', p.outcome_reasons, 'email', p.email, 'contact_name', p.contact_name,
                                   'identity_review', v_identity);

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
    if coalesce((v_identity->>'substantiated')::boolean, false) then
      -- Identity approval: missing recipient data does not block accepting the identity, but keeps the prospect non-READY.
      v_missing := coalesce((select jsonb_agg(x) from jsonb_array_elements_text(v_blockers) x where x = any (outreach_missing_recipient_blockers())), '[]'::jsonb);
      v_hard := coalesce((select jsonb_agg(x) from jsonb_array_elements_text(v_blockers) x where not (x = any (outreach_missing_recipient_blockers()))), '[]'::jsonb);
    else
      v_hard := v_blockers;
    end if;
    if jsonb_array_length(v_hard) > 0 then
      perform outreach_event(p.run_id, p.id, 'REVIEW_APPROVAL_REFUSED', p_actor, jsonb_build_object('blockers', v_blockers));
      return jsonb_build_object('ok', false, 'blockers', v_blockers, 'outcome', p.outcome);
    end if;
    if v_identity is not null and jsonb_array_length(v_missing) > 0 then
      v_outcome := 'DECISION_MAKER_EMAIL_NOT_FOUND'; v_tags := '["IDENTITY_HUMAN_APPROVED"]'::jsonb;
    elsif v_identity is not null then
      v_outcome := 'READY'; v_tags := '["REVIEW_APPROVED","IDENTITY_HUMAN_APPROVED"]'::jsonb;
    else
      v_outcome := 'READY'; v_tags := '["REVIEW_APPROVED"]'::jsonb;
    end if;
  elsif p_action = 'REJECT' then
    v_outcome := 'BLOCKED'; v_tags := '["REVIEW_REJECTED"]'::jsonb;
  elsif p_action = 'EXCLUDE_COMPANY' then
    insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source, created_by_user_id)
    values (p.owner_user_id, 'DOMAIN', p.domain, 'manual_exclusion', p_reason, 'review', p_actor),
           (p.owner_user_id, 'COMPANY', p.company_key, 'manual_exclusion', p_reason, 'review', p_actor)
    on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing;
    v_outcome := 'BLOCKED'; v_tags := '["EXCLUDED_COMPANY"]'::jsonb;
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
    v_outcome := 'BLOCKED'; v_tags := '["EXCLUDED_CONTACT"]'::jsonb;
  end if;

  v_snapshot := v_snapshot || jsonb_build_object('resulting_outcome', v_outcome, 'missing_after_approval', v_missing);
  insert into outreach_review_decisions (prospect_id, run_id, owner_user_id, reviewer_user_id, decision, reason, notes, snapshot)
  values (p.id, p.run_id, p.owner_user_id, p_actor, p_action, p_reason, p_notes, v_snapshot)
  returning id into v_id;
  -- Original machine reasons and contact are kept; the human identity approval is ADDED next to them.
  update outreach_prospects set outcome = v_outcome, outcome_reasons = v_tags || p.outcome_reasons,
    record = case when p_action = 'APPROVE' and v_identity is not null
                  then coalesce(record, '{}'::jsonb) || jsonb_build_object('human_identity_approval', jsonb_build_object(
                         'decision_id', v_id, 'reviewer_user_id', p_actor, 'approved_at', now(), 'review_reason', v_identity->'reason',
                         'candidate', v_identity->'candidate', 'evidence', v_identity->'evidence', 'resulting_outcome', v_outcome,
                         'missing_after_approval', v_missing))
                  else record end,
    updated_at = now()
  where id = p.id;
  perform outreach_event(p.run_id, p.id, 'REVIEW_DECISION', p_actor, jsonb_build_object('decision', p_action, 'outcome', v_outcome,
    'identity_accepted', p_action = 'APPROVE' and v_identity is not null));
  return jsonb_build_object('ok', true, 'decision_id', v_id, 'outcome', v_outcome,
    'identity_accepted', p_action = 'APPROVE' and v_identity is not null, 'missing_after_approval', v_missing);
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
