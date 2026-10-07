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
