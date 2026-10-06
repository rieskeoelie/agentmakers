-- ════════════════════════════════════════════════════════════════════════════
-- AgentMakers Outreach — Stage 2: persistent data model + resumable orchestration
--
-- NOT applied automatically. Apply manually: Supabase → SQL Editor → paste this
-- whole file → Run. Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
--
-- Security model (same as the rest of AgentMakers): browsers never talk to these
-- tables. RLS is enabled with NO policies and table/function privileges are revoked
-- from anon/authenticated, so only the server-side service-role client can use them.
-- Tenant boundaries (owner_user_id = users.id of the AgentMakers account) are
-- enforced inside the user-facing functions (p_actor / p_is_superadmin).
--
-- Raw discovered prospects live ONLY in outreach_prospects — never in `leads`.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Campaign Brain cache (replaces the Phase 0 file cache) ──────────────────
create table if not exists outreach_campaign_brains (
  id            uuid primary key default gen_random_uuid(),
  cache_key     text not null unique,          -- engine key: <content_hash16>-<language>-<llm name>
  source_url    text not null,                 -- AgentMakers landing page
  language      text not null,
  content_hash  text not null,                 -- sha256 of the landing page text
  version       text not null,
  llm_name      text not null,
  brain         jsonb not null,                -- Campaign Brain exactly as generated
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now()
);
create index if not exists outreach_campaign_brains_source_idx on outreach_campaign_brains (source_url, language);

-- ─── Runs ─────────────────────────────────────────────────────────────────────
create table if not exists outreach_runs (
  id                     uuid primary key default gen_random_uuid(),
  owner_user_id          text not null,      -- tenant (users.id as used in sessions)
  created_by_user_id     text not null,
  idempotency_key        text,
  name                   text not null,
  status                 text not null default 'CREATED'
                         check (status in ('CREATED','QUEUED','RUNNING','PAUSED','COMPLETED','STOPPED','FAILED')),
  status_reason          text,
  campaign               jsonb not null,     -- validated Phase 0 CampaignInput
  prospect_limit         int not null check (prospect_limit between 1 and 20),   -- Phase 0 hard cap
  concurrency            int not null default 3 check (concurrency between 1 and 5),
  max_attempts           int not null default 3 check (max_attempts between 1 and 10),
  budget_cap_eur         numeric(14,6) not null check (budget_cap_eur > 0),
  spent_eur              numeric(14,6) not null default 0 check (spent_eur >= 0),
  reserved_eur           numeric(14,6) not null default 0 check (reserved_eur >= 0),
  setup_state            text not null default 'PENDING' check (setup_state in ('PENDING','IN_PROGRESS','DONE','FAILED')),
  setup_attempts         int not null default 0,
  setup_lease_token      uuid,
  setup_lease_until      timestamptz,
  setup_next_attempt_at  timestamptz,
  setup_last_error       text,
  campaign_brain_id      uuid references outreach_campaign_brains(id),
  campaign_brain         jsonb,              -- effective (re-gated) brain used by this run
  discovery_summary      jsonb,              -- returned / duplicates / prefilter_rejected / selected
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  queued_at              timestamptz,
  started_at             timestamptz,
  finished_at            timestamptz
);
create unique index if not exists outreach_runs_idem_idx on outreach_runs (owner_user_id, idempotency_key) where idempotency_key is not null;
create index if not exists outreach_runs_owner_idx on outreach_runs (owner_user_id, created_at desc);
create index if not exists outreach_runs_status_idx on outreach_runs (status);

-- ─── Prospects (one row per selected company in a run) ───────────────────────
create table if not exists outreach_prospects (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references outreach_runs(id) on delete cascade,
  owner_user_id    text not null,
  position         int not null,              -- Phase 0 prospect index (1-based, selection order)
  company_name     text not null,
  domain           text not null,             -- registrable root domain
  company_key      text not null,             -- normalized company name (suppression)
  company          jsonb not null,            -- DiscoveredCompany
  queue_state      text not null default 'PENDING' check (queue_state in ('PENDING','IN_PROGRESS','DONE','FAILED','CANCELLED')),
  current_step     text not null default 'RESEARCH'
                   check (current_step in ('RESEARCH','COMPANY_BRAIN','FIT','DECISION_MAKER','EMAIL','ELIGIBILITY','PERSONALIZATION','DONE')),
  attempts         int not null default 0,
  next_attempt_at  timestamptz not null default now(),
  lease_token      uuid,
  lease_until      timestamptz,
  worker_id        text,
  last_error       text,
  outcome          text check (outcome in ('READY','NEEDS_REVIEW','BLOCKED','SKIPPED','CONTACT_NOT_FOUND',
                                           'DECISION_MAKER_EMAIL_NOT_FOUND','EMAIL_NOT_ELIGIBLE','FAILED')),
  outcome_reasons  jsonb not null default '[]',
  warnings         jsonb not null default '[]',
  email            text,                      -- lower-cased recipient (only when found)
  contact_name     text,
  contact_key      text,
  stages           jsonb,                     -- Phase 0 per-stage results
  record           jsonb,                     -- full Phase 0 ProspectRecord (audit)
  spent_eur        numeric(14,6) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  unique (run_id, domain)
);
create index if not exists outreach_prospects_claim_idx on outreach_prospects (queue_state, next_attempt_at);
create index if not exists outreach_prospects_run_idx on outreach_prospects (run_id, position);
create index if not exists outreach_prospects_domain_idx on outreach_prospects (domain);
create index if not exists outreach_prospects_email_idx on outreach_prospects (email) where email is not null;

-- ─── Company Brain (research snapshot per prospect) + evidence/inferences ─────
create table if not exists outreach_company_brains (
  id                    uuid primary key default gen_random_uuid(),
  prospect_id           uuid not null unique references outreach_prospects(id) on delete cascade,
  run_id                uuid not null references outreach_runs(id) on delete cascade,
  owner_user_id         text not null,
  domain                text not null,
  company_name          text not null,
  website               text,
  pages                 jsonb not null default '[]',
  fetch_errors          jsonb not null default '[]',
  quarantined_snippets  jsonb not null default '[]',
  fit                   jsonb,
  brief                 jsonb,
  created_at            timestamptz not null default now()
);
create index if not exists outreach_company_brains_domain_idx on outreach_company_brains (domain);

-- Facts and inferences share one table (kind) — inferences are never facts.
create table if not exists outreach_evidence (
  id                uuid primary key default gen_random_uuid(),
  company_brain_id  uuid not null references outreach_company_brains(id) on delete cascade,
  prospect_id       uuid not null references outreach_prospects(id) on delete cascade,
  kind              text not null check (kind in ('FACT','INFERENCE')),
  ref               text not null,            -- engine id (e.g. F1 / I1)
  signal            text,
  polarity          text,
  strength          text,
  statement         text not null,            -- fact text or inference text
  snippet           text,
  source_url        text,
  based_on          jsonb,
  confidence        text,
  data              jsonb not null,           -- full engine object
  created_at        timestamptz not null default now(),
  unique (company_brain_id, kind, ref)
);

