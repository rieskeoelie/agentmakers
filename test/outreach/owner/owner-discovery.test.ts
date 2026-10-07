/**
 * Owner Discovery ("Eigenaar vinden"): research-only run type. Zero network: fake discovery, website and Hunter.
 * Covers the owner-first pipeline, the bounded autonomous plan, the run/API contract, the database (send gate,
 * identity review, funnel, tenant isolation) and the end-to-end worker flow.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OwnerDiscoveryInputSchema, autoOwnerRunName, isOwnerDiscoveryCampaign } from "../../../src/lib/outreach/owner/config.js";
import { buildDiscoveryPlan } from "../../../src/lib/outreach/owner/plan.js";
import { companiesFromList, discoverOwnerCompanies } from "../../../src/lib/outreach/owner/discovery.js";
import { identityConfidence, processOwnerProspect } from "../../../src/lib/outreach/owner/pipeline.js";
import { EnvSchema } from "../../../src/lib/outreach/config.js";
import { CostTracker } from "../../../src/lib/outreach/cost.js";
import { createRunWithMode, prospectDetailForActor, reviewActionForActor, searchProspectsForActor } from "../../../src/lib/outreach/orchestration/adminService.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import type { WorkerContext } from "../../../src/lib/outreach/orchestration/jobs.js";
import { DEFAULT_WORKER_SETTINGS } from "../../../src/lib/outreach/orchestration/settings.js";
import { validateOwnerRun, EMPTY_OWNER_RUN, parseCompanyLines } from "../../../src/lib/outreach/ui/newRun.js";
import { ownerFunnelSteps, runTargetLabel } from "../../../src/lib/outreach/ui/runs.js";
import { ownerRowStatus } from "../../../src/lib/outreach/ui/owner.js";
import { FixtureLLM } from "../fixtures.js";
import { drain, OTHER, OWNER, SUPER, type TestDb } from "../stage2/helpers.js";
import { createStage4Db } from "../stage4/helpers.js";
import { company, hc, memorySite, pipelineDeps, SCENARIO, stubDiscovery, stubHunter } from "./fakes.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const EMPTY = OwnerDiscoveryInputSchema.parse({ run_type: "OWNER_DISCOVERY" });
const byDomain = (d: string) => SCENARIO.companies.find((c) => c.domain === d)!;
const env = EnvSchema.parse({ PROOF_MAX_API_BUDGET_EUR: "10" });
const OCT7 = new Date(2026, 9, 7, 12);

/* ───────────────────────────── input / naming ───────────────────────────── */
describe("empty autonomous owner run input", () => {
  it("is valid with only the run type: no niche, city, company or landing page required", () => {
    expect(EMPTY).toMatchObject({ run_type: "OWNER_DISCOVERY", discovery_mode: "AUTONOMOUS", country: "Netherlands", target_person: "OWNER", limit: 25, max_api_budget_eur: 5, sending: "NEVER" });
    expect(EMPTY.region).toBeUndefined();
    expect(EMPTY.industry).toBeUndefined();
    expect(isOwnerDiscoveryCampaign(EMPTY)).toBe(true);
    expect(isOwnerDiscoveryCampaign({ niche: "tandarts" })).toBe(false);
  });
  it("blank strings count as empty, Dutch country names are normalised, bounds are enforced", () => {
    const v = OwnerDiscoveryInputSchema.parse({ run_type: "OWNER_DISCOVERY", country: " Nederland ", region: "  ", industry: "" });
    expect(v).toMatchObject({ country: "Netherlands", region: undefined, industry: undefined });
    expect(OwnerDiscoveryInputSchema.safeParse({ run_type: "OWNER_DISCOVERY", limit: 51 }).success).toBe(false);
    expect(OwnerDiscoveryInputSchema.safeParse({ run_type: "OWNER_DISCOVERY", max_api_budget_eur: 51 }).success).toBe(false);
    expect(OwnerDiscoveryInputSchema.safeParse({ run_type: "OWNER_DISCOVERY", discovery_mode: "COMPANY_LIST" }).success).toBe(false);
    expect(OwnerDiscoveryInputSchema.safeParse({ run_type: "OWNER_DISCOVERY", sending: "ALWAYS" }).success).toBe(false);
  });
  it("auto run name", () => {
    expect(autoOwnerRunName(EMPTY, OCT7)).toBe("Eigenaarsonderzoek — Nederland — 7 okt");
    expect(autoOwnerRunName({ ...EMPTY, industry: "hovenier", region: "Hoorn" }, OCT7)).toBe("Eigenaarsonderzoek — hovenier Hoorn — 7 okt");
  });
  it("client validation: an untouched form is valid and never asks for niche / landing page / city", () => {
    const r = validateOwnerRun(EMPTY_OWNER_RUN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.name).toBeUndefined();
    expect(r.body.sending_mode).toBe("REVIEW_BEFORE_SENDING");
    expect(r.body.campaign).toEqual({ run_type: "OWNER_DISCOVERY", discovery_mode: "AUTONOMOUS", country: "Netherlands", target_person: "OWNER", limit: 25, max_api_budget_eur: 5, language: "nl", companies: [] });
    expect(JSON.stringify(r.body)).not.toMatch(/niche|agentmakers_url/);
    const bad = validateOwnerRun({ ...EMPTY_OWNER_RUN, limit: "80", budget: "0" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["budget", "limit"]);
  });
  it("company list mode parses 'website' and 'Naam, website' lines", () => {
    expect(parseCompanyLines("schilderjansen.nl\nBouwbedrijf De Boer, https://bouwdeboer.nl\n\nnot a site")).toEqual({
      companies: [{ website: "schilderjansen.nl" }, { name: "Bouwbedrijf De Boer", website: "https://bouwdeboer.nl" }], invalid: [4],
    });
    const r = validateOwnerRun({ ...EMPTY_OWNER_RUN, discoveryMode: "COMPANY_LIST", companies: "" });
    expect(r.ok).toBe(false);
  });
});

/* ───────────────────────────── bounded discovery ───────────────────────────── */
describe("bounded autonomous discovery plan", () => {
  it("empty input → AgentMakers builds categories × towns; never an empty query; bounded iterations", () => {
    const plan = buildDiscoveryPlan(EMPTY, OCT7);
    expect(plan.generated).toBe(true);
    expect(plan.queries.length).toBeGreaterThanOrEqual(2);
    expect(plan.queries.length).toBeLessThanOrEqual(8);
    expect(plan.limits).toMatchObject({ target_companies: 25, candidate_target: 40, max_budget_eur: 5 });
    expect(plan.limits.max_iterations).toBe(plan.queries.length);
    for (const q of plan.queries) { expect(q.category.trim().length).toBeGreaterThan(2); expect(q.region?.trim().length).toBeGreaterThan(2); }
    expect(buildDiscoveryPlan(EMPTY, OCT7)).toEqual(plan); // deterministic for a given day (replayable)
  });
  it("only industry / only region / both are respected", () => {
    expect(buildDiscoveryPlan({ ...EMPTY, industry: "hovenier" }, OCT7).queries.every((q) => q.category === "hovenier" && q.region)).toBe(true);
    expect(buildDiscoveryPlan({ ...EMPTY, region: "Zwolle" }, OCT7).queries.every((q) => q.region === "Zwolle" && q.category)).toBe(true);
    expect(buildDiscoveryPlan({ ...EMPTY, industry: "hovenier", region: "Zwolle" }, OCT7).queries).toEqual([{ category: "hovenier", region: "Zwolle", reason: "opgegeven branche + plaats" }]);
  });
  it("stops at the result target, filters directories/no-website, rejects chains, ranks by ownership likelihood", async () => {
    const input = { ...EMPTY, limit: 3 };
    const plan = buildDiscoveryPlan(input, OCT7);
    const extra = [company({ company_name: "Zonder Site", domain: null }), company({ company_name: "Gids", domain: "facebook.com" })];
    const d = stubDiscovery(() => [...SCENARIO.companies, ...extra]);
    const res = await discoverOwnerCompanies(input, plan, d.p);
    expect(d.queries.length).toBe(1);
    expect(res.summary.stop_reason).toBe("RESULT_TARGET");
    expect(res.selected.length).toBe(3);
    expect(res.selected.some((c) => c.domain === "knipketen.nl")).toBe(false);
    const reasons = res.summary.rejected.map((r) => r.reason);
    expect(reasons).toEqual(expect.arrayContaining(["NO_WEBSITE", "DIRECTORY_OR_SOCIAL_DOMAIN", "LIKELY_CHAIN_OR_FRANCHISE"]));
    // Garage Smit (domain does not match its name) ranks below companies whose domain carries their name.
    expect(res.selected.map((c) => c.domain)).not.toContain("autoservicepunt.nl");
  });
  it("stops when a round brings too few new companies, and on budget", async () => {
    const plan = buildDiscoveryPlan({ ...EMPTY, limit: 25 }, OCT7);
    let n = 0;
    const same = stubDiscovery(() => (n++ === 0 ? SCENARIO.companies.slice(0, 3) : SCENARIO.companies.slice(0, 3)));
    const r1 = await discoverOwnerCompanies({ ...EMPTY, limit: 25 }, plan, same.p);
    expect(r1.summary.stop_reason).toBe("NO_NEW_COMPANIES");
    expect(same.queries.length).toBe(2);
    const broke = stubDiscovery(() => "BUDGET");
    const r2 = await discoverOwnerCompanies({ ...EMPTY, limit: 25 }, plan, broke.p);
    expect(r2.summary.stop_reason).toBe("BUDGET");
    expect(broke.queries.length).toBe(1);
  });
  it("never exceeds max iterations", async () => {
    const plan = buildDiscoveryPlan({ ...EMPTY, limit: 50 }, OCT7);
    let i = 0;
    const d = stubDiscovery(() => [0, 1, 2].map((k) => company({ company_name: `Bedrijf ${i}${k}`, domain: `bedrijf${i++}x${k}.nl` })));
    const r = await discoverOwnerCompanies({ ...EMPTY, limit: 50 }, plan, d.p);
    expect(d.queries.length).toBeLessThanOrEqual(plan.limits.max_iterations);
    expect(["MAX_ITERATIONS", "PLAN_EXHAUSTED"]).toContain(r.summary.stop_reason);
  });
  it("company list mode uses the user's websites without any provider call", () => {
    const r = companiesFromList(OwnerDiscoveryInputSchema.parse({ run_type: "OWNER_DISCOVERY", discovery_mode: "COMPANY_LIST", companies: [{ website: "schilderjansen.nl" }, { name: "Dubbel", website: "https://www.schilderjansen.nl/x" }, { website: "linkedin.com" }] }));
    expect(r.selected.map((c) => c.domain)).toEqual(["schilderjansen.nl"]);
    expect(r.summary.stop_reason).toBe("COMPANY_LIST");
  });
});

/* ───────────────────────────── owner-first pipeline ───────────────────────────── */
describe("owner evidence → status", () => {
  const run = (domain: string, o: Parameters<typeof pipelineDeps>[0] = {}, input = EMPTY) => {
    const d = pipelineDeps(o);
    return processOwnerProspect(byDomain(domain), 1, input, d.deps).then((rec) => ({ rec, od: rec.owner_discovery!, ...d }));
  };

  it("verified owner on the company website + verified personal email → READY", async () => {
    const { rec, od } = await run("schilderjansen.nl");
    expect(rec.status).toBe("READY");
    expect(od).toMatchObject({ status: "READY", confidence: "VERIFIED", company_identity: { state: "VERIFIED" }, email: { state: "VERIFIED", verification: "valid" } });
    expect(od.person).toMatchObject({ name: "Jan Jansen", role_class: "OWNER", source: "WEBSITE", source_url: "https://schilderjansen.nl/over-ons" });
    expect(rec.contact?.email).toBe("jan@schilderjansen.nl");
    expect(rec.stages.brief.status).toBe("skipped");
    expect(rec.email).toBeNull();
  });

  it("a director is never called owner: owner target → review DIRECTOR_NOT_OWNER", async () => {
    const { rec, od } = await run("bouwdeboer.nl");
    expect(od.person).toMatchObject({ name: "Piet de Boer", role_class: "DIRECTOR", title: "Directeur" });
    expect(rec.status).toBe("NEEDS_REVIEW");
    expect(rec.status_reasons).toContain("DIRECTOR_NOT_OWNER");
    // Decision-maker target: a verified director with a verified email may be READY — still labelled director.
    const dm = await run("bouwdeboer.nl", {}, { ...EMPTY, target_person: "DECISION_MAKER" });
    expect(dm.rec.status).toBe("READY");
    expect(dm.od.person?.role_class).toBe("DIRECTOR");
  });

  it("owner found without email is shown as OWNER_FOUND_NO_EMAIL (not CONTACT_NOT_FOUND)", async () => {
    const { rec, od } = await run("hovenierbakker.nl");
    expect(rec.status).toBe("DECISION_MAKER_EMAIL_NOT_FOUND");
    expect(rec.status_reasons[0]).toBe("OWNER_FOUND_NO_EMAIL");
    expect(rec.status_reasons).toContain("PROSPEO_NOT_CONFIGURED");
    expect(od).toMatchObject({ status: "OWNER_FOUND_NO_EMAIL", confidence: "VERIFIED", email: { state: "NOT_FOUND" }, person: { name: "Kees Bakker", role_class: "OWNER" } });
  });

  it("a generic mailbox is never the recipient and never READY", async () => {
    const { rec, od } = await run("installatievos.nl");
    expect(rec.status).not.toBe("READY");
    expect(rec.status).toBe("CONTACT_NOT_FOUND");
    expect(rec.status_reasons[0]).toBe("NO_OWNER_FOUND");
    expect(rec.contact?.email ?? null).toBeNull();
    expect(od.email.generic_company_emails).toContain("info@installatievos.nl");
    // Even with an owner on the site, a generic Hunter address never becomes the recipient.
    const g = await run("hovenierbakker.nl", { hunter: { "hovenierbakker.nl": [hc("info@hovenierbakker.nl", { type: "generic" })] } });
    expect(g.rec.status).toBe("DECISION_MAKER_EMAIL_NOT_FOUND");
    expect(g.rec.contact?.email ?? null).toBeNull();
  });

  it("an owner from a non-authoritative source (Hunter position only) is MEDIUM → review", async () => {
    const { rec, od } = await run("loodgieterhendriks.nl");
    expect(od.confidence).toBe("REVIEW");
    expect(rec.status).toBe("NEEDS_REVIEW");
    expect(rec.status_reasons).toEqual(["OWNER_EVIDENCE_REVIEW"]);
  });

  it("first name only: no surname is invented and it is never READY", async () => {
    const site = { "hovenierbakker.nl/": SCENARIO.site["hovenierbakker.nl/"]!, "hovenierbakker.nl/over-ons": "<html><body><div><h3>Kees</h3><p>Eigenaar</p></div></body></html>" };
    const { rec, od } = await run("hovenierbakker.nl", { site });
    expect(od.confidence).toBe("PARTIAL");
    expect(od.person).toMatchObject({ first_name: "Kees", last_name: null });
    expect(rec.status).toBe("NEEDS_REVIEW");
    expect(rec.status_reasons).toEqual(["PARTIAL_NAME_MATCH_REVIEW"]);
  });

  it("vague title / seniority only → insufficient evidence (rejected)", () => {
    const c = { name: "A B", first_name: "A", last_name: "B", source: "hunter_metadata", identification: "full_name", role_match: null } as never;
    expect(identityConfidence(c, true).confidence).toBe("INSUFFICIENT");
  });

  it("company identity not confirmed → COMPANY_AMBIGUOUS without any paid call", async () => {
    const { rec, od, hunter } = await run("autoservicepunt.nl");
    expect(rec.status).toBe("SKIPPED");
    expect(rec.status_reasons[0]).toBe("COMPANY_AMBIGUOUS");
    expect(od.company_identity.state).toBe("AMBIGUOUS");
    expect(hunter.calls).toEqual([]);
  });

  it("registry not configured is reported truthfully (never as verified)", async () => {
    for (const d of ["schilderjansen.nl", "hovenierbakker.nl", "loodgieterhendriks.nl"]) {
      const { od } = await run(d);
      expect(od.providers.registry).toBe("NOT_CONFIGURED");
      expect(od.person?.source).not.toBe("REGISTRY");
    }
  });

  it("email search happens only after a person is identified", async () => {
    const h = stubHunter({}, () => ({ email: "x@installatievos.nl", score: 90, verification_status: "valid", position: null, linkedin: null } as never));
    const site = memorySite(SCENARIO.site);
    const deps = { hunter: h.h, websiteFetcher: site.fetcher, cost: new CostTracker("t", 5), settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 1 } } as never;
    const rec = await processOwnerProspect(byDomain("installatievos.nl"), 1, EMPTY, deps);
    expect(h.calls.filter((c) => c.startsWith("ef:"))).toEqual([]);
    expect(rec.owner_discovery?.email.state).toBe("NOT_SEARCHED");
  });
});

