-- ════════════════════════════════════════════════════════════════════════════
-- AgentMakers Outreach — Stage 4: controlled sending (Smartlead), replies, Inbox, CRM promotion
--
-- Additive to the Stage 2 and Stage 3 migrations (apply those first).
-- NOT applied automatically. Apply manually in the Supabase SQL Editor. Safe to re-run.
-- Same security model: RLS on, no policies, service_role only, tenant checks inside the functions.
--
-- Sending is OFF by default (outreach_sending_config.sending_enabled = false).
-- Resend stays transactional only; cold email + follow-ups go through Smartlead.
-- The only change outside outreach_* objects: public.leads gets a nullable outreach_prospect_id column
-- (+ partial unique index) so CRM promotion is idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Global sending configuration (single row) ───────────────────────────────
create table if not exists outreach_sending_config (
  id                     int primary key default 1 check (id = 1),
  sending_enabled        boolean not null default false,          -- master kill switch
  autopilot_enabled      boolean not null default false,          -- AUTOPILOT runs may auto-queue READY prospects
  daily_new_leads_cap    int not null default 10 check (daily_new_leads_cap between 0 and 200),
  max_pushes_per_tick    int not null default 5 check (max_pushes_per_tick between 1 and 50),
  test_recipients        text[] not null default '{}',            -- non-empty = ONLY these addresses can be pushed
  followup_delays_days   int[] not null default '{3,4}',          -- step 2 after 3 days, step 3 four days later (day 7)
  schedule               jsonb not null default '{"timezone":"Europe/Amsterdam","days":[1,2,3,4,5],"start_hour":"09:00","end_hour":"17:00","min_time_btw_emails":10}',
  email_account_ids      text[] not null default '{}',            -- Smartlead mailboxes; empty = every active mailbox
  daily_llm_budget_eur   numeric(10,4) not null default 2 check (daily_llm_budget_eur >= 0),
  kill_reason            text,
  updated_by             text,
  updated_at             timestamptz not null default now()
);
insert into outreach_sending_config (id) values (1) on conflict (id) do nothing;

-- Audit trail for global (non-run) actions: configuration, kill switch, webhook problems.
create table if not exists outreach_audit_log (
  id          bigint generated always as identity primary key,
  actor       text,
  action      text not null,
  data        jsonb,
  created_at  timestamptz not null default now()
);

-- ─── Run ↔ provider campaign ──────────────────────────────────────────────────
alter table outreach_runs add column if not exists provider_campaign_id text;
alter table outreach_runs add column if not exists provider_campaign_status text;
alter table outreach_runs add column if not exists provider_campaign_error text;
alter table outreach_runs add column if not exists provider_lock_until timestamptz;

-- ─── Prospect → CRM lead ─────────────────────────────────────────────────────
alter table outreach_prospects add column if not exists promoted_lead_id uuid;
alter table outreach_prospects add column if not exists promoted_at timestamptz;

alter table public.leads add column if not exists outreach_prospect_id uuid;
create unique index if not exists leads_outreach_prospect_uidx on public.leads (outreach_prospect_id) where outreach_prospect_id is not null;

