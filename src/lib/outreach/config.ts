import { existsSync } from "node:fs";
import { z } from "zod";

/** Absolute ceiling for Phase 0. No config, flag or env var can raise it. */
export const HARD_MAX_PROSPECTS = 20;

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export const DEFAULT_ROLE_PRIORITY = [
  "owner",
  "founder",
  "managing director",
  "practice owner",
  "partner",
  "practice manager",
  "operations manager",
];

export const CampaignInputSchema = z.object({
  name: z.string().min(1).default("Phase 0 proof"),
  niche: z.string().min(2).max(100),
  country: z.string().min(2).max(60),
  region: z
    .string()
    .max(80)
    .optional()
    .transform((v) => (v && v.trim() && !/^REPLACE/i.test(v) ? v.trim() : undefined)),
  agentmakers_url: z
    .string()
    .url()
    .refine((u) => /^https:\/\/(www\.)?agentmakers\.io\//.test(u), "must be an https://agentmakers.io niche page"),
  limit: z.number().int().min(1).max(HARD_MAX_PROSPECTS),
  language: z.enum(["nl", "en"]).default("nl"),
  /** Formal (u) vs informal (je) Dutch. Default formal, matching the AgentMakers NL pages. */
  formality: z.enum(["formal", "informal"]).default("formal"),
  decision_maker_priority: z.array(z.string().min(2)).min(1).default(DEFAULT_ROLE_PRIORITY),
  max_api_budget_eur: z.number().positive().max(100).default(10),
  exclude_domains: z.array(z.string()).default([]),
  sender_name: z.string().min(1).default("Richard"),
  mode: z.enum(["fixture", "dry_run"]).default("fixture"),
  /** Phase 0 never sends. Kept explicit so it is visible in output. */
  compliance_approved: z.literal(false).default(false),
});
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? def : Number(v)))
    .pipe(z.number().finite().nonnegative());

export const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Empty/whitespace (e.g. `ANTHROPIC_MODEL=` in .env.local) is treated as unset → default model. */
  ANTHROPIC_MODEL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : DEFAULT_ANTHROPIC_MODEL)),
  /** USD per million tokens. Defaults = Sonnet 5.5 list price per Anthropic docs (verified 2026-10-06). */
  ANTHROPIC_USD_PER_MTOK_IN: num(2),
  ANTHROPIC_USD_PER_MTOK_OUT: num(10),
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
  /** EUR per Hunter credit. Depends on YOUR Hunter plan — placeholder default, set it. */
  HUNTER_EUR_PER_CREDIT: num(0.05),
  /** Optional Prospeo email-only fallback. Unset/empty → Prospeo is never called. */
  PROSPEO_API_KEY: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  /** EUR per Prospeo credit (1 credit per email found). Depends on YOUR plan — placeholder default, set it. */
  PROSPEO_EUR_PER_CREDIT: num(0.05),
  /** FX used only for cost estimates. Placeholder default — set it. */
  USD_TO_EUR: num(0.92),
  PROOF_MAX_PROSPECTS: num(HARD_MAX_PROSPECTS),
  PROOF_MAX_API_BUDGET_EUR: num(10),
  WEBSITE_MAX_PAGES: num(6),
  WEBSITE_FETCH_TIMEOUT_MS: num(12000),
  WEBSITE_MAX_RESPONSE_BYTES: num(2_000_000),
  WEBSITE_MAX_TEXT_CHARS: num(30_000),
  PIPELINE_CONCURRENCY: num(3),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env, envFile = ".env.local"): Env {
  if (source === process.env && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  return EnvSchema.parse(source);
}

export function requiredRealModeEnvMissing(env: Env): string[] {
  const missing: string[] = [];
  if (!env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!env.DATAFORSEO_LOGIN) missing.push("DATAFORSEO_LOGIN");
  if (!env.DATAFORSEO_PASSWORD) missing.push("DATAFORSEO_PASSWORD");
  if (!env.HUNTER_API_KEY) missing.push("HUNTER_API_KEY");
  return missing;
}

/** Effective prospect cap: min(requested, env, hard max). */
export function effectiveLimit(requested: number, env: Env): number {
  return Math.max(0, Math.min(requested, env.PROOF_MAX_PROSPECTS, HARD_MAX_PROSPECTS));
}

export function effectiveBudget(campaign: CampaignInput, env: Env): number {
  return Math.min(campaign.max_api_budget_eur, env.PROOF_MAX_API_BUDGET_EUR);
}
