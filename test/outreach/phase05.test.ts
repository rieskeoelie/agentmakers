import { describe, expect, it } from "vitest";
import { buildCampaignBrain, gateCapabilities, type BrainCache, type CampaignBrain } from "../../src/lib/outreach/brain.js";
import { findClaimIssues, SAFE_EMERGENCY_CAPABILITY, type ClaimFlags } from "../../src/lib/outreach/claims.js";
import { companyAliases, matchCompanyAlias } from "../../src/lib/outreach/companyName.js";
import { CampaignInputSchema, DEFAULT_ROLE_PRIORITY, EnvSchema } from "../../src/lib/outreach/config.js";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { FixtureLLM, FixturePageFetcher, fixtureProviderFetch } from "./fixtures.js";
import { runProof, type PipelineDeps } from "../../src/lib/outreach/pipeline.js";
import { DataForSeoDiscovery } from "../../src/lib/outreach/providers/dataforseo.js";
import { HunterClient, type ContactProvider } from "../../src/lib/outreach/providers/hunter.js";
import { evaluateProspeo, ProspeoClient, PROSPEO_URL, samePerson, type EmailFallbackProvider, type ProspeoOutcome, type ProspeoRequest } from "../../src/lib/outreach/providers/prospeo.js";
import { evaluateResult } from "../../src/lib/outreach/publicSearch.js";
import { renderEmail, validateMessage } from "../../src/lib/outreach/render.js";
import { briefFromHtml, fixtureBrain, LANDING, mockFetch } from "./helpers.js";

const P = DEFAULT_ROLE_PRIORITY;
const campaign = CampaignInputSchema.parse({ niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: LANDING, limit: 20 });
const verified = (email: string, full_name: string, domain: string) => ({
  error: false, free_enrichment: false,
  person: { full_name, first_name: full_name.split(" ")[0], last_name: full_name.split(" ").slice(1).join(" "), email: { status: "VERIFIED", revealed: true, email, verification_method: "SMTP", email_mx_provider: "Google" }, mobile: { status: "UNAVAILABLE", revealed: false } },
  company: { name: "X", website: `https://${domain}`, domain },
});

/* ------------------------------------------------------------------ */
/* Pipeline harness: fixture discovery/websites/Hunter + scripted overrides, and a spy Prospeo provider.  */
/* ------------------------------------------------------------------ */
async function run(opts: { finderNull?: string[]; prospeo?: (req: ProspeoRequest) => ProspeoOutcome; budget?: number } = {}) {
  const events: string[] = [];
  const cost = new CostTracker("t", opts.budget ?? 10);
  const ff = fixtureProviderFetch();
  const real = new HunterClient("fixture", cost, 0.05, ff, 1);
  const hunter: ContactProvider = {
    domainSearch: (d, p) => { events.push(`hunter:ds:${d}`); return real.domainSearch(d, p); },
    emailFinder: async (d, f, l, p) => { events.push(`hunter:finder:${d}`); return opts.finderNull?.includes(d) ? null : real.emailFinder(d, f, l, p); },
    verify: (e, p) => { events.push(`hunter:verify:${p}`); return real.verify(e, p); },
  };
  const prospeoCalls: ProspeoRequest[] = [];
  const prospeo: EmailFallbackProvider = {
    enrichPerson: async (req, prospect) => { events.push(`prospeo:${prospect}`); prospeoCalls.push(req); return opts.prospeo ? opts.prospeo(req) : { result: "no_match" }; },
  };
  const deps: PipelineDeps = {
    discovery: new DataForSeoDiscovery({ login: "f", password: "f" }, cost, 0.92, ff), hunter, prospeo, llm: new FixtureLLM(),
    websiteFetcher: new FixturePageFetcher(), cost, settings: { maxPages: 6, maxTextChars: 30000, concurrency: 1 },
  };
  const result = await runProof(campaign, 20, deps, new FixturePageFetcher());
  return { result, events, prospeoCalls, by: (d: string) => result.prospects.find((p) => p.domain === d)! };
}

