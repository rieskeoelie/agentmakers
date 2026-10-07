import { z } from "zod";
import type { CostTracker } from "../cost";
import { requestJson, type FetchLike } from "../http";
import { normalizeHost } from "../domain";

/**
 * DataForSEO SERP API — Google Maps, live/advanced.
 * Docs (verified 2026-10-06): https://docs.dataforseo.com/v3/serp/google/maps/live/advanced/
 * Price per 1 SERP page (≤100 results), live mode: $0.002 (https://dataforseo.com/pricing/serp/google-maps-serp-api).
 * Actual cost is taken from the response `cost` field (USD).
 */
export const DFS_MAPS_LIVE_URL = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";
export const DFS_EST_USD_PER_PAGE = 0.002;

const MapsItem = z
  .object({
    type: z.string(),
    title: z.string().nullish(),
    domain: z.string().nullish(),
    url: z.string().nullish(),
    phone: z.string().nullish(),
    address: z.string().nullish(),
    address_info: z
      .object({
        borough: z.string().nullish(),
        city: z.string().nullish(),
        zip: z.string().nullish(),
        region: z.string().nullish(),
        country_code: z.string().nullish(),
      })
      .partial()
      .nullish(),
    category: z.string().nullish(),
    additional_categories: z.array(z.string()).nullish(),
    place_id: z.string().nullish(),
    cid: z.string().nullish(),
    rating: z.object({ value: z.number().nullish(), votes_count: z.number().nullish() }).partial().nullish(),
    work_hours: z.record(z.string(), z.unknown()).nullish(),
    contact_url: z.string().nullish(),
    book_online_url: z.string().nullish(),
    rank_absolute: z.number().nullish(),
  })
  .passthrough();

const MapsResponse = z.object({
  status_code: z.number(),
  status_message: z.string().optional(),
  cost: z.number().nullish(),
  tasks: z
    .array(
      z.object({
        status_code: z.number(),
        status_message: z.string().optional(),
        cost: z.number().nullish(),
        result: z.array(z.object({ items: z.array(z.unknown()).nullish() }).passthrough()).nullish(),
      }),
    )
    .nullish(),
});

export interface DiscoveredCompany {
  provider_id: string;
  company_name: string;
  category: string | null;
  additional_categories: string[];
  website: string | null;
  domain: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  rating: number | null;
  review_count: number | null;
  book_online_url: string | null;
  closed_signal: string | null;
  raw_reference: { provider: "dataforseo"; endpoint: string; rank: number | null; place_id: string | null; cid: string | null };
}

export function normalizeMapsItems(items: unknown[]): DiscoveredCompany[] {
  const out: DiscoveredCompany[] = [];
  for (const raw of items) {
    const p = MapsItem.safeParse(raw);
    if (!p.success || p.data.type !== "maps_search" || !p.data.title) continue;
    const i = p.data;
    const website = i.url ?? (i.domain ? `https://${i.domain}` : null);
    // `current_status` inside work_hours is NOT in the official field list we verified; read defensively.
    const status = typeof i.work_hours?.["current_status"] === "string" ? String(i.work_hours["current_status"]) : null;
    out.push({
      provider_id: i.place_id ?? i.cid ?? `${i.title}|${i.address ?? ""}`,
      company_name: i.title ?? "",
      category: i.category ?? null,
      additional_categories: i.additional_categories ?? [],
      website,
      domain: normalizeHost(i.domain ?? i.url ?? null),
      phone: i.phone ?? null,
      address: i.address ?? null,
      city: i.address_info?.city ?? null,
      region: i.address_info?.region ?? null,
      country: i.address_info?.country_code ?? null,
      rating: i.rating?.value ?? null,
      review_count: i.rating?.votes_count ?? null,
      book_online_url: i.book_online_url ?? null,
      closed_signal: status && /closed_forever|permanently|temporarily_closed/i.test(status) ? status : null,
      raw_reference: { provider: "dataforseo", endpoint: "serp/google/maps/live/advanced", rank: i.rank_absolute ?? null, place_id: i.place_id ?? null, cid: i.cid ?? null },
    });
  }
  return out;
}

export interface CompanyDiscoveryProvider {
  discover(q: { niche: string; country: string; region?: string; language: string; depth: number }): Promise<DiscoveredCompany[]>;
}

export class DataForSeoDiscovery implements CompanyDiscoveryProvider {
  constructor(
    private readonly creds: { login: string; password: string },
    private readonly cost: CostTracker,
    private readonly usdToEur: number,
    private readonly fetchImpl?: FetchLike,
  ) {}

