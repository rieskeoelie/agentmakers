/**
 * Niche-aware decision-maker vocabulary.
 *
 * The campaign's role list (`decision_maker_priority`, default = DEFAULT_ROLE_PRIORITY) stays the source of truth for
 * WHO counts as a decision maker. This module adapts that list and the search wording to the campaign NICHE:
 *  - practice-only roles ("practice owner", "practice manager") are kept only for practice niches (dental, physio …);
 *  - niche-specific job titles are added as extra literal roles right after their parent role (e.g. "garagehouder"
 *    after "owner" for automotive), so title matching recognises them with the existing role rules;
 *  - public-search and same-domain site-search terms are derived from the effective roles + niche profile instead of
 *    hard-coded dental wording.
 * Nothing here relaxes evidence rules: a role still has to be an explicit title next to a named person.
 */

export type NicheProfile = "practice" | "automotive" | "generic";

export interface RoleVocabulary {
  profile: NicheProfile;
  /** Effective role priority used for title matching (campaign roles adapted to the niche). */
  priority: string[];
  /** Dutch / English query terms for the public decision-maker search. */
  searchRoles: { nl: string[]; en: string[] };
  /** Shorter role list for the public-LinkedIn query. */
  linkedinRoles: { nl: string[]; en: string[] };
  /** Terms for the one same-domain `site:` search (team / about pages). */
  siteSearchTerms: string[];
  /** URL/anchor keywords that mark a same-domain page as a likely team/leadership/about page, with weights. */
  teamPageKeywords: Array<[RegExp, number]>;
}

const PRACTICE_NICHE = /tandarts|dental|dentist|mondzorg|mondhygi|orthodont|praktijk|fysio|physio|huisarts|kliniek|clinic|dierenarts|logoped|psycholo|therapeut|podotherap|osteopa|chiropract|verloskund|dermato|optometr/;
const AUTOMOTIVE_NICHE = /auto|garage|banden|apk|occasion|car\b|cars\b|dealer|schadeherstel|carrosserie|motor|lease/;

