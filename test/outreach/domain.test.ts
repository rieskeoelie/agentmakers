import { describe, expect, it } from "vitest";
import { dedupe, dedupeKey, isNonCompanyDomain, normalizeHost, rootDomain } from "../../src/lib/outreach/domain.js";

describe("domain normalization", () => {
  it("lowercases and strips protocol, www, port, path, query, trailing dot", () => {
    expect(normalizeHost("HTTPS://WWW.Tandarts-DeWit.nl/contact?x=1")).toBe("tandarts-dewit.nl");
    expect(normalizeHost("http://www.example.nl:8080/a/b/")).toBe("example.nl");
    expect(normalizeHost("example.nl.")).toBe("example.nl");
    expect(normalizeHost("www2.example.nl")).toBe("example.nl");
    expect(normalizeHost("example.nl/")).toBe("example.nl");
  });
  it("converts IDN to punycode", () => {
    expect(normalizeHost("https://www.münchen.de/")).toBe("xn--mnchen-3ya.de");
    expect(normalizeHost("XN--MNCHEN-3YA.DE")).toBe("xn--mnchen-3ya.de");
    expect(rootDomain("praxis.münchen.de")).toBe("xn--mnchen-3ya.de");
  });
  it("rejects non-hostnames and IPs", () => {
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost("localhost")).toBeNull();
    expect(normalizeHost("http://192.168.1.1/")).toBeNull();
    expect(normalizeHost("not a url ::")).toBeNull();
  });
  it("computes registrable root domain incl. multi-part suffixes", () => {
    expect(rootDomain("https://afspraak.tandarts.nl/x")).toBe("tandarts.nl");
    expect(rootDomain("shop.example.co.uk")).toBe("example.co.uk");
    expect(rootDomain("example.nl")).toBe("example.nl");
  });
  it("flags directory/social domains", () => {
    expect(isNonCompanyDomain("facebook.com")).toBe(true);
    expect(isNonCompanyDomain("m.facebook.com")).toBe(true);
    expect(isNonCompanyDomain("zorgkaartnederland.nl")).toBe(true);
    expect(isNonCompanyDomain("tandarts-dewit.nl")).toBe(false);
    expect(isNonCompanyDomain("notfacebook.com")).toBe(false);
  });
});

describe("dedupe", () => {
  it("dedupes by normalized root domain across locations and URL variants", () => {
    const items = [
      { company_name: "Mondzorg Hoorn", domain: "mondzorg-hoorn.nl", city: "Hoorn" },
      { company_name: "Mondzorg Hoorn – Zwaag", domain: "https://WWW.mondzorg-hoorn.nl/zwaag", city: "Zwaag" },
      { company_name: "Mondzorg Hoorn Afspraken", domain: "afspraak.mondzorg-hoorn.nl", city: "Hoorn" },
      { company_name: "Andere Praktijk", domain: "andere.nl", city: "Hoorn" },
    ];
    const { kept, duplicates } = dedupe(items);
    expect(kept.map((k) => k.company_name)).toEqual(["Mondzorg Hoorn", "Andere Praktijk"]);
    expect(duplicates).toHaveLength(2);
  });
  it("falls back to normalized name + city when there is no domain", () => {
    expect(dedupeKey({ company_name: "Tandartspraktijk Smit B.V.", domain: null, city: "Hoorn" })).toBe(
      dedupeKey({ company_name: "tandartspraktijk  SMIT", domain: null, city: "hoorn" }),
    );
    const { kept } = dedupe([
      { company_name: "Smit", domain: null, city: "Hoorn" },
      { company_name: "Smit", domain: null, city: "Enkhuizen" },
    ]);
    expect(kept).toHaveLength(2);
  });
});
