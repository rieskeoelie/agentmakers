import type { PublicSearchProvider, SearchResult } from "../../../src/lib/outreach/providers/dataforseo.js";
import type { FinderResult, HunterContact } from "../../../src/lib/outreach/providers/hunter.js";
import { company, hc } from "./fakes.js";

/**
 * Production-equivalent fixture of the live Owner Discovery validation run 05d0dd88 (7 Oct 2026, "kapsalon Enschede").
 * Companies, Hunter results, Email Finder results and public-search titles/snippets/URLs are taken from that run's
 * stored records; website pages are reduced to the lines the extractors used.
 */
export const PROD = {
  listings: [
    company({ company_name: "Way 4 Hair", domain: "way4hair.nl", category: "Kapper", city: "Enschede", address: "Het Bijvank 89, 7544 DA Enschede", review_count: 96 }),
    company({ company_name: "Ruthless kappers professional hair studio ✂", domain: "ruthlesskappers.nl", category: "Kapper", city: "Enschede", review_count: 120 }),
    company({ company_name: "Nanouck Professional Hairstyling", domain: "nanouck.nl", category: "Kapper", city: "Enschede", review_count: 60 }),
    company({ company_name: "Kapsalon Es&co", domain: "kapsalonesenco.nl", category: "Kapsalon", city: "Enschede", review_count: 40 }),
    company({ company_name: "Kapsalon De Barreboks", domain: "kapsalondebarreboks.nl", category: "Kapsalon", city: "Enschede", review_count: 30 }),
    // Third-party directory pages listed as the "website" of unrelated salons (live: classified as chain — wrong).
    company({ company_name: "FA YI Hair salon", domain: "nlcompanies.org", category: "Kapper", city: "Enschede" }),
    company({ company_name: "Salon Lotus Enschede", domain: "nlcompanies.org", category: "Kapper", city: "Enschede" }),
    company({ company_name: "Hair & Beauty By Nawal - Enschede", domain: "ivof.com", category: "Kapper", city: "Enschede" }),
    company({ company_name: "Kapper Zuid Enschede", domain: "ivof.com", category: "Kapper", city: "Enschede" }),
    // An unknown listing site shared by unrelated businesses (generic rule, not a list entry).
    company({ company_name: "Kapsalon Mira", domain: "allesalonsoost.nl", category: "Kapper", city: "Enschede" }),
    company({ company_name: "Barbershop Noor", domain: "allesalonsoost.nl", category: "Kapper", city: "Enschede" }),
  ],
  site: {
    "way4hair.nl/": `<html><head><title>Way 4 Hair</title></head><body><h1>Way 4 Hair</h1><p>Kapsalon en hair academy in Enschede.</p><a href="/contact/">Contact</a></body></html>`,
    "way4hair.nl/contact/": `<html><body><h2>Contact</h2><p>Way 4 Hair, Het Bijvank 89, Enschede. info@way4hair.nl</p></body></html>`,
    "ruthlesskappers.nl/": `<html><head><title>Ruthless kappers</title></head><body><h1>Ruthless kappers professional hair studio</h1><div><h3>Aram Darwish</h3><p>Eigenaresse / Topstylist</p></div><p>salon@ruthlesskappers.nl</p></body></html>`,
    "nanouck.nl/": `<html><head><title>Nanouck Professional Hairstyling</title></head><body><h1>Nanouck Professional Hairstyling</h1><p>Haarverzorging in Enschede. info@nanouck.nl</p></body></html>`,
    "kapsalonesenco.nl/": `<html><head><title>Kapsalon Es&amp;co</title></head><body><h1>Kapsalon Es&amp;co</h1><a href="/over-ons/">Over ons</a></body></html>`,
    "kapsalonesenco.nl/over-ons/": `<html><body><h2>Over ons</h2><div><h3>Kapster</h3><p>Eigenaresse</p></div><p>Kapsalon Es&amp;co is sinds 2009 een begrip in Enschede.</p></body></html>`,
    "kapsalondebarreboks.nl/": `<html><head><title>Kapsalon De Barreboks</title></head><body><h1>Kapsalon De Barreboks</h1><p>Knippen zonder afspraak. info@kapsalondebarreboks.nl</p></body></html>`,
  } as Record<string, string>,
  hunter: {
    "way4hair.nl": [hc("info@way4hair.nl", { type: "generic" })],
    "ruthlesskappers.nl": [hc("info@ruthlesskappers.nl", { type: "generic" }), hc("salon@ruthlesskappers.nl", { type: "generic" })],
    "nanouck.nl": [hc("info@nanouck.nl", { type: "generic" })],
    "kapsalondebarreboks.nl": [hc("info@kapsalondebarreboks.nl", { type: "generic" })],
  } as Record<string, HunterContact[]>,
  /** Live Email Finder: an address only for Aram Darwish (score 98); none for Nathalie Nieveld. */
  finder: (d: string, f: string, l: string): FinderResult | null =>
    d === "ruthlesskappers.nl" && f === "Aram" && l === "Darwish"
      ? { email: "aram@ruthlesskappers.nl", score: 98, position: null, linkedin: null, verification_status: "valid", accept_all: false }
      : null,
  /** Live public-search results (title, URL, snippet) per company. */
  search: {
    "Way 4 Hair": [
      { title: "Nathalie Nieveld - eigenaar bij Way 4 Hair | LinkedIn", url: "https://nl.linkedin.com/in/nathalie-nieveld-a22949105", domain: "nl.linkedin.com",
        snippet: "Nathalie Nieveld. eigenaar bij Way 4 Hair. Way 4 Hair hair academy. Enschede, Overijssel, Nederland. 108 volgers 106 connecties." },
    ],
    "Nanouck": [
      { title: "Bijdrage van Nanouck liefers", url: "https://www.example-forum.nl/bijdrage/1", domain: "www.example-forum.nl", snippet: "Mooie kapsalon in Enschede." },
      { title: "Haarverzorging in Enschede", url: "https://nanouck.nl/", domain: "nanouck.nl", snippet: "Nanouck Professional Hairstyling, Enschede." },
      { title: "Archieven: Podcasts - Cor Spronk, DGA mentor", url: "https://www.example-podcast.nl/podcasts/", domain: "www.example-podcast.nl", snippet: "Cor Spronk, DGA mentor." },
    ],
    "Barreboks": [
      { title: "Campus Life", url: "https://www.utoday.nl/campus-life/load/866", domain: "www.utoday.nl",
        snippet: "Aan het woord is Ine van Puffelen (53), eigenaar van kapsalon de Barreboks. Campus Life. 17 / 11 / 2017. Professors. Patricia Reyes – Patyt on social media..." },
      { title: "Tagged: De Barreboks - Enschede", url: "https://www.utoday.nl/tag/De%20Barreboks", domain: "www.utoday.nl", snippet: "Kapsalon De Barreboks in Enschede." },
    ],
  } as Record<string, SearchResult[]>,
};

/** Public search fake: answers by the company named in the query; records every query. */
export function prodSearch() {
  const queries: string[] = [];
  const provider: PublicSearchProvider = {
    search: async (q) => {
      queries.push(q);
      const key = Object.keys(PROD.search).find((k) => q.includes(k));
      return key ? PROD.search[key]! : [];
    },
  };
  return { provider, queries };
}
