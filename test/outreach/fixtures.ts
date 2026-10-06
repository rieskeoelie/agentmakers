import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BrainExtractionSchema } from "../../src/lib/outreach/brain.js";
import type { FetchLike } from "../../src/lib/outreach/http.js";
import type { HookOutput } from "../../src/lib/outreach/hook.js";
import type { ProspectBrief } from "../../src/lib/outreach/brief.js";
import type { LLMProvider, StructuredRequest } from "../../src/lib/outreach/providers/anthropic.js";
import { assertSafeUrl } from "../../src/lib/outreach/safeFetch.js";
import type { PageFetcher } from "../../src/lib/outreach/research.js";

/**
 * Fixture mode: zero network, zero paid calls. Provider CLIENT code (DataForSEO, Hunter) still runs —
 * only the transport is replaced, so parsing/status/cost logic is exercised exactly as in dry-run.
 */
export const FIXTURE_DIR = join(import.meta.dirname, "fixtures");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function fixtureProviderFetch(dir = FIXTURE_DIR): FetchLike {
  return async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.hostname === "api.dataforseo.com" && u.pathname.includes("/organic/")) {
      // Public search fixtures: fixtures/dataforseo/organic/<slug-of-keyword>.json; default = no results.
      const keyword = String((JSON.parse(String(init?.body ?? "[{}]")) as Array<{ keyword?: string }>)[0]?.keyword ?? "");
      const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
      const f = join(dir, "dataforseo", "organic", `${slug}.json`);
      if (existsSync(f)) return json(200, JSON.parse(readFileSync(f, "utf8")));
      return json(200, { status_code: 20000, cost: 0.002, tasks: [{ status_code: 20000, status_message: "Ok.", cost: 0.002, result: [{ keyword, items: [] }] }] });
    }
    if (u.hostname === "api.dataforseo.com") {
      return json(200, JSON.parse(readFileSync(join(dir, "dataforseo", "maps-tandarts-hoorn.json"), "utf8")));
    }
    if (u.hostname === "api.hunter.io") {
      const p = u.searchParams;
      const read = (f: string) => {
        const body = JSON.parse(readFileSync(f, "utf8")) as { __status?: number };
        return json(body.__status ?? 200, body);
      };
      if (u.pathname.endsWith("/domain-search")) {
        const f = join(dir, "hunter", "domain-search", `${p.get("domain")}.json`);
        return existsSync(f) ? read(f) : json(200, { data: { domain: p.get("domain"), accept_all: false, emails: [] }, meta: { results: 0 } });
      }
      if (u.pathname.endsWith("/email-finder")) {
        const key = `${p.get("domain")}__${(p.get("first_name") ?? "").toLowerCase()}_${(p.get("last_name") ?? "").toLowerCase().replace(/\s+/g, "-")}`;
        const f = join(dir, "hunter", "email-finder", `${key}.json`);
        return existsSync(f) ? read(f) : json(404, { errors: [{ id: "email_not_found", code: 404, details: "No email found (fixture)" }] });
      }
      if (u.pathname.endsWith("/email-verifier")) {
        const f = join(dir, "hunter", "email-verifier", `${p.get("email")}.json`);
        return existsSync(f) ? read(f) : json(200, { data: { status: "unknown", result: "risky", score: 50, email: p.get("email") } });
      }
    }
    if (u.hostname === "api.prospeo.io") {
      // fixtures/prospeo/<company_website>.json; default = NO_MATCH (HTTP 400), as the real API returns.
      const site = String((JSON.parse(String(init?.body ?? "{}")) as { data?: { company_website?: string } }).data?.company_website ?? "");
      const f = join(dir, "prospeo", `${site}.json`);
      if (existsSync(f)) return json(200, JSON.parse(readFileSync(f, "utf8")));
      return json(400, { error: true, error_code: "NO_MATCH" });
    }
    throw new Error(`fixture: no handler for ${u.hostname}${u.pathname}`);
  };
}