-- ─── Sends: one per prospect; doubles as the Inbox conversation ──────────────
create table if not exists outreach_sends (
  id                    uuid primary key default gen_random_uuid(),
  prospect_id           uuid not null unique references outreach_prospects(id) on delete cascade,
  run_id                uuid not null references outreach_runs(id) on delete cascade,
  owner_user_id         text not null,
  email                 text not null,
  domain                text not null,
  contact_name          text,
  first_name            text,
  last_name             text,
  company_name          text not null,
  website               text,
  language              text not null default 'nl',
  subject               text not null,                 -- step 1 subject exactly as pushed
  body                  text not null,                 -- step 1 body exactly as pushed (incl. opt-out line)
  sequence              jsonb not null,                -- every step {step, delay_days, subject, body}
  state                 text not null default 'QUEUED'
                        check (state in ('QUEUED','PUSHING','ACTIVE','COMPLETED','REPLIED','BOUNCED','UNSUBSCRIBED','STOPPED','CANCELLED','FAILED')),
  state_reason          text,
  queue_source          text not null default 'manual' check (queue_source in ('manual','autopilot')),
  queued_by             text not null,
  queued_at             timestamptz not null default now(),
  attempts              int not null default 0,
  next_attempt_at       timestamptz not null default now(),
  lease_token           uuid,
  lease_until           timestamptz,
  last_error            text,
  provider              text not null default 'smartlead',
  provider_campaign_id  text,
  provider_lead_id      text,
  pushed_at             timestamptz,
  first_sent_at         timestamptz,
  last_sent_at          timestamptz,
  steps_sent            int not null default 0,
  stopped_at            timestamptz,
  provider_stopped_at   timestamptz,                    -- lead paused/removed at the provider
  inbox_status          text not null default 'NONE' check (inbox_status in ('NONE','NEEDS_ACTION','WAITING','DONE')),
  disposition           text check (disposition in ('INTERESTED','MEETING','NOT_NOW','NOT_INTERESTED','WRONG_PERSON','UNSUBSCRIBED','CLOSED')),
  last_classification   text,
  last_inbound_at       timestamptz,
  last_outbound_at      timestamptz,
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- Global dedupe: an address is contacted at most once, across every account (cancelled = never pushed).
create unique index if not exists outreach_sends_email_uidx on outreach_sends (email) where state <> 'CANCELLED';
create index if not exists outreach_sends_domain_idx on outreach_sends (domain) where state <> 'CANCELLED';
create index if not exists outreach_sends_claim_idx on outreach_sends (state, next_attempt_at);
create index if not exists outreach_sends_owner_idx on outreach_sends (owner_user_id, updated_at desc);
create index if not exists outreach_sends_run_idx on outreach_sends (run_id);
create index if not exists outreach_sends_provider_idx on outreach_sends (provider_campaign_id, email);

-- ─── Messages (outbound sequence steps, inbound replies, manual replies) ──────
create table if not exists outreach_messages (
  id                         uuid primary key default gen_random_uuid(),
  send_id                    uuid not null references outreach_sends(id) on delete cascade,
  prospect_id                uuid not null references outreach_prospects(id) on delete cascade,
  run_id                     uuid not null references outreach_runs(id) on delete cascade,
  owner_user_id              text not null,
  direction                  text not null check (direction in ('OUTBOUND','INBOUND')),
  kind                       text not null check (kind in ('SEQUENCE','MANUAL_REPLY','REPLY')),
  status                     text not null default 'RECORDED' check (status in ('RECORDED','PENDING','SENT','FAILED')),
  sequence_number            int,
  from_email                 text,
  to_email                   text,
  subject                    text,
  body_text                  text,
  provider_message_id        text,
  provider_stats_id          text,
  occurred_at                timestamptz not null default now(),
  classification             text check (classification in ('INTERESTED','QUESTION','NOT_NOW','NOT_INTERESTED','WRONG_PERSON','OOO','UNSUBSCRIBE','OTHER')),
  classification_confidence  numeric(4,3),
  classification_source      text,
  summary                    text,
  suggested_reply            text,
  suggested_reply_status     text not null default 'NONE' check (suggested_reply_status in ('NONE','READY','REJECTED','USED','FAILED')),
  suggested_reply_issues     jsonb,
  analysis_state             text not null default 'NONE' check (analysis_state in ('NONE','PENDING','RUNNING','DONE','FAILED','SKIPPED')),
  analysis_started_at        timestamptz,
  analysis_attempts          int not null default 0,
  idempotency_key            text,
  created_by_user_id         text,
  error                      text,
  created_at                 timestamptz not null default now()
);
create unique index if not exists outreach_messages_provider_uidx on outreach_messages (send_id, direction, provider_message_id) where provider_message_id is not null;
create unique index if not exists outreach_messages_seq_uidx on outreach_messages (send_id, sequence_number) where kind = 'SEQUENCE' and sequence_number is not null;
create unique index if not exists outreach_messages_idem_uidx on outreach_messages (idempotency_key) where idempotency_key is not null;
create index if not exists outreach_messages_send_idx on outreach_messages (send_id, occurred_at);
create index if not exists outreach_messages_analysis_idx on outreach_messages (analysis_state) where analysis_state in ('PENDING','RUNNING');

-- ─── Webhook idempotency + raw audit ─────────────────────────────────────────
create table if not exists outreach_webhook_events (
  id            text primary key,                     -- provider request id, or sha256 of the raw body
  provider      text not null,
  event_type    text not null,
  campaign_id   text,
  email         text,
  payload       jsonb,
  result        jsonb,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);
create index if not exists outreach_webhook_events_received_idx on outreach_webhook_events (received_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- Functions
-- ════════════════════════════════════════════════════════════════════════════

create or replace function outreach_sending_config_view() returns jsonb
language sql stable set search_path = public as $$
  select to_jsonb(c) from outreach_sending_config c where c.id = 1
$$;

-- Turning sending OFF (kill switch) is allowed for every admin of any account; every other change needs a superadmin.
create or replace function outreach_set_sending_config(p_actor text, p_is_superadmin boolean, p_patch jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare c outreach_sending_config; k text;
begin
  select * into c from outreach_sending_config where id = 1 for update;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'OUTREACH_VALIDATION: patch must be an object'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('sending_enabled','autopilot_enabled','daily_new_leads_cap','max_pushes_per_tick','test_recipients','followup_delays_days',
                 'schedule','email_account_ids','daily_llm_budget_eur','kill_reason') then
      raise exception 'OUTREACH_VALIDATION: unknown setting %', k;
    end if;
  end loop;
  if not coalesce(p_is_superadmin, false) then
    if exists (select 1 from jsonb_object_keys(p_patch) x where x not in ('sending_enabled','kill_reason'))
       or (p_patch ? 'sending_enabled' and (p_patch->'sending_enabled') is distinct from 'false'::jsonb) then
      raise exception 'OUTREACH_FORBIDDEN: only a superadmin can change sending settings (any admin can switch sending off)';
    end if;
  end if;
  update outreach_sending_config set
    sending_enabled      = coalesce((p_patch->>'sending_enabled')::boolean, sending_enabled),
    autopilot_enabled    = coalesce((p_patch->>'autopilot_enabled')::boolean, autopilot_enabled),
    daily_new_leads_cap  = coalesce((p_patch->>'daily_new_leads_cap')::int, daily_new_leads_cap),
    max_pushes_per_tick  = coalesce((p_patch->>'max_pushes_per_tick')::int, max_pushes_per_tick),
    test_recipients      = case when p_patch ? 'test_recipients'
                                then array(select distinct lower(btrim(x)) from jsonb_array_elements_text(p_patch->'test_recipients') x where btrim(x) <> '')
                                else test_recipients end,
    followup_delays_days = case when p_patch ? 'followup_delays_days'
                                then array(select (x)::int from jsonb_array_elements_text(p_patch->'followup_delays_days') x) else followup_delays_days end,
    schedule             = coalesce(p_patch->'schedule', schedule),
    email_account_ids    = case when p_patch ? 'email_account_ids'
                                then array(select x from jsonb_array_elements_text(p_patch->'email_account_ids') x) else email_account_ids end,
    daily_llm_budget_eur = coalesce((p_patch->>'daily_llm_budget_eur')::numeric, daily_llm_budget_eur),
    kill_reason          = case when p_patch ? 'kill_reason' then p_patch->>'kill_reason'
                                when (p_patch->>'sending_enabled')::boolean then null else kill_reason end,
    updated_by = p_actor, updated_at = now()
  where id = 1;
  if exists (select 1 from outreach_sending_config where id = 1 and (array_length(followup_delays_days, 1) is distinct from 2
             or exists (select 1 from unnest(followup_delays_days) d where d < 1 or d > 30))) then
    raise exception 'OUTREACH_VALIDATION: followup_delays_days needs exactly two values between 1 and 30';
  end if;
  insert into outreach_audit_log (actor, action, data) values (p_actor, 'SENDING_CONFIG', jsonb_build_object('before', to_jsonb(c), 'patch', p_patch));
  return outreach_sending_config_view();
end $$;

-- Suppressions that apply to an address/company for an account (global ones included).
create or replace function outreach_suppression_reasons(p_owner text, p_email text, p_domain text, p_company_key text, p_contact_key text)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(distinct ('SUPPRESSED_' || s.kind || ':' || s.reason)), '[]'::jsonb)
  from outreach_suppressions s
  where (s.owner_user_id is null or s.owner_user_id = p_owner)
    and (s.expires_at is null or s.expires_at > now())
    and ((s.kind = 'EMAIL' and s.value = lower(p_email))
      or (s.kind = 'DOMAIN' and (s.value = p_domain or s.value = split_part(lower(coalesce(p_email, '')), '@', 2)))
      or (s.kind = 'COMPANY' and s.value = p_company_key)
      or (s.kind = 'CONTACT' and s.value = p_contact_key))
$$;

-- Registrable-ish host of a free-text website ("https://www.x.nl/contact" → "x.nl").
create or replace function outreach_host_of(p_url text) returns text
language sql immutable set search_path = public as $$
  select nullif(lower(regexp_replace(regexp_replace(btrim(coalesce(p_url, '')), '^[a-zA-Z]+://', ''), '^(www\.)?([^/:?#]+).*$', '\2')), '')
$$;

-- FINAL PRE-SEND GATE. Hard blockers only; an empty array means the prospect may be pushed.
-- Evaluated when queueing AND again (inside the claim transaction) immediately before every push.
create or replace function outreach_send_gate(p_prospect_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare p outreach_prospects; r outreach_runs; v jsonb := '[]'::jsonb; v_approved boolean;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found then return '["NOT_FOUND"]'::jsonb; end if;
  select * into r from outreach_runs where id = p.run_id;
  if p.queue_state <> 'DONE' or p.outcome is distinct from 'READY' then v := v || jsonb_build_array('NOT_READY:' || coalesce(p.outcome, p.queue_state)); end if;
  if r.status in ('STOPPED','FAILED') then v := v || jsonb_build_array('RUN_' || r.status); end if;
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

create or replace function outreach_send_view(p_send outreach_sends) returns jsonb
language sql stable set search_path = public as $$
  select to_jsonb(p_send) - 'lease_token'
$$;

-- Queue one READY prospect. p_message = {subject, body, sequence, first_name, last_name, language} built server-side
-- from the stored (validated) Phase 0 email. Idempotent per prospect. Returns {ok, created, send} or {ok:false, blockers}.
create or replace function outreach_queue_send(p_prospect_id uuid, p_actor text, p_is_superadmin boolean, p_source text, p_message jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare p outreach_prospects; s outreach_sends; v_blockers jsonb;
begin
  select * into p from outreach_prospects where id = p_prospect_id for update;
  if not found or (not coalesce(p_is_superadmin, false) and p.owner_user_id is distinct from p_actor) then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if coalesce(p_source, 'manual') not in ('manual','autopilot') then raise exception 'OUTREACH_VALIDATION: unknown source'; end if;
  select * into s from outreach_sends where prospect_id = p.id;
  if found and s.state <> 'CANCELLED' then return jsonb_build_object('ok', true, 'created', false, 'send', outreach_send_view(s)); end if;
  if p.email is not null then perform pg_advisory_xact_lock(hashtextextended('outreach:email:' || p.email, 0)); end if;
  perform pg_advisory_xact_lock(hashtextextended('outreach:domain:' || p.domain, 0));
  v_blockers := outreach_send_gate(p.id);
  if coalesce(btrim(p_message->>'subject'), '') = '' or coalesce(btrim(p_message->>'body'), '') = ''
     or jsonb_typeof(p_message->'sequence') is distinct from 'array' then
    v_blockers := v_blockers || '["NO_MESSAGE"]'::jsonb;
  end if;
  if jsonb_array_length(v_blockers) > 0 then
    perform outreach_event(p.run_id, p.id, 'SEND_QUEUE_REFUSED', p_actor, jsonb_build_object('blockers', v_blockers, 'source', p_source));
    return jsonb_build_object('ok', false, 'blockers', v_blockers);
  end if;
  if found then delete from outreach_sends where id = s.id; end if;   -- a cancelled, never-pushed row is replaced
  insert into outreach_sends (prospect_id, run_id, owner_user_id, email, domain, contact_name, first_name, last_name, company_name, website,
                              language, subject, body, sequence, queue_source, queued_by)
  values (p.id, p.run_id, p.owner_user_id, p.email, p.domain, p.contact_name, p_message->>'first_name', p_message->>'last_name', p.company_name,
          p.company->>'website', coalesce(p_message->>'language', 'nl'), p_message->>'subject', p_message->>'body', p_message->'sequence',
          coalesce(p_source, 'manual'), p_actor)
  returning * into s;
  perform outreach_event(p.run_id, p.id, 'SEND_QUEUED', p_actor, jsonb_build_object('send_id', s.id, 'source', p_source));
  return jsonb_build_object('ok', true, 'created', true, 'send', outreach_send_view(s));
end $$;

create or replace function outreach_cancel_send(p_send_id uuid, p_actor text, p_is_superadmin boolean, p_reason text default null)
returns jsonb language plpgsql set search_path = public as $$
declare s outreach_sends;
begin
  select * into s from outreach_sends where id = p_send_id for update;
  if not found or (not coalesce(p_is_superadmin, false) and s.owner_user_id is distinct from p_actor) then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if s.state <> 'QUEUED' then raise exception 'OUTREACH_INVALID_TRANSITION: % -> cancel', s.state; end if;
  update outreach_sends set state = 'CANCELLED', state_reason = coalesce(p_reason, 'MANUAL'), updated_at = now() where id = s.id returning * into s;
  perform outreach_event(s.run_id, s.prospect_id, 'SEND_CANCELLED', p_actor, jsonb_build_object('send_id', s.id, 'reason', p_reason));
  return outreach_send_view(s);
end $$;

-- READY prospects of AUTOPILOT runs that are not queued yet (only when autopilot + sending are enabled globally).
create or replace function outreach_autopilot_candidates(p_limit int default 20) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x.id), '[]'::jsonb) from (
    select p.id from outreach_prospects p join outreach_runs r on r.id = p.run_id
    where r.sending_mode = 'AUTOPILOT' and r.status in ('RUNNING','COMPLETED') and p.outcome = 'READY' and p.queue_state = 'DONE'
      and not exists (select 1 from outreach_sends s where s.prospect_id = p.id)
      and exists (select 1 from outreach_sending_config c where c.id = 1 and c.sending_enabled and c.autopilot_enabled)
    order by p.completed_at limit least(greatest(coalesce(p_limit, 20), 1), 100)) x
$$;

-- Claim QUEUED sends for pushing. Kill switch, daily cap, test allowlist, run state and the FINAL gate are all
-- evaluated here, inside the same transaction that leases the row. Blocked sends are cancelled with the reasons.
create or replace function outreach_claim_sends(p_worker_id text, p_max int, p_lease_seconds int default 300)
returns jsonb language plpgsql set search_path = public as $$
declare
  c outreach_sending_config; v_today int; v_inflight int; v_room int; s outreach_sends; v_blockers jsonb; v_out jsonb := '[]'::jsonb;
  v_cancelled jsonb := '[]'::jsonb; v_token uuid;
begin
  select * into c from outreach_sending_config where id = 1;
  if not c.sending_enabled then return jsonb_build_object('enabled', false, 'sends', '[]'::jsonb, 'cancelled', '[]'::jsonb); end if;
  select count(*) into v_today from outreach_sends where pushed_at >= date_trunc('day', now());
  select count(*) into v_inflight from outreach_sends where state = 'PUSHING' and lease_until > now();
  v_room := least(greatest(coalesce(p_max, 1), 0), c.max_pushes_per_tick, greatest(c.daily_new_leads_cap - v_today - v_inflight, 0));
  for s in
    select * from outreach_sends x
    where ((x.state = 'QUEUED' and x.next_attempt_at <= now()) or (x.state = 'PUSHING' and x.lease_until < now()))
      and exists (select 1 from outreach_runs r where r.id = x.run_id and r.status not in ('PAUSED','CREATED'))
      and (cardinality(c.test_recipients) = 0 or x.email = any (c.test_recipients))
    order by x.queued_at
    for update skip locked
  loop
    v_blockers := outreach_send_gate(s.prospect_id);
    if jsonb_array_length(v_blockers) > 0 then
      update outreach_sends set state = 'CANCELLED', state_reason = 'GATE:' || (select string_agg(x, ',') from jsonb_array_elements_text(v_blockers) x),
        lease_token = null, lease_until = null, updated_at = now() where id = s.id;
      perform outreach_event(s.run_id, s.prospect_id, 'SEND_BLOCKED_AT_PUSH', 'sender', jsonb_build_object('send_id', s.id, 'blockers', v_blockers));
      v_cancelled := v_cancelled || jsonb_build_object('send_id', s.id, 'blockers', v_blockers);
      continue;
    end if;
    exit when v_room <= 0;
    v_token := gen_random_uuid();
    update outreach_sends set state = 'PUSHING', lease_token = v_token, lease_until = now() + make_interval(secs => greatest(p_lease_seconds, 30)),
      attempts = attempts + 1, updated_at = now() where id = s.id returning * into s;
    v_out := v_out || jsonb_build_object('send', to_jsonb(s), 'lease_token', v_token,
      'run', (select jsonb_build_object('id', r.id, 'name', r.name, 'owner_user_id', r.owner_user_id, 'campaign', r.campaign,
                                        'provider_campaign_id', r.provider_campaign_id, 'provider_campaign_status', r.provider_campaign_status)
              from outreach_runs r where r.id = s.run_id));
    v_room := v_room - 1;
  end loop;
  return jsonb_build_object('enabled', true, 'sends', v_out, 'cancelled', v_cancelled, 'pushed_today', v_today);
end $$;

-- Provider campaign bookkeeping (one Smartlead campaign per run). The short lock prevents parallel creation.
create or replace function outreach_lock_run_campaign(p_run_id uuid, p_seconds int default 120) returns jsonb
language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  select * into r from outreach_runs where id = p_run_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if r.provider_campaign_id is not null and r.provider_campaign_status in ('ACTIVE','PAUSED') then
    return jsonb_build_object('locked', false, 'ready', true, 'campaign_id', r.provider_campaign_id, 'status', r.provider_campaign_status);
  end if;
  if r.provider_lock_until is not null and r.provider_lock_until > now() then
    return jsonb_build_object('locked', false, 'ready', false, 'busy', true, 'campaign_id', r.provider_campaign_id);
  end if;
  update outreach_runs set provider_lock_until = now() + make_interval(secs => p_seconds) where id = r.id;
  return jsonb_build_object('locked', true, 'ready', false, 'campaign_id', r.provider_campaign_id, 'status', r.provider_campaign_status);
end $$;

create or replace function outreach_set_run_campaign(p_run_id uuid, p_campaign_id text, p_status text, p_error text default null) returns jsonb
language plpgsql set search_path = public as $$
declare r outreach_runs;
begin
  update outreach_runs set provider_campaign_id = coalesce(p_campaign_id, provider_campaign_id), provider_campaign_status = p_status,
    provider_campaign_error = p_error, provider_lock_until = null, updated_at = now()
  where id = p_run_id returning * into r;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  perform outreach_event(r.id, null, 'PROVIDER_CAMPAIGN', 'sender', jsonb_build_object('campaign_id', r.provider_campaign_id, 'status', p_status, 'error', p_error));
  return jsonb_build_object('id', r.id, 'provider_campaign_id', r.provider_campaign_id, 'provider_campaign_status', r.provider_campaign_status);
end $$;

-- Campaigns with their live lead counts (for kill switch / resume propagation).
create or replace function outreach_provider_campaigns() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('run_id', r.id, 'campaign_id', r.provider_campaign_id, 'status', r.provider_campaign_status,
    'run_status', r.status,
    'active_leads', (select count(*) from outreach_sends s where s.run_id = r.id and s.state in ('ACTIVE','PUSHING')))), '[]'::jsonb)
  from outreach_runs r where r.provider_campaign_id is not null
