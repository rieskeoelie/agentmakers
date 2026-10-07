/** Pure (client-safe) naming for Owner Discovery runs. */
const COUNTRY_NL: Record<string, string> = { netherlands: "Nederland", belgium: "België", germany: "Duitsland" };
const MONTHS_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "Eigenaarsonderzoek — Nederland — 7 okt" (+ region / industry when given). */
export function autoOwnerRunName(input: { country: string; region?: string | null; industry?: string | null }, now: Date = new Date()): string {
  const country = COUNTRY_NL[input.country.toLowerCase()] ?? input.country;
  const parts = ["Eigenaarsonderzoek", [input.industry, input.region].filter(Boolean).join(" ") || country, `${now.getDate()} ${MONTHS_NL[now.getMonth()]}`];
  return parts.join(" — ").slice(0, 120);
}
