/**
 * Regression tests for the "Autobedrijven Hoorn" root-cause fixes (production run 860e9681, 0 READY).
 * Inputs reproduce the real production evidence (pages, search results, errors) of that run.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildActivity, skipReasonLabel } from "../../src/components/admin/outreach/activity.js";
import type { CampaignBrain } from "../../src/lib/outreach/brain.js";
import { CampaignInputSchema, DEFAULT_ROLE_PRIORITY } from "../../src/lib/outreach/config.js";
import { discoverContact, publishedCompanyMailDomains } from "../../src/lib/outreach/contacts.js";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { parseHtml } from "../../src/lib/outreach/html.js";
import { decisionMakerRoleCheck } from "../../src/lib/outreach/orchestration/reviewRole.js";
import { funnelFlags } from "../../src/lib/outreach/output.js";
import { processProspect, type PipelineDeps } from "../../src/lib/outreach/pipeline.js";
import { DataForSeoOrganicSearch, type DiscoveredCompany, type PublicSearchProvider, type SearchResult } from "../../src/lib/outreach/providers/dataforseo.js";
import type { ContactProvider, DomainSearchResult, FinderResult, HunterContact } from "../../src/lib/outreach/providers/hunter.js";
import { buildQueries, evaluateResult, findDecisionMakerViaPublicSearch } from "../../src/lib/outreach/publicSearch.js";
import { alternateCanonicalUrl, detectPlaceholder, extractFirstNameOwners, fetchWebsite, isHostLevelFailure, SafePageFetcher, type FetchedPage, type PageFetcher } from "../../src/lib/outreach/research.js";
import { matchRole } from "../../src/lib/outreach/roles.js";
import { DEFAULT_USER_AGENT, isPublicIp, safeFetch, UnsafeUrlError } from "../../src/lib/outreach/safeFetch.js";
import { roleVocabulary } from "../../src/lib/outreach/vocabulary.js";
import type { TimelineEvent } from "../../src/lib/outreach/ui/types.js";
import { FixtureLLM } from "./fixtures.js";
import { fixtureBrain, LANDING, mockFetch } from "./helpers.js";

const P = DEFAULT_ROLE_PRIORITY;
const AUTO = roleVocabulary("Autobedrijven", P);
const page = (url: string, kind: FetchedPage["kind"], html: string): FetchedPage => ({ url, kind, fetched_at: "t", parsed: parseHtml(html) });
const hc = (email: string, o: Partial<HunterContact> = {}): HunterContact => ({
  email, type: "personal", confidence: 90, first_name: null, last_name: null, position: null, seniority: null, department: null, linkedin: null, verification_status: "valid", ...o,
});
function stubHunter(byDomain: Record<string, HunterContact[]>, finder: (d: string, f: string, l: string) => FinderResult | null = () => null) {
  const ds: string[] = [];
  const finderCalls: string[] = [];
  const h: ContactProvider = {
    domainSearch: async (domain): Promise<DomainSearchResult> => { ds.push(domain); return { domain, organization: null, accept_all: false, contacts: byDomain[domain] ?? [] }; },
    emailFinder: async (d, f, l) => { finderCalls.push(`${d}:${f}|${l}`); return finder(d, f, l); },
    verify: async () => "valid",
  };
  return { h, ds, finderCalls };
}
function stubSearch(results: (q: string) => SearchResult[] = () => []) {
  const queries: string[] = [];
  const provider: PublicSearchProvider = { search: async (q) => { queries.push(q); return results(q); } };
  return { provider, queries };
}
/** In-memory website: "host/path" → body (or an Error to throw). */
function memorySite(files: Record<string, string | Error>) {
  const requested: string[] = [];
  const get = async (url: string) => {
    requested.push(url);
    const u = new URL(url);
    const body = files[`${u.hostname}${u.pathname}`];
    if (body instanceof Error) throw body;
    if (body === undefined) throw new Error("HTTP 404");
    return { finalUrl: u.toString(), body, fetchedAt: "t" };
  };
  const fetcher: PageFetcher = { fetch: get, fetchResource: get };
  return { fetcher, requested };
}
const tlsAltnameError = (host: string) => Object.assign(new Error(`Hostname/IP does not match certificate's altnames: Host: ${host}. is not in the cert's altnames: DNS:${host.replace(/^www\./, "")}`), { code: "ERR_TLS_CERT_ALTNAME_INVALID" });

