import { domainToASCII } from "node:url";

/** Second-level public suffixes we see in practice. Not a full PSL (known limitation). */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.za", "com.br", "co.jp", "com.tr", "com.mx", "co.in",
]);

/** Domains that are directories, social profiles, booking platforms or site builders' shared hosts. */
const NON_COMPANY_DOMAINS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com", "tiktok.com",
  "google.com", "goo.gl", "g.page", "business.site", "sites.google.com", "linktr.ee", "wa.me",
  "yelp.com", "yelp.nl", "tripadvisor.com", "tripadvisor.nl", "treatwell.nl", "zorgkaartnederland.nl",
  "telefoonboek.nl", "detelefoongids.nl", "goudengids.nl", "opendi.nl", "cylex.nl", "werkspot.nl",
  "funda.nl", "thefork.nl", "thefork.com", "booking.com", "marktplaats.nl", "kvk.nl",
];

/**
 * Normalize a URL or host to a lowercase ASCII (punycode) hostname without protocol, www, port, path.
 * Returns null for anything that is not a plausible public hostname.
 */
export function normalizeHost(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `http://${s}`;
  let host: string;
  try {
    host = new URL(s).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  const ascii = domainToASCII(host);
  if (!ascii) return null;
  host = ascii.replace(/^www\d?\./, "");
  if (!host.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return null;
  return host;
}

/** Registrable root domain (eTLD+1, approximate). */
export function rootDomain(input: string | null | undefined): string | null {
  const host = normalizeHost(input);
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

export function isNonCompanyDomain(domain: string): boolean {
  return NON_COMPANY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?|praktijk|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface DedupeCandidate {
  domain: string | null;
  company_name: string;
  city?: string | null;
}

/** Key: normalized root domain; fallback: normalized name + city. */
export function dedupeKey(c: DedupeCandidate): string {
  const d = rootDomain(c.domain);
  if (d) return `domain:${d}`;
  return `name:${normalizeName(c.company_name)}|${normalizeName(c.city ?? "")}`;
}

/** Stable dedupe that keeps the first occurrence and reports what was merged. */
export function dedupe<T extends DedupeCandidate>(items: T[]): { kept: T[]; duplicates: Array<{ item: T; key: string }> } {
  const seen = new Set<string>();
  const kept: T[] = [];
  const duplicates: Array<{ item: T; key: string }> = [];
  for (const item of items) {
    const key = dedupeKey(item);
    if (seen.has(key)) {
      duplicates.push({ item, key });
      continue;
    }
    seen.add(key);
    kept.push(item);
  }
  return { kept, duplicates };
}
