import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CampaignInputSchema } from "../../src/lib/outreach/config.js";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { FixtureLLM, FixturePageFetcher, fixtureProviderFetch } from "./fixtures.js";
import { toCsv, writeOutputs } from "../../src/lib/outreach/output.js";
import { runProof, type PipelineDeps } from "../../src/lib/outreach/pipeline.js";
import type { CompanyDiscoveryProvider, DiscoveredCompany } from "../../src/lib/outreach/providers/dataforseo.js";
import { DataForSeoDiscovery } from "../../src/lib/outreach/providers/dataforseo.js";
import { HunterClient, type ContactProvider } from "../../src/lib/outreach/providers/hunter.js";
import type { FetchLike } from "../../src/lib/outreach/http.js";

const campaign = CampaignInputSchema.parse({
  niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: "https://www.agentmakers.io/nl/tandartspraktijken", limit: 20,
});

function deps(over: Partial<PipelineDeps> & { budget?: number; providerFetch?: FetchLike } = {}): PipelineDeps {
  const cost = over.cost ?? new CostTracker("test", over.budget ?? 10);
  const ff = over.providerFetch ?? fixtureProviderFetch();
  return {
    discovery: over.discovery ?? new DataForSeoDiscovery({ login: "f", password: "f" }, cost, 0.92, ff),
    hunter: over.hunter ?? new HunterClient("fixture", cost, 0.05, ff, 1),
    llm: over.llm ?? new FixtureLLM(),
    websiteFetcher: over.websiteFetcher ?? new FixturePageFetcher(),
    cost,
    settings: { maxPages: 6, maxTextChars: 30000, concurrency: 3 },
  };
}

