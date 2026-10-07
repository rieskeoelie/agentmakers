import { rootDomain } from "./domain";
import type { PublicSearchProvider, SearchResult } from "./providers/dataforseo";
import { isPersonNameShape, sanitizeSnippet, splitName, looksLikeInjection } from "./research";
import { nonPersonReason } from "./personName";
import { jobTitleVerdict, matchRole, type RoleMatch } from "./roles";
import { DEFAULT_ROLE_PRIORITY } from "./config";
import { defaultVocabulary, type RoleVocabulary } from "./vocabulary";
import { companyAliases, fold as foldName, isGenericOrStopToken, matchCompanyAlias, strongNameAliases } from "./companyName";

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
  /** Audit: every result seen (title + URL without query string) and the verdict for candidate discovery. */
  results?: Array<{ title: string; url: string; verdict: string }>;
  /** Review-only near matches (never verified decision makers), best first. */
  review_candidates?: NearMatchCandidate[];
}

/** URL for audit storage: origin + path only (no query string / fragment). */
export function auditUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.slice(0, 200);
  } catch {
    return url.split(/[?#]/)[0]!.slice(0, 200);
  }
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Octant Mondzorg Hoorn: Tandarts & Orthodontie" → "Octant Mondzorg Hoorn" (the part before a tagline separator). */
export function coreCompanyName(name: string): string {
  return name.split(/\s+[|–—-]\s+|:\s+/)[0]!.replace(/\b(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?)\s*$/i, "").trim();
}

/**
 * Company name used in search queries. A location suffix is only removed when what remains is distinctive
 * ("Octant Mondzorg Hoorn" → "Octant Mondzorg"); a generic remainder keeps its locality ("Autohuis Hoorn",
 * "Autocentrum Hoorn" stay as they are — "Autohuis" alone would match every Autohuis in the country).
 * Taglines (": Tandarts & …") and legal suffixes (B.V.) are always dropped.
 */
export function searchCompanyName(companyName: string, city: string | null): string {
  const alias = companyAliases(companyName, city).aliases[0];
  return (alias ? aliasDisplay(companyName, alias) : coreCompanyName(companyName)).replace(/"/g, "");
}

export function buildQueries(companyName: string, language: "nl" | "en", city: string | null = null, vocabulary: RoleVocabulary = defaultVocabulary(DEFAULT_ROLE_PRIORITY)): string[] {
  const n = searchCompanyName(companyName, city);
  const roles = `(${vocabulary.searchRoles[language].join(" OR ")})`;
  const liRoles = `(${vocabulary.linkedinRoles[language].join(" OR ")})`;
  return [`"${n}" ${roles}`, `site:linkedin.com/in "${n}" ${liRoles}`].slice(0, MAX_PUBLIC_SEARCHES);
}

/**
 * Does a person name merely repeat the company/business name ("Piet Has" for "Vakgarage Piet Has B.V.")?
 * Such a "name" in search metadata refers to the business, not to an identified person.
 */
export function nameEqualsCompanyName(personName: string, companyName: string): boolean {
  const toks = (x: string) => fold(x).replace(/[^a-z0-9&' ]/g, " ").split(/\s+/).filter((t) => t && !/^(b\.?v|n\.?v|v\.?o\.?f|bv|nv|vof)$/.test(t));
  const p = toks(personName.replace(/^(dr|drs|mr|ir|ing|prof)\.?\s+/i, ""));
  const c = toks(coreCompanyName(companyName));
  if (p.length < 2) return false;
  for (let i = 0; i + p.length <= c.length; i++) if (p.every((t, k) => c[i + k] === t)) return true;
  return false;
}

/**
 * "Eigenaar Auto Tensen Enkhuizen" / "eigenaar van Autohuis Wittelte": the title itself names an organisation that is
 * not this company (no alias, no brand tokens, no domain label) → a different company's decision maker.
 */
export function otherOrganisationInTitle(title: string, match: RoleMatch, ca: ReturnType<typeof companyAliases>, domain: string | null): string | null {
  const esc = match.matched_text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = title.match(new RegExp(`${esc}\\s+(?:(?:van|bij|at|of|@)\\s+)?(.+)$`, "i"));
  if (!m) return null;
  const rest = m[1]!.trim();
  if (!/^[A-ZÀ-Ý0-9]/.test(rest)) return null; // lowercase continuation is not an organisation name
  const fr = foldName(rest);
  const restTokens = fr.replace(/[^a-z0-9&' ]/g, " ").split(/\s+/).filter(Boolean);
  if (restTokens.every((t) => ca.cityTokens.includes(t))) return null;
  if (matchCompanyAlias(rest, ca).matched) return null;
  const label = domain ? foldName(domain).replace(/^www\./, "").split(".")[0]!.replace(/[^a-z0-9]/g, "") : "";
  if (label && fr.replace(/[^a-z0-9]/g, "").includes(label)) return null;
  if (ca.brand.length && ca.brand.filter((b) => b.length >= 3).every((b) => restTokens.includes(b))) return null;
  return rest.slice(0, 80);
}

function isLinkedInProfile(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)linkedin\.com$/i.test(u.hostname) && u.pathname.startsWith("/in/");
  } catch {
    return false;
  }
}

/** Name-shaped text that is not a person (role word, section heading, publication or organisation label). */
export interface NonPersonRejection { name: string; title: string; reason: string }

/**
 * Person check with result context: name-shaped AND not a role/heading/publication/label. A rejected name-shaped
 * fragment is recorded (audit) so it never silently becomes — or silently disappears as — a candidate.
 */
function personOrReject(n: string, title: string, url: string, rejected: NonPersonRejection[]): boolean {
  if (!isPersonNameShape(n)) return false;
  const why = nonPersonReason(n.replace(/^(dr|drs|mr|ir|ing|prof)\.?\s+/i, ""), { url });
  if (!why) return true;
  if (!rejected.some((x) => x.name === n)) rejected.push({ name: n, title, reason: `NOT_A_PERSON:${why}` });
  return false;
}

/** Split title/snippet into small fragments; pair (name, role) from the same or adjacent fragments. */
function nameRolePairs(text: string, priority: string[], url = "", rejected: NonPersonRejection[] = []): Array<{ name: string; title: string; match: RoleMatch }> {
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
      if (n && personOrReject(n, f, url, rejected)) {
        out.push({ name: n.replace(/^(dr|drs|mr|ir|ing|prof)\.?\s+/i, ""), title: f, match: m });
        break;
      }
    }
  }
  return out;
}

export interface SearchCompany {
  name: string;
  domain: string;
  city: string | null;
  /** Optional company facts used ONLY as independent corroboration for review-only near matches. */
  phone?: string | null;
  address?: string | null;
}

/**
 * A plausible but unconfirmed decision maker: the result names an organisation that is a strong business-name match
 * ("Garage Verburg B.V." for "Autobedrijf Verburg") AND at least one independent company-specific signal corroborates
 * it (same locality, company domain, phone or street address in the same result). Never a verified decision maker:
 * at most a REVIEW candidate (never READY, never Prospeo).
 */
export interface NearMatchCandidate {
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  role_match: RoleMatch;
  result_url: string;
  evidence: string;
  organisation: string;
  similarity: "STRONG_BUSINESS_NAME_MATCH";
  corroboration: Array<"SAME_LOCALITY" | "COMPANY_DOMAIN" | "COMPANY_PHONE" | "COMPANY_ADDRESS">;
  uncertainty: string;
}

export const NEAR_MATCH_UNCERTAINTY = "Bedrijfsnaam komt sterk overeen, maar identiteit is niet volledig bevestigd.";

const LEGAL_SUFFIX = /[\s,]*\b(b\.?\s?v\.?|n\.?\s?v\.?|v\.?\s?o\.?\s?f\.?|holding)\s*$/i;
const tokensOf = (s: string) => foldName(s).replace(/[^a-z0-9&' ]/g, " ").split(/\s+/).filter(Boolean);

/** Organisation names a result associates with the person ("… bij Garage Verburg B.V.", LinkedIn headline segments). */
function organisationsIn(r: SearchResult): string[] {
  const out: string[] = [];
  const text = `${r.title} | ${r.snippet}`;
  for (const m of text.matchAll(/(?:\bbij|\bat|@|\bvan)\s+([A-ZÀ-Ý0-9][^|·•,;()–—\n]{1,60})/g)) out.push(m[1]!.trim());
  if (isLinkedInProfile(r.url)) {
    const segs = r.title.replace(/\s*\|\s*LinkedIn.*$/i, "").split(/\s+[-–—|]\s+/).slice(1);
    for (const sgm of segs) out.push(sgm.replace(/^.*?\b(bij|at)\s+/i, "").trim());
  }
  return [...new Set(out.map((o) => o.replace(/[.\s]+$/, "").trim()).filter(Boolean))];
}

/** Strong business-name similarity: every distinctive company token is present and the rest is only generic wording. */
export function strongBusinessNameMatch(organisation: string, ca: ReturnType<typeof companyAliases>): boolean {
  const distinctive = ca.brand.filter((b) => b.length >= 3);
  if (!distinctive.length) return false;
  const org = tokensOf(organisation.replace(LEGAL_SUFFIX, ""));
  if (!distinctive.every((d) => org.includes(d))) return false;
  const rest = org.filter((t) => !distinctive.includes(t));
  return rest.every((t) => isGenericOrStopToken(t) || ca.cityTokens.includes(t));
}

function corroborationFor(r: SearchResult, company: SearchCompany, ca: ReturnType<typeof companyAliases>): NearMatchCandidate["corroboration"] {
  const text = `${r.title} ${r.snippet} ${r.url}`;
  const toks = new Set(tokensOf(text));
  const out: NearMatchCandidate["corroboration"] = [];
  if (ca.cityTokens.length && ca.cityTokens.every((c) => toks.has(c))) out.push("SAME_LOCALITY");
  const root = rootDomain(company.domain);
  if (root && (rootDomain(r.url) === root || foldName(text).includes(root))) out.push("COMPANY_DOMAIN");
  const digits = (company.phone ?? "").replace(/\D/g, "").slice(-9);
  if (digits.length === 9 && text.replace(/\D/g, "").includes(digits)) out.push("COMPANY_PHONE");
  const street = (company.address ?? "").match(/^([A-Za-zÀ-ÿ.' -]{3,}?)\s+(\d+[a-zA-Z]?)\b/);
  if (street && foldName(text).includes(`${foldName(street[1]!.trim())} ${street[2]!.toLowerCase()}`)) out.push("COMPANY_ADDRESS");
  return out;
}

export function evaluateResult(
  r: SearchResult,
  company: SearchCompany,
  priority: string[],
): { candidate: PublicSearchCandidate | null; reason?: string; name?: string; title?: string; near_match?: NearMatchCandidate } {
  const text = `${r.title} — ${r.snippet}`;
  if (looksLikeInjection(text)) return { candidate: null, reason: "INSTRUCTION_LIKE_TEXT_IGNORED" };
  const ca = companyAliases(company.name, company.city, company.domain);
  const isCompanyName = (n: string) => ca.aliases.includes(foldName(n).replace(/[^a-z0-9&' ]/g, "").replace(/\s+/g, " ").trim());

  // Person + role. LinkedIn profile titles follow "<Name> - <headline/company> | LinkedIn": the first segment is the person.
  type Pair = { name: string; title: string; match: RoleMatch };
  const pairs: Pair[] = [];
  const nonPersons: NonPersonRejection[] = [];
  if (isLinkedInProfile(r.url)) {
    const segs = r.title.replace(/\s*\|\s*LinkedIn.*$/i, "").split(/\s+[-–—|]\s+/).map((x) => x.trim()).filter(Boolean);
    const person = segs[0];
    if (person && personOrReject(person, segs[1] ?? "", r.url, nonPersons) && !isCompanyName(person)) {
      const frags = [...segs.slice(1), ...r.snippet.split(/\s*[·•|]\s*|\.\s+|;\s*|\s+-\s+/)].map((x) => x.trim()).filter((x) => x && x.length <= 80);
      for (const fr of frags) {
        const m = matchRole(fr, priority);
        if (m) pairs.push({ name: person.replace(/^(dr|drs|mr|ir|ing|prof)\.?\s+/i, ""), title: fr, match: m });
      }
    }
  }
  if (!pairs.length) pairs.push(...nameRolePairs(r.title, priority, r.url, nonPersons).concat(nameRolePairs(r.snippet, priority, r.url, nonPersons)).filter((p) => !isCompanyName(p.name)));
  if (!pairs.length) {
    // Name-shaped text next to a role that is not a person ("Campus Life" — a section heading): rejected, with reason.
    const np = nonPersons[0];
    return np ? { candidate: null, reason: np.reason, name: np.name, title: np.title } : { candidate: null, reason: "NO_NAMED_PERSON_WITH_DECISION_MAKER_ROLE" };
  }

  // Tightened candidate checks: the "name" must not just be the business name, the "title" must be a job title
  // (not a slogan / sentence fragment / marketing use of "partner"), and must not name a different organisation.
  let firstRejection: { reason: string; name: string; title: string } | undefined;
  const valid: Pair[] = [];
  for (const p of pairs.sort((x, y) => x.match.rank - y.match.rank)) {
    const reject = (reason: string) => { firstRejection ??= { reason, name: p.name, title: p.title }; };
    if (nameEqualsCompanyName(p.name, company.name)) { reject("NAME_EQUALS_COMPANY_NAME"); continue; }
    const tv = jobTitleVerdict(p.title, p.match);
    if (!tv.ok) { reject(tv.reason); continue; }
    if (otherOrganisationInTitle(p.title, p.match, ca, company.domain)) { reject("TITLE_REFERS_TO_OTHER_COMPANY"); continue; }
    valid.push(p);
  }
  const best = valid[0];
  if (!best) return { candidate: null, ...firstRejection! };

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
    // Review-only near match: strong business-name similarity + at least one independent company-specific signal.
    const { first_name: nf, last_name: nl } = splitName(best.name);
    if (!ambiguous && nl) {
      const org = organisationsIn(r).find((o) => strongBusinessNameMatch(o, ca));
      if (org) {
        const corroboration = corroborationFor(r, company, ca);
        if (!corroboration.length) return { candidate: null, reason: "NEAR_MATCH_WITHOUT_CORROBORATION", name: best.name, title: best.title };
        return {
          candidate: null, reason: "REVIEW_NEAR_MATCH", name: best.name, title: best.title,
          near_match: {
            full_name: best.name, first_name: nf, last_name: nl, title: best.title, role_match: best.match, result_url: r.url,
            evidence: sanitizeSnippet(text, 300), organisation: org.slice(0, 80), similarity: "STRONG_BUSINESS_NAME_MATCH", corroboration,
            uncertainty: NEAR_MATCH_UNCERTAINTY,
          },
        };
      }
    }
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
  company: SearchCompany;
  priority: string[];
  language: "nl" | "en";
  country: string;
  prospect: string;
  /** Niche-aware query wording (default: generic, no practice terms). */
  vocabulary?: RoleVocabulary;
}): Promise<PublicSearchReport> {
  const report: PublicSearchReport = { queries: [], results_seen: 0, selected: null, rejected: [], errors: [], results: [], review_candidates: [] };
  for (const q of buildQueries(input.company.name, input.language, input.company.city, input.vocabulary).slice(0, MAX_PUBLIC_SEARCHES)) {
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
      report.results!.push({ title: sanitizeSnippet(r.title, 140), url: auditUrl(r.url), verdict: ev.candidate ? "CANDIDATE" : ev.reason ?? "NO_CANDIDATE" });
      if (ev.candidate) strong.push(ev.candidate);
      else if (ev.near_match) {
        if (!report.review_candidates!.some((c) => c.full_name === ev.near_match!.full_name)) report.review_candidates!.push(ev.near_match);
      } else if (ev.name || ev.reason === "INSTRUCTION_LIKE_TEXT_IGNORED") report.rejected.push({ result_url: r.url, reason: ev.reason!, name: ev.name, title: ev.title });
    }
    if (strong.length) {
      report.selected = strong.sort((a, b) => a.role_match.rank - b.role_match.rank || (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1))[0]!;
      return report;
    }
  }
  report.review_candidates!.sort((a, b) => a.role_match.rank - b.role_match.rank || b.corroboration.length - a.corroboration.length);
  return report;
}
