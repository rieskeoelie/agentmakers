import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../../../src/lib/outreach/http.js";
import { runProspectJob, runSetupJob } from "../../../src/lib/outreach/orchestration/jobs.js";
import { repo, type ClaimedProspect } from "../../../src/lib/outreach/orchestration/repository.js";
import type { LLMProvider, StructuredRequest } from "../../../src/lib/outreach/providers/anthropic.js";
import { FixtureLLM, fixtureProviderFetch } from "../fixtures.js";
import { countingFetch, createTestDb, drain, fixtureContext, newRun, OWNER, prospectsOf, runRow, type TestDb } from "./helpers.js";

// Real Postgres (PGlite) work: generous timeouts so parallel test files under CPU load do not time out.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const TARGET = "tandartspraktijk-dewit.example";
const claimArgs = { leaseSeconds: 900, reservationEur: 1, minReservationEur: 0.05 };

/** FixtureLLM whose personalization call can be held open (simulates a worker that dies mid-call). */
class HoldableLlm implements LLMProvider {
  readonly name = "fixture-llm";
  private readonly inner = new FixtureLLM();
  private release!: () => void;
  private readonly gate = new Promise<void>((r) => { this.release = r; });
  calls = 0;
  constructor(private readonly hold: boolean) {}
  open() { this.release(); }
  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    if (req.task === "personalization_hook") {
      this.calls++;
      if (this.hold) await this.gate;
    }
    return this.inner.structured(req);
  }
}

async function waitFor(check: () => Promise<boolean>, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timeout");
}

/** Run setup, then leave only `domain` claimable. */
async function setupAndIsolate(t: TestDb, runId: string, domain: string) {
  const claim = await repo.claimWork(t.db, { workerId: "setup", maxProspects: 0, ...claimArgs });
  expect(claim.setups).toHaveLength(1);
  await runSetupJob(fixtureContext(t.db), claim.setups[0]!);
  await t.sql("update outreach_prospects set next_attempt_at = now() + interval '1 hour' where run_id = $1 and domain <> $2", [runId, domain]);
}

async function claimOne(t: TestDb, workerId: string): Promise<ClaimedProspect> {
  const c = await repo.claimWork(t.db, { workerId, maxProspects: 1, ...claimArgs });
  expect(c.prospects).toHaveLength(1);
  return c.prospects[0]!;
}

