import { ROLE_SYNONYMS } from "./roles";

/**
 * Person-name validation shared by website and public-search candidate extraction.
 *
 * A role or occupation may DESCRIBE a person ("Kapster", "Eigenaresse", "Topstylist"), but must never itself become
 * the person's name. Search results also contain page titles, section headings, publication names, navigation labels
 * and organisation names next to role words ("Campus Life — … eigenaar van …"); those are not persons either.
 *
 * Deliberately narrow so real (also unusual) names survive:
 *  - occupation words are only rejected in FIRST-NAME position (Dutch occupational SURNAMES such as Bakker, Schilder,
 *    Visser or Smit are common and stay valid);
 *  - heading/organisation words only reject a name when EVERY name token is such a word, or when the name equals a
 *    section of the result URL / the publication's own name.
 */

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Occupations and trade/role titles (Dutch + English), incl. female forms. Lower-case, folded. */
const OCCUPATIONS = [
  // owner / management (beyond ROLE_SYNONYMS)
  "eigenaar", "eigenares", "eigenaresse", "mede-eigenaar", "directeur", "directrice", "bedrijfsleider", "bedrijfsleidster", "oprichter", "oprichtster",
  "ondernemer", "ondernemster", "zaakvoerder", "zaakvoerster", "zaakvoerdster", "manager", "teamleider", "teamleidster", "chef", "leidinggevende",
  "vestigingsmanager", "filiaalmanager", "filiaalhouder", "garagehouder", "praktijkhouder", "praktijkhoudster", "franchisenemer",
  "owner", "founder", "director", "ceo", "dga",
  // hair / beauty
  "kapper", "kapster", "kappers", "barbier", "barber", "stylist", "styliste", "hairstylist", "hairstyliste", "haarstylist", "haarstyliste",
  "kleurspecialist", "kleurspecialiste", "visagist", "visagiste", "schoonheidsspecialist", "schoonheidsspecialiste", "nagelstylist", "nagelstyliste",
  "pedicure", "manicure", "masseur", "masseuse", "beautician", "colorist",
  // trades
  "monteur", "automonteur", "werkplaatschef", "schilder", "loodgieter", "installateur", "elektricien", "hovenier", "tuinman", "timmerman",
  "metselaar", "stukadoor", "dakdekker", "tegelzetter", "aannemer", "klusjesman", "glazenwasser", "schoonmaker", "schoonmaakster",
  // office / services
  "makelaar", "taxateur", "adviseur", "adviseuse", "consulent", "consulente", "accountant", "boekhouder", "administrateur", "jurist", "advocaat",
  "assistent", "assistente", "medewerker", "medewerkster", "verkoper", "verkoopster", "receptionist", "receptioniste", "secretaresse",
  "stagiair", "stagiaire", "leerling", "trainee", "instructeur", "instructrice", "rijinstructeur", "docent", "docente", "coach", "trainer",
  // care
  "tandarts", "mondhygienist", "mondhygieniste", "huisarts", "dierenarts", "fysiotherapeut", "therapeut", "therapeute", "verpleegkundige", "apotheker",
  "opticien", "orthodontist",
  // food / retail / creative
  "kok", "bakker", "slager", "fotograaf", "ontwerper", "ontwerpster", "designer", "developer", "programmeur",
];
const OCCUPATION_SET = new Set(OCCUPATIONS.map(fold));
// Single-word role synonyms already used for decision-maker matching ("eigenaar", "dga", "zaakvoerder", …).
for (const syns of Object.values(ROLE_SYNONYMS)) for (const s of syns) if (!/\s/.test(s)) OCCUPATION_SET.add(fold(s));
/** Compound occupations ("topstylist", "automonteur", "hoofdkapster") end in one of these roots. */
const COMPOUND_ROOTS = [...OCCUPATION_SET].filter((w) => w.length >= 5);

/** Is this single token an occupation / role title (incl. compounds such as "Topstylist")? */
export function isOccupationalWord(token: string): boolean {
  const t = fold(token).replace(/[^a-z-]/g, "");
  if (!t) return false;
  if (OCCUPATION_SET.has(t)) return true;
  return COMPOUND_ROOTS.some((r) => t.length - r.length >= 3 && t.endsWith(r));
}

/** Words of headings, navigation, publications and organisations — never all the tokens of a person's name. */
const NON_PERSON_WORDS = new Set([
  "campus", "life", "news", "nieuws", "blog", "agenda", "home", "menu", "contact", "magazine", "podcast", "podcasts", "archief", "archieven",
  "tag", "tagged", "experts", "pagina", "page", "events", "event", "evenementen", "team", "over", "ons", "about", "service", "services", "diensten",
  "producten", "products", "shop", "webshop", "academy", "studio", "salon", "kapsalon", "hairstyling", "groep", "group", "holding", "stichting",
  "vereniging", "college", "universiteit", "university", "school", "centrum", "center", "centre", "kliniek", "praktijk", "garage", "autobedrijf",
  "welkom", "welcome", "nederland", "spot", "the", "on", "today", "daily", "weekly", "online", "media", "portal", "gids", "directory",
  "vacatures", "jobs", "careers", "reviews", "partners", "klanten", "cases", "portfolio", "story", "stories", "verhalen", "interview", "column",
]);

export type NonPersonReason =
  | "OCCUPATIONAL_TITLE_AS_NAME"
  | "SECTION_HEADING"
  | "PUBLICATION_NAME"
  | "PAGE_OR_ORGANISATION_LABEL";

const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Why a candidate "name" is not a person, or null when it may be one. `context` (optional) is the search result the
 * name came from: a name equal to a section of its URL path or to the publication's own name is a heading/label.
 */
export function nonPersonReason(name: string, context?: { url?: string | null; siteName?: string | null }): NonPersonReason | null {
  const tokens = name.replace(/^(dr|drs|mr|ir|ing|prof|mw|mevr|dhr)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "PAGE_OR_ORGANISATION_LABEL";
  if (isOccupationalWord(tokens[0]!)) return "OCCUPATIONAL_TITLE_AS_NAME";
  const s = slug(name);
  if (context?.url) {
    try {
      const u = new URL(context.url);
      const segs = u.pathname.split("/").filter(Boolean).map((x) => slug(decodeURIComponent(x)));
      // A non-final path segment is a section/category (".../campus-life/load/866"); a final one may be a profile page.
      if (segs.slice(0, -1).includes(s)) return "SECTION_HEADING";
      const label = (u.hostname.replace(/^www\./, "").split(".")[0] ?? "").replace(/[^a-z0-9]/g, "");
      if (label && s.replace(/-/g, "") === label) return "PUBLICATION_NAME";
    } catch { /* not a URL: no context check */ }
  }
  if (context?.siteName && s === slug(context.siteName)) return "PUBLICATION_NAME";
  const words = tokens.map((t) => fold(t).replace(/[^a-z]/g, "")).filter(Boolean);
  if (words.length && words.every((w) => NON_PERSON_WORDS.has(w) || OCCUPATION_SET.has(w))) return "PAGE_OR_ORGANISATION_LABEL";
  return null;
}
