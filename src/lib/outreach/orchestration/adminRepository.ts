import type {
  Page, ProspectDetail, ProspectListItem, ReviewAction, ReviewActionResult, ReviewQueueItem, RunOverview, RunSummary, SendingMode,
  IdentityReview,
} from "../ui/types";
import type { OutreachDb } from "./db";
import type { Actor } from "./repository";

/** Stage 3 read models + review actions (supabase/migrations/*_outreach_stage3.sql). Tenant checks happen in SQL. */
const actorArgs = (a: Actor) => ({ p_actor: a.userId, p_is_superadmin: a.isSuperAdmin });

export interface ProspectSearchFilters {
  run_id?: string;
  fit?: string;
  status?: string;
  email?: string;
  location?: string;
  q?: string;
}

export const adminRepo = {
  listRunsOverview: (db: OutreachDb, actor: Actor, ownerFilter: string | null, limit = 100) =>
    db.rpc<RunSummary[]>("outreach_list_runs_overview", { ...actorArgs(actor), p_owner_filter: ownerFilter, p_limit: limit }),

  getRunOverview: (db: OutreachDb, actor: Actor, runId: string) =>
    db.rpc<RunOverview>("outreach_get_run_overview", { p_run_id: runId, ...actorArgs(actor) }),

  setSendingMode: (db: OutreachDb, actor: Actor, runId: string, mode: SendingMode) =>
    db.rpc<RunSummary>("outreach_set_run_sending_mode", { p_run_id: runId, ...actorArgs(actor), p_mode: mode }),

  searchProspects: (db: OutreachDb, actor: Actor, ownerFilter: string | null, filters: ProspectSearchFilters, limit: number, offset: number) =>
    db.rpc<Page<ProspectListItem>>("outreach_search_prospects", { ...actorArgs(actor), p_owner_filter: ownerFilter, p_filters: filters, p_limit: limit, p_offset: offset }),

  getProspectDetail: (db: OutreachDb, actor: Actor, prospectId: string) =>
    db.rpc<ProspectDetail>("outreach_get_prospect_detail", { p_prospect_id: prospectId, ...actorArgs(actor) }),

  reviewQueue: (db: OutreachDb, actor: Actor, ownerFilter: string | null, limit: number, offset: number) =>
    db.rpc<Page<ReviewQueueItem>>("outreach_review_queue", { ...actorArgs(actor), p_owner_filter: ownerFilter, p_limit: limit, p_offset: offset }),

  reviewAction: (db: OutreachDb, actor: Actor, prospectId: string, action: ReviewAction, reason: string | null, notes: string | null,
    roleCheck: { title: string | null; qualified: boolean; matched_role: string | null } | null = null) =>
    db.rpc<ReviewActionResult>("outreach_review_action", {
      p_prospect_id: prospectId, ...actorArgs(actor), p_action: action, p_reason: reason, p_notes: notes, p_role_check: roleCheck,
    }),

  reviewRoleInput: (db: OutreachDb, actor: Actor, prospectId: string) =>
    db.rpc<{ title: string | null; priority: unknown }>("outreach_review_role_input", { p_prospect_id: prospectId, ...actorArgs(actor) }),

  reviewBlockers: (db: OutreachDb, prospectId: string) => db.rpc<string[]>("outreach_review_blockers", { p_prospect_id: prospectId }),

  /** Identity-review verdict (no access check — call only after the caller's access to the prospect was verified). */
  identityReview: (db: OutreachDb, prospectId: string) => db.rpc<IdentityReview | null>("outreach_identity_review", { p_prospect_id: prospectId }),
};
