import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CostTracker } from "../../../src/lib/outreach/cost.js";
import { toOutreachError, type OutreachDb } from "../../../src/lib/outreach/orchestration/db.js";
import { CallRecorder, capturingFetcher, hashArgs, replayFetcher, type CapturedPage } from "../../../src/lib/outreach/orchestration/journal.js";
import { DEFAULT_WORKER_SETTINGS, workerSettingsFromEnv } from "../../../src/lib/outreach/orchestration/settings.js";
import { stepForCall } from "../../../src/lib/outreach/orchestration/states.js";
import { isWorkerAuthorized, kickWorker } from "../../../src/lib/outreach/orchestration/trigger.js";
import type { PageFetcher } from "../../../src/lib/outreach/research.js";
import type { LLMProvider } from "../../../src/lib/outreach/providers/anthropic.js";

/** Fake DB that records outreach_record_calls payloads (optionally failing first). */
function fakeDb(failTimes = 0) {
  const payloads: Array<Record<string, unknown>> = [];
  let fails = failTimes;
  const db: OutreachDb = {
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      if (fn !== "outreach_record_calls") throw new Error(`unexpected ${fn}`);
      if (fails-- > 0) throw new Error("db down");
      payloads.push(args);
      return { spent_delta_eur: 0 } as T;
    },
  };
  return { db, payloads };
}

const journalOf = (payloads: Array<Record<string, unknown>>) =>
  Object.fromEntries(payloads.flatMap((p) => p.p_journal as Array<{ key: string; result: unknown }>).map((j) => [j.key, j.result]));

describe("call journal", () => {
  it("records a completed call once and replays it on retry without calling the provider", async () => {
    const { db, payloads } = fakeDb();
    const cost = new CostTracker("r", 1);
    const first = new CallRecorder({ db, runId: "r", prospectId: "p", leaseToken: "l", cost, journal: {} });
    const invoke = vi.fn(async () => {
      cost.guard("hunter", "domain_search", "p", 0.05);
      cost.record({ prospect: "p", provider: "hunter", operation: "domain_search", estimated_cost_eur: 0.05, actual_cost_eur: 0.05, native_cost: "1", result: "ok" });
      return { emails: ["a@b.nl"] };
    });
    expect(await first.call("hunter", "domainSearch", ["b.nl", "p"], invoke)).toEqual({ emails: ["a@b.nl"] });
    expect(invoke).toHaveBeenCalledTimes(1);
    const ledger = payloads.flatMap((p) => p.p_calls as Array<{ id: string; provider: string }>);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.provider).toBe("hunter");

    const retry = new CallRecorder({ db, runId: "r", prospectId: "p", leaseToken: "l2", cost: new CostTracker("r", 1), journal: journalOf(payloads) });
    expect(await retry.call("hunter", "domainSearch", ["b.nl", "p"], invoke)).toEqual({ emails: ["a@b.nl"] });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(retry.stats).toEqual({ replayed: 1, live: 0 });
  });

  it("distinguishes repeated identical calls by occurrence and replays undefined faithfully", async () => {
    const { db, payloads } = fakeDb();
    const r1 = new CallRecorder({ db, runId: "r", prospectId: null, leaseToken: "l", cost: new CostTracker("r", 1), journal: {} });
    let n = 0;
    expect(await r1.call("x", "m", [1], async () => ++n)).toBe(1);
    expect(await r1.call("x", "m", [1], async () => ++n)).toBe(2);
    expect(await r1.call("x", "u", [], async () => undefined)).toBeUndefined();
    const r2 = new CallRecorder({ db, runId: "r", prospectId: null, leaseToken: "l", cost: new CostTracker("r", 1), journal: journalOf(payloads) });
    expect(await r2.call("x", "m", [1], async () => 99)).toBe(1);
    expect(await r2.call("x", "m", [1], async () => 99)).toBe(2);
    expect(await r2.call("x", "m", [1], async () => 99)).toBe(99); // a third call is new work
    expect(await r2.call("x", "u", [], async () => "live")).toBeUndefined();
  });

  it("LLM results are re-validated with the request schema on replay; the schema is not part of the key", async () => {
    const { db, payloads } = fakeDb();
    const schema = z.object({ hook: z.string() });
    let llmCalls = 0;
    const llm: LLMProvider = {
      name: "m",
      structured: async <T>(): Promise<T> => {
        llmCalls++;
        return { hook: "ok" } as T;
      },
    };
    const req = { task: "personalization_hook" as const, prospect: "p", system: "s", user: "u", schema, maxTokens: 10 };
    const r1 = new CallRecorder({ db, runId: "r", prospectId: "p", leaseToken: "l", cost: new CostTracker("r", 1), journal: {} });
    await r1.llm(llm).structured(req);
    const r2 = new CallRecorder({ db, runId: "r", prospectId: "p", leaseToken: "l", cost: new CostTracker("r", 1), journal: journalOf(payloads) });
    expect(await r2.llm(llm).structured({ ...req, schema: z.object({ hook: z.string() }) })).toEqual({ hook: "ok" });
    expect(llmCalls).toBe(1);
    const strict = new CallRecorder({ db, runId: "r", prospectId: "p", leaseToken: "l", cost: new CostTracker("r", 1), journal: journalOf(payloads) });
    await expect(strict.llm(llm).structured({ ...req, schema: z.object({ hook: z.number() }) as never })).rejects.toThrow();
  });

  it("ledger rows keep the same id when a persist fails and is retried (idempotent insert)", async () => {
    const { db, payloads } = fakeDb(1);
    const cost = new CostTracker("r", 1);
    const r = new CallRecorder({ db, runId: "r", prospectId: "p", leaseToken: "l", cost, journal: {} });
    cost.guard("hunter", "verify", "p", 0.01);
    cost.record({ prospect: "p", provider: "hunter", operation: "verify", estimated_cost_eur: 0.01, actual_cost_eur: null, native_cost: null, result: "ok" });
    await expect(r.persist()).rejects.toThrow("db down");
    await r.persist();
    await r.persist(); // nothing new → no write
    expect(payloads).toHaveLength(1);
    expect((payloads[0]!.p_calls as unknown[]).length).toBe(1);
  });

  it("progress steps only move forward and are written for prospect jobs only", async () => {
    const { db, payloads } = fakeDb();
    const r = new CallRecorder({ db, runId: "r", prospectId: "p", leaseToken: "l", cost: new CostTracker("r", 1), journal: {} });
    await r.advance("DECISION_MAKER");
    await r.advance("RESEARCH");
    await r.advance("PERSONALIZATION");
    expect(payloads.map((p) => p.p_step)).toEqual(["DECISION_MAKER", "PERSONALIZATION"]);
    const setup = new CallRecorder({ db, runId: "r", prospectId: null, leaseToken: "l", cost: new CostTracker("r", 1), journal: {} });
    await setup.advance("RESEARCH");
    expect(payloads).toHaveLength(2);
    expect(stepForCall("hunter", "verify")).toBe("ELIGIBILITY");
    expect(stepForCall("llm", "campaign_brain")).toBeNull();
  });

  it("hash keys are stable regardless of property order", () => {
    expect(hashArgs([{ a: 1, b: { c: 2, d: 3 } }])).toBe(hashArgs([{ b: { d: 3, c: 2 }, a: 1 }]));
    expect(hashArgs([{ a: 1 }])).not.toBe(hashArgs([{ a: 2 }]));
  });

  it("capturing fetcher keeps the optional fetchResource contract; replay serves only captured responses", async () => {
    const store = new Map<string, CapturedPage>();
    const plain: PageFetcher = { fetch: async (u) => ({ finalUrl: u, body: "<html>hi</html>", fetchedAt: "t" }) };
    const cap = capturingFetcher(plain, store);
    expect(cap.fetchResource).toBeUndefined();
    await cap.fetch("https://x.nl/");
    const rp = replayFetcher(store);
    expect((await rp.fetch("https://x.nl/")).body).toBe("<html>hi</html>");
    await expect(rp.fetch("https://x.nl/other")).rejects.toThrow("NOT_CAPTURED");
  });
});

