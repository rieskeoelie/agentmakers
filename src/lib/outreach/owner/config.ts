import { z } from "zod";
import { DEFAULT_ROLE_PRIORITY } from "../config";

/**
 * Owner Discovery ("Eigenaar vinden") run input. Research only: no landing page, no campaign messaging, never sends.
 * Every field except the bounded quantity/budget may be blank — an empty autonomous run is valid.
 */
export const OWNER_DISCOVERY = "OWNER_DISCOVERY" as const;
/** Hard ceiling of companies investigated per Owner Discovery run (the database enforces ≤ 50 as well). */
export const OWNER_MAX_COMPANIES = 50;
export const OWNER_DEFAULT_COMPANIES = 25;
export const OWNER_DEFAULT_BUDGET_EUR = 5;
export const OWNER_MAX_BUDGET_EUR = 50;

const COUNTRY_ALIASES: Record<string, string> = {
  nl: "Netherlands", nederland: "Netherlands", netherlands: "Netherlands", holland: "Netherlands",
  be: "Belgium", belgie: "Belgium", "belgië": "Belgium", belgium: "Belgium",
  de: "Germany", duitsland: "Germany", germany: "Germany", deutschland: "Germany",
};
export function normalizeCountry(v: string | undefined): string {
  if (!v) return "Netherlands";
  return COUNTRY_ALIASES[v.trim().toLowerCase()] ?? v.trim();
}

const blank = (max: number) => z.string().max(max).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : undefined));

export const OwnerCompanyInputSchema = z.object({
  name: blank(160),
  website: z.string().trim().min(3).max(300),
});

export const OwnerDiscoveryInputSchema = z.object({
  run_type: z.literal(OWNER_DISCOVERY),
  /** AUTONOMOUS = AgentMakers finds companies itself; COMPANY_LIST = the user supplies companies (websites). */
  discovery_mode: z.enum(["AUTONOMOUS", "COMPANY_LIST"]).default("AUTONOMOUS"),
  /** Provider location name (English). Dutch names / ISO codes are normalised; blank = Netherlands. */
  country: blank(60).transform((v) => normalizeCountry(v)),
  region: blank(80),
  industry: blank(100),
  /** OWNER = eigenaar / DGA / oprichter only; DECISION_MAKER = also directeur / bedrijfsleider. */
  target_person: z.enum(["OWNER", "DECISION_MAKER"]).default("OWNER"),
  limit: z.coerce.number().int().min(1).max(OWNER_MAX_COMPANIES).default(OWNER_DEFAULT_COMPANIES),
  max_api_budget_eur: z.coerce.number().positive().max(OWNER_MAX_BUDGET_EUR).default(OWNER_DEFAULT_BUDGET_EUR),
  language: z.enum(["nl", "en"]).default("nl"),
  companies: z.array(OwnerCompanyInputSchema).max(OWNER_MAX_COMPANIES).default([]),
  exclude_domains: z.array(z.string()).default([]),
  /** Never sends — kept explicit so it is visible in stored data. */
  sending: z.literal("NEVER").default("NEVER"),
}).superRefine((v, ctx) => {
  if (v.discovery_mode === "COMPANY_LIST" && v.companies.length === 0) {
    ctx.addIssue({ code: "custom", path: ["companies"], message: "Geef minstens één bedrijfswebsite op." });
  }
});
export type OwnerDiscoveryInput = z.infer<typeof OwnerDiscoveryInputSchema>;

export const isOwnerDiscoveryCampaign = (c: unknown): boolean => !!c && typeof c === "object" && (c as { run_type?: unknown }).run_type === OWNER_DISCOVERY;

/** Role priority used for owner discovery: owners first; directors are found too but never called owner. */
export function ownerRolePriority(): string[] {
  return DEFAULT_ROLE_PRIORITY.filter((r) => ["owner", "founder", "managing director"].includes(r));
}

export { autoOwnerRunName } from "./naming";