$$;

create or replace function outreach_complete_send_push(p_send_id uuid, p_lease_token uuid, p_campaign_id text, p_lead_id text)
returns jsonb language plpgsql set search_path = public as $$
declare s outreach_sends;
begin
  select * into s from outreach_sends where id = p_send_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if s.state <> 'PUSHING' or s.lease_token is distinct from p_lease_token then return jsonb_build_object('accepted', false, 'reason', 'STALE_LEASE'); end if;
  update outreach_sends set state = 'ACTIVE', provider_campaign_id = p_campaign_id, provider_lead_id = p_lead_id, pushed_at = now(),
    lease_token = null, lease_until = null, last_error = null, updated_at = now()
  where id = s.id returning * into s;
  perform outreach_event(s.run_id, s.prospect_id, 'SEND_PUSHED', 'sender', jsonb_build_object('send_id', s.id, 'campaign_id', p_campaign_id, 'lead_id', p_lead_id));
  return jsonb_build_object('accepted', true, 'send', outreach_send_view(s));
end $$;

create or replace function outreach_fail_send_push(p_send_id uuid, p_lease_token uuid, p_error text, p_retryable boolean)
returns jsonb language plpgsql set search_path = public as $$
declare s outreach_sends; v_final boolean;
begin
  select * into s from outreach_sends where id = p_send_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if s.state <> 'PUSHING' or s.lease_token is distinct from p_lease_token then return jsonb_build_object('accepted', false, 'reason', 'STALE_LEASE'); end if;
  v_final := not coalesce(p_retryable, true) or s.attempts >= 5;
  update outreach_sends set state = case when v_final then 'FAILED' else 'QUEUED' end, last_error = left(p_error, 1000),
    next_attempt_at = now() + make_interval(secs => outreach_backoff_seconds(s.attempts) * 10),
    lease_token = null, lease_until = null, updated_at = now()
  where id = s.id returning * into s;
  perform outreach_event(s.run_id, s.prospect_id, case when v_final then 'SEND_FAILED' else 'SEND_PUSH_RETRY' end, 'sender',
                         jsonb_build_object('send_id', s.id, 'error', left(p_error, 300)));
  return jsonb_build_object('accepted', true, 'state', s.state);
