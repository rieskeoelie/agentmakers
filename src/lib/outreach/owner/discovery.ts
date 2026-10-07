import { companyAliases } from "../companyName";
import { isNonCompanyDomain, rootDomain } from "../domain";
import type { CompanyDiscoveryProvider, DiscoveredCompany } from "../providers/dataforseo";
import type { OwnerDiscoveryInput } from "./config";
import type { DiscoveryPlan } from "./plan";

/**
 * Owner Discovery company search: runs the bounded plan, filters, and selects the companies whose ownership is most
 * likely to be established (listing-level evidence: own website, distinctive domain identity, independent business —
 * never "Hunter already has an email"). Website-level ownership signals are measured per company in the pipeline.
 */

export interface IterationLog { query: string; returned: number; new_eligible: number; error?: string }
export interface CandidateRejection { company_name: string; domain: string | null; reason: string }

export interface OwnerDiscoverySummary {
  mode: "AUTONOMOUS" | "COMPANY_LIST";
  plan: DiscoveryPlan | null;
  iterations: IterationLog[];
  stop_reason: "RESULT_TARGET" | "MAX_ITERATIONS" | "BUDGET" | "NO_NEW_COMPANIES" | "PLAN_EXHAUSTED" | "COMPANY_LIST";
  returned: number;
  eligible: number;
  selected: number;
  rejected: CandidateRejection[];
  selection: Array<{ company_name: string; domain: string; score: number; signals: string[] }>;
}

interface Candidate { company: DiscoveredCompany; root: string; names: Set<string>; score: number; signals: string[] }

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Listing-level signals that ownership can be established (no paid calls). */
export function selectionSignals(c: DiscoveredCompany, root: string, categoryQuery: string | null): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  const label = (root.split(".")[0] ?? "").replace(/[^a-z0-9]/g, "");
  const ca = companyAliases(c.company_name, c.city ?? null, root);
  if (ca.brand.some((b) => b.length >= 3 && label.includes(b.replace(/[^a-z0-9]/g, ""))) || ca.compact) { score += 2; signals.push("DOMAIN_MATCHES_COMPANY_NAME"); }
  if (c.review_count !== null && c.review_count >= 3 && c.review_count <= 500) { score += 1; signals.push("INDEPENDENT_SIZE_REVIEWS"); }
  if (categoryQuery && fold(`${c.category ?? ""} ${c.additional_categories.join(" ")} ${c.company_name}`).includes(fold(categoryQuery).split(" ")[0]!)) { score += 1; signals.push("CATEGORY_MATCH"); }
  if (c.address) { score += 1; signals.push("HAS_ADDRESS"); }
  return { score, signals };
}

function prefilterOne(c: DiscoveredCompany, input: OwnerDiscoveryInput): { root: string } | { reason: string } {
  const root = rootDomain(c.domain);
  if (!c.domain || !root) return { reason: "NO_WEBSITE" };
  if (isNonCompanyDomain(c.domain)) return { reason: "DIRECTORY_OR_SOCIAL_DOMAIN" };
  if (input.exclude_domains.map((d) => rootDomain(d)).includes(root)) return { reason: "EXCLUDED_DOMAIN" };
  if (c.closed_signal) return { reason: `CLOSED:${c.closed_signal}` };
  return { root };
}

