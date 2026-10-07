import type { SendingMode } from "./types";

/** Phase 0 hard limit, still enforced (also by CampaignInputSchema and the database). Not lifted in Stage 3. */
export const MAX_PROSPECTS_PER_RUN = 20;
export const MAX_RUN_BUDGET_EUR = 100;

export interface NewRunInput {
  name: string;
  niche: string;
  country: string;
  region: string;
  limit: string;
  landingUrl: string;
  budget: string;
  mode: SendingMode;
  language: "nl" | "en";
}

export const EMPTY_NEW_RUN: NewRunInput = {
  name: "", niche: "", country: "Netherlands", region: "", limit: "10", landingUrl: "", budget: "5", mode: "REVIEW_BEFORE_SENDING", language: "nl",
};

export interface NewRunBody {
  name: string;
  sending_mode: SendingMode;
  start: boolean;
  campaign: { niche: string; country: string; region?: string; agentmakers_url: string; limit: number; max_api_budget_eur: number; language: "nl" | "en" };
}

const LANDING_RE = /^https:\/\/(www\.)?agentmakers\.io\//;

/** Client-side checks for fast feedback; the server re-validates everything (CampaignInputSchema + DB constraints). */
export function validateNewRun(input: NewRunInput, start = true): { ok: true; body: NewRunBody } | { ok: false; errors: Partial<Record<keyof NewRunInput, string>> } {
  const errors: Partial<Record<keyof NewRunInput, string>> = {};
  const name = input.name.trim();
  const niche = input.niche.trim();
  const country = input.country.trim();
  const region = input.region.trim();
  const landing = input.landingUrl.trim();
  const limit = Number(input.limit);
  const budget = Number(String(input.budget).replace(",", "."));
  if (!name) errors.name = "Geef de run een naam.";
  else if (name.length > 120) errors.name = "Maximaal 120 tekens.";
  if (niche.length < 2) errors.niche = "Vul een niche in (bijv. tandarts).";
  if (country.length < 2) errors.country = "Vul een land in.";
  if (region.length > 80) errors.region = "Maximaal 80 tekens.";
  if (!Number.isInteger(limit) || limit < 1) errors.limit = "Kies een aantal van 1 tot 20.";
  else if (limit > MAX_PROSPECTS_PER_RUN) errors.limit = `Maximaal ${MAX_PROSPECTS_PER_RUN} prospects per run (vaste limiet in deze fase).`;
  if (!LANDING_RE.test(landing)) errors.landingUrl = "Kies een AgentMakers-landingspagina (https://agentmakers.io/…).";
  if (!Number.isFinite(budget) || budget <= 0) errors.budget = "Budget moet groter dan €0 zijn.";
  else if (budget > MAX_RUN_BUDGET_EUR) errors.budget = `Maximaal €${MAX_RUN_BUDGET_EUR}.`;
  if (input.mode !== "AUTOPILOT" && input.mode !== "REVIEW_BEFORE_SENDING") errors.mode = "Kies een modus.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    body: {
      name, sending_mode: input.mode, start,
      campaign: { niche, country, ...(region ? { region } : {}), agentmakers_url: landing, limit, max_api_budget_eur: budget, language: input.language },
    },
  };
}

/** Prefill for "Duplicate run". */
export function inputFromRun(run: { name: string; sending_mode?: SendingMode; campaign: { niche: string; country: string; region?: string; agentmakers_url: string; limit: number; max_api_budget_eur?: number; language?: "nl" | "en" }; budget_cap_eur: number }): NewRunInput {
  return {
    name: `${run.name} (kopie)`.slice(0, 120),
    niche: run.campaign.niche, country: run.campaign.country, region: run.campaign.region ?? "",
    limit: String(Math.min(run.campaign.limit, MAX_PROSPECTS_PER_RUN)), landingUrl: run.campaign.agentmakers_url,
    budget: String(Number(run.budget_cap_eur)), mode: run.sending_mode ?? "REVIEW_BEFORE_SENDING", language: run.campaign.language ?? "nl",
  };
}

export const MODE_COPY: Record<SendingMode, { label: string; text: string }> = {
  AUTOPILOT: {
    label: "Autopilot",
    text: "READY-prospects van deze run gaan automatisch in de verzendwachtrij — alleen als verzenden én Autopilot centraal aan staan, en altijd via de verzendcontrole (suppressies, dubbel contact, limieten).",
  },
  REVIEW_BEFORE_SENDING: {
    label: "Review vóór verzenden",
    text: "Prospects lopen door tot READY of NEEDS_REVIEW. Er wordt niets verzonden tot een mens ze goedkeurt en in de verzendwachtrij zet.",
  },
};

// ─── Owner Discovery ("Eigenaar vinden") ───────────────────────────────────────────────────────────────
// Research only: no niche, landing page or message. Every field may stay empty; AgentMakers then builds a bounded
// discovery plan itself. The server re-validates everything (OwnerDiscoveryInputSchema + DB constraints).

export type RunKind = "AUDIENCE" | "OWNER";
export const OWNER_MAX_COMPANIES_PER_RUN = 50;
export const OWNER_MAX_BUDGET_EUR = 50;

export interface OwnerRunInput {
  name: string;
  discoveryMode: "AUTONOMOUS" | "COMPANY_LIST";
  country: string;
  region: string;
  industry: string;
  targetPerson: "OWNER" | "DECISION_MAKER";
  limit: string;
  budget: string;
  /** COMPANY_LIST: one company per line — "website" or "Naam, website". */
  companies: string;
}

