/**
 * Review policy (display mirror). The database function outreach_review_blockers is authoritative; this list is
 * identical to outreach_review_resolvable_reasons() and verified by tests.
 *
 * A human may resolve REVIEW-ONLY reasons. Everything else is a hard prohibition and blocks approval.
 * LOCKED: NO_NAMED_RECIPIENT is hard — READY requires a confirmed named decision maker.
 */
export const RESOLVABLE_REVIEW_REASONS = [
  "FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL",
  "HOOK_LEVEL_B_REVIEW",
  "NO_VALID_HOOK",
  "EMAIL_NOT_ELIGIBLE:REVIEW_ONLY",
] as const;

export function isResolvableReason(code: string): boolean {
  return (RESOLVABLE_REVIEW_REASONS as readonly string[]).includes(code);
}

export function splitReasons(reasons: string[]): { resolvable: string[]; hard: string[] } {
  return { resolvable: reasons.filter(isResolvableReason), hard: reasons.filter((r) => !isResolvableReason(r)) };
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
  APPROVE: { label: "Goedkeuren", help: "Wordt READY. Er wordt niets verzonden." },
  REJECT: { label: "Afwijzen", help: "Wordt BLOCKED voor deze run." },
  EXCLUDE_COMPANY: { label: "Bedrijf uitsluiten", help: "Domein + bedrijf op je uitsluitingslijst; nooit meer benaderen." },
  EXCLUDE_CONTACT: { label: "Contact uitsluiten", help: "Dit e-mailadres/deze persoon op je uitsluitingslijst." },
} as const;
