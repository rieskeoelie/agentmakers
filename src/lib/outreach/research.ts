import { parseHtml, selectResearchPages, type PageKind, type ParsedPage } from "./html";
import type { CostTracker } from "./cost";
import { safeFetch, type SafeFetchOptions } from "./safeFetch";
import { isOccupationalWord, nonPersonReason } from "./personName";

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

export interface FetchedPage {
  url: string;
  kind: PageKind;
  fetched_at: string;
  parsed: ParsedPage;
}

export interface PageFetcher {
  fetch(url: string): Promise<{ finalUrl: string; body: string; fetchedAt: string }>;
  /** Optional: fetch robots.txt / sitemap XML (same SSRF protections; XML/plain content types allowed). */
  fetchResource?(url: string): Promise<{ finalUrl: string; body: string; fetchedAt: string }>;
}

export class SafePageFetcher implements PageFetcher {
  constructor(private readonly opts: SafeFetchOptions) {}
  async fetch(url: string) {
    const r = await safeFetch(url, this.opts);
    return { finalUrl: r.finalUrl, body: r.body, fetchedAt: r.fetchedAt };
  }
  async fetchResource(url: string) {
    const r = await safeFetch(url, { ...this.opts, maxBytes: Math.min(this.opts.maxBytes, 1_000_000), allowedContentTypes: ["application/xml", "text/xml", "text/plain", "application/rss+xml", "text/html"] });
    return { finalUrl: r.finalUrl, body: r.body, fetchedAt: r.fetchedAt };
  }
}

export interface WebsiteFetchResult {
  pages: FetchedPage[];
  errors: Array<{ url: string; error: string }>;
  /** Set when the homepage is an obvious placeholder / parking / configuration page (reason). Pages are then not researched. */
  placeholder?: string | null;
  /** Set when the homepage only loaded on the alternate canonical host (www ↔ bare domain). */
  host_fallback?: { from: string; to: string; reason: string } | null;
}

/**
 * Host-level failures (TLS certificate/handshake, DNS, connection refused/reset/unreachable, timeout) — the host did
 * not serve us at all, so the alternate canonical host may. HTTP status errors and SSRF rejections never qualify.
 */
export function isHostLevelFailure(e: unknown): boolean {
  const err = e as { name?: string; code?: string; message?: string } | undefined;
  if (!err || err.name === "UnsafeUrlError") return false;
  const msg = String(err.message ?? "");
  if (/^HTTP \d{3}$|Content-type not allowed|Response (too large|exceeded)|Too many redirects|Redirect/i.test(msg)) return false;
  const code = String(err.code ?? "");
  if (/^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|EPROTO|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT)/.test(code)) return true;
  return /altnames|certificate|self[- ]signed|handshake|ssl|tls|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|socket hang up|Timeout after/i.test(msg);
}

/** www.example.nl ↔ example.nl (same scheme/path). Null for other subdomains, IPs or unparsable URLs. */
export function alternateCanonicalUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return null;
  const labels = host.split(".");
  if (labels[0] === "www" && labels.length >= 3) u.hostname = labels.slice(1).join(".");
  else if (labels.length === 2 || (labels.length === 3 && /^(co|com|org|net|ac|gov)$/.test(labels[1]!))) u.hostname = `www.${host}`;
  else return null;
  return u.toString();
}

const PLACEHOLDER_PHRASES = /configuration (is )?in progress|please stand by|domain (name )?(is )?(parked|for sale)|this domain (may be|is) for sale|domein(naam)? (is )?(te koop|geparkeerd|gereserveerd)|deze (website|domeinnaam|domein) is (nog niet|geregistreerd|gereserveerd)|(website|site) (is )?(coming soon|under construction|in aanbouw|in onderhoud)|binnenkort online|under construction|coming soon|default (web ?)?page|welcome to nginx|apache2? (ubuntu |debian )?default page|^it works!?$|parkingcrew|sedoparking|bodis\.com|hier komt (binnenkort )?een (nieuwe )?website/im;

/**
 * Obvious placeholder / parking / configuration homepage? Conservative: a known placeholder phrase on a page with
 * little text, or a practically empty page (< 4 words) without internal links or application script (a JS-rendered
 * site is NOT a placeholder). Returns the reason or null.
 */