describe("fixture vertical proof (end to end, zero network)", async () => {
  const d = deps();
  const hunterCalls: string[] = [];
  const base = fixtureProviderFetch();
  const spyFetch: FetchLike = async (url, init) => { if (url.includes("api.hunter.io")) hunterCalls.push(url); return base(url, init); };
  const d2 = deps({ providerFetch: spyFetch });
  const result = await runProof(campaign, 20, d2, new FixturePageFetcher());
  const by = (domain: string) => result.prospects.find((p) => p.domain === domain)!;

  it("builds a versioned Campaign Brain from the landing page", () => {
    expect(result.brain?.version).toMatch(/^[0-9a-f]{12}$/);
    expect(result.brain_error).toBeNull();
  });
  it("dedupes and pre-filters before any paid enrichment", () => {
    expect(result.discovery.returned).toBe(15);
    expect(result.discovery.duplicates.map((x) => x.key)).toEqual(["domain:mondzorg-hoorn.example"]);
    expect(result.discovery.prefilter_rejected.map((r) => r.reason.split(":")[0]).sort()).toEqual(["CATEGORY_MISMATCH", "CLOSED", "DIRECTORY_OR_SOCIAL_DOMAIN", "NO_WEBSITE"]);
    expect(result.prospects).toHaveLength(10);
  });
  it("produces the expected per-prospect outcomes", () => {
    expect(by("tandartspraktijk-dewit.example").status).toBe("READY");
    expect(by("mondzorg-hoorn.example").status).toBe("READY"); // Path B: website title → Email Finder
    expect(by("mondzorg-hoorn.example").contact!.source).toBe("website_title+hunter_email_finder");
    expect(by("injectie-tandarts.example").status).toBe("READY"); // verifier upgraded unverified → valid
    expect(by("injectie-tandarts.example").quarantined_snippets.length).toBeGreaterThan(0);
    expect(by("tandartsen-centrum.example").status_reasons).toContain("EMAIL_NOT_ELIGIBLE:REVIEW_ONLY"); // accept_all
    expect(by("tandarts-vos.example").email_eligibility!.reasons).toContain("FREE_MAIL_DOMAIN_REVIEW_ONLY");
    expect(by("tandarts-generic.example").status).toBe("CONTACT_NOT_FOUND");
    expect(by("kliniek-noord.example").fit!.classification).toBe("POSSIBLE_FIT");
    expect(by("smile-studio.example").status).toBe("SKIPPED");
    expect(by("unreachable.example").status_reasons).toEqual(["WEBSITE_UNREACHABLE"]);
    expect(by("tandarts-dewit-zwaag.example").status_reasons[0]).toMatch(/^DUPLICATE_CONTACT/);
  });
  it("spends no Hunter credits on SKIP-fit or unreachable companies", () => {
    expect(hunterCalls.some((u) => u.includes("smile-studio"))).toBe(false);
    expect(hunterCalls.some((u) => u.includes("unreachable"))).toBe(false);
  });
  it("QUALITY GATE: no invalid/unknown/accept-all/generic/free-mail address is ever READY", () => {
    for (const p of result.prospects.filter((x) => x.status === "READY")) {
      expect(p.verification_status).toBe("valid");
      expect(p.email_eligibility!.eligibility).toBe("ELIGIBLE");
      expect(p.email_eligibility!.is_generic).toBe(false);
      expect(p.email_eligibility!.is_free_mail).toBe(false);
    }
  });
  it("QUALITY GATE: every READY company-specific statement traces to stored evidence with a source URL", () => {
    for (const p of result.prospects.filter((x) => x.status === "READY")) {
      const h = p.hook!.hook!;
      expect(h.hook_level).toBe("A");
      expect(h.evidence_ids.length).toBeGreaterThan(0);
      for (const id of h.evidence_ids) {
        const f = p.brief!.observed_facts.find((e) => e.id === id)!;
        expect(f.source_url).toMatch(/^https?:\/\//);
        expect(p.pages.map((x) => x.url)).toContain(f.source_url);
      }
      // the only prospect-specific text in the body is greeting name, hook and company name
      expect(p.email!.body).toContain(h.personalization_hook);
    }
  });
  it("QUALITY GATE: no duplicate outreach records for the same contact", () => {
    const live = result.prospects.filter((p) => p.status === "READY" || p.status === "NEEDS_REVIEW").map((p) => p.contact!.email);
    expect(new Set(live).size).toBe(live.length);
  });
  it("QUALITY GATE: failure reasons and cost per prospect are visible", () => {
    for (const p of result.prospects) {
      if (p.status !== "READY") expect(p.status_reasons.length).toBeGreaterThan(0);
      expect(typeof p.cost_eur).toBe("number");
    }
    expect(result.sending).toBe("DISABLED_IN_PHASE_0");
  });
  it("writes proof.json, proof.csv and proof-report.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "proof-"));
    const files = writeOutputs(dir, result, d2.cost, "fixture");
    const json = JSON.parse(readFileSync(files[0]!, "utf8"));
    expect(json.prospects).toHaveLength(10);
    expect(json.provider_calls.length).toBeGreaterThan(0);
    expect(readFileSync(files[1]!, "utf8").split("\n")[0]).toContain("evidence_source_urls");
    const md = readFileSync(files[2]!, "utf8");
    expect(md).toContain("Phase 0 proof report");
    expect(md).toContain("Inferences (NOT facts");
  });
  it("is reproducible (idempotent re-run gives identical decisions)", async () => {
    const again = await runProof(campaign, 20, deps(), new FixturePageFetcher());
    expect(again.prospects.map((p) => [p.domain, p.status, p.email?.body])).toEqual(result.prospects.map((p) => [p.domain, p.status, p.email?.body]));
    void d;
  });
});

