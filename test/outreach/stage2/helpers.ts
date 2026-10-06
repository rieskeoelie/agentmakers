import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { CampaignInputSchema, type CampaignInput } from "../../../src/lib/outreach/config.js";
import type { CostTracker } from "../../../src/lib/outreach/cost.js";
import type { FetchLike } from "../../../src/lib/outreach/http.js";
import { toOutreachError, type OutreachDb } from "../../../src/lib/outreach/orchestration/db.js";
import type { JobDeps, WorkerContext } from "../../../src/lib/outreach/orchestration/jobs.js";
import { repo, type Actor, type RunView } from "../../../src/lib/outreach/orchestration/repository.js";
import { DEFAULT_WORKER_SETTINGS, type WorkerSettings } from "../../../src/lib/outreach/orchestration/settings.js";
import { runWorkerTick } from "../../../src/lib/outreach/orchestration/worker.js";
import type { LLMProvider } from "../../../src/lib/outreach/providers/anthropic.js";
import { DataForSeoDiscovery, DataForSeoOrganicSearch } from "../../../src/lib/outreach/providers/dataforseo.js";
import { HunterClient } from "../../../src/lib/outreach/providers/hunter.js";
import { ProspeoClient } from "../../../src/lib/outreach/providers/prospeo.js";
import type { PageFetcher } from "../../../src/lib/outreach/research.js";
import { FixtureLLM, FixturePageFetcher, fixtureProviderFetch } from "../fixtures.js";

export const MIGRATION = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261006150000_outreach_stage2.sql");
export const LANDING = "https://www.agentmakers.io/nl/tandartspraktijken";

export const OWNER: Actor = { userId: "user-owner", isAdmin: true, isSuperAdmin: false };
export const OTHER: Actor = { userId: "user-other", isAdmin: true, isSuperAdmin: false };
export const PARTNER: Actor = { userId: "user-partner", isAdmin: false, isSuperAdmin: false };
export const SUPER: Actor = { userId: "user-super", isAdmin: true, isSuperAdmin: true };

export interface TestDb {
  db: OutreachDb;
  pg: PGlite;
  sql<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/**
 * Real Postgres (PGlite) with the production migration applied. Every RPC runs as `service_role`
 * (like the Supabase service-role client), so table/function grants are exercised too.
 */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;");
  await pg.exec(readFileSync(MIGRATION, "utf8"));
  const db: OutreachDb = {
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      if (!/^outreach_[a-z_]+$/.test(fn)) throw new Error(`unexpected function ${fn}`);
      const keys = Object.keys(args);
      const values = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      const text = `select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
      try {
        return await pg.transaction(async (tx) => {
          await tx.exec("set local role service_role");
          const res = await tx.query<{ r: T }>(text, values);
          return res.rows[0]!.r;
        });
      } catch (e) {
        throw toOutreachError((e as Error).message);
      }
    },
  };
  return {
    db,
    pg,
    sql: async <T>(q: string, params?: unknown[]) => (await pg.query<T>(q, params)).rows,
    close: () => pg.close(),
  };
}

export function campaign(over: Partial<Record<string, unknown>> = {}): CampaignInput {
  return CampaignInputSchema.parse({
    niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: LANDING, limit: 20, mode: "dry_run", ...over,
  });
}

export async function newRun(db: OutreachDb, o: { actor?: Actor; owner?: string; budget?: number; limit?: number; concurrency?: number; maxAttempts?: number; start?: boolean; key?: string | null; campaign?: CampaignInput } = {}): Promise<RunView> {
  const actor = o.actor ?? OWNER;
  const res = await repo.createRun(db, {
    owner: o.owner ?? actor.userId, actor: actor.userId, name: "test run", campaign: o.campaign ?? campaign(), prospectLimit: o.limit ?? 20,
    budgetCapEur: o.budget ?? 10, concurrency: o.concurrency ?? 3, maxAttempts: o.maxAttempts ?? 3, idempotencyKey: o.key ?? null,
  });
  return o.start === false ? res.run : repo.runAction(db, actor, res.run.id, "start");
}

export interface FixtureOptions {
  providerFetch?: FetchLike;
  llm?: LLMProvider;
  websiteFetcher?: PageFetcher;
  brainFetcher?: PageFetcher;
  settings?: Partial<WorkerSettings>;
  workerId?: string;
  prospeo?: boolean;
  publicSearch?: boolean;
}

/** Provider dependencies exactly like the Phase 0 CLI fixture mode (zero network, real provider client code). */
export function fixtureDeps(cost: CostTracker, o: FixtureOptions = {}): JobDeps {
  const ff = o.providerFetch ?? fixtureProviderFetch();
  const fetcher = o.websiteFetcher ?? new FixturePageFetcher();
  return {
    deps: {
      discovery: new DataForSeoDiscovery({ login: "fixture", password: "fixture" }, cost, 0.92, ff),
      publicSearch: o.publicSearch === false ? undefined : new DataForSeoOrganicSearch({ login: "fixture", password: "fixture" }, cost, 0.92, ff),
      hunter: new HunterClient("fixture-key", cost, 0.05, ff, 1),
      prospeo: o.prospeo === false ? undefined : new ProspeoClient("fixture-key", cost, 0.05, ff, 1),
      llm: o.llm ?? new FixtureLLM(),
      websiteFetcher: fetcher,
      cost,
      settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 3 },
    },
    brainFetcher: o.brainFetcher ?? fetcher,
  };
}

export function fixtureContext(db: OutreachDb, o: FixtureOptions = {}): WorkerContext {
  return {
    db,
    workerId: o.workerId ?? "test-worker",
    settings: { ...DEFAULT_WORKER_SETTINGS, claimCutoffMs: 1_500, idlePollMs: 5, maxParallel: 3, ...o.settings },
    makeDeps: (cost) => fixtureDeps(cost, o),
  };
}

/** Runs worker ticks until no work is left, fast-forwarding retry backoff between ticks. */
export async function drain(ctx: WorkerContext, t: TestDb, maxTicks = 25): Promise<number> {
  for (let i = 1; i <= maxTicks; i++) {
    const r = await runWorkerTick(ctx);
    if (!r.hasMoreWork) return i;
    await t.sql("update outreach_prospects set next_attempt_at = now() where queue_state = 'PENDING'");
    await t.sql("update outreach_runs set setup_next_attempt_at = now() where setup_state = 'PENDING'");
  }
  throw new Error("worker did not drain");
}

/** Wraps a fetch and counts provider HTTP calls per host. */
export function countingFetch(inner: FetchLike = fixtureProviderFetch()): { fetch: FetchLike; count: (host: string) => number; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetch: async (url, init) => {
      urls.push(url);
      return inner(url, init);
    },
    count: (host) => urls.filter((u) => new URL(u).hostname === host).length,
  };
}

export async function prospectsOf(t: TestDb, runId: string) {
  return t.sql<{ id: string; domain: string; position: number; queue_state: string; outcome: string | null; outcome_reasons: string[]; email: string | null; attempts: number; spent_eur: string; current_step: string; record: Record<string, unknown> | null }>(
    "select id, domain, position, queue_state, outcome, outcome_reasons, email, attempts, spent_eur, current_step, record from outreach_prospects where run_id = $1 order by position",
    [runId],
  );
}

export async function runRow(t: TestDb, runId: string) {
  return (await t.sql<{ status: string; status_reason: string | null; setup_state: string; spent_eur: string; reserved_eur: string; budget_cap_eur: string }>(
    "select status, status_reason, setup_state, spent_eur, reserved_eur, budget_cap_eur from outreach_runs where id = $1", [runId]))[0]!;
}
