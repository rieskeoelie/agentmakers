/**
 * View models returned by the outreach admin API (Stage 3). Client-safe: no server imports.
 */
import type { PipelineStep, ProspectOutcome, ProspectQueueState, RunStatus } from "../orchestration/states";

export type { PipelineStep, ProspectOutcome, ProspectQueueState, RunStatus };
export type SendingMode = "AUTOPILOT" | "REVIEW_BEFORE_SENDING";
export type FitClass = "GOOD_FIT" | "POSSIBLE_FIT" | "SKIP";

export interface RunFunnel {
  discovered: number;
  selected: number;
  total: number;
  researched: number;
  good_fit: number;
  possible_fit: number;
  decision_makers: number;
  business_emails: number;
  eligible_emails: number;
  ready: number;
  needs_review: number;
  blocked: number;
  skipped: number;
  failed: number;
  pending: number;
  in_progress: number;
  finished: number;
  cancelled: number;
}

export interface CampaignView {
  name?: string;
  niche: string;
  country: string;
  region?: string;
  agentmakers_url: string;
  limit: number;
  language?: "nl" | "en";
  formality?: "formal" | "informal";
  max_api_budget_eur?: number;
  sender_name?: string;
}

export interface RunSummary {
  id: string;
  owner_user_id: string;
  name: string;
  status: RunStatus;
  status_reason: string | null;
  sending_mode?: SendingMode;
  campaign: CampaignView;
  prospect_limit: number;
  concurrency: number;
  budget_cap_eur: number;
  spent_eur: number;
  reserved_eur: number;
  budget_available_eur: number;
  setup_state: "PENDING" | "IN_PROGRESS" | "DONE" | "FAILED";
  setup_last_error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  funnel: RunFunnel;
}

export interface RunOverview {
  run: RunSummary;
  errors: Array<{ id: string; company_name: string; domain: string; queue_state: ProspectQueueState; attempts: number; last_error: string | null; updated_at: string }>;
  blocked: Array<{ id: string; company_name: string; domain: string; reasons: string[] }>;
  recent_events: TimelineEvent[];
}

