/** Minimal, dependency-free HTML → text/link extraction. Content is treated as inert data. */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", eacute: "é", euml: "ë", iuml: "ï",
  ouml: "ö", uuml: "ü", auml: "ä", egrave: "è", agrave: "à", ccedil: "ç", ndash: "–", mdash: "—", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", middot: "·", bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const BLOCK_TAGS = "p|div|br|li|ul|ol|h[1-6]|tr|td|th|section|article|header|footer|nav|aside|main|table|dt|dd|blockquote|address|figcaption|form|label|button";

export interface ParsedPage {
  title: string;
  /** Visible text split into trimmed, non-empty lines (block-level boundaries). */
  lines: string[];
  text: string;
  links: Array<{ href: string; text: string }>;
  telLinks: string[];
}

export function parseHtml(html: string, maxChars = 30_000): ParsedPage {
  let s = html.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const title = decodeEntities(s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();

  const links: Array<{ href: string; text: string }> = [];
  const telLinks: string[] = [];
  const aRe = /<a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = aRe.exec(s))) {
    const href = decodeEntities((m[2] ?? m[3] ?? m[4] ?? "").trim());
    const text = decodeEntities((m[5] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (/^tel:/i.test(href)) telLinks.push(href);
    else links.push({ href, text });
  }

  s = s.replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  const lines = s
    .split(/\n+/)
    .map((l) => l.replace(/[ \t \r\f\v]+/g, " ").trim())
    .filter((l) => l.length > 0);
  let text = lines.join("\n");
  if (text.length > maxChars) text = text.slice(0, maxChars);
  return { title, lines: text.split("\n"), text, links, telLinks };
}

export type PageKind =
  | "home" | "contact" | "about" | "team" | "services" | "appointment" | "faq" | "locations" | "jobs" | "hours" | "emergency";

const PAGE_PATTERNS: Array<{ kind: PageKind; re: RegExp; priority: number }> = [
  { kind: "contact", re: /contact|bereikbaar|openingstijden|route/, priority: 10 },
  { kind: "appointment", re: /afspraak|afspraken|appointment|booking|boeken|reserv|inschrijven|aanmelden/, priority: 9 },
  { kind: "team", re: /\bteam\b|ons-team|onze-medewerkers|medewerkers|wie-zijn-wij|management|directie|staff|our-team/, priority: 8 },
  { kind: "about", re: /over-ons|over|about|wie-we-zijn|praktijk-info|onze-praktijk/, priority: 7 },
  { kind: "emergency", re: /spoed|nood|emergency|buiten-kantoortijd|avond|weekend/, priority: 7 },
  { kind: "faq", re: /faq|veelgestelde|vragen|questions/, priority: 6 },
  { kind: "services", re: /diensten|behandelingen|services|wat-we-doen|specialisaties|tarieven/, priority: 5 },
  { kind: "locations", re: /locaties|vestigingen|locations|branches|praktijken/, priority: 4 },
  { kind: "jobs", re: /vacature|werken-bij|careers|jobs|werkenbij/, priority: 3 },
  { kind: "hours", re: /openingstijd|opening-hours|tijden/, priority: 3 },
];

const SKIP_PATH = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$|\/(wp-admin|wp-login|login|cart|winkelwagen|checkout|account|privacy|cookie|disclaimer|algemene-voorwaarden|sitemap|feed|tag|category|author)\b/i;

export function classifyPath(pathAndText: string): { kind: PageKind; priority: number } | null {
  const s = pathAndText.toLowerCase();
  for (const p of PAGE_PATTERNS) if (p.re.test(s)) return { kind: p.kind, priority: p.priority };
  return null;
}

/**
 * Choose up to (maxPages - 1) internal pages in addition to the homepage.
 * Same-host only, http(s) only, no files, deduped by path, one page per kind first.
 */
export function selectResearchPages(homeUrl: string, links: Array<{ href: string; text: string }>, maxPages: number): Array<{ url: string; kind: PageKind }> {
  const home = new URL(homeUrl);
  const stripWww = (h: string) => h.replace(/^www\./, "");
  const candidates = new Map<string, { url: string; kind: PageKind; priority: number }>();
  for (const l of links) {
    if (!l.href || /^(mailto:|javascript:|#|data:)/i.test(l.href)) continue;
    let u: URL;
    try {
      u = new URL(l.href, home);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (stripWww(u.hostname) !== stripWww(home.hostname)) continue;
    if (SKIP_PATH.test(u.pathname)) continue;
    u.hash = "";
    u.search = "";
    const key = u.pathname.replace(/\/+$/, "") || "/";
    if (key === (home.pathname.replace(/\/+$/, "") || "/")) continue;
    const cls = classifyPath(`${decodeURIComponent(u.pathname)} ${l.text}`);
    if (!cls) continue;
    const prev = candidates.get(key);
    if (!prev || prev.priority < cls.priority) candidates.set(key, { url: u.toString(), ...cls });
  }
  const sorted = [...candidates.values()].sort((a, b) => b.priority - a.priority || a.url.length - b.url.length);
  const picked: Array<{ url: string; kind: PageKind }> = [];
  const kinds = new Set<PageKind>();
  for (const c of sorted) if (!kinds.has(c.kind) && picked.length < maxPages - 1) { picked.push(c); kinds.add(c.kind); }
  for (const c of sorted) if (!picked.some((p) => p.url === c.url) && picked.length < maxPages - 1) picked.push(c);
  return picked.map(({ url, kind }) => ({ url, kind }));
}
