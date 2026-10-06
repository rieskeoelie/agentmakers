import { z } from "zod";
import type { CostTracker } from "../cost";
import { requestJson, type FetchLike } from "../http";
import type { VerificationStatus } from "../eligibility";

/**
 * Hunter API v2. Docs (verified 2026-10-06): https://hunter.io/api-documentation/v2
 * Credits (help.hunter.io "Hunter credits explained"):
 *   Domain Search  — 1 credit per 1–10 emails returned (we request limit=10 → max 1 credit; 0 if no emails)
 *   Email Finder   — 1 credit per call, only charged when an email is found
 *   Email Verifier — 0.5 credit per call
 * Auth via X-API-KEY header (keeps key out of URLs/logs).
 */
export const HUNTER_BASE = "https://api.hunter.io/v2";

const Verification = z.object({ date: z.string().nullish(), status: z.string().nullish() }).nullish();

export const HunterEmailSchema = z
  .object({
    value: z.string(),
    type: z.string().nullish(),
    confidence: z.number().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    position: z.string().nullish(),
    seniority: z.string().nullish(),
    department: z.string().nullish(),
    linkedin: z.string().nullish(),
    verification: Verification,
  })
  .passthrough();

const DomainSearchResponse = z.object({
  data: z
    .object({
      domain: z.string().nullish(),
      organization: z.string().nullish(),
      pattern: z.string().nullish(),
      accept_all: z.boolean().nullish(),
      webmail: z.boolean().nullish(),
      disposable: z.boolean().nullish(),
      emails: z.array(z.unknown()).nullish(),
    })
    .passthrough(),
  meta: z.unknown().optional(),
});

const FinderResponse = z.object({
  data: z
    .object({
      email: z.string().nullish(),
      score: z.number().nullish(),
      first_name: z.string().nullish(),
      last_name: z.string().nullish(),
      position: z.string().nullish(),
      accept_all: z.boolean().nullish(),
      linkedin_url: z.string().nullish(),
      verification: Verification,
    })
    .passthrough(),
});

const VerifierResponse = z.object({
  data: z.object({ status: z.string().nullish(), result: z.string().nullish(), score: z.number().nullish(), accept_all: z.boolean().nullish() }).passthrough(),
});

export interface HunterContact {
  email: string;
  type: "personal" | "generic" | null;
  confidence: number | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  linkedin: string | null;
  verification_status: VerificationStatus;
}

export interface DomainSearchResult {
  domain: string;
  organization: string | null;
  accept_all: boolean;
  contacts: HunterContact[];
}

export interface FinderResult {
  email: string | null;
  score: number | null;
  position: string | null;
  linkedin: string | null;
  verification_status: VerificationStatus;
  accept_all: boolean;
}

export function mapVerificationStatus(s: string | null | undefined): VerificationStatus {
  switch ((s ?? "").toLowerCase()) {
    case "valid":
      return "valid";
    case "accept_all":
      return "accept_all";
    case "unknown":
      return "unknown";
    case "invalid":
      return "invalid";
    case "webmail":
      return "webmail";
    case "disposable":
      return "disposable";
    default:
      return "not_verified";
  }
}

/** Parse a Domain Search body. Domain-level accept_all downgrades "valid" claims to accept_all. */
export function parseDomainSearch(body: unknown, domain: string): DomainSearchResult {
  const p = DomainSearchResponse.parse(body);
  const acceptAll = p.data.accept_all === true;
  const contacts: HunterContact[] = [];
  for (const raw of p.data.emails ?? []) {
    const e = HunterEmailSchema.safeParse(raw);
    if (!e.success) continue;
    let status = mapVerificationStatus(e.data.verification?.status);
    if (acceptAll && status === "valid") status = "accept_all";
    contacts.push({
      email: e.data.value.toLowerCase(),
      type: e.data.type === "personal" || e.data.type === "generic" ? e.data.type : null,
      confidence: e.data.confidence ?? null,
      first_name: e.data.first_name ?? null,
      last_name: e.data.last_name ?? null,
      position: e.data.position ?? null,
      seniority: e.data.seniority ?? null,
      department: e.data.department ?? null,
      linkedin: e.data.linkedin ?? null,
      verification_status: status,
    });
  }
  return { domain, organization: p.data.organization ?? null, accept_all: acceptAll, contacts };
}

export function parseFinder(body: unknown): FinderResult {
  const p = FinderResponse.parse(body);
  const acceptAll = p.data.accept_all === true;
  let status = mapVerificationStatus(p.data.verification?.status);
  if (acceptAll && status === "valid") status = "accept_all";
  return {
    email: p.data.email ? p.data.email.toLowerCase() : null,
    score: p.data.score ?? null,
    position: p.data.position ?? null,
    linkedin: p.data.linkedin_url ?? null,
    verification_status: p.data.email ? status : "not_verified",
    accept_all: acceptAll,
  };
}

export function parseVerifier(body: unknown): VerificationStatus {
  return mapVerificationStatus(VerifierResponse.parse(body).data.status);
}

