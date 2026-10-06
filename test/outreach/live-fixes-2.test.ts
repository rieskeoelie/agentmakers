import { describe, expect, it } from "vitest";
import { categoryDecision } from "../../src/lib/outreach/brain.js";
import { companyAliases, matchCompanyAlias } from "../../src/lib/outreach/companyName.js";
import { CampaignInputSchema, DEFAULT_ROLE_PRIORITY } from "../../src/lib/outreach/config.js";
import { discoverContact } from "../../src/lib/outreach/contacts.js";
import { geographyDecision } from "../../src/lib/outreach/geo.js";
import { parseHtml } from "../../src/lib/outreach/html.js";
import { prefilter } from "../../src/lib/outreach/pipeline.js";
import type { DiscoveredCompany, PublicSearchProvider, SearchResult } from "../../src/lib/outreach/providers/dataforseo.js";
import type { ContactProvider, DomainSearchResult, FinderResult, HunterContact } from "../../src/lib/outreach/providers/hunter.js";
import { evaluateResult } from "../../src/lib/outreach/publicSearch.js";
import { extractPeople, type FetchedPage, type PageFetcher } from "../../src/lib/outreach/research.js";
import { matchRole } from "../../src/lib/outreach/roles.js";
import { assertSafeUrl } from "../../src/lib/outreach/safeFetch.js";
import { MAX_EXTRA_TEAM_PAGES, scoreTeamUrl } from "../../src/lib/outreach/sameDomain.js";
import { fixtureBrain } from "./helpers.js";

const P = DEFAULT_ROLE_PRIORITY;
const isRole = (t: string) => matchRole(t, P) !== null;
const page = (url: string, kind: FetchedPage["kind"], html: string): FetchedPage => ({ url, kind, fetched_at: "t", parsed: parseHtml(html) });

/** In-memory site: path → body. Records every URL requested; enforces the same URL safety check as real mode. */
function memorySite(files: Record<string, string>) {
  const requested: string[] = [];
  const get = async (url: string) => {
    const u = assertSafeUrl(url);
    requested.push(url);
    if (/linkedin\.com$/i.test(u.hostname)) throw new Error("TEST VIOLATION: LinkedIn must never be fetched");
    const body = files[`${u.hostname.replace(/^www\./, "")}${u.pathname}`];
    if (body === undefined) throw new Error("HTTP 404");
    return { finalUrl: u.toString(), body, fetchedAt: "t" };
  };
  const fetcher: PageFetcher = { fetch: get, fetchResource: get };
  return { fetcher, requested };
}
function stubHunter(contacts: HunterContact[], finder: (f: string, l: string) => FinderResult | null = () => null) {
  const calls: string[] = [];
  const h: ContactProvider = {
    domainSearch: async (domain): Promise<DomainSearchResult> => ({ domain, organization: null, accept_all: false, contacts }),
    emailFinder: async (d, f, l) => { calls.push(`${d}:${f}|${l}`); return finder(f, l); },
    verify: async () => "valid",
  };
  return { h, calls };
}
const generic = (email: string): HunterContact => ({ email, type: "generic", confidence: 90, first_name: null, last_name: null, position: null, seniority: null, department: null, linkedin: null, verification_status: "valid" });
const noSearch = (): { provider: PublicSearchProvider; queries: string[] } => {
  const queries: string[] = [];
  return { provider: { search: async (q) => { queries.push(q); return []; } }, queries };
};