-- ─── Provider cost ledger (every provider call, persisted) ───────────────────
create table if not exists outreach_provider_calls (
  id                  uuid primary key,       -- client-generated → idempotent insert
  run_id              uuid not null references outreach_runs(id) on delete cascade,
  prospect_id         uuid references outreach_prospects(id) on delete cascade,
  lease_token         uuid,
  provider            text not null,
  operation           text not null,
  estimated_cost_eur  numeric(14,6) not null default 0,
  actual_cost_eur     numeric(14,6),
  effective_cost_eur  numeric(14,6) not null default 0,
  native_cost         text,
  result              text not null,
  detail              text,
  called_at           timestamptz not null,
  created_at          timestamptz not null default now()
);
create index if not exists outreach_provider_calls_run_idx on outreach_provider_calls (run_id);
create index if not exists outreach_provider_calls_prospect_idx on outreach_provider_calls (prospect_id);

-- ─── Call journal: completed paid-provider results, replayed on retry ────────
create table if not exists outreach_call_journal (
  scope_id    uuid not null,                  -- run id (setup) or prospect id
  run_id      uuid not null references outreach_runs(id) on delete cascade,
  call_key    text not null,
  result      jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (scope_id, call_key)
);

-- ─── Budget reservations (one per lease) ─────────────────────────────────────
create table if not exists outreach_budget_reservations (
  lease_token    uuid primary key,
  run_id         uuid not null references outreach_runs(id) on delete cascade,
  prospect_id    uuid references outreach_prospects(id) on delete cascade,
  reserved_eur   numeric(14,6) not null,
  remaining_eur  numeric(14,6) not null check (remaining_eur >= 0),
  released_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists outreach_budget_reservations_run_idx on outreach_budget_reservations (run_id) where released_at is null;

-- ─── Review decisions (contract for Stage 3; append-only) ────────────────────
create table if not exists outreach_review_decisions (
  id                uuid primary key default gen_random_uuid(),
  prospect_id       uuid not null references outreach_prospects(id) on delete cascade,
  run_id            uuid not null references outreach_runs(id) on delete cascade,
  owner_user_id     text not null,
  reviewer_user_id  text not null,
  decision          text not null check (decision in ('APPROVE','REJECT','REQUEST_CHANGES')),
  reason            text,
  notes             text,
  snapshot          jsonb not null,
  created_at        timestamptz not null default now()
);
create index if not exists outreach_review_decisions_prospect_idx on outreach_review_decisions (prospect_id, created_at desc);

-- ─── Suppressions (owner_user_id NULL = global, applies to every tenant) ─────
create table if not exists outreach_suppressions (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       text,
  kind                text not null check (kind in ('EMAIL','CONTACT','DOMAIN','COMPANY')),
  value               text not null,          -- normalized by the application
  reason              text not null check (reason in ('unsubscribe','bounce','manual_exclusion','customer','do_not_contact','wrong_target')),
  note                text,
  source              text not null default 'manual',
  created_by_user_id  text,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz
);
create unique index if not exists outreach_suppressions_unique_idx on outreach_suppressions ((coalesce(owner_user_id, '')), kind, value);
create index if not exists outreach_suppressions_value_idx on outreach_suppressions (kind, value);

-- ─── Timeline ─────────────────────────────────────────────────────────────────
create table if not exists outreach_events (
  id           bigint generated always as identity primary key,
  run_id       uuid not null references outreach_runs(id) on delete cascade,
  prospect_id  uuid references outreach_prospects(id) on delete cascade,
  type         text not null,
  actor        text,
  data         jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists outreach_events_run_idx on outreach_events (run_id, id);

-- ════════════════════════════════════════════════════════════════════════════
-- Functions. Errors are raised as 'OUTREACH_<CODE>[: detail]' and mapped by the app.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function outreach_step_rank(p_step text) returns int
language sql immutable set search_path = public as $$
  select array_position(array['RESEARCH','COMPANY_BRAIN','FIT','DECISION_MAKER','EMAIL','ELIGIBILITY','PERSONALIZATION','DONE'], p_step)
$$;

create or replace function outreach_backoff_seconds(p_attempts int) returns double precision
language sql immutable set search_path = public as $$
  select least(30 * power(2, greatest(p_attempts - 1, 0)), 120)::double precision
$$;

create or replace function outreach_event(p_run_id uuid, p_prospect_id uuid, p_type text, p_actor text, p_data jsonb default null)
returns void language sql set search_path = public as $$
  insert into outreach_events (run_id, prospect_id, type, actor, data) values (p_run_id, p_prospect_id, p_type, p_actor, p_data);
$$;

-- Tenant check: a run that is not yours does not exist (no information leak).
create or replace function outreach_assert_run_access(p_run_id uuid, p_actor text, p_is_superadmin boolean, p_lock boolean default false)
returns outreach_runs language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  if p_lock then
    select * into r from outreach_runs where id = p_run_id for update;
  else
    select * into r from outreach_runs where id = p_run_id;
  end if;
  if not found or (not coalesce(p_is_superadmin, false) and r.owner_user_id is distinct from p_actor) then
    raise exception 'OUTREACH_NOT_FOUND';
  end if;
  return r;
end $$;

create or replace function outreach_run_view(p_run_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select (to_jsonb(r) - 'campaign_brain') || jsonb_build_object(
    'counts', jsonb_build_object(
      'total',   (select count(*) from outreach_prospects p where p.run_id = r.id),
      'queue',   coalesce((select jsonb_object_agg(q.queue_state, q.n) from (select queue_state, count(*) as n from outreach_prospects where run_id = r.id group by queue_state) q), '{}'::jsonb),
      'outcome', coalesce((select jsonb_object_agg(o.outcome, o.n) from (select outcome, count(*) as n from outreach_prospects where run_id = r.id and outcome is not null group by outcome) o), '{}'::jsonb)),
    'budget_available_eur', r.budget_cap_eur - r.spent_eur - r.reserved_eur)
  from outreach_runs r where r.id = p_run_id
$$;

-- ─── Budget ───────────────────────────────────────────────────────────────────
create or replace function outreach_release_reservation(p_lease_token uuid) returns numeric
language plpgsql set search_path = public as $$
declare v_run uuid; v_rem numeric;
begin
  if p_lease_token is null then return 0; end if;
  select run_id, remaining_eur into v_run, v_rem from outreach_budget_reservations
   where lease_token = p_lease_token and released_at is null for update;
  if not found then return 0; end if;
  update outreach_budget_reservations set remaining_eur = 0, released_at = now() where lease_token = p_lease_token;
  update outreach_runs set reserved_eur = greatest(0, reserved_eur - v_rem), updated_at = now() where id = v_run;
  return v_rem;
end $$;

-- A run is COMPLETED once setup is done and no prospect is pending or in flight.
-- Locks the run row first so concurrent completions serialize (no stuck RUNNING runs).
create or replace function outreach_maybe_complete_run(p_run_id uuid) returns boolean
language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  select * into r from outreach_runs where id = p_run_id for update;
  if not found or r.status <> 'RUNNING' or r.setup_state <> 'DONE' then return false; end if;
  if exists (select 1 from outreach_prospects where run_id = p_run_id and queue_state in ('PENDING','IN_PROGRESS')) then return false; end if;
  update outreach_runs set status = 'COMPLETED', status_reason = null, finished_at = now(), updated_at = now() where id = p_run_id;
  perform outreach_event(p_run_id, null, 'RUN_STATUS', 'system', jsonb_build_object('from', r.status, 'to', 'COMPLETED'));
  return true;
end $$;

-- ─── Runs: create / actions / budget ─────────────────────────────────────────
create or replace function outreach_create_run(
  p_owner text, p_actor text, p_name text, p_campaign jsonb, p_prospect_limit int, p_budget_cap_eur numeric,
  p_concurrency int, p_max_attempts int, p_idempotency_key text default null)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  if p_owner is null or p_actor is null or coalesce(p_name, '') = '' then
    raise exception 'OUTREACH_VALIDATION: owner, actor and name are required';
  end if;
  if p_idempotency_key is not null then
    select * into r from outreach_runs where owner_user_id = p_owner and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('created', false, 'run', outreach_run_view(r.id)); end if;
  end if;
  insert into outreach_runs (owner_user_id, created_by_user_id, idempotency_key, name, campaign, prospect_limit, budget_cap_eur, concurrency, max_attempts)
  values (p_owner, p_actor, p_idempotency_key, p_name, p_campaign, p_prospect_limit, p_budget_cap_eur, p_concurrency, p_max_attempts)
  on conflict (owner_user_id, idempotency_key) where idempotency_key is not null do nothing
  returning * into r;
  if not found then
    select * into r from outreach_runs where owner_user_id = p_owner and idempotency_key = p_idempotency_key;
    return jsonb_build_object('created', false, 'run', outreach_run_view(r.id));
  end if;
  perform outreach_event(r.id, null, 'RUN_CREATED', p_actor, jsonb_build_object('name', p_name, 'owner', p_owner));
  return jsonb_build_object('created', true, 'run', outreach_run_view(r.id));
end $$;

-- Run state machine (authoritative). Repeating an action that is already in effect is a no-op.
--   start : CREATED → QUEUED
--   pause : QUEUED | RUNNING → PAUSED
--   resume: PAUSED → RUNNING (setup done) | QUEUED (setup not done)
--   stop  : CREATED | QUEUED | RUNNING | PAUSED → STOPPED  (pending prospects → CANCELLED)
--   system: QUEUED → RUNNING (setup claimed), RUNNING → COMPLETED, RUNNING → PAUSED (BUDGET_EXHAUSTED),
--           QUEUED | RUNNING | PAUSED → FAILED (setup failed permanently)
create or replace function outreach_run_action(p_run_id uuid, p_actor text, p_is_superadmin boolean, p_action text, p_reason text default null)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs; v_to text; v_noop boolean := false;
begin
  r := outreach_assert_run_access(p_run_id, p_actor, p_is_superadmin, true);
  if p_action = 'start' then
    if r.status = 'CREATED' then v_to := 'QUEUED'; elsif r.status in ('QUEUED','RUNNING') then v_noop := true; end if;
  elsif p_action = 'pause' then
    if r.status in ('QUEUED','RUNNING') then v_to := 'PAUSED'; elsif r.status = 'PAUSED' then v_noop := true; end if;
  elsif p_action = 'resume' then
    if r.status = 'PAUSED' then v_to := case when r.setup_state = 'DONE' then 'RUNNING' else 'QUEUED' end;
    elsif r.status in ('QUEUED','RUNNING') then v_noop := true; end if;
  elsif p_action = 'stop' then
    if r.status in ('CREATED','QUEUED','RUNNING','PAUSED') then v_to := 'STOPPED'; elsif r.status = 'STOPPED' then v_noop := true; end if;
  else
    raise exception 'OUTREACH_VALIDATION: unknown action %', p_action;
  end if;
  if v_noop then return outreach_run_view(r.id); end if;
  if v_to is null then raise exception 'OUTREACH_INVALID_TRANSITION: % -> %', r.status, p_action; end if;

  update outreach_runs set
    status = v_to,
    status_reason = case when v_to in ('PAUSED','STOPPED') then coalesce(p_reason, 'MANUAL') else null end,
    queued_at = case when v_to = 'QUEUED' then coalesce(queued_at, now()) else queued_at end,
    finished_at = case when v_to = 'STOPPED' then now() else finished_at end,
    updated_at = now()
  where id = r.id;
  if v_to = 'STOPPED' then
    update outreach_prospects set queue_state = 'CANCELLED', completed_at = now(), updated_at = now()
     where id in (select id from outreach_prospects where run_id = r.id and queue_state = 'PENDING' for update skip locked);
  end if;
  perform outreach_event(r.id, null, 'RUN_STATUS', p_actor, jsonb_build_object('from', r.status, 'to', v_to, 'action', p_action, 'reason', p_reason));
  if v_to = 'RUNNING' then perform outreach_maybe_complete_run(r.id); end if;
  return outreach_run_view(r.id);
end $$;

create or replace function outreach_set_run_budget(p_run_id uuid, p_actor text, p_is_superadmin boolean, p_budget_cap_eur numeric)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  r := outreach_assert_run_access(p_run_id, p_actor, p_is_superadmin, true);
  if r.status in ('COMPLETED','STOPPED','FAILED') then raise exception 'OUTREACH_INVALID_TRANSITION: % -> set_budget', r.status; end if;
  if p_budget_cap_eur is null or p_budget_cap_eur <= 0 or p_budget_cap_eur < r.spent_eur + r.reserved_eur then
    raise exception 'OUTREACH_VALIDATION: budget must be positive and not below committed spend (%)', r.spent_eur + r.reserved_eur;
  end if;
  update outreach_runs set budget_cap_eur = p_budget_cap_eur, updated_at = now() where id = r.id;
  perform outreach_event(r.id, null, 'RUN_BUDGET', p_actor, jsonb_build_object('from', r.budget_cap_eur, 'to', p_budget_cap_eur));
  return outreach_run_view(r.id);
end $$;

-- ─── Dedupe / suppression ────────────────────────────────────────────────────
-- Returns blocking reasons for a company/contact. Suppressions: global (owner NULL) or the tenant's own.
-- Dedupe is global across tenants (all outreach goes out under the AgentMakers name).
create or replace function outreach_blocking_reasons(
  p_owner text, p_email text, p_domain text, p_company_key text, p_contact_key text,
  p_exclude_prospect uuid default null, p_exclude_run uuid default null, p_include_in_progress boolean default false)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v jsonb := '[]'::jsonb;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_email_domain text := nullif(split_part(coalesce(v_email, ''), '@', 2), '');
begin
  select coalesce(jsonb_agg(distinct ('SUPPRESSED_' || s.kind || ':' || s.reason)), '[]'::jsonb) into v
  from outreach_suppressions s
  where (s.owner_user_id is null or s.owner_user_id = p_owner)
    and (s.expires_at is null or s.expires_at > now())
    and ((s.kind = 'EMAIL' and s.value = v_email)
      or (s.kind = 'DOMAIN' and (s.value = p_domain or s.value = v_email_domain))
      or (s.kind = 'COMPANY' and s.value = p_company_key)
      or (s.kind = 'CONTACT' and s.value = p_contact_key));
  if v_email is not null and exists (
      select 1 from outreach_prospects o
      where o.email = v_email and o.outcome in ('READY','NEEDS_REVIEW')
        and (p_exclude_prospect is null or o.id <> p_exclude_prospect)) then
    v := v || '["DUPLICATE_CONTACT"]'::jsonb;
  end if;
  if p_domain is not null and exists (
      select 1 from outreach_prospects o join outreach_runs r on r.id = o.run_id
      where o.domain = p_domain
        and (p_exclude_prospect is null or o.id <> p_exclude_prospect)
        and (p_exclude_run is null or o.run_id <> p_exclude_run)
        and (o.outcome in ('READY','NEEDS_REVIEW')
             or (p_include_in_progress and o.queue_state in ('PENDING','IN_PROGRESS') and r.status not in ('STOPPED','FAILED')))) then
    v := v || '["DUPLICATE_COMPANY"]'::jsonb;
  end if;
  return v;
end $$;

-- Public contract for the later pre-send gate (Stage 4) and manual checks.
create or replace function outreach_check_contactability(
  p_owner text, p_email text, p_domain text, p_company_key text, p_contact_key text, p_exclude_prospect uuid default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare v jsonb;
begin
  v := outreach_blocking_reasons(p_owner, p_email, p_domain, p_company_key, p_contact_key, p_exclude_prospect, null, false);
  return jsonb_build_object('blocked', jsonb_array_length(v) > 0, 'reasons', v);
end $$;

-- unsubscribe / bounce are always GLOBAL and may be recorded by anyone (they only restrict).
-- Other GLOBAL suppressions require a superadmin; tenant suppressions apply to that tenant only.
create or replace function outreach_add_suppression(
  p_actor text, p_is_superadmin boolean, p_global boolean, p_owner text, p_kind text, p_value text, p_reason text,
  p_note text default null, p_source text default 'manual', p_expires_at timestamptz default null)
returns jsonb language plpgsql set search_path = public as $$
declare v_owner text; v_value text := lower(trim(coalesce(p_value, ''))); v_row outreach_suppressions; v_created boolean := true;
begin
  if v_value = '' then raise exception 'OUTREACH_VALIDATION: suppression value is required'; end if;
  if p_reason in ('unsubscribe','bounce') or coalesce(p_global, false) then
    v_owner := null;
    if p_reason not in ('unsubscribe','bounce') and not coalesce(p_is_superadmin, false) then
      raise exception 'OUTREACH_FORBIDDEN: only a superadmin can add global suppressions';
    end if;
  else
    v_owner := coalesce(p_owner, p_actor);
    if v_owner is distinct from p_actor and not coalesce(p_is_superadmin, false) then
      raise exception 'OUTREACH_FORBIDDEN: cannot add suppressions for another account';
    end if;
  end if;
  insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source, created_by_user_id, expires_at)
  values (v_owner, p_kind, v_value, p_reason, p_note, coalesce(p_source, 'manual'), p_actor, p_expires_at)
  on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing
  returning * into v_row;
  if not found then
    v_created := false;
    select * into v_row from outreach_suppressions where coalesce(owner_user_id, '') = coalesce(v_owner, '') and kind = p_kind and value = v_value;
  end if;
  return jsonb_build_object('created', v_created, 'suppression', to_jsonb(v_row));
end $$;

-- ─── Campaign Brain cache ────────────────────────────────────────────────────
create or replace function outreach_campaign_brains_for_source(p_source_url text, p_language text)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'cache_key', cache_key, 'brain', brain) order by created_at), '[]'::jsonb)
  from outreach_campaign_brains where source_url = p_source_url and language = p_language