  async discover(q: { niche: string; country: string; region?: string; language: string; depth: number }): Promise<DiscoveredCompany[]> {
    const depth = Math.min(Math.max(q.depth, 20), 100); // ≤100 keeps it to one billed SERP page
    const est = DFS_EST_USD_PER_PAGE * this.usdToEur;
    this.cost.guard("dataforseo", "maps_live_advanced", null, est);
    const keyword = q.region ? `${q.niche} ${q.region}` : q.niche;
    const auth = Buffer.from(`${this.creds.login}:${this.creds.password}`).toString("base64");
    let res;
    try {
      res = await requestJson(DFS_MAPS_LIVE_URL, {
        method: "POST",
        headers: { authorization: `Basic ${auth}` },
        body: [{ keyword, location_name: q.country, language_code: q.language, depth, device: "desktop" }],
        timeoutMs: 60_000,
        maxRetries: 2,
        fetchImpl: this.fetchImpl,
      });
    } catch (e) {
      this.cost.record({ prospect: null, provider: "dataforseo", operation: "maps_live_advanced", estimated_cost_eur: est, actual_cost_eur: null, native_cost: null, result: "error", detail: String((e as Error).message) });
      throw e;
    }
    const parsed = MapsResponse.safeParse(res.body);
    if (res.status !== 200 || !parsed.success) {
      this.cost.record({ prospect: null, provider: "dataforseo", operation: "maps_live_advanced", estimated_cost_eur: est, actual_cost_eur: null, native_cost: null, result: "error", detail: `HTTP ${res.status}` });
      throw new Error(`DataForSEO HTTP ${res.status}: ${parsed.success ? parsed.data.status_message : "unexpected response shape"}`);
    }
    const usd = parsed.data.cost ?? null;
    const task = parsed.data.tasks?.[0];
    const items = task?.result?.[0]?.items ?? [];
    this.cost.record({
      prospect: null,
      provider: "dataforseo",
      operation: "maps_live_advanced",
      estimated_cost_eur: est,
      actual_cost_eur: usd === null ? null : usd * this.usdToEur,
      native_cost: usd === null ? null : `$${usd}`,
      result: items.length ? "ok" : "empty",
      detail: `keyword="${keyword}" location="${q.country}" task_status=${task?.status_code}`,
    });
    if (!task || task.status_code !== 20000) {
      throw new Error(`DataForSEO task error ${task?.status_code}: ${task?.status_message ?? "no task"}`);
    }
    return normalizeMapsItems(items);
  }
}

/* ------------------------------------------------------------------ */
/* Public Google organic search (decision-maker fallback)              */
/* ------------------------------------------------------------------ */

/**
 * DataForSEO SERP API — Google Organic, live/advanced. Same vendor/credentials as discovery.
 * Docs (verified 2026-10-06): https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/
 * Price (https://dataforseo.com/pricing/serp/google-organic-serp-api): live $0.002 per SERP (10 results);
 * docs: charges are multiplied by 5 when advanced operators (site:, inurl:, intitle: …) are used.
 * Only search-result METADATA (title, url, snippet) is used — result URLs are never fetched.
 */
export const DFS_ORGANIC_LIVE_URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
export const DFS_ORGANIC_EST_USD = 0.002;
/** DataForSEO task status "No Search Results." (https://docs.dataforseo.com/v3/appendix/errors/). */
export const DFS_NO_SEARCH_RESULTS = 40102;
/**
 * Task statuses treated as transient provider-side failures (retried once): 40101 "Internal SE Server Error"
 * (seen live) and the 50000-range internal errors. Never retried: 40102 no results, 400xx/404xx invalid requests,
 * 401xx/402xx/403xx authentication / payment / access, and any non-200 HTTP response.
 */
export function isTransientDfsTaskStatus(code: number | undefined): boolean {
  return code === 40101 || (code !== undefined && code >= 50000 && code < 51000);
}
export const DFS_TRANSIENT_MAX_RETRIES = 1;
export const DFS_TRANSIENT_BACKOFF_MS = 1500;
const ADVANCED_OPERATOR = /\b(site|inurl|intitle|allinurl|allintitle|intext|allintext):/i;

export function estimateOrganicUsd(keyword: string): number {
  return DFS_ORGANIC_EST_USD * (ADVANCED_OPERATOR.test(keyword) ? 5 : 1);
}

