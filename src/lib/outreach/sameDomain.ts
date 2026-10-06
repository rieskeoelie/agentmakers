import { rootDomain } from "./domain";
import { parseHtml } from "./html";
import type { CostTracker } from "./cost";
import type { PublicSearchProvider } from "./providers/dataforseo";
import type { FetchedPage, PageFetcher } from "./research";

/**
 * Same-domain leadership/team page discovery (runs BEFORE the public Google/LinkedIn fallback, only when the
 * initially crawled pages contain no relevant decision maker).
 *
 * Candidate sources, in order:
 *   A. internal links already discovered on the fetched pages
 *   B/C. robots.txt "Sitemap:" references, else /sitemap.xml (one level of sitemap index followed)
 *   D. ONE DataForSEO organic search `site:<domain> (team OR medewerkers OR …)` — only if A–C yield nothing
 * Only URLs on the exact company (root) domain are ever fetched; every fetch goes through the PageFetcher
 * (SafePageFetcher in real mode = SSRF-safe, size/time/redirect limited). Hard caps:
 *   MAX_EXTRA_TEAM_PAGES HTML pages + MAX_DISCOVERY_FETCHES robots/sitemap requests per company.
 */
export const MAX_EXTRA_TEAM_PAGES = 3;
export const MAX_DISCOVERY_FETCHES = 3;

const KEYWORDS: Array<[RegExp, number]> = [
  [/team/, 6],
  [/medewerker/, 6],
  [/directie/, 6],
  [/management/, 5],
  [/organisatie/, 4],
  [/over-?ons/, 3],
  [/onze-?praktijk/, 3],
  [/praktijk/, 2],
];
const EXCLUDE = /(vacature|werken-bij|privacy|cookie|klacht|tarieven|prijzen|blog|nieuws|actueel|behandeling|huisregels|gegevens-wijzigen|inschrijven|afspraak|contact|spoed|\.(pdf|jpe?g|png|zip|docx?)$)/;

export function scoreTeamUrl(url: string, anchorText = ""): number {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return 0;
  }
  if (EXCLUDE.test(path)) return 0;
  const hay = `${path} ${anchorText.toLowerCase()}`;
  return KEYWORDS.reduce((s, [re, w]) => s + (re.test(hay) ? w : 0), 0);
}

const sameCompanyDomain = (url: string, domain: string) => {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && rootDomain(u.hostname) === rootDomain(domain);
  } catch {
    return false;
  }
};

const normUrl = (u: string) => {
  try {
    const x = new URL(u);
    x.hash = "";
    x.search = "";
    return x.toString().replace(/\/+$/, "");
  } catch {
    return u;
  }
};

export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
}

export interface SameDomainTrace {
  candidates: Array<{ url: string; score: number; source: "link" | "sitemap" | "site_search" }>;
  fetched: string[];
  discovery_fetches: string[];
  site_search_query: string | null;
  errors: string[];
}

