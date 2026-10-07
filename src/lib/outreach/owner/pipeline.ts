import { companyAliases } from "../companyName";
import { discoverContact, type ContactSelection } from "../contacts";
import { rootDomain } from "../domain";
import { evaluateEmail, isGenericEmail, shouldVerify, type EmailEligibility, type VerificationStatus } from "../eligibility";
import { prospeoDecision, type PipelineDeps, type ProspectRecord, type StageName, type StageStatus } from "../pipeline";
import type { DiscoveredCompany } from "../providers/dataforseo";
import { fetchWebsite, type FetchedPage } from "../research";
import { roleVocabulary } from "../vocabulary";
import { ownerRolePriority, type OwnerDiscoveryInput } from "./config";

/**
 * Owner-first research for one company (Owner Discovery runs). Research only — no ICP fit, no brief, no message,
 * never sends. Order: company identity → canonical domain → operating website → own pages (about/team/contact/history/
 * management) → public evidence → decision-maker providers → registry (if configured) → person candidates → role
 * verification → evidence state → ONLY THEN the person's business email → verification → status.
 *
 * Evidence standard (never weakened to reach READY):
 *   VERIFIED    full name + owner/director title on the company's OWN website, or an authoritative registry record
 *   REVIEW      full name + role from a public source with an exact company match, a Hunter position, a corroborated
 *               near match, or a website first name matched to exactly one Hunter contact
 *   PARTIAL     first name + owner title on the company's own website (no surname is ever invented)
 *   INSUFFICIENT anything weaker (seniority metadata, vague titles, no person)
 * READY requires: company identity VERIFIED + person VERIFIED (+ owner role for an owner target) + personal business
 * email VERIFIED (valid, on the company domain, never a generic mailbox).
 */

export type OwnerConfidence = "VERIFIED" | "REVIEW" | "PARTIAL" | "INSUFFICIENT";
export type OwnerStatus =
  | "READY" | "NEEDS_REVIEW" | "OWNER_FOUND_NO_EMAIL" | "DECISION_MAKER_FOUND_NO_EMAIL" | "NO_OWNER_FOUND"
  | "COMPANY_AMBIGUOUS" | "WEBSITE_UNREACHABLE" | "WEBSITE_PLACEHOLDER";
export type EvidenceSource = "WEBSITE" | "REGISTRY" | "PUBLIC_SEARCH" | "HUNTER_POSITION" | "NEAR_MATCH" | "WEBSITE_FIRST_NAME" | "HUNTER_SENIORITY";

export interface OwnerDiscoveryResult {
  company_identity: { state: "VERIFIED" | "AMBIGUOUS" | "UNREACHABLE" | "PLACEHOLDER"; canonical_domain: string; website: string | null; evidence: string[] };
  ownership_signals: string[];
  person: { name: string | null; first_name: string | null; last_name: string | null; title: string | null; role_class: "OWNER" | "DIRECTOR" | null; source: EvidenceSource | null; source_url: string | null } | null;
  confidence: OwnerConfidence;
  confidence_reason: string;
  /** Short human summary of where the identity evidence came from ("Website", "Website + registry", …). */
  evidence_label: string;
  email: { state: "VERIFIED" | "REVIEW_ONLY" | "NOT_FOUND" | "NOT_ELIGIBLE" | "NOT_SEARCHED"; verification: VerificationStatus | null; generic_company_emails: string[] };
  providers: { hunter: "USED"; prospeo: "NOT_CONFIGURED" | "NOT_NEEDED" | "USED" | "ERROR"; registry: "NOT_CONFIGURED" | "USED" | "NOT_NEEDED" | "ERROR"; public_search: "USED" | "NOT_NEEDED" | "NOT_CONFIGURED" };
  status: OwnerStatus;
  target_person: OwnerDiscoveryInput["target_person"];
}

const OWNER_ROLES = new Set(["owner", "founder", "garagehouder", "garage-eigenaar", "garage eigenaar", "eigenaar garage", "eigenaar autobedrijf"]);
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function roleClass(contact: Pick<ContactSelection, "role_match"> | null): "OWNER" | "DIRECTOR" | null {
  const r = contact?.role_match?.matched_role;
  if (!r) return null;
  return OWNER_ROLES.has(fold(r)) ? "OWNER" : "DIRECTOR";
}

