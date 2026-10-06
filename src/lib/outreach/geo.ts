import type { DiscoveredCompany } from "./providers/dataforseo";

/**
 * Deterministic geographic sanity check on DataForSEO locality/address data.
 * The search keyword ("tandarts Hoorn") is NOT trusted: Google Maps also returns e.g. "Den Hoorn" (Zuid-Holland).
 *
 * - campaign region = a locality ("Hoorn") → company locality must equal it exactly (folded).
 *   "Den Hoorn" ≠ "Hoorn". Neighbouring localities (e.g. Zwaag) also do not match — deliberate, conservative.
 * - campaign region = a Dutch province → compared with address_info.region when DataForSEO provides it.
 * - "Hoorn, Noord-Holland" → the locality part is used.
 * - Country: address_info.country_code must match the campaign country when both are known.
 * - Missing data → not filtered (reported as unknown), never guessed.
 */

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const NL_PROVINCES = new Set([
  "noord holland", "north holland", "zuid holland", "south holland", "utrecht", "flevoland", "gelderland", "overijssel", "drenthe",
  "groningen", "friesland", "fryslan", "zeeland", "noord brabant", "north brabant", "limburg",
].map(fold));

const COUNTRY_CODES: Record<string, string> = {
  netherlands: "NL", nederland: "NL", "the netherlands": "NL", belgium: "BE", belgie: "BE", belgique: "BE",
  germany: "DE", deutschland: "DE", duitsland: "DE", luxembourg: "LU", switzerland: "CH", austria: "AT",
};

/** Locality from address_info.city, else parsed from a Dutch address "… 1621 AA Hoorn". */
export function companyLocality(c: Pick<DiscoveredCompany, "city" | "address">): string | null {
  if (c.city && c.city.trim()) return c.city.trim();
  const m = c.address?.match(/\b\d{4}\s?[A-Z]{2}\s+(.+?)\s*$/);
  return m ? m[1]!.trim() : null;
}

export interface GeoDecision {
  match: boolean | null;
  reason: string;
}

export function geographyDecision(c: Pick<DiscoveredCompany, "city" | "address" | "region" | "country">, campaign: { region?: string; country: string }): GeoDecision {
  const expectedCc = COUNTRY_CODES[fold(campaign.country)];
  if (expectedCc && c.country && c.country.toUpperCase() !== expectedCc) return { match: false, reason: `country ${c.country} ≠ ${expectedCc}` };
  if (!campaign.region) return { match: true, reason: "no region constraint" };
  const [localityPart, ...rest] = campaign.region.split(",").map((s) => s.trim()).filter(Boolean);
  const target = fold(localityPart ?? "");
  if (NL_PROVINCES.has(target) && rest.length === 0) {
    if (!c.region) return { match: null, reason: "province unknown in provider data" };
    return fold(c.region) === target ? { match: true, reason: "province matches" } : { match: false, reason: `province ${c.region}` };
  }
  const loc = companyLocality(c);
  if (!loc) return { match: null, reason: "locality unknown in provider data" };
  return fold(loc) === target ? { match: true, reason: "locality matches" } : { match: false, reason: `locality ${loc} ≠ ${localityPart}` };
}
