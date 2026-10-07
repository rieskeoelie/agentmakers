/**
 * Final discovery improvements from the production Autobedrijven Hoorn validation (run dd0b8c3b):
 * generic-name locality, DataForSEO transient retry, review-only near matches, generic inbox policy, registry seam.
 */
import { describe, expect, it } from "vitest";
import { isDistinctiveCompanyName } from "../../src/lib/outreach/companyName.js";
import { CampaignInputSchema, DEFAULT_ROLE_PRIORITY } from "../../src/lib/outreach/config.js";
import { discoverContact } from "../../src/lib/outreach/contacts.js";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { evaluateEmail, isGenericEmail } from "../../src/lib/outreach/eligibility.js";
import { parseHtml } from "../../src/lib/outreach/html.js";
import { processProspect, type PipelineDeps } from "../../src/lib/outreach/pipeline.js";
import { DataForSeoOrganicSearch, isTransientDfsTaskStatus, type DiscoveredCompany, type PublicSearchProvider, type SearchResult } from "../../src/lib/outreach/providers/dataforseo.js";
import type { ContactProvider, DomainSearchResult, FinderResult } from "../../src/lib/outreach/providers/hunter.js";
import { buildQueries, evaluateResult, NEAR_MATCH_UNCERTAINTY, searchCompanyName } from "../../src/lib/outreach/publicSearch.js";
import type { RegistryLookupResult, RegistrySource } from "../../src/lib/outreach/registry.js";
import type { FetchedPage, PageFetcher } from "../../src/lib/outreach/research.js";
import { reasonLabel } from "../../src/lib/outreach/ui/review.js";
import { roleVocabulary } from "../../src/lib/outreach/vocabulary.js";
import { FixtureLLM } from "./fixtures.js";
import { fixtureBrain, LANDING, mockFetch } from "./helpers.js";

const P = DEFAULT_ROLE_PRIORITY;
const AUTO = roleVocabulary("Autobedrijven", P);
const page = (url: string, kind: FetchedPage["kind"], html: string): FetchedPage => ({ url, kind, fetched_at: "t", parsed: parseHtml(html) });
const hit = (email: string): FinderResult => ({ email, score: 91, position: null, linkedin: null, verification_status: "valid", accept_all: false });
function stubHunter(finder: (f: string, l: string) => FinderResult | null = () => null) {
  const finderCalls: string[] = [];
  const h: ContactProvider = {
    domainSearch: async (domain): Promise<DomainSearchResult> => ({ domain, organization: null, accept_all: false, contacts: [] }),
    emailFinder: async (_d, f, l) => { finderCalls.push(`${f} ${l}`); return finder(f, l); },
    verify: async () => "valid",
  };
  return { h, finderCalls };
}
const search = (results: SearchResult[]): PublicSearchProvider => ({ search: async () => results });
function memorySite(files: Record<string, string>): PageFetcher {
  const get = async (url: string) => {
    const u = new URL(url);
    const body = files[`${u.hostname}${u.pathname}`];
    if (body === undefined) throw new Error("HTTP 404");
    return { finalUrl: u.toString(), body, fetchedAt: "t" };
  };
  return { fetch: get, fetchResource: get };
}

