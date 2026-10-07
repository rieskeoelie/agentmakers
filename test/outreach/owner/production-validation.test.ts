/**
 * Regression tests for the defects proven by the live Owner Discovery validation run 05d0dd88 (fixture:
 * production-fixture.ts). Zero network.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OwnerDiscoveryInputSchema } from "../../../src/lib/outreach/owner/config.js";
import { buildDiscoveryPlan } from "../../../src/lib/outreach/owner/plan.js";
import { discoverOwnerCompanies } from "../../../src/lib/outreach/owner/discovery.js";
import { processOwnerProspect } from "../../../src/lib/outreach/owner/pipeline.js";
import { isOccupationalWord, nonPersonReason } from "../../../src/lib/outreach/personName.js";
import { extractFirstNameOwners, isFirstNameOnly, isPersonName } from "../../../src/lib/outreach/research.js";
import { parseHtml } from "../../../src/lib/outreach/html.js";
import { evaluateResult } from "../../../src/lib/outreach/publicSearch.js";
import { DEFAULT_ROLE_PRIORITY, EnvSchema } from "../../../src/lib/outreach/config.js";
import { isDirectoryDomain } from "../../../src/lib/outreach/domain.js";
import { CostTracker } from "../../../src/lib/outreach/cost.js";
import { createRunWithMode, prospectDetailForActor, reviewActionForActor } from "../../../src/lib/outreach/orchestration/adminService.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import type { WorkerContext } from "../../../src/lib/outreach/orchestration/jobs.js";
import { DEFAULT_WORKER_SETTINGS } from "../../../src/lib/outreach/orchestration/settings.js";
import { RUN_STATUS_META, rejectionLabel, runStatusHint } from "../../../src/lib/outreach/ui/runs.js";
import { FixtureLLM } from "../fixtures.js";
import { drain, OWNER, type TestDb } from "../stage2/helpers.js";
import { createStage4Db } from "../stage4/helpers.js";
import { memorySite, stubDiscovery, stubHunter } from "./fakes.js";
import { PROD, prodSearch } from "./production-fixture.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const INPUT = OwnerDiscoveryInputSchema.parse({ run_type: "OWNER_DISCOVERY", limit: 5, max_api_budget_eur: 1 });
const page = (url: string, html: string, kind: "about" | "home" = "about") => ({ url, kind, fetched_at: "t", parsed: parseHtml(html) });
const byDomain = (d: string) => PROD.listings.find((c) => c.domain === d)!;

function prodDeps() {
  const cost = new CostTracker("prod-fixture", 1);
  const hunter = stubHunter(PROD.hunter, PROD.finder);
  const search = prodSearch();
  const site = memorySite(PROD.site);
  const deps = { hunter: hunter.h, publicSearch: search.provider, websiteFetcher: site.fetcher, cost, settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 1 } } as never;
  return { deps, hunter, search };
}
const finderCalls = (calls: string[]) => calls.filter((c) => c.startsWith("ef:"));

/* ─── 1. person-name validation ─── */
describe("occupational words are never a person's name", () => {
  it("'Kapster' (live false positive) and other role words are rejected as a first name", () => {
    for (const w of ["Kapster", "Kapper", "Stylist", "Topstylist", "Monteur", "Automonteur", "Eigenaresse", "Eigenaar", "Directeur", "Bedrijfsleider", "Oprichter", "Ondernemer", "Garagehouder", "Praktijkhouder", "Zaakvoerder", "Dga"]) {
      expect(isOccupationalWord(w), w).toBe(true);
      expect(isFirstNameOnly(w), w).toBe(false);
    }
  });
  it("real (also unusual) names survive — occupational SURNAMES stay valid", () => {
    for (const n of ["Richard", "Aram", "Nathalie", "Ine", "Esther", "Hester", "Ester", "Sterre", "Jip", "Mees", "Maarten", "Kees"]) expect(isFirstNameOnly(n), n).toBe(true);
    for (const n of ["Aram Darwish", "Jan Bakker", "Piet Schilder", "Anna Visser", "Ine van Puffelen", "Kees de Kapper"]) expect(isPersonName(n), n).toBe(true);
    expect(isPersonName("Kapster Anja")).toBe(false);
  });
  it("the Es&co about page yields no person; the rejection is kept for audit", () => {
    const rejected: Parameters<typeof extractFirstNameOwners>[2] = [];
    const out = extractFirstNameOwners([page("https://kapsalonesenco.nl/over-ons/", PROD.site["kapsalonesenco.nl/over-ons/"]!)], (t) => /eigenar|eigenaresse/i.test(t), rejected);
    expect(out).toEqual([]);
    expect(rejected).toEqual([{ candidate: "Kapster", title: "Eigenaresse", source_url: "https://kapsalonesenco.nl/over-ons/", reason: "OCCUPATIONAL_TITLE_AS_NAME" }]);
    // A real first-name owner on the same kind of card is still found.
    const ok = extractFirstNameOwners([page("https://x.nl/over-ons/", "<html><body><div><h3>Richard</h3><p>Eigenaar</p></div></body></html>")], (t) => /eigenaar/i.test(t));
    expect(ok.map((p) => p.first_name)).toEqual(["Richard"]);
  });
});