const company = (o: Partial<DiscoveredCompany>): DiscoveredCompany => ({
  provider_id: o.company_name ?? "x", company_name: "X", category: "Autobedrijf/Garage", additional_categories: [], website: null, domain: null, phone: null, address: null,
  city: "Hoorn", region: null, country: "NL", rating: null, review_count: null, book_online_url: null, closed_signal: null,
  raw_reference: { provider: "dataforseo", endpoint: "fixture", rank: null, place_id: null, cid: null }, ...o,
});

/* ================================================================== */
describe("1. research fetcher user-agent", () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    // Reproduces the live nginx rule: any UA containing "bot" → 403 (De Vries Junior Auto's, Autocentrum Hoorn).
    server = http.createServer((req, res) => {
      if (/bot/i.test(req.headers["user-agent"] ?? "")) { res.writeHead(403, { "content-type": "text/html" }); res.end("Forbidden"); return; }
      res.writeHead(200, { "content-type": "text/html" }); res.end("<html><body><p>Autobedrijf in Hoorn. Bel ons voor een afspraak.</p></body></html>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const opts = (userAgent?: string) => ({
    timeoutMs: 1500, maxBytes: 10_000, allowedPorts: [port], userAgent,
    resolver: async () => [{ address: "127.0.0.1", family: 4 }], ipPolicy: (ip: string) => ip === "127.0.0.1" || isPublicIp(ip),
  });

  it("is honest (names AgentMakers + contact URL) and contains no 'bot' token", () => {
    expect(DEFAULT_USER_AGENT).toBe("AgentMakersResearch/0.1 (+https://www.agentmakers.io)");
    expect(DEFAULT_USER_AGENT).not.toMatch(/bot/i);
  });
  it("a Bot-style user-agent is blocked (403) by such a site, the new default user-agent is accepted", async () => {
    await expect(safeFetch(`http://garage.test.example:${port}/`, opts("AgentMakersResearchBot/0.1 (+https://www.agentmakers.io)"))).rejects.toThrow("HTTP 403");
    const ok = await safeFetch(`http://garage.test.example:${port}/`, opts());
    expect(ok.status).toBe(200);
  });
  it("keeps the SSRF controls (private IPs still rejected with the new user-agent)", async () => {
    await expect(safeFetch("http://10.0.0.7/", { timeoutMs: 500, maxBytes: 1000 })).rejects.toThrow(UnsafeUrlError);
  });
});