/* Reproduction of the real thcvandedem.nl /team/ markup (employee cards). */
const VAN_DEDEM_TEAM = `<html><body><h1 class="entry-title">Team</h1><p>Dit zijn de medewerkers uit onze praktijk.</p>
<section class="employee-wrap"><div class="employee"><div class="employee__heading"><h2><a href="https://www.thcvandedem.nl/medewerker/t-h-t-pham/">T.H.T. Pham</a></h2>
<p>Praktijkeigenaar / Tandarts</p></div><div class="employee__body"><p>Beschikbare dagen:</p><span>Di</span><span>Do</span>
<p>Relatie tot de praktijk: Eigenaar</p></div></div>
<div class="employee"><div class="employee__heading"><h2><a href="https://www.thcvandedem.nl/medewerker/romy/">Romy</a></h2><p>Office Manager</p></div></div></section></body></html>`;
const VAN_DEDEM_HOME = `<html><body><nav><a href="/contact/">Contact</a><a href="/afspraak/">Afspraak</a><a href="/de-praktijk/team/">Team</a></nav><p>Welkom bij Tandheelkundig Centrum Van Dedem.</p></body></html>`;

/* Reproduction of the real octantmondzorg.nl practice staff page markup. */
const OCTANT_BALFOORT = `<html><body><h1>Team - P.W. Balfoort</h1><p>Maak kennis met de medewerkers van Praktijk P.W. Balfoort.</p>
<h3>Peter Balfoort</h3><p>Tandarts</p><a href="#">Lees meer</a><p>Tandarts en praktijkhouder, is geboren in Amsterdam en ook afgestudeerd aan het Universiteit van Amsterdam in 1981.</p>
<h3>Manon Ketting</h3><p>Tandarts</p><a href="#">Lees meer</a><p>Mijn naam is Manon Ketting. Ik ben afgestudeerd aan het ACTA in 2013.</p></body></html>`;
const OCTANT_DE_BOER = `<html><body><h1>Team – Praktijk R. de Boer</h1><h3>Robert de Boer</h3><p>Tandarts</p><p>Big nr. 59036488902</p><a href="#">Lees meer</a>
<p>Robert is tandarts en praktijkhouder, is afgestudeerd aan de Acta in Amsterdam in 1991 en is sinds 2005 werkzaam binnen Octant Mondzorg.</p></body></html>`;