/* ─── 2. page / section titles ─── */
describe("headings, publications and labels are never persons", () => {
  it("non-person reasons from result context", () => {
    expect(nonPersonReason("Campus Life", { url: "https://www.utoday.nl/campus-life/load/866" })).toBe("SECTION_HEADING");
    expect(nonPersonReason("U Today", { url: "https://www.utoday.nl/news/1" })).toBe("PUBLICATION_NAME");
    expect(nonPersonReason("Kapsalon Groep")).toBe("PAGE_OR_ORGANISATION_LABEL");
    expect(nonPersonReason("Campus Life")).toBe("PAGE_OR_ORGANISATION_LABEL");
    expect(nonPersonReason("Nathalie Nieveld", { url: "https://nl.linkedin.com/in/nathalie-nieveld-a22949105" })).toBeNull();
    expect(nonPersonReason("Jan Jansen", { url: "https://x.nl/team/jan-jansen" })).toBeNull(); // a profile page, not a section
  });
  it("the live 'Campus Life' result is rejected with an explicit reason (no candidate)", () => {
    const ev = evaluateResult(PROD.search["Barreboks"]![0]!, { name: "Kapsalon De Barreboks", domain: "kapsalondebarreboks.nl", city: "Enschede" }, DEFAULT_ROLE_PRIORITY);
    expect(ev.candidate).toBeNull();
    expect(ev).toMatchObject({ reason: "NOT_A_PERSON:SECTION_HEADING", name: "Campus Life" });
  });
  it("the live LinkedIn result for Nathalie Nieveld is still a candidate", () => {
    const ev = evaluateResult(PROD.search["Way 4 Hair"]![0]!, { name: "Way 4 Hair", domain: "way4hair.nl", city: "Enschede" }, DEFAULT_ROLE_PRIORITY);
    expect(ev.candidate).toMatchObject({ full_name: "Nathalie Nieveld", association: "company_name_in_title" });
  });
});