$$;

create or replace function outreach_put_campaign_brain(
  p_cache_key text, p_source_url text, p_language text, p_content_hash text, p_version text, p_llm_name text, p_brain jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare v_id uuid; v_created boolean;
begin
  insert into outreach_campaign_brains (cache_key, source_url, language, content_hash, version, llm_name, brain)
  values (p_cache_key, p_source_url, p_language, p_content_hash, p_version, p_llm_name, p_brain)
  on conflict (cache_key) do nothing
  returning id into v_id;
  v_created := v_id is not null;
  if v_id is null then
    update outreach_campaign_brains set last_used_at = now() where cache_key = p_cache_key returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'created', v_created);
end $$;

-- ─── Worker: sweep, claim, journal, ledger ───────────────────────────────────
-- Recovers expired leases (crashed / timed-out workers), cancels leftovers of stopped runs,
-- and completes runs that have nothing left to do.
create or replace function outreach_sweep(p_run_id uuid default null) returns void
language plpgsql set search_path = public as $$
declare p record; r outreach_runs; v_id uuid;
begin
  for p in
    select pr.id, pr.run_id, pr.lease_token, pr.attempts, rr.max_attempts
    from outreach_prospects pr join outreach_runs rr on rr.id = pr.run_id
    where pr.queue_state = 'IN_PROGRESS' and pr.lease_until < now() and (p_run_id is null or pr.run_id = p_run_id)
    for update of pr skip locked
  loop
    perform outreach_release_reservation(p.lease_token);
    if p.attempts >= p.max_attempts then
      update outreach_prospects set queue_state = 'FAILED', outcome = 'FAILED', outcome_reasons = '["LEASE_EXPIRED","ATTEMPTS_EXHAUSTED"]'::jsonb,
        last_error = 'LEASE_EXPIRED', lease_token = null, lease_until = null, completed_at = now(), updated_at = now()
      where id = p.id;
      perform outreach_event(p.run_id, p.id, 'PROSPECT_FAILED', 'system', jsonb_build_object('error', 'LEASE_EXPIRED', 'attempts', p.attempts));
    else
      update outreach_prospects set queue_state = 'PENDING', last_error = 'LEASE_EXPIRED', lease_token = null, lease_until = null,
        next_attempt_at = now(), updated_at = now()
      where id = p.id;
      perform outreach_event(p.run_id, p.id, 'PROSPECT_LEASE_EXPIRED', 'system', jsonb_build_object('attempts', p.attempts));
    end if;
    perform outreach_maybe_complete_run(p.run_id);
  end loop;

  for r in
    select * from outreach_runs
    where setup_state = 'IN_PROGRESS' and setup_lease_until < now() and (p_run_id is null or id = p_run_id)
    for update skip locked
  loop
    perform outreach_release_reservation(r.setup_lease_token);
    if r.setup_attempts >= r.max_attempts then
      update outreach_runs set setup_state = 'FAILED', setup_last_error = 'LEASE_EXPIRED', setup_lease_token = null, setup_lease_until = null,
        status = case when status in ('QUEUED','RUNNING','PAUSED') then 'FAILED' else status end,
        status_reason = case when status in ('QUEUED','RUNNING','PAUSED') then 'SETUP_FAILED: LEASE_EXPIRED' else status_reason end,
        finished_at = case when status in ('QUEUED','RUNNING','PAUSED') then now() else finished_at end,
        updated_at = now()
      where id = r.id;
      perform outreach_event(r.id, null, 'SETUP_FAILED', 'system', jsonb_build_object('error', 'LEASE_EXPIRED'));
    else
      update outreach_runs set setup_state = 'PENDING', setup_last_error = 'LEASE_EXPIRED', setup_lease_token = null, setup_lease_until = null,
        setup_next_attempt_at = now(), updated_at = now()
      where id = r.id;
      perform outreach_event(r.id, null, 'SETUP_LEASE_EXPIRED', 'system', null);
    end if;
  end loop;

  update outreach_prospects set queue_state = 'CANCELLED', completed_at = now(), updated_at = now()
  where id in (
    select p2.id from outreach_prospects p2 join outreach_runs r2 on r2.id = p2.run_id
    where r2.status = 'STOPPED' and p2.queue_state = 'PENDING' and (p_run_id is null or p2.run_id = p_run_id)
    for update of p2 skip locked);

  for v_id in
    select r3.id from outreach_runs r3
    where r3.status = 'RUNNING' and r3.setup_state = 'DONE' and (p_run_id is null or r3.id = p_run_id)
      and not exists (select 1 from outreach_prospects p3 where p3.run_id = r3.id and p3.queue_state in ('PENDING','IN_PROGRESS'))
  loop
    perform outreach_maybe_complete_run(v_id);
  end loop;
