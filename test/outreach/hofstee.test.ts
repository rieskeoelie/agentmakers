import { describe, expect, it } from "vitest";
import { companyAliases, strongNameAliases } from "../../src/lib/outreach/companyName.js";
import { DEFAULT_ROLE_PRIORITY } from "../../src/lib/outreach/config.js";
import type { SearchResult } from "../../src/lib/outreach/providers/dataforseo.js";
import { evaluateResult } from "../../src/lib/outreach/publicSearch.js";

const P = DEFAULT_ROLE_PRIORITY;

describe("FINAL PHASE 0 SAFETY: non-distinctive company names need strong company identity evidence", () => {
  const HOFSTEE = { name: "De Hofstee", domain: "kindertandarts.com", city: "Hoorn" };
  // Exact live result that was wrongly accepted (stichtingdehofstee.nl).
  const STICHTING: SearchResult = {
    title: "Nieuws | De Hofstee",
    url: "https://stichtingdehofstee.nl/nieuws/page/3/?et_blog",
    domain: "stichtingdehofstee.nl",
    snippet: "Stichting De Hofstee is een ouderinitiatief, wij... De Hofstee!... Bel 0181-698525 (Arie Korengevel, directeur) of laat je gegevens achter via het onderstaande...",
  };

  it("A. De Hofstee (kindertandarts.com) vs Stichting De Hofstee / Arie Korengevel, directeur → REJECT", () => {
    const r = evaluateResult(STICHTING, HOFSTEE, P);
    expect(r.candidate).toBeNull();
    expect(r.reason).toBe("NON_DISTINCTIVE_COMPANY_NAME_DOMAIN_REQUIRED");
    expect(r.name).toBe("Arie Korengevel");
    expect(strongNameAliases(companyAliases("De Hofstee", "Hoorn", "kindertandarts.com"), "kindertandarts.com")).toEqual([]);
  });

  it("B. Mondzorg Hoorn (mondzorghoorn.nl) vs 'Praktijk manager MondzorgHoorn' / Marianda Tensen → ACCEPT", () => {
    const r = evaluateResult(
      { title: "Marianda Tensen - Praktijk manager MondzorgHoorn | LinkedIn", url: "https://nl.linkedin.com/in/marianda-tensen-a6b00133", domain: "nl.linkedin.com", snippet: "" },
      { name: "Mondzorg Hoorn", domain: "mondzorghoorn.nl", city: "Hoorn" },
      P,
    );
    expect(r.candidate).toMatchObject({ full_name: "Marianda Tensen", title: "Praktijk manager MondzorgHoorn" });
    expect(r.candidate!.role_match.matched_role).toBe("practice manager");
  });

  it.each([
    ["De Hofstee", "kindertandarts.com", "Directeur van De Hofstee", "Jan Jansen, directeur"],
    ["De Praktijk", "tandartsjansen.nl", "Team | De Praktijk", "Jan Jansen, praktijkhouder van De Praktijk"],
    ["Dental Clinic", "dentalclinic-hoorn.nl", "Dental Clinic Amsterdam - team", "Jan Jansen, praktijkmanager"],
    ["Tandartspraktijk", "tphoorn.nl", "Tandartspraktijk | Over ons", "Jan Jansen, eigenaar"],
    ["Mondzorg", "mondzorg-x.nl", "Mondzorg - ons team", "Jan Jansen, eigenaar"],
    ["Centrum", "centrum-tandarts.nl", "Centrum - directie", "Jan Jansen, directeur"],
  ])("C. same/generic-name unrelated organisation on another domain → REJECT (%s / %s)", (name, domain, title, snippet) => {
    const r = evaluateResult({ title, url: "https://andere-organisatie.nl/team", domain: "andere-organisatie.nl", snippet }, { name, domain, city: "Hoorn" }, P);
    expect(r.candidate).toBeNull();
  });

  it("C. also on LinkedIn: a generic name in the headline alone is never enough", () => {
    const r = evaluateResult({ title: "Arie Korengevel - Directeur - De Hofstee | LinkedIn", url: "https://nl.linkedin.com/in/arie", domain: "nl.linkedin.com", snippet: "Directeur bij De Hofstee" }, HOFSTEE, P);
    expect(r.candidate).toBeNull();
  });

  it("D. exact company-domain result → may accept when person/role rules pass", () => {
    const r = evaluateResult({ title: "Ons team | De Hofstee", url: "https://www.kindertandarts.com/team/", domain: "www.kindertandarts.com", snippet: "Jan Jansen, praktijkhouder." }, HOFSTEE, P);
    expect(r.candidate).toMatchObject({ full_name: "Jan Jansen", association: "company_domain_result" });
    // …but not when the person/role rules fail
    expect(evaluateResult({ title: "Ons team | De Hofstee", url: "https://www.kindertandarts.com/team/", domain: "www.kindertandarts.com", snippet: "Jan Jansen, tandarts." }, HOFSTEE, P).candidate).toBeNull();
  });

  it("3. a company-domain reference in the result metadata is strong evidence for a non-distinctive name", () => {
    const r = evaluateResult({ title: "Arie Korengevel - Directeur - De Hofstee | LinkedIn", url: "https://nl.linkedin.com/in/arie", domain: "nl.linkedin.com", snippet: "Directeur · kindertandarts.com" }, HOFSTEE, P);
    expect(r.candidate).toMatchObject({ association: "company_domain_in_text" });
  });

  it("distinctive, domain-consistent names still associate by name (no regression: Octant / Van Dedem)", () => {
    const octant = evaluateResult(
      { title: "Peter W. Balfoort - Octant Mondzorg | LinkedIn", url: "https://nl.linkedin.com/in/peter-w-balfoort-81178529", domain: "nl.linkedin.com", snippet: "Dentist co-owner · Octant Mondzorg" },
      { name: "Octant Mondzorg Hoorn: Tandarts & Orthodontie", domain: "octantmondzorg.nl", city: "Hoorn" },
      P,
    );
    expect(octant.candidate).toMatchObject({ full_name: "Peter W. Balfoort", association: "company_name_in_title" });
    const ca = companyAliases("Tandheelkundig Centrum Van Dedem", "Hoorn", "thcvandedem.nl");
    expect(strongNameAliases(ca, "thcvandedem.nl")).toEqual(["tandheelkundig centrum van dedem"]); // "van dedem" alone is too short
  });
});
