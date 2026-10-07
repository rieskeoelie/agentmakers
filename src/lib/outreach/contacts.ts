import { isFreeMail, isGenericEmail, type VerificationStatus, type EmailSource } from "./eligibility";
import { rootDomain } from "./domain";
import type { ContactProvider, HunterContact } from "./providers/hunter";
import { nonPersonReason } from "./personName";
import { extractFirstNameOwners, extractPeople, type FetchedPage, type RejectedNameCandidate, type WebsitePerson } from "./research";
import { hunterMetadataDecisionMakers, matchRole, rankContacts, type RoleMatch } from "./roles";
import { findDecisionMakerViaPublicSearch, type NearMatchCandidate, type PublicSearchReport } from "./publicSearch";
import type { PublicSearchProvider } from "./providers/dataforseo";
import { discoverTeamPages, type SameDomainTrace } from "./sameDomain";
import type { PageFetcher } from "./research";
import type { CostTracker } from "./cost";
import { defaultVocabulary, type RoleVocabulary } from "./vocabulary";
import type { RegistryLookupInput, RegistrySource, RegistryTrace } from "./registry";

export type ContactSource =
  | "hunter_domain_search"
  | "website_title+hunter_domain_search"
  | "website_title+hunter_email_finder"
  | "hunter_metadata"
  /** Named decision maker identified (explicit website title), but no usable business email found. */
  | "website_title"
  /** Named decision maker from public search-result metadata (strong person+role+company evidence). */
  | "public_search+hunter_email_finder"
  | "public_search"
  /** Named decision maker from an official company registry (extension point; no provider integrated yet). */
  | "registry+hunter_email_finder"
  | "registry"
  /** Review-only: strong business-name near match with corroboration, address from Email Finder. Never READY. */
  | "public_search_near_match+hunter_email_finder"
  | "none";

export interface ContactSelection {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  title_source_url: string | null;
  source: ContactSource;
  role_match: RoleMatch | null;
  email: string | null;
  email_source: EmailSource;
  verification_status: VerificationStatus;
  hunter_confidence: number | null;
  linkedin: string | null;
  notes: string[];
  failure_reason: string | null;
  /** Generic/role mailboxes (info@, receptie@ …): company metadata for reference only — never a recipient. */
  company_generic_emails: string[];
  /** Public search fallback trace (null when it did not run). */
  public_search: PublicSearchReport | null;
  /** Same-domain extra team-page discovery trace (null when it did not run). */
  same_domain_discovery: SameDomainTrace | null;
  /**
   * How the decision maker was identified. "first_name_only": the company's own site pairs only a first name with an
   * owner/director title (no surname — never inferred). "first_name_hunter_match": that first name matched exactly one
   * Hunter contact on the company's mail domain (full name from Hunter; always routed to review).
   */
  identification?: "full_name" | "first_name_only" | "first_name_hunter_match" | "near_match_review";
  /** Official registry stage trace (NOT_CONFIGURED until a registry provider is added). */
  registry?: RegistryTrace | null;
  /** Review-only near-match candidate (identity NOT confirmed) — kept for the reviewer even when no email was found. */
  near_match?: NearMatchCandidate | null;
  /** Audit: Hunter Domain Search people (name, position, verdict) — no email addresses of non-selected people. */
  hunter_candidates?: HunterCandidateAudit[];
  /** Domains Domain Search ran on: the website domain + at most one mail domain published on the company's own site. */
  email_domains_searched?: string[];
  /** Audit: website words rejected as a person name (a role/occupation such as "Kapster" is never a name). */
  rejected_person_candidates?: RejectedNameCandidate[];
}

export interface HunterCandidateAudit {
  domain: string;
  name: string | null;
  position: string | null;
  type: string | null;
  seniority: string | null;
  verdict: "SELECTED" | "GENERIC_MAILBOX" | "NO_PRIORITY_TITLE" | "NOT_SELECTED";
  role?: string;
}

/** Free / ISP / platform mail domains never count as a company mail domain. */
function isPlatformMailDomain(d: string): boolean {
  return isFreeMail(`x@${d}`) || /(^|\.)(wixsite|wix|jimdo|squarespace|mijnwebwinkel|strato|transip|hostnet|vimexx|mailchimp|sendgrid|google|outlook|office365)\./.test(d);
}