export function detectPlaceholder(rawHtml: string, parsed: ParsedPage, pageUrl: string): string | null {
  const text = `${parsed.title}\n${parsed.text}`;
  const words = parsed.text.split(/\s+/).filter((w) => /[a-zà-ÿ]{2,}/i.test(w)).length;
  const phrase = text.match(PLACEHOLDER_PHRASES)?.[0];
  if (phrase && words < 150) return `PLACEHOLDER_TEXT: "${phrase.trim().slice(0, 60)}"`;
  let host = "";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  const internalLinks = parsed.links.filter((l) => {
    if (!l.href || /^(#|mailto:|tel:|javascript:)/i.test(l.href)) return false;
    try {
      const u = new URL(l.href, pageUrl);
      return u.hostname.replace(/^www\./, "") === host && u.pathname.replace(/\/+$/, "") !== new URL(pageUrl).pathname.replace(/\/+$/, "");
    } catch {
      return false;
    }
  }).length;
  const appShell = /<script\b[^>]*\bsrc\s*=/i.test(rawHtml) || /<div[^>]+id\s*=\s*["'](root|app|__next|__nuxt)["']/i.test(rawHtml);
  // Practically empty (a real one-line site such as "Afspraak maken? Bel ons op …" is NOT a placeholder).
  if (words < 4 && internalLinks === 0 && !appShell) return `NO_CONTENT: ${words} word(s), no internal links`;
  return null;
}

/** Fetch homepage + up to (maxPages-1) relevant internal pages. Homepage failure is fatal for the prospect. */
export async function fetchWebsite(
  website: string,
  fetcher: PageFetcher,
  opts: { maxPages: number; maxTextChars: number; prospect: string; cost?: CostTracker },
): Promise<WebsiteFetchResult> {
  const errors: Array<{ url: string; error: string }> = [];
  const record = (url: string, ok: boolean, detail?: string) =>
    opts.cost?.record({ prospect: opts.prospect, provider: "website", operation: "fetch", estimated_cost_eur: 0, actual_cost_eur: 0, native_cost: null, result: ok ? "ok" : "error", detail: `${url}${detail ? ` — ${detail}` : ""}` });

  const homeUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  let home;
  let host_fallback: WebsiteFetchResult["host_fallback"] = null;
  try {
    home = await fetcher.fetch(homeUrl);
    record(homeUrl, true);
  } catch (e) {
    const msg = (e as Error).message;
    record(homeUrl, false, msg);
    errors.push({ url: homeUrl, error: msg });
    // www ↔ bare-domain retry, only for host-level failures. Same fetcher → same SSRF/redirect/size protections.
    const alt = isHostLevelFailure(e) ? alternateCanonicalUrl(homeUrl) : null;
    if (!alt) return { pages: [], errors, placeholder: null, host_fallback: null };
    try {
      home = await fetcher.fetch(alt);
      record(alt, true, `alternate canonical host after: ${msg.slice(0, 120)}`);
      host_fallback = { from: homeUrl, to: alt, reason: msg.slice(0, 200) };
    } catch (e2) {
      const msg2 = (e2 as Error).message;
      record(alt, false, msg2);
      errors.push({ url: alt, error: msg2 });
      return { pages: [], errors, placeholder: null, host_fallback: null };
    }
  }
  const homeParsed = parseHtml(home.body, opts.maxTextChars);
  const pages: FetchedPage[] = [{ url: home.finalUrl, kind: "home", fetched_at: home.fetchedAt, parsed: homeParsed }];
  const placeholder = detectPlaceholder(home.body, homeParsed, home.finalUrl);
  if (placeholder) return { pages, errors, placeholder, host_fallback };
  const targets = selectResearchPages(home.finalUrl, homeParsed.links, Math.max(1, opts.maxPages));

  // small per-site concurrency (2)
  for (let i = 0; i < targets.length; i += 2) {
    const batch = targets.slice(i, i + 2);
    const results = await Promise.allSettled(batch.map((t) => fetcher.fetch(t.url)));
    results.forEach((r, j) => {
      const t = batch[j]!;
      if (r.status === "fulfilled") {
        record(t.url, true);
        pages.push({ url: r.value.finalUrl, kind: t.kind, fetched_at: r.value.fetchedAt, parsed: parseHtml(r.value.body, opts.maxTextChars) });
      } else {
        const msg = (r.reason as Error)?.message ?? String(r.reason);
        record(t.url, false, msg);
        errors.push({ url: t.url, error: msg });
      }
    });
  }
  return { pages, errors, placeholder: null, host_fallback };
}

/* ------------------------------------------------------------------ */
/* Untrusted-content guard                                             */
/* ------------------------------------------------------------------ */

const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts?)/i,
  /negeer (alle |de )?(vorige|eerdere) (instructies|opdrachten)/i,
  /disregard (the |all )?(system|previous)/i,
  /system prompt/i,
  /you are now/i,
  /\bas an ai\b/i,
  /\b(assistant|claude|chatgpt|llm|language model)\b.{0,40}\b(must|should|moet)\b/i,
  /api[_ -]?key|secret|password|wachtwoord/i,
  /<\/?(system|instructions?|untrusted)/i,
];

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

/** Strip control chars / markup-ish delimiters so a snippet cannot break out of its data boundary. */
export function sanitizeSnippet(s: string, max = 240): string {
  let out = s.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, " ").replace(/[<>{}`]/g, " ").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
  if (out.length > max) out = `${out.slice(0, max - 1)}…`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Evidence extraction (deterministic; OBSERVED FACTS only)           */
/* ------------------------------------------------------------------ */

export type SignalType =
  | "APPOINTMENT_BY_PHONE"
  | "RESCHEDULE_BY_PHONE"
  | "PHONE_HOURS"
  | "EMERGENCY_ROUTING"
  | "PHONE_CTA"
  | "RECEPTION_HIRING"
  | "MULTI_LOCATION"
  | "WEEKEND_CLOSED"
  | "FAQ_PRESENT"
  | "ONLINE_BOOKING"
  | "EXISTING_VOICE_AI";

export interface Evidence {
  id: string;
  signal: SignalType;
  polarity: "positive" | "negative";
  strength: "strong" | "weak";
  /** Short factual statement. Describes what the page SAYS, nothing more. */
  fact: string;
  /** Exact (sanitized) text from the page. */
  snippet: string;
  source_url: string;
  page_kind: PageKind;
  fetched_at: string;
  confidence: "high" | "medium" | "low";
}

export interface Inference {
  id: string;
  text: string;
  based_on: string[];
  confidence: "medium" | "low";
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PHONE = /(\bbel\b|\bbellen\b|\bbelt\b|\bbel ons\b|telefonisch|telefoon|\btel\.|\bcall us\b|\bcall\b|by phone|\bphone\b|\bphoning\b)/;
const TIME = /\b([01]?\d|2[0-3])[:.][0-5]\d\b/;

interface Rule {
  signal: SignalType;
  polarity: "positive" | "negative";
  strength: "strong" | "weak";
  test: (s: string) => boolean;
  fact: string;
}

const RULES: Rule[] = [
  {
    signal: "RESCHEDULE_BY_PHONE", polarity: "positive", strength: "strong",
    test: (s) => /(afzeggen|afmelden|annuleren|verzetten|verplaatsen|wijzigen|cancel|reschedul)/.test(s) && /(afspraak|afspraken|appointment|reserver|booking)/.test(s) && PHONE.test(s),
    fact: "The website says appointment changes/cancellations are handled by phone.",
  },
  {
    signal: "APPOINTMENT_BY_PHONE", polarity: "positive", strength: "strong",
    test: (s) => /(afspraak|afspraken|appointment|reserveren|reservering|reservation|inplannen|inschrijven|aanmelden)/.test(s) && PHONE.test(s) && !/(afzeggen|annuleren|verzetten|cancel)/.test(s),
    fact: "The website asks people to call to make an appointment/reservation or register.",
  },
  {
    signal: "PHONE_HOURS", polarity: "positive", strength: "strong",
    test: (s) => /(telefonisch bereikbaar|telefonische bereikbaarheid|telefonisch spreekuur|bereikbaar (van|tussen|op)|phone (lines|hours)|lines are open|reachable by phone|telefoon(nummer)? is bereikbaar)/.test(s) && TIME.test(s),
    fact: "The website publishes specific phone hours.",
  },
  {
    signal: "EMERGENCY_ROUTING", polarity: "positive", strength: "strong",
    test: (s) => /(spoed|noodgeval|emergency|acute (klacht|pijn)|buiten (kantoor|praktijk|openings)tijd|na sluitingstijd|avond- en weekend|weekenddienst|dienstdoende|tandartsenpost|huisartsenpost|spoedlijn|spoednummer)/.test(s) && (PHONE.test(s) || /\d{2,4}[- ]?\d{6,7}/.test(s)),
    fact: "The website routes urgent/after-hours cases via a phone number.",
  },
  {
    signal: "RECEPTION_HIRING", polarity: "positive", strength: "strong",
    test: (s) => /(vacature|we zoeken|wij zoeken|gezocht|join our team|we are hiring|we're hiring|hiring)/.test(s) && /(receptionist|receptie|baliemedewerker|baliemedewerkster|balie|telefonist|front ?office|front ?desk|klantenservice|tandartsassistent|doktersassistent|praktijkassistent|secretaresse|planner)/.test(s),
    fact: "The website advertises a front-desk/reception/assistant vacancy.",
  },
  {
    signal: "WEEKEND_CLOSED", polarity: "positive", strength: "weak",
    test: (s) => /(zaterdag|zondag|weekend|saturday|sunday|\bza\b|\bzo\b)[^.]{0,40}(gesloten|closed)/.test(s),
    fact: "The website lists the business as closed on weekend day(s).",
  },
  {
    signal: "MULTI_LOCATION", polarity: "positive", strength: "weak",
    test: (s) => /(\b(twee|drie|vier|vijf|zes|\d+)\s+(vestigingen|locaties|praktijken|locations|branches)\b|\bonze (vestigingen|locaties)\b|\bour locations\b)/.test(s),
    fact: "The website mentions multiple locations.",
  },
  {
    signal: "ONLINE_BOOKING", polarity: "negative", strength: "weak",
    test: (s) => /(online (een )?afspraak (maken|inplannen|boeken)|afspraak online|boek online|book online|online reserveren|reserveer online|plan (zelf )?online|online booking)/.test(s),
    fact: "The website offers online appointment booking/reservations.",
  },
  {
    signal: "EXISTING_VOICE_AI", polarity: "negative", strength: "strong",
    test: (s) => /(ai[- ]?(receptionist|receptioniste|telefoon|telefonist|voice|spraak)|voice ?ai|spraakassistent|virtuele (receptionist|receptioniste|telefonist)|digitale (telefonist|receptionist)|telefoonassistent|ai phone (agent|assistant))/.test(s),
    fact: "The website indicates an AI phone/voice assistant is already in use.",
  },
];

const PHONE_CTA_RE = /(\bbel ons\b|\bbel gerust\b|\bbel direct\b|\bbel dan\b|\bbel naar\b|neem telefonisch contact|\bcall us\b|\bgive us a call\b|\bbel (met )?(de|onze) (praktijk|balie|assistente|receptie)\b)/;

const INFERENCE_TEXT: Partial<Record<SignalType, string>> = {
  RESCHEDULE_BY_PHONE: "Routine appointment changes likely create repetitive phone work that a voice agent could take over.",
  APPOINTMENT_BY_PHONE: "Booking intake depends on phone calls; a voice agent could handle routine booking calls.",
  PHONE_HOURS: "Callers outside the published phone hours may not reach anyone; a voice agent could answer those calls.",
  EMERGENCY_ROUTING: "Urgent/after-hours calls need triage or routing, which a voice agent could support.",
  RECEPTION_HIRING: "The front desk may be under capacity; a voice agent could absorb part of the call load.",
  PHONE_CTA: "Telephone is a primary contact route, so call volume is plausibly material.",
  WEEKEND_CLOSED: "Calls during weekend closure may go unanswered.",
  MULTI_LOCATION: "Multiple locations may require call routing between sites.",
  ONLINE_BOOKING: "Part of the booking demand is already self-service, which lowers (but does not remove) voice need.",
  EXISTING_VOICE_AI: "An equivalent solution may already be in place.",
};

/** Short block-level lines are evaluated whole (keeps "Afspraak maken? Bel ons…" together); long ones per sentence. */
function sentencesOf(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const parts = l.length <= 300 ? [l] : l.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/);
    for (const s of parts) {
      const t = s.trim();
      if (t.length >= 12 && t.length <= 400) out.push(t);
    }
  }
  return out;
}

export interface ExtractionResult {
  observed_facts: Evidence[];
  inferences: Inference[];
  suspicious_snippets: Array<{ source_url: string; snippet: string }>;
}

export function extractEvidence(pages: FetchedPage[]): ExtractionResult {
  const facts: Evidence[] = [];
  const suspicious: Array<{ source_url: string; snippet: string }> = [];
  const perSignal = new Map<SignalType, number>();
  let n = 0;
  const add = (rule: Pick<Rule, "signal" | "polarity" | "strength" | "fact">, snippet: string, page: FetchedPage, confidence: Evidence["confidence"]) => {
    if ((perSignal.get(rule.signal) ?? 0) >= 2) return;
    if (facts.some((f) => f.signal === rule.signal && f.snippet === snippet)) return;
    perSignal.set(rule.signal, (perSignal.get(rule.signal) ?? 0) + 1);
    facts.push({
      id: `E${++n}`, signal: rule.signal, polarity: rule.polarity, strength: rule.strength, fact: rule.fact,
      snippet, source_url: page.url, page_kind: page.kind, fetched_at: page.fetched_at, confidence,
    });
  };

  let phoneCtaCount = 0;
  let phoneCtaFirst: { snippet: string; page: FetchedPage } | null = null;
  let telLinkPages = 0;

  for (const page of pages) {
    if (page.parsed.telLinks.length) telLinkPages++;
    for (const sentence of sentencesOf(page.parsed.lines)) {
      if (looksLikeInjection(sentence)) {
        suspicious.push({ source_url: page.url, snippet: sanitizeSnippet(sentence, 160) });
        continue; // untrusted instructions never become evidence
      }
      const f = fold(sentence);
      const snippet = sanitizeSnippet(sentence);
      for (const rule of RULES) if (rule.test(f)) add(rule, snippet, page, rule.strength === "strong" ? "high" : "medium");
      if (PHONE_CTA_RE.test(f)) {
        phoneCtaCount++;
        phoneCtaFirst ??= { snippet, page };
      }
    }
    // FAQ: a FAQ page with several questions
    if (page.kind === "faq") {
      const qs = page.parsed.lines.filter((l) => l.trim().endsWith("?") && !looksLikeInjection(l));
      if (qs.length >= 5) {
        add({ signal: "FAQ_PRESENT", polarity: "positive", strength: "weak", fact: `The website has a FAQ page with at least ${qs.length} questions.` }, sanitizeSnippet(qs.slice(0, 2).join(" ")), page, "high");
      }
    }
  }

  if (phoneCtaFirst && phoneCtaCount + telLinkPages >= 2) {
    const strong = phoneCtaCount >= 3;
    add(
      { signal: "PHONE_CTA", polarity: "positive", strength: strong ? "strong" : "weak", fact: `The website asks visitors to call (${phoneCtaCount} call-to-call phrases across fetched pages).` },
      phoneCtaFirst.snippet, phoneCtaFirst.page, strong ? "high" : "medium",
    );
  }

  // Inferences are kept strictly separate and always reference the facts they derive from.
  const inferences: Inference[] = [];
  const bySignal = new Map<SignalType, Evidence[]>();
  for (const f of facts) bySignal.set(f.signal, [...(bySignal.get(f.signal) ?? []), f]);
  let k = 0;
  for (const [signal, evs] of bySignal) {
    const text = INFERENCE_TEXT[signal];
    if (text) inferences.push({ id: `I${++k}`, text, based_on: evs.map((e) => e.id), confidence: evs.some((e) => e.strength === "strong") ? "medium" : "low" });
  }
  return { observed_facts: facts, inferences, suspicious_snippets: suspicious };
}

/* ------------------------------------------------------------------ */
/* Website person discovery (Path B) — explicit names + titles only    */
/* ------------------------------------------------------------------ */

const TUSSENVOEGSELS = new Set(["van", "de", "der", "den", "ter", "ten", "het", "'t", "te", "in", "op", "la", "le", "du", "da", "di", "von", "vd", "v.d."]);
const NAME_PREFIX = /^(dr|drs|mr|ir|ing|prof|mw|mevr|dhr|bc|msc|bsc)\.?\s+/i;
const NON_NAME_WORDS = new Set([
  "tandartspraktijk", "praktijk", "team", "over", "ons", "contact", "welkom", "tandarts", "tandartsen", "mondhygiënist",
  "assistente", "assistent", "eigenaar", "praktijkhouder", "directeur", "manager", "home", "onze", "uw",
  "afspraak", "openingstijden", "behandelingen", "vacatures", "kliniek", "centrum", "groep", "b.v.", "bv", "the", "our",
  "about", "meet", "owner", "founder", "oprichter", "praktijkmanager", "dental", "clinic",
  "mondzorg", "orthodontie", "tandheelkunde", "linkedin", "algemeen", "lees", "meer",
  // weekday abbreviations / names (availability lists such as "Di Do Vr" are not names)
  "ma", "di", "wo", "do", "vr", "za", "zo", "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag",
]);

export interface WebsitePerson {
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  source_url: string;
  snippet: string;
}

export function isPersonName(raw: string): boolean {
  return isPersonNameShape(raw) && nonPersonReason(raw.replace(NAME_PREFIX, "").trim()) === null;
}

/** Shape only: 2–5 capitalised tokens incl. a ≥3-letter surname, no digits/URLs, no known non-name word. */
export function isPersonNameShape(raw: string): boolean {
  const s = raw.replace(NAME_PREFIX, "").trim();
  if (s.length < 4 || s.length > 50 || /\d|@|https?:/.test(s)) return false;
  const tokens = s.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5) return false;
  // A surname of ≥3 letters must be present (rules out "Di Do Vr", "J. K.").
  if (!tokens.some((t) => /^[A-ZÀ-Ý][a-zà-ÿ'’-]{2,}$/.test(t))) return false;
  let caps = 0;
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (NON_NAME_WORDS.has(lower)) return false;
    if (TUSSENVOEGSELS.has(lower)) continue;
    // Capitalised word, or initials such as "W." / "T.H.T." (common on Dutch practice websites).
    if (/^[A-ZÀ-Ý][a-zà-ÿ'’-]+$/.test(t) || /^([A-ZÀ-Ý]\.){1,4}$/.test(t)) caps++;
    else return false;
  }
  return caps >= 2;
}

export function splitName(full: string): { first_name: string; last_name: string } {
  const tokens = full.replace(NAME_PREFIX, "").trim().split(/\s+/);
  return { first_name: tokens[0] ?? "", last_name: tokens.slice(1).join(" ") };
}

/**
 * Extract (name, explicit title) pairs. Patterns:
 *   "Jan de Vries – praktijkhouder" | "Jan de Vries, eigenaar" | "Eigenaar: Jan de Vries"
 *   or a name line directly adjacent to a title line.
 * `isRole` decides whether a text is a role title (campaign role rules).
 */
export function extractPeople(pages: FetchedPage[], isRole: (text: string) => boolean): WebsitePerson[] {
  const people: WebsitePerson[] = [];
  const push = (name: string, title: string, page: FetchedPage, snippet: string) => {
    const clean = name.replace(NAME_PREFIX, "").trim();
    if (people.some((p) => p.full_name.toLowerCase() === clean.toLowerCase())) return;
    people.push({ full_name: clean, ...splitName(clean), title: title.trim(), source_url: page.url, snippet: sanitizeSnippet(snippet) });
  };
  for (const page of pages) {
    if (!["team", "about", "contact", "home"].includes(page.kind)) continue;
    const lines = page.parsed.lines.filter((l) => !looksLikeInjection(l));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.length > 140) continue;
      const parts = line.split(/\s+[–—|-]\s+|,\s+|:\s+/);
      if (parts.length >= 2) {
        const [a, ...rest] = parts;
        const b = rest.join(", ");
        if (isPersonName(a!) && isRole(b)) { push(a!, b, page, line); continue; }
        if (isRole(a!) && isPersonName(b)) { push(b, a!, page, line); continue; }
      }
      if (isRole(line) && line.length <= 80) {
        const prev = lines[i - 1];
        const next = lines[i + 1];
        if (prev && isPersonName(prev)) push(prev, line, page, `${prev} — ${line}`);
        else if (next && isPersonName(next)) push(next, line, page, `${line} — ${next}`);
        continue;
      }
      // Profile-card bio: name heading, then (within 5 lines, before the next name) a bio that STARTS with the
      // explicit title — "Peter Balfoort" … "Tandarts en praktijkhouder, is geboren in …" — or with
      // "<first name> is <title>" — "Robert de Boer" … "Robert is tandarts en praktijkhouder, is afgestudeerd …".
      if (line.length <= 50 && isPersonName(line)) {
        const first = line.replace(NAME_PREFIX, "").split(/\s+/)[0]!;
        for (let j = i + 1; j <= i + 5 && j < lines.length; j++) {
          let l = lines[j]!;
          if (l.length <= 50 && isPersonName(l)) break;
          const selfRef = new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+is\\s+`, "i");
          if (selfRef.test(l)) l = l.replace(selfRef, "");
          const lead = l.split(/,\s+|\s+is\s+|\.\s+/)[0]!.trim();
          if (lead.length <= 60 && isRole(lead)) {
            push(line, lead, page, `${line} — ${l.slice(0, 160)}`);
            break;
          }
        }
      }
    }
  }
  return people;
}

