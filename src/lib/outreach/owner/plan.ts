import type { OwnerDiscoveryInput } from "./config";

/**
 * Bounded discovery plan for Owner Discovery. With no industry / region / company given, AgentMakers builds the plan
 * itself from owner-run, commercially relevant SMB categories and mid-size towns of the country — never an empty
 * provider query. The plan (and why) is stored in the run's audit trail.
 */

/** Owner-run trades/services that almost always have a website and an identifiable owner/DGA. */
export const OWNER_RUN_CATEGORIES_NL = [
  "autobedrijf", "installatiebedrijf", "schildersbedrijf", "hoveniersbedrijf", "aannemersbedrijf", "loodgietersbedrijf",
  "elektrotechnisch installatiebedrijf", "dakdekkersbedrijf", "timmerbedrijf", "keukenzaak", "fietsenwinkel", "bandenservice",
  "rijschool", "kapsalon", "makelaardij", "administratiekantoor",
];
export const OWNER_RUN_CATEGORIES_EN = ["car repair", "plumber", "electrician", "painting contractor", "landscaper", "roofing contractor", "accountant", "real estate agent"];

/** Mid-size towns (many independent SMBs, fewer chains than the big four). */
const TOWNS: Record<string, string[]> = {
  netherlands: ["Hoorn", "Alkmaar", "Zwolle", "Amersfoort", "Apeldoorn", "Leeuwarden", "Deventer", "Breda", "Venlo", "Gouda", "Middelburg", "Assen", "Den Helder", "Purmerend", "Enschede", "Roermond"],
};

export interface PlanQuery {
  /** Provider keyword parts — both always non-empty. */
  category: string;
  region: string | null;
  reason: string;
}

export interface DiscoveryPlan {
  generated: boolean;
  basis: string;
  country: string;
  queries: PlanQuery[];
  limits: { target_companies: number; candidate_target: number; max_iterations: number; max_budget_eur: number; min_new_per_iteration: number };
  stop_rules: string[];
}

/** Deterministic rotation (by day) so repeated empty runs explore different combinations, reproducibly. */
function rotate<T>(list: T[], seed: number): T[] {
  if (!list.length) return list;
  const k = ((seed % list.length) + list.length) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

export function buildDiscoveryPlan(input: Pick<OwnerDiscoveryInput, "country" | "region" | "industry" | "limit" | "max_api_budget_eur" | "language">, now: Date = new Date()): DiscoveryPlan {
  const day = Math.floor(now.getTime() / 86_400_000);
  const countryKey = input.country.toLowerCase();
  const categories = input.language === "en" ? OWNER_RUN_CATEGORIES_EN : OWNER_RUN_CATEGORIES_NL;
  const towns = TOWNS[countryKey] ?? [];
  // ~20 usable listings per query after filtering is optimistic; oversample 1.6× the target so selection can prefer
  // companies whose ownership is likely to be established.
  const candidate_target = Math.ceil(input.limit * 1.6);
  const max_iterations = Math.min(8, Math.max(2, Math.ceil(candidate_target / 12)));
  let queries: PlanQuery[];
  let basis: string;
  if (input.industry && input.region) {
    basis = "Branche en plaats opgegeven.";
    queries = [{ category: input.industry, region: input.region, reason: "opgegeven branche + plaats" }];
  } else if (input.industry) {
    basis = "Alleen branche opgegeven: gespreid over middelgrote plaatsen.";
    const ts = rotate(towns, day);
    queries = (ts.length ? ts : [null]).slice(0, max_iterations).map((t) => ({ category: input.industry!, region: t, reason: t ? "opgegeven branche, plaats door AgentMakers gekozen" : "opgegeven branche, heel het land" }));
  } else if (input.region) {
    basis = "Alleen plaats opgegeven: eigenaar-gedreven branches in die plaats.";
    queries = rotate(categories, day).slice(0, max_iterations).map((c) => ({ category: c, region: input.region!, reason: "branche door AgentMakers gekozen, opgegeven plaats" }));
  } else {
    basis = "Niets opgegeven: AgentMakers kiest eigenaar-gedreven MKB-branches in middelgrote plaatsen.";
    const cs = rotate(categories, day);
    const ts = rotate(towns, day * 7 + 3);
    queries = Array.from({ length: max_iterations }, (_, i) => ({ category: cs[i % cs.length]!, region: ts.length ? ts[i % ts.length]! : null, reason: "branche en plaats door AgentMakers gekozen" }));
  }
  return {
    generated: !(input.industry && input.region),
    basis,
    country: input.country,
    queries: queries.slice(0, max_iterations),
    limits: { target_companies: input.limit, candidate_target, max_iterations: Math.min(max_iterations, queries.length), max_budget_eur: input.max_api_budget_eur, min_new_per_iteration: 2 },
    stop_rules: ["RESULT_TARGET (genoeg kandidaten)", "MAX_ITERATIONS", "BUDGET", "NO_NEW_COMPANIES (te weinig nieuwe bedrijven)", "COMPANY_LIMIT (max. te onderzoeken bedrijven)"],
  };
}
