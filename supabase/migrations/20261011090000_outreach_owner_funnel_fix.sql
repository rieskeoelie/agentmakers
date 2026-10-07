-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- Outreach: Owner Discovery funnel correction
--
-- 'owner_found_no_email' now counts every prospect whose owner was found (also one awaiting human identity review)
-- without a usable personal business email, derived from record->'owner_discovery' — not from the outcome, because
-- identity review (NEEDS_REVIEW) and email availability are separate. Nothing else changes. No data is changed.
-- Re-runnable (create or replace only).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════

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
    -- An owner was found (any evidence state, incl. one awaiting identity review) but no usable personal business email.
    'owner_found_no_email',    count(p.id) filter (where jsonb_typeof(p.record->'owner_discovery'->'person') = 'object'
                                                     and p.record->'owner_discovery'->'person'->>'role_class' = 'OWNER'
                                                     and coalesce(p.record->'owner_discovery'->'email'->>'state', '') not in ('VERIFIED','REVIEW_ONLY')))
  from outreach_runs r left join outreach_prospects p on p.run_id = r.id
  where r.id = p_run_id
  group by r.id
$$;

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
