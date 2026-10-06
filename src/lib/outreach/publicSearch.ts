import { rootDomain } from "./domain";
import type { PublicSearchProvider, SearchResult } from "./providers/dataforseo";
import { isPersonName, sanitizeSnippet, splitName, looksLikeInjection } from "./research";
import { matchRole, type RoleMatch } from "./roles";
import { companyAliases, fold as foldName, matchCompanyAlias, strongNameAliases } from "./companyName";

/** Recover the original-cased words of an alias from the company name (for readable queries). */
function aliasDisplay(companyName: string, alias: string): string {
  const words = companyName.split(/\s+/);
  const n = alias.split(" ").length;
  for (let i = 0; i + n <= words.length; i++) {
    const w = words.slice(i, i + n);
    if (w.map((x) => foldName(x).replace(/[^a-z0-9&']/g, "")).join(" ") === alias) return w.join(" ").replace(/[:,]$/, "");
  }
  return alias;
}

/**
 * Public decision-maker search fallback (runs only after Hunter Domain Search AND website person discovery
 * found no relevant named person). Uses search-result METADATA only (title / snippet / URL). It never fetches
 * a result page — in particular, LinkedIn pages are never requested, scraped or logged into.
 *
 * A person is accepted only with STRONG evidence in ONE result:
 *   full name (2+ capitalised tokens) + campaign-priority role (same rules as Hunter/website ranking)
 *   + association with the exact company (company name phrase or company domain in that same result).
 * Anything weaker is recorded as rejected and the prospect stays CONTACT_NOT_FOUND.
 */

export const MAX_PUBLIC_SEARCHES = 2;

export interface PublicSearchCandidate {
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  role_match: RoleMatch;
  result_url: string;
  evidence: string;
  confidence: "high" | "medium";
  association: "company_domain_result" | "company_name_in_title" | "company_name_in_snippet" | "company_domain_in_text";
  discovery_source: "public_search";
  is_linkedin_result: boolean;
}

export interface PublicSearchReport {
  queries: string[];
  results_seen: number;
  selected: PublicSearchCandidate | null;
  rejected: Array<{ result_url: string; reason: string; name?: string; title?: string }>;
  errors: string[];
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Octant Mondzorg Hoorn: Tandarts & Orthodontie" → "Octant Mondzorg Hoorn" (the part before a tagline separator). */
export function coreCompanyName(name: string): string {
  return name.split(/\s+[|–—-]\s+|:\s+/)[0]!.replace(/\b(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?)\s*$/i, "").trim();
}

export function buildQueries(companyName: string, language: "nl" | "en", city: string | null = null): string[] {
  // Search for the normalised alias ("Octant Mondzorg"), not the Maps title with city/tagline; generic names keep the core name.
  const alias = companyAliases(companyName, city).aliases[0];
  const n = (alias ? aliasDisplay(companyName, alias) : coreCompanyName(companyName)).replace(/"/g, "");
  const roles = language === "nl"
    ? "(eigenaar OR praktijkhouder OR praktijkeigenaar OR directeur OR praktijkmanager OR vestigingsmanager)"
    : "(owner OR founder OR partner OR \"managing director\" OR \"practice manager\" OR \"clinic manager\")";
  const liRoles = language === "nl" ? "(praktijkmanager OR eigenaar OR praktijkhouder OR directeur)" : "(\"practice manager\" OR owner OR director)";
  return [`"${n}" ${roles}`, `site:linkedin.com/in "${n}" ${liRoles}`].slice(0, MAX_PUBLIC_SEARCHES);
}

function isLinkedInProfile(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)linkedin\.com$/i.test(u.hostname) && u.pathname.startsWith("/in/");
  } catch {
    return false;
  }
}

/** Split title/snippet into small fragments; pair (name, role) from the same or adjacent fragments. */
function nameRolePairs(text: string, priority: string[]): Array<{ name: string; title: string; match: RoleMatch }> {
  const out: Array<{ name: string; title: string; match: RoleMatch }> = [];
  const frags = text
    .split(/\s+[|–—-]\s+|\s*[·•]\s*|,\s+|:\s+|\.\s+|\s+(?:is|was|als|as)\s+(?:de\s+|the\s+|onze\s+|our\s+)?|\s+(?:bij|at)\s+(?=[A-Z])|\s*[()]\s*/)
    .map((f) => f.trim())
    .filter(Boolean);
  for (let i = 0; i < frags.length; i++) {
    const f = frags[i]!;
    const m = matchRole(f, priority);
    if (!m || f.length > 80) continue;
    for (const j of [i - 1, i + 1]) {
      const n = frags[j];
      if (n && isPersonName(n)) {
        out.push({ name: n.replace(/^(dr|drs|mr|ir|ing|prof)\.?\s+/i, ""), title: f, match: m });
        break;
      }
    }
  }
  return out;
}

export function evaluateResult(
  r: SearchResult,
  company: { name: string; domain: string; city: string | null },
  priority: string[],
): { candidate: PublicSearchCandidate | null; reason?: string; name?: string; title?: string } {
  const text = `${r.title} — ${r.snippet}`;
  if (looksLikeInjection(text)) return { candidate: null, reason: "INSTRUCTION_LIKE_TEXT_IGNORED" };
  const ca = companyAliases(company.name, company.city, company.domain);
  const isCompanyName = (n: string) => ca.aliases.includes(foldName(n).replace(/[^a-z0-9&' ]/g, "").replace(/\s+/g, " ").trim());

  // Person + role. LinkedIn profile titles follow "<Name> - <headline/company> | LinkedIn": the first segment is the person.
  let best: { name: string; title: string; match: RoleMatch } | undefined;
  if (isLinkedInProfile(r.url)) {
    const segs = r.title.replace(/\s*\|\s*LinkedIn.*$/i, "").split(/\s+[-–—|]\s+/).map((x) => x.trim()).filter(Boolean);
    const person = segs[0];
    if (person && isPersonName(person) && !isCompanyName(person)) {
      const frags = [...segs.slice(1), ...r.snippet.split(/\s*[·•|]\s*|\.\s+|;\s*|\s+-\s+/)].map((x) => x.trim()).filter((x) => x && x.length <= 80);
      for (const fr of frags) {
        const m = matchRole(fr, priority);
        if (m && (!best || m.rank < best.match.rank)) best = { name: person.replace(/^(dr|drs|mr|ir|ing|prof)\.?\s+/i, ""), title: fr, match: m };
      }
    }
  }
  if (!best) {
    const pairs = nameRolePairs(r.title, priority).concat(nameRolePairs(r.snippet, priority)).filter((p) => !isCompanyName(p.name));
    best = pairs.sort((a, b) => a.match.rank - b.match.rank)[0];
  }
  if (!best) return { candidate: null, reason: "NO_NAMED_PERSON_WITH_DECISION_MAKER_ROLE" };

  // Association with the exact company — inside this same result.
  const companyRoot = rootDomain(company.domain);
  const resultRoot = rootDomain(r.url) ?? rootDomain(r.domain);
  const domainIn = (hay: string) => !!companyRoot && new RegExp(`(^|[^a-z0-9.-])${companyRoot.replace(/\./g, "\\.")}($|[^a-z0-9-])`).test(foldName(hay));
  let association: PublicSearchCandidate["association"] | null = null;
  let ambiguous: string | undefined;
  if (companyRoot && resultRoot === companyRoot) association = "company_domain_result";
  else {
    // Off-domain result: name-based association only via DISTINCTIVE aliases (or the compact domain brand).
    const caOff = { ...ca, aliases: strongNameAliases(ca, company.domain) };
    const inTitle = matchCompanyAlias(r.title, caOff);
    const inSnippet = matchCompanyAlias(r.snippet, caOff);
    if (inTitle.matched) association = "company_name_in_title";
    else if (domainIn(r.title) || domainIn(r.snippet)) association = "company_domain_in_text";
    else if (inSnippet.matched) association = "company_name_in_snippet";
    ambiguous = inTitle.ambiguous ?? inSnippet.ambiguous;
  }
  if (!association) {
    return { candidate: null, reason: ambiguous
        ? `AMBIGUOUS_COMPANY_REFERENCE (${ambiguous})`
        : !ca.aliases.length && !ca.compact
          ? "GENERIC_COMPANY_NAME_DOMAIN_REQUIRED"
          : !strongNameAliases(ca, company.domain).length && !ca.compact
            ? "NON_DISTINCTIVE_COMPANY_NAME_DOMAIN_REQUIRED"
            : "NO_EXACT_COMPANY_ASSOCIATION", name: best.name, title: best.title };
  }

  const { first_name, last_name } = splitName(best.name);
  if (!last_name) return { candidate: null, reason: "NO_FULL_NAME", name: best.name, title: best.title };
  return {
    candidate: {
      full_name: best.name, first_name, last_name, title: best.title, role_match: best.match,
      result_url: r.url, // stored, never fetched
      evidence: sanitizeSnippet(text, 300),
      confidence: association === "company_name_in_snippet" ? "medium" : "high",
      association,
      discovery_source: "public_search",
      is_linkedin_result: isLinkedInProfile(r.url),
    },
  };
}

/** Run ≤2 public searches; stop as soon as a strong candidate is found. Never fetches result URLs. */
export async function findDecisionMakerViaPublicSearch(input: {
  search: PublicSearchProvider;
  company: { name: string; domain: string; city: string | null };
  priority: string[];
  language: "nl" | "en";
  country: string;
  prospect: string;
}): Promise<PublicSearchReport> {
  const report: PublicSearchReport = { queries: [], results_seen: 0, selected: null, rejected: [], errors: [] };
  for (const q of buildQueries(input.company.name, input.language, input.company.city).slice(0, MAX_PUBLIC_SEARCHES)) {
    report.queries.push(q);
    let results: SearchResult[];
    try {
      results = await input.search.search(q, input.prospect, { country: input.country, language: input.language });
    } catch (e) {
      if ((e as Error).name === "BudgetExceededError") throw e;
      report.errors.push((e as Error).message.slice(0, 200));
      continue;
    }
    report.results_seen += results.length;
    const strong: PublicSearchCandidate[] = [];
    for (const r of results) {
      const ev = evaluateResult(r, input.company, input.priority);
      if (ev.candidate) strong.push(ev.candidate);
      else if (ev.name || ev.reason === "INSTRUCTION_LIKE_TEXT_IGNORED") report.rejected.push({ result_url: r.url, reason: ev.reason!, name: ev.name, title: ev.title });
    }
    if (strong.length) {
      report.selected = strong.sort((a, b) => a.role_match.rank - b.role_match.rank || (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1))[0]!;
      return report;
    }
  }
  return report;
}