export interface TimelineEvent {
  id: number;
  prospect_id?: string | null;
  type: string;
  actor: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface ProspectListItem {
  id: string;
  run_id: string;
  run_name: string;
  position: number;
  company_name: string;
  domain: string;
  city: string | null;
  country: string | null;
  fit: FitClass | null;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  verification_status: string | null;
  eligibility: "ELIGIBLE" | "REVIEW_ONLY" | "NOT_ELIGIBLE" | null;
  queue_state: ProspectQueueState;
  current_step: PipelineStep;
  outcome: ProspectOutcome | null;
  outcome_reasons: string[];
  spent_eur: number;
  attempts: number;
  updated_at: string;
}

export interface Page<T> {
  total: number;
  items: T[];
}

export interface EvidenceItem {
  kind: "FACT" | "INFERENCE";
  ref: string;
  signal: string | null;
  polarity: string | null;
  strength: string | null;
  statement: string;
  snippet: string | null;
  source_url: string | null;
  based_on: string[] | null;
  confidence: string | null;
  page_kind?: string | null;
}

export interface ProspectDetail {
  prospect: {
    id: string;
    run_id: string;
    company_name: string;
    domain: string;
    company: { website: string | null; city: string | null; region: string | null; country: string | null; address: string | null; phone: string | null;
      category: string | null; additional_categories: string[]; rating: number | null; review_count: number | null;
      raw_reference?: { provider: string; endpoint: string; rank: number | null } };
    queue_state: ProspectQueueState;
    current_step: PipelineStep;
    outcome: ProspectOutcome | null;
    outcome_reasons: string[];
    warnings: string[];
    email: string | null;
    contact_name: string | null;
    attempts: number;
    last_error: string | null;
    spent_eur: number;
    started_at: string | null;
    completed_at: string | null;
    updated_at: string;
    record: ProspectRecordView | null;
  };
  run: { id: string; name: string; status: RunStatus; sending_mode: SendingMode; niche: string; country: string; region: string | null; landing_url: string; brain_version: string | null; decision_maker_priority?: string[] | null };
  company_brain: { website: string | null; pages: Array<{ url: string; kind: string; fetched_at: string }>; fetch_errors: Array<{ url: string; error: string }>;
    quarantined_snippets: Array<{ source_url: string; snippet: string }>; fit: FitView | null; brief: BriefView | null } | null;
  evidence: EvidenceItem[];
  provider_calls: Array<{ provider: string; operation: string; cost_eur: number; result: string; detail: string | null; called_at: string }>;
  events: TimelineEvent[];
  review_decisions: Array<{ id: string; decision: string; reviewer_user_id: string; reason: string | null; notes: string | null; created_at: string }>;
  review_blockers: string[];
}

export interface FitView {
  classification: FitClass;
  positive_signals: string[];
  negative_signals: string[];
  reason: string;
  evidence_confidence: "high" | "medium" | "low";
}

export interface BriefView {
  relevant_capability?: string;
  best_outreach_angle?: { signal: string; evidence_id: string; fact: string; source_url: string } | null;
  confidence?: string;
  risks?: string[];
}

/** The subset of the Phase 0 ProspectRecord the admin shows. */
export interface ProspectRecordView {
  status: string;
  stages: Record<string, { status: string; reason?: string }>;
  fit: FitView | null;
  contact: {
    name: string | null; title: string | null; title_source_url: string | null; source: string; email: string | null; email_source: string;
    verification_status: string; hunter_confidence: number | null; notes: string[]; failure_reason: string | null;
    company_generic_emails: string[];
    public_search?: unknown; same_domain_discovery?: unknown;
  } | null;
  verification_status: string | null;
  email_eligibility: { eligibility: string; reasons: string[]; is_generic: boolean; is_free_mail: boolean; domain_matches_company: boolean } | null;
  brief: BriefView | null;
  hook: { hook: { personalization_hook: string; hook_level: string; evidence_ids: string[] } | null; attempts: number; skipped_reason?: string;
    rejections: Array<{ attempt: number; issues: string[] }> } | null;
  email: { subject: string; body: string; word_count: number; variant?: { hook_level: string } } | null;
  prospeo: { result: string; reason?: string } | null;
  hunter_email_before_prospeo: string | null;
  fetch_errors: Array<{ url: string; error: string }>;
}

export interface ReviewQueueItem {
  id: string;
  run_id: string;
  run_name: string;
  company_name: string;
  domain: string;
  website: string | null;
  city: string | null;
  fit: FitView | null;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  email_source: string | null;
  verification_status: string | null;
  eligibility: { eligibility: string; reasons: string[]; is_generic: boolean } | null;
  outcome_reasons: string[];
  warnings: string[];
  blockers: string[];
  evidence: Array<{ kind: "FACT" | "INFERENCE"; ref: string; signal: string | null; statement: string; snippet: string | null; source_url: string | null; strength: string | null }>;
  hook: { personalization_hook: string; evidence_ids: string[] } | null;
  email_draft: { subject: string; body: string } | null;
  spent_eur: number;
}

export type ReviewAction = "APPROVE" | "REJECT" | "EXCLUDE_COMPANY" | "EXCLUDE_CONTACT";
export interface ReviewActionResult {
  ok: boolean;
  outcome: ProspectOutcome;
  blockers?: string[];
  decision_id?: string;
}

export interface OutreachSettingsView {
  sending: "DISABLED";
  hard_max_prospects: number;
  limits: { max_prospects: number; max_budget_eur: number; concurrency: number };
  worker: { reservation_eur: number; max_parallel: number; lease_seconds: number; cron_secret_configured: boolean };
  providers: { dataforseo: boolean; hunter: boolean; anthropic: boolean; prospeo: boolean };
  anthropic_model: string;
}
