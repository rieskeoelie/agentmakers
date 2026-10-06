import { z } from "zod";
import type { CostTracker } from "../cost";
import { rootDomain } from "../domain";
import { evaluateEmail } from "../eligibility";
import { requestJson, type FetchLike } from "../http";

/**
 * Prospeo Enrich Person — EMAIL-ONLY fallback after Hunter (Phase 0.5).
 * Docs (verified 2026-10-06): https://prospeo.io/api-docs/enrich-person
 *   POST https://api.prospeo.io/enrich-person, header X-KEY
 *   body { only_verified_email, data: { full_name, company_name, company_website } }
 *   errors: HTTP 400 { error: true, error_code: "NO_MATCH" | "INVALID_DATAPOINTS" | "INSUFFICIENT_CREDITS" | "INVALID_API_KEY" | … }, 429 rate limit
 *   cost: 1 credit per email found; no charge without a match. Mobile enrichment (10 credits) is NEVER requested.
 * Used ONLY to find the email of an already strongly identified named decision maker — never for discovery.
 */
export const PROSPEO_URL = "https://api.prospeo.io/enrich-person";

const ProspeoResponse = z
  .object({
    error: z.boolean().optional(),
    error_code: z.string().optional(),
    person: z
      .object({
        full_name: z.string().nullish(),
        first_name: z.string().nullish(),
        last_name: z.string().nullish(),
        email: z.object({ status: z.string().nullish(), revealed: z.boolean().nullish(), email: z.string().nullish() }).partial().nullish(),
      })
      .passthrough()
      .nullish(),
    company: z.object({ name: z.string().nullish(), website: z.string().nullish(), domain: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough();

export interface ProspeoRequest {
  full_name: string;
  company_name: string;
  /** Normalised company domain, e.g. "tpdehuesmolen.nl". */
  company_website: string;
}

export type ProspeoOutcome =
  | { result: "verified_email"; email: string; returned_name: string | null; returned_company_domain: string | null }
  | { result: "no_match" }
  | { result: "rejected"; reason: string; email: string | null };

export interface EmailFallbackProvider {
  enrichPerson(req: ProspeoRequest, prospect: string): Promise<ProspeoOutcome>;
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s.-]/g, " ").replace(/\s+/g, " ").trim();
const TUSSEN = new Set(["van", "de", "der", "den", "ter", "ten", "het", "te", "in", "op", "'t"]);

/** Same person? Last name must match; first name must match or be initial-compatible ("T.H.T." ~ "Thanh"). */
export function samePerson(requested: string, returned: string | null | undefined): boolean {
  if (!returned) return false;
  const tok = (s: string) => fold(s).split(" ").filter((t) => t && !TUSSEN.has(t));
  const a = tok(requested);
  const b = tok(returned);
  if (a.length < 2 || b.length < 2) return false;
  const lastA = a[a.length - 1]!.replace(/\./g, "");
  const lastB = b[b.length - 1]!.replace(/\./g, "");
  if (lastA !== lastB) return false;
  const fa = a[0]!.replace(/\./g, "");
  const fb = b[0]!.replace(/\./g, "");
  const aInitials = /^([a-z]\.)+$/.test(a[0]!) || fa.length === 1;
  const bInitials = /^([a-z]\.)+$/.test(b[0]!) || fb.length === 1;
  if (aInitials || bInitials) return fa[0] === fb[0];
  return fa === fb;
}

/** Deterministic acceptance of a Prospeo response for (person, company domain). */
export function evaluateProspeo(body: unknown, req: ProspeoRequest): ProspeoOutcome {
  const p = ProspeoResponse.safeParse(body);
  if (!p.success) return { result: "rejected", reason: "UNEXPECTED_RESPONSE_SHAPE", email: null };
  const d = p.data;
  if (d.error) return d.error_code === "NO_MATCH" ? { result: "no_match" } : { result: "rejected", reason: `PROSPEO_ERROR:${d.error_code ?? "unknown"}`, email: null };
  const e = d.person?.email;
  const email = e?.email ? e.email.toLowerCase().trim() : null;
  if (!email || e?.revealed === false) return { result: "no_match" };
  if ((e?.status ?? "").toUpperCase() !== "VERIFIED") return { result: "rejected", reason: `EMAIL_NOT_VERIFIED:${e?.status ?? "none"}`, email };
  const returnedName = d.person?.full_name ?? [d.person?.first_name, d.person?.last_name].filter(Boolean).join(" ") ?? null;
  if (!samePerson(req.full_name, returnedName)) return { result: "rejected", reason: `PERSON_MISMATCH:${returnedName ?? "none"}`, email };
  const companyRoot = rootDomain(req.company_website);
  const returnedCompany = rootDomain(d.company?.domain ?? d.company?.website ?? null);
  if (returnedCompany && returnedCompany !== companyRoot) return { result: "rejected", reason: `COMPANY_MISMATCH:${returnedCompany}`, email };
  // Existing eligibility rules: personal, company-domain, not free-mail, not generic, well-formed.
  const elig = evaluateEmail(email, "valid", req.company_website);
  if (elig.eligibility !== "ELIGIBLE") return { result: "rejected", reason: `EMAIL_POLICY:${elig.reasons.join("|")}`, email };
  return { result: "verified_email", email, returned_name: returnedName || null, returned_company_domain: returnedCompany };
}

export class ProspeoClient implements EmailFallbackProvider {
  constructor(
    private readonly apiKey: string,
    private readonly cost: CostTracker,
    private readonly eurPerCredit: number,
    private readonly fetchImpl?: FetchLike,
    private readonly baseDelayMs = 500,
  ) {}

  /** Exact request body. Mobile enrichment is never requested. */
  static body(req: ProspeoRequest) {
    return { only_verified_email: true, data: { full_name: req.full_name, company_name: req.company_name, company_website: req.company_website } };
  }

  async enrichPerson(req: ProspeoRequest, prospect: string): Promise<ProspeoOutcome> {
    const est = 1 * this.eurPerCredit;
    this.cost.guard("prospeo", "enrich_person", prospect, est);
    let res;
    try {
      // requestJson retries only 429/5xx (bounded); a 400 NO_MATCH is returned immediately — never retried.
      res = await requestJson(PROSPEO_URL, {
        method: "POST",
        headers: { "X-KEY": this.apiKey },
        body: ProspeoClient.body(req),
        timeoutMs: 30_000,
        maxRetries: 2,
        baseDelayMs: this.baseDelayMs,
        fetchImpl: this.fetchImpl,
      });
    } catch (e) {
      this.cost.record({ prospect, provider: "prospeo", operation: "enrich_person", estimated_cost_eur: 0, actual_cost_eur: 0, native_cost: "0 credits", result: "error", detail: (e as Error).message.slice(0, 200) });
      throw e;
    }
    const errorCode = (res.body as { error_code?: string } | null)?.error_code;
    if (res.status !== 200 && errorCode !== "NO_MATCH") {
      this.cost.record({ prospect, provider: "prospeo", operation: "enrich_person", estimated_cost_eur: 0, actual_cost_eur: 0, native_cost: "0 credits", result: "error", detail: `HTTP ${res.status} ${errorCode ?? ""}` });
      throw new Error(`Prospeo HTTP ${res.status}${errorCode ? ` ${errorCode}` : ""}`);
    }
    const outcome = evaluateProspeo(res.body, req);
    const emailReturned = !!(res.body as { person?: { email?: { email?: string | null } } } | null)?.person?.email?.email;
    const credits = res.status === 200 && emailReturned ? 1 : 0; // Prospeo charges per email found, even if we reject it
    this.cost.record({
      prospect, provider: "prospeo", operation: "enrich_person", estimated_cost_eur: credits * this.eurPerCredit, actual_cost_eur: credits * this.eurPerCredit,
      native_cost: `${credits} credit`, result: outcome.result === "verified_email" ? "ok" : outcome.result === "no_match" ? "empty" : "error",
      detail: `HTTP ${res.status} ${outcome.result}${outcome.result === "rejected" ? `:${outcome.reason}` : ""}`,
    });
    return outcome;
  }
}