/**
 * Partial decision makers: the company's OWN page pairs a single first name with an owner/director-type title,
 * e.g. a profile card "Richard" / "Eigenaar" or a line "Richard – eigenaar". Only a first name is recorded —
 * a surname is never derived (not from the company name, not from the domain).
 */
export interface PartialWebsitePerson {
  first_name: string;
  title: string;
  source_url: string;
  snippet: string;
}

const FIRST_NAME = /^[A-ZÀ-Ý][a-zà-ÿ'’-]{1,14}$/;

export function isFirstNameOnly(raw: string): boolean {
  const s = raw.trim();
  if (!FIRST_NAME.test(s)) return false;
  const lower = s.toLowerCase();
  return !NON_NAME_WORDS.has(lower) && !TUSSENVOEGSELS.has(lower) && !isOccupationalWord(s);
}

/** A first-name-shaped word rejected because it is a role/occupation ("Kapster" next to "Eigenaresse"). */
export interface RejectedNameCandidate { candidate: string; title: string; source_url: string; reason: "OCCUPATIONAL_TITLE_AS_NAME" }

export function extractFirstNameOwners(pages: FetchedPage[], isOwnerRole: (text: string) => boolean, rejected?: RejectedNameCandidate[]): PartialWebsitePerson[] {
  const out: PartialWebsitePerson[] = [];
  const isFirstName = (cand: string, title: string, page: FetchedPage) => {
    if (isFirstNameOnly(cand)) return true;
    const c = cand.trim();
    if (rejected && FIRST_NAME.test(c) && isOccupationalWord(c) && !rejected.some((r) => r.candidate === c && r.source_url === page.url)) {
      rejected.push({ candidate: c, title: title.trim(), source_url: page.url, reason: "OCCUPATIONAL_TITLE_AS_NAME" });
    }
    return false;
  };
  const push = (first: string, title: string, page: FetchedPage, snippet: string) => {
    if (out.some((p) => p.first_name === first)) return;
    out.push({ first_name: first, title: title.trim(), source_url: page.url, snippet: sanitizeSnippet(snippet) });
  };
  for (const page of pages) {
    if (!["team", "about", "contact", "home"].includes(page.kind)) continue;
    const lines = page.parsed.lines.filter((l) => !looksLikeInjection(l));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.length > 60) continue;
      // "Richard – Eigenaar" | "Eigenaar: Richard"
      const parts = line.split(/\s+[–—|-]\s+|,\s+|:\s+/);
      if (parts.length === 2) {
        const [a, b] = parts as [string, string];
        if (isOwnerRole(b) && b.length <= 40 && isFirstName(a, b, page)) { push(a, b, page, line); continue; }
        if (isOwnerRole(a) && a.length <= 40 && isFirstName(b, a, page)) { push(b, a, page, line); continue; }
      }
      // Profile card: a title line directly under (preferred) or above a first-name line.
      if (line.length <= 40 && isOwnerRole(line)) {
        const prev = lines[i - 1];
        const next = lines[i + 1];
        if (prev && isFirstName(prev, line, page)) push(prev, line, page, `${prev} — ${line}`);
        else if (next && isFirstName(next, line, page)) push(next, line, page, `${line} — ${next}`);
      }
    }
  }
  return out;
}