/* ================================================================== */
describe("2. www ↔ bare-domain fallback", () => {
  it("www TLS certificate mismatch → bare domain succeeds (Autobedrijf Verburg)", async () => {
    const site = memorySite({ "www.verburg.example/": tlsAltnameError("www.verburg.example"), "verburg.example/": "<html><body><a href='/contact'>Contact</a><p>Autobedrijf Verburg, uw garage in Hoorn.</p></body></html>" });
    const r = await fetchWebsite("https://www.verburg.example/", site.fetcher, { maxPages: 2, maxTextChars: 30_000, prospect: "verburg.example" });
    expect(r.pages[0]!.url).toBe("https://verburg.example/");
    expect(r.host_fallback).toMatchObject({ from: "https://www.verburg.example/", to: "https://verburg.example/" });
    expect(r.errors[0]!.error).toMatch(/altnames/);
  });
  it("also the other way round (bare → www) for connection failures", async () => {
    const site = memorySite({ "garage.example/": Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:443"), { code: "ECONNREFUSED" }), "www.garage.example/": "<p>Welkom bij de garage, al 30 jaar uw adres.</p>" });
    const r = await fetchWebsite("https://garage.example/", site.fetcher, { maxPages: 1, maxTextChars: 30_000, prospect: "garage.example" });
    expect(r.pages).toHaveLength(1);
    expect(r.host_fallback?.to).toBe("https://www.garage.example/");
  });
  it("never retries for HTTP errors (host answered) or SSRF rejections", async () => {
    for (const err of [new Error("HTTP 403"), new UnsafeUrlError("Resolved to blocked IP 10.0.0.7 for www.x.example")]) {
      const site = memorySite({ "www.x.example/": err, "x.example/": "<p>should never be fetched</p>" });
      const r = await fetchWebsite("https://www.x.example/", site.fetcher, { maxPages: 1, maxTextChars: 30_000, prospect: "x.example" });
      expect(r.pages).toHaveLength(0);
      expect(site.requested).toEqual(["https://www.x.example/"]);
    }
  });
  it("the retried host goes through the same SSRF-safe fetcher (alternate host resolving to a private IP is refused)", async () => {
    const fetcher = new SafePageFetcher({
      timeoutMs: 500, maxBytes: 1000,
      resolver: async (h) => { if (h === "www.evil.example") throw Object.assign(new Error("getaddrinfo ENOTFOUND www.evil.example"), { code: "ENOTFOUND" }); return [{ address: "10.0.0.9", family: 4 }]; },
    });
    const r = await fetchWebsite("https://www.evil.example/", fetcher, { maxPages: 1, maxTextChars: 1000, prospect: "evil.example" });
    expect(r.pages).toHaveLength(0);
    expect(r.errors.map((e) => e.url)).toEqual(["https://www.evil.example/", "https://evil.example/"]);
    expect(r.errors[1]!.error).toMatch(/blocked IP 10\.0\.0\.9/);
  });
  it("classifies host-level failures and alternate hosts", () => {
    expect(isHostLevelFailure(tlsAltnameError("www.a.nl"))).toBe(true);
    expect(isHostLevelFailure(new Error("Timeout after 12000ms"))).toBe(true);
    expect(isHostLevelFailure(new Error("HTTP 404"))).toBe(false);
    expect(alternateCanonicalUrl("http://www.verburg.nl/")).toBe("http://verburg.nl/");
    expect(alternateCanonicalUrl("https://verburg.nl/x")).toBe("https://www.verburg.nl/x");
    expect(alternateCanonicalUrl("https://shop.verburg.nl/")).toBeNull();
  });
});

/* ================================================================== */
const LOUIS_PLACEHOLDER = "Please stand by while configuration is in progress.\n"; // exact live body (52 bytes)

describe("3. placeholder websites", () => {
  it("detects the live configuration page, parking pages and empty pages", () => {
    expect(detectPlaceholder(LOUIS_PLACEHOLDER, parseHtml(LOUIS_PLACEHOLDER), "http://www.louisvanstraalen.nl/")).toMatch(/^PLACEHOLDER_TEXT/);
    const parked = "<html><head><title>garage-x.nl</title></head><body><h1>Deze domeinnaam is geregistreerd</h1></body></html>";
    expect(detectPlaceholder(parked, parseHtml(parked), "https://garage-x.nl/")).toMatch(/^PLACEHOLDER_TEXT/);
    expect(detectPlaceholder("<html><body></body></html>", parseHtml("<html><body></body></html>"), "https://x.nl/")).toMatch(/^NO_CONTENT/);
  });
  it("does not flag a real (tiny) site or a JS-rendered site", () => {
    const tiny = "<body><p>Afspraak maken? Bel ons op 0229-333444.</p></body>";
    expect(detectPlaceholder(tiny, parseHtml(tiny), "https://x.nl/")).toBeNull();
    const spa = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
    expect(detectPlaceholder(spa, parseHtml(spa), "https://x.nl/")).toBeNull();
  });
  it("pipeline: WEBSITE_PLACEHOLDER — skipped, not researched, no Hunter/search spend", async () => {
    const hunter = stubHunter({});
    const search = stubSearch();
    const site = memorySite({ "www.louisvanstraalen.nl/": LOUIS_PLACEHOLDER });
    const cost = new CostTracker("t", 5);
    const brain = await fixtureBrain();
    const deps: PipelineDeps = {
      discovery: { discover: async () => [] }, hunter: hunter.h, llm: new FixtureLLM(), websiteFetcher: site.fetcher, cost, publicSearch: search.provider,
      settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 1 },
    };
    const campaign = CampaignInputSchema.parse({ niche: "Autobedrijven", country: "Netherlands", region: "Hoorn", agentmakers_url: LANDING, limit: 1 });
    const rec = await processProspect(company({ company_name: "Autobedrijf Louis van Straalen B.V.", website: "http://www.louisvanstraalen.nl/", domain: "louisvanstraalen.nl" }), 1, campaign, brain, deps);
    expect(rec.status).toBe("SKIPPED");
    expect(rec.status_reasons).toEqual(["WEBSITE_PLACEHOLDER"]);
    expect(rec.stages.website_fetch.status).toBe("skipped");
    expect(funnelFlags(rec).researched).toBe(false);
    expect(hunter.ds).toHaveLength(0);
    expect(search.queries).toHaveLength(0);
  });
});

/* ================================================================== */
describe("4. niche-aware decision-maker search terms", () => {
  it("automotive campaign: garage titles, no dental terms", () => {
    const [q1, q2] = buildQueries("Hoorn Auto & Bandenservice B.V.", "nl", "Hoorn", AUTO);
    for (const t of ["eigenaar", "directeur", "bedrijfsleider", "DGA", "oprichter", "garagehouder"]) expect(q1).toContain(t);
    expect(`${q1} ${q2}`).not.toMatch(/praktijk/i);
    expect(AUTO.siteSearchTerms.join(" ")).toMatch(/wie zijn wij/);
    expect(AUTO.siteSearchTerms.join(" ")).toMatch(/historie/);
    expect(AUTO.siteSearchTerms.join(" ")).not.toMatch(/praktijk/);
    expect(AUTO.priority).not.toContain("practice owner");
    expect(AUTO.priority).not.toContain("practice manager");
  });
  it("garage titles qualify as decision maker for title matching and for the review approval gate", () => {
    expect(matchRole("Garagehouder", AUTO.priority)).not.toBeNull();
    expect(matchRole("Eigenaar garage", AUTO.priority)?.matched_role).toBe("owner");
    expect(decisionMakerRoleCheck("Garagehouder", P).qualified).toBe(true);
    expect(decisionMakerRoleCheck("Werkplaatschef", P).qualified).toBe(false);
  });
  it("dental campaigns keep the validated practice wording", () => {
    const dental = roleVocabulary("tandarts", P);
    expect(buildQueries("Octant Mondzorg Hoorn", "nl", "Hoorn", dental)[0]).toBe('"Octant Mondzorg" (eigenaar OR praktijkhouder OR praktijkeigenaar OR directeur OR praktijkmanager OR vestigingsmanager)');
    expect(dental.priority).toEqual(P);
  });
  it("the generic default (no niche) carries no dental wording", () => {
    expect(buildQueries("Bakkerij Jansen", "nl")[0]).not.toMatch(/praktijk/);
  });
  it("same-domain site: search uses the niche terms", async () => {
    const search = stubSearch();
    await discoverContact({
      domain: "hoornautoservice.nl", pages: [page("https://www.hoornautoservice.nl/", "home", "<p>Welkom</p>")], priority: AUTO.priority, vocabulary: AUTO, hunter: stubHunter({}).h, prospect: "hoornautoservice.nl",
      sameDomain: { fetcher: memorySite({}).fetcher, homeUrl: "https://www.hoornautoservice.nl/", search: search.provider, language: "nl", country: "Netherlands" },
    });
    expect(search.queries[0]).toBe('site:hoornautoservice.nl (team OR medewerkers OR over-ons OR "wie zijn wij" OR historie OR organisatie OR directie)');
  });
});

/* ================================================================== */
/* Reproduction of the live garageklimmert.nl /over-ons profile cards. */
const KLIMMERT_OVER_ONS = `<html><body><h2>Welkom bij Carteam Garagebedrijf Klimmert</h2>
<p>Richard is zijn garagebedrijf begonnen in 1998 aan de achterzijde van het huidige pand, toen nog Atoomweg 8A.</p>
<p>Willem is de langstlopende monteur en is sinds 2020 met Richard een vof gestart.</p>
<div><h4>Richard</h4><p>Eigenaar</p></div><div><h4>Willem</h4><p>Werkplaatschef / Diagnose specialist</p></div><div><h4>Tristan</h4><p>Monteur</p></div></body></html>`;

describe("5. first-name-only owners on the company's own site", () => {
  it("extracts 'Richard — Eigenaar' as a partial owner (no surname)", () => {
    const isOwner = (t: string) => matchRole(t, ["owner", "founder", "managing director"]) !== null;
    const r = extractFirstNameOwners([page("https://www.garageklimmert.nl/over-ons", "about", KLIMMERT_OVER_ONS)], isOwner);
    expect(r).toEqual([expect.objectContaining({ first_name: "Richard", title: "Eigenaar" })]);
  });
  it("records a PARTIAL decision maker; never invents the surname; no Email Finder call", async () => {
    const hunter = stubHunter({});
    const r = await discoverContact({
      domain: "garageklimmert.nl", pages: [page("https://www.garageklimmert.nl/over-ons", "about", KLIMMERT_OVER_ONS)], priority: AUTO.priority, vocabulary: AUTO, hunter: hunter.h, prospect: "garageklimmert.nl",
    });
    expect(r).toMatchObject({ name: "Richard", first_name: "Richard", last_name: null, title: "Eigenaar", identification: "first_name_only", email: null, failure_reason: "DECISION_MAKER_EMAIL_NOT_FOUND" });
    expect(JSON.stringify(r)).not.toMatch(/Richard Klimmert/);
    expect(hunter.finderCalls).toHaveLength(0);
  });
  it("a public-search hit with the full name (evidence) still wins over the partial candidate", async () => {
    const search = stubSearch(() => [{ title: "Richard Klimmert - Eigenaar - Carteam Garagebedrijf Klimmert | LinkedIn", url: "https://nl.linkedin.com/in/richard-klimmert", domain: "nl.linkedin.com", snippet: "Eigenaar bij Carteam Garagebedrijf Klimmert" }]);
    const hunter = stubHunter({}, (_d, f, l) => (f === "Richard" && l === "Klimmert" ? { email: "richard@garageklimmert.nl", score: 92, position: null, linkedin: null, verification_status: "valid", accept_all: false } : null));
    const r = await discoverContact({
      domain: "garageklimmert.nl", pages: [page("https://www.garageklimmert.nl/over-ons", "about", KLIMMERT_OVER_ONS)], priority: AUTO.priority, vocabulary: AUTO, hunter: hunter.h, prospect: "garageklimmert.nl",
      publicSearch: { provider: search.provider, companyName: "Carteam Garagebedrijf Klimmert", city: "Hoorn", language: "nl", country: "Netherlands" },
    });
    expect(r).toMatchObject({ name: "Richard Klimmert", identification: "full_name", source: "public_search+hunter_email_finder" });
  });
  it("first name matching exactly one Hunter contact → full name from Hunter, but never auto-sendable (NEEDS_REVIEW)", async () => {
    const DENTAL_HOME = `<html><body><nav><a href="/over-ons">Over ons</a></nav><p>Afspraak maken? Bel ons op 0229-333444.</p></body></html>`;
    const OVER = `<html><body><h4>Richard</h4><p>Eigenaar</p><p>Wij helpen u graag.</p></body></html>`;
    const site = memorySite({ "tandarts-richard.example/": DENTAL_HOME, "tandarts-richard.example/over-ons": OVER });
    const hunter = stubHunter({ "tandarts-richard.example": [hc("r.devries@tandarts-richard.example", { first_name: "Richard", last_name: "de Vries" })] });
    const brain = await fixtureBrain();
    const cost = new CostTracker("t", 5);
    const deps: PipelineDeps = { discovery: { discover: async () => [] }, hunter: hunter.h, llm: new FixtureLLM(), websiteFetcher: site.fetcher, cost, settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 1 } };
    const campaign = CampaignInputSchema.parse({ niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: LANDING, limit: 1 });
    const rec = await processProspect(company({ company_name: "Tandartspraktijk Richard", category: "Tandarts", website: "https://tandarts-richard.example/", domain: "tandarts-richard.example" }), 1, campaign, brain, deps);
    expect(rec.contact).toMatchObject({ name: "Richard de Vries", identification: "first_name_hunter_match", email: "r.devries@tandarts-richard.example" });
    expect(rec.status).toBe("NEEDS_REVIEW");
    expect(rec.status_reasons).toContain("PARTIAL_NAME_MATCH_REVIEW");
  });
});