/* ───────────────────────────── database + worker end-to-end ───────────────────────────── */
describe("Owner Discovery run end-to-end (PGlite, worker, zero network)", () => {
  let t: TestDb;
  let runId: string;
  const discovery = stubDiscovery(() => SCENARIO.companies);
  const hunter = stubHunter(SCENARIO.hunter);
  const site = memorySite(SCENARIO.site);
  const ctx = (db: TestDb["db"]): WorkerContext => ({
    db, workerId: "owner-test", settings: { ...DEFAULT_WORKER_SETTINGS, claimCutoffMs: 1_500, idlePollMs: 5, maxParallel: 3 },
    makeDeps: (cost) => ({
      deps: { discovery: discovery.p, hunter: hunter.h, llm: new FixtureLLM(), websiteFetcher: site.fetcher, cost, settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 3 } },
      brainFetcher: site.fetcher,
    }),
  });
  const rows = () => t.sql<{ id: string; domain: string; outcome: string | null; outcome_reasons: string[]; email: string | null; record: { owner_discovery?: { person?: { role_class?: string } } } | null }>(
    "select id, domain, outcome, outcome_reasons, email, record from outreach_prospects where run_id = $1 order by position", [runId]);

  beforeAll(async () => {
    t = await createStage4Db();
    // Empty owner run: no name, no niche, no landing page, AUTOPILOT requested → forced to review mode.
    const res = await createRunWithMode(t.db, OWNER, { start: true, sending_mode: "AUTOPILOT", campaign: { run_type: "OWNER_DISCOVERY" } }, env);
    runId = res.run.id;
    await drain(ctx(t.db), t);
  });
  afterAll(async () => { await t.close(); });

  it("creates a bounded, review-only run with an auto name", async () => {
    const run = await repo.getRun(t.db, OWNER, runId) as unknown as { name: string; prospect_limit: number; sending_mode: string; campaign: { run_type: string }; status: string; budget_cap_eur: number };
    expect(run.name).toMatch(/^Eigenaarsonderzoek — Nederland — \d{1,2} [a-z]{3}$/);
    expect(run.prospect_limit).toBe(25);
    expect(Number(run.budget_cap_eur)).toBe(5);
    expect(run.sending_mode).toBe("REVIEW_BEFORE_SENDING");
    expect(run.campaign.run_type).toBe("OWNER_DISCOVERY");
    expect(run.status).toBe("COMPLETED");
  });

  it("stores the generated plan and stop reason in the audit trail; no provider call had an empty query", async () => {
    const run = await repo.getRun(t.db, OWNER, runId);
    const s = run.discovery_summary as { run_type: string; plan: { generated: boolean; queries: unknown[] }; iterations: unknown[]; stop_reason: string; selected: number };
    expect(s.run_type).toBe("OWNER_DISCOVERY");
    expect(s.plan.generated).toBe(true);
    expect(s.iterations.length).toBeGreaterThanOrEqual(1);
    expect(s.stop_reason).toBeTruthy();
    expect(s.selected).toBe(6); // 8 listings − chain (2 names, 1 site)
    expect(discovery.queries.every((q) => q.niche.trim() && q.region?.trim())).toBe(true);
  });

  it("produces every owner status", async () => {
    const r = Object.fromEntries((await rows()).map((x) => [x.domain, x]));
    expect(r["schilderjansen.nl"]!.outcome).toBe("READY");
    expect(r["bouwdeboer.nl"]!.outcome).toBe("NEEDS_REVIEW");
    expect(r["hovenierbakker.nl"]!.outcome_reasons[0]).toBe("OWNER_FOUND_NO_EMAIL");
    expect(r["installatievos.nl"]!.outcome).toBe("CONTACT_NOT_FOUND");
    expect(r["loodgieterhendriks.nl"]!.outcome_reasons).toEqual(["OWNER_EVIDENCE_REVIEW"]);
    expect(r["autoservicepunt.nl"]!.outcome_reasons[0]).toBe("COMPANY_AMBIGUOUS");
    expect(r["knipketen.nl"]).toBeUndefined();
  });

  it("owner funnel counts (no GOOD_FIT)", async () => {
    const f = (await repo.getRun(t.db, OWNER, runId) as unknown as { funnel?: unknown }).funnel
      ?? (await t.db.rpc<Record<string, number>>("outreach_run_funnel", { p_run_id: runId }));
    const funnel = f as Record<string, number>;
    expect(funnel).toMatchObject({ selected: 6, owner_identity_verified: 5, owner_researched: 5, owner_person_found: 4, owner_confirmed: 2, owner_business_emails: 3, owner_found_no_email: 1, ready: 1, needs_review: 2 });
    const steps = ownerFunnelSteps(funnel as never);
    expect(steps.map((s) => s.label)).toEqual(["Bedrijven gevonden", "Identiteit bevestigd", "Onderzocht", "Persoon gevonden", "Eigenaar/DGA bevestigd", "Zakelijke e-mail", "READY", "Review"]);
    expect(steps.some((s) => /GOOD_FIT/.test(s.label))).toBe(false);
  });

  it("results list carries the owner result; labels are human", async () => {
    const page = await searchProspectsForActor(t.db, OWNER, new URLSearchParams(`run_id=${runId}&limit=50`));
    const ready = page.items.find((p) => p.domain === "schilderjansen.nl")!;
    expect((ready as { owner?: { person?: { name?: string } } }).owner?.person?.name).toBe("Jan Jansen");
    expect(ownerRowStatus(page.items.find((p) => p.domain === "hovenierbakker.nl") as never)).toBe("OWNER_FOUND_NO_EMAIL");
    expect(runTargetLabel({ run_type: "OWNER_DISCOVERY", country: "Netherlands" })).toBe("Eigenaar vinden · branche automatisch · Nederland");
  });

  it("sending is never triggered: the send gate refuses every owner prospect, queueing is refused, no send rows exist", async () => {
    const r = await rows();
    const ready = r.find((x) => x.domain === "schilderjansen.nl")!;
    const gate = await t.db.rpc<string[]>("outreach_send_gate", { p_prospect_id: ready.id });
    expect(gate).toContain("OWNER_DISCOVERY_NOT_SENDABLE");
    const q = await t.db.rpc<{ ok: boolean; blockers?: string[] }>("outreach_queue_send", {
      p_prospect_id: ready.id, p_actor: OWNER.userId, p_is_superadmin: false, p_source: "manual",
      p_message: { subject: "x", body: "y", sequence: [{ subject: "x", body: "y" }], first_name: "Jan", last_name: "Jansen", language: "nl" },
    });
    expect(q.ok).toBe(false);
    expect(q.blockers).toContain("OWNER_DISCOVERY_NOT_SENDABLE");
    const auto = await t.db.rpc<string[]>("outreach_autopilot_candidates", { p_limit: 50 });
    expect(auto.filter((id) => r.some((x) => x.id === id))).toEqual([]);
    expect((await t.sql<{ n: number }>("select count(*)::int as n from outreach_sends"))[0]!.n).toBe(0);
  });

  it("review: OWNER_EVIDENCE_REVIEW is approvable (identity accepted), still never sendable", async () => {
    const r = await rows();
    const p = r.find((x) => x.domain === "loodgieterhendriks.nl")!;
    const detail = await prospectDetailForActor(t.db, OWNER, p.id) as { identity_review?: { reason: string; substantiated: boolean } };
    expect(detail.identity_review).toMatchObject({ reason: "OWNER_EVIDENCE_REVIEW", substantiated: true });
    const res = await reviewActionForActor(t.db, OWNER, p.id, { action: "APPROVE" });
    expect(res).toMatchObject({ ok: true, outcome: "READY", identity_accepted: true });
    expect(await t.db.rpc<string[]>("outreach_send_gate", { p_prospect_id: p.id })).toContain("OWNER_DISCOVERY_NOT_SENDABLE");
  });

  it("review: approving DIRECTOR_NOT_OWNER never relabels the director as owner", async () => {
    const r = await rows();
    const p = r.find((x) => x.domain === "bouwdeboer.nl")!;
    const res = await reviewActionForActor(t.db, OWNER, p.id, { action: "APPROVE" });
    expect(res.ok).toBe(true);
    const after = (await rows()).find((x) => x.domain === "bouwdeboer.nl")!;
    expect(after.record?.owner_discovery?.person?.role_class).toBe("DIRECTOR");
    expect(after.outcome_reasons).toContain("DIRECTOR_NOT_OWNER");
  });

  it("an unsubstantiated owner review stays a hard blocker", async () => {
    const r = await rows();
    const p = r.find((x) => x.domain === "hovenierbakker.nl")!;
    // Not a NEEDS_REVIEW prospect: review actions are refused outright.
    await expect(reviewActionForActor(t.db, OWNER, p.id, { action: "APPROVE" })).rejects.toThrow();
    await t.sql(`update outreach_prospects set outcome = 'NEEDS_REVIEW', outcome_reasons = '["OWNER_EVIDENCE_REVIEW"]'::jsonb,
         record = record #- '{owner_discovery,person}' where id = $1`, [p.id]);
    const verdict = await t.sql<{ v: { substantiated: boolean } | null }>("select outreach_identity_review($1::uuid) as v", [p.id]);
    expect(verdict[0]!.v?.substantiated).toBe(false);
    const res = await reviewActionForActor(t.db, OWNER, p.id, { action: "APPROVE" });
    expect(res.ok).toBe(false);
    expect(res.blockers).toContain("IDENTITY_REVIEW_NOT_SUBSTANTIATED");
  });

  it("tenant isolation: another account sees nothing; a superadmin sees everything", async () => {
    await expect(repo.getRun(t.db, OTHER, runId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const other = await searchProspectsForActor(t.db, OTHER, new URLSearchParams(`run_id=${runId}`));
    expect(other.total).toBe(0);
    const p = (await rows())[0]!;
    await expect(prospectDetailForActor(t.db, OTHER, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(reviewActionForActor(t.db, OTHER, p.id, { action: "REJECT" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await searchProspectsForActor(t.db, SUPER, new URLSearchParams(`run_id=${runId}`))).total).toBe(6);
  });

  it("owner runs allow up to 50 companies; audience runs keep the 20 cap in the database", async () => {
    const big = await createRunWithMode(t.db, OWNER, { campaign: { run_type: "OWNER_DISCOVERY", limit: 50 } }, env);
    expect(big.run.prospect_limit).toBe(50);
    await expect(createRunWithMode(t.db, OWNER, { campaign: { run_type: "OWNER_DISCOVERY", limit: 51 } }, env)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(repo.createRun(t.db, { owner: "x", actor: "x", name: "x", campaign: { niche: "x" } as never, prospectLimit: 21, budgetCapEur: 1, concurrency: 1, maxAttempts: 3, idempotencyKey: null }))
      .rejects.toMatchObject({ code: "VALIDATION" });
  });
});