/* ================================================================== */
describe("1. SAME-DOMAIN DECISION-MAKER PAGE DISCOVERY", () => {
  it("Van Dedem: 'T.H.T. Pham' + 'Praktijkeigenaar / Tandarts' is extracted as a decision maker (initials name)", () => {
    const people = extractPeople([page("https://www.thcvandedem.nl/team/", "team", VAN_DEDEM_TEAM)], isRole);
    expect(people.map((p) => [p.full_name, p.title])).toEqual([["T.H.T. Pham", "Praktijkeigenaar / Tandarts"]]);
    expect(matchRole("Praktijkeigenaar / Tandarts", P)?.matched_role).toBe("practice owner");
    // "Romy" has no surname → not a full name → not promoted (cannot be passed to Email Finder either)
    expect(people.some((p) => p.full_name === "Romy")).toBe(false);
  });

  it("Van Dedem: /team/ found via an internal link that the initial crawl did not fetch → Pham accepted → Email Finder", async () => {
    const site = memorySite({ "thcvandedem.nl/de-praktijk/team/": VAN_DEDEM_TEAM });
    const s = noSearch();
    const hunter = stubHunter([generic("info@thcvandedem.nl")]);
    const r = await discoverContact({
      domain: "thcvandedem.nl", pages: [page("https://www.thcvandedem.nl/", "home", VAN_DEDEM_HOME)], priority: P, hunter: hunter.h, prospect: "thcvandedem.nl",
      sameDomain: { fetcher: site.fetcher, homeUrl: "https://www.thcvandedem.nl/", search: s.provider, language: "nl", country: "Netherlands" },
      publicSearch: { provider: s.provider, companyName: "Tandheelkundig Centrum Van Dedem", city: "Hoorn", language: "nl", country: "Netherlands" },
    });
    expect(r).toMatchObject({ name: "T.H.T. Pham", title: "Praktijkeigenaar / Tandarts", title_source_url: "https://www.thcvandedem.nl/de-praktijk/team/" });
    expect(r.failure_reason).toBe("DECISION_MAKER_EMAIL_NOT_FOUND"); // person identified; this stub finder returns nothing
    expect(hunter.calls).toEqual(["thcvandedem.nl:T.H.T.|Pham"]);
    expect(r.same_domain_discovery!.fetched).toEqual(["https://www.thcvandedem.nl/de-praktijk/team/"]);
    expect(s.queries).toHaveLength(0); // found on the company's own site → no Google/LinkedIn fallback
  });

  it("availability rows ('Di Do Vr', 'Ma Di Wo Do Vr') are never taken as names (live false positive)", () => {
    const html = VAN_DEDEM_TEAM.replace("<span>Di</span><span>Do</span>", "<p>Di Do Vr</p>") + "<h2>Sybrant Kooy</h2><p>Office Manager</p><p>Ma Di Wo Do Vr</p><p>Office Manager</p>";
    const people = extractPeople([page("https://www.thcvandedem.nl/team/", "team", html)], isRole).map((p) => p.full_name);
    expect(people).toEqual(["T.H.T. Pham", "Sybrant Kooy"]);
  });

  it("Octant: profile-card bio 'Tandarts en praktijkhouder, …' and '<Name> is tandarts en praktijkhouder' are explicit titles", () => {
    expect(extractPeople([page("https://www.octantmondzorg.nl/x/", "team", OCTANT_BALFOORT)], isRole).map((p) => [p.full_name, p.title])).toEqual([["Peter Balfoort", "Tandarts en praktijkhouder"]]);
    expect(extractPeople([page("https://www.octantmondzorg.nl/y/", "team", OCTANT_DE_BOER)], isRole).map((p) => [p.full_name, p.title])).toEqual([["Robert de Boer", "tandarts en praktijkhouder"]]);
  });

  it("Octant: team pages discovered via robots.txt → sitemap index → page sitemap; stops at the first decision maker", async () => {
    const site = memorySite({
      "octantmondzorg.nl/robots.txt": "User-agent: *\nDisallow:\n\nSitemap: https://www.octantmondzorg.nl/sitemap_index.xml\n",
      "octantmondzorg.nl/sitemap_index.xml": `<sitemapindex><sitemap><loc>https://www.octantmondzorg.nl/page-sitemap.xml</loc></sitemap></sitemapindex>`,
      "octantmondzorg.nl/page-sitemap.xml": `<urlset>${["/", "/afspraken/", "/tandheelkunde/tarieven/", "/octant-mondzorg/vacatures/", "/praktijk-p-w-balfoort/medewerkers-praktijk-balfoort/", "/tandarts-zwaag/", "https://evil.example.com/team/"]
        .map((u) => `<url><loc>${u.startsWith("http") ? u : `https://www.octantmondzorg.nl${u}`}</loc></url>`).join("")}</urlset>`,
      "octantmondzorg.nl/praktijk-p-w-balfoort/medewerkers-praktijk-balfoort/": OCTANT_BALFOORT,
    });
    const s = noSearch();
    const r = await discoverContact({
      domain: "octantmondzorg.nl", pages: [page("https://www.octantmondzorg.nl/", "home", "<p>Octant Mondzorg</p>")], priority: P, hunter: stubHunter([generic("receptie@octantmondzorg.nl")]).h, prospect: "octantmondzorg.nl",
      sameDomain: { fetcher: site.fetcher, homeUrl: "https://www.octantmondzorg.nl/", search: s.provider, language: "nl", country: "Netherlands" },
    });
    expect(r).toMatchObject({ name: "Peter Balfoort", title: "Tandarts en praktijkhouder" });
    expect(r.same_domain_discovery!.candidates.map((c) => c.url)).toEqual(["https://www.octantmondzorg.nl/praktijk-p-w-balfoort/medewerkers-praktijk-balfoort/"]); // off-domain + irrelevant pages dropped
    expect(site.requested.some((u) => u.includes("evil.example.com"))).toBe(false);
    expect(s.queries).toHaveLength(0); // sitemap sufficed → no paid site: search
  });

  it("falls back to ONE site:<domain> search only when links + sitemap yield nothing, and fetches only exact-domain results", async () => {
    const site = memorySite({ "thcvandedem.nl/over-ons/team/": VAN_DEDEM_TEAM });
    const queries: string[] = [];
    const search: PublicSearchProvider = {
      search: async (q) => {
        queries.push(q);
        const res: SearchResult[] = [
          { title: "Team", url: "https://www.thcvandedem.nl/over-ons/team/", domain: "www.thcvandedem.nl", snippet: "" },
          { title: "Team van een andere praktijk", url: "https://andere-praktijk.nl/team/", domain: "andere-praktijk.nl", snippet: "" },
          { title: "T.H.T. Pham | LinkedIn", url: "https://nl.linkedin.com/in/tht-pham", domain: "nl.linkedin.com", snippet: "" },
        ];
        return q.startsWith("site:thcvandedem.nl") ? res : [];
      },
    };
    const r = await discoverContact({
      domain: "thcvandedem.nl", pages: [page("https://www.thcvandedem.nl/", "home", "<p>Welkom</p>")], priority: P, hunter: stubHunter([]).h, prospect: "thcvandedem.nl",
      sameDomain: { fetcher: site.fetcher, homeUrl: "https://www.thcvandedem.nl/", search, language: "nl", country: "Netherlands" },
    });
    expect(queries[0]).toBe("site:thcvandedem.nl (team OR medewerkers OR praktijk OR over-ons OR organisatie OR management)");
    expect(queries.filter((q) => q.startsWith("site:thcvandedem.nl"))).toHaveLength(1);
    expect(r.name).toBe("T.H.T. Pham");
    expect(site.requested.filter((u) => !/robots|sitemap/.test(u))).toEqual(["https://www.thcvandedem.nl/over-ons/team/"]);
  });

  it(`enforces the extra-page budget (max ${MAX_EXTRA_TEAM_PAGES} per company)`, async () => {
    const links = Array.from({ length: 10 }, (_, i) => `<a href="/team-${i}/">Team ${i}</a>`).join("");
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`x.nl/team-${i}/`] = "<p>Niemand met een leidinggevende titel.</p>";
    const site = memorySite(files);
    const r = await discoverContact({
      domain: "x.nl", pages: [page("https://x.nl/", "home", `<nav>${links}</nav>`)], priority: P, hunter: stubHunter([]).h, prospect: "x.nl",
      sameDomain: { fetcher: site.fetcher, homeUrl: "https://x.nl/", language: "nl", country: "Netherlands" },
    });
    expect(MAX_EXTRA_TEAM_PAGES).toBe(3);
    expect(r.same_domain_discovery!.candidates.length).toBe(10);
    expect(r.same_domain_discovery!.fetched).toHaveLength(3);
    expect(site.requested.filter((u) => /team-/.test(u))).toHaveLength(3);
    expect(r.failure_reason).toBe("CONTACT_NOT_FOUND");
  });

  it("URL scoring prioritises leadership/team pages and ignores irrelevant ones", () => {
    expect(scoreTeamUrl("https://x.nl/ons-team/")).toBeGreaterThan(scoreTeamUrl("https://x.nl/over-ons/"));
    expect(scoreTeamUrl("https://x.nl/medewerkers-praktijk-balfoort/")).toBeGreaterThan(scoreTeamUrl("https://x.nl/ons-team/"));
    for (const u of ["https://x.nl/vacatures/team/", "https://x.nl/privacy/", "https://x.nl/tarieven/", "https://x.nl/tandarts-zwaag/"]) expect(scoreTeamUrl(u), u).toBe(0);
  });

  it("LinkedIn pages are still never fetched (public search stays metadata-only)", async () => {
    const site = memorySite({});
    const search: PublicSearchProvider = { search: async () => [{ title: "Peter W. Balfoort - Octant Mondzorg | LinkedIn", url: "https://nl.linkedin.com/in/peter-w-balfoort-81178529", domain: "nl.linkedin.com", snippet: "Dentist co-owner · Octant Mondzorg" }] };
    const r = await discoverContact({
      domain: "octantmondzorg.nl", pages: [page("https://www.octantmondzorg.nl/", "home", "<p>Octant</p>")], priority: P, hunter: stubHunter([]).h, prospect: "octantmondzorg.nl",
      sameDomain: { fetcher: site.fetcher, homeUrl: "https://www.octantmondzorg.nl/", search, language: "nl", country: "Netherlands" },
      publicSearch: { provider: search, companyName: "Octant Mondzorg Hoorn: Tandarts & Orthodontie", city: "Hoorn", language: "nl", country: "Netherlands" },
    });
    expect(site.requested.some((u) => /linkedin/i.test(u))).toBe(false);
    expect(r.name).toBe("Peter W. Balfoort");
    expect(r.linkedin).toBe("https://nl.linkedin.com/in/peter-w-balfoort-81178529");
  });
});

