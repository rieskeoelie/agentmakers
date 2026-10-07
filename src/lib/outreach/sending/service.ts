import { randomUUID } from "node:crypto";
import { z } from "zod";
import { OutreachError, type OutreachDb } from "../orchestration/db";
import { repo, type Actor } from "../orchestration/repository";
import { isUuid, requireOperator } from "../orchestration/service";
import { buildSequence, SequenceError, textToHtml } from "./sequence";
import { sendRepo, type SendingConfig } from "./repository";
import type { SmartleadPort } from "./smartlead";

/**
 * Actor-facing sending / Inbox operations. Same authorization model as Stages 2–3: tenant checks in SQL (other
 * accounts' rows do not exist for you), mutations need an admin (operator). AI never sends: manual replies require a
 * human session and an explicit request per message.
 */

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new OutreachError("VALIDATION", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}
const needId = (id: string) => { if (!isUuid(id)) throw new OutreachError("NOT_FOUND", "Not found"); };

export type QueueResult = { ok: boolean; created?: boolean; blockers?: string[]; send?: unknown };

/** Builds the 3-step sequence from the stored, validated Phase 0 email and queues it (gate enforced in SQL). */
export async function queueProspect(db: OutreachDb, actor: Actor, prospectId: string, source: "manual" | "autopilot" = "manual"): Promise<QueueResult> {
  needId(prospectId);
  const m = await sendRepo.sendMaterial(db, actor, prospectId);
  let built;
  try {
    built = buildSequence({
      message: m.message, firstName: m.contact?.first_name ?? null, companyName: m.company_name, language: m.language, formality: m.formality,
      senderName: m.sender_name, delaysDays: m.followup_delays_days, claimFlags: m.claim_flags,
    });
  } catch (e) {
    if (e instanceof SequenceError) return { ok: false, blockers: [e.code] };
    throw e;
  }
  return sendRepo.queue(db, actor, prospectId, source, {
    subject: built.subject, body: built.body, sequence: built.sequence, first_name: m.contact?.first_name ?? null, last_name: m.contact?.last_name ?? null, language: m.language,
  });
}

export async function queueProspectForActor(db: OutreachDb, actor: Actor, prospectId: string): Promise<QueueResult> {
  requireOperator(actor);
  return queueProspect(db, actor, prospectId, "manual");
}

/** Queue every READY prospect of a run that passes the gate. Blocked ones are reported, never forced. */
export async function queueRunReadyForActor(db: OutreachDb, actor: Actor, runId: string) {
  requireOperator(actor);
  needId(runId);
  const view = await sendRepo.runSending(db, actor, runId);
  const results: Array<{ prospect_id: string; ok: boolean; blockers?: string[] }> = [];
  for (const p of view.ready_unqueued) {
    const r = await queueProspect(db, actor, p.prospect_id, "manual");
    results.push({ prospect_id: p.prospect_id, ok: r.ok, blockers: r.blockers });
  }
  return { queued: results.filter((r) => r.ok).length, refused: results.filter((r) => !r.ok), results };
}

export async function cancelSendForActor(db: OutreachDb, actor: Actor, sendId: string, body: unknown) {
  requireOperator(actor);
  needId(sendId);
  const b = parseOrThrow(z.object({ reason: z.string().trim().max(200).optional() }).optional(), body ?? undefined);
  return sendRepo.cancel(db, actor, sendId, b?.reason ?? null);
}

// ─── Configuration / kill switch ─────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const ConfigPatchSchema = z.object({
  sending_enabled: z.boolean().optional(),
  autopilot_enabled: z.boolean().optional(),
  daily_new_leads_cap: z.number().int().min(0).max(200).optional(),
  max_pushes_per_tick: z.number().int().min(1).max(50).optional(),
  test_recipients: z.array(z.string().trim().toLowerCase().regex(EMAIL_RE)).max(20).optional(),
  followup_delays_days: z.array(z.number().int().min(1).max(30)).length(2).optional(),
  schedule: z.object({
    timezone: z.string().min(3).max(60), days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start_hour: z.string().regex(/^\d{2}:\d{2}$/), end_hour: z.string().regex(/^\d{2}:\d{2}$/), min_time_btw_emails: z.number().int().min(3).max(120),
  }).optional(),
  email_account_ids: z.array(z.string().regex(/^[\w-]{1,40}$/)).max(50).optional(),
  daily_llm_budget_eur: z.number().min(0).max(50).optional(),
  kill_reason: z.string().trim().max(200).nullable().optional(),
}).strict();