/* ================================================================== */
const PIET_HAS_RESULT: SearchResult = {
  title: "Piet Has: sinds 1987 een betrouwbare partner in mobiliteit", url: "https://vwe.nl/piet-has-sinds-1987-een-betrouwbare-partner-in-mobiliteit/", domain: "vwe.nl",
  snippet: "Vakgarage Piet Has heeft een duidelijke doelstelling: altijd een breed en kwalitatief aanbod aan voertuigen bieden. Om dit mogelijk te maken zocht het...",
};
const PIET = { name: "Vakgarage Piet Has B.V.", domain: "vakgaragepiethas.nl", city: "Hoorn" };

describe("6. public-search candidate matching", () => {
  it("rejects the live false positive: name equal to the business name ('Piet Has' for 'Vakgarage Piet Has B.V.')", () => {
    const ev = evaluateResult(PIET_HAS_RESULT, PIET, AUTO.priority);
    expect(ev.candidate).toBeNull();
    expect(ev.reason).toBe("NAME_EQUALS_COMPANY_NAME");
  });
  it("rejects a slogan 'partner' as job title even for a real-looking person name", () => {
    const ev = evaluateResult({ ...PIET_HAS_RESULT, title: "Jan Bakker: sinds 1987 een betrouwbare partner in mobiliteit" }, PIET, AUTO.priority);
    expect(ev.candidate).toBeNull();
    expect(ev.reason).toBe("TITLE_IS_SENTENCE_FRAGMENT");
    const ev2 = evaluateResult({ ...PIET_HAS_RESULT, title: "Jan Bakker - partner in mobiliteit" }, PIET, AUTO.priority);
    expect(ev2.reason).toBe("AMBIGUOUS_ROLE_NOT_A_JOB_TITLE");
  });
  it("rejects a candidate whose title names another company", () => {
    const ev = evaluateResult({ title: "Arjan Reus - Eigenaar Auto Tensen Enkhuizen", url: "https://www.destadsgarage.nl/nieuws/", domain: "www.destadsgarage.nl", snippet: "" }, { name: "dé Stadsgarage PCA dealer Hoorn", domain: "destadsgarage.nl", city: "Hoorn" }, AUTO.priority);
    expect(ev.candidate).toBeNull();
    expect(ev.reason).toBe("TITLE_REFERS_TO_OTHER_COMPANY");
  });
  it("still accepts a real job title for this company", () => {
    const ev = evaluateResult({ title: "Jan Bakker - Eigenaar - Vakgarage Piet Has | LinkedIn", url: "https://nl.linkedin.com/in/jan-bakker", domain: "nl.linkedin.com", snippet: "Eigenaar bij Vakgarage Piet Has" }, PIET, AUTO.priority);
    expect(ev.candidate).toMatchObject({ full_name: "Jan Bakker", title: "Eigenaar" });
  });
  it("keeps an audit of every result and the rejection reasons", async () => {
    const s = stubSearch(() => [PIET_HAS_RESULT]);
    const rep = await findDecisionMakerViaPublicSearch({ search: s.provider, company: PIET, priority: AUTO.priority, language: "nl", country: "Netherlands", prospect: "vakgaragepiethas.nl", vocabulary: AUTO });
    expect(rep.selected).toBeNull();
    expect(rep.rejected[0]).toMatchObject({ name: "Piet Has", reason: "NAME_EQUALS_COMPANY_NAME" });
    expect(rep.results![0]).toEqual({ title: PIET_HAS_RESULT.title, url: "https://vwe.nl/piet-has-sinds-1987-een-betrouwbare-partner-in-mobiliteit/", verdict: "NAME_EQUALS_COMPANY_NAME" });
  });
});