/* ================================================================== */
describe("2. COMPANY ASSOCIATION MATCHING", () => {
  const OCTANT = { name: "Octant Mondzorg Hoorn: Tandarts & Orthodontie", domain: "octantmondzorg.nl", city: "Hoorn" };

  it("normalises names into distinctive aliases", () => {
    expect(companyAliases(OCTANT.name, "Hoorn").aliases).toEqual(["octant mondzorg"]);
    expect(companyAliases("Tandheelkundig Centrum Van Dedem B.V.", "Hoorn").aliases).toEqual(["tandheelkundig centrum van dedem", "van dedem"]);
    expect(companyAliases("Tandartspraktijk Dentalways Den Hoorn", "Den Hoorn").aliases).toEqual(["tandartspraktijk dentalways"]);
    expect(companyAliases("Praktijk voor Parodontologie en Implantologie te Hoorn B.V.", "Hoorn").aliases).toEqual([]); // fully generic
    expect(companyAliases("Tandartspraktijk Hoorn", "Hoorn").aliases).toEqual([]);
    expect(companyAliases("Mondzorg Hoorn", "Hoorn").aliases).toEqual([]);
    expect(companyAliases("Dental Clinics Hoorn", "Hoorn").aliases).toEqual([]);
  });

  it("Octant: 'Octant Mondzorg Hoorn: Tandarts & Orthodontie' matches the public result company reference 'Octant Mondzorg'", () => {
    const r = evaluateResult({ title: "Peter W. Balfoort - Octant Mondzorg | LinkedIn", url: "https://nl.linkedin.com/in/peter-w-balfoort-81178529", domain: "nl.linkedin.com", snippet: "Dentist co-owner · Ervaring: Octant Mondzorg · Locatie: Hoorn" }, OCTANT, P);
    expect(r.candidate).toMatchObject({ full_name: "Peter W. Balfoort", first_name: "Peter", last_name: "W. Balfoort", title: "Dentist co-owner", association: "company_name_in_title", confidence: "high" });
    expect(matchCompanyAlias("Praktijkmanager bij Octant Mondzorg Hoorn.", companyAliases(OCTANT.name, "Hoorn")).matched).toBe(true);
  });

  it("the company name itself is never taken as the person's name (live bug: name='Octant Mondzorg')", () => {
    const r = evaluateResult({ title: "Octant Mondzorg - Dentist co-owner", url: "https://example.org/x", domain: "example.org", snippet: "" }, OCTANT, P);
    expect(r.candidate).toBeNull();
  });

  it.each([
    ["Octant Mondzorg Purmerend", "different location appended"],
    ["Nova Octant Mondzorg", "different name prepended"],
    ["Octant Advies", "only the single brand token"],
    ["Octant", "single brand token alone"],
    ["Mondzorg Hoorn Noord", "generic words only"],
  ])("does NOT associate a similarly named company: %s (%s)", (company) => {
    const r = evaluateResult({ title: `Jan Jansen - Praktijkhouder - ${company} | LinkedIn`, url: "https://nl.linkedin.com/in/jan", domain: "nl.linkedin.com", snippet: "" }, OCTANT, P);
    expect(r.candidate).toBeNull();
  });

  it("generic/ambiguous company names never associate by name — only by the exact company domain", () => {
    for (const [name, city] of [["Tandartspraktijk Hoorn", "Hoorn"], ["Mondzorg Hoorn", "Hoorn"], ["Dental Clinics Hoorn", "Hoorn"]] as const) {
      const company = { name, domain: "voorbeeld-praktijk.nl", city };
      expect(evaluateResult({ title: `Jan Jansen - Eigenaar - ${name} | LinkedIn`, url: "https://nl.linkedin.com/in/jan", domain: "nl.linkedin.com", snippet: `Eigenaar van ${name}` }, company, P).candidate, name).toBeNull();
      expect(evaluateResult({ title: "Ons team", url: "https://www.voorbeeld-praktijk.nl/team", domain: "www.voorbeeld-praktijk.nl", snippet: "Jan Jansen, praktijkhouder." }, company, P).candidate?.association).toBe("company_domain_result");
    }
  });

  it("other live rejections stay rejected (different company or no company reference)", () => {
    expect(evaluateResult({ title: "Hielke de Boer - Tandarts / eigenaar Nova Mondzorg | LinkedIn", url: "https://nl.linkedin.com/in/hielkedeboer", domain: "nl.linkedin.com", snippet: "" }, OCTANT, P).candidate).toBeNull();
    expect(evaluateResult({ title: "Nuaas Aziz - Tandarts en praktijkhouder | LinkedIn", url: "https://nl.linkedin.com/in/nuaasaziz", domain: "nl.linkedin.com", snippet: "" }, OCTANT, P).candidate).toBeNull();
  });
});

