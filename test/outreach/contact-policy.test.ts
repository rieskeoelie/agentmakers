import { describe, expect, it } from "vitest";
import { CampaignInputSchema, DEFAULT_ROLE_PRIORITY } from "../../src/lib/outreach/config.js";
import { discoverContact } from "../../src/lib/outreach/contacts.js";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { evaluateEmail, isGenericEmail } from "../../src/lib/outreach/eligibility.js";
import { FixtureLLM, FixturePageFetcher, fixtureProviderFetch } from "./fixtures.js";
import { parseHtml } from "../../src/lib/outreach/html.js";
import { computeFunnel, funnelFlags, statusCounts, toCsv, toMarkdown, writeOutputs } from "../../src/lib/outreach/output.js";
import { runProof } from "../../src/lib/outreach/pipeline.js";
import { DataForSeoDiscovery } from "../../src/lib/outreach/providers/dataforseo.js";
import { HunterClient, type ContactProvider, type DomainSearchResult, type FinderResult, type HunterContact } from "../../src/lib/outreach/providers/hunter.js";
import type { LLMProvider } from "../../src/lib/outreach/providers/anthropic.js";
import { renderEmail, validateMessage } from "../../src/lib/outreach/render.js";
import type { FetchedPage } from "../../src/lib/outreach/research.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { briefFromHtml, fixtureBrain } from "./helpers.js";

const GENERIC = ["info", "contact", "hello", "office", "reception", "receptie", "admin", "sales", "support", "customer-service", "service"];

const hc = (email: string, o: Partial<HunterContact> = {}): HunterContact => ({
  email, type: "personal", confidence: 90, first_name: null, last_name: null, position: null, seniority: null, department: null, linkedin: null, verification_status: "valid", ...o,
});

function stubHunter(contacts: HunterContact[], finder: FinderResult | null = null): ContactProvider & { finderCalls: number } {
  const s = {
    finderCalls: 0,
    domainSearch: async (domain: string): Promise<DomainSearchResult> => ({ domain, organization: null, accept_all: false, contacts }),
    emailFinder: async () => { s.finderCalls++; return finder; },
    verify: async () => "valid" as const,
  };
  return s;
}

const teamPage = (html: string): FetchedPage[] => [{ url: "https://x.nl/team", kind: "team", fetched_at: "t", parsed: parseHtml(html) }];
const discover = (h: ContactProvider, pages: FetchedPage[] = []) => discoverContact({ domain: "x.nl", pages, priority: DEFAULT_ROLE_PRIORITY, hunter: h, prospect: "x.nl" });