export function evidenceSource(c: ContactSelection): EvidenceSource | null {
  if (c.identification === "first_name_only") return "WEBSITE_FIRST_NAME";
  if (c.identification === "near_match_review") return "NEAR_MATCH";
  if (c.identification === "first_name_hunter_match") return "HUNTER_POSITION";
  switch (c.source) {
    case "website_title": case "website_title+hunter_domain_search": case "website_title+hunter_email_finder": return "WEBSITE";
    case "registry": case "registry+hunter_email_finder": return "REGISTRY";
    case "public_search": case "public_search+hunter_email_finder": return "PUBLIC_SEARCH";
    case "hunter_domain_search": return "HUNTER_POSITION";
    case "hunter_metadata": return "HUNTER_SENIORITY";
    default: return null;
  }
}

const EVIDENCE_LABEL: Record<EvidenceSource, string> = {
  WEBSITE: "Website van het bedrijf", REGISTRY: "Register", PUBLIC_SEARCH: "Publieke bron + bedrijfsmatch", HUNTER_POSITION: "Hunter-functie op bedrijfsdomein",
  NEAR_MATCH: "Publieke bron, bijna-match + bevestiging", WEBSITE_FIRST_NAME: "Website van het bedrijf (alleen voornaam)", HUNTER_SENIORITY: "Alleen Hunter-senioriteit",
};

/** Evidence → human confidence state. Pure; the evidence itself is never upgraded. */
export function identityConfidence(c: ContactSelection | null, companyVerified: boolean): { confidence: OwnerConfidence; reason: string; source: EvidenceSource | null } {
  if (!c || !c.name) return { confidence: "INSUFFICIENT", reason: "Geen persoon met een eigenaar- of directiefunctie gevonden.", source: null };
  const src = evidenceSource(c);
  const full = !!c.first_name && !!c.last_name;
  if (!src || src === "HUNTER_SENIORITY" || !c.role_match) return { confidence: "INSUFFICIENT", reason: "Alleen een vage functie-aanduiding; niet als eigenaar/beslisser aangemerkt.", source: src };
  if (src === "WEBSITE_FIRST_NAME") return { confidence: "PARTIAL", reason: "Voornaam + functie op de eigen website; achternaam niet gepubliceerd (wordt niet verzonnen).", source: src };
  if ((src === "WEBSITE" || src === "REGISTRY") && full && companyVerified) return { confidence: "VERIFIED", reason: src === "REGISTRY" ? "Naam en functie uit een officieel register." : "Naam en functie staan op de eigen website van het bedrijf.", source: src };
  if (full) return { confidence: "REVIEW", reason: src === "PUBLIC_SEARCH" ? "Naam en functie uit een publieke bron met exacte bedrijfsmatch — handmatig bevestigen." : src === "NEAR_MATCH" ? "Bedrijfsnaam komt sterk overeen, maar identiteit is niet volledig bevestigd." : "Functie volgens Hunter of voornaam-koppeling — handmatig bevestigen.", source: src };
  return { confidence: "INSUFFICIENT", reason: "Onvolledige naam.", source: src };
}

/** Is the fetched website really this company (name/brand or domain identity), not a franchise/portal? */
export function companyIdentity(company: DiscoveredCompany, pages: FetchedPage[], domain: string): { verified: boolean; evidence: string[] } {
  const evidence: string[] = [];
  const finalRoot = rootDomain(pages[0]?.url);
  if (finalRoot && finalRoot !== domain) return { verified: false, evidence: [`REDIRECTS_TO_OTHER_DOMAIN:${finalRoot}`] };
  evidence.push("OPERATING_WEBSITE");
  const ca = companyAliases(company.company_name, company.city ?? null, domain);
  const label = (domain.split(".")[0] ?? "").replace(/[^a-z0-9]/g, "");
  const text = fold(pages.map((p) => `${p.parsed.title} ${p.parsed.text.slice(0, 20_000)}`).join(" "));
  const brand = ca.brand.filter((b) => b.length >= 3);
  if (company.raw_reference.endpoint === "user_company_list" && fold(company.company_name) === domain) evidence.push("USER_SUPPLIED_DOMAIN");
  if (brand.length && brand.every((b) => text.includes(b))) evidence.push("COMPANY_NAME_ON_WEBSITE");
  if (ca.compact || brand.some((b) => label.includes(b.replace(/[^a-z0-9]/g, "")))) evidence.push("DOMAIN_MATCHES_COMPANY_NAME");
  const verified = evidence.includes("USER_SUPPLIED_DOMAIN") || evidence.includes("COMPANY_NAME_ON_WEBSITE") || evidence.includes("DOMAIN_MATCHES_COMPANY_NAME");
  return { verified, evidence };
}

