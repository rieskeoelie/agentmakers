import { randomUUID } from "node:crypto";
import type { Env } from "../config";
import type { CostTracker } from "../cost";
import type { OutreachDb } from "../orchestration/db";
import { AnthropicLLM, type LLMProvider } from "../providers/anthropic";
import { analyzeReply } from "./classify";
import { sendRepo } from "./repository";
import { runSendTick, stopAtProvider, type SendContext, type SendTickResult } from "./sender";
import { SmartleadClient, type SmartleadPort } from "./smartlead";
import { MIN_WEBHOOK_SECRET_LENGTH } from "./webhook";

/** Environment wiring for sending (server-only). Values are never logged or returned — only booleans. */
export interface SendingEnv {
  smartleadKey: string | null;
  webhookSecret: string | null;
  publicBaseUrl: string | null;
  envKill: boolean;
}

export function sendingEnvFrom(env: Record<string, string | undefined> = process.env): SendingEnv {
  const key = env.SMARTLEAD_API_KEY?.trim() || null;
  const secret = env.OUTREACH_WEBHOOK_SECRET?.trim() || null;
  const base = (env.OUTREACH_PUBLIC_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "") || null;
  return {
    smartleadKey: key,
    webhookSecret: secret && secret.length >= MIN_WEBHOOK_SECRET_LENGTH ? secret : null,
    publicBaseUrl: base && /^https:\/\//.test(base) ? base : null,
    envKill: /^(1|true|yes|on)$/i.test(env.OUTREACH_SENDING_DISABLED?.trim() ?? ""),
  };
}

export function webhookUrlFor(s: SendingEnv): string | null {
  return s.webhookSecret && s.publicBaseUrl ? `${s.publicBaseUrl}/api/outreach/webhooks/smartlead?token=${encodeURIComponent(s.webhookSecret)}` : null;
}

export function smartleadFor(s: SendingEnv): SmartleadPort | null {
  return s.smartleadKey ? new SmartleadClient(s.smartleadKey) : null;
}

export function sendContext(db: OutreachDb, s: SendingEnv, log?: SendContext["log"], smartlead: SmartleadPort | null = smartleadFor(s)): SendContext {
  return { db, smartlead, envKill: s.envKill, webhookUrl: webhookUrlFor(s), workerId: `send-${randomUUID()}`, log };
}

export function replyLlmFactory(env: Env): ((cost: CostTracker) => LLMProvider) | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return (cost) => new AnthropicLLM(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL, cost, {
    usdPerMTokIn: env.ANTHROPIC_USD_PER_MTOK_IN, usdPerMTokOut: env.ANTHROPIC_USD_PER_MTOK_OUT, usdToEur: env.USD_TO_EUR,
  });
}

/** Classifies pending inbound replies (and drafts suggested replies) within today's reply-LLM budget. */
export async function runAnalysisTick(ctx: SendContext, makeLlm: ((cost: CostTracker) => LLMProvider) | null, limit = 5): Promise<{ analyzed: number; failed: number }> {
  let analyzed = 0;
  let failed = 0;
  for (const { message, context } of await sendRepo.claimAnalysis(ctx.db, limit)) {
    const spend = await sendRepo.llmSpendToday(ctx.db);
    const remaining = Number(spend.budget_eur) - Number(spend.spent_eur);
    const out = await analyzeReply(null, makeLlm, context, message, remaining);
    const res = await sendRepo.setAnalysis(ctx.db, message.id, out.analysis, out.cost.length ? out.cost : null);
    if (out.analysis.state === "FAILED") failed++; else analyzed++;
    if (res.stop) await stopAtProvider(ctx, res.stop, "UNSUBSCRIBE");
  }
  return { analyzed, failed };
}

export async function runSendingWork(ctx: SendContext, env: Env): Promise<{ send: SendTickResult; analysis: { analyzed: number; failed: number } }> {
  const send = await runSendTick(ctx);
  const analysis = await runAnalysisTick(ctx, replyLlmFactory(env));
  return { send, analysis };
}
