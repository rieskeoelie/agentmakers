/**
 * Deterministic company-name normalisation for association matching.
 *
 * "Octant Mondzorg Hoorn: Tandarts & Orthodontie"   → alias "Octant Mondzorg" (brand: octant)
 * "Tandheelkundig Centrum Van Dedem B.V."            → aliases "Tandheelkundig Centrum Van Dedem", "Van Dedem"
 * "Tandartspraktijk Hoorn" / "Mondzorg Hoorn"        → no name alias (generic) → only the company DOMAIN can associate
 *
 * Removed: text after ":" / " | " / " - " (service taglines), legal suffixes (B.V., BV, N.V., VOF, maatschap, i.o.),
 * the company's own city ("… Hoorn", "… te Hoorn"). Generic descriptors (tandarts, mondzorg, dental clinic …) never
 * count as distinctive. A single-token brand on its own is NOT used as an alias (too ambiguous).
 */

export const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

const GENERIC = new Set([
  "tandarts", "tandartsen", "tandartspraktijk", "tandartspraktijken", "tandheelkunde", "tandheelkundig", "tandheelkundige", "centrum", "center", "centre",
  "praktijk", "mondzorg", "mondzorgpraktijk", "mondzorgcentrum", "mondhygiene", "mondhygienist", "dental", "dentist", "dentistry", "clinic", "clinics",
  "kliniek", "practice", "orthodontie", "orthodontist", "orthodontics", "implantologie", "parodontologie", "kindertandarts", "spoedtandarts",
  "zorg", "groep", "group", "care", "specialistische", "tandartsspoedpraktijk",
]);
const STOP = new Set(["van", "de", "der", "den", "het", "en", "&", "voor", "the", "and", "of", "te", "in", "'t", "t"]);
const LEGAL = /^(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|vof|maatschap|i\.?o\.?|bv|nv|holding)$/i;
/** Tokens that may legitimately follow/precede an alias without making the match ambiguous. */
const NEUTRAL = new Set(["linkedin", "nl", "nederland", "netherlands", "bv", "b.v.", "vof", "maatschap", "praktijk", "team", "home", "contact", "over", "ons"]);

export interface CompanyAliases {
  /** Alias phrases (folded, single-spaced). Empty → generic name: domain-only association. */
  aliases: string[];
  /** Distinctive (brand) tokens, folded. */
  brand: string[];
  /** Folded city tokens (used to accept "<alias> <city>"). */
  cityTokens: string[];
  /**
   * Compact brand: the whitespace-free company name, ONLY when it equals the company's own domain label
   * ("Mondzorg Hoorn" + mondzorghoorn.nl → "mondzorghoorn"). Lets an otherwise generic name associate via its
   * written-together brand form ("MondzorgHoorn") without accepting the generic spaced form.
   */
  compact: string | null;
}

