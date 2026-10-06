/**
 * Thin production adapter for the outreach engine (Stage 1).
 *
 * The engine modules themselves never read environment variables — `runProof(campaign, limit, deps, fetcher)`
 * takes everything as parameters. In Phase 0 the CLI did the wiring; this file replaces only that wiring
 * for server-side use. It does not change any engine behaviour.
 *
 * Differences from the Phase 0 CLI:
 * - configuration comes from an explicit env object (default: process.env) and is NEVER loaded from a file
 *   (Next.js / Vercel already provide process.env);
 * - the Campaign Brain cache is optional and injected by the caller (Stage 2 will provide a DB-backed cache).
 *
 * Server-side only: never import this (or anything under src/lib/outreach) from a client component.
 */
import type { BrainCache } from "./brain";
import { EnvSchema, requiredRealModeEnvMissing, type Env } from "./config";
import type { CostTracker } from "./cost";
import type { PipelineDeps } from "./pipeline";
import { AnthropicLLM } from "./providers/anthropic";
import { DataForSeoDiscovery, DataForSeoOrganicSearch } from "./providers/dataforseo";
import { HunterClient } from "./providers/hunter";
import { ProspeoClient } from "./providers/prospeo";
import { SafePageFetcher, type PageFetcher } from "./research";

/** Parse outreach configuration from an env object. Never reads `.env.local` or any other file. */
export function loadOutreachEnv(source: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(source);
}

/** Thrown when required credentials are absent. Lists variable NAMES only, never values. */
export class OutreachConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`Outreach engine is missing required env vars: ${missing.join(", ")}`);
    this.name = "OutreachConfigError";
  }
}

/** Same clamping as the Phase 0 CLI: max 6 pages per site, concurrency 1–5. */
export function pipelineSettings(env: Env): PipelineDeps["settings"] {
  return {
    maxPages: Math.min(env.WEBSITE_MAX_PAGES, 6),
    maxTextChars: env.WEBSITE_MAX_TEXT_CHARS,
    concurrency: Math.min(Math.max(1, env.PIPELINE_CONCURRENCY), 5),
  };
}

/**
 * Real provider dependencies, wired exactly as the Phase 0 CLI's dry-run mode.
 * Constructing them makes no network calls; paid calls only happen when the pipeline runs.
 * Prospeo stays disabled (undefined) unless PROSPEO_API_KEY is set.
 */
export function createLiveDeps(
  env: Env,
  cost: CostTracker,
  opts: { brainCache?: BrainCache } = {},
): { deps: PipelineDeps; brainFetcher: PageFetcher } {
  const missing = requiredRealModeEnvMissing(env);
  if (missing.length) throw new OutreachConfigError(missing);
  const fetcher = new SafePageFetcher({ timeoutMs: env.WEBSITE_FETCH_TIMEOUT_MS, maxBytes: env.WEBSITE_MAX_RESPONSE_BYTES, maxRedirects: 5 });
  const deps: PipelineDeps = {
    discovery: new DataForSeoDiscovery({ login: env.DATAFORSEO_LOGIN!, password: env.DATAFORSEO_PASSWORD! }, cost, env.USD_TO_EUR),
    publicSearch: new DataForSeoOrganicSearch({ login: env.DATAFORSEO_LOGIN!, password: env.DATAFORSEO_PASSWORD! }, cost, env.USD_TO_EUR),
    hunter: new HunterClient(env.HUNTER_API_KEY!, cost, env.HUNTER_EUR_PER_CREDIT),
    prospeo: env.PROSPEO_API_KEY ? new ProspeoClient(env.PROSPEO_API_KEY, cost, env.PROSPEO_EUR_PER_CREDIT) : undefined,
    llm: new AnthropicLLM(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL, cost, {
      usdPerMTokIn: env.ANTHROPIC_USD_PER_MTOK_IN,
      usdPerMTokOut: env.ANTHROPIC_USD_PER_MTOK_OUT,
      usdToEur: env.USD_TO_EUR,
    }),
    websiteFetcher: fetcher,
    cost,
    brainCache: opts.brainCache,
    settings: pipelineSettings(env),
  };
  return { deps, brainFetcher: fetcher };
}
