import { buildCampaignBrain, categoryDecision, categoryMatchesNiche, type BrainCache, type CampaignBrain } from "./brain";
import { buildBrief, type ProspectBrief } from "./brief";
import { HARD_MAX_PROSPECTS, type CampaignInput } from "./config";
import { discoverContact, type ContactSelection } from "./contacts";
import { BudgetExceededError, type CostTracker } from "./cost";
import { dedupe, isNonCompanyDomain, rootDomain } from "./domain";
import type { EmailFallbackProvider, ProspeoOutcome, ProspeoRequest } from "./providers/prospeo";
import { evaluateEmail, shouldVerify, type Eligibility, type EmailEligibility, type VerificationStatus } from "./eligibility";
import { geographyDecision } from "./geo";
import { classifyFit, type FitResult } from "./fit";
import { generateHook, type HookResult } from "./hook";
import type { CompanyDiscoveryProvider, DiscoveredCompany, PublicSearchProvider } from "./providers/dataforseo";
import type { ContactProvider } from "./providers/hunter";
import type { LLMProvider } from "./providers/anthropic";
import { renderEmail, validateMessage, type ProspectStatus, type RenderedEmail } from "./render";
import { extractEvidence, fetchWebsite, type PageFetcher } from "./research";
import { roleVocabulary } from "./vocabulary";

export type StageName = "prefilter" | "website_fetch" | "evidence" | "fit" | "contact" | "eligibility" | "brief" | "hook" | "render";
export interface StageStatus {
  status: "ok" | "skipped" | "failed" | "not_run";
  reason?: string;
}

export interface ProspectRecord {
  index: number;
  company: DiscoveredCompany;
  domain: string;
  status: ProspectStatus;
  status_reasons: string[];
  warnings: string[];
  stages: Record<StageName, StageStatus>;
  pages: Array<{ url: string; kind: string; fetched_at: string }>;
  fetch_errors: Array<{ url: string; error: string }>;
  contact: ContactSelection | null;
  verification_status: VerificationStatus | null;
  email_eligibility: EmailEligibility | null;
  fit: FitResult | null;
  brief: ProspectBrief | null;
  hook: HookResult | null;
  email: RenderedEmail | null;
  quarantined_snippets: Array<{ source_url: string; snippet: string }>;
  /** Prospeo email-fallback trace (not_run with reason, or the outcome). */
  prospeo: ProspeoTrace | null;
  /** Hunter's review-only address when Prospeo supplied a verified replacement (kept for audit). */
  hunter_email_before_prospeo: string | null;
  /** Homepage loaded only on the alternate canonical host (www ↔ bare domain). */
  website_host_fallback?: { from: string; to: string; reason: string } | null;
  cost_eur: number;
}

export type ProspeoTrace =
  | ({ request: ProspeoRequest } & ProspeoOutcome)
  | { request: ProspeoRequest; result: "error"; reason: string }
  /** Not needed for this prospect (reason says why). */
  | { result: "not_run"; reason: string }
  /** Would have run (reason = why), but Prospeo is not configured — the fallback was UNAVAILABLE, not unnecessary. */
  | { result: "NOT_CONFIGURED"; reason: string };

/**
 * When may the Prospeo email fallback run? Only AFTER Hunter, only for a strongly identified named decision maker
 * (explicit priority-role match; not Hunter-metadata guesses), and only when Hunter found no email or only a
 * review-only (e.g. accept_all) address. Never for CONTACT_NOT_FOUND and never after a valid eligible Hunter email.
 */
export function prospeoDecision(contact: ContactSelection, hunterEligibility: Eligibility): { run: boolean; reason: string } {
  if (!contact.name || !contact.first_name || !contact.last_name || contact.source === "none") return { run: false, reason: "NO_IDENTIFIED_DECISION_MAKER" };
  if (contact.source === "hunter_metadata" || !contact.role_match) return { run: false, reason: "DECISION_MAKER_NOT_STRONGLY_IDENTIFIED" };
  if (!contact.email) return { run: true, reason: "HUNTER_NO_EMAIL" };
  if (hunterEligibility === "REVIEW_ONLY") return { run: true, reason: "HUNTER_REVIEW_ONLY" };
  if (hunterEligibility === "ELIGIBLE") return { run: false, reason: "HUNTER_VALID_EMAIL" };
  return { run: false, reason: "HUNTER_EMAIL_NOT_ELIGIBLE" };
}