end $$;

-- Claims setup jobs and prospect jobs under a lease. Each claim atomically reserves budget against the
-- run row (row lock), so concurrent workers can never reserve the same remaining budget twice.
create or replace function outreach_claim_work(
  p_worker_id text, p_max_prospects int default 1, p_lease_seconds int default 900,
  p_reservation_eur numeric default 1.00, p_min_reservation_eur numeric default 0.05, p_run_id uuid default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_setups jsonb := '[]'::jsonb; v_prospects jsonb := '[]'::jsonb;
  r outreach_runs; r2 outreach_runs; c record; pr outreach_prospects;
  v_token uuid; v_avail numeric; v_grant numeric; v_inflight int; v_claimed int := 0; v_skip_runs uuid[] := '{}';
begin
  perform outreach_sweep(p_run_id);

  for r in
    select * from outreach_runs
    where status in ('QUEUED','RUNNING') and setup_state = 'PENDING'
      and coalesce(setup_next_attempt_at, '-infinity'::timestamptz) <= now()
      and (p_run_id is null or id = p_run_id)
    order by created_at
    for update skip locked
    limit 3
  loop
    v_avail := r.budget_cap_eur - r.spent_eur - r.reserved_eur;
    if v_avail < p_min_reservation_eur then
      update outreach_runs set status = 'PAUSED', status_reason = 'BUDGET_EXHAUSTED', updated_at = now() where id = r.id;
      perform outreach_event(r.id, null, 'RUN_STATUS', 'system', jsonb_build_object('from', r.status, 'to', 'PAUSED', 'reason', 'BUDGET_EXHAUSTED'));
      continue;
    end if;
    v_grant := least(p_reservation_eur, v_avail);
    v_token := gen_random_uuid();
    insert into outreach_budget_reservations (lease_token, run_id, prospect_id, reserved_eur, remaining_eur) values (v_token, r.id, null, v_grant, v_grant);
    update outreach_runs set
      reserved_eur = reserved_eur + v_grant, setup_state = 'IN_PROGRESS', setup_attempts = setup_attempts + 1,
      setup_lease_token = v_token, setup_lease_until = now() + make_interval(secs => p_lease_seconds),
      status = 'RUNNING', started_at = coalesce(started_at, now()), status_reason = null, updated_at = now()
    where id = r.id returning * into r2;
    if r.status <> 'RUNNING' then
      perform outreach_event(r.id, null, 'RUN_STATUS', 'system', jsonb_build_object('from', r.status, 'to', 'RUNNING'));
    end if;
    perform outreach_event(r.id, null, 'SETUP_CLAIMED', p_worker_id, jsonb_build_object('attempt', r2.setup_attempts, 'reservation_eur', v_grant));
    v_setups := v_setups || jsonb_build_array(jsonb_build_object('run', to_jsonb(r2), 'lease_token', v_token, 'reservation_eur', v_grant));
  end loop;

  -- One candidate row is locked at a time (SKIP LOCKED, LIMIT 1) so parallel workers never starve each other;
  -- a run that cannot take more work right now (not running / at concurrency / out of budget) is skipped.
  loop
    exit when v_claimed >= p_max_prospects;
    select p.id as prospect_id, p.run_id into c
    from outreach_prospects p join outreach_runs rr on rr.id = p.run_id
    where rr.status = 'RUNNING' and rr.setup_state = 'DONE' and p.queue_state = 'PENDING' and p.next_attempt_at <= now()
      and (p_run_id is null or p.run_id = p_run_id)
      and not (p.run_id = any (v_skip_runs))
    order by rr.created_at, p.position
    for update of p skip locked
    limit 1;
    exit when not found;
    select * into r from outreach_runs where id = c.run_id for update;
    if r.status <> 'RUNNING' then v_skip_runs := v_skip_runs || r.id; continue; end if;
    select count(*) into v_inflight from outreach_prospects where run_id = r.id and queue_state = 'IN_PROGRESS';
    if v_inflight >= r.concurrency then v_skip_runs := v_skip_runs || r.id; continue; end if;
    v_avail := r.budget_cap_eur - r.spent_eur - r.reserved_eur;
    if v_avail < p_min_reservation_eur then
      if v_inflight = 0 then
        update outreach_runs set status = 'PAUSED', status_reason = 'BUDGET_EXHAUSTED', updated_at = now() where id = r.id;
        perform outreach_event(r.id, null, 'RUN_STATUS', 'system', jsonb_build_object('from', 'RUNNING', 'to', 'PAUSED', 'reason', 'BUDGET_EXHAUSTED'));
      end if;
      v_skip_runs := v_skip_runs || r.id;
      continue;
    end if;
    v_grant := least(p_reservation_eur, v_avail);
    v_token := gen_random_uuid();
    insert into outreach_budget_reservations (lease_token, run_id, prospect_id, reserved_eur, remaining_eur) values (v_token, r.id, c.prospect_id, v_grant, v_grant);
    update outreach_runs set reserved_eur = reserved_eur + v_grant, updated_at = now() where id = r.id returning * into r2;
    update outreach_prospects set queue_state = 'IN_PROGRESS', attempts = attempts + 1, lease_token = v_token,
      lease_until = now() + make_interval(secs => p_lease_seconds), worker_id = p_worker_id,
      started_at = coalesce(started_at, now()), updated_at = now()
    where id = c.prospect_id returning * into pr;
    perform outreach_event(r.id, pr.id, 'PROSPECT_CLAIMED', p_worker_id, jsonb_build_object('attempt', pr.attempts, 'reservation_eur', v_grant));
    v_prospects := v_prospects || jsonb_build_array(jsonb_build_object('run', to_jsonb(r2), 'prospect', to_jsonb(pr), 'lease_token', v_token, 'reservation_eur', v_grant));
    v_claimed := v_claimed + 1;
  end loop;

  return jsonb_build_object('setups', v_setups, 'prospects', v_prospects);
end $$;

create or replace function outreach_get_journal(p_scope_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(call_key, result), '{}'::jsonb) from outreach_call_journal where scope_id = p_scope_id
$$;

-- Persists completed provider results (journal) and provider-call cost records (ledger), both idempotent,
-- and moves the spent amount from the lease's reservation to the run's spend. Ledger rows are accepted even
-- from a stale lease: money that was spent must always be recorded.
create or replace function outreach_record_calls(
  p_run_id uuid, p_prospect_id uuid, p_lease_token uuid, p_calls jsonb, p_journal jsonb, p_step text default null)
returns jsonb language plpgsql set search_path = public as $$
declare v_delta numeric := 0; v_rem numeric; v_consume numeric := 0;
begin
  insert into outreach_call_journal (scope_id, run_id, call_key, result)
  select coalesce(p_prospect_id, p_run_id), p_run_id, j->>'key', j->'result'
  from jsonb_array_elements(coalesce(p_journal, '[]'::jsonb)) j
  on conflict (scope_id, call_key) do nothing;

  with ins as (
    insert into outreach_provider_calls (id, run_id, prospect_id, lease_token, provider, operation, estimated_cost_eur, actual_cost_eur,
                                         effective_cost_eur, native_cost, result, detail, called_at)
    select (c->>'id')::uuid, p_run_id, p_prospect_id, p_lease_token, c->>'provider', c->>'operation',
           coalesce((c->>'estimated_cost_eur')::numeric, 0), (c->>'actual_cost_eur')::numeric,
           coalesce((c->>'actual_cost_eur')::numeric, (c->>'estimated_cost_eur')::numeric, 0),
           c->>'native_cost', c->>'result', c->>'detail', coalesce((c->>'timestamp')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_calls, '[]'::jsonb)) c
    on conflict (id) do nothing
    returning effective_cost_eur)
  select coalesce(sum(effective_cost_eur), 0) into v_delta from ins;

  if v_delta > 0 then
    if p_prospect_id is not null then
      update outreach_prospects set spent_eur = spent_eur + v_delta, updated_at = now() where id = p_prospect_id;
    end if;
    select remaining_eur into v_rem from outreach_budget_reservations where lease_token = p_lease_token and released_at is null for update;
    v_consume := least(coalesce(v_rem, 0), v_delta);
    if v_consume > 0 then
      update outreach_budget_reservations set remaining_eur = remaining_eur - v_consume where lease_token = p_lease_token;
    end if;
    update outreach_runs set spent_eur = spent_eur + v_delta, reserved_eur = greatest(0, reserved_eur - v_consume), updated_at = now()
    where id = p_run_id;
  end if;

  if p_step is not null and p_prospect_id is not null then
    update outreach_prospects set current_step = p_step, updated_at = now()
    where id = p_prospect_id and lease_token = p_lease_token and queue_state = 'IN_PROGRESS'
      and outreach_step_rank(p_step) > outreach_step_rank(current_step);
  end if;
  return jsonb_build_object('spent_delta_eur', v_delta);