export function nicheProfile(niche: string | null | undefined): NicheProfile {
  const n = (niche ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (AUTOMOTIVE_NICHE.test(n)) return "automotive";
  if (PRACTICE_NICHE.test(n)) return "practice";
  return "generic";
}

/** Practice-only roles: meaningless outside practices (dental, physio …). */
const PRACTICE_ONLY_ROLES = new Set(["practice owner", "practice manager"]);

/** Extra literal job titles per niche, inserted right after their parent campaign role. */
const EXTRA_TITLES: Record<NicheProfile, Record<string, string[]>> = {
  practice: {},
  automotive: {
    owner: ["garagehouder", "garage-eigenaar", "garage eigenaar", "eigenaar garage", "eigenaar autobedrijf"],
    "managing director": ["vestigingsdirecteur", "vestigingsleider", "filiaalmanager", "filiaaldirecteur"],
  },
  generic: {},
};

const BASE_TEAM_KEYWORDS: Array<[RegExp, number]> = [
  [/team/, 6],
  [/medewerker/, 6],
  [/directie/, 6],
  [/management/, 5],
  [/wie-?zijn-?wij|wie-?we-?zijn/, 5],
  [/organisatie/, 4],
  [/over-?ons/, 3],
  [/ons-?bedrijf|het-?bedrijf/, 3],
  [/historie|geschiedenis|history/, 3],
];

const PROFILE_TEAM_KEYWORDS: Record<NicheProfile, Array<[RegExp, number]>> = {
  practice: [[/onze-?praktijk/, 3], [/praktijk/, 2]],
  automotive: [[/onze-?garage|ons-?autobedrijf/, 3]],
  generic: [],
};

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function effectivePriority(priority: string[], profile: NicheProfile): string[] {
  const out: string[] = [];
  for (const role of priority) {
    const key = fold(role);
    if (profile !== "practice" && PRACTICE_ONLY_ROLES.has(key)) continue;
    out.push(role);
    for (const extra of EXTRA_TITLES[profile][key] ?? []) if (!out.includes(extra)) out.push(extra);
  }
  return out.length ? out : priority;
}

/** Dutch query terms per campaign role key (first term = the most common title). */
const NL_ROLE_TERMS: Record<string, string[]> = {
  owner: ["eigenaar", "DGA"],
  founder: ["oprichter"],
  "managing director": ["directeur", "bedrijfsleider"],
  "practice owner": ["praktijkhouder", "praktijkeigenaar"],
  "practice manager": ["praktijkmanager"],
  "operations manager": ["vestigingsmanager"],
  partner: [],
  "office manager": ["officemanager"],
};
const EN_ROLE_TERMS: Record<string, string[]> = {
  owner: ["owner"],
  founder: ["founder"],
  "managing director": ["\"managing director\"", "\"general manager\""],
  "practice owner": [],
  "practice manager": ["\"practice manager\""],
  "operations manager": ["\"operations manager\""],
  partner: ["partner"],
  "office manager": ["\"office manager\""],
};
const NL_PROFILE_TERMS: Record<NicheProfile, string[]> = { practice: [], automotive: ["garagehouder"], generic: [] };

function termsFor(priority: string[], table: Record<string, string[]>, extra: string[], max: number): string[] {
  const out: string[] = [];
  for (const role of priority) {
    const key = fold(role);
    const mapped = table[key];
    // Unknown campaign role (custom title) → use the title itself as a search term.
    const terms = mapped ?? (/^[a-z][a-z -]{2,40}$/i.test(role) ? [role.includes(" ") ? `"${role}"` : role] : []);
    for (const t of terms) if (!out.includes(t)) out.push(t);
  }
  for (const t of extra) if (!out.includes(t)) out.push(t);
  return out.slice(0, max);
}

/**
 * Practice niches keep the exact query wording that was validated on dental campaigns; other niches get terms
 * derived from the campaign roles plus the niche's own titles.
 */
export function roleVocabulary(niche: string | null | undefined, priority: string[]): RoleVocabulary {
  const profile = nicheProfile(niche);
  const eff = effectivePriority(priority, profile);
  // Campaign roles relevant for this niche (without the literal niche titles added for matching).
  const roles = priority.filter((r) => profile === "practice" || !PRACTICE_ONLY_ROLES.has(fold(r)));
  const teamPageKeywords = [...BASE_TEAM_KEYWORDS, ...PROFILE_TEAM_KEYWORDS[profile]];
  if (profile === "practice") {
    return {
      profile, priority: eff, teamPageKeywords,
      searchRoles: { nl: ["eigenaar", "praktijkhouder", "praktijkeigenaar", "directeur", "praktijkmanager", "vestigingsmanager"], en: ["owner", "founder", "partner", "\"managing director\"", "\"practice manager\"", "\"clinic manager\""] },
      linkedinRoles: { nl: ["praktijkmanager", "eigenaar", "praktijkhouder", "directeur"], en: ["\"practice manager\"", "owner", "director"] },
      siteSearchTerms: ["team", "medewerkers", "praktijk", "over-ons", "organisatie", "management"],
    };
  }
  return {
    profile, priority: eff, teamPageKeywords,
    searchRoles: { nl: termsFor(roles, NL_ROLE_TERMS, NL_PROFILE_TERMS[profile], 8), en: termsFor(roles, EN_ROLE_TERMS, [], 6) },
    linkedinRoles: { nl: termsFor(roles, NL_ROLE_TERMS, [], 4), en: termsFor(roles, EN_ROLE_TERMS, [], 3) },
    siteSearchTerms: ["team", "medewerkers", "over-ons", "\"wie zijn wij\"", "historie", "organisatie", "directie"],
  };
}

/** Vocabulary used when a caller does not pass one: generic (no practice wording), default roles. */
export function defaultVocabulary(priority: string[]): RoleVocabulary {
  return roleVocabulary(null, priority);
}

/**
 * Role list for the review approval gate (which only has the run's stored priority, not its niche): the stored roles
 * plus every niche-specific title the pipeline can select, so a contact selected as "garagehouder" stays approvable.
 * Practice roles are kept as stored (the gate never narrows what the run itself configured).
 */
export function reviewGatePriority(priority: string[]): string[] {
  const out: string[] = [];
  for (const role of priority) {
    out.push(role);
    for (const profile of Object.keys(EXTRA_TITLES) as NicheProfile[]) {
      for (const extra of EXTRA_TITLES[profile][fold(role)] ?? []) if (!out.includes(extra)) out.push(extra);
    }
  }
  return out;
}
