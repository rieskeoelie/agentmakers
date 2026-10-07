/**
 * Review policy (display mirror). The database function outreach_review_blockers is authoritative; this list is
 * identical to outreach_review_resolvable_reasons() and verified by tests.
 *
 * A human may resolve REVIEW-ONLY reasons. Everything else is a hard prohibition and blocks approval.
 * LOCKED: NO_NAMED_RECIPIENT is hard — READY requires a confirmed named decision maker.
 * Identity reviews (PARTIAL_NAME_MATCH_REVIEW, NEAR_MATCH_IDENTITY_UNCONFIRMED) are approvable only when substantiated
 * (outreach_identity_review); approval then accepts the identity and never makes a prospect without recipient READY.
 */
import type { IdentityReview } from "./types";
export const RESOLVABLE_REVIEW_REASONS = [
  "FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL",
  "HOOK_LEVEL_B_REVIEW",
  "NO_VALID_HOOK",
  "EMAIL_NOT_ELIGIBLE:REVIEW_ONLY",
] as const;

export function isResolvableReason(code: string): boolean {
  return (RESOLVABLE_REVIEW_REASONS as readonly string[]).includes(code);
}

/** Identity reviews: approvable by a human ONLY when the server says the evidence substantiates them. */
export const IDENTITY_REVIEW_REASONS = ["PARTIAL_NAME_MATCH_REVIEW", "NEAR_MATCH_IDENTITY_UNCONFIRMED"] as const;
/** Recipient data that can still be missing after an identity approval (the prospect then stays non-READY). */
export const MISSING_RECIPIENT_BLOCKERS = ["NO_RECIPIENT", "NO_NAMED_RECIPIENT", "DECISION_MAKER_EMAIL_NOT_FOUND"] as const;

export const isIdentityReviewReason = (code: string) => (IDENTITY_REVIEW_REASONS as readonly string[]).includes(code);

export function splitReasons(reasons: string[]): { resolvable: string[]; hard: string[] } {
  const ok = (r: string) => isResolvableReason(r) || isIdentityReviewReason(r);
  return { resolvable: reasons.filter(ok), hard: reasons.filter((r) => !ok(r)) };
}

export interface Approvability {
  kind: "identity" | "standard";
  approvable: boolean;
  /** Blockers no human can approve away. */
  hard: string[];
  /** Identity review only: missing data that keeps the prospect non-READY after approval. */
  missingAfterApproval: string[];
}

/** Mirror of outreach_review_action's decision (the database stays authoritative). */
export function reviewApprovability(blockers: string[], identity: IdentityReview | null | undefined): Approvability {
  if (identity?.substantiated) {
    const missing = blockers.filter((b) => (MISSING_RECIPIENT_BLOCKERS as readonly string[]).includes(b));
    const hard = blockers.filter((b) => !(MISSING_RECIPIENT_BLOCKERS as readonly string[]).includes(b));
    return { kind: "identity", approvable: hard.length === 0, hard, missingAfterApproval: missing };
  }
  return { kind: identity ? "identity" : "standard", approvable: blockers.length === 0, hard: blockers, missingAfterApproval: [] };
}

const CORROBORATION_NL: Record<string, string> = {
  SAME_LOCALITY: "zelfde plaats", COMPANY_DOMAIN: "bedrijfsdomein", COMPANY_PHONE: "telefoonnummer van het bedrijf", COMPANY_ADDRESS: "adres van het bedrijf",
};
export const corroborationLabel = (c: string) => CORROBORATION_NL[c] ?? c;

/** Exactly what a reviewer accepts with Approve on an identity review (shown before confirming). */
export function identityApprovalText(companyName: string, identity: IdentityReview, missingAfterApproval: string[]): { title: string; description: string } {
  const c = identity.candidate;
  const who = `${c.name ?? "?"}${c.title ? ` (${c.title})` : ""}`;
  const basis = identity.reason === "NEAR_MATCH_IDENTITY_UNCONFIRMED" && identity.evidence.near_match
    ? `Gevonden bij "${identity.evidence.near_match.organisation}"; ondersteund door: ${identity.evidence.near_match.corroboration.map(corroborationLabel).join(", ")}. Het oorspronkelijke bewijs wordt niet sterker gemaakt; vastgelegd wordt dat jij de identiteit hebt bevestigd.`
    : c.last_name
      ? `Voornaam en functie staan op de eigen website; de achternaam komt uit één Hunter-contact op het bedrijfsdomein.`
      : `Alleen de voornaam staat op de eigen website. Er wordt GEEN achternaam toegevoegd.`;
  const after = missingAfterApproval.length
    ? `Daarna blijft deze prospect niet-READY: ${missingAfterApproval.map(reasonLabel).join(" · ")}`
    : `Daarna gelden alle normale regels (e-mail, uitsluitingen, dubbelingen); READY alleen als alles klopt.`;
  return {
    title: `Identiteit bevestigen: ${who} bij ${companyName}?`,
    description: `Je bevestigt dat ${who} de juiste persoon is bij ${companyName}. ${basis} ${after} Er wordt niets verzonden.`,
  };
}

