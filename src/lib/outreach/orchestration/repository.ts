import type { CampaignBrain } from "../brain";
import type { CampaignInput } from "../config";
import type { ProviderCall } from "../cost";
import type { DiscoveredCompany } from "../providers/dataforseo";
import type { OutreachDb } from "./db";
import type { PipelineStep, ProspectOutcome, ProspectQueueState, RunAction, RunStatus, SetupState } from "./states";

/** Typed wrappers around the outreach_* Postgres functions. No business logic here. */

export interface RunRow {
  id: string;
  owner_user_id: string;
  created_by_user_id: string;
  idempotency_key: string | null;
  name: string;
  status: RunStatus;
  status_reason: string | null;
  campaign: CampaignInput;
  prospect_limit: number;
  concurrency: number;
  max_attempts: number;
  budget_cap_eur: number;
  spent_eur: number;
  reserved_eur: number;
  setup_state: SetupState;
  setup_attempts: number;
  setup_last_error: string | null;
  campaign_brain_id: string | null;
  campaign_brain?: CampaignBrain | null;
  discovery_summary: unknown;
  created_at: string;
  updated_at: string;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunView extends RunRow {
  counts: { total: number; queue: Partial<Record<ProspectQueueState, number>>; outcome: Partial<Record<ProspectOutcome, number>> };
  budget_available_eur: number;
}

export interface ProspectRow {
  id: string;
  run_id: string;
  owner_user_id: string;
  position: number;
  company_name: string;
  domain: string;
  company_key: string;
  company: DiscoveredCompany;
  queue_state: ProspectQueueState;
  current_step: PipelineStep;
  attempts: number;
  outcome: ProspectOutcome | null;
  outcome_reasons: string[];
  email: string | null;
  spent_eur: number;
}

export interface ClaimedSetup {
  run: RunRow;
  lease_token: string;
  reservation_eur: number;
}
export interface ClaimedProspect {
  run: RunRow;
  prospect: ProspectRow;
  lease_token: string;
  reservation_eur: number;
}
export interface Claim {
  setups: ClaimedSetup[];
  prospects: ClaimedProspect[];
}

export interface LedgerCall extends ProviderCall {
  id: string;
}
export interface JournalEntry {
  key: string;
  result: unknown;
}

export interface SetupProspect {
  position: number;
  company_name: string;
  domain: string;
  company_key: string;
  company: DiscoveredCompany;
}

export interface ProspectResult {
  outcome: Exclude<ProspectOutcome, "BLOCKED">;
  reasons: string[];
  warnings: string[];
  email: string | null;
  contact_name: string | null;
  contact_key: string | null;
  stages: unknown;
  record: unknown;
  company_brain: unknown | null;
  evidence: unknown[];
}

export interface Ack {
  accepted: boolean;
  reason?: string;
  terminal?: boolean;
  paused?: boolean;
  outcome?: ProspectOutcome;
  reasons?: string[];
}

export interface PendingWork {
  due_now: number;
  next_due_at: string | null;
  in_progress: number;
}

export interface Actor {
  userId: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const actorArgs = (a: Actor) => ({ p_actor: a.userId, p_is_superadmin: a.isSuperAdmin });

export const repo = {
  createRun: (db: OutreachDb, a: {
    owner: string; actor: string; name: string; campaign: CampaignInput; prospectLimit: number; budgetCapEur: number;
    concurrency: number; maxAttempts: number; idempotencyKey: string | null;
  }) =>
    db.rpc<{ created: boolean; run: RunView }>("outreach_create_run", {
      p_owner: a.owner, p_actor: a.actor, p_name: a.name, p_campaign: a.campaign, p_prospect_limit: a.prospectLimit,
      p_budget_cap_eur: a.budgetCapEur, p_concurrency: a.concurrency, p_max_attempts: a.maxAttempts, p_idempotency_key: a.idempotencyKey,
    }),

  runAction: (db: OutreachDb, actor: Actor, runId: string, action: RunAction, reason: string | null = null) =>
    db.rpc<RunView>("outreach_run_action", { p_run_id: runId, ...actorArgs(actor), p_action: action, p_reason: reason }),

  setBudget: (db: OutreachDb, actor: Actor, runId: string, budgetCapEur: number) =>
    db.rpc<RunView>("outreach_set_run_budget", { p_run_id: runId, ...actorArgs(actor), p_budget_cap_eur: budgetCapEur }),

  getRun: (db: OutreachDb, actor: Actor, runId: string) => db.rpc<RunView>("outreach_get_run", { p_run_id: runId, ...actorArgs(actor) }),

  listRuns: (db: OutreachDb, actor: Actor, limit = 50) => db.rpc<RunView[]>("outreach_list_runs", { ...actorArgs(actor), p_limit: limit }),

  listProspects: (db: OutreachDb, actor: Actor, runId: string, limit = 100, offset = 0) =>
    db.rpc<Array<Record<string, unknown>>>("outreach_list_prospects", { p_run_id: runId, ...actorArgs(actor), p_limit: limit, p_offset: offset }),

  listEvents: (db: OutreachDb, actor: Actor, runId: string, afterId = 0, limit = 200) =>
    db.rpc<Array<Record<string, unknown>>>("outreach_list_events", { p_run_id: runId, ...actorArgs(actor), p_after_id: afterId, p_limit: limit }),

  claimWork: (db: OutreachDb, a: { workerId: string; maxProspects: number; leaseSeconds: number; reservationEur: number; minReservationEur: number; runId?: string | null }) =>
    db.rpc<Claim>("outreach_claim_work", {
      p_worker_id: a.workerId, p_max_prospects: a.maxProspects, p_lease_seconds: a.leaseSeconds,
      p_reservation_eur: a.reservationEur, p_min_reservation_eur: a.minReservationEur, p_run_id: a.runId ?? null,
    }),

  getJournal: (db: OutreachDb, scopeId: string) => db.rpc<Record<string, unknown>>("outreach_get_journal", { p_scope_id: scopeId }),

  recordCalls: (db: OutreachDb, a: { runId: string; prospectId: string | null; leaseToken: string; calls: LedgerCall[]; journal: JournalEntry[]; step: PipelineStep | null }) =>
    db.rpc<{ spent_delta_eur: number }>("outreach_record_calls", {
      p_run_id: a.runId, p_prospect_id: a.prospectId, p_lease_token: a.leaseToken, p_calls: a.calls, p_journal: a.journal, p_step: a.step,
    }),

  completeSetup: (db: OutreachDb, a: { runId: string; leaseToken: string; campaignBrainId: string | null; campaignBrain: CampaignBrain; summary: unknown; prospects: SetupProspect[] }) =>
    db.rpc<Ack & { inserted?: number; blocked?: number }>("outreach_complete_setup", {
      p_run_id: a.runId, p_lease_token: a.leaseToken, p_campaign_brain_id: a.campaignBrainId, p_campaign_brain: a.campaignBrain,
      p_summary: a.summary, p_prospects: a.prospects,
    }),

  failSetup: (db: OutreachDb, runId: string, leaseToken: string, error: string, retryable: boolean) =>
    db.rpc<Ack>("outreach_fail_setup", { p_run_id: runId, p_lease_token: leaseToken, p_error: error, p_retryable: retryable }),

  deferSetupForBudget: (db: OutreachDb, runId: string, leaseToken: string, minReservationEur: number) =>
    db.rpc<Ack>("outreach_defer_setup_for_budget", { p_run_id: runId, p_lease_token: leaseToken, p_min_reservation_eur: minReservationEur }),

  completeProspect: (db: OutreachDb, prospectId: string, leaseToken: string, result: ProspectResult) =>
    db.rpc<Ack>("outreach_complete_prospect", { p_prospect_id: prospectId, p_lease_token: leaseToken, p_result: result }),

  failProspect: (db: OutreachDb, prospectId: string, leaseToken: string, error: string, retryable: boolean, final: Partial<ProspectResult> | null = null) =>
    db.rpc<Ack>("outreach_fail_prospect", { p_prospect_id: prospectId, p_lease_token: leaseToken, p_error: error, p_retryable: retryable, p_final: final }),

  deferProspectForBudget: (db: OutreachDb, prospectId: string, leaseToken: string, minReservationEur: number) =>
    db.rpc<Ack>("outreach_defer_prospect_for_budget", { p_prospect_id: prospectId, p_lease_token: leaseToken, p_min_reservation_eur: minReservationEur }),

  pendingWork: (db: OutreachDb) => db.rpc<PendingWork>("outreach_pending_work", {}),

  addSuppression: (db: OutreachDb, actor: Actor, a: { global: boolean; owner: string | null; kind: string; value: string; reason: string; note?: string | null; source?: string; expiresAt?: string | null }) =>
    db.rpc<{ created: boolean; suppression: Record<string, unknown> }>("outreach_add_suppression", {
      ...actorArgs(actor), p_global: a.global, p_owner: a.owner, p_kind: a.kind, p_value: a.value, p_reason: a.reason,
      p_note: a.note ?? null, p_source: a.source ?? "manual", p_expires_at: a.expiresAt ?? null,
    }),

  checkContactability: (db: OutreachDb, a: { owner: string; email: string | null; domain: string | null; companyKey: string | null; contactKey: string | null; excludeProspectId?: string | null }) =>
    db.rpc<{ blocked: boolean; reasons: string[] }>("outreach_check_contactability", {
      p_owner: a.owner, p_email: a.email, p_domain: a.domain, p_company_key: a.companyKey, p_contact_key: a.contactKey, p_exclude_prospect: a.excludeProspectId ?? null,
    }),

  campaignBrainsForSource: (db: OutreachDb, sourceUrl: string, language: string) =>
    db.rpc<Array<{ id: string; cache_key: string; brain: CampaignBrain }>>("outreach_campaign_brains_for_source", { p_source_url: sourceUrl, p_language: language }),

  putCampaignBrain: (db: OutreachDb, a: { cacheKey: string; sourceUrl: string; language: string; contentHash: string; version: string; llmName: string; brain: CampaignBrain }) =>
    db.rpc<{ id: string; created: boolean }>("outreach_put_campaign_brain", {
      p_cache_key: a.cacheKey, p_source_url: a.sourceUrl, p_language: a.language, p_content_hash: a.contentHash,
      p_version: a.version, p_llm_name: a.llmName, p_brain: a.brain,
    }),

  recordReviewDecision: (db: OutreachDb, actor: Actor, prospectId: string, decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES", reason: string | null = null, notes: string | null = null) =>
    db.rpc<{ id: string; decision: string }>("outreach_record_review_decision", {
      p_prospect_id: prospectId, ...actorArgs(actor), p_decision: decision, p_reason: reason, p_notes: notes,
    }),
};
