import type { OutreachDb } from "../orchestration/db";
import type { Actor } from "../orchestration/repository";
import type { ProviderEvent } from "./webhook";
import type { SequenceStep } from "./sequence";

/** Typed wrappers around the Stage 4 outreach_* functions (supabase/migrations/*_outreach_stage4_sending.sql). */
const actorArgs = (a: Actor) => ({ p_actor: a.userId, p_is_superadmin: a.isSuperAdmin });

export interface SendingConfig {
  sending_enabled: boolean;
  autopilot_enabled: boolean;
  daily_new_leads_cap: number;
  max_pushes_per_tick: number;
  test_recipients: string[];
  followup_delays_days: number[];
  schedule: { timezone: string; days: number[]; start_hour: string; end_hour: string; min_time_btw_emails: number };
  email_account_ids: string[];
  daily_llm_budget_eur: number;
  kill_reason: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type SendState = "QUEUED" | "PUSHING" | "ACTIVE" | "COMPLETED" | "REPLIED" | "BOUNCED" | "UNSUBSCRIBED" | "STOPPED" | "CANCELLED" | "FAILED";

export interface SendRow {
  id: string;
  prospect_id: string;
  run_id: string;
  owner_user_id: string;
  email: string;
  domain: string;
  contact_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string;
  website: string | null;
  language: string;
  subject: string;
  body: string;
  sequence: SequenceStep[];
  state: SendState;
  state_reason: string | null;
  provider_campaign_id: string | null;
  provider_lead_id: string | null;
  steps_sent: number;
  inbox_status: string;
  disposition: string | null;
  attempts: number;
}

export interface ClaimedSend {
  send: SendRow;
  lease_token: string;
  run: { id: string; name: string; owner_user_id: string; campaign: Record<string, unknown>; provider_campaign_id: string | null; provider_campaign_status: string | null };
}

export interface SendMaterial {
  prospect_id: string;
  run_id: string;
  outcome: string | null;
  email: string | null;
  company_name: string;
  contact: { first_name?: string | null; last_name?: string | null; name?: string | null } | null;
  message: { subject: string; body: string } | null;
  language: string;
  formality: string;
  sender_name: string;
  claim_flags: import("../claims").ClaimFlags | null;
  followup_delays_days: number[];
}

export interface StopCandidate { send_id: string; campaign_id: string | null; lead_id: string | null; email: string; state: string; reason: string }
export interface ProviderCampaign { run_id: string; campaign_id: string; status: string | null; run_status: string; active_leads: number }

export interface ReplyContext {
  send: { id: string; email: string; first_name: string | null; company_name: string; language: string; subject: string; state: string; run_id: string; prospect_id: string; owner_user_id: string };
  sender_name: string | null;
  formality: string | null;
  niche: string | null;
  claim_flags: import("../claims").ClaimFlags | null;
  capabilities: string[] | null;
  prohibited: string[] | null;
  landing_url: string | null;
  facts: string[];
  messages: Array<{ direction: string; kind: string; at: string; subject: string | null; body: string }>;
}

export interface MessageRow {
  id: string;
  send_id: string;
  prospect_id: string;
  run_id: string;
  direction: "OUTBOUND" | "INBOUND";
  kind: string;
  status: string;
  body_text: string | null;
  subject: string | null;
  occurred_at: string;
}

export interface AnalysisInput {
  state?: "DONE" | "FAILED";
  error?: string;
  classification?: string;
  confidence?: number;
  source?: string;
  summary?: string;
  suggested_reply?: string | null;
  suggested_reply_status?: "NONE" | "READY" | "REJECTED" | "FAILED";
  suggested_reply_issues?: unknown;
}

export const sendRepo = {
  config: (db: OutreachDb) => db.rpc<SendingConfig>("outreach_sending_config_view", {}),
  setConfig: (db: OutreachDb, actor: Actor, patch: Record<string, unknown>) => db.rpc<SendingConfig>("outreach_set_sending_config", { ...actorArgs(actor), p_patch: patch }),
  overview: (db: OutreachDb, actor: Actor, ownerFilter: string | null) => db.rpc<Record<string, unknown>>("outreach_sending_overview", { ...actorArgs(actor), p_owner_filter: ownerFilter }),

  sendMaterial: (db: OutreachDb, actor: Actor, prospectId: string) => db.rpc<SendMaterial>("outreach_send_material", { p_prospect_id: prospectId, ...actorArgs(actor) }),
  gate: (db: OutreachDb, prospectId: string) => db.rpc<string[]>("outreach_send_gate", { p_prospect_id: prospectId }),
  queue: (db: OutreachDb, actor: Actor, prospectId: string, source: "manual" | "autopilot", message: Record<string, unknown>) =>
    db.rpc<{ ok: boolean; created?: boolean; send?: SendRow; blockers?: string[] }>("outreach_queue_send", { p_prospect_id: prospectId, ...actorArgs(actor), p_source: source, p_message: message }),
  cancel: (db: OutreachDb, actor: Actor, sendId: string, reason: string | null) => db.rpc<SendRow>("outreach_cancel_send", { p_send_id: sendId, ...actorArgs(actor), p_reason: reason }),
  autopilotCandidates: (db: OutreachDb, limit: number) => db.rpc<string[]>("outreach_autopilot_candidates", { p_limit: limit }),
  runSending: (db: OutreachDb, actor: Actor, runId: string) => db.rpc<Record<string, unknown> & { ready_unqueued: Array<{ prospect_id: string; blockers: string[] }> }>("outreach_run_sending", { p_run_id: runId, ...actorArgs(actor) }),
  prospectSending: (db: OutreachDb, actor: Actor, prospectId: string) => db.rpc<Record<string, unknown>>("outreach_prospect_sending", { p_prospect_id: prospectId, ...actorArgs(actor) }),

  claimSends: (db: OutreachDb, workerId: string, max: number, leaseSeconds = 300) =>
    db.rpc<{ enabled: boolean; sends: ClaimedSend[]; cancelled: Array<{ send_id: string; blockers: string[] }>; pushed_today?: number }>("outreach_claim_sends", { p_worker_id: workerId, p_max: max, p_lease_seconds: leaseSeconds }),
  lockRunCampaign: (db: OutreachDb, runId: string) => db.rpc<{ locked: boolean; ready: boolean; busy?: boolean; campaign_id: string | null; status?: string | null }>("outreach_lock_run_campaign", { p_run_id: runId, p_seconds: 120 }),
  setRunCampaign: (db: OutreachDb, runId: string, campaignId: string | null, status: string, error: string | null = null) =>
    db.rpc<Record<string, unknown>>("outreach_set_run_campaign", { p_run_id: runId, p_campaign_id: campaignId, p_status: status, p_error: error }),
  providerCampaigns: (db: OutreachDb) => db.rpc<ProviderCampaign[]>("outreach_provider_campaigns", {}),
  completePush: (db: OutreachDb, sendId: string, lease: string, campaignId: string, leadId: string) =>
    db.rpc<{ accepted: boolean }>("outreach_complete_send_push", { p_send_id: sendId, p_lease_token: lease, p_campaign_id: campaignId, p_lead_id: leadId }),
  failPush: (db: OutreachDb, sendId: string, lease: string, error: string, retryable: boolean) =>
    db.rpc<{ accepted: boolean; state?: string }>("outreach_fail_send_push", { p_send_id: sendId, p_lease_token: lease, p_error: error, p_retryable: retryable }),
  stopCandidates: (db: OutreachDb, limit = 50) => db.rpc<StopCandidate[]>("outreach_stop_candidates", { p_limit: limit }),
  markStopped: (db: OutreachDb, sendId: string, reason: string, providerConfirmed: boolean) =>
    db.rpc<SendRow>("outreach_mark_send_stopped", { p_send_id: sendId, p_reason: reason, p_provider_confirmed: providerConfirmed }),

  applyEvent: (db: OutreachDb, e: ProviderEvent) =>
    db.rpc<{ duplicate?: boolean; matched?: boolean; send_id?: string; message_id?: string | null; analyze?: boolean; stop?: { campaign_id: string | null; lead_id: string | null; email: string } | null }>(
      "outreach_apply_provider_event", { p_event: e }),
  syncCandidates: (db: OutreachDb, limit = 25, minAgeSeconds = 600) =>
    db.rpc<Array<{ send_id: string; campaign_id: string; lead_id: string; email: string }>>("outreach_sync_candidates", { p_limit: limit, p_min_age_seconds: minAgeSeconds }),
  markSynced: (db: OutreachDb, sendId: string) => db.rpc<null>("outreach_mark_synced", { p_send_id: sendId }),

  claimAnalysis: (db: OutreachDb, limit = 5) => db.rpc<Array<{ message: MessageRow; context: ReplyContext }>>("outreach_claim_analysis", { p_limit: limit }),
  setAnalysis: (db: OutreachDb, messageId: string, a: AnalysisInput, cost: unknown[] | null) =>
    db.rpc<{ stop: { send_id: string; campaign_id: string | null; lead_id: string | null } | null }>("outreach_set_message_analysis", { p_message_id: messageId, p_analysis: a, p_cost: cost }),
  llmSpendToday: (db: OutreachDb) => db.rpc<{ spent_eur: number; budget_eur: number }>("outreach_inbox_llm_spend_today", {}),
  requestReanalysis: (db: OutreachDb, actor: Actor, messageId: string) => db.rpc<{ ok: boolean }>("outreach_request_reanalysis", { p_message_id: messageId, ...actorArgs(actor) }),

  inboxList: (db: OutreachDb, actor: Actor, ownerFilter: string | null, status: string | null, q: string | null, limit: number, offset: number) =>
    db.rpc<Record<string, unknown>>("outreach_inbox_list", { ...actorArgs(actor), p_owner_filter: ownerFilter, p_status: status, p_q: q, p_limit: limit, p_offset: offset }),
  inboxThread: (db: OutreachDb, actor: Actor, sendId: string) => db.rpc<Record<string, unknown> & { send: SendRow; messages: Array<Record<string, unknown>> }>("outreach_inbox_thread", { p_send_id: sendId, ...actorArgs(actor) }),
  setInboxState: (db: OutreachDb, actor: Actor, sendId: string, inboxStatus: string | null, disposition: string | null, note: string | null) =>
    db.rpc<SendRow>("outreach_set_inbox_state", { p_send_id: sendId, ...actorArgs(actor), p_inbox_status: inboxStatus, p_disposition: disposition, p_note: note }),
  beginReply: (db: OutreachDb, actor: Actor, sendId: string, body: string, idempotencyKey: string, suggestionMessageId: string | null) =>
    db.rpc<{ ok: boolean; created?: boolean; blockers?: string[]; message?: Record<string, unknown> & { id: string; status: string }; provider?: { campaign_id: string; lead_id: string; email: string } }>(
      "outreach_begin_manual_reply", { p_send_id: sendId, ...actorArgs(actor), p_body: body, p_idempotency_key: idempotencyKey, p_suggestion_message_id: suggestionMessageId }),
  finishReply: (db: OutreachDb, messageId: string, ok: boolean, providerMessageId: string | null, error: string | null) =>
    db.rpc<{ accepted: boolean; message?: Record<string, unknown> }>("outreach_finish_manual_reply", { p_message_id: messageId, p_ok: ok, p_provider_message_id: providerMessageId, p_error: error }),
  promote: (db: OutreachDb, actor: Actor, sendId: string, lead: Record<string, unknown>) =>
    db.rpc<{ created: boolean; lead_id: string }>("outreach_promote_to_lead", { p_send_id: sendId, ...actorArgs(actor), p_lead: lead }),
};