describe("worker trigger + auth", () => {
  const SECRET = "s".repeat(32);
  it("never authorizes without a configured secret (the `undefined === undefined` trap)", () => {
    expect(isWorkerAuthorized(undefined, undefined)).toBe(false);
    expect(isWorkerAuthorized(null, "")).toBe(false);
    expect(isWorkerAuthorized("Bearer short", "short")).toBe(false);
    expect(isWorkerAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isWorkerAuthorized(SECRET, SECRET)).toBe(false);
    expect(isWorkerAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("kicks the worker endpoint with the secret and never throws", async () => {
    const f = vi.fn(async () => new Response(null, { status: 202 }));
    expect(await kickWorker({ origin: "https://agentmakers.io", secret: SECRET, fetchImpl: f as typeof fetch })).toBe(true);
    expect(f).toHaveBeenCalledWith("https://agentmakers.io/api/outreach/worker", expect.objectContaining({ method: "POST", headers: { authorization: `Bearer ${SECRET}` } }));
    expect(await kickWorker({ origin: "https://x.io", secret: SECRET, fetchImpl: (async () => { throw new Error("net"); }) as typeof fetch })).toBe(false);
    const g = vi.fn();
    expect(await kickWorker({ origin: "https://x.io", secret: undefined, fetchImpl: g as typeof fetch })).toBe(false);
    expect(g).not.toHaveBeenCalled();
  });

  it("worker settings: safe defaults, bounded overrides", () => {
    expect(workerSettingsFromEnv({})).toEqual(DEFAULT_WORKER_SETTINGS);
    expect(workerSettingsFromEnv({ OUTREACH_PROSPECT_RESERVATION_EUR: "0.5", OUTREACH_WORKER_MAX_PARALLEL: "2" })).toMatchObject({ reservationEur: 0.5, maxParallel: 2 });
    expect(() => workerSettingsFromEnv({ OUTREACH_WORKER_MAX_PARALLEL: "50" })).toThrow();
    expect(DEFAULT_WORKER_SETTINGS.leaseSeconds * 1000).toBeGreaterThan(300_000 + DEFAULT_WORKER_SETTINGS.tickBudgetMs); // lease outlives an invocation
  });

  it("maps database errors to typed codes", () => {
    expect(toOutreachError("OUTREACH_NOT_FOUND").code).toBe("NOT_FOUND");
    expect(toOutreachError("OUTREACH_INVALID_TRANSITION: COMPLETED -> pause")).toMatchObject({ code: "INVALID_TRANSITION", message: "COMPLETED -> pause" });
    expect(toOutreachError('new row violates check constraint "x"').code).toBe("VALIDATION");
    expect(toOutreachError("connection reset").code).toBe("DB");
  });
});