export async function discoverOwnerCompanies(input: OwnerDiscoveryInput, plan: DiscoveryPlan, provider: CompanyDiscoveryProvider): Promise<{ selected: DiscoveredCompany[]; summary: OwnerDiscoverySummary }> {
  const byRoot = new Map<string, Candidate>();
  const rejected: CandidateRejection[] = [];
  const iterations: IterationLog[] = [];
  let returned = 0;
  let stop: OwnerDiscoverySummary["stop_reason"] = "PLAN_EXHAUSTED";
  for (const q of plan.queries) {
    if (iterations.length >= plan.limits.max_iterations) { stop = "MAX_ITERATIONS"; break; }
    const query = [q.category, q.region].filter(Boolean).join(" ");
    let found: DiscoveredCompany[];
    try {
      found = await provider.discover({ niche: q.category, country: input.country, region: q.region ?? undefined, language: input.language, depth: 40 });
    } catch (e) {
      if ((e as Error).name === "BudgetExceededError") { stop = "BUDGET"; iterations.push({ query, returned: 0, new_eligible: 0, error: "BUDGET" }); break; }
      iterations.push({ query, returned: 0, new_eligible: 0, error: (e as Error).message.slice(0, 160) });
      continue;
    }
    returned += found.length;
    let fresh = 0;
    for (const c of found) {
      const pf = prefilterOne(c, input);
      if ("reason" in pf) { rejected.push({ company_name: c.company_name, domain: c.domain, reason: pf.reason }); continue; }
      const existing = byRoot.get(pf.root);
      if (existing) { existing.names.add(fold(c.company_name)); continue; }
      const sig = selectionSignals(c, pf.root, q.category);
      byRoot.set(pf.root, { company: c, root: pf.root, names: new Set([fold(c.company_name)]), ...sig });
      fresh++;
    }
    iterations.push({ query, returned: found.length, new_eligible: fresh });
    const eligibleNow = [...byRoot.values()].filter((x) => x.names.size === 1).length;
    if (eligibleNow >= plan.limits.candidate_target) { stop = "RESULT_TARGET"; break; }
    if (iterations.length > 1 && fresh < plan.limits.min_new_per_iteration) { stop = "NO_NEW_COMPANIES"; break; }
    if (iterations.length >= plan.limits.max_iterations) { stop = "MAX_ITERATIONS"; break; }
  }
  // One website shared by differently named listings = chain / franchise / platform: ownership is not a single owner.
  const eligible: Candidate[] = [];
  for (const c of byRoot.values()) {
    if (c.names.size > 1) rejected.push({ company_name: c.company.company_name, domain: c.root, reason: "LIKELY_CHAIN_OR_FRANCHISE" });
    else eligible.push(c);
  }
  const ranked = eligible.sort((a, b) => b.score - a.score || (a.company.raw_reference.rank ?? 999) - (b.company.raw_reference.rank ?? 999));
  const chosen = ranked.slice(0, input.limit);
  return {
    selected: chosen.map((c) => c.company),
    summary: {
      mode: "AUTONOMOUS", plan, iterations, stop_reason: stop, returned, eligible: eligible.length, selected: chosen.length,
      rejected: rejected.slice(0, 200), selection: chosen.map((c) => ({ company_name: c.company.company_name, domain: c.root, score: c.score, signals: c.signals })),
    },
  };
}

/** COMPANY_LIST mode: the user's companies (websites) — no provider call for discovery. */
export function companiesFromList(input: OwnerDiscoveryInput): { selected: DiscoveredCompany[]; summary: OwnerDiscoverySummary } {
  const seen = new Set<string>();
  const selected: DiscoveredCompany[] = [];
  const rejected: CandidateRejection[] = [];
  for (const [i, c] of input.companies.entries()) {
    const url = /^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`;
    const root = rootDomain(url);
    if (!root || isNonCompanyDomain(root)) { rejected.push({ company_name: c.name ?? c.website, domain: root, reason: root ? "DIRECTORY_OR_SOCIAL_DOMAIN" : "INVALID_WEBSITE" }); continue; }
    if (seen.has(root)) continue;
    seen.add(root);
    selected.push({
      provider_id: `list:${root}`, company_name: c.name ?? root, category: null, additional_categories: [], website: url, domain: root,
      phone: null, address: null, city: input.region ?? null, region: null, country: input.country, rating: null, review_count: null,
      book_online_url: null, closed_signal: null, raw_reference: { provider: "dataforseo", endpoint: "user_company_list", rank: i + 1, place_id: null, cid: null },
    });
  }
  const limited = selected.slice(0, input.limit);
  return {
    selected: limited,
    summary: { mode: "COMPANY_LIST", plan: null, iterations: [], stop_reason: "COMPANY_LIST", returned: input.companies.length, eligible: selected.length, selected: limited.length, rejected, selection: limited.map((c) => ({ company_name: c.company_name, domain: c.domain!, score: 0, signals: ["USER_SUPPLIED"] })) },
  };
}
