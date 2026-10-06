import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PRIORITY } from "../../src/lib/outreach/config.js";
import { hunterMetadataDecisionMakers, matchRole, rankContacts } from "../../src/lib/outreach/roles.js";

const P = DEFAULT_ROLE_PRIORITY; // owner, founder, managing director, practice owner, practice manager, operations manager

describe("role synonyms (NL + EN)", () => {
  it.each([
    ["Eigenaar", "owner"],
    ["Mede-eigenaar", "owner"],
    ["DGA", "owner"],
    ["Oprichter", "founder"],
    ["Co-founder", "founder"],
    ["Algemeen Directeur", "managing director"],
    ["CEO", "managing director"],
    ["Directeur", "managing director"],
    ["Praktijkhouder", "practice owner"],
    ["Tandarts / Praktijkhouder", "practice owner"],
    ["Praktijkmanager", "practice manager"],
    ["Office Manager", "practice manager"],
    ["Praktijkcoördinator", "practice manager"],
    ["Operationeel manager", "operations manager"],
    ["Head of Operations", "operations manager"],
  ])("%s → %s", (title, role) => {
    expect(matchRole(title, P)?.matched_role).toBe(role);
  });
  it("does not match non-decision roles or negative modifiers", () => {
    for (const t of ["Tandarts", "Tandartsassistente", "Mondhygiënist", "Assistent praktijkmanager", "Stagiair", "Junior office manager", "Receptionist", "", null]) {
      expect(matchRole(t as string, P)).toBeNull();
    }
  });
  it("uses word boundaries (no substring false positives)", () => {
    expect(matchRole("Ceol specialist", P)).toBeNull();
    expect(matchRole("Directeuren-overleg secretaris", P)).toBeNull();
  });
  it("respects campaign-configurable priority order", () => {
    expect(matchRole("Praktijkmanager", ["practice manager", "owner"])?.rank).toBe(0);
    expect(matchRole("Eigenaar", ["practice manager", "owner"])?.rank).toBe(1);
  });
});

describe("decision-maker ranking", () => {
  const contacts = [
    { email: "info@x.nl", type: "generic", position: null, confidence: 99 },
    { email: "lisa@x.nl", type: "personal", position: "Tandartsassistente", seniority: "junior", confidence: 95 },
    { email: "pm@x.nl", type: "personal", position: "Praktijkmanager", seniority: "senior", confidence: 90 },
    { email: "owner@x.nl", type: "personal", position: "Eigenaar", seniority: "executive", confidence: 70 },
  ];
  it("does not select the first returned email blindly; ranks by role priority", () => {
    const r = rankContacts(contacts, P);
    expect(r[0]!.contact.email).toBe("owner@x.nl");
    expect(r.map((x) => x.contact.email)).toEqual(["owner@x.nl", "pm@x.nl"]);
  });
  it("ignores generic and unmatched contacts entirely", () => {
    expect(rankContacts([contacts[0]!, contacts[1]!], P)).toEqual([]);
  });
  it("breaks ties on seniority then confidence", () => {
    const r = rankContacts(
      [
        { email: "a@x.nl", type: "personal", position: "Directeur", seniority: "senior", confidence: 99 },
        { email: "b@x.nl", type: "personal", position: "Directeur", seniority: "executive", confidence: 50 },
      ],
      P,
    );
    expect(r[0]!.contact.email).toBe("b@x.nl");
  });
  it("metadata fallback only picks personal executives", () => {
    const r = hunterMetadataDecisionMakers([
      { email: "g@x.nl", type: "generic", position: null, seniority: "executive", confidence: 90 },
      { email: "e@x.nl", type: "personal", position: "Tandarts", seniority: "executive", confidence: 80 },
      { email: "j@x.nl", type: "personal", position: "Junior tandarts", seniority: "executive", confidence: 99 },
    ]);
    expect(r.map((c) => c.email)).toEqual(["e@x.nl"]);
  });
});