end $$;

-- Sends that must be stopped at the provider: suppressed after queueing, run stopped, or already stopped locally
-- (reply/bounce/unsubscribe) but not yet confirmed as paused at the provider.
create or replace function outreach_stop_candidates(p_limit int default 50) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('send_id', s.id, 'campaign_id', s.provider_campaign_id, 'lead_id', s.provider_lead_id, 'email', s.email, 'state', s.state,
      'reason', case when s.state in ('ACTIVE','COMPLETED','PUSHING') and r.status in ('STOPPED','FAILED') then 'RUN_' || r.status
                     when s.state in ('ACTIVE','COMPLETED','PUSHING') then 'SUPPRESSED'
                     else s.state end) as x
    from outreach_sends s join outreach_runs r on r.id = s.run_id join outreach_prospects p on p.id = s.prospect_id
    where s.provider_lead_id is not null and s.provider_stopped_at is null
      and (s.state in ('REPLIED','BOUNCED','UNSUBSCRIBED','STOPPED')
           or (s.state in ('ACTIVE','COMPLETED') and (r.status in ('STOPPED','FAILED')
               or jsonb_array_length(outreach_suppression_reasons(s.owner_user_id, s.email, s.domain, p.company_key, p.contact_key)) > 0)))
    order by s.updated_at limit least(greatest(coalesce(p_limit, 50), 1), 200)) q
$$;

-- Marks a send stopped (locally) and/or confirmed paused at the provider.
create or replace function outreach_mark_send_stopped(p_send_id uuid, p_reason text, p_provider_confirmed boolean)
returns jsonb language plpgsql set search_path = public as $$
declare s outreach_sends;
begin
  select * into s from outreach_sends where id = p_send_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  update outreach_sends set
    state = case when state in ('QUEUED','PUSHING','ACTIVE','COMPLETED') then case when state = 'QUEUED' then 'CANCELLED' else 'STOPPED' end else state end,
    state_reason = case when state in ('QUEUED','PUSHING','ACTIVE','COMPLETED') then p_reason else state_reason end,
    stopped_at = coalesce(stopped_at, now()),
    provider_stopped_at = case when p_provider_confirmed then now() else provider_stopped_at end,
    lease_token = case when state = 'PUSHING' then null else lease_token end,
    updated_at = now()
  where id = s.id returning * into s;
  perform outreach_event(s.run_id, s.prospect_id, 'SEND_STOPPED', 'sender', jsonb_build_object('send_id', s.id, 'reason', p_reason, 'provider_confirmed', p_provider_confirmed));
  return outreach_send_view(s);
end $$;

-- Provider events (webhook or sync). p_event is normalized by the application:
-- {id, provider, type: SENT|REPLY|BOUNCE|UNSUBSCRIBE|OPEN|CLICK|OTHER, raw_type, campaign_id, lead_email, lead_id,
--  sequence_number, message_id, stats_id, occurred_at, subject, body, from_email, to_email, payload}
-- Idempotent on p_event.id. Returns {duplicate} or {matched, send_id, message_id, stop, analyze}.
create or replace function outreach_apply_provider_event(p_event jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_type text := upper(coalesce(p_event->>'type', 'OTHER')); v_email text := nullif(lower(btrim(coalesce(p_event->>'lead_email', ''))), '');
  v_campaign text := nullif(p_event->>'campaign_id', ''); s outreach_sends; v_msg uuid; v_at timestamptz; v_seq int; v_total int;
  v_res jsonb; v_stop boolean := false; v_analyze boolean := false; v_inserted int;
begin
  if coalesce(p_event->>'id', '') = '' then raise exception 'OUTREACH_VALIDATION: event id required'; end if;
  insert into outreach_webhook_events (id, provider, event_type, campaign_id, email, payload)
  values (p_event->>'id', coalesce(p_event->>'provider', 'smartlead'), coalesce(p_event->>'raw_type', v_type), v_campaign, v_email, p_event->'payload')
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('duplicate', true); end if;

  v_at := coalesce(nullif(p_event->>'occurred_at', '')::timestamptz, now());
  v_seq := nullif(p_event->>'sequence_number', '')::int;
  if v_email is not null then
    select * into s from outreach_sends
    where email = v_email and state <> 'CANCELLED' and (v_campaign is null or provider_campaign_id is null or provider_campaign_id = v_campaign)
    order by created_at desc limit 1 for update;
  end if;

  if s.id is null then
    -- Unmatched: unsubscribe/bounce still restrict globally (safe direction).
    if v_type in ('UNSUBSCRIBE','BOUNCE') and v_email is not null then
      insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source)
      values (null, 'EMAIL', v_email, case when v_type = 'BOUNCE' then 'bounce' else 'unsubscribe' end, 'provider event (unmatched)', 'smartlead')
      on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing;
    end if;
    v_res := jsonb_build_object('matched', false);
    update outreach_webhook_events set processed_at = now(), result = v_res where id = p_event->>'id';
    insert into outreach_audit_log (actor, action, data) values ('webhook', 'PROVIDER_EVENT_UNMATCHED', jsonb_build_object('event_id', p_event->>'id', 'type', v_type, 'campaign_id', v_campaign));
    return v_res;
  end if;

  if v_type = 'SENT' then
    insert into outreach_messages (send_id, prospect_id, run_id, owner_user_id, direction, kind, status, sequence_number, from_email, to_email,
                                   subject, body_text, provider_message_id, provider_stats_id, occurred_at)
    select s.id, s.prospect_id, s.run_id, s.owner_user_id, 'OUTBOUND', 'SEQUENCE', 'SENT', v_seq, p_event->>'from_email', s.email,
           coalesce(nullif(p_event->>'subject', ''), (s.sequence->(greatest(coalesce(v_seq, 1), 1) - 1))->>'subject'),
           coalesce(nullif(p_event->>'body', ''), (s.sequence->(greatest(coalesce(v_seq, 1), 1) - 1))->>'body'),
           coalesce(nullif(p_event->>'message_id', ''), 'seq:' || coalesce(v_seq, 0)), p_event->>'stats_id', v_at
    on conflict do nothing
    returning id into v_msg;
    v_total := jsonb_array_length(s.sequence);
    update outreach_sends set steps_sent = greatest(steps_sent, coalesce(v_seq, steps_sent + 1)),
      first_sent_at = coalesce(first_sent_at, v_at), last_sent_at = greatest(coalesce(last_sent_at, v_at), v_at),
      last_outbound_at = greatest(coalesce(last_outbound_at, v_at), v_at),
      state = case when state in ('ACTIVE','PUSHING') and coalesce(v_seq, 0) >= v_total then 'COMPLETED'
                   when state = 'PUSHING' then 'ACTIVE' else state end,
      updated_at = now()
    where id = s.id;
    if v_msg is not null then perform outreach_event(s.run_id, s.prospect_id, 'EMAIL_SENT', 'smartlead', jsonb_build_object('send_id', s.id, 'step', v_seq)); end if;
  elsif v_type = 'REPLY' then
    -- Same reply seen via webhook and via sync: match on provider id, else on time (±3 min) for this conversation.
    select id into v_msg from outreach_messages
    where send_id = s.id and direction = 'INBOUND'
      and ((nullif(p_event->>'message_id', '') is not null and provider_message_id = p_event->>'message_id')
           or abs(extract(epoch from (occurred_at - v_at))) <= 180)
    limit 1;
    if v_msg is null then
      insert into outreach_messages (send_id, prospect_id, run_id, owner_user_id, direction, kind, status, sequence_number, from_email, to_email,
                                     subject, body_text, provider_message_id, provider_stats_id, occurred_at, analysis_state)
      values (s.id, s.prospect_id, s.run_id, s.owner_user_id, 'INBOUND', 'REPLY', 'RECORDED', v_seq, s.email, p_event->>'to_email',
              p_event->>'subject', left(coalesce(p_event->>'body', ''), 20000), nullif(p_event->>'message_id', ''), p_event->>'stats_id', v_at, 'PENDING')
      returning id into v_msg;
      v_analyze := true;
      perform outreach_event(s.run_id, s.prospect_id, 'EMAIL_REPLY', 'smartlead', jsonb_build_object('send_id', s.id, 'message_id', v_msg));
    else
      update outreach_messages set provider_message_id = coalesce(provider_message_id, nullif(p_event->>'message_id', '')),
        provider_stats_id = coalesce(provider_stats_id, p_event->>'stats_id') where id = v_msg;
    end if;
    update outreach_sends set state = case when state in ('ACTIVE','COMPLETED','PUSHING','STOPPED') then 'REPLIED' else state end,
      state_reason = case when state in ('ACTIVE','COMPLETED','PUSHING','STOPPED') then 'REPLY' else state_reason end,
      stopped_at = coalesce(stopped_at, now()), inbox_status = case when v_analyze then 'NEEDS_ACTION' else inbox_status end,
      last_inbound_at = greatest(coalesce(last_inbound_at, v_at), v_at), updated_at = now()
    where id = s.id;
    v_stop := true;
  elsif v_type in ('BOUNCE','UNSUBSCRIBE') then
    insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source)
    values (null, 'EMAIL', s.email, case when v_type = 'BOUNCE' then 'bounce' else 'unsubscribe' end, 'provider event', 'smartlead')
    on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing;
    update outreach_sends set state = case when state in ('REPLIED') and v_type = 'BOUNCE' then state
                                           when v_type = 'BOUNCE' then 'BOUNCED' else 'UNSUBSCRIBED' end,
      state_reason = v_type, stopped_at = coalesce(stopped_at, now()),
      disposition = case when v_type = 'UNSUBSCRIBE' then 'UNSUBSCRIBED' else disposition end, updated_at = now()
    where id = s.id;
    perform outreach_event(s.run_id, s.prospect_id, 'EMAIL_' || v_type, 'smartlead', jsonb_build_object('send_id', s.id));
    v_stop := true;
  else
    perform outreach_event(s.run_id, s.prospect_id, 'PROVIDER_' || v_type, 'smartlead', jsonb_build_object('send_id', s.id, 'raw_type', p_event->>'raw_type'));
  end if;

  v_res := jsonb_build_object('matched', true, 'send_id', s.id, 'message_id', v_msg, 'analyze', v_analyze,
    'stop', case when v_stop then jsonb_build_object('campaign_id', s.provider_campaign_id, 'lead_id', s.provider_lead_id, 'email', s.email) else null end);
  update outreach_webhook_events set processed_at = now(), result = v_res where id = p_event->>'id';
  return v_res;