/* ================================================================== */
describe("PROSPEO email-only fallback", () => {
  it("does not run after a valid eligible Hunter email; never for CONTACT_NOT_FOUND; never for SKIP/unreachable", async () => {
    const r = await run();
    const called = r.prospeoCalls.map((c) => c.company_website);
    expect(called).not.toContain("tandartspraktijk-dewit.example"); // Hunter valid → no Prospeo
    expect(r.by("tandartspraktijk-dewit.example").prospeo).toEqual({ result: "not_run", reason: "HUNTER_VALID_EMAIL" });
    expect(called).not.toContain("tandarts-generic.example"); // CONTACT_NOT_FOUND (generic mailbox only)
    expect(r.by("tandarts-generic.example").status).toBe("CONTACT_NOT_FOUND");
    expect(r.by("tandarts-generic.example").prospeo).toEqual({ result: "not_run", reason: "NO_IDENTIFIED_DECISION_MAKER" });
    expect(called).not.toContain("smile-studio.example");
    expect(called).not.toContain("unreachable.example");
  });

  it("runs only AFTER Hunter (Domain Search / Finder / Verifier) for the same prospect", async () => {
    const r = await run({ finderNull: ["mondzorg-hoorn.example"] });
    const i = r.events.indexOf("prospeo:mondzorg-hoorn.example");
    expect(i).toBeGreaterThan(-1);
    expect(r.events.indexOf("hunter:ds:mondzorg-hoorn.example")).toBeLessThan(i);
    expect(r.events.indexOf("hunter:finder:mondzorg-hoorn.example")).toBeLessThan(i);
  });

  it("runs after Hunter found no email for a named decision maker, with full_name + company_name + company_website; verified email becomes eligible → READY", async () => {
    const r = await run({ finderNull: ["mondzorg-hoorn.example"], prospeo: (q) => evaluateProspeo(verified("sanne.bakker@mondzorg-hoorn.example", "Sanne Bakker", "mondzorg-hoorn.example"), q) });
    expect(r.prospeoCalls).toContainEqual({ full_name: "Sanne Bakker", company_name: "Mondzorg Hoorn", company_website: "mondzorg-hoorn.example" });
    const m = r.by("mondzorg-hoorn.example");
    expect(m.contact).toMatchObject({ email: "sanne.bakker@mondzorg-hoorn.example", email_source: "prospeo_enrich_person", verification_status: "valid", failure_reason: null });
    expect(m.email_eligibility!.eligibility).toBe("ELIGIBLE");
    expect(m.status).toBe("READY");
  });

  it("NO_MATCH preserves the prior status (DECISION_MAKER_EMAIL_NOT_FOUND) without error", async () => {
    const r = await run({ finderNull: ["mondzorg-hoorn.example"] });
    const m = r.by("mondzorg-hoorn.example");
    expect(m.status).toBe("DECISION_MAKER_EMAIL_NOT_FOUND");
    expect(m.prospeo).toMatchObject({ result: "no_match" });
    expect(m.contact!.name).toBe("Sanne Bakker");
  });

  it("runs after a Hunter accept-all (review-only) email; with no verified result the Hunter address is kept and stays NEEDS_REVIEW", async () => {
    const r = await run();
    const t = r.by("tandartsen-centrum.example");
    expect(r.prospeoCalls).toContainEqual({ full_name: "Mark Jansen", company_name: "Tandartsen Centrum", company_website: "tandartsen-centrum.example" });
    expect(t.status).toBe("NEEDS_REVIEW");
    expect(t.contact).toMatchObject({ email: "mark@tandartsen-centrum.example", email_source: "hunter_domain_search" });
    expect(t.verification_status).toBe("accept_all");
    expect(t.hunter_email_before_prospeo).toBeNull();
  });

  it("accept-all Hunter email + verified Prospeo email → replaced (Hunter address kept for audit)", async () => {
    const r = await run({ prospeo: (q) => (q.company_website === "tandartsen-centrum.example" ? evaluateProspeo(verified("mark.jansen@tandartsen-centrum.example", "Mark Jansen", "tandartsen-centrum.example"), q) : { result: "no_match" }) });
    const t = r.by("tandartsen-centrum.example");
    expect(t.contact!.email).toBe("mark.jansen@tandartsen-centrum.example");
    expect(t.hunter_email_before_prospeo).toBe("mark@tandartsen-centrum.example");
    expect(t.email_eligibility!.eligibility).toBe("ELIGIBLE");
  });

  it("a rejected Prospeo result (different person) never replaces anything", async () => {
    const r = await run({ finderNull: ["mondzorg-hoorn.example"], prospeo: (q) => evaluateProspeo(verified("anna.mulder@mondzorg-hoorn.example", "Anna Mulder", "mondzorg-hoorn.example"), q) });
    const m = r.by("mondzorg-hoorn.example");
    expect(m.status).toBe("DECISION_MAKER_EMAIL_NOT_FOUND");
    expect(m.contact!.email).toBeNull();
    expect(m.prospeo).toMatchObject({ result: "rejected", reason: "PERSON_MISMATCH:Anna Mulder" });
  });

  describe("result validation (deterministic)", () => {
    const req: ProspeoRequest = { full_name: "Sanne Bakker", company_name: "Mondzorg Hoorn", company_website: "mondzorg-hoorn.example" };
    it("verified matching-domain personal email → accepted", () => {
      expect(evaluateProspeo(verified("sanne.bakker@mondzorg-hoorn.example", "Sanne Bakker", "mondzorg-hoorn.example"), req)).toMatchObject({ result: "verified_email", email: "sanne.bakker@mondzorg-hoorn.example" });
    });
    it.each([
      ["generic mailbox", verified("info@mondzorg-hoorn.example", "Sanne Bakker", "mondzorg-hoorn.example"), /^EMAIL_POLICY:.*GENERIC/],
      ["free-mail", verified("sanne.bakker@gmail.com", "Sanne Bakker", "mondzorg-hoorn.example"), /^EMAIL_POLICY:.*FREE_MAIL/],
      ["email on another domain", verified("sanne@andere-praktijk.nl", "Sanne Bakker", "mondzorg-hoorn.example"), /^EMAIL_POLICY:.*DOMAIN_DIFFERS/],
      ["different company", verified("sanne.bakker@mondzorg-hoorn.example", "Sanne Bakker", "andere-praktijk.nl"), /^COMPANY_MISMATCH/],
      ["different person", verified("jan@mondzorg-hoorn.example", "Jan Jansen", "mondzorg-hoorn.example"), /^PERSON_MISMATCH/],
      ["not verified", { ...verified("sanne.bakker@mondzorg-hoorn.example", "Sanne Bakker", "mondzorg-hoorn.example"), person: { full_name: "Sanne Bakker", email: { status: "UNVERIFIED", revealed: true, email: "sanne.bakker@mondzorg-hoorn.example" } } }, /^EMAIL_NOT_VERIFIED/],
    ])("%s → rejected", (_l, body, re) => {
      const out = evaluateProspeo(body, req);
      expect(out.result).toBe("rejected");
      expect((out as { reason: string }).reason).toMatch(re);
    });
    it("NO_MATCH → no_match (not an error)", () => {
      expect(evaluateProspeo({ error: true, error_code: "NO_MATCH" }, req)).toEqual({ result: "no_match" });
    });
    it("initials are compatible with a full first name; other names are not", () => {
      expect(samePerson("T.H.T. Pham", "Thanh Pham")).toBe(true);
      expect(samePerson("Peter W. Balfoort", "Peter Balfoort")).toBe(true);
      expect(samePerson("Sanne Bakker", "Sanne de Vries")).toBe(false);
      expect(samePerson("Sanne Bakker", "Anna Bakker")).toBe(false);
    });
  });

  describe("client: request shape, cost, budget, retries (mocked HTTP only)", () => {
    const req: ProspeoRequest = { full_name: "Sanne Bakker", company_name: "Mondzorg Hoorn", company_website: "mondzorg-hoorn.example" };
    it("POSTs to the documented endpoint with X-KEY, only_verified_email=true, full_name+company_name+company_website, and no mobile request", async () => {
      const m = mockFetch(() => [200, verified("sanne.bakker@mondzorg-hoorn.example", "Sanne Bakker", "mondzorg-hoorn.example")]);
      const c = new ProspeoClient("pk", new CostTracker("t", 1), 0.04, m.fetch, 1);
      await c.enrichPerson(req, "mondzorg-hoorn.example");
      expect(m.calls[0]!.url).toBe(PROSPEO_URL);
      expect((m.calls[0]!.init.headers as Record<string, string>)["X-KEY"]).toBe("pk");
      const body = JSON.parse(String(m.calls[0]!.init.body));
      expect(body).toEqual({ only_verified_email: true, data: { full_name: "Sanne Bakker", company_name: "Mondzorg Hoorn", company_website: "mondzorg-hoorn.example" } });
      expect(JSON.stringify(body)).not.toMatch(/mobile/i);
    });
    it("records 1 credit for a found email, 0 for NO_MATCH (which is not retried)", async () => {
      const cost = new CostTracker("t", 1);
      await new ProspeoClient("pk", cost, 0.04, mockFetch(() => [200, verified("sanne.bakker@mondzorg-hoorn.example", "Sanne Bakker", "mondzorg-hoorn.example")]).fetch, 1).enrichPerson(req, "p1");
      const nm = mockFetch(() => [400, { error: true, error_code: "NO_MATCH" }]);
      const out = await new ProspeoClient("pk", cost, 0.04, nm.fetch, 1).enrichPerson(req, "p2");
      expect(out).toEqual({ result: "no_match" });
      expect(nm.calls).toHaveLength(1);
      expect(cost.calls.map((c) => [c.provider, c.operation, c.prospect, c.actual_cost_eur, c.native_cost])).toEqual([
        ["prospeo", "enrich_person", "p1", 0.04, "1 credit"],
        ["prospeo", "enrich_person", "p2", 0, "0 credit"],
      ]);
    });
    it("retries transient 429/5xx within the existing bounded policy", async () => {
      const m = mockFetch((_u, _i, n) => (n < 3 ? [429, { error: true, error_code: "RATE_LIMITED" }] : [200, verified("sanne.bakker@mondzorg-hoorn.example", "Sanne Bakker", "mondzorg-hoorn.example")]));
      const out = await new ProspeoClient("pk", new CostTracker("t", 1), 0.04, m.fetch, 1).enrichPerson(req, "p");
      expect(out.result).toBe("verified_email");
      expect(m.calls).toHaveLength(3);
      const always = mockFetch(() => [503, {}]);
      await expect(new ProspeoClient("pk", new CostTracker("t", 1), 0.04, always.fetch, 1).enrichPerson(req, "p")).rejects.toThrow();
      expect(always.calls).toHaveLength(3);
    });
    it("budget cap: no request when a credit does not fit", async () => {
      const m = mockFetch(() => [200, {}]);
      await expect(new ProspeoClient("pk", new CostTracker("t", 0.01), 0.04, m.fetch, 1).enrichPerson(req, "p")).rejects.toThrow(/budget/i);
      expect(m.calls).toHaveLength(0);
    });
    it("fixture transport answers NO_MATCH by default — tests never reach the real Prospeo API", async () => {
      const out = await new ProspeoClient("fixture", new CostTracker("t", 1), 0.04, fixtureProviderFetch(), 1).enrichPerson(req, "p");
      expect(out).toEqual({ result: "no_match" });
      await expect(fetch(PROSPEO_URL)).rejects.toThrow(/Network access is blocked/);
    });
    it("config: PROSPEO_API_KEY empty → disabled; PROSPEO_EUR_PER_CREDIT parsed", () => {
      expect(EnvSchema.parse({ PROSPEO_API_KEY: "" }).PROSPEO_API_KEY).toBeUndefined();
      expect(EnvSchema.parse({ PROSPEO_API_KEY: " k " }).PROSPEO_API_KEY).toBe("k");
      expect(EnvSchema.parse({ PROSPEO_EUR_PER_CREDIT: "0.039" }).PROSPEO_EUR_PER_CREDIT).toBe(0.039);
    });
  });
});

