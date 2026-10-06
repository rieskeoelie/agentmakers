import { describe, expect, it, vi } from "vitest";
import { runSetupJob } from "../../../src/lib/outreach/orchestration/jobs.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import { createTestDb, drain, fixtureContext, newRun, OWNER, prospectsOf, runRow } from "./helpers.js";

// Real Postgres (PGlite) work: generous timeouts so parallel test files under CPU load do not time out.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe("concurrency-safe budget", () => {
  it("concurrent workers can never reserve more than the remaining budget", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db, { concurrency: 5 });
    const c = await repo.claimWork(t.db, { workerId: "s", maxProspects: 0, leaseSeconds: 900, reservationEur: 1, minReservationEur: 0.05 });
    await runSetupJob(fixtureContext(t.db), c.setups[0]!);
    const spent = Number((await runRow(t, run.id)).spent_eur);
    await t.sql("update outreach_runs set budget_cap_eur = $2 where id = $1", [run.id, spent + 0.25]);

    const claims = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      repo.claimWork(t.db, { workerId: `w${i}`, maxProspects: 1, leaseSeconds: 900, reservationEur: 0.1, minReservationEur: 0.05 })));
    const grants = claims.flatMap((x) => x.prospects.map((p) => Number(p.reservation_eur)));
    expect(grants).toEqual([0.1, 0.1, 0.05]);
    const r = await runRow(t, run.id);
    expect(Number(r.reserved_eur)).toBeCloseTo(0.25, 6);
    expect(Number(r.spent_eur) + Number(r.reserved_eur)).toBeLessThanOrEqual(Number(r.budget_cap_eur) + 1e-9);
    expect(r.status).toBe("RUNNING"); // others are still in flight, so not paused yet
    const [open] = await t.sql<{ s: string }>("select sum(remaining_eur)::text s from outreach_budget_reservations where run_id = $1 and released_at is null", [run.id]);
    expect(Number(open!.s)).toBeCloseTo(0.25, 6);
    await t.close();
  });

  it("exhausted budget pauses the run (no prospect is failed), raising it + resume finishes with no double spend", async () => {
    const base = await createTestDb();
    const baseRun = await newRun(base.db);
    await drain(fixtureContext(base.db), base);
    const baseline = await prospectsOf(base, baseRun.id);
    const baseSpent = Number((await runRow(base, baseRun.id)).spent_eur);
    expect(baseSpent).toBeGreaterThan(0.3);
    await base.close();

    const t = await createTestDb();
    const run = await newRun(t.db, { budget: 0.3 });
    await drain(fixtureContext(t.db, { settings: { reservationEur: 0.12 } }), t);
    let r = await runRow(t, run.id);
    expect(r.status).toBe("PAUSED");
    expect(r.status_reason).toBe("BUDGET_EXHAUSTED");
    expect(Number(r.spent_eur)).toBeLessThanOrEqual(0.3 + 1e-9);
    const mid = await prospectsOf(t, run.id);
    expect(mid.some((p) => p.queue_state === "PENDING")).toBe(true);
    expect(mid.filter((p) => p.queue_state === "FAILED")).toHaveLength(0);
    expect(mid.every((p) => p.attempts <= 1)).toBe(true); // deferral does not consume attempts

    expect((await repo.setBudget(t.db, OWNER, run.id, 10)).budget_available_eur).toBeGreaterThan(9);
    expect((await repo.runAction(t.db, OWNER, run.id, "resume")).status).toBe("RUNNING");
    await drain(fixtureContext(t.db, { settings: { reservationEur: 0.12 } }), t);
    r = await runRow(t, run.id);
    expect(r.status).toBe("COMPLETED");
    expect(Number(r.reserved_eur)).toBe(0);
    expect(Number(r.spent_eur)).toBeCloseTo(baseSpent, 6); // journal replay: interrupted prospects did not pay twice
    const end = await prospectsOf(t, run.id);
    expect(end.map((p) => [p.domain, p.outcome])).toEqual(baseline.map((p) => [p.domain, p.outcome]));
    await t.close();
  });

  it("a budget below the minimum reservation pauses before any setup spend; budget cannot drop below committed spend", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db, { budget: 0.01 });
    await drain(fixtureContext(t.db), t);
    const r = await runRow(t, run.id);
    expect(r.status).toBe("PAUSED");
    expect(r.status_reason).toBe("BUDGET_EXHAUSTED");
    expect(Number(r.spent_eur)).toBe(0);
    await t.sql("update outreach_runs set spent_eur = 0.5, budget_cap_eur = 1 where id = $1", [run.id]);
    await expect(repo.setBudget(t.db, OWNER, run.id, 0.4)).rejects.toMatchObject({ code: "VALIDATION" });
    await t.close();
  });
});