export async function setSendingConfigForActor(db: OutreachDb, actor: Actor, body: unknown): Promise<SendingConfig> {
  requireOperator(actor);
  const patch = parseOrThrow(ConfigPatchSchema, body);
  if (!Object.keys(patch).length) throw new OutreachError("VALIDATION", "Nothing to change");
  return sendRepo.setConfig(db, actor, patch);
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

const ListSchema = z.object({
  status: z.enum(["needs_action", "waiting", "done", "sequences"]).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  view_as: z.string().trim().max(200).optional(),
});

export async function inboxListForActor(db: OutreachDb, actor: Actor, params: URLSearchParams) {
  const raw = Object.fromEntries([...params].filter(([, v]) => v.trim() !== ""));
  const q = parseOrThrow(ListSchema, raw);
  const owner = actor.isSuperAdmin && q.view_as ? q.view_as : null;
  return sendRepo.inboxList(db, actor, owner, q.status ?? null, q.q ?? null, q.limit, q.offset);
}

export async function inboxThreadForActor(db: OutreachDb, actor: Actor, sendId: string) {
  needId(sendId);
  return sendRepo.inboxThread(db, actor, sendId);
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().min(2).max(5000), idempotency_key: z.string().trim().min(8).max(100), suggestion_message_id: z.string().refine(isUuid).optional(), confirm: z.literal(true) }),
  z.object({ action: z.literal("state"), inbox_status: z.enum(["NEEDS_ACTION", "WAITING", "DONE"]).optional(), disposition: z.enum(["INTERESTED", "MEETING", "NOT_NOW", "NOT_INTERESTED", "WRONG_PERSON", "CLOSED"]).optional(), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("promote") }),
  z.object({ action: z.literal("suppress"), scope: z.enum(["EMAIL", "DOMAIN"]), reason: z.enum(["do_not_contact", "unsubscribe", "wrong_target", "customer", "manual_exclusion"]), global: z.boolean().optional(), note: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("reanalyze"), message_id: z.string().refine(isUuid) }),
]);

export interface InboxDeps {
  smartlead: SmartleadPort | null;
  /** Called after a change that may need provider propagation (suppression → pause lead). */
  afterChange?: () => void;
}

export async function inboxActionForActor(db: OutreachDb, actor: Actor, sendId: string, body: unknown, deps: InboxDeps) {
  requireOperator(actor);
  needId(sendId);
  const a = parseOrThrow(ActionSchema, body);
  switch (a.action) {
    case "reply": return manualReply(db, actor, sendId, a.body, a.idempotency_key, a.suggestion_message_id ?? null, deps.smartlead);
    case "state": return { send: await sendRepo.setInboxState(db, actor, sendId, a.inbox_status ?? null, a.disposition ?? null, a.note ?? null) };
    case "promote": return promoteToLead(db, actor, sendId);
    case "reanalyze": {
      await sendRepo.requestReanalysis(db, actor, a.message_id);
      deps.afterChange?.();
      return { ok: true };
    }
    case "suppress": {
      const t = await sendRepo.inboxThread(db, actor, sendId);
      const value = a.scope === "EMAIL" ? t.send.email : t.send.domain;
      const res = await repo.addSuppression(db, actor, { global: !!a.global, owner: t.send.owner_user_id, kind: a.scope, value, reason: a.reason, note: a.note ?? null, source: "inbox" });
      await sendRepo.setInboxState(db, actor, sendId, "DONE", null, `suppressed:${a.scope}:${a.reason}`);
      deps.afterChange?.();
      return { suppression: res };
    }
  }
}