/** Serves fixtures/sites/<host>/<path>.html after running the same URL safety validation as real mode. */
export class FixturePageFetcher implements PageFetcher {
  constructor(private readonly dir = FIXTURE_DIR) {}
  async fetch(url: string) {
    const u = assertSafeUrl(url);
    if (u.hostname.endsWith("agentmakers.io")) {
      const slug = u.pathname.split("/").filter(Boolean).pop() ?? "";
      const f = join(this.dir, "landing", `${slug}.html`);
      if (!existsSync(f)) throw new Error(`fixture: no landing page fixture for ${slug}`);
      return { finalUrl: u.toString(), body: readFileSync(f, "utf8"), fetchedAt: "2026-10-06T08:00:00.000Z" };
    }
    const host = u.hostname.replace(/^www\./, "");
    const name = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\//g, "__") || "index";
    const f = join(this.dir, "sites", host, `${name}.html`);
    if (!existsSync(f)) {
      if (!existsSync(join(this.dir, "sites", host))) throw new Error(`getaddrinfo ENOTFOUND ${u.hostname} (fixture)`);
      throw new Error("HTTP 404");
    }
    return { finalUrl: u.toString(), body: readFileSync(f, "utf8"), fetchedAt: "2026-10-06T08:00:00.000Z" };
  }
  /** robots.txt / sitemap fixtures: fixtures/sites/<host>/<path with / → __> (e.g. robots.txt, page-sitemap.xml). */
  async fetchResource(url: string) {
    const u = assertSafeUrl(url);
    const host = u.hostname.replace(/^www\./, "");
    const f = join(this.dir, "sites", host, u.pathname.replace(/^\/+/, "").replace(/\//g, "__"));
    if (!existsSync(f)) throw new Error("HTTP 404");
    return { finalUrl: u.toString(), body: readFileSync(f, "utf8"), fetchedAt: "2026-10-06T08:00:00.000Z" };
  }
}

const HOOK_TEMPLATES_NL: Record<string, (snippet: string) => string> = {
  RESCHEDULE_BY_PHONE: () => "Op uw website zag ik dat patiënten hun afspraak telefonisch moeten verzetten of afzeggen.",
  APPOINTMENT_BY_PHONE: () => "Op uw website zag ik dat patiënten voor een afspraak worden gevraagd te bellen.",
  PHONE_HOURS: (s) => {
    const times = s.match(/\b\d{1,2}[.:]\d{2}\b/g) ?? [];
    const end = times[times.length - 1];
    return end ? `Op uw website zag ik dat de praktijk telefonisch bereikbaar is tot ${end} uur.` : "Op uw website zag ik dat de praktijk vaste telefonische bereikbaarheidstijden heeft.";
  },
  EMERGENCY_ROUTING: () => "Op uw website zag ik dat patiënten bij spoed buiten openingstijden naar een apart nummer moeten bellen.",
  RECEPTION_HIRING: () => "Op uw website zag ik dat u een vacature heeft voor een baliemedewerker.",
  PHONE_CTA: () => "Op uw website zag ik dat patiënten op meerdere plekken gevraagd worden om te bellen.",
  WEEKEND_CLOSED: () => "Op uw website zag ik dat de praktijk in het weekend gesloten is.",
  FAQ_PRESENT: () => "Op uw website zag ik een uitgebreide pagina met veelgestelde vragen van patiënten.",
};

/**
 * Deterministic stand-in for the LLM. Brain: fixture JSON. Hook: template from the brief's best evidence.
 * `override` lets tests inject arbitrary (including bad) outputs.
 */
export class FixtureLLM implements LLMProvider {
  readonly name = "fixture-llm";
  constructor(private readonly override?: (req: StructuredRequest<unknown>) => unknown, private readonly dir = FIXTURE_DIR) {}

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    const raw = this.override ? this.override(req as StructuredRequest<unknown>) : this.defaultOutput(req);
    return req.schema.parse(raw);
  }

  private defaultOutput(req: StructuredRequest<unknown>): unknown {
    if (req.task === "campaign_brain") {
      return BrainExtractionSchema.parse(JSON.parse(readFileSync(join(this.dir, "llm", "campaign-brain.tandartspraktijken.json"), "utf8")));
    }
    const m = req.user.match(/<untrusted_website_evidence>\n([\s\S]*?)\n<\/untrusted_website_evidence>/);
    const facts = JSON.parse(m?.[1] ?? "[]") as Array<{ id: string; signal: string; quote: string }>;
    const bestId = req.user.match(/Best observation evidence id: (\S+)/)?.[1];
    const best = facts.find((f) => f.id === bestId) ?? facts[0];
    if (!best) throw new Error("fixture-llm: no evidence to observe");
    const template = HOOK_TEMPLATES_NL[best.signal] ?? (() => "Op uw website zag ik dat patiënten gevraagd worden om te bellen.");
    return { hook_level: "A", personalization_hook: template(best.quote), fit_sentence: null, evidence_ids: [best.id] } satisfies HookOutput;
  }
}

export type { ProspectBrief };