export interface PrefilterRejection {
  company_name: string;
  domain: string | null;
  reason: string;
}

export interface ProofResult {
  campaign: CampaignInput;
  brain: CampaignBrain | null;
  brain_error: string | null;
  discovery_error: string | null;
  discovery: { returned: number; duplicates: Array<{ company_name: string; key: string }>; prefilter_rejected: PrefilterRejection[]; selected: number };
  prospects: ProspectRecord[];
  budget: { max_eur: number; spent_eur: number; exhausted: boolean };
  limit: number;
  started_at: string;
  finished_at: string;
  sending: "DISABLED_IN_PHASE_0";
}

export interface PipelineDeps {
  discovery: CompanyDiscoveryProvider;
  hunter: ContactProvider;
  llm: LLMProvider;
  websiteFetcher: PageFetcher;
  cost: CostTracker;
  brainCache?: BrainCache;
  /** Prospeo email-only fallback (after Hunter). Optional — not configured = never called. */
  prospeo?: EmailFallbackProvider;
  /** Public decision-maker search fallback (DataForSEO organic). Optional. */
  publicSearch?: PublicSearchProvider;
  settings: { maxPages: number; maxTextChars: number; concurrency: number };
}

const newStages = (): Record<StageName, StageStatus> => ({
  prefilter: { status: "not_run" }, website_fetch: { status: "not_run" }, evidence: { status: "not_run" }, fit: { status: "not_run" },
  contact: { status: "not_run" }, eligibility: { status: "not_run" }, brief: { status: "not_run" }, hook: { status: "not_run" }, render: { status: "not_run" },
});

