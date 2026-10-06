import { describe, expect, it, vi } from "vitest";
import { companyKey, contactKey, normalizeSuppressionValue } from "../../../src/lib/outreach/orchestration/normalize.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import { createTestDb, drain, fixtureContext, newRun, OTHER, OWNER, PARTNER, prospectsOf, SUPER } from "./helpers.js";

// Real Postgres (PGlite) work: generous timeouts so parallel test files under CPU load do not time out.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const add = (t: Awaited<ReturnType<typeof createTestDb>>, actor: typeof OWNER, kind: string, value: string, reason: string, global = false, owner: string | null = null) =>
  repo.addSuppression(t.db, actor, { global, owner, kind, value: normalizeSuppressionValue(kind as never, value) ?? value, reason });

describe("suppression contracts", () => {
  it("normalizes values the same way as dedupe", () => {
    expect(normalizeSuppressionValue("EMAIL", "  Jan@Example.NL ")).toBe("jan@example.nl");
    expect(normalizeSuppressionValue("DOMAIN", "https://www.Tandarts-Vos.example/contact")).toBe("tandarts-vos.example");
    expect(normalizeSuppressionValue("COMPANY", "Tandartspraktijk De Wit B.V.")).toBe(companyKey("Tandartspraktijk De Wit"));
    expect(normalizeSuppressionValue("CONTACT", "Pieter de Wit@www.x.nl")).toBe(contactKey("Pieter de Wit", "x.nl"));
    expect(normalizeSuppressionValue("EMAIL", "not-an-email")).toBeNull();
  });

  it("unsubscribe/bounce are always global; tenants scope their own; global DNC needs a superadmin; idempotent", async () => {
    const t = await createTestDb();
    const u = await add(t, PARTNER, "EMAIL", "a@b.nl", "unsubscribe");
    expect(u.suppression.owner_user_id).toBeNull();
    const m = await add(t, PARTNER, "DOMAIN", "b.nl", "manual_exclusion");
    expect(m.suppression.owner_user_id).toBe(PARTNER.userId);
    await expect(add(t, PARTNER, "DOMAIN", "c.nl", "do_not_contact", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(add(t, PARTNER, "DOMAIN", "c.nl", "customer", false, OWNER.userId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await add(t, SUPER, "DOMAIN", "c.nl", "do_not_contact", true)).suppression.owner_user_id).toBeNull();
    expect((await add(t, PARTNER, "EMAIL", "a@b.nl", "bounce")).created).toBe(false);
    await expect(add(t, OWNER, "PHONE", "123", "customer")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(add(t, OWNER, "EMAIL", "x@y.nl", "because")).rejects.toMatchObject({ code: "VALIDATION" });
    await t.close();
  });
});

describe("suppression in the pipeline", () => {
  it("domain/company suppressions block BEFORE any spend; email suppression blocks a READY prospect at completion; other tenants' suppressions do not apply", async () => {
    const t = await createTestDb();
    await add(t, OWNER, "DOMAIN", "tandarts-vos.example", "customer");
    await add(t, OWNER, "COMPANY", "Tandartsen Centrum", "manual_exclusion");
    await add(t, OTHER, "DOMAIN", "kliniek-noord.example", "do_not_contact"); // OTHER's own scope only
    await add(t, PARTNER, "EMAIL", "pieter@tandartspraktijk-dewit.example", "unsubscribe"); // global

    const run = await newRun(t.db);
    await drain(fixtureContext(t.db), t);
    const rows = await prospectsOf(t, run.id);
    const by = (d: string) => rows.find((r) => r.domain === d)!;

    expect(by("tandarts-vos.example")).toMatchObject({ outcome: "BLOCKED", queue_state: "DONE", outcome_reasons: ["SUPPRESSED_DOMAIN:customer"] });
    expect(Number(by("tandarts-vos.example").spent_eur)).toBe(0);
    expect(by("tandartsen-centrum.example").outcome).toBe("BLOCKED");
    const ledger = await t.sql("select 1 from outreach_provider_calls where prospect_id = any($1::uuid[])", [[by("tandarts-vos.example").id, by("tandartsen-centrum.example").id]]);
    expect(ledger).toHaveLength(0);

    const dewit = by("tandartspraktijk-dewit.example");
    expect(dewit.outcome).toBe("BLOCKED");
    expect(dewit.outcome_reasons).toEqual(["SUPPRESSED_EMAIL:unsubscribe", "PIPELINE_STATUS:READY"]);
    expect(by("kliniek-noord.example").outcome).not.toBe("BLOCKED");
    await t.close();
  });

  it("expired suppressions no longer apply", async () => {
    const t = await createTestDb();
    await repo.addSuppression(t.db, OWNER, { global: false, owner: null, kind: "DOMAIN", value: "tandarts-vos.example", reason: "customer", expiresAt: new Date(Date.now() - 1000).toISOString() });
    const run = await newRun(t.db);
    await drain(fixtureContext(t.db), t);
    expect((await prospectsOf(t, run.id)).find((r) => r.domain === "tandarts-vos.example")!.outcome).not.toBe("BLOCKED");
    await t.close();
  });
});

describe("global dedupe", () => {
  it("companies already READY/NEEDS_REVIEW in any run (any tenant) are BLOCKED in a later run before spend; others are processed", async () => {
    const t = await createTestDb();
    const a = await newRun(t.db);
    await drain(fixtureContext(t.db), t);
    const first = await prospectsOf(t, a.id);
    const contacted = first.filter((r) => r.outcome === "READY" || r.outcome === "NEEDS_REVIEW").map((r) => r.domain);
    expect(contacted.length).toBeGreaterThan(0);

    const b = await newRun(t.db, { actor: OTHER });
    await drain(fixtureContext(t.db), t);
    const second = await prospectsOf(t, b.id);
    for (const r of second) {
      if (contacted.includes(r.domain)) {
        expect(r.outcome, r.domain).toBe("BLOCKED");
        expect(r.outcome_reasons).toEqual(["DUPLICATE_COMPANY"]);
        expect(Number(r.spent_eur)).toBe(0);
      } else {
        // Not contacted before → researched again (spend > 0). It may still be blocked as a duplicate CONTACT
        // (same recipient as an earlier READY prospect), but never as a duplicate company.
        expect(r.outcome_reasons, r.domain).not.toContain("DUPLICATE_COMPANY");
        if (r.outcome === "BLOCKED") expect(r.outcome_reasons[0]).toBe("DUPLICATE_CONTACT");
        if (first.find((f) => f.domain === r.domain)?.record) expect(r.record).not.toBeNull();
      }
    }
    await t.close();
  });

  it("a company still being processed in another active run is not researched twice in parallel", async () => {
    const t = await createTestDb();
    const a = await newRun(t.db);
    const c = await repo.claimWork(t.db, { workerId: "s", maxProspects: 0, leaseSeconds: 900, reservationEur: 1, minReservationEur: 0.05 });
    const { runSetupJob } = await import("../../../src/lib/outreach/orchestration/jobs.js");
    await runSetupJob(fixtureContext(t.db), c.setups[0]!);
    await repo.runAction(t.db, OWNER, a.id, "pause"); // A is set up, prospects pending
    const b = await newRun(t.db);
    await drain(fixtureContext(t.db), t);
    const rows = await prospectsOf(t, b.id);
    expect(rows.every((r) => r.outcome === "BLOCKED" && r.outcome_reasons.includes("DUPLICATE_COMPANY"))).toBe(true);
    await t.close();
  });

  it("pre-send contract: check_contactability reports duplicates and suppressions", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db);
    await drain(fixtureContext(t.db), t);
    const ready = (await prospectsOf(t, run.id)).find((r) => r.outcome === "READY")!;
    const check = (email: string | null, domain: string | null, exclude: string | null = null) =>
      repo.checkContactability(t.db, { owner: OWNER.userId, email, domain, companyKey: null, contactKey: null, excludeProspectId: exclude });
    expect(await check(ready.email, null)).toEqual({ blocked: true, reasons: ["DUPLICATE_CONTACT"] });
    expect(await check(ready.email, ready.domain, ready.id)).toEqual({ blocked: false, reasons: [] });
    expect(await check("someone@new-company.example", "new-company.example")).toEqual({ blocked: false, reasons: [] });
    await add(t, SUPER, "DOMAIN", "new-company.example", "do_not_contact", true);
    expect(await check("someone@new-company.example", null)).toEqual({ blocked: true, reasons: ["SUPPRESSED_DOMAIN:do_not_contact"] });
    await t.close();
  });
});

describe("review decisions (Stage 3 contract)", () => {
  it("records decisions on READY/NEEDS_REVIEW prospects only, tenant-scoped", async () => {
    const t = await createTestDb();
    const run = await newRun(t.db);
    await drain(fixtureContext(t.db), t);
    const rows = await prospectsOf(t, run.id);
    const ready = rows.find((r) => r.outcome === "READY")!;
    const skipped = rows.find((r) => r.outcome === "SKIPPED" || r.outcome === "CONTACT_NOT_FOUND")!;
    expect((await repo.recordReviewDecision(t.db, OWNER, ready.id, "APPROVE", null, "looks good")).decision).toBe("APPROVE");
    await expect(repo.recordReviewDecision(t.db, OWNER, skipped.id, "APPROVE")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(repo.recordReviewDecision(t.db, OTHER, ready.id, "REJECT")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.recordReviewDecision(t.db, OWNER, ready.id, "MAYBE" as never)).rejects.toMatchObject({ code: "VALIDATION" });
    const [d] = await t.sql<{ n: number }>("select count(*)::int n from outreach_review_decisions where prospect_id = $1", [ready.id]);
    expect(d!.n).toBe(1);
    await t.close();
  });
});
