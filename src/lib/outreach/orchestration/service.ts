import { z } from "zod";
import { CampaignInputSchema, effectiveBudget, effectiveLimit, type Env } from "../config";
import { pipelineSettings } from "../adapter";
import { OutreachError, type OutreachDb } from "./db";
import { repo, type Actor, type RunView } from "./repository";
import { RUN_ACTIONS, type RunAction } from "./states";

/**
 * API-facing operations. Authorization follows the existing AgentMakers model:
 * - reading a run: its owner or a superadmin (other runs simply do not exist for you);
 * - creating, starting or resuming a run (paid provider spend): admin or superadmin;
 * - pause / stop: the run's owner or a superadmin.
 */

export const DEFAULT_MAX_ATTEMPTS = 3;

export function requireOperator(actor: Actor): void {
  if (!actor.isAdmin && !actor.isSuperAdmin) throw new OutreachError("FORBIDDEN", "Only admins can start paid outreach runs");
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new OutreachError("VALIDATION", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

export const CreateRunBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  idempotency_key: z.string().trim().min(1).max(200).optional(),
  start: z.boolean().optional(),
  view_as_user_id: z.string().trim().min(1).optional(),
  campaign: z.record(z.string(), z.unknown()),
});

export async function createRunForActor(db: OutreachDb, actor: Actor, body: unknown, env: Env): Promise<{ created: boolean; run: RunView }> {
  requireOperator(actor);
  const b = parseOrThrow(CreateRunBodySchema, body);
  // Stage 2 runs use real providers and never send: Phase 0 "dry_run" semantics, compliance approval impossible.
  const campaign = parseOrThrow(CampaignInputSchema, { ...b.campaign, mode: "dry_run", compliance_approved: false });
  const owner = actor.isSuperAdmin && b.view_as_user_id ? b.view_as_user_id : actor.userId;
  const prospectLimit = effectiveLimit(campaign.limit, env);
  if (prospectLimit < 1) throw new OutreachError("VALIDATION", "Prospect limit resolves to 0 (check PROOF_MAX_PROSPECTS)");
  const res = await repo.createRun(db, {
    owner, actor: actor.userId, name: b.name ?? campaign.name, campaign, prospectLimit,
    budgetCapEur: effectiveBudget(campaign, env), concurrency: pipelineSettings(env).concurrency,
    maxAttempts: DEFAULT_MAX_ATTEMPTS, idempotencyKey: b.idempotency_key ?? null,
  });
  if (b.start && res.created) return { created: true, run: await repo.runAction(db, actor, res.run.id, "start") };
  return res;
}

export async function runActionForActor(db: OutreachDb, actor: Actor, runId: string, action: string, body: unknown): Promise<RunView> {
  if (action === "budget") {
    requireOperator(actor);
    const b = parseOrThrow(z.object({ budget_cap_eur: z.number().positive().max(1000) }), body);
    return repo.setBudget(db, actor, runId, b.budget_cap_eur);
  }
  if (!(RUN_ACTIONS as readonly string[]).includes(action)) throw new OutreachError("VALIDATION", `Unknown action ${action}`);
  if (action === "start" || action === "resume") requireOperator(actor);
  const reason = parseOrThrow(z.object({ reason: z.string().trim().max(200).optional() }).optional(), body ?? undefined)?.reason ?? null;
  return repo.runAction(db, actor, runId, action as RunAction, reason);
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Maps errors to HTTP. Database details are never returned to the browser. */
export function httpErrorFor(e: unknown): { status: number; error: string } {
  if (e instanceof OutreachError) {
    switch (e.code) {
      case "NOT_FOUND": return { status: 404, error: "Not found" };
      case "FORBIDDEN": return { status: 403, error: e.message };
      case "INVALID_TRANSITION": return { status: 409, error: e.message };
      case "VALIDATION": return { status: 400, error: e.message };
      default: return { status: 500, error: "Internal error" };
    }
  }
  return { status: 500, error: "Internal error" };
}

export function actorFromSession(s: { userId: string; isAdmin: boolean; isSuperAdmin: boolean }): Actor {
  return { userId: s.userId, isAdmin: !!s.isAdmin, isSuperAdmin: !!s.isSuperAdmin };
}