const label = (d: string) => (d.split(".")[0] ?? "").replace(/[^a-z0-9]/g, "");

/**
 * Mail domains the company publishes on its OWN website (mailto links / visible addresses) that differ from the
 * website domain — only when the domain label is clearly the same brand (contains / is contained in the website label,
 * e.g. destadsgarage.nl ↔ stadsgarage.nl). Franchise / platform / free-mail domains are excluded.
 */
export function publishedCompanyMailDomains(pages: FetchedPage[], websiteDomain: string): string[] {
  const site = rootDomain(websiteDomain);
  if (!site) return [];
  const found = new Set<string>();
  const add = (email: string) => {
    const d = rootDomain(email.split("@")[1]?.toLowerCase().replace(/[^a-z0-9.-]/g, "") ?? "");
    if (!d || d === site || isPlatformMailDomain(d)) return;
    const a = label(d), b = label(site);
    if (a.length < 4 || b.length < 4) return;
    if (a.includes(b) || b.includes(a)) found.add(d);
  };
  const RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  for (const p of pages) {
    for (const l of p.parsed.links) if (/^mailto:/i.test(l.href)) add(decodeURIComponent(l.href.replace(/^mailto:/i, "").split("?")[0]!));
    for (const m of p.parsed.text.matchAll(RE)) add(m[0]);
  }
  return [...found].slice(0, 1);
}