/* ================================================================== */
describe("1. generic company names keep their locality", () => {
  it.each([
    ["Autohuis Hoorn", "Autohuis Hoorn"],
    ["Autocentrum Hoorn", "Autocentrum Hoorn"],
    ["Garagebedrijf Hoorn", "Garagebedrijf Hoorn"],
    ["Tandartspraktijk Hoorn", "Tandartspraktijk Hoorn"],
  ])("%s → search name %s (remainder would be generic)", (name, expected) => {
    expect(searchCompanyName(name, "Hoorn")).toBe(expected);
    expect(isDistinctiveCompanyName(name, "Hoorn")).toBe(false);
  });
  it("the rule is general (other city, other generic descriptors)", () => {
    expect(searchCompanyName("Autoservice Purmerend", "Purmerend")).toBe("Autoservice Purmerend");
    expect(searchCompanyName("Bandencentrum Enkhuizen B.V.", "Enkhuizen")).toBe("Bandencentrum Enkhuizen");
  });
  it("distinctive names are still normalised (location suffix, tagline and legal form dropped)", () => {
    expect(searchCompanyName("Octant Mondzorg Hoorn: Tandarts & Orthodontie", "Hoorn")).toBe("Octant Mondzorg");
    expect(searchCompanyName("Autobedrijf Klimmert Hoorn", "Hoorn")).toBe("Autobedrijf Klimmert");
    expect(searchCompanyName("Vakgarage Piet Has B.V.", "Hoorn")).toBe("Vakgarage Piet Has");
    expect(isDistinctiveCompanyName("Autobedrijf Klimmert Hoorn", "Hoorn")).toBe(true);
  });
  it("queries use the full generic name, never the bare descriptor", () => {
    const [q1, q2] = buildQueries("Autocentrum Hoorn", "nl", "Hoorn", AUTO);
    expect(q1).toMatch(/^"Autocentrum Hoorn" \(/);
    expect(q2).toMatch(/^site:linkedin\.com\/in "Autocentrum Hoorn" /);
  });
});

/* ================================================================== */
describe("2. DataForSEO transient retry", () => {
  class TestSearch extends DataForSeoOrganicSearch {
    waits: number[] = [];
    protected override sleep(ms: number) { this.waits.push(ms); return Promise.resolve(); }
  }
  const task = (status: number, items: unknown[] | null = null) => ({ status_code: 20000, cost: 0.002, tasks: [{ status_code: status, status_message: `status ${status}`, cost: 0.002, result: items ? [{ items }] : null }] });
  const item = { type: "organic", title: "Jan Jansen - Eigenaar", url: "https://x.nl/", domain: "x.nl", description: "" };
  const run = (responses: Array<[number, unknown]>) => {
    const m = mockFetch((_u, _i, n) => responses[Math.min(n, responses.length) - 1]!);
    const cost = new CostTracker("t", 1);
    const s = new TestSearch({ login: "l", password: "p" }, cost, 1, m.fetch);
    return { s, m, cost, go: () => s.search('"X" (eigenaar)', "x.nl", { country: "Netherlands", language: "nl" }) };
  };

  it("40101 is retried exactly once with bounded backoff; both attempts are in the audit trail", async () => {
    const t = run([[200, task(40101)], [200, task(20000, [item])]]);
    const r = await t.go();
    expect(r).toHaveLength(1);
    expect(t.m.calls).toHaveLength(2);
    expect(t.s.waits).toEqual([1500]);
    expect(t.cost.calls.map((c) => c.result)).toEqual(["error", "ok"]);
    expect(t.cost.calls[0]!.detail).toMatch(/task_status=40101 transient/);
    expect(t.cost.calls[1]!.detail).toMatch(/attempt=2/);
  });
  it("a second 40101 fails visibly after exactly two attempts", async () => {
    const t = run([[200, task(40101)], [200, task(40101)], [200, task(20000, [item])]]);
    await expect(t.go()).rejects.toThrow(/40101.*attempt=2/);
    expect(t.m.calls).toHaveLength(2);
    expect(t.cost.calls.map((c) => c.result)).toEqual(["error", "error"]);
  });
  it.each([
    ["no search results (40102)", [200, task(40102)] as [number, unknown], "empty"],
    ["invalid request (40501)", [200, task(40501)] as [number, unknown], "error"],
    ["authentication / access task error (40100)", [200, task(40100)] as [number, unknown], "error"],
    ["HTTP 401 unauthorized", [401, { status_code: 40100, status_message: "unauthorized" }] as [number, unknown], "error"],
  ])("%s is not retried", async (_l, resp, result) => {
    const t = run([resp, [200, task(20000, [item])]]);
    await t.go().catch(() => undefined);
    expect(t.m.calls).toHaveLength(1);
    expect(t.s.waits).toEqual([]);
    expect(t.cost.calls.map((c) => c.result)).toEqual([result]);
  });
  it("classification", () => {
    expect(isTransientDfsTaskStatus(40101)).toBe(true);
    expect(isTransientDfsTaskStatus(50000)).toBe(true);
    for (const c of [20000, 40102, 40100, 40200, 40501, undefined]) expect(isTransientDfsTaskStatus(c)).toBe(false);
  });
});

/* ================================================================== */
const VERBURG = { name: "Autobedrijf Verburg", domain: "verburg.nl", city: "Hoorn" };
/** Live production result shape (run dd0b8c3b) + a snippet that does / does not mention the locality. */
const joris = (snippet: string): SearchResult => ({ title: "Joris Verburg - Ondernemer bij Garage Verburg b.v. | LinkedIn", url: "https://nl.linkedin.com/in/joris-verburg-587a9b351", domain: "nl.linkedin.com", snippet });

describe("3. review-only near matches", () => {
  it("strong business-name similarity + same locality → REVIEW candidate (not a verified candidate)", () => {
    const ev = evaluateResult(joris("Eigenaar · Garage Verburg b.v. · Hoorn, Noord-Holland"), VERBURG, AUTO.priority);
    expect(ev.candidate).toBeNull();
    expect(ev.reason).toBe("REVIEW_NEAR_MATCH");
    expect(ev.near_match).toMatchObject({ full_name: "Joris Verburg", organisation: "Garage Verburg b.v", similarity: "STRONG_BUSINESS_NAME_MATCH", corroboration: ["SAME_LOCALITY"], uncertainty: NEAR_MATCH_UNCERTAINTY });
    expect(NEAR_MATCH_UNCERTAINTY).toBe("Bedrijfsnaam komt sterk overeen, maar identiteit is niet volledig bevestigd.");
  });
  it("company phone or street address also corroborate", () => {
    const ev = evaluateResult(joris("Eigenaar · Garage Verburg b.v. · bel 0229-212121"), { ...VERBURG, phone: "+31 229 212121" }, AUTO.priority);
    expect(ev.near_match?.corroboration).toEqual(["COMPANY_PHONE"]);
    const ev2 = evaluateResult(joris("Eigenaar · Garage Verburg b.v. · Dampten 12"), { ...VERBURG, address: "Dampten 12, 1624 NV Hoorn" }, AUTO.priority);
    expect(ev2.near_match?.corroboration).toEqual(["COMPANY_ADDRESS"]);
  });
  it("name similarity alone (no corroboration) stays rejected, with an explicit reason", () => {
    const ev = evaluateResult(joris("Eigenaar · Garage Verburg b.v."), VERBURG, AUTO.priority);
    expect(ev.near_match).toBeUndefined();
    expect(ev.reason).toBe("NEAR_MATCH_WITHOUT_CORROBORATION");
  });
  it("weak similarity (extra distinctive words) is not a near match even with the locality", () => {
    const ev = evaluateResult({ ...joris("Eigenaar · Verburg Transport b.v. · Hoorn"), title: "Joris Verburg - Ondernemer bij Verburg Transport b.v. | LinkedIn" }, VERBURG, AUTO.priority);
    expect(ev.near_match).toBeUndefined();
    expect(ev.reason).toBe("NO_EXACT_COMPANY_ASSOCIATION");
  });

  async function runPipeline(finder: (f: string, l: string) => FinderResult | null, snippet: string) {
    const HOME = `<html><body><p>Afspraak maken? Bel ons op 0229-333444.</p></body></html>`;
    const hunter = stubHunter(finder);
    const brain = await fixtureBrain();
    const deps: PipelineDeps = {
      discovery: { discover: async () => [] }, hunter: hunter.h, llm: new FixtureLLM(), websiteFetcher: memorySite({ "tandartsverburg.example/": HOME }),
      cost: new CostTracker("t", 5), settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 1 },
      publicSearch: search([{ title: "Joris Verburg - Eigenaar - Tandarts Verburg B.V. | LinkedIn", url: "https://nl.linkedin.com/in/joris-verburg", domain: "nl.linkedin.com", snippet }]),
    };
    const campaign = CampaignInputSchema.parse({ niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: LANDING, limit: 1 });
    const company: DiscoveredCompany = {
      provider_id: "v", company_name: "Tandartspraktijk Verburg", category: "Tandarts", additional_categories: [], website: "https://tandartsverburg.example/", domain: "tandartsverburg.example",
      phone: null, address: null, city: "Hoorn", region: null, country: "NL", rating: null, review_count: null, book_online_url: null, closed_signal: null,
      raw_reference: { provider: "dataforseo", endpoint: "fixture", rank: null, place_id: null, cid: null },
    };
    return { rec: await processProspect(company, 1, campaign, brain, deps), hunter };
  }

  it("a corroborated near match with a valid company-domain address is NEVER READY — always NEEDS_REVIEW, no Prospeo", async () => {
    const { rec } = await runPipeline((f, l) => (f === "Joris" && l === "Verburg" ? hit("joris@tandartsverburg.example") : null), "Eigenaar bij Tandarts Verburg B.V. · Hoorn");
    expect(rec.contact).toMatchObject({ identification: "near_match_review", source: "public_search_near_match+hunter_email_finder" });
    expect(rec.contact!.near_match!.uncertainty).toBe(NEAR_MATCH_UNCERTAINTY);
    expect(rec.status).toBe("NEEDS_REVIEW");
    expect(rec.status_reasons).toContain("NEAR_MATCH_IDENTITY_UNCONFIRMED");
    expect(rec.prospeo).toEqual({ result: "not_run", reason: "NEAR_MATCH_IDENTITY_UNCONFIRMED" });
    expect(reasonLabel("NEAR_MATCH_IDENTITY_UNCONFIRMED")).toBe(NEAR_MATCH_UNCERTAINTY);
  });
  it("an uncorroborated near match never reaches Email Finder and stays CONTACT_NOT_FOUND", async () => {
    const { rec, hunter } = await runPipeline(() => hit("joris@tandartsverburg.example"), "Eigenaar bij Tandarts Verburg B.V.");
    expect(rec.status).toBe("CONTACT_NOT_FOUND");
    expect(hunter.finderCalls).toEqual([]);
    expect(rec.contact!.public_search!.rejected[0]).toMatchObject({ name: "Joris Verburg", reason: "NEAR_MATCH_WITHOUT_CORROBORATION" });
  });
});