/* ================================================================== */
describe("7. Prospeo state", () => {
  const DENTAL = `<html><body><p>Afspraak maken? Bel ons op 0229-333444.</p></body></html>`;
  async function run(contacts: HunterContact[]) {
    const site = memorySite({ "tandarts-p.example/": DENTAL });
    const brain: CampaignBrain = await fixtureBrain();
    const deps: PipelineDeps = { discovery: { discover: async () => [] }, hunter: stubHunter({ "tandarts-p.example": contacts }).h, llm: new FixtureLLM(), websiteFetcher: site.fetcher, cost: new CostTracker("t", 5), settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 1 } };
    const campaign = CampaignInputSchema.parse({ niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: LANDING, limit: 1 });
    return processProspect(company({ company_name: "Tandartspraktijk P", category: "Tandarts", website: "https://tandarts-p.example/", domain: "tandarts-p.example" }), 1, campaign, brain, deps);
  }
  it("fallback needed but no Prospeo configured → explicit NOT_CONFIGURED (unavailable), pipeline continues", async () => {
    // Named owner with only a review-only (accept_all) Hunter address → Prospeo would run.
    const rec = await run([hc("jan@tandarts-p.example", { first_name: "Jan", last_name: "Jansen", position: "Eigenaar", verification_status: "accept_all" })]);
    expect(rec.prospeo).toEqual({ result: "NOT_CONFIGURED", reason: "HUNTER_REVIEW_ONLY" });
    expect(rec.status).not.toBe("FAILED");
  });
  it("fallback unnecessary (valid Hunter email) stays not_run", async () => {
    const rec = await run([hc("jan@tandarts-p.example", { first_name: "Jan", last_name: "Jansen", position: "Eigenaar" })]);
    expect(rec.prospeo).toEqual({ result: "not_run", reason: "HUNTER_VALID_EMAIL" });
  });
});

