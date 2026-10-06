import type { FetchLike } from "../../src/lib/outreach/http.js";

export interface Call { url: string; init: RequestInit }

/** Scripted mock fetch: each handler returns [status, body]. Records calls. */
export function mockFetch(handler: (url: URL, init: RequestInit, n: number) => [number, unknown]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const [status, body] = handler(new URL(url), init, calls.length);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

import { buildCampaignBrain, type CampaignBrain } from "../../src/lib/outreach/brain.js";
import { buildBrief, type ProspectBrief } from "../../src/lib/outreach/brief.js";
import { classifyFit } from "../../src/lib/outreach/fit.js";
import { FixtureLLM, FixturePageFetcher } from "./fixtures.js";
import { extractEvidence, type FetchedPage } from "../../src/lib/outreach/research.js";
import { parseHtml } from "../../src/lib/outreach/html.js";

export const LANDING = "https://www.agentmakers.io/nl/tandartspraktijken";

export function fixtureBrain(): Promise<CampaignBrain> {
  return buildCampaignBrain(LANDING, "nl", new FixturePageFetcher(), new FixtureLLM());
}

export function briefFromHtml(brain: CampaignBrain, html: string, opts: { first_name?: string | null; eligibility?: "ELIGIBLE" | "REVIEW_ONLY" } = {}): ProspectBrief {
  const pages: FetchedPage[] = [{ url: "https://x.nl/", kind: "home", fetched_at: "2026-10-06T00:00:00Z", parsed: parseHtml(html) }];
  const ev = extractEvidence(pages);
  const fit = classifyFit({ facts: ev.observed_facts, pagesFetched: 1, nicheRelevant: true });
  const first = opts.first_name === undefined ? "Pieter" : opts.first_name;
  return buildBrief({
    company: "Tandartspraktijk X", website: "https://x.nl/", domain: "x.nl", city: "Hoorn",
    contact: { name: first ? `${first} de Wit` : null, first_name: first, title: "Praktijkhouder", source: "hunter_domain_search" },
    email: "pieter@x.nl", email_source: "hunter_domain_search", verification_status: "valid", email_eligibility: opts.eligibility ?? "ELIGIBLE", eligibility_reasons: [],
    fit, facts: ev.observed_facts, inferences: ev.inferences, brain, suspicious_count: ev.suspicious_snippets.length,
  });
}