describe("interrupted run resumes without repeating paid work", () => {
  it("worker dies mid-prospect → lease expires → another worker finishes using the journal; the stale worker cannot overwrite", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db);
    await setupAndIsolate(t, run.id, TARGET);

    // Worker 1 gets as far as the personalization call, then "dies" (its promise is abandoned).
    const spy1 = countingFetch();
    const hung = new HoldableLlm(true);
    const job1 = await claimOne(t, "w1");
    const stale = runProspectJob(fixtureContext(t.db, { providerFetch: spy1.fetch, llm: hung }), job1);
    await waitFor(async () => (await t.sql<{ s: string }>("select current_step s from outreach_prospects where id = $1", [job1.prospect.id]))[0]!.s === "PERSONALIZATION");
    const hunterCallsAttempt1 = spy1.count("api.hunter.io");
    expect(hunterCallsAttempt1).toBeGreaterThan(0);
    const spentAfter1 = Number((await prospectsOf(t, run.id)).find((p) => p.domain === TARGET)!.spent_eur);
    expect(spentAfter1).toBeGreaterThan(0); // Hunter credits were persisted while the worker was still alive
    const ledgerAfter1 = await t.sql("select id from outreach_provider_calls where prospect_id = $1", [job1.prospect.id]);

    // Its lease expires (Vercel killed the invocation).
    await t.sql("update outreach_prospects set lease_until = now() - interval '1 second' where id = $1", [job1.prospect.id]);

    // Worker 2 reclaims it (attempt 2) and finishes it. Hunter is NOT called again: results come from the journal.
    const spy2 = countingFetch();
    const fresh = new HoldableLlm(false);
    const job2 = await claimOne(t, "w2");
    expect(job2.prospect.id).toBe(job1.prospect.id);
    expect(job2.prospect.attempts).toBe(2);
    expect(job2.lease_token).not.toBe(job1.lease_token);
    const ack2 = await runProspectJob(fixtureContext(t.db, { providerFetch: spy2.fetch, llm: fresh }), job2);
    expect(ack2.accepted).toBe(true);
    expect(spy2.count("api.hunter.io")).toBe(0);
    expect(fresh.calls).toBe(1); // the personalization never completed before, so it runs once now

    const row = (await prospectsOf(t, run.id)).find((p) => p.domain === TARGET)!;
    expect(row.outcome).toBe("READY");
    expect(Number(row.spent_eur)).toBeCloseTo(spentAfter1, 6); // nothing billed twice
    const ledgerAfter2 = await t.sql("select id from outreach_provider_calls where prospect_id = $1", [job1.prospect.id]);
    expect(ledgerAfter2.length).toBe(ledgerAfter1.length);

    // The "dead" worker wakes up: its result is rejected (stale lease) and changes nothing.
    hung.open();
    const ackStale = await stale;
    expect(ackStale).toMatchObject({ accepted: false, reason: "STALE_LEASE" });
    const after = (await prospectsOf(t, run.id)).find((p) => p.domain === TARGET)!;
    expect(after.outcome).toBe("READY");
    expect(after.attempts).toBe(2);
    expect(Number((await runRow(t, run.id)).reserved_eur)).toBeGreaterThanOrEqual(0);
    await t.close();
  });

  it("the sweeper re-queues expired setup leases too, and the run still completes", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db);
    const c = await repo.claimWork(t.db, { workerId: "dies", maxProspects: 0, ...claimArgs });
    expect(c.setups).toHaveLength(1); // claimed, never finished
    await t.sql("update outreach_runs set setup_lease_until = now() - interval '1 second' where id = $1", [run.id]);
    await drain(fixtureContext(t.db), t);
    const r = await runRow(t, run.id);
    expect(r.status).toBe("COMPLETED");
    expect(Number(r.reserved_eur)).toBe(0);
    const ev = (await repo.listEvents(t.db, OWNER, run.id, 0, 1000)).map((e) => e.type);
    expect(ev).toContain("SETUP_LEASE_EXPIRED");
    await t.close();
  });
});

describe("duplicate job execution / idempotency", () => {
  it("the same prospect can never be claimed twice concurrently", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db);
    await setupAndIsolate(t, run.id, TARGET);
    const claims = await Promise.all(Array.from({ length: 6 }, (_, i) => repo.claimWork(t.db, { workerId: `w${i}`, maxProspects: 5, ...claimArgs })));
    expect(claims.flatMap((c) => c.prospects).length).toBe(1);
    await t.close();
  });

  it("completing a prospect twice is a no-op the second time", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db);
    await setupAndIsolate(t, run.id, TARGET);
    const job = await claimOne(t, "w1");
    const first = await runProspectJob(fixtureContext(t.db), job);
    expect(first.accepted).toBe(true);
    const again = await runProspectJob(fixtureContext(t.db), job); // duplicate delivery of the same job
    expect(again).toMatchObject({ accepted: false, reason: "STALE_LEASE" });
    const n = await t.sql("select 1 from outreach_company_brains where prospect_id = $1", [job.prospect.id]);
    expect(n).toHaveLength(1);
    await t.close();
  });

  it("completing setup twice does not duplicate prospects; ledger writes are idempotent", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db);
    const c = await repo.claimWork(t.db, { workerId: "s", maxProspects: 0, ...claimArgs });
    const setup = c.setups[0]!;
    expect((await runSetupJob(fixtureContext(t.db), setup)).accepted).toBe(true);
    const again = await runSetupJob(fixtureContext(t.db), setup);
    expect(again).toMatchObject({ accepted: false, reason: "STALE_LEASE" });
    expect((await prospectsOf(t, run.id)).length).toBe(10);

    const call = { id: "0b6a1f3c-1b2a-4c55-9f00-000000000001", provider: "hunter" as const, operation: "domain_search", estimated_cost_eur: 0.05, actual_cost_eur: 0.05, native_cost: "1 credit", timestamp: new Date().toISOString(), result: "ok" as const, campaign: "x", prospect: null };
    const before = Number((await runRow(t, run.id)).spent_eur);
    await repo.recordCalls(t.db, { runId: run.id, prospectId: null, leaseToken: setup.lease_token, calls: [call], journal: [{ key: "k", result: { v: 1 } }], step: null });
    await Promise.all([
      repo.recordCalls(t.db, { runId: run.id, prospectId: null, leaseToken: setup.lease_token, calls: [call], journal: [{ key: "k", result: { v: 2 } }], step: null }),
      repo.recordCalls(t.db, { runId: run.id, prospectId: null, leaseToken: setup.lease_token, calls: [call], journal: [], step: null }),
    ]);
    expect(Number((await runRow(t, run.id)).spent_eur)).toBeCloseTo(before + 0.05, 6);
    expect(await repo.getJournal(t.db, run.id)).toMatchObject({ k: { v: 1 } });
    await t.close();
  });
});