/* ================================================================== */
const STADSGARAGE_CONTACT = `<html><body><p>Heeft u vragen? Neem dan telefonisch contact met ons op of stuur ons een e-mail bericht.</p>
<p>0229-235544</p><p><a href="mailto:info@stadsgarage.nl">info@stadsgarage.nl</a></p></body></html>`;

describe("8. second company-published mail domain", () => {
  it("only domains the company's own site publishes and that carry the same brand", () => {
    const pages = [page("https://www.destadsgarage.nl/contact/", "contact", STADSGARAGE_CONTACT)];
    expect(publishedCompanyMailDomains(pages, "destadsgarage.nl")).toEqual(["stadsgarage.nl"]);
    const other = [page("https://www.garageklimmert.nl/contact", "contact", "<p>info@carteam.nl · klimmert@live.nl · info@garageklimmert.nl</p>")];
    expect(publishedCompanyMailDomains(other, "garageklimmert.nl")).toEqual([]); // franchise + free mail + same domain
  });
  it("Hunter Domain Search also runs on that domain; evidence rules unchanged (different domain → review-only)", async () => {
    const hunter = stubHunter({ "stadsgarage.nl": [hc("kees@stadsgarage.nl", { first_name: "Kees", last_name: "de Groot", position: "Eigenaar" })] });
    const r = await discoverContact({ domain: "destadsgarage.nl", pages: [page("https://www.destadsgarage.nl/contact/", "contact", STADSGARAGE_CONTACT)], priority: AUTO.priority, vocabulary: AUTO, hunter: hunter.h, prospect: "destadsgarage.nl" });
    expect(hunter.ds).toEqual(["destadsgarage.nl", "stadsgarage.nl"]);
    expect(r.email_domains_searched).toEqual(["destadsgarage.nl", "stadsgarage.nl"]);
    expect(r).toMatchObject({ name: "Kees de Groot", email: "kees@stadsgarage.nl" });
    const { evaluateEmail } = await import("../../src/lib/outreach/eligibility.js");
    expect(evaluateEmail(r.email, "valid", "destadsgarage.nl")).toMatchObject({ eligibility: "REVIEW_ONLY", domain_matches_company: false });
  });
  it("Hunter candidates are audited by name/position/verdict (no addresses of non-selected people)", async () => {
    const hunter = stubHunter({ "x.nl": [hc("piet@x.nl", { first_name: "Piet", last_name: "Bos", position: "Monteur" }), hc("info@x.nl", { type: "generic" })] });
    const r = await discoverContact({ domain: "x.nl", pages: [], priority: AUTO.priority, vocabulary: AUTO, hunter: hunter.h, prospect: "x.nl" });
    expect(r.hunter_candidates).toEqual([
      { domain: "x.nl", name: "Piet Bos", position: "Monteur", type: "personal", seniority: null, verdict: "NO_PRIORITY_TITLE" },
      { domain: "x.nl", name: null, position: null, type: "generic", seniority: null, verdict: "GENERIC_MAILBOX" },
    ]);
    expect(JSON.stringify(r.hunter_candidates)).not.toContain("piet@x.nl");
  });
});