/* ================================================================== */
describe("3. DENTAL PREFILTER REGRESSION + GEOGRAPHY", async () => {
  // Exact keyword list the live Campaign Brain produced.
  const KW = ["tandarts", "tandartspraktijk", "tandheelkunde", "mondzorg", "orthodontist", "implantoloog", "mondhygiënist", "dentist", "dental clinic", "dental practice", "kaakchirurg", "tandartsen", "orthodontie", "dental"];
  const brain = { ...(await fixtureBrain()), category_keywords: KW, niche: "Tandartspraktijken" };
  const campaign = CampaignInputSchema.parse({ niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: "https://www.agentmakers.io/nl/tandartspraktijken", limit: 5 });
  // Exact provider data observed live (DataForSEO Maps, 2026-10-06).
  const co = (o: Partial<DiscoveredCompany>): DiscoveredCompany => ({
    provider_id: "x", company_name: "X", category: null, additional_categories: [], website: "https://x.nl/", domain: "x.nl", phone: null, address: null, city: null,
    region: null, country: "NL", rating: null, review_count: null, book_online_url: null, closed_signal: null, raw_reference: { provider: "dataforseo", endpoint: "x", rank: 1, place_id: null, cid: null }, ...o,
  });
  const denticien = co({ company_name: "Denticien Hoorn", domain: "denticien.nl", category: "Gebitsprothesecentrum", additional_categories: ["Tandtechnisch laboratorium", "Winkel voor tandheelkundige benodigdheden"], address: "Blauwe Berg 7-B, 1625 NT Hoorn", city: "Hoorn" });
  const dentalways = co({ company_name: "Tandartspraktijk Dentalways Den Hoorn", domain: "tandartsdelftdentalways.nl", category: "Tandarts", additional_categories: ["Cosmetische tandarts", "mondhygiënist", "Tandtechnisch laboratorium", "Tandheelkundige radiologie", "Tandartspraktijk", "Tandarts voor noodgevallen", "Kindertandarts", "Tandenbleekservice"], address: "Kon. Julianaplein 5a, 2635 HD Den Hoorn", city: "Den Hoorn" });
  const vanDedem = co({ company_name: "Tandheelkundig Centrum Van Dedem", domain: "thcvandedem.nl", category: "Tandarts", address: "Van Dedemstraat 6A, 1624 NN Hoorn", city: "Hoorn" });
  const hofmann = co({ company_name: "André Hofmann Tandtechniek", domain: "andrehofmann.nl", category: "Tandtechnisch laboratorium", additional_categories: ["Cosmetische tandarts"], city: "Hoorn" });
  const elysee = co({ company_name: "Elysee Dental Service Lab Hoorn", domain: "elysee-dental.nl", category: "Diagnosecentrum", additional_categories: ["Tandtechnisch laboratorium"], city: "Hoorn" });

  it("root cause reproduced: Gebitsprothesecentrum passes even though additional categories list a lab and a supply store", () => {
    expect(categoryDecision("Gebitsprothesecentrum", [], "Denticien Hoorn", KW, "Tandartspraktijken").match).toBe(true);
    expect(categoryDecision(denticien.category, denticien.additional_categories, denticien.company_name, KW, "Tandartspraktijken")).toEqual({ match: true, reason: "primary category matches" });
  });
  it('category "Tandarts" passes (also with a lab among its additional categories)', () => {
    expect(categoryDecision("Tandarts", [], "Tandheelkundig Centrum Van Dedem", KW, "Tandartspraktijken").match).toBe(true);
    expect(categoryDecision(dentalways.category, dentalways.additional_categories, dentalways.company_name, KW, "Tandartspraktijken").match).toBe(true);
  });
  it("labs / non-practice primary categories are still rejected", () => {
    expect(categoryDecision(hofmann.category, hofmann.additional_categories, hofmann.company_name, KW, "Tandartspraktijken").match).toBe(false);
    expect(categoryDecision(elysee.category, elysee.additional_categories, elysee.company_name, KW, "Tandartspraktijken").match).toBe(false);
  });
  it("Hoorn (NL) passes the geographic filter", () => {
    expect(geographyDecision(vanDedem, { region: "Hoorn", country: "Netherlands" }).match).toBe(true);
    expect(geographyDecision(vanDedem, { region: "Hoorn, Noord-Holland", country: "Netherlands" }).match).toBe(true);
    expect(geographyDecision({ ...vanDedem, city: null }, { region: "Hoorn", country: "Netherlands" }).match).toBe(true); // parsed from address
  });
  it("Den Hoorn (Zuid-Holland) fails; missing locality is not guessed", () => {
    expect(geographyDecision(dentalways, { region: "Hoorn", country: "Netherlands" })).toEqual({ match: false, reason: "locality Den Hoorn ≠ Hoorn" });
    expect(geographyDecision({ ...dentalways, city: null, address: null }, { region: "Hoorn", country: "Netherlands" }).match).toBeNull();
    expect(geographyDecision({ ...vanDedem, country: "IT" }, { region: "Hoorn", country: "Netherlands" }).match).toBe(false);
  });
  it("prefilter classifies the live cases correctly (geography reported as PREFILTER_GEOGRAPHY_MISMATCH, not CATEGORY_MISMATCH)", () => {
    const { kept, rejected } = prefilter([denticien, dentalways, vanDedem, hofmann], campaign, brain);
    expect(kept.map((k) => k.company_name)).toEqual(["Denticien Hoorn", "Tandheelkundig Centrum Van Dedem"]);
    const dw = rejected.find((r) => r.company_name === dentalways.company_name)!;
    expect(dw.reason.split(":")[0]).toBe("PREFILTER_GEOGRAPHY_MISMATCH");
    expect(dw.reason).not.toMatch(/CATEGORY_MISMATCH/);
    expect(rejected.find((r) => r.company_name === hofmann.company_name)!.reason).toMatch(/^CATEGORY_MISMATCH:Tandtechnisch laboratorium \(non-practice (name|primary category)/);
  });
});
