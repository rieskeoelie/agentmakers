import { rootDomain } from "./domain";

export type VerificationStatus = "valid" | "accept_all" | "unknown" | "invalid" | "webmail" | "disposable" | "not_verified";
export type EmailSource = "hunter_domain_search" | "hunter_email_finder" | "prospeo_enrich_person" | "none";

export type Eligibility = "ELIGIBLE" | "REVIEW_ONLY" | "NOT_ELIGIBLE";

export interface EmailEligibility {
  eligibility: Eligibility;
  reasons: string[];
  is_generic: boolean;
  is_free_mail: boolean;
  domain_matches_company: boolean;
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "outlook.com", "outlook.nl", "live.com", "live.nl",
  "msn.com", "yahoo.com", "yahoo.nl", "icloud.com", "me.com", "mac.com", "aol.com", "gmx.com", "gmx.net", "gmx.de",
  "web.de", "proton.me", "protonmail.com", "kpnmail.nl", "kpnplanet.nl", "planet.nl", "home.nl", "ziggo.nl",
  "chello.nl", "casema.nl", "xs4all.nl", "hetnet.nl", "tele2.nl", "upcmail.nl", "zeelandnet.nl", "quicknet.nl",
]);

const GENERIC_LOCAL = /^(info|contact|hallo|hello|hi|mail|post|office|kantoor|receptie|reception|balie|admin|administratie|administration|secretariaat|praktijk|tandarts|team|support|service|customer-?service|customerservice|customercare|klantenservice|sales|verkoop|marketing|afspraak|afspraken|afspraken|planning|boekhouding|finance|facturen|factuur|billing|jobs|vacatures|hr|noreply|no-reply|webmaster|privacy|assistentes|assistentie|spoed)([.\-_+]?\w*)?$/i;

export function isGenericEmail(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return GENERIC_LOCAL.test(local);
}

export function isFreeMail(email: string): boolean {
  const d = (email.split("@")[1] ?? "").toLowerCase();
  return FREE_MAIL.has(d);
}

export function isSyntacticallyValidEmail(email: string): boolean {
  return /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) && !email.includes("..");
}

/**
 * Email send-eligibility per CLAUDE.md:
 * - verified valid + personal + company domain → ELIGIBLE (Phase 0 still never sends)
 * - accept_all → REVIEW_ONLY
 * - unknown / not verified → REVIEW_ONLY (never automatically sendable)
 * - generic/role mailbox (info@, contact@, receptie@ …) → NOT_ELIGIBLE: never a primary recipient
 * - free-mail domain → REVIEW_ONLY
 * - domain mismatch with company → REVIEW_ONLY
 * - invalid / disposable / malformed → NOT_ELIGIBLE
 */
export function evaluateEmail(email: string | null, status: VerificationStatus, companyDomain: string | null): EmailEligibility {
  if (!email) {
    return { eligibility: "NOT_ELIGIBLE", reasons: ["NO_EMAIL"], is_generic: false, is_free_mail: false, domain_matches_company: false };
  }
  const reasons: string[] = [];
  const generic = isGenericEmail(email);
  const free = isFreeMail(email);
  const emailRoot = rootDomain(email.split("@")[1] ?? "");
  const companyRoot = rootDomain(companyDomain);
  const domainMatch = !!emailRoot && !!companyRoot && emailRoot === companyRoot;

  if (!isSyntacticallyValidEmail(email)) reasons.push("MALFORMED_EMAIL");
  if (status === "invalid") reasons.push("VERIFICATION_INVALID");
  if (status === "disposable") reasons.push("DISPOSABLE_EMAIL");
  if (generic) reasons.push("GENERIC_ADDRESS_NOT_A_RECIPIENT");
  const hardFail = reasons.length > 0;

  if (status === "accept_all") reasons.push("ACCEPT_ALL_REVIEW_ONLY");
  if (status === "unknown") reasons.push("VERIFICATION_UNKNOWN_NOT_AUTO_SENDABLE");
  if (status === "not_verified") reasons.push("NOT_VERIFIED");
  if (status === "webmail") reasons.push("WEBMAIL_STATUS");
  if (free) reasons.push("FREE_MAIL_DOMAIN_REVIEW_ONLY");
  if (!domainMatch && !free) reasons.push("EMAIL_DOMAIN_DIFFERS_FROM_COMPANY");

  const eligibility: Eligibility = hardFail ? "NOT_ELIGIBLE" : reasons.length === 0 && status === "valid" ? "ELIGIBLE" : "REVIEW_ONLY";
  return { eligibility, reasons, is_generic: generic, is_free_mail: free, domain_matches_company: domainMatch };
}

/**
 * Should we spend an Email Verifier call? Only when it can materially change eligibility:
 * the address is personal, on the company domain, not free-mail, and currently unverified/unknown.
 * Never for accept_all (domain-level; re-verifying returns accept_all again) and never after Email Finder
 * already returned a verification result.
 */
export function shouldVerify(email: string | null, status: VerificationStatus, source: EmailSource, companyDomain: string | null): boolean {
  if (!email) return false;
  if (source === "hunter_email_finder" && status !== "not_verified") return false;
  if (status !== "not_verified" && status !== "unknown") return false;
  const e = evaluateEmail(email, "valid", companyDomain);
  return e.eligibility === "ELIGIBLE";
}