/* ─── 3–5. per-company results on the production fixture ─── */
describe("production fixture: per-company owner results", () => {
  const run = async (d: string) => { const x = prodDeps(); const rec = await processOwnerProspect(byDomain(d), 1, INPUT, x.deps); return { rec, od: rec.owner_discovery!, ...x }; };

  it("Aram Darwish (owner on own website + verified email) stays READY", async () => {
    const { rec, od } = await run("ruthlesskappers.nl");
    expect(rec.status).toBe("READY");
    expect(od.person).toMatchObject({ name: "Aram Darwish", role_class: "OWNER", source: "WEBSITE" });
    expect(od.email.state).toBe("VERIFIED");
  });

  it("'Campus Life' → no person, NO_OWNER_FOUND, and ZERO person-email lookups", async () => {
    const { rec, od, hunter } = await run("kapsalondebarreboks.nl");
    expect(od.person).toBeNull();
    expect(rec.status_reasons[0]).toBe("NO_OWNER_FOUND");
    expect(finderCalls(hunter.calls)).toEqual([]);
    expect(rec.contact?.public_search?.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Campus Life", reason: "NOT_A_PERSON:SECTION_HEADING" })]));
  });

  it("'Kapster' → no person, NO_OWNER_FOUND, rejection in audit, no email lookup", async () => {
    const { rec, od, hunter } = await run("kapsalonesenco.nl");
    expect(od.person).toBeNull();
    expect(rec.status_reasons[0]).toBe("NO_OWNER_FOUND");
    expect(rec.contact?.rejected_person_candidates).toEqual([expect.objectContaining({ candidate: "Kapster", reason: "OCCUPATIONAL_TITLE_AS_NAME" })]);
    expect(rec.contact?.notes.join(" ")).toContain('"Kapster"');
    expect(finderCalls(hunter.calls)).toEqual([]);
  });

  it("Way 4 Hair: public/LinkedIn evidence needs human confirmation → NEEDS_REVIEW even without email", async () => {
    const { rec, od } = await run("way4hair.nl");
    expect(od.confidence).toBe("REVIEW");
    expect(rec.status).toBe("NEEDS_REVIEW");
    expect(rec.status_reasons).toEqual(["OWNER_EVIDENCE_REVIEW"]);
    expect(od).toMatchObject({ status: "NEEDS_REVIEW", email: { state: "NOT_FOUND" }, person: { name: "Nathalie Nieveld", role_class: "OWNER", source: "PUBLIC_SEARCH" } });
  });

  it("Nanouck: no owner found", async () => {
    const { rec, od } = await run("nanouck.nl");
    expect(od.person).toBeNull();
    expect(rec.status_reasons[0]).toBe("NO_OWNER_FOUND");
  });
});

/* ─── 6. directory classification ─── */
describe("directory sites are 'gids/directory', not chain/franchise", () => {
  it("known and generic directory sites", async () => {
    expect(isDirectoryDomain("nlcompanies.org")).toBe(true);
    expect(isDirectoryDomain("www.ivof.com")).toBe(true);
    expect(isDirectoryDomain("bedrijvengids-enschede.nl")).toBe(true);
    expect(isDirectoryDomain("ruthlesskappers.nl")).toBe(false);
    const res = await discoverOwnerCompanies(INPUT, buildDiscoveryPlan(INPUT), stubDiscovery(() => PROD.listings).p);
    const why = Object.fromEntries(res.summary.rejected.map((r) => [r.domain ?? r.company_name, r.reason]));
    expect(why["nlcompanies.org"]).toBe("DIRECTORY_SITE");
    expect(why["ivof.com"]).toBe("DIRECTORY_SITE");
    expect(why["allesalonsoost.nl"]).toBe("DIRECTORY_SITE"); // unknown site shared by unrelated salons
    expect(res.summary.rejected.some((r) => r.reason === "LIKELY_CHAIN_OR_FRANCHISE")).toBe(false);
    expect(res.selected.map((c) => c.domain).sort()).toEqual(["kapsalondebarreboks.nl", "kapsalonesenco.nl", "nanouck.nl", "ruthlesskappers.nl", "way4hair.nl"]);
    expect(rejectionLabel("DIRECTORY_SITE")).toBe("gids/directory");
  });
});

/* ─── 7. header copy ─── */
describe("run header copy", () => {
  it("owner runs use owner-specific copy; target-market runs are unchanged", () => {
    expect(runStatusHint({ status: "RUNNING", campaign: { run_type: "OWNER_DISCOVERY" } })).toBe("Bedrijven worden onderzocht op eigenaar/DGA en zakelijke contactgegevens.");
    expect(runStatusHint({ status: "RUNNING", campaign: {} })).toBe(RUN_STATUS_META.RUNNING.hint);
    expect(RUN_STATUS_META.RUNNING.hint).toBe("Prospects worden onderzocht.");
  });
});

/* ─── 4/5 end-to-end: real funnel counts from the database ─── */
describe("production fixture end-to-end: counts represent real person candidates", () => {
  let t: TestDb;
  let runId: string;
  const hunter = stubHunter(PROD.hunter, PROD.finder);
  const ctx = (db: TestDb["db"]): WorkerContext => ({
    db, workerId: "prod-fixture", settings: { ...DEFAULT_WORKER_SETTINGS, claimCutoffMs: 1_500, idlePollMs: 5, maxParallel: 2 },
    makeDeps: (cost) => ({
      deps: { discovery: stubDiscovery(() => PROD.listings).p, hunter: hunter.h, publicSearch: prodSearch().provider, llm: new FixtureLLM(), websiteFetcher: memorySite(PROD.site).fetcher, cost, settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 2 } },
      brainFetcher: memorySite(PROD.site).fetcher,
    }),
  });
  const rows = () => t.sql<{ id: string; domain: string; outcome: string; outcome_reasons: string[] }>("select id, domain, outcome, outcome_reasons from outreach_prospects where run_id = $1", [runId]);

  beforeAll(async () => {
    t = await createStage4Db();
    const env = EnvSchema.parse({ PROOF_MAX_API_BUDGET_EUR: "10" });
    runId = (await createRunWithMode(t.db, OWNER, { start: true, campaign: { run_type: "OWNER_DISCOVERY", limit: 5, max_api_budget_eur: 1 } }, env)).run.id;
    await drain(ctx(t.db), t);
  });
  afterAll(async () => { await t.close(); });

  it("persons found 2 · verified owner/DGA 1 · owner found/no email 1 · READY 1 · review 1", async () => {
    const f = await t.db.rpc<Record<string, number>>("outreach_run_funnel", { p_run_id: runId });
    expect(f).toMatchObject({
      selected: 5, owner_identity_verified: 5, owner_researched: 5,
      owner_person_found: 2, owner_confirmed: 1, owner_business_emails: 1, owner_found_no_email: 1, ready: 1, needs_review: 1,
    });
    // Person-level email lookup only for the two real persons.
    expect(finderCalls(hunter.calls).sort()).toEqual(["ef:ruthlesskappers.nl:Aram|Darwish", "ef:way4hair.nl:Nathalie|Nieveld"]);
    const run = await repo.getRun(t.db, OWNER, runId);
    expect((run as unknown as { campaign: { run_type: string } }).campaign.run_type).toBe("OWNER_DISCOVERY");
  });

  it("Way 4 Hair identity review: substantiated; approval accepts the identity but never makes it READY", async () => {
    const w = (await rows()).find((r) => r.domain === "way4hair.nl")!;
    expect(w.outcome).toBe("NEEDS_REVIEW");
    const d = await prospectDetailForActor(t.db, OWNER, w.id) as { identity_review?: { reason: string; substantiated: boolean } };
    expect(d.identity_review).toMatchObject({ reason: "OWNER_EVIDENCE_REVIEW", substantiated: true });
    const res = await reviewActionForActor(t.db, OWNER, w.id, { action: "APPROVE" });
    expect(res).toMatchObject({ ok: true, outcome: "DECISION_MAKER_EMAIL_NOT_FOUND", identity_accepted: true });
    expect(res.outcome).not.toBe("READY");
    const after = (await rows()).find((r) => r.domain === "way4hair.nl")!;
    expect(after.outcome).toBe("DECISION_MAKER_EMAIL_NOT_FOUND");
    // Still counted as an owner found without email; still nothing sendable.
    expect((await t.db.rpc<Record<string, number>>("outreach_run_funnel", { p_run_id: runId })).owner_found_no_email).toBe(1);
    expect((await t.sql<{ n: number }>("select count(*)::int as n from outreach_sends"))[0]!.n).toBe(0);
  });
});