/* ================================================================== */
describe("MONDZORGHOORN association", () => {
  const company = { name: "Mondzorg Hoorn", domain: "mondzorghoorn.nl", city: "Hoorn" };
  const li = (title: string, snippet = "") => ({ title, url: "https://nl.linkedin.com/in/marianda-tensen-a6b00133", domain: "nl.linkedin.com", snippet });

  it('"Mondzorg Hoorn" matches "MondzorgHoorn" (compact brand = company domain label)', () => {
    const ca = companyAliases("Mondzorg Hoorn", "Hoorn", "mondzorghoorn.nl");
    expect(ca.aliases).toEqual([]); // spaced form is generic
    expect(ca.compact).toBe("mondzorghoorn");
    expect(matchCompanyAlias("Praktijk manager MondzorgHoorn", ca)).toMatchObject({ matched: true, alias: "mondzorghoorn" });
  });
  it("Marianda Tensen is accepted as Practice Manager", () => {
    const r = evaluateResult(li("Marianda Tensen - Praktijk manager MondzorgHoorn | LinkedIn"), company, P);
    expect(r.candidate).toMatchObject({ full_name: "Marianda Tensen", title: "Praktijk manager MondzorgHoorn", association: "company_name_in_title" });
    expect(r.candidate!.role_match.matched_role).toBe("practice manager");
  });
  it.each([
    ["Jan Jansen - Eigenaar - Mondzorg Hoorn | LinkedIn", "spaced generic form"],
    ["Jan Jansen - Eigenaar - MondzorgHoornNoord | LinkedIn", "longer compact token"],
    ["Jan Jansen - Eigenaar - MondzorgHoorn Purmerend | LinkedIn", "other location appended"],
    ["Hielke de Boer - Tandarts / eigenaar Nova Mondzorg | LinkedIn", "different company"],
  ])("still rejects: %s (%s)", (title) => {
    expect(evaluateResult(li(title), company, P).candidate).toBeNull();
  });
  it("compact form only counts when it IS the company's domain label (not a global loosening)", () => {
    expect(companyAliases("Mondzorg Hoorn", "Hoorn", "mondzorg-centrum-hoorn.nl").compact).toBeNull();
    expect(evaluateResult(li("Marianda Tensen - Praktijk manager MondzorgHoorn | LinkedIn"), { ...company, domain: "mondzorg-centrum-hoorn.nl" }, P).candidate).toBeNull();
    expect(companyAliases("Tandartspraktijk Hoorn", "Hoorn", "tphoorn.nl").compact).toBeNull();
  });
});