export function ownershipSignals(pages: FetchedPage[], contact: ContactSelection | null): string[] {
  const s = new Set<string>();
  for (const p of pages) {
    const path = (() => { try { return new URL(p.url).pathname.toLowerCase(); } catch { return ""; } })();
    if (p.kind === "about") s.add("ABOUT_PAGE");
    if (p.kind === "team") s.add("TEAM_PAGE");
    if (/historie|geschiedenis|history|sinds|oprichter|founder/.test(`${path} ${fold(p.parsed.text.slice(0, 5000))}`)) s.add("HISTORY_OR_FOUNDER_TEXT");
    if (/directie|management|bestuur/.test(path)) s.add("MANAGEMENT_PAGE");
  }
  if (contact?.source?.startsWith("website_title") || contact?.identification === "first_name_only") s.add("NAMED_PERSON_ON_WEBSITE");
  return [...s];
}

const newStages = (): Record<StageName, StageStatus> => ({
  prefilter: { status: "ok" }, website_fetch: { status: "not_run" }, evidence: { status: "not_run" },
  fit: { status: "skipped", reason: "OWNER_DISCOVERY: geen doelgroep-kwalificatie" }, contact: { status: "not_run" }, eligibility: { status: "not_run" },
  brief: { status: "skipped", reason: "OWNER_DISCOVERY: geen mail" }, hook: { status: "skipped", reason: "OWNER_DISCOVERY: geen mail" }, render: { status: "skipped", reason: "OWNER_DISCOVERY: geen mail" },
});