end $$;

-- Sends that should be reconciled with the provider (missed webhooks): live sequences and recent replies.
create or replace function outreach_sync_candidates(p_limit int default 25, p_min_age_seconds int default 600) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('send_id', s.id, 'campaign_id', s.provider_campaign_id, 'lead_id', s.provider_lead_id, 'email', s.email)), '[]'::jsonb)
  from (select * from outreach_sends
        where provider_lead_id is not null
          and (state in ('ACTIVE','COMPLETED') or (state = 'REPLIED' and coalesce(last_inbound_at, now()) > now() - interval '14 days'))
          and (last_synced_at is null or last_synced_at < now() - make_interval(secs => p_min_age_seconds))
        order by last_synced_at nulls first limit least(greatest(coalesce(p_limit, 25), 1), 100)) s
$$;

create or replace function outreach_mark_synced(p_send_id uuid) returns void
language sql set search_path = public as $$
  update outreach_sends set last_synced_at = now() where id = p_send_id
$$;

-- ─── Reply analysis (classification + suggested reply) ───────────────────────
create or replace function outreach_claim_analysis(p_limit int default 5) returns jsonb
language plpgsql set search_path = public as $$
declare v jsonb := '[]'::jsonb; m outreach_messages;
begin
  for m in
    select * from outreach_messages
    where direction = 'INBOUND' and (analysis_state = 'PENDING' or (analysis_state = 'RUNNING' and analysis_started_at < now() - interval '10 minutes'))
      and analysis_attempts < 3
    order by occurred_at limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update skip locked
  loop
    update outreach_messages set analysis_state = 'RUNNING', analysis_started_at = now(), analysis_attempts = analysis_attempts + 1 where id = m.id;
    v := v || jsonb_build_object('message', to_jsonb(m), 'context', outreach_reply_context(m.send_id));
  end loop;
  return v;
end $$;

-- Context for classification / drafting: the conversation + Company Brain + Campaign Brain claim flags.
create or replace function outreach_reply_context(p_send_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'send', jsonb_build_object('id', s.id, 'email', s.email, 'first_name', s.first_name, 'company_name', s.company_name, 'language', s.language,
                               'subject', s.subject, 'state', s.state, 'run_id', s.run_id, 'prospect_id', s.prospect_id, 'owner_user_id', s.owner_user_id),
    'sender_name', r.campaign->>'sender_name', 'formality', r.campaign->>'formality', 'niche', r.campaign->>'niche',
    'claim_flags', r.campaign_brain->'claim_flags', 'capabilities', r.campaign_brain->'supported_capabilities',
    'prohibited', r.campaign_brain->'prohibited_or_unsupported_claims', 'landing_url', r.campaign->>'agentmakers_url',
    'facts', coalesce((select jsonb_agg(e.statement order by e.ref) from outreach_evidence e where e.prospect_id = s.prospect_id and e.kind = 'FACT'), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('direction', m.direction, 'kind', m.kind, 'at', m.occurred_at, 'subject', m.subject,
                                                             'body', left(coalesce(m.body_text, ''), 4000)) order by m.occurred_at)
                          from outreach_messages m where m.send_id = s.id and m.status in ('RECORDED','SENT')), '[]'::jsonb))
  from outreach_sends s join outreach_runs r on r.id = s.run_id where s.id = p_send_id
$$;

