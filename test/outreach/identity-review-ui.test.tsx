/** Identity review: pipeline routing of first-name-only owners + the review card (approvable vs hard blocker). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewCard } from "../../src/components/admin/outreach/ReviewQueueView.js";
import { CampaignInputSchema } from "../../src/lib/outreach/config.js";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { processProspect, type PipelineDeps } from "../../src/lib/outreach/pipeline.js";
import type { DiscoveredCompany } from "../../src/lib/outreach/providers/dataforseo.js";
import type { ContactProvider, DomainSearchResult } from "../../src/lib/outreach/providers/hunter.js";
import type { PageFetcher } from "../../src/lib/outreach/research.js";
import { identityApprovalText, reviewApprovability } from "../../src/lib/outreach/ui/review.js";
import type { IdentityReview, ReviewQueueItem } from "../../src/lib/outreach/ui/types.js";
import { FixtureLLM } from "./fixtures.js";
import { fixtureBrain, LANDING } from "./helpers.js";

const UNCERTAIN = "Bedrijfsnaam komt sterk overeen, maar identiteit is niet volledig bevestigd.";

describe("pipeline: first-name-only owner goes to identity review (no surname, no email → never READY)", () => {
  it("NEEDS_REVIEW with PARTIAL_NAME_MATCH_REVIEW + DECISION_MAKER_EMAIL_NOT_FOUND", async () => {
    const files: Record<string, string> = {
      "garage-richard.example/": `<html><body><nav><a href="/over-ons">Over ons</a></nav><p>Afspraak maken? Bel ons op 0229-333444.</p></body></html>`,
      "garage-richard.example/over-ons": `<html><body><h4>Richard</h4><p>Eigenaar</p></body></html>`,
    };
    const get = async (url: string) => { const u = new URL(url); const b = files[`${u.hostname}${u.pathname}`]; if (b === undefined) throw new Error("HTTP 404"); return { finalUrl: url, body: b, fetchedAt: "t" }; };
    const fetcher: PageFetcher = { fetch: get, fetchResource: get };
    const hunter: ContactProvider = { domainSearch: async (domain): Promise<DomainSearchResult> => ({ domain, organization: null, accept_all: false, contacts: [] }), emailFinder: async () => null, verify: async () => "valid" };
    const deps: PipelineDeps = { discovery: { discover: async () => [] }, hunter, llm: new FixtureLLM(), websiteFetcher: fetcher, cost: new CostTracker("t", 5), settings: { maxPages: 6, maxTextChars: 30_000, concurrency: 1 } };
    const company: DiscoveredCompany = {
      provider_id: "r", company_name: "Tandartspraktijk Richard", category: "Tandarts", additional_categories: [], website: "https://garage-richard.example/", domain: "garage-richard.example",
      phone: null, address: null, city: "Hoorn", region: null, country: "NL", rating: null, review_count: null, book_online_url: null, closed_signal: null,
      raw_reference: { provider: "dataforseo", endpoint: "fixture", rank: null, place_id: null, cid: null },
    };
    const rec = await processProspect(company, 1, CampaignInputSchema.parse({ niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: LANDING, limit: 1 }), await fixtureBrain(), deps);
    expect(rec.status).toBe("NEEDS_REVIEW");
    expect(rec.status_reasons).toEqual(["PARTIAL_NAME_MATCH_REVIEW", "DECISION_MAKER_EMAIL_NOT_FOUND"]);
    expect(rec.contact).toMatchObject({ name: "Richard", last_name: null, email: null, identification: "first_name_only" });
    expect(rec.email).toBeNull();
  });
});

const nearIdentity = (substantiated: boolean): IdentityReview => ({
  reason: "NEAR_MATCH_IDENTITY_UNCONFIRMED", substantiated,
  candidate: { name: "Joris Verburg", first_name: "Joris", last_name: "Verburg", title: "Eigenaar", source: "public_search_near_match+hunter_email_finder", identification: "near_match_review", title_source_url: null },
  evidence: { near_match: { full_name: "Joris Verburg", organisation: "Garage Verburg B.V", result_url: "https://nl.linkedin.com/in/joris-verburg", evidence: "…", corroboration: ["SAME_LOCALITY"], uncertainty: UNCERTAIN } },
});
const item = (o: Partial<ReviewQueueItem>): ReviewQueueItem => ({
  id: "p1", run_id: "r1", run_name: "Run", company_name: "Autobedrijf Verburg", domain: "verburg.nl", website: "https://verburg.nl", city: "Hoorn", fit: null,
  contact_name: "Joris Verburg", contact_title: "Eigenaar", email: "joris@verburg.nl", email_source: "hunter_email_finder", verification_status: "valid",
  eligibility: { eligibility: "ELIGIBLE", reasons: [], is_generic: false }, outcome_reasons: ["NEAR_MATCH_IDENTITY_UNCONFIRMED"], warnings: [], blockers: [],
  identity_review: nearIdentity(true), evidence: [], hook: null, email_draft: null, spent_eur: 0, ...o,
});

describe("review card", () => {
  it("approvable identity review: 'Handmatige bevestiging nodig' with candidate, role, evidence, uncertainty and reason; Approve enabled; no hard-blocker callout", () => {
    const html = renderToStaticMarkup(<ReviewCard item={item({})} onAction={() => undefined} onOpen={() => undefined} />);
    expect(html).toContain("Handmatige bevestiging nodig");
    for (const s of ["Joris Verburg", "Eigenaar", "Garage Verburg B.V", "zelfde plaats", UNCERTAIN]) expect(html).toContain(s);
    expect(html).not.toContain("Goedkeuren niet mogelijk");
    expect(html).toMatch(/<button[^>]*title="Bevestigt de identiteit van deze kandidaat\. Verstuurt niets\."[^>]*>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*title="Bevestigt de identiteit/);
  });
  it("hard blocker (weak near match / suppression) is shown as such and Approve is disabled", () => {
    const html = renderToStaticMarkup(<ReviewCard item={item({ identity_review: nearIdentity(false), blockers: ["IDENTITY_REVIEW_NOT_SUBSTANTIATED"] })} onAction={() => undefined} onOpen={() => undefined} />);
    expect(html).toContain("Goedkeuren niet mogelijk — harde regel");
    expect(html).toContain("Identiteitsreview zonder voldoende bewijs");
    expect(html).not.toContain("Handmatige bevestiging nodig");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Harde regel: kan niet worden goedgekeurd"/);
    const supp = reviewApprovability(["SUPPRESSED_EMAIL:unsubscribe"], nearIdentity(true));
    expect(supp).toMatchObject({ approvable: false, hard: ["SUPPRESSED_EMAIL:unsubscribe"] });
  });
  it("the confirmation says exactly what is accepted and that nothing is sent", () => {
    const t = identityApprovalText("Autobedrijf Verburg", nearIdentity(true), []);
    expect(t.title).toBe("Identiteit bevestigen: Joris Verburg (Eigenaar) bij Autobedrijf Verburg?");
    expect(t.description).toMatch(/Het oorspronkelijke bewijs wordt niet sterker gemaakt/);
    expect(t.description).toMatch(/READY alleen als alles klopt\. Er wordt niets verzonden\.$/);
  });
});