export async function discoverTeamPages(input: {
  domain: string;
  homeUrl: string;
  pages: FetchedPage[];
  fetcher: PageFetcher;
  /** Called after each extra page; return true to stop (a decision maker was found). */
  found: (page: FetchedPage) => boolean;
  search?: PublicSearchProvider;
  country: string;
  language: "nl" | "en";
  prospect: string;
  cost?: CostTracker;
  maxTextChars?: number;
}): Promise<{ pages: FetchedPage[]; trace: SameDomainTrace }> {
  const trace: SameDomainTrace = { candidates: [], fetched: [], discovery_fetches: [], site_search_query: null, errors: [] };
  const already = new Set(input.pages.map((p) => normUrl(p.url)));
  const seen = new Set<string>(already);
  const add = (url: string, source: SameDomainTrace["candidates"][number]["source"], anchor = "") => {
    if (!sameCompanyDomain(url, input.domain)) return; // never leave the company domain
    const key = normUrl(url);
    if (seen.has(key)) return;
    const score = scoreTeamUrl(url, anchor);
    if (score <= 0) return;
    seen.add(key);
    // Fetch the URL as published (trailing slash kept); the normalised key is only for de-duplication.
    const clean = (() => { const x = new URL(url); x.hash = ""; return x.toString(); })();
    trace.candidates.push({ url: clean, score, source });
  };
  const record = (url: string, ok: boolean, detail?: string) =>
    input.cost?.record({ prospect: input.prospect, provider: "website", operation: "fetch_team_discovery", estimated_cost_eur: 0, actual_cost_eur: 0, native_cost: null, result: ok ? "ok" : "error", detail: `${url}${detail ? ` — ${detail}` : ""}` });

  // A. internal links already discovered
  for (const p of input.pages) for (const l of p.parsed.links) {
    try {
      add(new URL(l.href, p.url).toString(), "link", l.text);
    } catch {
      /* ignore malformed href */
    }
  }

  // B/C. robots.txt sitemap references, else /sitemap.xml
  if (input.fetcher.fetchResource) {
    const origin = new URL(input.homeUrl).origin;
    const getRes = async (url: string) => {
      if (trace.discovery_fetches.length >= MAX_DISCOVERY_FETCHES || !sameCompanyDomain(url, input.domain)) return null;
      trace.discovery_fetches.push(url);
      try {
        const r = await input.fetcher.fetchResource!(url);
        record(url, true);
        return r.body;
      } catch (e) {
        record(url, false, (e as Error).message);
        trace.errors.push(`${url}: ${(e as Error).message.slice(0, 120)}`);
        return null;
      }
    };
    const robots = await getRes(`${origin}/robots.txt`);
    const refs = robots ? [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!).filter((u) => sameCompanyDomain(u, input.domain)) : [];
    const queue = refs.length ? refs : [`${origin}/sitemap.xml`];
    for (const sm of queue) {
      const xml = await getRes(sm);
      if (!xml) continue;
      const locs = parseSitemapLocs(xml);
      if (/<sitemapindex/i.test(xml)) {
        // Follow one child sitemap, preferring page sitemaps.
        const child = locs.filter((u) => sameCompanyDomain(u, input.domain)).sort((a, b) => Number(/page/i.test(b)) - Number(/page/i.test(a)))[0];
        const childXml = child ? await getRes(child) : null;
        if (childXml) for (const u of parseSitemapLocs(childXml)) add(u, "sitemap");
      } else for (const u of locs) add(u, "sitemap");
      break;
    }
  }

  // D. one site-restricted search, only if nothing was found so far
  if (!trace.candidates.length && input.search) {
    const host = rootDomain(input.domain)!;
    const q = `site:${host} (team OR medewerkers OR praktijk OR over-ons OR organisatie OR management)`;
    trace.site_search_query = q;
    try {
      const results = await input.search.search(q, input.prospect, { country: input.country, language: input.language });
      for (const r of results) add(r.url, "site_search", r.title);
    } catch (e) {
      if ((e as Error).name === "BudgetExceededError") throw e;
      trace.errors.push(`site search: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  // Fetch the best ≤3 candidates (score desc, discovery order as tie-break), stop once a decision maker is found.
  const ordered = trace.candidates.map((c, i) => ({ ...c, i })).sort((a, b) => b.score - a.score || a.i - b.i);
  const pages: FetchedPage[] = [];
  for (const c of ordered) {
    if (trace.fetched.length >= MAX_EXTRA_TEAM_PAGES) break;
    trace.fetched.push(c.url);
    try {
      const r = await input.fetcher.fetch(c.url);
      if (!sameCompanyDomain(r.finalUrl, input.domain)) {
        record(c.url, false, `redirected off-domain to ${r.finalUrl}`);
        trace.errors.push(`${c.url}: redirected off company domain`);
        continue;
      }
      record(c.url, true);
      const page: FetchedPage = { url: r.finalUrl, kind: "team", fetched_at: r.fetchedAt, parsed: parseHtml(r.body, input.maxTextChars ?? 30_000) };
      pages.push(page);
      if (input.found(page)) break;
    } catch (e) {
      record(c.url, false, (e as Error).message);
      trace.errors.push(`${c.url}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  return { pages, trace };
}