-- Stores the analysis. Unsubscribe requests become GLOBAL suppressions; "not interested" and "wrong person"
-- become account-level do-not-contact suppressions. Returns {stop} when the provider sequence must be stopped.
create or replace function outreach_set_message_analysis(p_message_id uuid, p_analysis jsonb, p_cost jsonb default null)
returns jsonb language plpgsql set search_path = public as $$
declare m outreach_messages; s outreach_sends; v_class text := p_analysis->>'classification'; v_stop boolean := false;
begin
  select * into m from outreach_messages where id = p_message_id for update;
  if not found then raise exception 'OUTREACH_NOT_FOUND'; end if;
  select * into s from outreach_sends where id = m.send_id for update;
  if coalesce(p_analysis->>'state', 'DONE') = 'FAILED' then
    update outreach_messages set analysis_state = case when analysis_attempts >= 3 then 'FAILED' else 'PENDING' end,
      error = left(p_analysis->>'error', 500) where id = m.id;
  else
    update outreach_messages set analysis_state = 'DONE', classification = v_class,
      classification_confidence = nullif(p_analysis->>'confidence', '')::numeric, classification_source = p_analysis->>'source',
      summary = left(p_analysis->>'summary', 1000), suggested_reply = p_analysis->>'suggested_reply',
      suggested_reply_status = coalesce(p_analysis->>'suggested_reply_status', 'NONE'), suggested_reply_issues = p_analysis->'suggested_reply_issues',
      error = null
    where id = m.id;
    update outreach_sends set last_classification = v_class,
      disposition = coalesce(disposition, case v_class when 'INTERESTED' then 'INTERESTED' when 'NOT_NOW' then 'NOT_NOW'
                       when 'NOT_INTERESTED' then 'NOT_INTERESTED' when 'WRONG_PERSON' then 'WRONG_PERSON' when 'UNSUBSCRIBE' then 'UNSUBSCRIBED' else null end),
      inbox_status = case when v_class in ('OOO') then 'WAITING' when v_class = 'UNSUBSCRIBE' then 'DONE' else inbox_status end,
      state = case when v_class = 'UNSUBSCRIBE' then 'UNSUBSCRIBED' else state end,
      updated_at = now()
    where id = s.id;
    if v_class = 'UNSUBSCRIBE' then
      insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source)
      values (null, 'EMAIL', s.email, 'unsubscribe', 'reply classified as unsubscribe', 'reply')
      on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing;
      v_stop := true;
    elsif v_class in ('NOT_INTERESTED','WRONG_PERSON') then
      insert into outreach_suppressions (owner_user_id, kind, value, reason, note, source)
      values (s.owner_user_id, 'EMAIL', s.email, case when v_class = 'WRONG_PERSON' then 'wrong_target' else 'do_not_contact' end, 'reply: ' || v_class, 'reply')
      on conflict ((coalesce(owner_user_id, '')), kind, value) do nothing;
    end if;
    perform outreach_event(s.run_id, s.prospect_id, 'REPLY_CLASSIFIED', 'ai', jsonb_build_object('message_id', m.id, 'classification', v_class,
      'source', p_analysis->>'source', 'draft', coalesce(p_analysis->>'suggested_reply_status', 'NONE')));
  end if;
  if jsonb_typeof(p_cost) = 'array' then
    insert into outreach_provider_calls (id, run_id, prospect_id, lease_token, provider, operation, estimated_cost_eur, actual_cost_eur, effective_cost_eur,
                                         native_cost, result, detail, called_at)
    select (c->>'id')::uuid, s.run_id, s.prospect_id, null, c->>'provider', c->>'operation', coalesce((c->>'estimated_cost_eur')::numeric, 0),
           (c->>'actual_cost_eur')::numeric, coalesce((c->>'actual_cost_eur')::numeric, (c->>'estimated_cost_eur')::numeric, 0),
           c->>'native_cost', coalesce(c->>'result', 'ok'), left(c->>'detail', 500), coalesce((c->>'timestamp')::timestamptz, now())
    from jsonb_array_elements(p_cost) c
    on conflict (id) do nothing;
  end if;
  return jsonb_build_object('stop', case when v_stop then jsonb_build_object('send_id', s.id, 'campaign_id', s.provider_campaign_id, 'lead_id', s.provider_lead_id) else null end);
end $$;

-- LLM spend of the sending phase today (reply classification + drafts) vs the configured daily budget.
create or replace function outreach_inbox_llm_spend_today() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'spent_eur', coalesce((select sum(effective_cost_eur) from outreach_provider_calls
                            where operation in ('reply_classification','reply_draft') and called_at >= date_trunc('day', now())), 0),
    'budget_eur', (select daily_llm_budget_eur from outreach_sending_config where id = 1))
$$;

-- ─── Inbox (tenant-scoped) ───────────────────────────────────────────────────
create or replace function outreach_assert_send_access(p_send_id uuid, p_actor text, p_is_superadmin boolean, p_lock boolean default false)
returns outreach_sends language plpgsql set search_path = public as $$
declare s outreach_sends;
begin
  if p_lock then select * into s from outreach_sends where id = p_send_id for update;
  else select * into s from outreach_sends where id = p_send_id; end if;
  if not found or (not coalesce(p_is_superadmin, false) and s.owner_user_id is distinct from p_actor) then raise exception 'OUTREACH_NOT_FOUND'; end if;
  return s;
end $$;

create or replace function outreach_inbox_list(p_actor text, p_is_superadmin boolean, p_owner_filter text default null, p_status text default null,
                                               p_q text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable set search_path = public as $$
declare v_owner text := outreach_effective_owner(p_actor, p_is_superadmin, p_owner_filter); v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  return jsonb_build_object(
    'counts', (select jsonb_build_object(
        'needs_action', count(*) filter (where s.inbox_status = 'NEEDS_ACTION'),
        'waiting', count(*) filter (where s.inbox_status = 'WAITING'),
        'done', count(*) filter (where s.inbox_status = 'DONE'),
        'sequences', count(*) filter (where s.state in ('QUEUED','PUSHING','ACTIVE','COMPLETED')),
        'all', count(*))
      from outreach_sends s where s.state <> 'CANCELLED' and (v_owner is null or s.owner_user_id = v_owner)),
    'total', (select count(*) from outreach_sends s
      where s.state <> 'CANCELLED' and (v_owner is null or s.owner_user_id = v_owner)
        and (p_status is null or (p_status = 'sequences' and s.state in ('QUEUED','PUSHING','ACTIVE','COMPLETED')) or s.inbox_status = upper(p_status))
        and (v_q is null or lower(s.company_name) like '%' || v_q || '%' or s.email like '%' || v_q || '%' or lower(coalesce(s.contact_name, '')) like '%' || v_q || '%')),
    'items', coalesce((select jsonb_agg(x.item order by x.sort_at desc nulls last, x.id) from (
      select s.id, coalesce(s.last_inbound_at, s.last_outbound_at, s.pushed_at, s.queued_at) as sort_at, jsonb_build_object(
        'id', s.id, 'prospect_id', s.prospect_id, 'run_id', s.run_id, 'run_name', r.name, 'owner_user_id', s.owner_user_id,
        'company_name', s.company_name, 'contact_name', s.contact_name, 'email', s.email, 'state', s.state, 'state_reason', s.state_reason,
        'inbox_status', s.inbox_status, 'disposition', s.disposition, 'classification', s.last_classification, 'steps_sent', s.steps_sent,
        'steps_total', jsonb_array_length(s.sequence), 'last_inbound_at', s.last_inbound_at, 'last_outbound_at', s.last_outbound_at,
        'queued_at', s.queued_at, 'promoted_lead_id', p.promoted_lead_id,
        'last_message', (select jsonb_build_object('direction', m.direction, 'kind', m.kind, 'at', m.occurred_at,
                                                   'preview', left(regexp_replace(coalesce(m.body_text, ''), '\s+', ' ', 'g'), 160))
                         from outreach_messages m where m.send_id = s.id and m.status in ('RECORDED','SENT','PENDING') order by m.occurred_at desc limit 1)) as item
      from outreach_sends s join outreach_runs r on r.id = s.run_id join outreach_prospects p on p.id = s.prospect_id
      where s.state <> 'CANCELLED' and (v_owner is null or s.owner_user_id = v_owner)
        and (p_status is null or (p_status = 'sequences' and s.state in ('QUEUED','PUSHING','ACTIVE','COMPLETED')) or s.inbox_status = upper(p_status))
        and (v_q is null or lower(s.company_name) like '%' || v_q || '%' or s.email like '%' || v_q || '%' or lower(coalesce(s.contact_name, '')) like '%' || v_q || '%')
      order by coalesce(s.last_inbound_at, s.last_outbound_at, s.pushed_at, s.queued_at) desc nulls last, s.id
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end $$;

create or replace function outreach_inbox_thread(p_send_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql stable set search_path = public as $$
declare s outreach_sends; p outreach_prospects; r outreach_runs;
begin
  s := outreach_assert_send_access(p_send_id, p_actor, p_is_superadmin, false);
  select * into p from outreach_prospects where id = s.prospect_id;
  select * into r from outreach_runs where id = s.run_id;
  return jsonb_build_object(
    'send', outreach_send_view(s),
    'prospect', jsonb_build_object('id', p.id, 'company_name', p.company_name, 'domain', p.domain, 'website', p.company->>'website',
      'city', p.company->>'city', 'phone', p.company->>'phone', 'contact_name', p.contact_name, 'contact_title', p.record->'contact'->>'title',
      'fit', p.record->'fit', 'hook', p.record->'hook'->'hook', 'outcome', p.outcome, 'promoted_lead_id', p.promoted_lead_id, 'promoted_at', p.promoted_at),
    'run', jsonb_build_object('id', r.id, 'name', r.name, 'status', r.status, 'sending_mode', r.sending_mode, 'niche', r.campaign->>'niche',
      'region', r.campaign->>'region', 'landing_url', r.campaign->>'agentmakers_url', 'provider_campaign_id', r.provider_campaign_id),
    'company_brain', (select jsonb_build_object('website', cb.website, 'fit', cb.fit, 'brief', cb.brief, 'pages', cb.pages) from outreach_company_brains cb where cb.prospect_id = p.id),
    'evidence', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'ref', e.ref, 'statement', e.statement, 'source_url', e.source_url) order by e.kind, e.ref)
                          from outreach_evidence e where e.prospect_id = p.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) - 'idempotency_key' order by m.occurred_at, m.created_at) from outreach_messages m where m.send_id = s.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.type, 'actor', e.actor, 'data', e.data, 'created_at', e.created_at) order by e.id)
                        from outreach_events e where e.prospect_id = p.id), '[]'::jsonb),
    'suppressions', outreach_suppression_reasons(s.owner_user_id, s.email, s.domain, p.company_key, p.contact_key),
    'llm_spend_eur', coalesce((select sum(c.effective_cost_eur) from outreach_provider_calls c where c.prospect_id = p.id
                               and c.operation in ('reply_classification','reply_draft')), 0));
