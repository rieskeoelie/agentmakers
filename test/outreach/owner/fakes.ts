import { CostTracker, BudgetExceededError } from "../../../src/lib/outreach/cost.js";
import type { PipelineDeps } from "../../../src/lib/outreach/pipeline.js";
import type { CompanyDiscoveryProvider, DiscoveredCompany } from "../../../src/lib/outreach/providers/dataforseo.js";
import type { ContactProvider, FinderResult, HunterContact } from "../../../src/lib/outreach/providers/hunter.js";
import type { PageFetcher } from "../../../src/lib/outreach/research.js";

/** Zero-network fakes for Owner Discovery tests. */

export const hc = (email: string, o: Partial<HunterContact> = {}): HunterContact => ({
  email, type: "personal", confidence: 92, first_name: null, last_name: null, position: null, seniority: null, department: null, linkedin: null, verification_status: "valid", ...o,
});

export function stubHunter(byDomain: Record<string, HunterContact[]>, finder: (d: string, f: string, l: string) => FinderResult | null = () => null) {
  const calls: string[] = [];
  const h: ContactProvider = {
    domainSearch: async (domain) => { calls.push(`ds:${domain}`); return { domain, organization: null, accept_all: false, contacts: byDomain[domain] ?? [] }; },
    emailFinder: async (d, f, l) => { calls.push(`ef:${d}:${f}|${l}`); return finder(d, f, l); },
    verify: async (email) => { calls.push(`v:${email}`); return "valid"; },
  };
  return { h, calls };
}

/** In-memory website: "host/path" → html. */
export function memorySite(files: Record<string, string>) {
  const requested: string[] = [];
  const get = async (url: string) => {
    requested.push(url);
    const u = new URL(url);
    const body = files[`${u.hostname}${u.pathname}`];
    if (body === undefined) throw new Error("HTTP 404");
    return { finalUrl: u.toString(), body, fetchedAt: "t" };
  };
  const fetcher: PageFetcher = { fetch: get, fetchResource: get };
  return { fetcher, requested };
}

export const company = (o: Partial<DiscoveredCompany> & { company_name: string; domain: string | null }): DiscoveredCompany => ({
  provider_id: `${o.company_name}`, category: null, additional_categories: [], website: o.domain ? `https://${o.domain}/` : null, phone: null,
  address: "Dorpsstraat 1", city: "Hoorn", region: null, country: "NL", rating: 4.6, review_count: 25, book_online_url: null, closed_signal: null,
  raw_reference: { provider: "dataforseo", endpoint: "fixture", rank: 1, place_id: null, cid: null }, ...o,
});

/** Discovery fake: answers per query keyword; records every query (an empty niche throws). */
export function stubDiscovery(answer: (niche: string, region: string | undefined) => DiscoveredCompany[] | "BUDGET") {
  const queries: Array<{ niche: string; region?: string; country: string }> = [];
  const p: CompanyDiscoveryProvider = {
    discover: async (q) => {
      if (!q.niche || !q.niche.trim()) throw new Error("EMPTY_QUERY");
      queries.push({ niche: q.niche, region: q.region, country: q.country });
      const a = answer(q.niche, q.region);
      if (a === "BUDGET") throw new BudgetExceededError(0.01, 0);
      return a;
    },
  };
  return { p, queries };
}

const html = (title: string, body: string, links: string[] = []) =>
  `<html><head><title>${title}</title></head><body><h1>${title}</h1>${links.map((l) => `<a href="${l}">${l.replace("/", "")}</a>`).join(" ")}${body}</body></html>`;

/** Seven companies covering every owner outcome (+ a chain listed under two names). */
export const SCENARIO = {
  companies: [
    company({ company_name: "Schildersbedrijf Jansen", domain: "schilderjansen.nl", category: "Schilder" }),
    company({ company_name: "Bouwbedrijf De Boer", domain: "bouwdeboer.nl", category: "Aannemer" }),
    company({ company_name: "Hoveniersbedrijf Bakker", domain: "hovenierbakker.nl", category: "Hovenier" }),
    company({ company_name: "Installatiebedrijf Vos", domain: "installatievos.nl", category: "Installateur" }),
    company({ company_name: "Loodgieter Hendriks", domain: "loodgieterhendriks.nl", category: "Loodgieter" }),
    company({ company_name: "Garage Smit", domain: "autoservicepunt.nl", category: "Garage" }),
    company({ company_name: "Kapsalon Knip Hoorn", domain: "knipketen.nl", category: "Kapper" }),
    company({ company_name: "Kapsalon Knip Alkmaar", domain: "knipketen.nl", category: "Kapper" }),
  ],
  site: {
    "schilderjansen.nl/": html("Schildersbedrijf Jansen", "<p>Vakkundig schilderwerk.</p>", ["/over-ons"]),
    "schilderjansen.nl/over-ons": html("Over ons", "<div><h3>Jan Jansen</h3><p>Eigenaar</p></div><p>Schildersbedrijf Jansen sinds 1998.</p>"),
    "bouwdeboer.nl/": html("Bouwbedrijf De Boer", "<p>Nieuwbouw en verbouw.</p>", ["/team"]),
    "bouwdeboer.nl/team": html("Team", "<div><h3>Piet de Boer</h3><p>Directeur</p></div>"),
    "hovenierbakker.nl/": html("Hoveniersbedrijf Bakker", "<p>Tuinaanleg.</p>", ["/over-ons"]),
    "hovenierbakker.nl/over-ons": html("Over ons", "<div><h3>Kees Bakker</h3><p>Eigenaar</p></div>"),
    "installatievos.nl/": html("Installatiebedrijf Vos", "<p>CV en sanitair. Mail info@installatievos.nl</p>"),
    "loodgieterhendriks.nl/": html("Loodgieter Hendriks", "<p>Lekkage? Wij komen snel.</p>"),
    "autoservicepunt.nl/": html("Autoservice Punt", "<p>APK en onderhoud.</p>"),
    "knipketen.nl/": html("Knip", "<p>Kapsalons in heel Noord-Holland.</p>"),
  } as Record<string, string>,
  hunter: {
    "schilderjansen.nl": [hc("jan@schilderjansen.nl", { first_name: "Jan", last_name: "Jansen" })],
    "bouwdeboer.nl": [hc("piet@bouwdeboer.nl", { first_name: "Piet", last_name: "de Boer" })],
    "installatievos.nl": [hc("info@installatievos.nl", { type: "generic" })],
    "loodgieterhendriks.nl": [hc("henk@loodgieterhendriks.nl", { first_name: "Henk", last_name: "Hendriks", position: "Eigenaar" })],
  } as Record<string, HunterContact[]>,
};

export function pipelineDeps(o: { site?: Record<string, string>; hunter?: Record<string, HunterContact[]>; finder?: (d: string, f: string, l: string) => FinderResult | null; budget?: number } = {}) {
  const cost = new CostTracker("owner-test", o.budget ?? 5);
  const site = memorySite(o.site ?? SCENARIO.site);
  const hunter = stubHunter(o.hunter ?? SCENARIO.hunter, o.finder);
  const deps = { hunter: hunter.h, websiteFetcher: site.fetcher, cost, settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 1 } } as unknown as PipelineDeps;
  return { deps, cost, hunter, site };
}