const words = (s: string) => fold(s).replace(/[^a-z0-9&']+/g, " ").trim().split(/\s+/).filter(Boolean);

export function companyAliases(name: string, city: string | null, domain: string | null = null): CompanyAliases {
  const core = name.split(/\s*[:|]\s+|\s+[–—-]\s+/)[0] ?? name;
  let toks = core.trim().split(/\s+/).filter(Boolean);
  toks = toks.filter((t) => !LEGAL.test(t.replace(/,$/, "")));
  const cityTokens = city ? words(city) : [];
  // strip trailing "<city>" / "te <city>" / "in <city>"
  const f = toks.map((t) => fold(t).replace(/[^a-z0-9&']/g, ""));
  if (cityTokens.length && f.length > cityTokens.length) {
    const tail = f.slice(-cityTokens.length).join(" ");
    if (tail === cityTokens.join(" ")) {
      toks = toks.slice(0, -cityTokens.length);
      if (toks.length && /^(te|in)$/i.test(toks[toks.length - 1]!)) toks.pop();
    }
  }
  const full = words(toks.join(" "));
  const label = domain ? (fold(domain).replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0] ?? "").replace(/[^a-z0-9]/g, "") : "";
  const compactName = words(core).filter((t) => !LEGAL.test(t)).join("").replace(/[^a-z0-9]/g, "");
  const compact = label && label.length >= 6 && compactName === label ? compactName : null;
  const brand = full.filter((t) => !GENERIC.has(t) && !STOP.has(t) && !cityTokens.includes(t) && t.length >= 2);
  if (!brand.length) return { aliases: [], brand: [], cityTokens, compact };
  const aliases = [full.join(" ")];
  // Variant without leading generic descriptors, only when ≥2 tokens remain ("Van Dedem", not "Octant").
  let i = 0;
  while (i < full.length && GENERIC.has(full[i]!)) i++;
  const stripped = full.slice(i);
  if (i > 0 && stripped.length >= 2) aliases.push(stripped.join(" "));
  return { aliases: [...new Set(aliases)], brand, cityTokens, compact };
}

/**
 * Aliases that are distinctive enough to associate an OFF-DOMAIN search result by name alone.
 * Short / generic / non-distinctive names ("De Hofstee", "De Praktijk", "Mondzorg", "Dental Clinic") never qualify:
 *  - the alias must have ≥2 meaningful (non-stopword) tokens, AND
 *  - at least one brand token must appear in the company's OWN domain label (name ↔ domain consistency).
 * Live false positive this prevents: company "De Hofstee" (kindertandarts.com) matched "Stichting De Hofstee"
 * (stichtingdehofstee.nl) — brand "hofstee" is not in the company domain, and "de hofstee" has one meaningful token.
 * Names that fail this need domain evidence (exact-domain result / domain reference) or the compact brand
 * (= domain label, e.g. "MondzorgHoorn" ↔ mondzorghoorn.nl).
 */
export function strongNameAliases(ca: CompanyAliases, domain: string | null): string[] {
  if (!domain) return [];
  const label = fold(domain).replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0]!.replace(/[^a-z0-9]/g, "");
  const brandInDomain = ca.brand.some((b) => b.length >= 3 && label.includes(b.replace(/[^a-z0-9]/g, "")));
  if (!brandInDomain) return [];
  return ca.aliases.filter((a) => a.split(" ").filter((t) => !STOP.has(t)).length >= 2);
}

export interface AliasMatch {
  matched: boolean;
  alias?: string;
  /** Alias found but surrounded by another capitalised name/place (e.g. "Octant Mondzorg Purmerend", "Nova Octant Mondzorg"). */
  ambiguous?: string;
}

/** Word-bounded alias search inside separator-delimited segments, with an ambiguity guard. */
export function matchCompanyAlias(text: string, ca: CompanyAliases): AliasMatch {
  if (!ca.aliases.length && !ca.compact) return { matched: false };
  let ambiguous: string | undefined;
  for (const seg of text.split(/\s+[-–—|·•]\s+|[,:;()/]|\.\s+|\s+@\s+/)) {
    const orig = seg.trim().split(/\s+/).filter(Boolean);
    const f = orig.map((w) => fold(w).replace(/[^a-z0-9&']/g, ""));
    for (const alias of ca.compact ? [...ca.aliases, ca.compact] : ca.aliases) {
      const a = alias.split(" ");
      for (let i = 0; i + a.length <= f.length; i++) {
        if (!a.every((t, k) => f[i + k] === t)) continue;
        const neighbourBad = (idx: number) => {
          const w = orig[idx];
          const fw = f[idx];
          if (!w || !fw) return false;
          if (GENERIC.has(fw) || STOP.has(fw) || NEUTRAL.has(fw) || ca.cityTokens.includes(fw)) return false;
          return /^[A-ZÀ-Ý]/.test(w); // another capitalised name/place glued to the alias
        };
        if (neighbourBad(i + a.length) || neighbourBad(i - 1)) {
          ambiguous = seg.trim().slice(0, 80);
          continue;
        }
        return { matched: true, alias };
      }
    }
  }
  return ambiguous ? { matched: false, ambiguous } : { matched: false };
}