const OrganicItem = z.object({ type: z.string(), title: z.string().nullish(), url: z.string().nullish(), domain: z.string().nullish(), description: z.string().nullish() }).passthrough();

export interface SearchResult {
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface PublicSearchProvider {
  search(keyword: string, prospect: string, q: { country: string; language: string }): Promise<SearchResult[]>;
}

export class DataForSeoOrganicSearch implements PublicSearchProvider {
  constructor(
    private readonly creds: { login: string; password: string },
    private readonly cost: CostTracker,
    private readonly usdToEur: number,
    private readonly fetchImpl?: FetchLike,
  ) {}

  async search(keyword: string, prospect: string, q: { country: string; language: string }): Promise<SearchResult[]> {
    // One bounded retry for transient provider-side task errors (e.g. 40101 "Internal SE Server Error").
    // Both attempts are recorded; the first failure stays visible in the audit trail.
    for (let attempt = 1; ; attempt++) {
      const r = await this.attempt(keyword, prospect, q, attempt);
      if (r.kind === "items") return this.toResults(r.items);
      if (r.kind === "transient" && attempt < 1 + DFS_TRANSIENT_MAX_RETRIES) {
        await this.sleep(DFS_TRANSIENT_BACKOFF_MS * attempt);
        continue;
      }
      throw r.error;
    }
  }

  /** Test seam: bounded backoff wait. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  private async attempt(keyword: string, prospect: string, q: { country: string; language: string }, attempt: number): Promise<{ kind: "items"; items: unknown[] } | { kind: "transient" | "fatal"; error: Error }> {
    const est = estimateOrganicUsd(keyword) * this.usdToEur;
    this.cost.guard("dataforseo", "serp_organic_live", prospect, est);
    const auth = Buffer.from(`${this.creds.login}:${this.creds.password}`).toString("base64");
    const tag = attempt > 1 ? ` attempt=${attempt}` : "";
    let res;
    try {
      res = await requestJson(DFS_ORGANIC_LIVE_URL, {
        method: "POST",
        headers: { authorization: `Basic ${auth}` },
        body: [{ keyword, location_name: q.country, language_code: q.language, depth: 10, device: "desktop" }],
        timeoutMs: 60_000,
        maxRetries: 2,
        fetchImpl: this.fetchImpl,
      });
    } catch (e) {
      this.cost.record({ prospect, provider: "dataforseo", operation: "serp_organic_live", estimated_cost_eur: est, actual_cost_eur: null, native_cost: null, result: "error", detail: `${String((e as Error).message)}${tag}` });
      return { kind: "fatal", error: e as Error };
    }
    const parsed = MapsResponse.safeParse(res.body);
    const usd = parsed.success ? (parsed.data.cost ?? null) : null;
    const task = parsed.success ? parsed.data.tasks?.[0] : undefined;
    const items = task?.result?.[0]?.items ?? [];
    // 40102 "No Search Results" is a valid, empty answer — not a provider failure.
    const noResults = res.status === 200 && parsed.success && task?.status_code === DFS_NO_SEARCH_RESULTS;
    const ok = res.status === 200 && parsed.success && (task?.status_code === 20000 || noResults);
    const transient = !ok && res.status === 200 && parsed.success && isTransientDfsTaskStatus(task?.status_code);
    this.cost.record({
      prospect, provider: "dataforseo", operation: "serp_organic_live", estimated_cost_eur: est,
      actual_cost_eur: usd === null ? null : usd * this.usdToEur, native_cost: usd === null ? null : `$${usd}`,
      result: !ok ? "error" : items.length && !noResults ? "ok" : "empty",
      detail: `keyword=${JSON.stringify(keyword)} task_status=${task?.status_code ?? "?"}${tag}${transient ? " transient" : ""}`,
    });
    if (noResults) return { kind: "items", items: [] };
    if (!ok) {
      return { kind: transient ? "transient" : "fatal", error: new Error(`DataForSEO organic HTTP ${res.status} task ${task?.status_code ?? "?"}: ${task?.status_message ?? "unexpected response"}${tag}`) };
    }
    return { kind: "items", items };
  }

  private toResults(items: unknown[]): SearchResult[] {
    const out: SearchResult[] = [];
    for (const raw of items) {
      const p = OrganicItem.safeParse(raw);
      if (!p.success || p.data.type !== "organic" || !p.data.url) continue;
      out.push({ title: p.data.title ?? "", url: p.data.url, domain: (p.data.domain ?? "").toLowerCase(), snippet: p.data.description ?? "" });
    }
    return out;
  }
}
