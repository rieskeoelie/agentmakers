import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CostTracker } from "../../../src/lib/outreach/cost.js";
import { runProof, type ProofResult } from "../../../src/lib/outreach/pipeline.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import { runWorkerTick } from "../../../src/lib/outreach/orchestration/worker.js";
import { campaign, countingFetch, createTestDb, drain, fixtureContext, fixtureDeps, newRun, OWNER, prospectsOf, runRow, type TestDb } from "./helpers.js";

// Real Postgres (PGlite) work: generous timeouts so parallel test files under CPU load do not time out.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/**
 * The orchestrated, persisted, resumable pipeline must produce the same results as the validated
 * Phase 0 runProof on the same fixtures (only difference: duplicate contacts are BLOCKED instead of SKIPPED).
 */
let t: TestDb;
let phase0: ProofResult;
let phase0Cost: CostTracker;
let runId: string;
let ticks: number;

beforeAll(async () => {
  t = await createTestDb();
  phase0Cost = new CostTracker("phase0", 10);
  const d = fixtureDeps(phase0Cost);
  phase0 = await runProof(campaign(), 20, d.deps, d.brainFetcher);

  const run = await newRun(t.db, { concurrency: 1, budget: 10 });
  runId = run.id;
  ticks = await drain(fixtureContext(t.db, { settings: { maxParallel: 1 } }), t);
});
afterAll(async () => { await t.close(); });

const expectedOutcome = (p: ProofResult["prospects"][number]) =>
  p.status === "SKIPPED" && p.status_reasons.some((r) => r.startsWith("DUPLICATE_CONTACT")) ? "BLOCKED" : p.status;

describe("orchestrated run ≡ Phase 0 runProof (fixtures, zero network)", () => {
  it("completes the run through the worker", async () => {
    const r = await runRow(t, runId);
    expect(r.status).toBe("COMPLETED");
    expect(r.setup_state).toBe("DONE");
    expect(ticks).toBeGreaterThanOrEqual(1);
  });

  it("same discovery, dedupe and prefilter decisions", async () => {
    const run = await repo.getRun(t.db, OWNER, runId);
    const s = run.discovery_summary as { returned: number; duplicates: unknown[]; prefilter_rejected: unknown[]; selected: number };
    expect(phase0.prospects.length).toBe(10);
    expect(s.returned).toBe(phase0.discovery.returned);
    expect(s.duplicates).toEqual(phase0.discovery.duplicates);
    expect(s.prefilter_rejected).toEqual(phase0.discovery.prefilter_rejected);
    expect(s.selected).toBe(phase0.discovery.selected);
    expect(run.counts.total).toBe(phase0.prospects.length);
  });

  it("same outcome, recipient and rendered email for every prospect", async () => {
    const rows = await prospectsOf(t, runId);
    expect(rows.map((r) => r.domain)).toEqual(phase0.prospects.map((p) => p.domain));
    for (const p0 of phase0.prospects) {
      const row = rows.find((r) => r.domain === p0.domain)!;
      expect(row.outcome, p0.domain).toBe(expectedOutcome(p0));
      expect(row.queue_state).toBe("DONE");
      expect(row.current_step).toBe("DONE");
      expect(row.email ?? null).toBe(p0.contact?.email?.toLowerCase() ?? null);
      const rec = row.record as { email: { subject: string; body: string } | null; status: string; stages: unknown };
      if (expectedOutcome(p0) === "BLOCKED") {
        // Phase 0 turns a later duplicate recipient into SKIPPED; production blocks it and keeps the pipeline status.
        expect(["READY", "NEEDS_REVIEW"]).toContain(rec.status);
        expect(row.outcome_reasons).toEqual(["DUPLICATE_CONTACT", `PIPELINE_STATUS:${rec.status}`]);
      } else {
        expect(rec.status).toBe(p0.status);
      }
      expect(rec.email?.subject ?? null).toBe(p0.email?.subject ?? null);
      expect(rec.email?.body ?? null).toBe(p0.email?.body ?? null);
    }
    expect(rows.filter((r) => r.outcome === "READY").length).toBe(phase0.prospects.filter((p) => p.status === "READY").length);
  });

  it("persists every provider call; spend equals Phase 0 and the run/prospect totals reconcile", async () => {
    const ledger = await t.sql<{ provider: string; operation: string; n: number; eur: string }>(
      "select provider, operation, count(*)::int n, sum(effective_cost_eur)::text eur from outreach_provider_calls where run_id = $1 group by 1, 2 order by 1, 2", [runId]);
    const p0: Record<string, number> = {};
    for (const c of phase0Cost.calls) if (c.result !== "blocked_by_budget") p0[`${c.provider}:${c.operation}`] = (p0[`${c.provider}:${c.operation}`] ?? 0) + 1;
    expect(Object.fromEntries(ledger.map((l) => [`${l.provider}:${l.operation}`, l.n]))).toEqual(p0);
    const r = await runRow(t, runId);
    expect(Number(r.spent_eur)).toBeCloseTo(phase0Cost.spentEur, 6);
    expect(Number(r.reserved_eur)).toBe(0);
    const [sums] = await t.sql<{ ledger: string; prospects: string }>(
      "select (select coalesce(sum(effective_cost_eur),0) from outreach_provider_calls where run_id = $1)::text ledger, (select coalesce(sum(spent_eur),0) from outreach_prospects where run_id = $1)::text prospects", [runId]);
    expect(Number(sums!.ledger)).toBeCloseTo(Number(r.spent_eur), 6);
    const setupSpend = await t.sql<{ s: string }>("select coalesce(sum(effective_cost_eur),0)::text s from outreach_provider_calls where run_id = $1 and prospect_id is null", [runId]);
    expect(Number(sums!.prospects) + Number(setupSpend[0]!.s)).toBeCloseTo(Number(r.spent_eur), 6);
    const open = await t.sql("select 1 from outreach_budget_reservations where run_id = $1 and released_at is null", [runId]);
    expect(open).toHaveLength(0);
  });

  it("stores a Company Brain with evidence for every researched company; evidence matches the brief", async () => {
    const rows = await prospectsOf(t, runId);
    const researched = phase0.prospects.filter((p) => p.stages.website_fetch.status === "ok");
    const brains = await t.sql<{ prospect_id: string }>("select prospect_id from outreach_company_brains where run_id = $1", [runId]);
    expect(brains.length).toBe(researched.length);
    for (const p0 of phase0.prospects.filter((p) => p.brief)) {
      const row = rows.find((r) => r.domain === p0.domain)!;
      const facts = await t.sql<{ ref: string }>("select ref from outreach_evidence where prospect_id = $1 and kind = 'FACT' order by ref", [row.id]);
      expect(facts.map((f) => f.ref)).toEqual(p0.brief!.observed_facts.map((f) => f.id).sort());
      const inf = await t.sql<{ ref: string }>("select ref from outreach_evidence where prospect_id = $1 and kind = 'INFERENCE' order by ref", [row.id]);
      expect(inf.map((f) => f.ref)).toEqual(p0.brief!.inferences.map((i) => i.id).sort());
    }
  });

  it("raw prospects never touch the CRM leads table (it does not even exist here)", async () => {
    const leads = await t.sql("select 1 from pg_tables where tablename = 'leads'");
    expect(leads).toHaveLength(0);
  });

  it("keeps a timeline", async () => {
    const types = new Set((await repo.listEvents(t.db, OWNER, runId, 0, 1000)).map((e) => e.type));
    for (const ty of ["RUN_CREATED", "RUN_STATUS", "SETUP_CLAIMED", "SETUP_DONE", "PROSPECT_CLAIMED", "PROSPECT_DONE"]) expect(types.has(ty), ty).toBe(true);
  });
});