/** Plain-language explanation of Phase 0 / Stage 2 reason codes. */
export function reasonLabel(code: string): string {
  const [head, ...rest] = code.split(":");
  const tail = rest.join(":");
  const map: Record<string, string> = {
    FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL: "Fit is POSSIBLE_FIT — bevestig handmatig dat dit bedrijf past.",
    HOOK_LEVEL_B_REVIEW: "Opening is geen directe observatie — controleer de tekst.",
    NO_VALID_HOOK: "Geen gepersonaliseerde opening; de mail gebruikt de standaardopening.",
    NO_NAMED_RECIPIENT: "Geen bevestigde beslisser met naam — kan niet worden goedgekeurd.",
    CONTACT_SOURCE_UNKNOWN: "Onbekend waar dit contact is gevonden — kan niet worden goedgekeurd.",
    NO_DECISION_MAKER_ROLE: "Geen functie bekend — beslissersrol niet bevestigd.",
    ROLE_NOT_DECISION_MAKER: "Functie is geen beslissersrol volgens de rolregels.",
    ROLE_NOT_VERIFIED: "Beslissersrol kon niet door de server worden gecontroleerd.",
    EMAIL_NOT_ELIGIBLE: tail === "REVIEW_ONLY" ? "E-mailadres is alleen na controle bruikbaar (zie hieronder waarom)." : "E-mailadres is niet bruikbaar.",
    ACCEPT_ALL_REVIEW_ONLY: "Mailserver accepteert alle adressen (accept-all); bestaan van het adres is niet bevestigd.",
    VERIFICATION_UNKNOWN_NOT_AUTO_SENDABLE: "Verificatie gaf geen uitsluitsel.",
    NOT_VERIFIED: "Adres is niet geverifieerd.",
    WEBMAIL_STATUS: "Webmail-adres.",
    FREE_MAIL_DOMAIN_REVIEW_ONLY: "Gratis maildomein (bijv. gmail) in plaats van het bedrijfsdomein.",
    EMAIL_DOMAIN_DIFFERS_FROM_COMPANY: "E-maildomein hoort niet bij het bedrijf.",
    MALFORMED_EMAIL: "E-mailadres is ongeldig opgebouwd.",
    VERIFICATION_INVALID: "Verificatie: adres bestaat niet.",
    DISPOSABLE_EMAIL: "Wegwerpadres.",
    NO_EMAIL: "Geen e-mailadres.",
    NO_RECIPIENT: "Geen e-mailadres.",
    INVALID_EMAIL: "E-mailadres is ongeldig.",
    GENERIC_ADDRESS_NOT_A_RECIPIENT: "Algemeen adres (info@, receptie@…) — nooit een ontvanger.",
    NEAR_MATCH_IDENTITY_UNCONFIRMED: "Bedrijfsnaam komt sterk overeen, maar identiteit is niet volledig bevestigd.",
    IDENTITY_REVIEW_NOT_SUBSTANTIATED: "Identiteitsreview zonder voldoende bewijs — kan niet worden goedgekeurd.",
    IDENTITY_HUMAN_APPROVED: "Identiteit handmatig bevestigd in review.",
    DECISION_MAKER_EMAIL_NOT_FOUND: "Geen zakelijk e-mailadres van de beslisser gevonden.",
    CONTACT_NOT_FOUND: "Geen beslisser gevonden.",
    PARTIAL_NAME_MATCH_REVIEW: "Alleen de voornaam (met functie) staat op de eigen website — identiteit niet volledig bevestigd.",
    SUPPRESSED: "Contact staat op een uitsluitingslijst.",
    DUPLICATE_CONTACT: "Dit e-mailadres is al READY/NEEDS_REVIEW in een andere prospect.",
    DUPLICATE_COMPANY: "Dit bedrijf zit al in een andere run.",
    HOOK: `Opening schendt een regel (${tail}).`,
    COPY: `Mailtekst bevat een niet-onderbouwde claim (${tail}).`,
    BANNED_PHRASE: "Mailtekst bevat een verboden formulering.",
    UNREPLACED_VARIABLE: "Mailtekst bevat een niet-ingevulde variabele.",
    NOT_PLAIN_TEXT: "Mailtekst bevat opmaak/HTML.",
    REVIEW_APPROVED: "Goedgekeurd in review.",
    REVIEW_REJECTED: "Afgewezen in review.",
    EXCLUDED_COMPANY: "Bedrijf uitgesloten in review.",
    EXCLUDED_CONTACT: "Contact uitgesloten in review.",
  };
  if (head && map[head]) return map[head]!;
  if (head?.startsWith("SUPPRESSED_")) return `Uitgesloten (${head.replace("SUPPRESSED_", "").toLowerCase()}: ${tail.replace(/_/g, " ")}).`;
  if (head?.startsWith("CTA_COUNT_")) return "Mail moet precies één vraag/CTA bevatten.";
  if (/^WORD_COUNT_\d+_EXTREME$/.test(head ?? "")) return "Mail is veel te kort of te lang.";
  if (head?.startsWith("PIPELINE_STATUS")) return `Pipeline-status was ${tail}.`;
  return code;
}

export const REVIEW_ACTION_COPY = {
  APPROVE: { label: "Goedkeuren", help: "Wordt READY als alle regels kloppen. Er wordt niets verzonden." },
  REJECT: { label: "Afwijzen", help: "Wordt BLOCKED voor deze run." },
  EXCLUDE_COMPANY: { label: "Bedrijf uitsluiten", help: "Domein + bedrijf op je uitsluitingslijst; nooit meer benaderen." },
  EXCLUDE_CONTACT: { label: "Contact uitsluiten", help: "Dit e-mailadres/deze persoon op je uitsluitingslijst." },
} as const;