describe("generic/role mailbox policy", () => {
  it.each(GENERIC)("%s@ is generic and never an eligible recipient", (local) => {
    expect(isGenericEmail(`${local}@x.nl`)).toBe(true);
    const e = evaluateEmail(`${local}@x.nl`, "valid", "x.nl");
    expect(e.eligibility).toBe("NOT_ELIGIBLE");
    expect(e.reasons).toContain("GENERIC_ADDRESS_NOT_A_RECIPIENT");
  });

  it("named personal addresses are not treated as generic", () => {
    for (const e of ["pieter@x.nl", "p.dewit@x.nl", "sanne.bakker@x.nl"]) expect(isGenericEmail(e)).toBe(false);
  });

  it("only-generic Domain Search, no named person → CONTACT_NOT_FOUND, generics kept as metadata, no recipient", async () => {
    const r = await discover(stubHunter([hc("info@x.nl", { type: "generic" }), hc("receptie@x.nl", { type: "generic" })]));
    expect(r.email).toBeNull();
    expect(r.name).toBeNull();
    expect(r.failure_reason).toBe("CONTACT_NOT_FOUND");
    expect(r.company_generic_emails).toEqual(["info@x.nl", "receptie@x.nl"]);
  });

  it("a role mailbox mislabelled 'personal' with a decision-maker title is still never selected", async () => {
    const r = await discover(stubHunter([hc("office@x.nl", { position: "Office manager", seniority: "executive" }), hc("customer-service@x.nl", { position: "Eigenaar" })]));
    expect(r.email).toBeNull();
    expect(r.failure_reason).toBe("CONTACT_NOT_FOUND");
    expect(r.company_generic_emails).toEqual(["office@x.nl", "customer-service@x.nl"]);
  });

  it("generic mailbox present + named decision maker → the named person is the recipient", async () => {
    const r = await discover(stubHunter([hc("info@x.nl", { type: "generic", confidence: 99 }), hc("jan@x.nl", { first_name: "Jan", last_name: "Jansen", position: "Eigenaar" })]));
    expect(r.email).toBe("jan@x.nl");
    expect(r.company_generic_emails).toEqual(["info@x.nl"]);
    expect(r.failure_reason).toBeNull();
  });

  it("Hunter-metadata fallback ignores generic executives", async () => {
    const r = await discover(stubHunter([hc("admin@x.nl", { seniority: "executive", position: "Tandarts" })]));
    expect(r.email).toBeNull();
    expect(r.source).toBe("none");
  });

  it("Email Finder returning a generic mailbox for a website person is rejected", async () => {
    const h = stubHunter([hc("info@x.nl", { type: "generic" })], { email: "info@x.nl", score: 50, position: null, linkedin: null, verification_status: "valid", accept_all: false });
    const r = await discover(h, teamPage("<p>Sanne Bakker – praktijkmanager</p>"));
    expect(h.finderCalls).toBe(1);
    expect(r.email).toBeNull();
    expect(r.failure_reason).toBe("DECISION_MAKER_EMAIL_NOT_FOUND"); // the person WAS identified
    expect(r.name).toBe("Sanne Bakker");
  });

  it("validateMessage never returns READY for a generic recipient", async () => {
    const brain = await fixtureBrain();
    const brief = { ...briefFromHtml(brain, "<p>Voor het maken van een afspraak kunt u ons bellen.</p>"), email: "info@x.nl" };
    const id = brief.observed_facts[0]!.id;
    const hook = { hook_level: "A" as const, personalization_hook: "Op uw website zag ik dat patiënten voor een afspraak worden gevraagd te bellen.", fit_sentence: null, evidence_ids: [id] };
    const email = renderEmail({ brief, brain, hook, language: "nl", formality: "formal", niche: brain.niche, senderName: "Richard" });
    const v = validateMessage({ email, brief, brain, hook, suppressed: false, duplicateContact: false });
    expect(v.status).not.toBe("READY");
    expect(v.issues).toContain("GENERIC_ADDRESS_NOT_A_RECIPIENT");
  });
});

describe("pipeline: generic-only company", async () => {
  const campaign = CampaignInputSchema.parse({ niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: "https://www.agentmakers.io/nl/tandartspraktijken", limit: 20 });
  const cost = new CostTracker("t", 10);
  const ff = fixtureProviderFetch();
  const hookCalls: string[] = [];
  const fixtureLlm = new FixtureLLM();
  const llm: LLMProvider = { name: "spy", structured: (req) => { if (req.prospect) hookCalls.push(req.prospect); return fixtureLlm.structured(req); } };
  const result = await runProof(campaign, 20, {
    discovery: new DataForSeoDiscovery({ login: "f", password: "f" }, cost, 0.92, ff),
    hunter: new HunterClient("fixture", cost, 0.05, ff, 1),
    llm, websiteFetcher: new FixturePageFetcher(), cost, settings: { maxPages: 6, maxTextChars: 30000, concurrency: 3 },
  }, new FixturePageFetcher());
  const g = result.prospects.find((p) => p.domain === "tandarts-generic.example")!;

  it("gets explicit CONTACT_NOT_FOUND — not NEEDS_REVIEW, not READY", () => {
    expect(g.status).toBe("CONTACT_NOT_FOUND");
    expect(g.status_reasons).toEqual(["CONTACT_NOT_FOUND"]);
    expect(g.stages.contact).toEqual({ status: "failed", reason: "CONTACT_NOT_FOUND" });
  });
  it("keeps the generic mailbox only as company metadata; no recipient, no hook spend, no rendered email", () => {
    expect(g.contact!.email).toBeNull();
    expect(g.contact!.company_generic_emails).toEqual(["info@tandarts-generic.example"]);
    expect(g.email).toBeNull();
    expect(g.hook).toBeNull();
    expect(hookCalls).not.toContain("tandarts-generic.example");
  });
  it("no READY or NEEDS_REVIEW record anywhere has a generic recipient", () => {
    for (const p of result.prospects.filter((x) => x.status === "READY" || x.status === "NEEDS_REVIEW")) {
      expect(isGenericEmail(p.contact!.email!)).toBe(false);
    }
  });
  it("generic mailboxes do not count toward any funnel stage", () => {
    const f = funnelFlags(g);
    expect(f).toEqual({ researched: true, decision_maker_found: false, business_email_found: false, email_eligible: false, ready: false });
    expect(toCsv(result)).toContain("info@tandarts-generic.example"); // visible only as a metadata column
  });
});