describe("hard 20-prospect limit", () => {
  const many: DiscoveredCompany[] = Array.from({ length: 50 }, (_, i) => ({
    provider_id: `p${i}`, company_name: `Tandarts ${i}`, category: "Tandarts", additional_categories: [], website: `https://tandarts-${i}.example/`, domain: `tandarts-${i}.example`,
    phone: null, address: null, city: "Hoorn", region: null, country: "NL", rating: null, review_count: null, book_online_url: null, closed_signal: null,
    raw_reference: { provider: "dataforseo", endpoint: "x", rank: i, place_id: null, cid: null },
  }));
  const discovery: CompanyDiscoveryProvider = { discover: async () => many };
  it("never processes more than 20 even if asked for more", async () => {
    const r = await runProof(campaign, 500, deps({ discovery }), new FixturePageFetcher());
    expect(r.prospects).toHaveLength(20);
    expect(r.limit).toBe(20);
  });
  it("respects a smaller limit", async () => {
    const r = await runProof(campaign, 3, deps({ discovery }), new FixturePageFetcher());
    expect(r.prospects).toHaveLength(3);
  });
});

describe("budget cap + failure isolation", () => {
  it("stops paid calls when the budget is reached; remaining prospects fail with BUDGET_EXCEEDED, partial progress kept", async () => {
    const r = await runProof(campaign, 20, deps({ budget: 0.08 }), new FixturePageFetcher());
    expect(r.budget.exhausted).toBe(true);
    expect(r.budget.spent_eur).toBeLessThanOrEqual(0.08 + 1e-9);
    expect(r.prospects.some((p) => p.status_reasons.some((s) => s.includes("BUDGET_EXCEEDED")))).toBe(true);
    expect(r.prospects.some((p) => p.status === "READY" || p.status === "NEEDS_REVIEW")).toBe(true);
  });
  it("a provider error for one prospect does not fail the campaign", async () => {
    const cost = new CostTracker("t", 10);
    const real = new HunterClient("fixture", cost, 0.05, fixtureProviderFetch(), 1);
    const flaky: ContactProvider = {
      domainSearch: (d, p) => (d === "mondzorg-hoorn.example" ? Promise.reject(new Error("Hunter domain_search HTTP 500")) : real.domainSearch(d, p)),
      emailFinder: (...a) => real.emailFinder(...a),
      verify: (...a) => real.verify(...a),
    };
    const r = await runProof(campaign, 20, deps({ cost, hunter: flaky }), new FixturePageFetcher());
    const m = r.prospects.find((p) => p.domain === "mondzorg-hoorn.example")!;
    expect(m.status).toBe("FAILED");
    expect(m.stages.contact).toEqual({ status: "failed", reason: "Hunter domain_search HTTP 500" });
    expect(r.prospects.find((p) => p.domain === "tandartspraktijk-dewit.example")!.status).toBe("READY");
  });
  it("discovery failure is reported, not thrown", async () => {
    const r = await runProof(campaign, 5, deps({ discovery: { discover: async () => { throw new Error("DataForSEO HTTP 401"); } } }), new FixturePageFetcher());
    expect(r.discovery_error).toContain("401");
    expect(r.prospects).toEqual([]);
  });
});

describe("CSV safety", () => {
  it("neutralizes spreadsheet formula injection from untrusted text", async () => {
    const r = await runProof(campaign, 1, deps(), new FixturePageFetcher());
    r.prospects[0]!.company.company_name = "=HYPERLINK(\"http://evil\")";
    expect(toCsv(r)).toContain("'=HYPERLINK");
  });
});

describe("suppression (Phase 0: campaign exclude list)", () => {
  it("excluded domains are never processed", async () => {
    const c = CampaignInputSchema.parse({ ...campaign, exclude_domains: ["https://www.tandartspraktijk-dewit.example/"] });
    const r = await runProof(c, 20, deps(), new FixturePageFetcher());
    expect(r.prospects.some((p) => p.domain === "tandartspraktijk-dewit.example")).toBe(false);
    expect(r.discovery.prefilter_rejected).toContainEqual(expect.objectContaining({ reason: "EXCLUDED_DOMAIN" }));
  });
});