export async function processOwnerProspect(company: DiscoveredCompany, index: number, input: OwnerDiscoveryInput, deps: PipelineDeps): Promise<ProspectRecord> {
  const domain = rootDomain(company.domain)!;
  const rec: ProspectRecord = {
    index, company, domain, status: "FAILED", status_reasons: [], warnings: [], stages: newStages(), pages: [], fetch_errors: [],
    contact: null, verification_status: null, email_eligibility: null, prospeo: null, hunter_email_before_prospeo: null, website_host_fallback: null,
    fit: null, brief: null, hook: null, email: null, quarantined_snippets: [], cost_eur: 0,
  };
  const od: OwnerDiscoveryResult = {
    company_identity: { state: "UNREACHABLE", canonical_domain: domain, website: null, evidence: [] }, ownership_signals: [], person: null,
    confidence: "INSUFFICIENT", confidence_reason: "", evidence_label: "—",
    email: { state: "NOT_SEARCHED", verification: null, generic_company_emails: [] },
    providers: { hunter: "USED", prospeo: deps.prospeo ? "NOT_NEEDED" : "NOT_CONFIGURED", registry: deps.registry ? "NOT_NEEDED" : "NOT_CONFIGURED", public_search: deps.publicSearch ? "NOT_NEEDED" : "NOT_CONFIGURED" },
    status: "NO_OWNER_FOUND", target_person: input.target_person,
  };
  rec.owner_discovery = od;
  let stage: StageName = "website_fetch";
  const finish = (status: ProspectRecord["status"], owner: OwnerStatus, reasons: string[] = []) => {
    rec.status = status; od.status = owner;
    // The owner status leads the reasons unless it IS the outcome (READY / NEEDS_REVIEW carry only their review reasons).
    rec.status_reasons = owner === status ? reasons : [owner, ...reasons];
    rec.cost_eur = deps.cost.costForProspect(domain);
    return rec;
  };
  try {
    // 1–3. Company identity, canonical domain, operating website (free).
    const site = await fetchWebsite(company.website ?? `https://${company.domain}`, deps.websiteFetcher, { maxPages: deps.settings.maxPages, maxTextChars: deps.settings.maxTextChars, prospect: domain });
    rec.pages = site.pages.map((p) => ({ url: p.url, kind: p.kind, fetched_at: p.fetched_at }));
    rec.fetch_errors = site.errors;
    rec.website_host_fallback = site.host_fallback ?? null;
    if (site.placeholder) {
      rec.stages.website_fetch = { status: "skipped", reason: `WEBSITE_PLACEHOLDER: ${site.placeholder}` };
      od.company_identity = { state: "PLACEHOLDER", canonical_domain: domain, website: site.pages[0]?.url ?? null, evidence: [site.placeholder] };
      return finish("SKIPPED", "WEBSITE_PLACEHOLDER", ["WEBSITE_PLACEHOLDER"]);
    }
    if (!site.pages.length) {
      rec.stages.website_fetch = { status: "failed", reason: `WEBSITE_UNREACHABLE: ${site.errors[0]?.error ?? "unknown"}` };
      return finish("SKIPPED", "WEBSITE_UNREACHABLE", ["WEBSITE_UNREACHABLE"]);
    }
    rec.stages.website_fetch = { status: "ok", reason: `${site.pages.length} page(s)` };
    const ident = companyIdentity(company, site.pages, domain);
    od.company_identity = { state: ident.verified ? "VERIFIED" : "AMBIGUOUS", canonical_domain: domain, website: site.pages[0]!.url, evidence: ident.evidence };
    if (!ident.verified) {
      // No paid enrichment on a company we cannot even identify.
      rec.stages.evidence = { status: "skipped", reason: "COMPANY_AMBIGUOUS" };
      return finish("SKIPPED", "COMPANY_AMBIGUOUS", ["COMPANY_AMBIGUOUS"]);
    }
    rec.stages.evidence = { status: "ok", reason: ident.evidence.join(", ") };

    // 4–9. Own pages, public evidence, providers, registry, candidates, role verification.
    stage = "contact";
    const vocabulary = roleVocabulary(input.industry ?? company.category ?? null, ownerRolePriority());
    const contact = await discoverContact({
      domain, pages: site.pages, priority: vocabulary.priority, vocabulary, hunter: deps.hunter, prospect: domain,
      publicSearch: deps.publicSearch ? { provider: deps.publicSearch, companyName: company.company_name, city: company.city, language: input.language, country: input.country, phone: company.phone, address: company.address } : undefined,
      sameDomain: { fetcher: deps.websiteFetcher, homeUrl: site.pages[0]!.url, search: deps.publicSearch, language: input.language, country: input.country, cost: deps.cost },
      registry: deps.registry ? { source: deps.registry, lookup: { company_name: company.company_name, domain, city: company.city, country: input.country, address: company.address } } : undefined,
    });
    rec.contact = contact;
    rec.stages.contact = contact.name ? { status: "ok", reason: contact.source } : { status: "failed", reason: contact.failure_reason ?? "NO_CONTACT" };
    od.providers.public_search = !deps.publicSearch ? "NOT_CONFIGURED" : contact.public_search ? "USED" : "NOT_NEEDED";
    // Truthful registry state: without a configured RegistrySource it is NOT_CONFIGURED, never "verified".
    const rs = contact.registry?.status;
    od.providers.registry = !deps.registry || rs === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : rs === "ERROR" ? "ERROR" : rs === "NOT_NEEDED" || !rs ? "NOT_NEEDED" : "USED";
    od.ownership_signals = ownershipSignals(site.pages, contact);
    od.email.generic_company_emails = contact.company_generic_emails;

    // 10. Evidence → confidence (identity of person and role).
    const conf = identityConfidence(contact, true);
    od.confidence = conf.confidence;
    od.confidence_reason = conf.reason;
    const rc = roleClass(contact);
    if (conf.confidence !== "INSUFFICIENT") {
      od.person = { name: contact.name, first_name: contact.first_name, last_name: contact.last_name, title: contact.title, role_class: rc, source: conf.source, source_url: contact.title_source_url };
      const extra = contact.registry?.status === "FOUND" && conf.source !== "REGISTRY" ? " + register" : "";
      od.evidence_label = `${conf.source ? EVIDENCE_LABEL[conf.source] : "—"}${extra}`;
    } else if (contact.name) {
      od.evidence_label = conf.source ? EVIDENCE_LABEL[conf.source] : "—";
    }

    // 11–12. Business email of THIS person (Hunter result kept, Prospeo fallback, verification). Never a generic mailbox.
    stage = "eligibility";
    let vstatus: VerificationStatus = contact.verification_status;
    let elig: EmailEligibility | null = null;
    const hasPerson = conf.confidence !== "INSUFFICIENT";
    if (hasPerson && contact.email && !isGenericEmail(contact.email)) {
      if (shouldVerify(contact.email, vstatus, contact.email_source, domain)) {
        vstatus = await deps.hunter.verify(contact.email, domain);
        contact.notes.push(`Email Verifier → ${vstatus}`);
      }
      elig = evaluateEmail(contact.email, vstatus, domain);
    }
    if (hasPerson && contact.last_name) {
      const pr = prospeoDecision(contact, elig?.eligibility ?? "NOT_ELIGIBLE");
      if (pr.run && deps.prospeo) {
        try {
          const out = await deps.prospeo.enrichPerson({ full_name: contact.name!, company_name: company.company_name, company_website: domain }, domain);
          od.providers.prospeo = "USED";
          rec.prospeo = { request: { full_name: contact.name!, company_name: company.company_name, company_website: domain }, ...out };
          if (out.result === "verified_email" && !isGenericEmail(out.email)) {
            rec.hunter_email_before_prospeo = contact.email;
            contact.email = out.email; contact.email_source = "prospeo_enrich_person"; vstatus = "valid";
            elig = evaluateEmail(contact.email, vstatus, domain);
          }
        } catch (e) {
          if ((e as Error).name === "BudgetExceededError") throw e;
          od.providers.prospeo = "ERROR";
          rec.prospeo = { request: { full_name: contact.name!, company_name: company.company_name, company_website: domain }, result: "error", reason: (e as Error).message.slice(0, 200) };
        }
      } else if (pr.run) {
        rec.prospeo = { result: "NOT_CONFIGURED", reason: pr.reason };
      } else {
        rec.prospeo = { result: "not_run", reason: pr.reason };
      }
    }
    rec.verification_status = elig ? vstatus : null;
    rec.email_eligibility = elig ?? evaluateEmail(null, "not_verified", domain);
    od.email.verification = elig ? vstatus : null;
    od.email.state = !hasPerson ? "NOT_SEARCHED" : !elig ? "NOT_FOUND" : elig.eligibility === "ELIGIBLE" ? "VERIFIED" : elig.eligibility === "REVIEW_ONLY" ? "REVIEW_ONLY" : "NOT_ELIGIBLE";
    rec.stages.eligibility = { status: elig && elig.eligibility !== "NOT_ELIGIBLE" ? "ok" : "failed", reason: elig ? `${elig.eligibility}${elig.reasons.length ? `: ${elig.reasons.join(", ")}` : ""}` : "NO_PERSONAL_BUSINESS_EMAIL" };

    // 13. Status.
    if (!hasPerson) {
      if (!contact.name) contact.failure_reason = contact.failure_reason ?? "CONTACT_NOT_FOUND";
      return finish("CONTACT_NOT_FOUND", "NO_OWNER_FOUND");
    }
    const ownerWanted = input.target_person === "OWNER";
    const directorOnly = ownerWanted && rc === "DIRECTOR";
    const noEmailStatus: OwnerStatus = rc === "OWNER" ? "OWNER_FOUND_NO_EMAIL" : "DECISION_MAKER_FOUND_NO_EMAIL";
    if (!elig || elig.eligibility === "NOT_ELIGIBLE") {
      return finish("DECISION_MAKER_EMAIL_NOT_FOUND", noEmailStatus, [
        ...(rec.prospeo?.result === "NOT_CONFIGURED" ? ["PROSPEO_NOT_CONFIGURED"] : []),
        ...(conf.confidence === "PARTIAL" ? ["PARTIAL_IDENTITY"] : []),
      ]);
    }
    if (conf.confidence === "VERIFIED" && !directorOnly && elig.eligibility === "ELIGIBLE") return finish("READY", "READY");
    const review: string[] = [];
    if (contact.identification === "near_match_review") review.push("NEAR_MATCH_IDENTITY_UNCONFIRMED");
    else if (contact.identification === "first_name_hunter_match") review.push("PARTIAL_NAME_MATCH_REVIEW");
    else if (conf.confidence === "PARTIAL") review.push("PARTIAL_NAME_MATCH_REVIEW");
    else if (conf.confidence === "REVIEW") review.push("OWNER_EVIDENCE_REVIEW");
    if (directorOnly) review.push("DIRECTOR_NOT_OWNER");
    if (elig.eligibility === "REVIEW_ONLY") review.push("EMAIL_NOT_ELIGIBLE:REVIEW_ONLY");
    return finish("NEEDS_REVIEW", "NEEDS_REVIEW", review);
  } catch (e) {
    const err = e as Error;
    rec.stages[stage] = { status: "failed", reason: err.name === "BudgetExceededError" ? "BUDGET_EXCEEDED" : err.message.slice(0, 300) };
    rec.status = "FAILED";
    rec.status_reasons = [`${stage.toUpperCase()}_FAILED: ${err.name === "BudgetExceededError" ? "BUDGET_EXCEEDED" : err.message.slice(0, 200)}`];
    rec.cost_eur = deps.cost.costForProspect(domain);
    return rec;
  }
}