end $$;

-- ─── Setup job results ───────────────────────────────────────────────────────
create or replace function outreach_complete_setup(
  p_run_id uuid, p_lease_token uuid, p_campaign_brain_id uuid, p_campaign_brain jsonb, p_summary jsonb, p_prospects jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs; x jsonb; v_reasons jsonb; v_blocked boolean; v_inserted int := 0; v_blocked_n int := 0; v_pid uuid;
begin
  select * into r from outreach_runs where id = p_run_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if r.setup_state <> 'IN_PROGRESS' or r.setup_lease_token is distinct from p_lease_token then
    return jsonb_build_object('accepted', false, 'reason', 'STALE_LEASE');
  end if;
  for x in select e from jsonb_array_elements(coalesce(p_prospects, '[]'::jsonb)) e order by e->>'domain' loop
    perform pg_advisory_xact_lock(hashtextextended('outreach:domain:' || (x->>'domain'), 0));
    v_reasons := outreach_blocking_reasons(r.owner_user_id, null, x->>'domain', x->>'company_key', null, null, p_run_id, true);
    v_blocked := jsonb_array_length(v_reasons) > 0;
    insert into outreach_prospects (run_id, owner_user_id, position, company_name, domain, company_key, company,
                                    queue_state, current_step, outcome, outcome_reasons, completed_at)
    values (p_run_id, r.owner_user_id, (x->>'position')::int, x->>'company_name', x->>'domain', x->>'company_key', x->'company',
            case when v_blocked then 'DONE' else 'PENDING' end, case when v_blocked then 'DONE' else 'RESEARCH' end,
            case when v_blocked then 'BLOCKED' else null end, v_reasons, case when v_blocked then now() else null end)
    on conflict (run_id, domain) do nothing
    returning id into v_pid;
    if v_pid is not null then
      v_inserted := v_inserted + 1;
      if v_blocked then
        v_blocked_n := v_blocked_n + 1;
        perform outreach_event(p_run_id, v_pid, 'PROSPECT_BLOCKED', 'system', jsonb_build_object('reasons', v_reasons));
      end if;
    end if;
  end loop;
  perform outreach_release_reservation(p_lease_token);
  update outreach_runs set setup_state = 'DONE', setup_lease_token = null, setup_lease_until = null, setup_last_error = null,
    campaign_brain_id = p_campaign_brain_id, campaign_brain = p_campaign_brain, discovery_summary = p_summary, updated_at = now()
  where id = p_run_id;
  perform outreach_event(p_run_id, null, 'SETUP_DONE', 'worker',
    jsonb_build_object('inserted', v_inserted, 'blocked', v_blocked_n, 'returned', p_summary->'returned', 'selected', p_summary->'selected'));
  perform outreach_maybe_complete_run(p_run_id);
  return jsonb_build_object('accepted', true, 'inserted', v_inserted, 'blocked', v_blocked_n);
end $$;

create or replace function outreach_fail_setup(p_run_id uuid, p_lease_token uuid, p_error text, p_retryable boolean default true)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs; v_terminal boolean;
begin
  select * into r from outreach_runs where id = p_run_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if r.setup_state <> 'IN_PROGRESS' or r.setup_lease_token is distinct from p_lease_token then
    return jsonb_build_object('accepted', false, 'reason', 'STALE_LEASE');
  end if;
  perform outreach_release_reservation(p_lease_token);
  v_terminal := (not coalesce(p_retryable, true)) or r.setup_attempts >= r.max_attempts;
  if v_terminal then
    update outreach_runs set setup_state = 'FAILED', setup_last_error = left(p_error, 1000), setup_lease_token = null, setup_lease_until = null,
      status = case when status in ('QUEUED','RUNNING','PAUSED') then 'FAILED' else status end,
      status_reason = case when status in ('QUEUED','RUNNING','PAUSED') then 'SETUP_FAILED: ' || left(p_error, 300) else status_reason end,
      finished_at = case when status in ('QUEUED','RUNNING','PAUSED') then now() else finished_at end,
      updated_at = now()
    where id = p_run_id;
    perform outreach_event(p_run_id, null, 'SETUP_FAILED', 'worker', jsonb_build_object('error', left(p_error, 500), 'attempts', r.setup_attempts));
  else
    update outreach_runs set setup_state = 'PENDING', setup_last_error = left(p_error, 1000), setup_lease_token = null, setup_lease_until = null,
      setup_next_attempt_at = now() + make_interval(secs => outreach_backoff_seconds(r.setup_attempts)), updated_at = now()
    where id = p_run_id;
    perform outreach_event(p_run_id, null, 'SETUP_RETRY_SCHEDULED', 'worker', jsonb_build_object('error', left(p_error, 500), 'attempts', r.setup_attempts));
  end if;
  return jsonb_build_object('accepted', true, 'terminal', v_terminal);
end $$;

create or replace function outreach_defer_setup_for_budget(p_run_id uuid, p_lease_token uuid, p_min_reservation_eur numeric)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  select * into r from outreach_runs where id = p_run_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if r.setup_state <> 'IN_PROGRESS' or r.setup_lease_token is distinct from p_lease_token then
    return jsonb_build_object('accepted', false, 'reason', 'STALE_LEASE');
  end if;
  perform outreach_release_reservation(p_lease_token);
  select * into r from outreach_runs where id = p_run_id;
  if r.budget_cap_eur - r.spent_eur - r.reserved_eur < p_min_reservation_eur then
    update outreach_runs set setup_state = 'PENDING', setup_attempts = greatest(setup_attempts - 1, 0), setup_last_error = 'BUDGET_EXHAUSTED',
      setup_lease_token = null, setup_lease_until = null, setup_next_attempt_at = now(),
      status = case when status in ('QUEUED','RUNNING') then 'PAUSED' else status end,
      status_reason = case when status in ('QUEUED','RUNNING') then 'BUDGET_EXHAUSTED' else status_reason end,
      updated_at = now()
    where id = p_run_id;
    perform outreach_event(p_run_id, null, 'RUN_STATUS', 'system', jsonb_build_object('from', r.status, 'to', 'PAUSED', 'reason', 'BUDGET_EXHAUSTED'));
    return jsonb_build_object('accepted', true, 'paused', true);
  end if;
  return outreach_fail_setup(p_run_id, p_lease_token, 'SETUP_RESERVATION_EXCEEDED', true);
end $$;

-- ─── Prospect job results ────────────────────────────────────────────────────
-- Shared retry/fail policy. Backoff 30s, 60s, 120s (capped). p_count_attempt = false defers without
-- consuming an attempt (budget deferral).
create or replace function outreach_requeue_or_fail_prospect(
  p_prospect_id uuid, p_error text, p_retryable boolean, p_count_attempt boolean, p_final jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare p outreach_prospects; v_max int; v_attempts int; v_terminal boolean;
begin
  select * into p from outreach_prospects where id = p_prospect_id for update;
  select max_attempts into v_max from outreach_runs where id = p.run_id;
  v_attempts := case when p_count_attempt then p.attempts else greatest(p.attempts - 1, 0) end;
  v_terminal := (not coalesce(p_retryable, true)) or (p_count_attempt and v_attempts >= v_max);
  perform outreach_release_reservation(p.lease_token);
  if v_terminal then
    update outreach_prospects set queue_state = 'FAILED', outcome = 'FAILED',
      outcome_reasons = coalesce(p_final->'reasons', jsonb_build_array(left(p_error, 300))),
      warnings = coalesce(p_final->'warnings', warnings),
      stages = coalesce(p_final->'stages', stages), record = coalesce(p_final->'record', record),
      email = coalesce(lower(p_final->>'email'), email), contact_name = coalesce(p_final->>'contact_name', contact_name),
      attempts = v_attempts, last_error = left(p_error, 1000), lease_token = null, lease_until = null,
      completed_at = now(), updated_at = now()
    where id = p.id;
    perform outreach_event(p.run_id, p.id, 'PROSPECT_FAILED', 'worker', jsonb_build_object('error', left(p_error, 500), 'attempts', v_attempts));
  else
    update outreach_prospects set queue_state = 'PENDING', attempts = v_attempts, last_error = left(p_error, 1000),
      lease_token = null, lease_until = null,
      next_attempt_at = case when p_count_attempt then now() + make_interval(secs => outreach_backoff_seconds(v_attempts)) else now() end,
      updated_at = now()
    where id = p.id;
    perform outreach_event(p.run_id, p.id, 'PROSPECT_RETRY_SCHEDULED', 'worker', jsonb_build_object('error', left(p_error, 500), 'attempts', v_attempts));
  end if;
  perform outreach_maybe_complete_run(p.run_id);
  return jsonb_build_object('accepted', true, 'terminal', v_terminal, 'attempts', v_attempts);
end $$;

create or replace function outreach_fail_prospect(
  p_prospect_id uuid, p_lease_token uuid, p_error text, p_retryable boolean default true, p_final jsonb default null)
returns jsonb language plpgsql set search_path = public as $$
declare p outreach_prospects;
begin
  select * into p from outreach_prospects where id = p_prospect_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if p.queue_state <> 'IN_PROGRESS' or p.lease_token is distinct from p_lease_token then
    return jsonb_build_object('accepted', false, 'reason', 'STALE_LEASE');
  end if;
  return outreach_requeue_or_fail_prospect(p.id, p_error, p_retryable, true, p_final);
end $$;

-- The prospect hit its budget reservation. If the RUN budget is exhausted: defer (no attempt used) and pause
-- the run with BUDGET_EXHAUSTED. Otherwise the per-prospect reservation was too small: ordinary retry.
create or replace function outreach_defer_prospect_for_budget(p_prospect_id uuid, p_lease_token uuid, p_min_reservation_eur numeric)
returns jsonb language plpgsql set search_path = public as $$
declare p outreach_prospects; r outreach_runs;
begin
  select * into p from outreach_prospects where id = p_prospect_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if p.queue_state <> 'IN_PROGRESS' or p.lease_token is distinct from p_lease_token then
    return jsonb_build_object('accepted', false, 'reason', 'STALE_LEASE');
  end if;
  perform outreach_release_reservation(p.lease_token);
  select * into r from outreach_runs where id = p.run_id for update;
  if r.budget_cap_eur - r.spent_eur - r.reserved_eur < p_min_reservation_eur then
    perform outreach_requeue_or_fail_prospect(p.id, 'BUDGET_EXHAUSTED', true, false, null);
    if r.status = 'RUNNING' then
      update outreach_runs set status = 'PAUSED', status_reason = 'BUDGET_EXHAUSTED', updated_at = now() where id = r.id;
      perform outreach_event(r.id, null, 'RUN_STATUS', 'system', jsonb_build_object('from', 'RUNNING', 'to', 'PAUSED', 'reason', 'BUDGET_EXHAUSTED'));
    end if;
    return jsonb_build_object('accepted', true, 'paused', r.status = 'RUNNING', 'terminal', false);
  end if;
  return outreach_requeue_or_fail_prospect(p.id, 'PROSPECT_RESERVATION_EXCEEDED', true, true, null);
end $$;

-- Final result of the Phase 0 pipeline for one prospect. Only the current lease holder may complete it
-- (a duplicate / stale execution is rejected without writing). READY / NEEDS_REVIEW are re-checked against
-- suppressions and global duplicates under a per-email advisory lock; a hit becomes BLOCKED.
create or replace function outreach_complete_prospect(p_prospect_id uuid, p_lease_token uuid, p_result jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  p outreach_prospects; v_outcome text := p_result->>'outcome'; v_reasons jsonb := coalesce(p_result->'reasons', '[]'::jsonb);
  v_email text := nullif(lower(trim(coalesce(p_result->>'email', ''))), ''); v_block jsonb; v_cb uuid;
begin
  select * into p from outreach_prospects where id = p_prospect_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if p.queue_state <> 'IN_PROGRESS' or p.lease_token is distinct from p_lease_token then
    return jsonb_build_object('accepted', false, 'reason', 'STALE_LEASE');
  end if;
  if v_outcome in ('READY','NEEDS_REVIEW') then
    if v_email is not null then perform pg_advisory_xact_lock(hashtextextended('outreach:email:' || v_email, 0)); end if;
    perform pg_advisory_xact_lock(hashtextextended('outreach:domain:' || p.domain, 0));
    v_block := outreach_blocking_reasons(p.owner_user_id, v_email, p.domain, p.company_key, p_result->>'contact_key', p.id, null, false);
    if jsonb_array_length(v_block) > 0 then
      v_reasons := v_block || jsonb_build_array('PIPELINE_STATUS:' || v_outcome);
      v_outcome := 'BLOCKED';
    end if;
  end if;
  update outreach_prospects set queue_state = 'DONE', current_step = 'DONE', outcome = v_outcome, outcome_reasons = v_reasons,
    warnings = coalesce(p_result->'warnings', '[]'::jsonb), email = v_email, contact_name = p_result->>'contact_name',
    contact_key = p_result->>'contact_key', stages = p_result->'stages', record = p_result->'record',
    last_error = null, lease_token = null, lease_until = null, completed_at = now(), updated_at = now()
  where id = p.id;

  if jsonb_typeof(p_result->'company_brain') = 'object' then
    insert into outreach_company_brains (prospect_id, run_id, owner_user_id, domain, company_name, website, pages, fetch_errors,
                                         quarantined_snippets, fit, brief)
    values (p.id, p.run_id, p.owner_user_id, p.domain, p.company_name, p_result->'company_brain'->>'website',
            coalesce(p_result->'company_brain'->'pages', '[]'::jsonb), coalesce(p_result->'company_brain'->'fetch_errors', '[]'::jsonb),
            coalesce(p_result->'company_brain'->'quarantined_snippets', '[]'::jsonb), p_result->'company_brain'->'fit', p_result->'company_brain'->'brief')
    on conflict (prospect_id) do nothing
    returning id into v_cb;
    if v_cb is not null then
      insert into outreach_evidence (company_brain_id, prospect_id, kind, ref, signal, polarity, strength, statement, snippet, source_url, based_on, confidence, data)
      select v_cb, p.id, e->>'kind', e->>'ref', e->>'signal', e->>'polarity', e->>'strength', e->>'statement', e->>'snippet', e->>'source_url',
             e->'based_on', e->>'confidence', coalesce(e->'data', '{}'::jsonb)
      from jsonb_array_elements(coalesce(p_result->'evidence', '[]'::jsonb)) e
      on conflict (company_brain_id, kind, ref) do nothing;
    end if;
  end if;

  perform outreach_release_reservation(p_lease_token);
  perform outreach_event(p.run_id, p.id, 'PROSPECT_DONE', 'worker', jsonb_build_object('outcome', v_outcome));
  perform outreach_maybe_complete_run(p.run_id);
  return jsonb_build_object('accepted', true, 'outcome', v_outcome, 'reasons', v_reasons);
end $$;

-- ─── Reviews (Stage 3 contract) ──────────────────────────────────────────────
create or replace function outreach_record_review_decision(
  p_prospect_id uuid, p_actor text, p_is_superadmin boolean, p_decision text, p_reason text default null, p_notes text default null)
returns jsonb language plpgsql set search_path = public as $$
declare p outreach_prospects; v_id uuid;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found or (not coalesce(p_is_superadmin, false) and p.owner_user_id is distinct from p_actor) then
    raise exception 'OUTREACH_NOT_FOUND';
  end if;
  if p.queue_state <> 'DONE' or p.outcome not in ('READY','NEEDS_REVIEW') then
    raise exception 'OUTREACH_INVALID_TRANSITION: % -> review', coalesce(p.outcome, p.queue_state);
  end if;
  insert into outreach_review_decisions (prospect_id, run_id, owner_user_id, reviewer_user_id, decision, reason, notes, snapshot)
  values (p.id, p.run_id, p.owner_user_id, p_actor, p_decision, p_reason, p_notes,
          jsonb_build_object('outcome', p.outcome, 'outcome_reasons', p.outcome_reasons, 'email', p.email))
  returning id into v_id;
  perform outreach_event(p.run_id, p.id, 'REVIEW_DECISION', p_actor, jsonb_build_object('decision', p_decision));
  return jsonb_build_object('id', v_id, 'decision', p_decision);
end $$;

-- ─── Reads (tenant-scoped) ───────────────────────────────────────────────────
create or replace function outreach_get_run(p_run_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  r := outreach_assert_run_access(p_run_id, p_actor, p_is_superadmin, false);
  return outreach_run_view(r.id);
end $$;

create or replace function outreach_list_runs(p_actor text, p_is_superadmin boolean, p_limit int default 50)
returns jsonb language sql set search_path = public as $$
  select coalesce(jsonb_agg(outreach_run_view(s.id) order by s.created_at desc), '[]'::jsonb)
  from (select id, created_at from outreach_runs
        where coalesce(p_is_superadmin, false) or owner_user_id = p_actor
        order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) s
$$;

create or replace function outreach_list_prospects(p_run_id uuid, p_actor text, p_is_superadmin boolean, p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  r := outreach_assert_run_access(p_run_id, p_actor, p_is_superadmin, false);
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.position) from (
      select id, position, company_name, domain, queue_state, current_step, attempts, outcome, outcome_reasons, warnings,
             email, contact_name, spent_eur, last_error, started_at, completed_at
      from outreach_prospects where run_id = r.id order by position
      limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb);
end $$;

create or replace function outreach_list_events(p_run_id uuid, p_actor text, p_is_superadmin boolean, p_after_id bigint default 0, p_limit int default 200)
returns jsonb language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  r := outreach_assert_run_access(p_run_id, p_actor, p_is_superadmin, false);
  return coalesce((
    select jsonb_agg(to_jsonb(e) order by e.id) from (
      select id, prospect_id, type, actor, data, created_at from outreach_events
      where run_id = r.id and id > coalesce(p_after_id, 0) order by id
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)) e), '[]'::jsonb);
end $$;

-- Used by the worker to decide whether to keep its continuation chain alive.
create or replace function outreach_pending_work() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'due_now',
      (select count(*) from outreach_runs where status in ('QUEUED','RUNNING') and setup_state = 'PENDING'
         and coalesce(setup_next_attempt_at, '-infinity'::timestamptz) <= now())
      + (select count(*) from outreach_prospects p join outreach_runs r on r.id = p.run_id
         where r.status = 'RUNNING' and r.setup_state = 'DONE' and p.queue_state = 'PENDING' and p.next_attempt_at <= now()),
    'next_due_at', least(
      (select min(setup_next_attempt_at) from outreach_runs where status in ('QUEUED','RUNNING') and setup_state = 'PENDING'),
      (select min(p.next_attempt_at) from outreach_prospects p join outreach_runs r on r.id = p.run_id
         where r.status = 'RUNNING' and r.setup_state = 'DONE' and p.queue_state = 'PENDING')),
    'in_progress',
      (select count(*) from outreach_prospects where queue_state = 'IN_PROGRESS')
      + (select count(*) from outreach_runs where setup_state = 'IN_PROGRESS'))
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Security: server-side (service_role) only.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text; f record;
begin
  foreach t in array array['outreach_campaign_brains','outreach_runs','outreach_prospects','outreach_company_brains','outreach_evidence',
                           'outreach_provider_calls','outreach_call_journal','outreach_budget_reservations','outreach_review_decisions',
                           'outreach_suppressions','outreach_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from public, anon, authenticated', t);
    execute format('grant all on table %I to service_role', t);
  end loop;
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'outreach\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Make the new functions visible to the Supabase API (PostgREST) immediately.
notify pgrst, 'reload schema';