/* ================================================================== */
describe("4. generic inboxes stay excluded as recipients", () => {
  it.each(["info@verburg.nl", "contact@verburg.nl", "office@verburg.nl", "sales@verburg.nl", "receptie@verburg.nl"])("%s is never eligible", (e) => {
    expect(isGenericEmail(e)).toBe(true);
    expect(evaluateEmail(e, "valid", "verburg.nl")).toMatchObject({ eligibility: "NOT_ELIGIBLE", is_generic: true });
  });
  it("a near match whose Email Finder result is a generic inbox gets no recipient (inbox kept as company metadata only)", async () => {
    const r = await discoverContact({
      domain: "verburg.nl", pages: [page("https://verburg.nl/", "home", "<p>Welkom</p>")], priority: AUTO.priority, vocabulary: AUTO, hunter: stubHunter(() => hit("info@verburg.nl")).h, prospect: "verburg.nl",
      publicSearch: { provider: search([joris("Eigenaar · Garage Verburg b.v. · Hoorn")]), companyName: "Autobedrijf Verburg", city: "Hoorn", language: "nl", country: "Netherlands" },
    });
    expect(r.email).toBeNull();
    expect(r.failure_reason).toBe("CONTACT_NOT_FOUND");
    expect(r.company_generic_emails).toContain("info@verburg.nl");
    expect(r.near_match?.full_name).toBe("Joris Verburg"); // still visible for the reviewer
  });
});