describe("failure isolation", () => {
  it("one prospect whose provider keeps failing is retried, then FAILED; every other prospect completes and the run completes", async () => {
    const t = await createTestDb();
    const BAD = "tandartsen-centrum.example";
    const base = fixtureProviderFetch();
    const failing: FetchLike = async (url, init) => {
      const u = new URL(url);
      if (u.hostname === "api.hunter.io" && (u.searchParams.get("domain") === BAD || (u.searchParams.get("email") ?? "").endsWith(`@${BAD}`))) {
        return new Response(JSON.stringify({ errors: [{ details: "fixture outage" }] }), { status: 500, headers: { "content-type": "application/json" } });
      }
      return base(url, init);
    };
    const run = await newRun(t.db, { maxAttempts: 3 });
    await drain(fixtureContext(t.db, { providerFetch: failing }), t);
    const rows = await prospectsOf(t, run.id);
    const bad = rows.find((r) => r.domain === BAD)!;
    expect(bad.queue_state).toBe("FAILED");
    expect(bad.outcome).toBe("FAILED");
    expect(bad.attempts).toBe(3);
    expect(bad.record).not.toBeNull(); // the last attempt's Phase 0 record is kept for diagnosis
    expect(rows.filter((r) => r.domain !== BAD).every((r) => r.queue_state === "DONE")).toBe(true);
    expect(rows.filter((r) => r.outcome === "READY").length).toBeGreaterThan(0);
    expect((await runRow(t, run.id)).status).toBe("COMPLETED");
    const retries = (await repo.listEvents(t.db, OWNER, run.id, 0, 1000)).filter((e) => e.type === "PROSPECT_RETRY_SCHEDULED");
    expect(retries).toHaveLength(2);
    await t.close();
  });

  it("stop mid-run: pending prospects are cancelled, in-flight work finishes, nothing new is claimed", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db, { concurrency: 1 });
    const c = await repo.claimWork(t.db, { workerId: "s", maxProspects: 0, ...claimArgs });
    await runSetupJob(fixtureContext(t.db), c.setups[0]!);
    const job = await claimOne(t, "w1");
    expect((await repo.runAction(t.db, OWNER, run.id, "stop")).status).toBe("STOPPED");
    const ack = await runProspectJob(fixtureContext(t.db), job);
    expect(ack.accepted).toBe(true);
    const rows = await prospectsOf(t, run.id);
    expect(rows.filter((r) => r.queue_state === "DONE")).toHaveLength(1);
    expect(rows.filter((r) => r.queue_state === "CANCELLED")).toHaveLength(9);
    const more = await repo.claimWork(t.db, { workerId: "w2", maxProspects: 5, ...claimArgs });
    expect(more.prospects).toHaveLength(0);
    expect((await runRow(t, run.id)).status).toBe("STOPPED");
    expect(Number((await runRow(t, run.id)).reserved_eur)).toBe(0);
    await t.close();
  });
});