/* ================================================================== */
describe("9. DataForSEO 40102 'No Search Results' is EMPTY, not ERROR", () => {
  const dfs = (status: number) => mockFetch(() => [200, { status_code: 20000, cost: 0.002, tasks: [{ status_code: status, status_message: status === 40102 ? "No Search Results." : "Invalid Field", cost: 0.002, result: null }] }]);
  it("returns no results and records 'empty'", async () => {
    const cost = new CostTracker("t", 1);
    const m = dfs(40102);
    const r = await new DataForSeoOrganicSearch({ login: "l", password: "p" }, cost, 1, m.fetch).search("site:hoornautoservice.nl (team)", "hoornautoservice.nl", { country: "Netherlands", language: "nl" });
    expect(r).toEqual([]);
    expect(cost.calls.at(-1)!.result).toBe("empty");
  });
  it("a real task error still throws and records 'error'", async () => {
    const cost = new CostTracker("t", 1);
    await expect(new DataForSeoOrganicSearch({ login: "l", password: "p" }, cost, 1, dfs(40501).fetch).search("x", "x.nl", { country: "Netherlands", language: "nl" })).rejects.toThrow(/40501/);
    expect(cost.calls.at(-1)!.result).toBe("error");
  });
  it("same-domain discovery records no error for an empty site: search", async () => {
    const r = await discoverContact({
      domain: "hoornautoservice.nl", pages: [page("https://www.hoornautoservice.nl/", "home", "<p>Welkom</p>")], priority: AUTO.priority, vocabulary: AUTO, hunter: stubHunter({}).h, prospect: "hoornautoservice.nl",
      sameDomain: { fetcher: memorySite({}).fetcher, homeUrl: "https://www.hoornautoservice.nl/", search: new DataForSeoOrganicSearch({ login: "l", password: "p" }, new CostTracker("t", 1), 1, dfs(40102).fetch), language: "nl", country: "Netherlands" },
    });
    expect(r.same_domain_discovery!.errors.filter((e) => /site search/.test(e))).toEqual([]);
  });
});