const fold = (s: string | null | undefined) => (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function sameName(c: HunterContact, p: WebsitePerson): boolean {
  if (!c.first_name || !c.last_name) return false;
  const lastTokens = fold(p.last_name).split(/\s+/);
  return fold(c.first_name) === fold(p.first_name) && fold(c.last_name).split(/\s+/).pop() === lastTokens[lastTokens.length - 1];
}

const MAX_FINDER_CALLS = 2;

export async function discoverContact(input: {
  domain: string;
  pages: FetchedPage[];
  priority: string[];
  hunter: ContactProvider;
  prospect: string;
  /** Optional public-search fallback; runs only when Hunter Domain Search AND website discovery found no relevant named person. */
  publicSearch?: { provider: PublicSearchProvider; companyName: string; city: string | null; language: "nl" | "en"; country: string; phone?: string | null; address?: string | null };
  /** Optional same-domain team/leadership page discovery (≤3 extra pages) when crawled pages name no decision maker. */
  sameDomain?: { fetcher: PageFetcher; homeUrl: string; search?: PublicSearchProvider; language: "nl" | "en"; country: string; cost?: CostTracker };
  /** Niche-aware role vocabulary. When given, its effective priority replaces `priority` for title matching. */
  vocabulary?: RoleVocabulary;
  /** Optional official registry source (see registry.ts). Absent → trace NOT_CONFIGURED, pipeline unchanged. */
  registry?: { source: RegistrySource; lookup: RegistryLookupInput };
}): Promise<ContactSelection> {
  const notes: string[] = [];
  const vocab = input.vocabulary ?? defaultVocabulary(input.priority);
  const priority = input.vocabulary ? input.vocabulary.priority : input.priority;
  const base = {
    name: null, first_name: null, last_name: null, title: null, title_source_url: null, role_match: null,
    email: null, email_source: "none" as EmailSource, verification_status: "not_verified" as VerificationStatus,
    hunter_confidence: null, linkedin: null, notes, failure_reason: null, company_generic_emails: [] as string[],
    public_search: null as PublicSearchReport | null,
    same_domain_discovery: null as SameDomainTrace | null,
    identification: undefined as ContactSelection["identification"],
    near_match: null as NearMatchCandidate | null,
    registry: null as RegistryTrace | null,
    hunter_candidates: [] as HunterCandidateAudit[],
    email_domains_searched: [input.domain] as string[],
    rejected_person_candidates: [] as RejectedNameCandidate[],
  };

  // Path A — Hunter Domain Search + role ranking
  const ds = await input.hunter.domainSearch(input.domain, input.prospect);
  // Generic/role mailboxes are split off as company metadata; only named personal addresses can be recipients.
  const isGenericContact = (c: HunterContact) => c.type === "generic" || isGenericEmail(c.email);
  const allContacts: Array<HunterContact & { _domain: string }> = ds.contacts.map((c) => ({ ...c, _domain: input.domain }));
  notes.push(`Domain Search: ${ds.contacts.length} email(s) (${ds.contacts.filter(isGenericContact).length} generic, metadata only), accept_all=${ds.accept_all}`);
  // Second mail domain published on the company's OWN site (e.g. website destadsgarage.nl, mail info@stadsgarage.nl).
  if (!ds.contacts.some((c) => !isGenericContact(c))) {
    for (const alt of publishedCompanyMailDomains(input.pages, input.domain)) {
      const ads = await input.hunter.domainSearch(alt, input.prospect);
      base.email_domains_searched.push(alt);
      allContacts.push(...ads.contacts.map((c) => ({ ...c, _domain: alt })));
      notes.push(`Domain Search on company-published mail domain ${alt}: ${ads.contacts.length} email(s) (${ads.contacts.filter(isGenericContact).length} generic).`);
    }
  }
  base.company_generic_emails = allContacts.filter(isGenericContact).map((c) => c.email);
  const personal = allContacts.filter((c) => !isGenericContact(c));
  const ranked = rankContacts(personal, priority);
  const audit = (selected: HunterContact | null) => {
    base.hunter_candidates = allContacts.map((c) => {
      const m = matchRole(c.position, priority);
      const verdict: HunterCandidateAudit["verdict"] = c === selected ? "SELECTED" : isGenericContact(c) ? "GENERIC_MAILBOX" : m ? "NOT_SELECTED" : "NO_PRIORITY_TITLE";
      return { domain: c._domain, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null, position: c.position, type: c.type, seniority: c.seniority, verdict, ...(m ? { role: m.matched_role } : {}) };
    });
  };
  audit(null);
  if (ranked.length) {
    const top = ranked[0]!;
    const c = top.contact;
    audit(c);
    notes.push(`Selected by title match "${top.match.matched_text}" → priority "${top.match.matched_role}" (rank ${top.match.rank}); ${ranked.length} matching candidate(s).`);
    return {
      ...base,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
      first_name: c.first_name, last_name: c.last_name, title: c.position, source: "hunter_domain_search",
      role_match: top.match, email: c.email, email_source: "hunter_domain_search", verification_status: c.verification_status,
      hunter_confidence: c.confidence, linkedin: c.linkedin, identification: "full_name",
    };
  }

  // A named, relevant person whose ONLY Hunter address is a generic mailbox is identified, but has no decision-maker email.
  let identified: Partial<ContactSelection> | null = null;
  const namedGeneric = rankContacts(
    allContacts.filter((c) => isGenericContact(c) && c.first_name && c.last_name).map((c) => ({ ...c, type: "personal" as const })),
    priority,
  )[0];
  if (namedGeneric) {
    const c = namedGeneric.contact;
    identified = { name: `${c.first_name} ${c.last_name}`, first_name: c.first_name, last_name: c.last_name, title: c.position, source: "hunter_domain_search", role_match: namedGeneric.match, linkedin: c.linkedin };
  }

  // Path B — website names + explicit titles, then Hunter (DS match or Email Finder)
  const isRole = (t: string) => matchRole(t, priority) !== null;
  let sitePages = input.pages;
  if (!identified && input.sameDomain && extractPeople(sitePages, isRole).length === 0) {
    // Same-domain leadership/team pages (links, sitemap, one site: search) — before any public Google/LinkedIn fallback.
    const sd = await discoverTeamPages({
      domain: input.domain, homeUrl: input.sameDomain.homeUrl, pages: input.pages, fetcher: input.sameDomain.fetcher,
      found: (page) => extractPeople([page], isRole).length > 0, search: input.sameDomain.search,
      country: input.sameDomain.country, language: input.sameDomain.language, prospect: input.prospect, cost: input.sameDomain.cost,
      vocabulary: vocab,
    });
    base.same_domain_discovery = sd.trace;
    sitePages = [...input.pages, ...sd.pages];
    notes.push(`Same-domain team discovery: ${sd.trace.candidates.length} candidate page(s), fetched ${sd.trace.fetched.length}${sd.trace.site_search_query ? " (incl. site: search)" : ""}.`);
  }
  const people = extractPeople(sitePages, isRole)
    .map((p) => ({ p, m: matchRole(p.title, priority)! }))
    .sort((a, b) => a.m.rank - b.m.rank);
  notes.push(`Website person discovery: ${people.length} named person(s) with a priority title.`);
  let finderCalls = 0;
  if (people[0] && !identified) {
    const { p, m } = people[0];
    identified = { name: p.full_name, first_name: p.first_name, last_name: p.last_name, title: p.title, title_source_url: p.source_url, source: "website_title", role_match: m, identification: "full_name" };
  }
  for (const { p, m } of people) {
    const inDs = personal.find((c) => sameName(c, p));
    if (inDs) {
      audit(inDs);
      notes.push(`Website person "${p.full_name}" (${p.title}) found in Domain Search results.`);
      return {
        ...base, name: p.full_name, first_name: p.first_name, last_name: p.last_name, title: p.title, title_source_url: p.source_url,
        source: "website_title+hunter_domain_search", role_match: m, email: inDs.email, email_source: "hunter_domain_search",
        verification_status: inDs.verification_status, hunter_confidence: inDs.confidence, linkedin: inDs.linkedin, identification: "full_name",
      };
    }
    if (finderCalls >= MAX_FINDER_CALLS || !p.last_name) continue;
    finderCalls++;
    const f = await input.hunter.emailFinder(input.domain, p.first_name, p.last_name, input.prospect);
    if (f?.email && isGenericEmail(f.email)) {
      notes.push(`Email Finder returned a generic mailbox for "${p.full_name}" — not accepted as recipient.`);
      if (!base.company_generic_emails.includes(f.email)) base.company_generic_emails.push(f.email);
    } else if (f?.email) {
      notes.push(`Email Finder found address for "${p.full_name}" (score ${f.score ?? "n/a"}).`);
      return {
        ...base, name: p.full_name, first_name: p.first_name, last_name: p.last_name, title: p.title, title_source_url: p.source_url,
        source: "website_title+hunter_email_finder", role_match: m, email: f.email, email_source: "hunter_email_finder",
        verification_status: f.verification_status, hunter_confidence: f.score, linkedin: f.linkedin, identification: "full_name",
      };
    }
    notes.push(`Email Finder: no address for "${p.full_name}".`);
  }

  // Partial decision maker: first name + owner/director title on the company's OWN site (no surname — never inferred).
  // It does not block the public search below (which may find the full name with evidence).
  let partial: Partial<ContactSelection> | null = null;
  if (!identified) {
    const ownerPriority = priority.filter((r) => !/^(partner|maat|vennoot|practice manager|operations manager|office manager)$/i.test(r.trim()));
    const isOwnerRole = (t: string) => matchRole(t, ownerPriority) !== null;
    const firsts = extractFirstNameOwners(sitePages, isOwnerRole, base.rejected_person_candidates);
    for (const r of base.rejected_person_candidates) notes.push(`Website word "${r.candidate}" next to "${r.title}" rejected as a person name: ${r.reason}.`);
    const fp = firsts[0];
    if (fp) {
      const m = matchRole(fp.title, priority)!;
      notes.push(`Website partial decision maker: first name "${fp.first_name}" with title "${fp.title}" (${fp.source_url}); surname not published — not inferred.`);
      const sameFirst = personal.filter((c) => c.first_name && c.last_name && fold(c.first_name) === fold(fp.first_name));
      if (sameFirst.length === 1) {
        const c = sameFirst[0]!;
        audit(c);
        notes.push(`First name "${fp.first_name}" matches exactly one Hunter contact on ${c._domain} — full name from Hunter; routed to review.`);
        return {
          ...base, name: `${c.first_name} ${c.last_name}`, first_name: c.first_name, last_name: c.last_name, title: fp.title, title_source_url: fp.source_url,
          source: "website_title+hunter_domain_search", role_match: m, email: c.email, email_source: "hunter_domain_search",
          verification_status: c.verification_status, hunter_confidence: c.confidence, linkedin: c.linkedin, identification: "first_name_hunter_match",
        };
      }
      if (sameFirst.length > 1) notes.push(`First name "${fp.first_name}" matches ${sameFirst.length} Hunter contacts — ambiguous, not used.`);
      notes.push(`Email Finder not attempted for "${fp.first_name}": surname unknown (no inference from company name).`);
      partial = { name: fp.first_name, first_name: fp.first_name, last_name: null, title: fp.title, title_source_url: fp.source_url, source: "website_title", role_match: m, identification: "first_name_only" };
    }
  }

  // Official registry stage (extension point) — after Hunter + the company's own website, before public search,
  // only while no FULLY named decision maker is known. A registry officer can complete a first-name-only owner.
  if (identified) base.registry = { status: "NOT_NEEDED", reason: "FULLY_NAMED_DECISION_MAKER_ALREADY_IDENTIFIED" };
  else if (!input.registry) base.registry = { status: "NOT_CONFIGURED" };
  else {
    const src = input.registry.source.name;
    try {
      const r = await input.registry.source.lookup(input.registry.lookup, input.prospect);
      if (r.status === "not_found") base.registry = { status: "NOT_FOUND", source: src };
      else if (r.status === "ambiguous") base.registry = { status: "AMBIGUOUS", source: src };
      else if (r.match.confidence === "medium") base.registry = { status: "NO_COMPANY_MATCH", source: src };
      else {
        const rejected: Array<{ full_name: string; role: string; reason: string }> = [];
        const ok: Array<{ o: (typeof r.officers)[number]; m: RoleMatch }> = [];
        for (const o of r.officers) {
          const m = matchRole(o.role, priority);
          if (!m) rejected.push({ full_name: o.full_name, role: o.role, reason: "ROLE_NOT_DECISION_MAKER" });
          else if (!o.first_name || !o.last_name) rejected.push({ full_name: o.full_name, role: o.role, reason: "NO_FULL_NAME" });
          else ok.push({ o, m });
        }
        const pf = partial?.first_name ? fold(partial.first_name) : null;
        ok.sort((a, b) => Number(fold(b.o.first_name) === pf) - Number(fold(a.o.first_name) === pf) || a.m.rank - b.m.rank);
        const sel = ok[0];
        base.registry = { status: "FOUND", source: src, company: r.company.legal_name, officers_seen: r.officers.length, selected: sel ? { full_name: sel.o.full_name, role: sel.o.role, confidence: sel.o.confidence } : null, rejected };
        if (sel) {
          const who = { name: sel.o.full_name, first_name: sel.o.first_name, last_name: sel.o.last_name, title: sel.o.role, title_source_url: sel.o.evidence.source_url, role_match: sel.m, identification: "full_name" as const };
          notes.push(`Registry ${src}: "${sel.o.full_name}" (${sel.o.role}) for ${r.company.legal_name}.`);
          const f = await input.hunter.emailFinder(input.domain, sel.o.first_name, sel.o.last_name, input.prospect);
          if (f?.email && !isGenericEmail(f.email)) {
            return { ...base, ...who, source: "registry+hunter_email_finder", email: f.email, email_source: "hunter_email_finder", verification_status: f.verification_status, hunter_confidence: f.score, linkedin: f.linkedin };
          }
          if (f?.email && !base.company_generic_emails.includes(f.email)) base.company_generic_emails.push(f.email);
          identified = { ...who, source: "registry", linkedin: null };
        }
      }
    } catch (e) {
      if ((e as Error).name === "BudgetExceededError") throw e;
      base.registry = { status: "ERROR", source: src, error: (e as Error).message.slice(0, 200) };
      notes.push(`Registry ${src} error (not treated as "not found"): ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // Public search fallback — only when neither Hunter nor the website yielded a relevant (fully) named person.
  if (!identified && input.publicSearch) {
    const ps = await findDecisionMakerViaPublicSearch({
      search: input.publicSearch.provider,
      company: { name: input.publicSearch.companyName, domain: input.domain, city: input.publicSearch.city, phone: input.publicSearch.phone ?? null, address: input.publicSearch.address ?? null },
      priority,
      language: input.publicSearch.language,
      country: input.publicSearch.country,
      prospect: input.prospect,
      vocabulary: vocab,
    });
    base.public_search = ps;
    notes.push(`Public search: ${ps.queries.length} quer${ps.queries.length === 1 ? "y" : "ies"}, ${ps.results_seen} result(s), ${ps.rejected.length} weak candidate(s) rejected${ps.errors.length ? `, errors: ${ps.errors.join("; ")}` : ""}.`);
    // Defence in depth: a "name" that is a role, heading or label never reaches person-level email lookup.
    const notPerson = (n: string, url: string) => {
      const why = nonPersonReason(n, { url });
      if (why) notes.push(`"${n}" rejected as a person (${why}) — no email lookup.`);
      return !!why;
    };
    const c = ps.selected && !notPerson(ps.selected.full_name, ps.selected.result_url) ? ps.selected : null;
    if (c) {
      const who = { name: c.full_name, first_name: c.first_name, last_name: c.last_name, title: c.title, title_source_url: c.result_url, role_match: c.role_match, identification: "full_name" as const };
      const f = await input.hunter.emailFinder(input.domain, c.first_name, c.last_name, input.prospect);
      if (f?.email && !isGenericEmail(f.email)) {
        notes.push(`Public search found "${c.full_name}" (${c.title}, ${c.confidence}) → Email Finder found address.`);
        return {
          ...base, ...who, source: "public_search+hunter_email_finder", email: f.email, email_source: "hunter_email_finder",
          verification_status: f.verification_status, hunter_confidence: f.score, linkedin: c.is_linkedin_result ? c.result_url : f.linkedin,
        };
      }
      if (f?.email && !base.company_generic_emails.includes(f.email)) base.company_generic_emails.push(f.email);
      notes.push(`Public search found "${c.full_name}" (${c.title}), but Email Finder found no business address.`);
      identified = { ...who, source: "public_search", linkedin: c.is_linkedin_result ? c.result_url : null };
    }
    // Review-only near match (identity not confirmed): only when no verified candidate was found.
    const nm = !c ? ps.review_candidates?.find((x) => !notPerson(x.full_name, x.result_url)) : undefined;
    if (nm) {
      base.near_match = nm;
      notes.push(`Review-only near match: "${nm.full_name}" (${nm.title}) at "${nm.organisation}" — ${nm.uncertainty} Corroboration: ${nm.corroboration.join(", ")}.`);
      const f = await input.hunter.emailFinder(input.domain, nm.first_name, nm.last_name, input.prospect);
      if (f?.email && !isGenericEmail(f.email)) {
        notes.push(`Email Finder found an address for near match "${nm.full_name}" — review only, never READY.`);
        return {
          ...base, name: nm.full_name, first_name: nm.first_name, last_name: nm.last_name, title: nm.title, title_source_url: nm.result_url, role_match: nm.role_match,
          source: "public_search_near_match+hunter_email_finder", email: f.email, email_source: "hunter_email_finder", verification_status: f.verification_status,
          hunter_confidence: f.score, linkedin: null, identification: "near_match_review",
        };
      }
      if (f?.email && !base.company_generic_emails.includes(f.email)) base.company_generic_emails.push(f.email);
      notes.push(`Email Finder found no business address for near match "${nm.full_name}" — kept as review information only.`);
    }
  }

  // Weaker fallback — Hunter seniority metadata (flagged as risk in the brief)
  const meta = hunterMetadataDecisionMakers(personal)[0];
  if (meta) {
    audit(meta);
    notes.push(`Fallback: Hunter metadata seniority=executive (${meta.position ?? "no title"}).`);
    return {
      ...base, name: [meta.first_name, meta.last_name].filter(Boolean).join(" ") || null, first_name: meta.first_name, last_name: meta.last_name,
      title: meta.position, source: "hunter_metadata", email: meta.email, email_source: "hunter_domain_search",
      verification_status: meta.verification_status, hunter_confidence: meta.confidence, linkedin: meta.linkedin,
    };
  }

  // Generic mailboxes are NOT a fallback recipient and never count as a decision-maker email.
  const generics = base.company_generic_emails.length ? ` Generic mailbox(es) kept as company metadata only: ${base.company_generic_emails.join(", ")}` : "";
  if (!identified && partial) identified = partial;
  if (identified) {
    notes.push(identified.identification === "first_name_only"
      ? `Partial decision maker "${identified.name}" (${identified.title}) identified (first name only), but no business email found.${generics}`
      : `Named decision maker "${identified.name}" (${identified.title}) identified, but no business email found.${generics}`);
    return { ...base, ...identified, email: null, email_source: "none", verification_status: "not_verified", failure_reason: "DECISION_MAKER_EMAIL_NOT_FOUND" } as ContactSelection;
  }
  notes.push(`No relevant named decision maker found.${generics}`);
  return { ...base, source: "none", failure_reason: "CONTACT_NOT_FOUND" };
}
