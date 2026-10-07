import { z } from "zod";
import { HARD_MAX_PROSPECTS, requiredRealModeEnvMissing, type Env } from "../config";
import { pipelineSettings } from "../adapter";
import type { OutreachSettingsView, ReviewActionResult, SendingMode } from "../ui/types";
import { OutreachError, type OutreachDb } from "./db";
import { adminRepo } from "./adminRepository";
import type { Actor, RunView } from "./repository";
import { createRunForActor, isUuid, requireOperator } from "./service";
import { decisionMakerRoleCheck, withRoleBlockers } from "./reviewRole";
import { MIN_WORKER_SECRET_LENGTH } from "./trigger";
import { isOwnerDiscoveryCampaign } from "../owner/config";
import type { WorkerSettings } from "./settings";

/**
 * Stage 3 API operations (admin UI). Same authorization model as Stage 2:
 * own account only; superadmins see everything and may narrow to one account (view-as).
 */

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new OutreachError("VALIDATION", r.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; "));
  return r.data;
}

/** view_as is only honoured for superadmins (the database enforces the same rule). */
export function ownerFilterFor(actor: Actor, viewAs: string | null | undefined): string | null {
  return actor.isSuperAdmin && viewAs && viewAs.trim() ? viewAs.trim() : null;
}

const SendingModeSchema = z.enum(["AUTOPILOT", "REVIEW_BEFORE_SENDING"]);

/** Create (+ optional start) a run, then store its sending mode. Nothing is ever sent in Stage 3. */
export async function createRunWithMode(db: OutreachDb, actor: Actor, body: unknown, env: Env): Promise<{ created: boolean; run: RunView & { sending_mode?: SendingMode } }> {
  const parsed = parseOrThrow(z.object({ sending_mode: SendingModeSchema.optional(), campaign: z.unknown().optional() }).passthrough(), body ?? {});
  // Owner Discovery runs are research only: never AUTOPILOT (the database send gate refuses them as well).
  const mode = isOwnerDiscoveryCampaign(parsed.campaign) ? "REVIEW_BEFORE_SENDING" : parsed.sending_mode ?? "REVIEW_BEFORE_SENDING";
  const res = await createRunForActor(db, actor, body, env);
  if (res.created && mode !== (res.run as { sending_mode?: string }).sending_mode) {
    const withMode = await adminRepo.setSendingMode(db, actor, res.run.id, mode);
    return { created: true, run: { ...res.run, sending_mode: withMode.sending_mode } };
  }
  return res;
}

const FiltersSchema = z.object({
  run_id: z.string().refine(isUuid, "invalid run id").optional(),
  fit: z.enum(["GOOD_FIT", "POSSIBLE_FIT", "SKIP"]).optional(),
  status: z.enum(["READY", "NEEDS_REVIEW", "BLOCKED", "SKIPPED", "CONTACT_NOT_FOUND", "DECISION_MAKER_EMAIL_NOT_FOUND", "EMAIL_NOT_ELIGIBLE", "FAILED",
    "PENDING", "IN_PROGRESS", "CANCELLED", "DONE"]).optional(),
  email: z.enum(["eligible", "review_only", "not_eligible", "has_email", "none"]).optional(),
  location: z.string().trim().max(100).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  view_as: z.string().trim().max(200).optional(),
});

export async function searchProspectsForActor(db: OutreachDb, actor: Actor, params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const [k, v] of params) if (v.trim() !== "") raw[k] = v;
  const f = parseOrThrow(FiltersSchema, raw);
  const { limit, offset, view_as, ...filters } = f;
  return adminRepo.searchProspects(db, actor, ownerFilterFor(actor, view_as), filters, limit, offset);
}

export async function reviewQueueForActor(db: OutreachDb, actor: Actor, params: URLSearchParams) {
  const q = parseOrThrow(z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    view_as: z.string().trim().max(200).optional(),
  }), Object.fromEntries([...params].filter(([, v]) => v.trim() !== "")));
  const page = await adminRepo.reviewQueue(db, actor, ownerFilterFor(actor, q.view_as), q.limit, q.offset);
  return {
    ...page,
    items: page.items.map((raw) => {
      const { role_priority, ...item } = raw as typeof raw & { role_priority?: unknown };
      return { ...item, blockers: withRoleBlockers(item.blockers, decisionMakerRoleCheck(item.contact_title, role_priority)) };
    }),
  };
}

/** Prospect detail; review blockers include the Phase 0 decision-maker role check (display mirror of the approval gate). */
export async function prospectDetailForActor(db: OutreachDb, actor: Actor, prospectId: string) {
  if (!isUuid(prospectId)) throw new OutreachError("NOT_FOUND", "Not found");
  const d = await adminRepo.getProspectDetail(db, actor, prospectId);
  if (d.prospect.outcome !== "NEEDS_REVIEW") return d;
  const check = decisionMakerRoleCheck(d.prospect.record?.contact?.title, d.run.decision_maker_priority);
  const identity_review = await adminRepo.identityReview(db, d.prospect.id); // access verified by getProspectDetail above
  return { ...d, review_blockers: withRoleBlockers(d.review_blockers, check), identity_review };
}

const ReviewBodySchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "EXCLUDE_COMPANY", "EXCLUDE_CONTACT"]),
  reason: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Review decision. The database refuses approvals with hard blockers (no confirmed named decision maker,
 * generic mailbox, invalid email, suppression, duplicate, copy/claim violations …) and returns them; nothing is
 * changed in that case. For APPROVE the server computes the Phase 0 role verdict from the STORED title (never from
 * the request body) and the database checks it against the locked row.
 */
export async function reviewActionForActor(db: OutreachDb, actor: Actor, prospectId: string, body: unknown): Promise<ReviewActionResult> {
  if (!isUuid(prospectId)) throw new OutreachError("NOT_FOUND", "Not found");
  const b = parseOrThrow(ReviewBodySchema, body);
  let roleCheck = null;
  if (b.action === "APPROVE") {
    const input = await adminRepo.reviewRoleInput(db, actor, prospectId);
    roleCheck = decisionMakerRoleCheck(input.title, input.priority);
  }
  return adminRepo.reviewAction(db, actor, prospectId, b.action, b.reason ?? null, b.notes ?? null, roleCheck);
}

/** Read-only configuration overview. Booleans only — never values of secrets. */
export function settingsForActor(actor: Actor, env: Env, worker: WorkerSettings, cronSecret: string | undefined): OutreachSettingsView {
  requireOperator(actor);
  const missing = new Set(requiredRealModeEnvMissing(env));
  return {
    sending: "DISABLED",
    hard_max_prospects: HARD_MAX_PROSPECTS,
    limits: { max_prospects: Math.min(env.PROOF_MAX_PROSPECTS, HARD_MAX_PROSPECTS), max_budget_eur: env.PROOF_MAX_API_BUDGET_EUR, concurrency: pipelineSettings(env).concurrency },
    worker: {
      reservation_eur: worker.reservationEur, max_parallel: worker.maxParallel, lease_seconds: worker.leaseSeconds,
      cron_secret_configured: !!cronSecret && cronSecret.length >= MIN_WORKER_SECRET_LENGTH,
    },
    providers: {
      dataforseo: !missing.has("DATAFORSEO_LOGIN") && !missing.has("DATAFORSEO_PASSWORD"),
      hunter: !missing.has("HUNTER_API_KEY"),
      anthropic: !missing.has("ANTHROPIC_API_KEY"),
      prospeo: !!env.PROSPEO_API_KEY,
    },
    anthropic_model: env.ANTHROPIC_MODEL,
  };
}