/* ================================================================== */
describe("5. registry extension point", () => {
  const KLIMMERT = `<html><body><h4>Richard</h4><p>Eigenaar</p><h4>Willem</h4><p>Werkplaatschef</p></body></html>`;
  const evidence = { source_name: "Test registry", source_url: null, record_id: "12345678", retrieved_at: "2026-10-07T00:00:00Z" };
  const registry = (result: RegistryLookupResult | Error): RegistrySource & { calls: number } => {
    const r = { name: "test-registry", calls: 0, lookup: async () => { r.calls++; if (result instanceof Error) throw result; return result; } };
    return r;
  };
  const found = (officers: Array<[string, string, string]>): RegistryLookupResult => ({
    status: "found", evidence, match: { on: ["name", "city"], confidence: "authoritative" },
    company: { legal_name: "Garagebedrijf Klimmert V.O.F.", trade_names: ["Carteam Garagebedrijf Klimmert"], registration_id: "12345678", jurisdiction: "NL", address: null, city: "Hoorn", website: null, status: "active" },
    officers: officers.map(([first, last, role]) => ({ full_name: `${first} ${last}`, first_name: first, last_name: last, role, since: null, evidence, confidence: "authoritative" as const })),
  });
  const run = (reg?: RegistrySource, finder: (f: string, l: string) => FinderResult | null = () => null) => discoverContact({
    domain: "garageklimmert.nl", pages: [page("https://www.garageklimmert.nl/over-ons", "about", KLIMMERT)], priority: AUTO.priority, vocabulary: AUTO, hunter: stubHunter(finder).h, prospect: "garageklimmert.nl",
    registry: reg ? { source: reg, lookup: { company_name: "Carteam Garagebedrijf Klimmert", domain: "garageklimmert.nl", city: "Hoorn", country: "Netherlands", address: null } } : undefined,
  });

  it("not configured → explicit NOT_CONFIGURED trace, behaviour unchanged (partial owner, no surname)", async () => {
    const r = await run();
    expect(r.registry).toEqual({ status: "NOT_CONFIGURED" });
    expect(r).toMatchObject({ name: "Richard", last_name: null, identification: "first_name_only" });
  });
  it("an authoritative officer completes the partial owner (surname from the registry, not inferred)", async () => {
    const reg = registry(found([["Willem", "de Boer", "Vennoot"], ["Richard", "Klimmert", "Eigenaar"]]));
    const r = await run(reg, (f, l) => (f === "Richard" && l === "Klimmert" ? hit("richard@garageklimmert.nl") : null));
    expect(r).toMatchObject({ name: "Richard Klimmert", source: "registry+hunter_email_finder", identification: "full_name", email: "richard@garageklimmert.nl" });
    expect(r.registry).toMatchObject({ status: "FOUND", selected: { full_name: "Richard Klimmert", role: "Eigenaar" } });
  });
  it("officers without a decision-maker role are rejected with a reason; ambiguous / errors are never 'not found'", async () => {
    const r = await run(registry(found([["Piet", "Bos", "Gevolmachtigde"]])));
    expect(r.registry).toMatchObject({ status: "FOUND", selected: null, rejected: [{ full_name: "Piet Bos", reason: "ROLE_NOT_DECISION_MAKER" }] });
    expect((await run(registry({ status: "ambiguous", candidates: 3, evidence: null }))).registry).toEqual({ status: "AMBIGUOUS", source: "test-registry" });
    expect((await run(registry(new Error("registry timeout")))).registry).toMatchObject({ status: "ERROR", error: "registry timeout" });
  });
});