describe("distinct terminal contact statuses + funnel", () => {
  it("named website person, Email Finder returns nothing → DECISION_MAKER_EMAIL_NOT_FOUND with the person kept", async () => {
    const r = await discover(stubHunter([], null), teamPage("<p>Sanne Bakker – praktijkmanager</p>"));
    expect(r).toMatchObject({ name: "Sanne Bakker", title: "praktijkmanager", source: "website_title", email: null, failure_reason: "DECISION_MAKER_EMAIL_NOT_FOUND" });
    expect(r.title_source_url).toBe("https://x.nl/team");
  });
  it("named relevant person whose only Hunter address is generic → DECISION_MAKER_EMAIL_NOT_FOUND", async () => {
    const r = await discover(stubHunter([hc("info@x.nl", { type: "generic", first_name: "Jan", last_name: "Jansen", position: "Eigenaar" })]));
    expect(r).toMatchObject({ name: "Jan Jansen", email: null, failure_reason: "DECISION_MAKER_EMAIL_NOT_FOUND" });
  });
  it("no person anywhere → CONTACT_NOT_FOUND", async () => {
    const r = await discover(stubHunter([]), teamPage("<h3>Tom Hendriks</h3><p>Tandarts</p>"));
    expect(r).toMatchObject({ name: null, email: null, failure_reason: "CONTACT_NOT_FOUND" });
  });

  describe("pipeline", async () => {
    const campaign = CampaignInputSchema.parse({ niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: "https://www.agentmakers.io/nl/tandartspraktijken", limit: 20 });
    const cost = new CostTracker("t", 10);
    const ff = fixtureProviderFetch();
    const real = new HunterClient("fixture", cost, 0.05, ff, 1);
    // Scenario overrides on top of the normal fixtures:
    //  - mondzorg-hoorn: Email Finder finds nothing for the website person  → DECISION_MAKER_EMAIL_NOT_FOUND
    //  - tandarts-vos:   named owner's address verifies as invalid          → EMAIL_NOT_ELIGIBLE
    const hunter: ContactProvider = {
      domainSearch: async (d, p) => {
        const r = await real.domainSearch(d, p);
        if (d === "tandarts-vos.example") return { ...r, contacts: [hc("jan@tandarts-vos.example", { first_name: "Jan", last_name: "Vos", position: "Eigenaar", verification_status: "invalid" })] };
        return r;
      },
      emailFinder: async (d, f, l, p) => (d === "mondzorg-hoorn.example" ? null : real.emailFinder(d, f, l, p)),
      verify: (e, p) => real.verify(e, p),
    };
    const result = await runProof(campaign, 20, { discovery: new DataForSeoDiscovery({ login: "f", password: "f" }, cost, 0.92, ff), hunter, llm: new FixtureLLM(), websiteFetcher: new FixturePageFetcher(), cost, settings: { maxPages: 6, maxTextChars: 30000, concurrency: 3 } }, new FixturePageFetcher());
    const by = (d: string) => result.prospects.find((p) => p.domain === d)!;

    it("assigns the three distinct terminal statuses", () => {
      expect(by("tandarts-generic.example")).toMatchObject({ status: "CONTACT_NOT_FOUND", status_reasons: ["CONTACT_NOT_FOUND"] });
      expect(by("mondzorg-hoorn.example")).toMatchObject({ status: "DECISION_MAKER_EMAIL_NOT_FOUND", status_reasons: ["DECISION_MAKER_EMAIL_NOT_FOUND"] });
      expect(by("mondzorg-hoorn.example").contact!.name).toBe("Sanne Bakker");
      const v = by("tandarts-vos.example");
      expect(v.status).toBe("EMAIL_NOT_ELIGIBLE");
      expect(v.status_reasons).toEqual(["EMAIL_NOT_ELIGIBLE", "VERIFICATION_INVALID"]);
      expect(v.contact!.email).toBe("jan@tandarts-vos.example");
      for (const d of ["tandarts-generic.example", "mondzorg-hoorn.example", "tandarts-vos.example"]) {
        expect(by(d).hook).toBeNull(); // no LLM spend on any of them
        expect(by(d).email).toBeNull();
      }
    });
    it("per-prospect funnel flags separate each stage", () => {
      expect(funnelFlags(by("tandarts-generic.example"))).toMatchObject({ researched: true, decision_maker_found: false, business_email_found: false });
      expect(funnelFlags(by("mondzorg-hoorn.example"))).toMatchObject({ decision_maker_found: true, business_email_found: false, email_eligible: false });
      expect(funnelFlags(by("tandarts-vos.example"))).toMatchObject({ decision_maker_found: true, business_email_found: true, email_eligible: false });
      expect(funnelFlags(by("tandartspraktijk-dewit.example"))).toEqual({ researched: true, decision_maker_found: true, business_email_found: true, email_eligible: true, ready: true });
      expect(funnelFlags(by("unreachable.example")).researched).toBe(false);
    });
    it("funnel totals are monotonic and match the records", () => {
      const f = computeFunnel(result);
      const p = result.prospects.map(funnelFlags);
      expect(f).toEqual({
        companies_researched: p.filter((x) => x.researched).length,
        named_decision_makers_found: p.filter((x) => x.decision_maker_found).length,
        business_emails_found: p.filter((x) => x.business_email_found).length,
        eligible_emails: p.filter((x) => x.email_eligible).length,
        ready_messages: result.prospects.filter((x) => x.status === "READY").length,
      });
      expect(f.companies_researched).toBeGreaterThanOrEqual(f.named_decision_makers_found);
      expect(f.named_decision_makers_found).toBeGreaterThanOrEqual(f.business_emails_found);
      expect(f.business_emails_found).toBeGreaterThan(f.eligible_emails);
      expect(f.eligible_emails).toBeGreaterThanOrEqual(f.ready_messages);
    });
    it("status counts cover every prospect exactly once", () => {
      const c = statusCounts(result);
      expect(Object.keys(c)).toEqual(["READY", "NEEDS_REVIEW", "CONTACT_NOT_FOUND", "DECISION_MAKER_EMAIL_NOT_FOUND", "EMAIL_NOT_ELIGIBLE", "SKIPPED", "FAILED"]);
      expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(result.prospects.length);
      expect(c).toMatchObject({ CONTACT_NOT_FOUND: 1, DECISION_MAKER_EMAIL_NOT_FOUND: 1, EMAIL_NOT_ELIGIBLE: 1 });
    });
    it("report, CSV and JSON expose statuses and the funnel", () => {
      const f = computeFunnel(result);
      const md = toMarkdown(result, cost, "fixture");
      for (const s of ["CONTACT_NOT_FOUND", "DECISION_MAKER_EMAIL_NOT_FOUND", "EMAIL_NOT_ELIGIBLE"]) expect(md).toContain(`| Status ${s} | 1 |`);
      expect(md).toContain(`| 2. Named decision makers found | ${f.named_decision_makers_found} |`);
      expect(md).toContain(`| 3. Business emails found | ${f.business_emails_found} |`);
      expect(md).toContain(`| 4. Eligible emails | ${f.eligible_emails} |`);
      expect(md).toContain(`| 5. READY messages | ${f.ready_messages} |`);
      const csv = toCsv(result).split("\n");
      expect(csv[0]).toContain("researched,decision_maker_found,business_email_found,email_eligible");
      expect(csv.find((l) => l.includes("mondzorg-hoorn.example"))).toMatch(/DECISION_MAKER_EMAIL_NOT_FOUND/);
      const dir = mkdtempSync(join(tmpdir(), "funnel-"));
      const json = JSON.parse(readFileSync(writeOutputs(dir, result, cost, "fixture")[0]!, "utf8"));
      expect(json.funnel).toEqual(f);
      expect(json.status_counts.EMAIL_NOT_ELIGIBLE).toBe(1);
      expect(json.prospects.find((p: { domain: string }) => p.domain === "tandarts-vos.example").funnel.business_email_found).toBe(true);
    });
  });
});