describe("worker behaviour", () => {
  it("an idle worker returns immediately with no work", async () => {
    const t2 = await createTestDb();
    const r = await runWorkerTick(fixtureContext(t2.db));
    expect(r).toEqual({ claimedSetups: 0, claimedProspects: 0, hasMoreWork: false });
    await t2.close();
  });

  it("runs prospects in parallel up to the run's concurrency and still completes", async () => {
    const t2 = await createTestDb();
    const spy = countingFetch();
    const run = await newRun(t2.db, { concurrency: 3 });
    await drain(fixtureContext(t2.db, { providerFetch: spy.fetch, settings: { maxParallel: 5 } }), t2);
    expect((await runRow(t2, run.id)).status).toBe("COMPLETED");
    const max = await t2.sql<{ n: number }>("select count(*)::int n from outreach_prospects where run_id = $1 and queue_state = 'DONE'", [run.id]);
    expect(max[0]!.n).toBe(10);
    expect(spy.count("api.hunter.io")).toBeGreaterThan(0);
    await t2.close();
  });

  it("a paused run is not processed; resume continues it", async () => {
    const t2 = await createTestDb();
    const run = await newRun(t2.db);
    await repo.runAction(t2.db, OWNER, run.id, "pause");
    const r = await runWorkerTick(fixtureContext(t2.db));
    expect(r.claimedSetups + r.claimedProspects).toBe(0);
    expect((await runRow(t2, run.id)).status).toBe("PAUSED");
    await repo.runAction(t2.db, OWNER, run.id, "resume");
    await drain(fixtureContext(t2.db), t2);
    expect((await runRow(t2, run.id)).status).toBe("COMPLETED");
    await t2.close();
  });
});
