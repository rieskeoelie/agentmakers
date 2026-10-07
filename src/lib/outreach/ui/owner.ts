/**
 * Owner Discovery ("Eigenaar vinden") display helpers. Client-safe. Only human labels are shown — no raw enums.
 * Evidence is never upgraded here: the labels mirror the stored owner_discovery result exactly.
 */
import type { OwnerDiscoveryView, ProspectListItem } from "./types";

export type OwnerTone = "success" | "warning" | "danger" | "neutral" | "muted" | "info";

export const OWNER_STATUS_META: Record<string, { label: string; tone: OwnerTone; hint: string }> = {
  READY: { label: "READY", tone: "success", hint: "Bedrijf, eigenaar en persoonlijk zakelijk e-mailadres geverifieerd." },
  NEEDS_REVIEW: { label: "Review nodig", tone: "warning", hint: "Kandidaat gevonden; een mens moet de identiteit of rol bevestigen." },
  OWNER_FOUND_NO_EMAIL: { label: "Eigenaar gevonden, geen e-mail", tone: "info", hint: "Eigenaar bekend, maar geen geverifieerd persoonlijk zakelijk e-mailadres." },
  DECISION_MAKER_FOUND_NO_EMAIL: { label: "Beslisser gevonden, geen e-mail", tone: "info", hint: "Directeur/beslisser bekend, maar geen geverifieerd persoonlijk e-mailadres." },
  NO_OWNER_FOUND: { label: "Geen eigenaar gevonden", tone: "neutral", hint: "Geen persoon met een eigenaar- of directiefunctie gevonden." },
  COMPANY_AMBIGUOUS: { label: "Bedrijf niet eenduidig", tone: "neutral", hint: "Website hoort mogelijk niet bij dit bedrijf; niet verder onderzocht (geen kosten)." },
  WEBSITE_UNREACHABLE: { label: "Website onbereikbaar", tone: "muted", hint: "Website kon niet worden geladen." },
  WEBSITE_PLACEHOLDER: { label: "Placeholder-website", tone: "muted", hint: "Website is leeg of een placeholder." },
  BLOCKED: { label: "Geblokkeerd", tone: "danger", hint: "Uitgesloten of afgewezen." },
  FAILED: { label: "Mislukt", tone: "danger", hint: "Verwerking mislukt." },
  PENDING: { label: "Wacht", tone: "muted", hint: "Nog niet onderzocht." },
  IN_PROGRESS: { label: "Bezig", tone: "info", hint: "Wordt nu onderzocht." },
  CANCELLED: { label: "Geannuleerd", tone: "muted", hint: "Run gestopt." },
};

/** Spec states: Verified / Review required / Insufficient evidence. No numeric score. */
export const CONFIDENCE_META: Record<string, { label: string; tone: OwnerTone }> = {
  VERIFIED: { label: "Geverifieerd", tone: "success" },
  REVIEW: { label: "Review nodig", tone: "warning" },
  PARTIAL: { label: "Review nodig (alleen voornaam)", tone: "warning" },
  INSUFFICIENT: { label: "Onvoldoende bewijs", tone: "neutral" },
};

export const COMPANY_IDENTITY_LABEL: Record<string, string> = {
  VERIFIED: "Bevestigd", AMBIGUOUS: "Niet eenduidig", UNREACHABLE: "Website onbereikbaar", PLACEHOLDER: "Placeholder-website",
};

export const EMAIL_STATE_META: Record<string, { label: string; tone: OwnerTone }> = {
  VERIFIED: { label: "Geverifieerd", tone: "success" },
  REVIEW_ONLY: { label: "Alleen na review", tone: "warning" },
  NOT_FOUND: { label: "Niet gevonden", tone: "neutral" },
  NOT_ELIGIBLE: { label: "Niet bruikbaar", tone: "danger" },
  NOT_SEARCHED: { label: "Niet gezocht (geen persoon)", tone: "muted" },
};

export const ROLE_LABEL: Record<string, string> = { OWNER: "Eigenaar/DGA", DIRECTOR: "Directeur/beslisser" };

export const PROVIDER_STATE_LABEL: Record<string, string> = {
  USED: "Gebruikt", NOT_NEEDED: "Niet nodig", NOT_CONFIGURED: "Niet geconfigureerd", ERROR: "Fout",
};

export const IDENTITY_EVIDENCE_LABEL: Record<string, string> = {
  OPERATING_WEBSITE: "werkende website", COMPANY_NAME_ON_WEBSITE: "bedrijfsnaam op de website", DOMAIN_MATCHES_COMPANY_NAME: "domein past bij bedrijfsnaam",
  USER_SUPPLIED_DOMAIN: "door jou opgegeven website",
};
export const identityEvidenceLabel = (e: string) =>
  e.startsWith("REDIRECTS_TO_OTHER_DOMAIN:") ? `stuurt door naar ${e.slice("REDIRECTS_TO_OTHER_DOMAIN:".length)}` : IDENTITY_EVIDENCE_LABEL[e] ?? e;

export const OWNERSHIP_SIGNAL_LABEL: Record<string, string> = {
  ABOUT_PAGE: "over-ons-pagina", TEAM_PAGE: "teampagina", HISTORY_OR_FOUNDER_TEXT: "historie/oprichter", MANAGEMENT_PAGE: "directiepagina",
  NAMED_PERSON_ON_WEBSITE: "persoon met naam op website",
};

/**
 * The status a reviewer should see for one owner prospect. A human review decision (READY / BLOCKED) wins over the
 * machine status; otherwise the stored owner status; while still processing, the queue state.
 */
export function ownerRowStatus(p: Pick<ProspectListItem, "outcome" | "queue_state" | "owner">): string {
  if (p.outcome === "READY" || p.outcome === "BLOCKED" || p.outcome === "FAILED") return p.outcome;
  if (p.owner?.status) return p.owner.status;
  return p.outcome ?? p.queue_state;
}

export function registrySourceLabel(owners: Array<OwnerDiscoveryView | null | undefined>): string {
  const states = owners.map((o) => o?.providers.registry).filter(Boolean);
  if (states.some((s) => s === "USED" || s === "NOT_NEEDED")) return "Geconfigureerd";
  if (states.some((s) => s === "ERROR")) return "Fout bij opvragen";
  return "Niet geconfigureerd";
}

export function ownerCounts(items: Array<Pick<ProspectListItem, "outcome" | "queue_state" | "owner">>): Record<string, number> {
  const c: Record<string, number> = {};
  for (const p of items) { const s = ownerRowStatus(p); c[s] = (c[s] ?? 0) + 1; }
  return c;
}
