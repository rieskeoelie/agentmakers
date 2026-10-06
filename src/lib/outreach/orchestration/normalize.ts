import { normalizeName, rootDomain } from "../domain";

/** Normalization shared by dedupe and suppression (reuses the Phase 0 domain/name rules). */
export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export function normalizeDomain(input: string | null | undefined): string | null {
  return rootDomain(input);
}

export function companyKey(name: string): string {
  return normalizeName(name);
}

/** A named person at a company: "<normalized name>@<root domain>". */
export function contactKey(name: string | null | undefined, domain: string | null | undefined): string | null {
  const n = name ? normalizeName(name) : "";
  const d = normalizeDomain(domain);
  return n && d ? `${n}@${d}` : null;
}

export type SuppressionKind = "EMAIL" | "CONTACT" | "DOMAIN" | "COMPANY";

export function normalizeSuppressionValue(kind: SuppressionKind, value: string): string | null {
  switch (kind) {
    case "EMAIL":
      return normalizeEmail(value);
    case "DOMAIN":
      return normalizeDomain(value);
    case "COMPANY":
      return companyKey(value) || null;
    case "CONTACT": {
      const at = value.lastIndexOf("@");
      return at > 0 ? contactKey(value.slice(0, at), value.slice(at + 1)) : null;
    }
  }
}