end $$;

create or replace function outreach_set_inbox_state(p_send_id uuid, p_actor text, p_is_superadmin boolean, p_inbox_status text, p_disposition text, p_note text default null)
returns jsonb language plpgsql set search_path = public as $$
declare s outreach_sends;
begin
  s := outreach_assert_send_access(p_send_id, p_actor, p_is_superadmin, true);
  if p_inbox_status is not null and p_inbox_status not in ('NONE','NEEDS_ACTION','WAITING','DONE') then raise exception 'OUTREACH_VALIDATION: unknown inbox status'; end if;
  update outreach_sends set inbox_status = coalesce(p_inbox_status, inbox_status), disposition = coalesce(p_disposition, disposition), updated_at = now()
  where id = s.id returning * into s;
  perform outreach_event(s.run_id, s.prospect_id, 'INBOX_STATE', p_actor, jsonb_build_object('send_id', s.id, 'inbox_status', p_inbox_status,
                         'disposition', p_disposition, 'note', p_note));
  return outreach_send_view(s);
end $$;

-- Manual reply, step 1: validate + record PENDING (idempotent on p_idempotency_key). The application then sends via
-- the provider and calls outreach_finish_manual_reply. AI never calls this: it requires a human actor.
create or replace function outreach_begin_manual_reply(p_send_id uuid, p_actor text, p_is_superadmin boolean, p_body text, p_idempotency_key text,
                                                       p_suggestion_message_id uuid default null)
returns jsonb language plpgsql set search_path = public as $$
declare s outreach_sends; p outreach_prospects; c outreach_sending_config; m outreach_messages; v_blockers jsonb := '[]'::jsonb; v_sup jsonb;
begin
  s := outreach_assert_send_access(p_send_id, p_actor, p_is_superadmin, true);
  if coalesce(btrim(p_idempotency_key), '') = '' then raise exception 'OUTREACH_VALIDATION: idempotency key required'; end if;
  select * into m from outreach_messages where idempotency_key = p_idempotency_key;
  if found then
    if m.send_id <> s.id then raise exception 'OUTREACH_VALIDATION: idempotency key reused'; end if;
    return jsonb_build_object('ok', true, 'created', false, 'message', to_jsonb(m) - 'idempotency_key');
  end if;
  select * into p from outreach_prospects where id = s.prospect_id;
  select * into c from outreach_sending_config where id = 1;
  if length(btrim(coalesce(p_body, ''))) < 2 or length(p_body) > 5000 then raise exception 'OUTREACH_VALIDATION: reply body must be 2–5000 characters'; end if;
  if not c.sending_enabled then v_blockers := v_blockers || '["SENDING_DISABLED"]'::jsonb; end if;
  if s.provider_lead_id is null or s.provider_campaign_id is null then v_blockers := v_blockers || '["NOT_PUSHED"]'::jsonb; end if;
  if not exists (select 1 from outreach_messages x where x.send_id = s.id and x.direction = 'INBOUND') then v_blockers := v_blockers || '["NO_INBOUND_MESSAGE"]'::jsonb; end if;
  if s.state = 'BOUNCED' then v_blockers := v_blockers || '["BOUNCED"]'::jsonb; end if;
  v_sup := outreach_suppression_reasons(s.owner_user_id, s.email, s.domain, p.company_key, p.contact_key);
  if v_sup ?| array['SUPPRESSED_EMAIL:unsubscribe','SUPPRESSED_EMAIL:bounce','SUPPRESSED_EMAIL:do_not_contact','SUPPRESSED_DOMAIN:do_not_contact',
                    'SUPPRESSED_EMAIL:customer','SUPPRESSED_DOMAIN:customer'] then
    v_blockers := v_blockers || v_sup;
  end if;
  if exists (select 1 from outreach_messages x where x.send_id = s.id and x.kind = 'MANUAL_REPLY' and x.status = 'PENDING' and x.created_at > now() - interval '5 minutes') then
    v_blockers := v_blockers || '["REPLY_IN_PROGRESS"]'::jsonb;
  end if;
  if jsonb_array_length(v_blockers) > 0 then
    perform outreach_event(s.run_id, s.prospect_id, 'MANUAL_REPLY_REFUSED', p_actor, jsonb_build_object('send_id', s.id, 'blockers', v_blockers));
    return jsonb_build_object('ok', false, 'blockers', v_blockers);
  end if;
  insert into outreach_messages (send_id, prospect_id, run_id, owner_user_id, direction, kind, status, to_email, body_text, idempotency_key, created_by_user_id, occurred_at)
  values (s.id, s.prospect_id, s.run_id, s.owner_user_id, 'OUTBOUND', 'MANUAL_REPLY', 'PENDING', s.email, p_body, p_idempotency_key, p_actor, now())
  returning * into m;
  if p_suggestion_message_id is not null then
    update outreach_messages set suggested_reply_status = 'USED' where id = p_suggestion_message_id and send_id = s.id and suggested_reply_status = 'READY';
  end if;
  perform outreach_event(s.run_id, s.prospect_id, 'MANUAL_REPLY_STARTED', p_actor, jsonb_build_object('send_id', s.id, 'message_id', m.id));
  return jsonb_build_object('ok', true, 'created', true, 'message', to_jsonb(m) - 'idempotency_key',
    'provider', jsonb_build_object('campaign_id', s.provider_campaign_id, 'lead_id', s.provider_lead_id, 'email', s.email));
end $$;

create or replace function outreach_finish_manual_reply(p_message_id uuid, p_ok boolean, p_provider_message_id text default null, p_error text default null)
returns jsonb language plpgsql set search_path = public as $$
declare m outreach_messages;
begin
  select * into m from outreach_messages where id = p_message_id for update;
  if not found or m.kind <> 'MANUAL_REPLY' then raise exception 'OUTREACH_NOT_FOUND'; end if;
  if m.status <> 'PENDING' then return jsonb_build_object('accepted', false, 'status', m.status); end if;
  update outreach_messages set status = case when p_ok then 'SENT' else 'FAILED' end, provider_message_id = p_provider_message_id,
    error = left(p_error, 500), occurred_at = now() where id = m.id returning * into m;
  if p_ok then
    update outreach_sends set inbox_status = 'WAITING', last_outbound_at = now(), updated_at = now() where id = m.send_id;
  end if;
  perform outreach_event(m.run_id, m.prospect_id, case when p_ok then 'MANUAL_REPLY_SENT' else 'MANUAL_REPLY_FAILED' end, m.created_by_user_id,
                         jsonb_build_object('send_id', m.send_id, 'message_id', m.id, 'error', left(p_error, 300)));
  return jsonb_build_object('accepted', true, 'message', to_jsonb(m) - 'idempotency_key');
