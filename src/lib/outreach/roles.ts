/** Role-priority matching with Dutch + English synonyms. Configurable priority per campaign. */

export const ROLE_SYNONYMS: Record<string, string[]> = {
  owner: ["owner", "co-owner", "eigenaar", "eigenaresse", "mede-eigenaar", "mede eigenaar", "dga", "directeur-eigenaar", "directeur eigenaar", "proprietor"],
  founder: ["founder", "co-founder", "cofounder", "oprichter", "mede-oprichter", "medeoprichter", "oprichtster"],
  "managing director": ["managing director", "general manager", "ceo", "chief executive officer", "directeur", "algemeen directeur", "algemeen-directeur", "managing partner", "bestuurder", "zaakvoerder", "bedrijfsleider", "statutair directeur"],
  "practice owner": ["practice owner", "praktijkhouder", "praktijkeigenaar", "praktijk eigenaar", "praktijkhoudster", "tandarts-eigenaar", "tandarts eigenaar", "tandarts-praktijkhouder", "eigenaar praktijk"],
  "practice manager": ["practice manager", "praktijkmanager", "praktijk manager", "praktijkmanagement", "office manager", "officemanager", "manager bedrijfsvoering", "praktijkcoordinator", "praktijkcoördinator", "practice coordinator", "clinic manager", "kliniekmanager", "kliniek manager"],
  "operations manager": ["operations manager", "operationeel manager", "operationeel directeur", "coo", "chief operating officer", "manager operations", "head of operations", "hoofd operatie", "vestigingsmanager", "location manager"],
  partner: ["partner", "vennoot", "maat"],
  "office manager": ["office manager", "officemanager", "kantoormanager", "kantoorleider"],
};

/** Modifiers that disqualify a match (e.g. "assistant practice manager"). */
const NEGATIVE_MODIFIERS = /\b(assistent|assistant|stagiair|stagiaire|intern|trainee|junior|ex-|former|voormalig|oud-)\b|\bdeputy\b|\bvice\b|\badjunct\b/i;

export function normalizeRole(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[|/,;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function synonymsFor(priorityRole: string): string[] {
  const key = normalizeRole(priorityRole);
  const syn = ROLE_SYNONYMS[key] ?? [];
  return [...new Set([key, ...syn.map(normalizeRole)])];
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(haystack);
}

export interface RoleMatch {
  /** Index in campaign priority list (0 = best). */
  rank: number;
  matched_role: string;
  matched_text: string;
}

/** Returns the best (lowest-index) priority role matched by a title, or null. */
export function matchRole(title: string | null | undefined, priority: string[]): RoleMatch | null {
  if (!title) return null;
  const t = normalizeRole(title);
  if (!t || NEGATIVE_MODIFIERS.test(t)) return null;
  for (let i = 0; i < priority.length; i++) {
    for (const syn of synonymsFor(priority[i]!)) {
      if (containsPhrase(t, syn)) return { rank: i, matched_role: priority[i]!, matched_text: syn };
    }
  }
  return null;
}

/** Does this text look like it contains ANY known role (for website extraction)? */
export function looksLikeRoleTitle(text: string, priority: string[]): boolean {
  return matchRole(text, priority) !== null;
}

export interface RankableContact {
  position: string | null;
  seniority?: string | null;
  department?: string | null;
  confidence?: number | null;
  type?: string | null;
}

export interface RankedContact<T> {
  contact: T;
  match: RoleMatch;
  score: number;
}

/**
 * Rank contacts that explicitly match a campaign role. Unmatched contacts are NOT returned —
 * we never pick the first returned email blindly.
 * Score: role rank dominates; then Hunter seniority, then confidence.
 */
export function rankContacts<T extends RankableContact>(contacts: T[], priority: string[]): RankedContact<T>[] {
  const ranked: RankedContact<T>[] = [];
  for (const c of contacts) {
    if (c.type && c.type !== "personal") continue;
    const match = matchRole(c.position, priority);
    if (!match) continue;
    const seniorityBonus = c.seniority === "executive" ? 2 : c.seniority === "senior" ? 1 : 0;
    const score = (priority.length - match.rank) * 1000 + seniorityBonus * 100 + Math.min(100, c.confidence ?? 0);
    ranked.push({ contact: c, match, score });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/** Weaker fallback: Hunter metadata says executive/management but title did not match a priority role. */
export function hunterMetadataDecisionMakers<T extends RankableContact>(contacts: T[]): T[] {
  return contacts
    .filter((c) => (!c.type || c.type === "personal") && c.seniority === "executive" && (!c.position || !NEGATIVE_MODIFIERS.test(c.position)))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}