export function prefilter(companies: DiscoveredCompany[], campaign: CampaignInput, brain: CampaignBrain): { kept: DiscoveredCompany[]; rejected: PrefilterRejection[] } {
  const excluded = new Set(campaign.exclude_domains.map((d) => rootDomain(d)).filter(Boolean));
  const kept: DiscoveredCompany[] = [];
  const rejected: PrefilterRejection[] = [];
  for (const c of companies) {
    const reject = (reason: string) => rejected.push({ company_name: c.company_name, domain: c.domain, reason });
    const root = rootDomain(c.domain);
    if (!c.domain || !root) { reject("NO_WEBSITE"); continue; }
    if (isNonCompanyDomain(c.domain)) { reject("DIRECTORY_OR_SOCIAL_DOMAIN"); continue; }
    if (excluded.has(root)) { reject("EXCLUDED_DOMAIN"); continue; }
    if (c.closed_signal) { reject(`CLOSED:${c.closed_signal}`); continue; }
    const geo = geographyDecision(c, { region: campaign.region, country: campaign.country });
    if (geo.match === false) { reject(`PREFILTER_GEOGRAPHY_MISMATCH:${geo.reason}`); continue; }
    const cat = categoryDecision(c.category, c.additional_categories, c.company_name, brain.category_keywords, brain.niche);
    if (cat.match === false) { reject(`CATEGORY_MISMATCH:${c.category ?? "—"} (${cat.reason})`); continue; }
    kept.push(c);
  }
  return { kept, rejected };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function processProspect(company: DiscoveredCompany, index: number, campaign: CampaignInput, brain: CampaignBrain, deps: PipelineDeps): Promise<ProspectRecord> {
  const domain = rootDomain(company.domain)!;
  const rec: ProspectRecord = {
    index, company, domain, status: "FAILED", status_reasons: [], warnings: [], stages: newStages(), pages: [], fetch_errors: [],
    contact: null, verification_status: null, email_eligibility: null, prospeo: null, hunter_email_before_prospeo: null, website_host_fallback: null, fit: null, brief: null, hook: null, email: null, quarantined_snippets: [], cost_eur: 0,
  };
  rec.stages.prefilter = { status: "ok" };
  let stage: StageName = "website_fetch";
  const finish = () => { rec.cost_eur = deps.cost.costForProspect(domain); return rec; };

  try {
    if (deps.cost.isExhausted) throw new BudgetExceededError(0, 0);

    // 1. Website fetch (free; also validates "valid public website exists")
    const site = await fetchWebsite(company.website ?? `https://${company.domain}`, deps.websiteFetcher, { maxPages: deps.settings.maxPages, maxTextChars: deps.settings.maxTextChars, prospect: domain });
    rec.pages = site.pages.map((p) => ({ url: p.url, kind: p.kind, fetched_at: p.fetched_at }));
    rec.fetch_errors = site.errors;
    rec.website_host_fallback = site.host_fallback ?? null;
    if (site.placeholder) {
      // Placeholder / parking / configuration page: not a researched website — no Hunter or search spend.
      rec.stages.website_fetch = { status: "skipped", reason: `WEBSITE_PLACEHOLDER: ${site.placeholder}` };
      rec.status = "SKIPPED";
      rec.status_reasons = ["WEBSITE_PLACEHOLDER"];
      return finish();
    }
    if (!site.pages.length) {
      rec.stages.website_fetch = { status: "failed", reason: `WEBSITE_UNREACHABLE: ${site.errors[0]?.error ?? "unknown"}` };
      rec.status = "SKIPPED";
      rec.status_reasons = ["WEBSITE_UNREACHABLE"];
      return finish();
    }
    rec.stages.website_fetch = { status: "ok", reason: `${site.pages.length} page(s)${site.host_fallback ? ` via alternate host ${new URL(site.host_fallback.to).hostname}` : ""}` };

    // 2. Evidence + fit BEFORE paid contact discovery (no Hunter credits on SKIP companies)
    stage = "evidence";
    const ev = extractEvidence(site.pages);
    rec.quarantined_snippets = ev.suspicious_snippets;
    rec.stages.evidence = { status: "ok", reason: `${ev.observed_facts.length} fact(s), ${ev.inferences.length} inference(s), ${ev.suspicious_snippets.length} quarantined` };
    stage = "fit";
    const nicheRelevant = categoryMatchesNiche(company.category, company.additional_categories, company.company_name, brain.category_keywords, brain.niche);
    const fit = classifyFit({ facts: ev.observed_facts, pagesFetched: site.pages.length, nicheRelevant });
    rec.fit = fit;
    rec.stages.fit = { status: "ok", reason: `${fit.classification}: ${fit.reason}` };
    if (fit.classification === "SKIP") {
      rec.status = "SKIPPED";
      rec.status_reasons = [`FIT_SKIP: ${fit.reason}`];
      return finish();
    }

    // 3. Contact discovery (Hunter) — role titles and search wording follow the campaign niche + role configuration.
    stage = "contact";
    const vocabulary = roleVocabulary(campaign.niche, campaign.decision_maker_priority);
    const contact = await discoverContact({
      domain, pages: site.pages, priority: vocabulary.priority, vocabulary, hunter: deps.hunter, prospect: domain,
      publicSearch: deps.publicSearch ? { provider: deps.publicSearch, companyName: company.company_name, city: company.city, language: campaign.language, country: campaign.country } : undefined,
      sameDomain: { fetcher: deps.websiteFetcher, homeUrl: rec.pages[0]!.url, search: deps.publicSearch, language: campaign.language, country: campaign.country, cost: deps.cost },
    });
    rec.contact = contact;
    rec.stages.contact = contact.email
      ? { status: "ok", reason: `${contact.source}${contact.failure_reason ? ` (${contact.failure_reason})` : ""}` }
      : { status: "failed", reason: contact.failure_reason ?? "NO_CONTACT" };

    // 4. Email eligibility (+ Verifier only if it can change eligibility)
    stage = "eligibility";
    let vstatus = contact.verification_status;
    if (shouldVerify(contact.email, vstatus, contact.email_source, domain)) {
      vstatus = await deps.hunter.verify(contact.email!, domain);
      contact.notes.push(`Email Verifier → ${vstatus}`);
    }
    rec.verification_status = vstatus;
    let elig = evaluateEmail(contact.email, vstatus, domain);

    // 4b. Prospeo — EMAIL-ONLY fallback, strictly after Hunter, only for a strongly identified named decision maker
    //     whose Hunter result is "no email" or review-only (e.g. accept_all). Never for CONTACT_NOT_FOUND.
    const pr = prospeoDecision(contact, elig.eligibility);
    if (pr.run && deps.prospeo) {
      const req = { full_name: contact.name!, company_name: company.company_name, company_website: domain };
      try {
        const out = await deps.prospeo.enrichPerson(req, domain);
        rec.prospeo = { request: req, ...out };
        if (out.result === "verified_email") {
          contact.notes.push(`Prospeo: verified email ${out.email} for "${contact.name}"${contact.email ? ` (replaces review-only Hunter address ${contact.email})` : ""}.`);
          rec.hunter_email_before_prospeo = contact.email;
          contact.email = out.email;
          contact.email_source = "prospeo_enrich_person";
          contact.verification_status = "valid";
          contact.failure_reason = null;
          vstatus = "valid";
          rec.verification_status = vstatus;
          elig = evaluateEmail(contact.email, vstatus, domain); // re-run the existing eligibility rules
          rec.stages.contact = { status: "ok", reason: `${contact.source} + prospeo_enrich_person` };
        } else {
          contact.notes.push(`Prospeo: ${out.result}${out.result === "rejected" ? ` (${out.reason})` : ""} — Hunter result kept.`);
        }
      } catch (e) {
        if ((e as Error).name === "BudgetExceededError") throw e;
        rec.prospeo = { request: req, result: "error", reason: (e as Error).message.slice(0, 200) };
        contact.notes.push(`Prospeo error (Hunter result kept): ${(e as Error).message.slice(0, 160)}`);
      }
    } else if (pr.run) {
      rec.prospeo = { result: "NOT_CONFIGURED", reason: pr.reason };
      contact.notes.push(`Prospeo fallback would apply (${pr.reason}) but is not configured — unavailable, not unnecessary.`);
    } else {
      rec.prospeo = { result: "not_run", reason: pr.reason };
    }
    const eligFinal = elig;
    rec.email_eligibility = eligFinal;
    rec.stages.eligibility = { status: elig.eligibility === "NOT_ELIGIBLE" ? "failed" : "ok", reason: `${elig.eligibility}${elig.reasons.length ? `: ${elig.reasons.join(", ")}` : ""}` };
    if (!contact.email || elig.eligibility === "NOT_ELIGIBLE") {
      if (contact.email) {
        rec.status = "EMAIL_NOT_ELIGIBLE";
        rec.status_reasons = ["EMAIL_NOT_ELIGIBLE", ...elig.reasons];
      } else {
        rec.status = contact.failure_reason === "DECISION_MAKER_EMAIL_NOT_FOUND" ? "DECISION_MAKER_EMAIL_NOT_FOUND" : "CONTACT_NOT_FOUND";
        rec.status_reasons = [rec.status];
      }
      return finish(); // no LLM spend without a usable recipient
    }

    // 5. Prospect Brief (only prospect-specific input to message generation)
    stage = "brief";
    const brief = buildBrief({
      company: company.company_name, website: rec.pages[0]!.url, domain, city: company.city,
      contact: { name: contact.name, first_name: contact.first_name, title: contact.title, source: contact.source },
      email: contact.email, email_source: contact.email_source, verification_status: vstatus, email_eligibility: elig.eligibility, eligibility_reasons: elig.reasons,
      fit, facts: ev.observed_facts, inferences: ev.inferences, brain, suspicious_count: ev.suspicious_snippets.length,
    });
    rec.brief = brief;
    rec.stages.brief = { status: "ok" };

    // 6. Personalization hook (LLM, validated)
    stage = "hook";
    const hook = await generateHook(brief, brain, deps.llm, { language: campaign.language, formality: campaign.formality, niche: campaign.niche, prospect: domain });
    rec.hook = hook;
    rec.stages.hook = hook.hook
      ? { status: "ok", reason: `observation-only, ${hook.attempts} attempt(s)` }
      : hook.skipped_reason
        ? { status: "skipped", reason: hook.skipped_reason }
        : { status: "failed", reason: `HOOK_REJECTED: ${hook.rejections.map((r) => r.issues.join("|")).join(" / ")}` };

    // 7. Render + READY validation
    stage = "render";
    const email = renderEmail({ brief, brain, hook: hook.hook, language: campaign.language, formality: campaign.formality, niche: brain.niche, senderName: campaign.sender_name });
    rec.email = email;
    const v = validateMessage({ email, brief, brain, hook: hook.hook, suppressed: false, duplicateContact: false });
    rec.status = v.status;
    rec.status_reasons = v.issues;
    rec.warnings = v.warnings;
    // A decision maker matched on first name only (website title + one Hunter contact) is never auto-sendable.
    if (contact.identification === "first_name_hunter_match" && (rec.status === "READY" || rec.status === "NEEDS_REVIEW")) {
      rec.status = "NEEDS_REVIEW";
      rec.status_reasons = [...rec.status_reasons, "PARTIAL_NAME_MATCH_REVIEW"];
    }
    rec.stages.render = { status: "ok", reason: v.status };
    return finish();
  } catch (e) {
    const err = e as Error;
    rec.stages[stage] = { status: "failed", reason: err.name === "BudgetExceededError" ? "BUDGET_EXCEEDED" : err.message.slice(0, 300) };
    rec.status = "FAILED";
    rec.status_reasons = [`${stage.toUpperCase()}_FAILED: ${err.name === "BudgetExceededError" ? "BUDGET_EXCEEDED" : err.message.slice(0, 200)}`];
    return finish();
  }
}

/** Mark later records that reuse an already-used recipient address (duplicate outreach protection). */
export function markDuplicateContacts(records: ProspectRecord[]): void {
  const seen = new Map<string, number>();
  for (const r of [...records].sort((a, b) => a.index - b.index)) {
    const email = r.contact?.email;
    if (!email || (r.status !== "READY" && r.status !== "NEEDS_REVIEW")) continue;
    if (seen.has(email)) {
      r.status = "SKIPPED";
      r.status_reasons = [`DUPLICATE_CONTACT: same address as prospect #${seen.get(email)}`];
    } else seen.set(email, r.index);
  }
}

export async function runProof(campaign: CampaignInput, limit: number, deps: PipelineDeps, brainUrlFetcher: PageFetcher): Promise<ProofResult> {
  const started_at = new Date().toISOString();
  const cap = Math.min(limit, HARD_MAX_PROSPECTS);
  const base = {
    campaign, limit: cap, started_at, sending: "DISABLED_IN_PHASE_0" as const,
    discovery: { returned: 0, duplicates: [] as Array<{ company_name: string; key: string }>, prefilter_rejected: [] as PrefilterRejection[], selected: 0 },
  };
  const budget = () => ({ max_eur: deps.cost.maxBudgetEur, spent_eur: deps.cost.spentEur, exhausted: deps.cost.isExhausted });

  let brain: CampaignBrain;
  try {
    brain = await buildCampaignBrain(campaign.agentmakers_url, campaign.language, brainUrlFetcher, deps.llm, deps.brainCache);
  } catch (e) {
    return { ...base, brain: null, brain_error: (e as Error).message, discovery_error: null, prospects: [], budget: budget(), finished_at: new Date().toISOString() };
  }

  let found: DiscoveredCompany[];
  try {
    found = await deps.discovery.discover({ niche: campaign.niche, country: campaign.country, region: campaign.region, language: campaign.language, depth: 100 });
  } catch (e) {
    return { ...base, brain, brain_error: null, discovery_error: (e as Error).message, prospects: [], budget: budget(), finished_at: new Date().toISOString() };
  }
  const { kept: unique, duplicates } = dedupe(found);
  const { kept, rejected } = prefilter(unique, campaign, brain);
  const selected = kept.slice(0, cap); // HARD CAP
  base.discovery = { returned: found.length, duplicates: duplicates.map((d) => ({ company_name: d.item.company_name, key: d.key })), prefilter_rejected: rejected, selected: selected.length };

  const prospects = await mapLimit(selected, deps.settings.concurrency, (c, i) => processProspect(c, i + 1, campaign, brain, deps));
  markDuplicateContacts(prospects);
  return { ...base, brain, brain_error: null, discovery_error: null, prospects, budget: budget(), finished_at: new Date().toISOString() };
}