end $$;

-- Promote a prospect (from its conversation) into the existing CRM table `leads`. Idempotent: one lead per prospect.
-- Promoted leads have scraped_at set and no demo_token, so the scrape-queue and follow-up crons never touch them.
create or replace function outreach_promote_to_lead(p_send_id uuid, p_actor text, p_is_superadmin boolean, p_lead jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare s outreach_sends; p outreach_prospects; v_lead uuid; v_user uuid;
begin
  s := outreach_assert_send_access(p_send_id, p_actor, p_is_superadmin, false);
  select * into p from outreach_prospects where id = s.prospect_id for update;
  if p.promoted_lead_id is not null then return jsonb_build_object('created', false, 'lead_id', p.promoted_lead_id); end if;
  select id into v_lead from public.leads where outreach_prospect_id = p.id;
  if v_lead is null then
    if s.owner_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into v_user from public.users where id = s.owner_user_id::uuid;
    end if;
    insert into public.leads (landing_page_slug, language, naam, email, telefoon, website, bedrijfsnaam, ip_address, user_agent, referrer,
                              business_info, scraped_at, diensten, user_id, outreach_prospect_id)
    values (coalesce(nullif(p_lead->>'landing_page_slug', ''), 'outreach'), s.language, coalesce(nullif(s.contact_name, ''), s.company_name), s.email,
            coalesce(p_lead->>'telefoon', ''), coalesce(s.website, 'https://' || s.domain), s.company_name, '', 'outreach', 'outreach:smartlead',
            p_lead->>'business_info', now(), '{}', v_user, p.id)
    on conflict (outreach_prospect_id) where outreach_prospect_id is not null do nothing
    returning id into v_lead;
    if v_lead is null then select id into v_lead from public.leads where outreach_prospect_id = p.id; end if;
  end if;
  update outreach_prospects set promoted_lead_id = v_lead, promoted_at = now(), updated_at = now() where id = p.id;
  update outreach_sends set disposition = coalesce(disposition, 'INTERESTED'), updated_at = now() where id = s.id;
  perform outreach_event(s.run_id, s.prospect_id, 'PROMOTED_TO_LEAD', p_actor, jsonb_build_object('send_id', s.id, 'lead_id', v_lead));
  return jsonb_build_object('created', true, 'lead_id', v_lead);
end $$;

-- Everything needed to build the sequence for one prospect (stored Phase 0 email + recipient + run copy settings).
create or replace function outreach_send_material(p_prospect_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql stable set search_path = public as $$
declare p outreach_prospects; r outreach_runs;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found or (not coalesce(p_is_superadmin, false) and p.owner_user_id is distinct from p_actor) then raise exception 'OUTREACH_NOT_FOUND'; end if;
  select * into r from outreach_runs where id = p.run_id;
  return jsonb_build_object('prospect_id', p.id, 'run_id', r.id, 'outcome', p.outcome, 'email', p.email, 'company_name', p.company_name,
    'contact', p.record->'contact', 'message', p.record->'email', 'language', coalesce(r.campaign->>'language', 'nl'),
    'formality', coalesce(r.campaign->>'formality', 'formal'), 'sender_name', coalesce(r.campaign->>'sender_name', 'Richard'),
    'claim_flags', r.campaign_brain->'claim_flags',
    'followup_delays_days', (select to_jsonb(followup_delays_days) from outreach_sending_config where id = 1));
end $$;

-- Re-run the AI analysis (classification + suggested reply) for one inbound message.
create or replace function outreach_request_reanalysis(p_message_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql set search_path = public as $$
declare m outreach_messages;
begin
  select * into m from outreach_messages where id = p_message_id for update;
  if not found or m.direction <> 'INBOUND' or (not coalesce(p_is_superadmin, false) and m.owner_user_id is distinct from p_actor) then
    raise exception 'OUTREACH_NOT_FOUND';
  end if;
  update outreach_messages set analysis_state = 'PENDING', analysis_attempts = 0, analysis_started_at = null where id = m.id;
  perform outreach_event(m.run_id, m.prospect_id, 'REPLY_REANALYSIS_REQUESTED', p_actor, jsonb_build_object('message_id', m.id));
  return jsonb_build_object('ok', true);
end $$;

-- Sending view for a run (run detail) and for a prospect (prospect detail).
create or replace function outreach_run_sending(p_run_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql stable set search_path = public as $$
declare r outreach_runs;
begin
  r := outreach_assert_run_access(p_run_id, p_actor, p_is_superadmin, false);
  return jsonb_build_object(
    'provider_campaign_id', r.provider_campaign_id, 'provider_campaign_status', r.provider_campaign_status, 'provider_campaign_error', r.provider_campaign_error,
    'sends', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'prospect_id', s.prospect_id, 'company_name', s.company_name, 'email', s.email,
                         'state', s.state, 'state_reason', s.state_reason, 'steps_sent', s.steps_sent, 'steps_total', jsonb_array_length(s.sequence),
                         'queued_at', s.queued_at, 'pushed_at', s.pushed_at, 'inbox_status', s.inbox_status, 'classification', s.last_classification) order by s.queued_at)
                       from outreach_sends s where s.run_id = r.id), '[]'::jsonb),
    'ready_unqueued', coalesce((select jsonb_agg(jsonb_build_object('prospect_id', p.id, 'company_name', p.company_name, 'email', p.email,
                         'blockers', outreach_send_gate(p.id)) order by p.position)
                       from outreach_prospects p where p.run_id = r.id and p.outcome = 'READY'
                         and not exists (select 1 from outreach_sends s where s.prospect_id = p.id and s.state <> 'CANCELLED')), '[]'::jsonb));
end $$;

create or replace function outreach_prospect_sending(p_prospect_id uuid, p_actor text, p_is_superadmin boolean)
returns jsonb language plpgsql stable set search_path = public as $$
declare p outreach_prospects; s outreach_sends;
begin
  select * into p from outreach_prospects where id = p_prospect_id;
  if not found or (not coalesce(p_is_superadmin, false) and p.owner_user_id is distinct from p_actor) then raise exception 'OUTREACH_NOT_FOUND'; end if;
  select * into s from outreach_sends where prospect_id = p.id;
  return jsonb_build_object('send', case when s.id is null then null else outreach_send_view(s) end,
    'gate', case when p.outcome = 'READY' and (s.id is null or s.state = 'CANCELLED') then outreach_send_gate(p.id) else null end,
    'promoted_lead_id', p.promoted_lead_id,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'kind', m.kind, 'status', m.status, 'at', m.occurred_at,
                     'subject', m.subject, 'classification', m.classification) order by m.occurred_at) from outreach_messages m where m.prospect_id = p.id), '[]'::jsonb));
end $$;

-- Overview for the Settings / Inbox header.
create or replace function outreach_sending_overview(p_actor text, p_is_superadmin boolean, p_owner_filter text default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare v_owner text := outreach_effective_owner(p_actor, p_is_superadmin, p_owner_filter);
begin
  return jsonb_build_object(
    'config', outreach_sending_config_view(),
    'states', coalesce((select jsonb_object_agg(state, n) from (select state, count(*) n from outreach_sends
                        where v_owner is null or owner_user_id = v_owner group by state) q), '{}'::jsonb),
    'pushed_today', (select count(*) from outreach_sends where pushed_at >= date_trunc('day', now())),
    'needs_action', (select count(*) from outreach_sends where inbox_status = 'NEEDS_ACTION' and (v_owner is null or owner_user_id = v_owner)),
    'llm', outreach_inbox_llm_spend_today(),
    'webhooks_24h', (select jsonb_build_object('received', count(*), 'unmatched', count(*) filter (where result->>'matched' = 'false'),
                                               'last_at', max(received_at))
                     from outreach_webhook_events where received_at > now() - interval '24 hours'));
end $$;

-- ─── Security (same as Stage 2/3): service_role only ─────────────────────────
do $$
declare t text; f record;
begin
  foreach t in array array['outreach_sending_config','outreach_audit_log','outreach_sends','outreach_messages','outreach_webhook_events']
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

notify pgrst, 'reload schema';