/* ================================================================== */
describe("HEALTHCARE claim guard", () => {
  const LIVE_BAD = "de urgentie van spoedklachten beoordelen en doorverwijzen naar de dienstdoende tandarts of een spoedafspraak inplannen";
  const hc: ClaimFlags = { available_24_7: true, human_handoff: false, calendar_integration: true, healthcare_context: true, emergency_referral: true };
  const codes = (t: string, f = hc) => findClaimIssues(t, f).map((i) => i.code);

  it.each([
    LIVE_BAD,
    "de urgentie beoordelen",
    "inschatten hoe urgent een klacht is",
    "klinische triage uitvoeren",
    "patiënten triëren",
    "een diagnose stellen",
    "de ernst van de klachten bepalen",
    "medisch advies geven",
    "bepalen welke behandeling nodig is en de juiste behandeling kiezen",
    "assess the urgency of dental complaints",
    "give medical advice",
  ])("rejected: %s", (t) => {
    expect(codes(t)).toContain("CLINICAL_DECISION_CLAIM");
  });
  it.each([
    SAFE_EMERGENCY_CAPABILITY.nl,
    "telefoontjes van patiënten beantwoorden en afspraken inplannen",
    "vooraf vastgestelde vragen stellen en informatie verzamelen voor uw team",
    "spoedafspraken inplannen volgens de regels van de praktijk",
  ])("accepted (operational / protocol-based): %s", (t) => {
    expect(codes(t)).toEqual([]);
  });
  it("protocol routing is not mistaken for an unsupported generic handoff, but a generic handoff still is", () => {
    expect(codes(SAFE_EMERGENCY_CAPABILITY.nl)).not.toContain("UNSUPPORTED_HANDOFF");
    expect(codes("het gesprek doorzetten naar een medewerker")).toContain("UNSUPPORTED_HANDOFF");
  });
  it("only applies to healthcare campaigns (e.g. 'diagnose' is fine for a garage)", () => {
    expect(codes("de storingsdiagnose van uw auto inplannen", { ...hc, healthcare_context: false })).not.toContain("CLINICAL_DECISION_CLAIM");
  });

  it("Campaign Brain mapping: the live EMERGENCY_ROUTING phrase is replaced with safe protocol wording", async () => {
    const brain = await fixtureBrain();
    const g = gateCapabilities({ ...brain.capability_by_signal, EMERGENCY_ROUTING: LIVE_BAD }, brain.default_capability, brain.claim_flags, "nl");
    expect(g.caps.EMERGENCY_ROUTING).toBe(SAFE_EMERGENCY_CAPABILITY.nl);
    expect(g.rejected).toContainEqual({ signal: "EMERGENCY_ROUTING", text: LIVE_BAD, issues: ["CLINICAL_DECISION_CLAIM"], replaced_with: SAFE_EMERGENCY_CAPABILITY.nl });
  });
  it("a brain cached BEFORE this guard existed is re-gated on load (no LLM call)", async () => {
    const fresh = await fixtureBrain();
    const stale: CampaignBrain = { ...fresh, capability_by_signal: { ...fresh.capability_by_signal, EMERGENCY_ROUTING: LIVE_BAD }, claim_flags: { available_24_7: true, human_handoff: false, calendar_integration: true } as ClaimFlags };
    const cache: BrainCache = { get: () => stale, set: () => undefined };
    let llmCalls = 0;
    const b = await buildCampaignBrain(LANDING, "nl", new FixturePageFetcher(), new FixtureLLM(() => { llmCalls++; return {}; }), cache);
    expect(llmCalls).toBe(0);
    expect(b.capability_by_signal.EMERGENCY_ROUTING).toBe(SAFE_EMERGENCY_CAPABILITY.nl);
    expect(b.claim_flags.healthcare_context).toBe(true);
  });

  it("De Huesmolen-style email renders with operational, non-clinical wording; the live wording is blocked at READY validation", async () => {
    const fresh = await fixtureBrain();
    const g = gateCapabilities({ ...fresh.capability_by_signal, EMERGENCY_ROUTING: LIVE_BAD }, fresh.default_capability, fresh.claim_flags, "nl");
    const brain: CampaignBrain = { ...fresh, capability_by_signal: g.caps };
    const brief = briefFromHtml(brain, "<p>Voor spoedgevallen buiten openingstijden verwijzen wij naar Tandartsspoedpraktijk, bel 0900-8602.</p>", { first_name: "Poeya" });
    expect(brief.best_outreach_angle!.signal).toBe("EMERGENCY_ROUTING");
    expect(brief.relevant_capability).toBe(SAFE_EMERGENCY_CAPABILITY.nl);
    const hook = { hook_level: "A" as const, personalization_hook: "Op uw website zag ik dat u voor spoedgevallen buiten openingstijden verwijst naar Tandartsspoedpraktijk via 0900-8602.", fit_sentence: null, evidence_ids: [brief.best_outreach_angle!.evidence_id] };
    const email = renderEmail({ brief, brain, hook, language: "nl", formality: "formal", niche: brain.niche, senderName: "Richard" });
    expect(email.body).toContain("AgentMakers bouwt AI-voice agents die spoedoproepen aannemen en volgens het protocol van de praktijk doorzetten naar de juiste persoon of spoedroute.");
    expect(email.body).not.toMatch(/urgentie|triage|diagnos/i);
    const ok = validateMessage({ email, brief, brain, hook, suppressed: false, duplicateContact: false });
    expect(ok.issues).toEqual([]);
    expect(ok.status).toBe("READY");

    const bad = { ...brief, relevant_capability: LIVE_BAD };
    const badEmail = renderEmail({ brief: bad, brain, hook, language: "nl", formality: "formal", niche: brain.niche, senderName: "Richard" });
    const v = validateMessage({ email: badEmail, brief: bad, brain, hook, suppressed: false, duplicateContact: false });
    expect(v.status).toBe("NEEDS_REVIEW");
    expect(v.issues.some((i) => i.startsWith("COPY:CLINICAL_DECISION_CLAIM"))).toBe(true);
  });
});