export interface ContactProvider {
  domainSearch(domain: string, prospect: string): Promise<DomainSearchResult>;
  emailFinder(domain: string, firstName: string, lastName: string, prospect: string): Promise<FinderResult | null>;
  verify(email: string, prospect: string): Promise<VerificationStatus>;
}

export class HunterClient implements ContactProvider {
  constructor(
    private readonly apiKey: string,
    private readonly cost: CostTracker,
    private readonly eurPerCredit: number,
    private readonly fetchImpl?: FetchLike,
    private readonly baseDelayMs = 500,
  ) {}

  private async get(path: string, params: Record<string, string>, retryOn: number[] = []) {
    const qs = new URLSearchParams(params).toString();
    return requestJson(`${HUNTER_BASE}/${path}?${qs}`, {
      headers: { "X-API-KEY": this.apiKey },
      timeoutMs: 25_000,
      maxRetries: 2,
      retryOn,
      baseDelayMs: this.baseDelayMs,
      fetchImpl: this.fetchImpl,
    });
  }

  private fail(op: string, prospect: string, est: number, status: number, body: unknown): never {
    const detail = JSON.stringify((body as { errors?: unknown })?.errors ?? body).slice(0, 300);
    this.cost.record({ prospect, provider: "hunter", operation: op, estimated_cost_eur: 0, actual_cost_eur: 0, native_cost: "0 credits", result: "error", detail: `HTTP ${status} ${detail}` });
    void est;
    throw new Error(`Hunter ${op} HTTP ${status}: ${detail}`);
  }

  async domainSearch(domain: string, prospect: string): Promise<DomainSearchResult> {
    const est = 1 * this.eurPerCredit;
    this.cost.guard("hunter", "domain_search", prospect, est);
    const res = await this.get("domain-search", { domain, limit: "10" });
    if (res.status !== 200) this.fail("domain_search", prospect, est, res.status, res.body);
    const parsed = parseDomainSearch(res.body, domain);
    const credits = parsed.contacts.length > 0 ? 1 : 0;
    this.cost.record({ prospect, provider: "hunter", operation: "domain_search", estimated_cost_eur: credits * this.eurPerCredit, actual_cost_eur: credits * this.eurPerCredit, native_cost: `${credits} credit`, result: credits ? "ok" : "empty" });
    return parsed;
  }

  async emailFinder(domain: string, firstName: string, lastName: string, prospect: string): Promise<FinderResult | null> {
    const est = 1 * this.eurPerCredit;
    this.cost.guard("hunter", "email_finder", prospect, est);
    const res = await this.get("email-finder", { domain, first_name: firstName, last_name: lastName });
    if (res.status === 451) {
      this.cost.record({ prospect, provider: "hunter", operation: "email_finder", estimated_cost_eur: 0, actual_cost_eur: 0, native_cost: "0 credits", result: "empty", detail: "451 claimed_email (person restricted processing)" });
      return null;
    }
    if (res.status === 404) {
      this.cost.record({ prospect, provider: "hunter", operation: "email_finder", estimated_cost_eur: 0, actual_cost_eur: 0, native_cost: "0 credits", result: "empty" });
      return null;
    }
    if (res.status !== 200) this.fail("email_finder", prospect, est, res.status, res.body);
    const parsed = parseFinder(res.body);
    const credits = parsed.email ? 1 : 0;
    this.cost.record({ prospect, provider: "hunter", operation: "email_finder", estimated_cost_eur: credits * this.eurPerCredit, actual_cost_eur: credits * this.eurPerCredit, native_cost: `${credits} credit`, result: parsed.email ? "ok" : "empty" });
    return parsed.email ? parsed : null;
  }

  async verify(email: string, prospect: string): Promise<VerificationStatus> {
    const est = 0.5 * this.eurPerCredit;
    this.cost.guard("hunter", "email_verifier", prospect, est);
    // 202 = verification still in progress → bounded retry.
    const res = await this.get("email-verifier", { email }, [202]);
    if (res.status === 202) {
      this.cost.record({ prospect, provider: "hunter", operation: "email_verifier", estimated_cost_eur: est, actual_cost_eur: null, native_cost: "0.5 credit?", result: "empty", detail: "202 still in progress after retries" });
      return "unknown";
    }
    if (res.status === 451) {
      this.cost.record({ prospect, provider: "hunter", operation: "email_verifier", estimated_cost_eur: 0, actual_cost_eur: 0, native_cost: "0 credits", result: "empty", detail: "451 claimed_email" });
      return "unknown";
    }
    if (res.status !== 200 && res.status !== 222) this.fail("email_verifier", prospect, est, res.status, res.body);
    const status = res.status === 222 ? "unknown" : parseVerifier(res.body);
    this.cost.record({ prospect, provider: "hunter", operation: "email_verifier", estimated_cost_eur: est, actual_cost_eur: est, native_cost: "0.5 credit", result: "ok", detail: `status=${status}` });
    return status;
  }
}