/* ================================================================== */
describe("10. Activity: actual skip reason", () => {
  const ev = (id: number, prospect: string): TimelineEvent => ({ id, type: "PROSPECT_DONE", actor: "worker", prospect_id: prospect, data: { outcome: "SKIPPED" }, created_at: `2026-10-07T13:4${id}:00Z` });
  it("names the reason per prospect and groups by reason", () => {
    const events = [ev(5, "a"), ev(4, "b"), ev(3, "c"), ev(2, "d")];
    const reasons = { a: ["WEBSITE_PLACEHOLDER"], b: ["WEBSITE_UNREACHABLE"], c: ["WEBSITE_UNREACHABLE"], d: ["FIT_SKIP: NICHE_MISMATCH: category does not match campaign niche"] };
    expect(buildActivity(events, undefined, undefined, reasons).map((r) => r.text)).toEqual([
      "Overgeslagen: website is een placeholder",
      "2 prospects overgeslagen: website niet bereikbaar",
      "Overgeslagen: geen fit",
    ]);
  });
  it("never claims 'geen fit' without evidence; unknown reasons stay neutral", () => {
    expect(buildActivity([ev(1, "x")]).map((r) => r.text)).toEqual(["Prospect overgeslagen"]);
    expect(skipReasonLabel(undefined)).toBeNull();
    expect(skipReasonLabel(["DUPLICATE_CONTACT: same address as prospect #2"])?.label).toBe("dubbel contactadres");
  });
});