export const EMPTY_OWNER_RUN: OwnerRunInput = {
  name: "", discoveryMode: "AUTONOMOUS", country: "Netherlands", region: "", industry: "", targetPerson: "OWNER", limit: "25", budget: "5", companies: "",
};

export const OWNER_COUNTRIES: Array<{ value: string; label: string }> = [
  { value: "Netherlands", label: "Nederland" },
  { value: "Belgium", label: "België" },
];

export interface OwnerRunBody {
  name?: string;
  sending_mode: "REVIEW_BEFORE_SENDING";
  start: boolean;
  campaign: {
    run_type: "OWNER_DISCOVERY"; discovery_mode: "AUTONOMOUS" | "COMPANY_LIST"; country: string; region?: string; industry?: string;
    target_person: "OWNER" | "DECISION_MAKER"; limit: number; max_api_budget_eur: number; language: "nl"; companies: Array<{ name?: string; website: string }>;
  };
}

const WEBSITE_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

/** "Naam, website" / "website" per line → company list (invalid lines are reported by line number). */
export function parseCompanyLines(text: string): { companies: Array<{ name?: string; website: string }>; invalid: number[] } {
  const companies: Array<{ name?: string; website: string }> = [];
  const invalid: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[,;\t]/).map((x) => x.trim()).filter(Boolean);
    const website = parts.find((x) => WEBSITE_RE.test(x));
    if (!website) { invalid.push(i + 1); return; }
    const name = parts.filter((x) => x !== website).join(" ").trim();
    companies.push({ ...(name ? { name } : {}), website });
  });
  return { companies, invalid };
}

/** Client-side checks. Only quantity/budget (and, in list mode, the companies) can be wrong — empty fields are fine. */
export function validateOwnerRun(input: OwnerRunInput, start = true): { ok: true; body: OwnerRunBody } | { ok: false; errors: Partial<Record<keyof OwnerRunInput, string>> } {
  const errors: Partial<Record<keyof OwnerRunInput, string>> = {};
  const name = input.name.trim();
  const region = input.region.trim();
  const industry = input.industry.trim();
  const limit = Number(input.limit);
  const budget = Number(String(input.budget).replace(",", "."));
  if (name.length > 120) errors.name = "Maximaal 120 tekens.";
  if (region.length > 80) errors.region = "Maximaal 80 tekens.";
  if (industry.length > 100) errors.industry = "Maximaal 100 tekens.";
  if (!Number.isInteger(limit) || limit < 1) errors.limit = `Kies een aantal van 1 tot ${OWNER_MAX_COMPANIES_PER_RUN}.`;
  else if (limit > OWNER_MAX_COMPANIES_PER_RUN) errors.limit = `Maximaal ${OWNER_MAX_COMPANIES_PER_RUN} bedrijven per run.`;
  if (!Number.isFinite(budget) || budget <= 0) errors.budget = "Budget moet groter dan €0 zijn.";
  else if (budget > OWNER_MAX_BUDGET_EUR) errors.budget = `Maximaal €${OWNER_MAX_BUDGET_EUR}.`;
  let companies: Array<{ name?: string; website: string }> = [];
  if (input.discoveryMode === "COMPANY_LIST") {
    const parsed = parseCompanyLines(input.companies);
    companies = parsed.companies;
    if (parsed.invalid.length) errors.companies = `Geen geldige website op regel ${parsed.invalid.slice(0, 5).join(", ")}.`;
    else if (!companies.length) errors.companies = "Geef minstens één bedrijfswebsite op.";
    else if (companies.length > OWNER_MAX_COMPANIES_PER_RUN) errors.companies = `Maximaal ${OWNER_MAX_COMPANIES_PER_RUN} bedrijven.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    body: {
      ...(name ? { name } : {}), sending_mode: "REVIEW_BEFORE_SENDING", start,
      campaign: {
        run_type: "OWNER_DISCOVERY", discovery_mode: input.discoveryMode, country: input.country.trim() || "Netherlands",
        ...(region ? { region } : {}), ...(industry ? { industry } : {}), target_person: input.targetPerson,
        limit: input.discoveryMode === "COMPANY_LIST" ? Math.min(limit, Math.max(companies.length, 1)) : limit,
        max_api_budget_eur: budget, language: "nl", companies,
      },
    },
  };
}

/** Prefill for "Duplicate run" of an Owner Discovery run. */
export function ownerInputFromRun(run: { name: string; campaign: Record<string, unknown>; budget_cap_eur: number }): OwnerRunInput {
  const c = run.campaign as Partial<OwnerRunBody["campaign"]>;
  return {
    name: `${run.name} (kopie)`.slice(0, 120), discoveryMode: c.discovery_mode ?? "AUTONOMOUS", country: c.country ?? "Netherlands",
    region: c.region ?? "", industry: c.industry ?? "", targetPerson: c.target_person ?? "OWNER",
    limit: String(Math.min(c.limit ?? 25, OWNER_MAX_COMPANIES_PER_RUN)), budget: String(Number(run.budget_cap_eur)),
    companies: (c.companies ?? []).map((x) => (x.name ? `${x.name}, ${x.website}` : x.website)).join("\n"),
  };
}

export const isOwnerRun = (run: { campaign?: unknown } | null | undefined): boolean =>
  !!run?.campaign && typeof run.campaign === "object" && (run.campaign as { run_type?: unknown }).run_type === "OWNER_DISCOVERY";