/** Manual reply: recorded PENDING first (idempotent), then sent in the provider thread, then finalized. */
export async function manualReply(db: OutreachDb, actor: Actor, sendId: string, body: string, key: string, suggestionId: string | null, sl: SmartleadPort | null) {
  if (!sl) throw new OutreachError("VALIDATION", "Smartlead is not configured");
  const begin = await sendRepo.beginReply(db, actor, sendId, body, key, suggestionId);
  if (!begin.ok) return { ok: false, blockers: begin.blockers ?? [] };
  if (!begin.created || !begin.provider) return { ok: begin.message?.status === "SENT", message: begin.message, duplicate: true };
  const msg = begin.message!;
  try {
    const history = await sl.messageHistory(begin.provider.campaign_id, begin.provider.lead_id);
    const replyTo = [...history].reverse().find((h) => h.type === "REPLY") ?? [...history].reverse().find((h) => h.type === "SENT");
    if (!replyTo?.stats_id) throw new Error("No provider message to reply to (message history is empty)");
    const sent = await sl.replyToThread(begin.provider.campaign_id, { lead_id: begin.provider.lead_id, reply_to: replyTo, email_body: textToHtml(body) });
    const fin = await sendRepo.finishReply(db, msg.id, true, sent.message_id, null);
    return { ok: true, message: fin.message };
  } catch (e) {
    const fin = await sendRepo.finishReply(db, msg.id, false, null, String((e as Error)?.message ?? e).slice(0, 400));
    return { ok: false, blockers: ["PROVIDER_SEND_FAILED"], message: fin.message };
  }
}

/** Landing-page slug from the campaign URL (https://www.agentmakers.io/nl/tandartspraktijken → tandartspraktijken). */
export function slugFromLanding(url: unknown): string {
  try {
    const parts = new URL(String(url)).pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] ?? "outreach").replace(/[^a-z0-9-]/gi, "").slice(0, 80) || "outreach";
  } catch {
    return "outreach";
  }
}

/** CRM context written into leads.business_info (text) so the lead keeps its outreach history. */
export function leadBusinessInfo(t: Record<string, unknown>): string {
  const send = t.send as Record<string, unknown>;
  const p = (t.prospect ?? {}) as Record<string, unknown>;
  const run = (t.run ?? {}) as Record<string, unknown>;
  const msgs = (t.messages as Array<Record<string, unknown>>) ?? [];
  const lastIn = [...msgs].reverse().find((m) => m.direction === "INBOUND");
  const facts = ((t.evidence as Array<Record<string, unknown>>) ?? []).filter((e) => e.kind === "FACT").slice(0, 5).map((e) => `- ${e.statement}`);
  const fit = (p.fit ?? {}) as Record<string, unknown>;
  return [
    "Bron: AgentMakers Outreach (Smartlead)",
    `Run: ${run.name ?? "-"} (${run.niche ?? "-"}${run.region ? `, ${run.region}` : ""})`,
    `Contact: ${send.contact_name ?? "-"}${p.contact_title ? ` — ${p.contact_title}` : ""} <${send.email}>`,
    `Website: ${p.website ?? send.website ?? "-"}`,
    `Fit: ${fit.verdict ?? fit.fit ?? "-"}`,
    `Classificatie: ${lastIn?.classification ?? send.last_classification ?? "-"}`,
    lastIn?.summary ? `Samenvatting reactie: ${lastIn.summary}` : null,
    lastIn?.body_text ? `Laatste reactie:\n${String(lastIn.body_text).slice(0, 1500)}` : null,
    facts.length ? `Feiten (Company Brain):\n${facts.join("\n")}` : null,
    `Outreach prospect: ${p.id ?? send.prospect_id}`,
  ].filter(Boolean).join("\n");
}

export async function promoteToLead(db: OutreachDb, actor: Actor, sendId: string) {
  const t = await sendRepo.inboxThread(db, actor, sendId);
  const p = (t.prospect ?? {}) as Record<string, unknown>;
  const run = (t.run ?? {}) as Record<string, unknown>;
  return sendRepo.promote(db, actor, sendId, {
    landing_page_slug: slugFromLanding(run.landing_url),
    telefoon: typeof p.phone === "string" ? p.phone.slice(0, 40) : "",
    business_info: leadBusinessInfo(t),
  });
}

export const newIdempotencyKey = () => randomUUID();
