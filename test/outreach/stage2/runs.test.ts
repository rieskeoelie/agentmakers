import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EnvSchema } from "../../../src/lib/outreach/config.js";
import { OutreachError } from "../../../src/lib/outreach/orchestration/db.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import { createRunForActor, httpErrorFor, runActionForActor } from "../../../src/lib/outreach/orchestration/service.js";
import { planRunAction, RUN_ACTIONS, RUN_STATUSES } from "../../../src/lib/outreach/orchestration/states.js";
import { createTestDb, newRun, OTHER, OWNER, PARTNER, SUPER, type TestDb, LANDING } from "./helpers.js";

// Real Postgres (PGlite) work: generous timeouts so parallel test files under CPU load do not time out.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

const codeOf = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as OutreachError).code; }
};

describe("run creation", () => {
  it("creates a run in CREATED with the validated campaign, caps and zero spend", async () => {
    const run = await newRun(t.db, { start: false, budget: 4, limit: 7 });
    expect(run.status).toBe("CREATED");
    expect(run.owner_user_id).toBe(OWNER.userId);
    expect(run.prospect_limit).toBe(7);
    expect(Number(run.budget_cap_eur)).toBe(4);
    expect(Number(run.spent_eur)).toBe(0);
    expect(run.setup_state).toBe("PENDING");
    expect(run.counts.total).toBe(0);
    const ev = await repo.listEvents(t.db, OWNER, run.id);
    expect(ev.map((e) => e.type)).toEqual(["RUN_CREATED"]);
  });

  it("is idempotent per owner + idempotency key", async () => {
    const a = await repo.createRun(t.db, { owner: OWNER.userId, actor: OWNER.userId, name: "x", campaign: { niche: "tandarts" } as never, prospectLimit: 5, budgetCapEur: 1, concurrency: 1, maxAttempts: 3, idempotencyKey: "k-1" });
    const b = await repo.createRun(t.db, { owner: OWNER.userId, actor: OWNER.userId, name: "x", campaign: { niche: "tandarts" } as never, prospectLimit: 5, budgetCapEur: 1, concurrency: 1, maxAttempts: 3, idempotencyKey: "k-1" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.run.id).toBe(a.run.id);
    const other = await repo.createRun(t.db, { owner: OTHER.userId, actor: OTHER.userId, name: "x", campaign: { niche: "tandarts" } as never, prospectLimit: 5, budgetCapEur: 1, concurrency: 1, maxAttempts: 3, idempotencyKey: "k-1" });
    expect(other.created).toBe(true);
  });

  it("enforces the Phase 0 limits in the database (max 20 prospects, positive budget, concurrency 1–5)", async () => {
    const base = { owner: OWNER.userId, actor: OWNER.userId, name: "x", campaign: {} as never, budgetCapEur: 1, concurrency: 1, maxAttempts: 3, idempotencyKey: null };
    expect(await codeOf(repo.createRun(t.db, { ...base, prospectLimit: 21 }))).toBe("VALIDATION");
    expect(await codeOf(repo.createRun(t.db, { ...base, prospectLimit: 5, budgetCapEur: 0 }))).toBe("VALIDATION");
    expect(await codeOf(repo.createRun(t.db, { ...base, prospectLimit: 5, concurrency: 6 }))).toBe("VALIDATION");
  });

  it("service: admin only, campaign validated, Stage 2 runs are always dry_run (no sending), caps from env", async () => {
    const env = EnvSchema.parse({ PROOF_MAX_PROSPECTS: "5", PROOF_MAX_API_BUDGET_EUR: "3", PIPELINE_CONCURRENCY: "9" });
    const body = { campaign: { niche: "tandarts", country: "Netherlands", agentmakers_url: LANDING, limit: 20, max_api_budget_eur: 50, mode: "fixture" } };
    expect(await codeOf(createRunForActor(t.db, PARTNER, body, env))).toBe("FORBIDDEN");
    expect(await codeOf(createRunForActor(t.db, OWNER, { campaign: { niche: "x" } }, env))).toBe("VALIDATION");
    expect(await codeOf(createRunForActor(t.db, OWNER, { campaign: { ...body.campaign, agentmakers_url: "https://evil.example/" } }, env))).toBe("VALIDATION");
    const res = await createRunForActor(t.db, OWNER, { ...body, start: true }, env);
    expect(res.run.status).toBe("QUEUED");
    expect(res.run.campaign.mode).toBe("dry_run");
    expect(res.run.campaign.compliance_approved).toBe(false);
    expect(res.run.prospect_limit).toBe(5);
    expect(Number(res.run.budget_cap_eur)).toBe(3);
    expect(res.run.concurrency).toBe(5);
  });

  it("service: superadmin can create on behalf of a partner (view_as), partners cannot", async () => {
    const env = EnvSchema.parse({});
    const body = { campaign: { niche: "tandarts", country: "Netherlands", agentmakers_url: LANDING, limit: 3 }, view_as_user_id: PARTNER.userId };
    const res = await createRunForActor(t.db, SUPER, body, env);
    expect(res.run.owner_user_id).toBe(PARTNER.userId);
    const own = await createRunForActor(t.db, OWNER, body, env);
    expect(own.run.owner_user_id).toBe(OWNER.userId);
  });
});

describe("run state machine (SQL is authoritative; TypeScript mirror must match)", () => {
  for (const status of RUN_STATUSES) {
    for (const action of RUN_ACTIONS) {
      for (const setupDone of [false, true]) {
        it(`${status} + ${action} (setup ${setupDone ? "done" : "pending"})`, async () => {
          const run = await newRun(t.db, { start: false });
          await t.sql("update outreach_runs set status = $2, setup_state = $3 where id = $1", [run.id, status, setupDone ? "DONE" : "PENDING"]);
          // keep one prospect pending so a resumed run does not auto-complete (covered separately below)
          if (setupDone) await t.sql("insert into outreach_prospects (run_id, owner_user_id, position, company_name, domain, company_key, company) values ($1, $2, 1, 'X', 'x.example', 'x', '{}')", [run.id, OWNER.userId]);
          const plan = planRunAction(status, action, setupDone);
          let got: string;
          try {
            got = (await repo.runAction(t.db, OWNER, run.id, action)).status;
          } catch (e) {
            got = `ERR:${(e as OutreachError).code}`;
          }
          if (plan.to) expect(got).toBe(plan.to);
          else if (plan.noop) expect(got).toBe(status);
          else expect(got).toBe("ERR:INVALID_TRANSITION");
        });
      }
    }
  }

  it("resuming a run with nothing left to do completes it immediately", async () => {
    const run = await newRun(t.db);
    await t.sql("update outreach_runs set status = 'PAUSED', setup_state = 'DONE' where id = $1", [run.id]);
    expect((await repo.runAction(t.db, OWNER, run.id, "resume")).status).toBe("COMPLETED");
  });

  it("rejects unknown actions", async () => {
    const run = await newRun(t.db, { start: false });
    expect(await codeOf(repo.runAction(t.db, OWNER, run.id, "explode" as never))).toBe("VALIDATION");
  });

  it("pause / resume / stop write the timeline and reasons", async () => {
    const run = await newRun(t.db);
    expect((await repo.runAction(t.db, OWNER, run.id, "pause", "lunch")).status_reason).toBe("lunch");
    expect((await repo.runAction(t.db, OWNER, run.id, "resume")).status).toBe("QUEUED"); // setup not done yet
    const stopped = await repo.runAction(t.db, OWNER, run.id, "stop");
    expect(stopped.status).toBe("STOPPED");
    expect(stopped.finished_at).not.toBeNull();
    const types = (await repo.listEvents(t.db, OWNER, run.id)).map((e) => (e.data as { to?: string } | null)?.to ?? e.type);
    expect(types).toEqual(["RUN_CREATED", "QUEUED", "PAUSED", "QUEUED", "STOPPED"]);
  });

  it("service: start/resume/budget need an admin; pause/stop only need the owner", async () => {
    const run = await newRun(t.db, { actor: SUPER, owner: PARTNER.userId, start: false });
    expect(await codeOf(runActionForActor(t.db, PARTNER, run.id, "start", undefined))).toBe("FORBIDDEN");
    await runActionForActor(t.db, SUPER, run.id, "start", undefined);
    expect((await runActionForActor(t.db, PARTNER, run.id, "pause", { reason: "check" })).status).toBe("PAUSED");
    expect(await codeOf(runActionForActor(t.db, PARTNER, run.id, "resume", undefined))).toBe("FORBIDDEN");
    expect(await codeOf(runActionForActor(t.db, PARTNER, run.id, "budget", { budget_cap_eur: 5 }))).toBe("FORBIDDEN");
    expect(Number((await runActionForActor(t.db, SUPER, run.id, "budget", { budget_cap_eur: 5 })).budget_cap_eur)).toBe(5);
    expect((await runActionForActor(t.db, PARTNER, run.id, "stop", undefined)).status).toBe("STOPPED");
    expect(await codeOf(runActionForActor(t.db, SUPER, run.id, "budget", { budget_cap_eur: 6 }))).toBe("INVALID_TRANSITION");
  });
});

describe("tenant isolation", () => {
  it("another account's run does not exist for you; superadmin sees everything", async () => {
    const run = await newRun(t.db);
    expect(await codeOf(repo.getRun(t.db, OTHER, run.id))).toBe("NOT_FOUND");
    expect(await codeOf(repo.runAction(t.db, OTHER, run.id, "stop"))).toBe("NOT_FOUND");
    expect(await codeOf(repo.setBudget(t.db, OTHER, run.id, 50))).toBe("NOT_FOUND");
    expect(await codeOf(repo.listProspects(t.db, OTHER, run.id))).toBe("NOT_FOUND");
    expect(await codeOf(repo.listEvents(t.db, OTHER, run.id))).toBe("NOT_FOUND");
    expect((await repo.listRuns(t.db, OTHER)).some((r) => r.id === run.id)).toBe(false);
    expect((await repo.listRuns(t.db, OWNER)).some((r) => r.id === run.id)).toBe(true);
    expect((await repo.getRun(t.db, SUPER, run.id)).id).toBe(run.id);
    expect((await repo.listRuns(t.db, SUPER, 200)).some((r) => r.id === run.id)).toBe(true);
    expect((await repo.getRun(t.db, OWNER, run.id)).status).toBe("QUEUED"); // untouched by OTHER's attempts
  });

  it("maps errors to HTTP without leaking database details", () => {
    expect(httpErrorFor(new OutreachError("NOT_FOUND", "x"))).toEqual({ status: 404, error: "Not found" });
    expect(httpErrorFor(new OutreachError("INVALID_TRANSITION", "COMPLETED -> pause")).status).toBe(409);
    expect(httpErrorFor(new OutreachError("DB", "relation outreach_runs secret detail"))).toEqual({ status: 500, error: "Internal error" });
    expect(httpErrorFor(new Error("boom"))).toEqual({ status: 500, error: "Internal error" });
  });
});

describe("database security: browser roles have no access", () => {
  it("anon and authenticated cannot read/write any outreach table or execute any outreach function; service_role can", async () => {
    const tables = await t.sql<{ t: string }>("select tablename as t from pg_tables where tablename like 'outreach\\_%'");
    expect(tables.length).toBe(11);
    for (const { t: name } of tables) {
      for (const role of ["anon", "authenticated"]) {
        const [p] = await t.sql<{ s: boolean; i: boolean; u: boolean; d: boolean }>(
          "select has_table_privilege($1, $2, 'select') s, has_table_privilege($1, $2, 'insert') i, has_table_privilege($1, $2, 'update') u, has_table_privilege($1, $2, 'delete') d",
          [role, name]);
        expect(p, `${role} on ${name}`).toEqual({ s: false, i: false, u: false, d: false });
      }
      const [rls] = await t.sql<{ r: boolean }>("select relrowsecurity r from pg_class where relname = $1", [name]);
      expect(rls!.r, `RLS on ${name}`).toBe(true);
      const [svc] = await t.sql<{ s: boolean }>("select has_table_privilege('service_role', $1, 'select') s", [name]);
      expect(svc!.s).toBe(true);
    }
    const fns = await t.sql<{ oid: number; name: string }>("select p.oid::int as oid, p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'outreach\\_%'");
    expect(fns.length).toBeGreaterThan(25);
    for (const f of fns) {
      const [p] = await t.sql<{ a: boolean; u: boolean; s: boolean }>(
        "select has_function_privilege('anon', $1::oid, 'execute') a, has_function_privilege('authenticated', $1::oid, 'execute') u, has_function_privilege('service_role', $1::oid, 'execute') s", [f.oid]);
      expect(p, f.name).toEqual({ a: false, u: false, s: true });
    }
  });

  it("an anon session really is refused", async () => {
    await expect(t.pg.transaction(async (tx) => { await tx.exec("set local role anon"); await tx.query("select * from outreach_runs"); })).rejects.toThrow(/permission denied/);
    await expect(t.pg.transaction(async (tx) => { await tx.exec("set local role anon"); await tx.query("select outreach_pending_work()"); })).rejects.toThrow(/permission denied/);
  });
});
