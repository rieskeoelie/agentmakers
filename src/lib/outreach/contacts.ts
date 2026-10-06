import { isGenericEmail, type VerificationStatus, type EmailSource } from "./eligibility";
import type { ContactProvider, HunterContact } from "./providers/hunter";
import { extractPeople, type FetchedPage, type WebsitePerson } from "./research";
import { hunterMetadataDecisionMakers, matchRole, rankContacts, type RoleMatch } from "./roles";
import { findDecisionMakerViaPublicSearch, type PublicSearchReport } from "./publicSearch";
import type { PublicSearchProvider } from "./providers/dataforseo";
import { discoverTeamPages, type SameDomainTrace } from "./sameDomain";
import type { PageFetcher } from "./research";
import type { CostTracker } from "./cost";

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
  publicSearch?: { provider: PublicSearchProvider; companyName: string; city: string | null; language: "nl" | "en"; country: string };
  /** Optional same-domain team/leadership page discovery (≤3 extra pages) when crawled pages name no decision maker. */
  sameDomain?: { fetcher: PageFetcher; homeUrl: string; search?: PublicSearchProvider; language: "nl" | "en"; country: string; cost?: CostTracker };
}): Promise<ContactSelection> {
  const notes: string[] = [];
  const base = {
    name: null, first_name: null, last_name: null, title: null, title_source_url: null, role_match: null,
    email: null, email_source: "none" as EmailSource, verification_status: "not_verified" as VerificationStatus,
    hunter_confidence: null, linkedin: null, notes, failure_reason: null, company_generic_emails: [] as string[],
    public_search: null as PublicSearchReport | null,
    same_domain_discovery: null as SameDomainTrace | null,
  };

  // Path A — Hunter Domain Search + role ranking
  const ds = await input.hunter.domainSearch(input.domain, input.prospect);
  // Generic/role mailboxes are split off as company metadata; only named personal addresses can be recipients.
  const isGenericContact = (c: HunterContact) => c.type === "generic" || isGenericEmail(c.email);
  base.company_generic_emails = ds.contacts.filter(isGenericContact).map((c) => c.email);
  const personal = ds.contacts.filter((c) => !isGenericContact(c));
  notes.push(`Domain Search: ${ds.contacts.length} email(s) (${base.company_generic_emails.length} generic, metadata only), accept_all=${ds.accept_all}`);
  const ranked = rankContacts(personal, input.priority);
  if (ranked.length) {
    const top = ranked[0]!;
    const c = top.contact;
    notes.push(`Selected by title match "${top.match.matched_text}" → priority "${top.match.matched_role}" (rank ${top.match.rank}); ${ranked.length} matching candidate(s).`);
    return {
      ...base,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
      first_name: c.first_name, last_name: c.last_name, title: c.position, source: "hunter_domain_search",
      role_match: top.match, email: c.email, email_source: "hunter_domain_search", verification_status: c.verification_status,
      hunter_confidence: c.confidence, linkedin: c.linkedin,
    };
  }

  // A named, relevant person whose ONLY Hunter address is a generic mailbox is identified, but has no decision-maker email.
  let identified: Partial<ContactSelection> | null = null;
  const namedGeneric = rankContacts(
    ds.contacts.filter((c) => isGenericContact(c) && c.first_name && c.last_name).map((c) => ({ ...c, type: "personal" as const })),
    input.priority,
  )[0];
  if (namedGeneric) {
    const c = namedGeneric.contact;
    identified = { name: `${c.first_name} ${c.last_name}`, first_name: c.first_name, last_name: c.last_name, title: c.position, source: "hunter_domain_search", role_match: namedGeneric.match, linkedin: c.linkedin };
  }

  // Path B — website names + explicit titles, then Hunter (DS match or Email Finder)
  const isRole = (t: string) => matchRole(t, input.priority) !== null;
  let sitePages = input.pages;
  if (!identified && input.sameDomain && extractPeople(sitePages, isRole).length === 0) {
    // Same-domain leadership/team pages (links, sitemap, one site: search) — before any public Google/LinkedIn fallback.
    const sd = await discoverTeamPages({
      domain: input.domain, homeUrl: input.sameDomain.homeUrl, pages: input.pages, fetcher: input.sameDomain.fetcher,
      found: (page) => extractPeople([page], isRole).length > 0, search: input.sameDomain.search,
      country: input.sameDomain.country, language: input.sameDomain.language, prospect: input.prospect, cost: input.sameDomain.cost,
    });
    base.same_domain_discovery = sd.trace;
    sitePages = [...input.pages, ...sd.pages];
    notes.push(`Same-domain team discovery: ${sd.trace.candidates.length} candidate page(s), fetched ${sd.trace.fetched.length}${sd.trace.site_search_query ? " (incl. site: search)" : ""}.`);
  }
  const people = extractPeople(sitePages, isRole)
    .map((p) => ({ p, m: matchRole(p.title, input.priority)! }))
    .sort((a, b) => a.m.rank - b.m.rank);
  notes.push(`Website person discovery: ${people.length} named person(s) with a priority title.`);
  let finderCalls = 0;
  if (people[0] && !identified) {
    const { p, m } = people[0];
    identified = { name: p.full_name, first_name: p.first_name, last_name: p.last_name, title: p.title, title_source_url: p.source_url, source: "website_title", role_match: m };
  }
  for (const { p, m } of people) {
    const inDs = personal.find((c) => sameName(c, p));
    if (inDs) {
      notes.push(`Website person "${p.full_name}" (${p.title}) found in Domain Search results.`);
      return {
        ...base, name: p.full_name, first_name: p.first_name, last_name: p.last_name, title: p.title, title_source_url: p.source_url,
        source: "website_title+hunter_domain_search", role_match: m, email: inDs.email, email_source: "hunter_domain_search",
        verification_status: inDs.verification_status, hunter_confidence: inDs.confidence, linkedin: inDs.linkedin,
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
        verification_status: f.verification_status, hunter_confidence: f.score, linkedin: f.linkedin,
      };
    }
    notes.push(`Email Finder: no address for "${p.full_name}".`);
  }

  // Public search fallback — only when neither Hunter nor the website yielded a relevant named person.
  if (!identified && input.publicSearch) {
    const ps = await findDecisionMakerViaPublicSearch({
      search: input.publicSearch.provider,
      company: { name: input.publicSearch.companyName, domain: input.domain, city: input.publicSearch.city },
      priority: input.priority,
      language: input.publicSearch.language,
      country: input.publicSearch.country,
      prospect: input.prospect,
    });
    base.public_search = ps;
    notes.push(`Public search: ${ps.queries.length} quer${ps.queries.length === 1 ? "y" : "ies"}, ${ps.results_seen} result(s), ${ps.rejected.length} weak candidate(s) rejected${ps.errors.length ? `, errors: ${ps.errors.join("; ")}` : ""}.`);
    const c = ps.selected;
    if (c) {
      const who = { name: c.full_name, first_name: c.first_name, last_name: c.last_name, title: c.title, title_source_url: c.result_url, role_match: c.role_match };
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
  }

  // Weaker fallback — Hunter seniority metadata (flagged as risk in the brief)
  const meta = hunterMetadataDecisionMakers(personal)[0];
  if (meta) {
    notes.push(`Fallback: Hunter metadata seniority=executive (${meta.position ?? "no title"}).`);
    return {
      ...base, name: [meta.first_name, meta.last_name].filter(Boolean).join(" ") || null, first_name: meta.first_name, last_name: meta.last_name,
      title: meta.position, source: "hunter_metadata", email: meta.email, email_source: "hunter_domain_search",
      verification_status: meta.verification_status, hunter_confidence: meta.confidence, linkedin: meta.linkedin,
    };
  }

  // Generic mailboxes are NOT a fallback recipient and never count as a decision-maker email.
  const generics = base.company_generic_emails.length ? ` Generic mailbox(es) kept as company metadata only: ${base.company_generic_emails.join(", ")}` : "";
  if (identified) {
    notes.push(`Named decision maker "${identified.name}" (${identified.title}) identified, but no business email found.${generics}`);
    return { ...base, ...identified, email: null, email_source: "none", verification_status: "not_verified", failure_reason: "DECISION_MAKER_EMAIL_NOT_FOUND" } as ContactSelection;
  }
  notes.push(`No relevant named decision maker found.${generics}`);
  return { ...base, source: "none", failure_reason: "CONTACT_NOT_FOUND" };
}
