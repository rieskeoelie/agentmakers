import { describe, expect, it } from "vitest";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { shouldVerify } from "../../src/lib/outreach/eligibility.js";
import { HunterClient, parseDomainSearch, parseFinder, parseVerifier } from "../../src/lib/outreach/providers/hunter.js";
import { mockFetch } from "./helpers.js";

const dsBody = (emails: unknown[], accept_all = false) => ({ data: { domain: "x.nl", accept_all, pattern: "{first}", organization: "X", emails }, meta: { results: emails.length } });
const email = (value: string, status: string | null, extra: Record<string, unknown> = {}) => ({
  value, type: "personal", confidence: 90, first_name: "Jan", last_name: "Jansen", position: "Eigenaar", seniority: "executive", department: "executive",
  linkedin: null, verification: { date: status ? "2026-09-01" : null, status }, ...extra,
});

describe("Hunter response handling", () => {
  it("parses Domain Search contacts with role metadata and verification", () => {
    const r = parseDomainSearch(dsBody([email("Jan@X.nl", "valid"), { value: "info@x.nl", type: "generic", confidence: 95, verification: null }]), "x.nl");
    expect(r.contacts[0]).toMatchObject({ email: "jan@x.nl", type: "personal", position: "Eigenaar", seniority: "executive", verification_status: "valid" });
    expect(r.contacts[1]).toMatchObject({ email: "info@x.nl", type: "generic", verification_status: "not_verified" });
  });
  it("downgrades 'valid' to accept_all when the domain is accept-all", () => {
    const r = parseDomainSearch(dsBody([email("jan@x.nl", "valid")], true), "x.nl");
    expect(r.accept_all).toBe(true);
    expect(r.contacts[0]!.verification_status).toBe("accept_all");
  });
  it("skips malformed email entries instead of crashing", () => {
    const r = parseDomainSearch(dsBody([{ nope: 1 }, email("jan@x.nl", "valid")]), "x.nl");
    expect(r.contacts).toHaveLength(1);
  });
  it("rejects a response without data (shape error surfaces)", () => {
    expect(() => parseDomainSearch({ errors: [] }, "x.nl")).toThrow();
  });
});

describe("Email Finder verification handling", () => {
  it.each([
    ["valid", false, "valid"],
    ["accept_all", false, "accept_all"],
    ["unknown", false, "unknown"],
    ["valid", true, "accept_all"],
    [null, false, "not_verified"],
  ])("verification %s (accept_all=%s) → %s", (status, acceptAll, expected) => {
    const f = parseFinder({ data: { email: "jan@x.nl", score: 88, accept_all: acceptAll, verification: { date: "2026-09-01", status } } });
    expect(f.verification_status).toBe(expected);
  });
  it("no email → not_verified, null email", () => {
    expect(parseFinder({ data: { email: null, score: null } })).toMatchObject({ email: null, verification_status: "not_verified" });
  });
  it("never triggers a second paid verification after Email Finder returned a result", () => {
    for (const s of ["valid", "accept_all", "unknown"] as const) expect(shouldVerify("jan@x.nl", s, "hunter_email_finder", "x.nl")).toBe(false);
  });
  it("verifies only when it can change eligibility", () => {
    expect(shouldVerify("jan@x.nl", "not_verified", "hunter_domain_search", "x.nl")).toBe(true);
    expect(shouldVerify("jan@x.nl", "unknown", "hunter_domain_search", "x.nl")).toBe(true);
    expect(shouldVerify("jan@x.nl", "valid", "hunter_domain_search", "x.nl")).toBe(false);
    expect(shouldVerify("jan@x.nl", "accept_all", "hunter_domain_search", "x.nl")).toBe(false);
    expect(shouldVerify("info@x.nl", "not_verified", "hunter_domain_search", "x.nl")).toBe(false); // generic stays review-only anyway
    expect(shouldVerify("jan@gmail.com", "not_verified", "hunter_domain_search", "x.nl")).toBe(false);
    expect(shouldVerify("jan@other.nl", "not_verified", "hunter_domain_search", "x.nl")).toBe(false);
  });
  it("parses verifier statuses", () => {
    expect(parseVerifier({ data: { status: "invalid", result: "undeliverable" } })).toBe("invalid");
    expect(parseVerifier({ data: { status: "accept_all" } })).toBe("accept_all");
    expect(parseVerifier({ data: { status: "disposable" } })).toBe("disposable");
  });
});

describe("HunterClient (mocked transport — no credits)", () => {
  const client = (handler: Parameters<typeof mockFetch>[0], budget = 10) => {
    const m = mockFetch(handler);
    const cost = new CostTracker("t", budget);
    return { c: new HunterClient("k", cost, 0.1, m.fetch, 1), cost, calls: m.calls };
  };

  it("sends key as header (never in the URL) and charges 1 credit only when emails are returned", async () => {
    const { c, cost, calls } = client(() => [200, dsBody([email("jan@x.nl", "valid")])]);
    await c.domainSearch("x.nl", "x.nl");
    expect(calls[0]!.url).not.toContain("api_key");
    expect((calls[0]!.init.headers as Record<string, string>)["X-API-KEY"]).toBe("k");
    expect(cost.spentEur).toBeCloseTo(0.1);
    const empty = client(() => [200, dsBody([])]);
    await empty.c.domainSearch("x.nl", "x.nl");
    expect(empty.cost.spentEur).toBe(0);
  });
  it("Email Finder 404 / 451 → null, no credit", async () => {
    for (const status of [404, 451]) {
      const { c, cost } = client(() => [status, { errors: [{ id: "x" }] }]);
      expect(await c.emailFinder("x.nl", "Jan", "Jansen", "x.nl")).toBeNull();
      expect(cost.spentEur).toBe(0);
    }
  });
  it("Verifier 202 is retried a bounded number of times, then reported unknown", async () => {
    const { c, calls } = client(() => [202, { data: {} }]);
    expect(await c.verify("jan@x.nl", "x.nl")).toBe("unknown");
    expect(calls.length).toBe(3); // 1 + maxRetries(2)
  });
  it("Verifier 222 → unknown; 200 → parsed", async () => {
    expect(await client(() => [222, {}]).c.verify("jan@x.nl", "x.nl")).toBe("unknown");
    expect(await client(() => [200, { data: { status: "valid" } }]).c.verify("jan@x.nl", "x.nl")).toBe("valid");
  });
  it("429 is retried with a cap, then the error surfaces (no infinite retry)", async () => {
    const { c, calls } = client(() => [429, { errors: [{ id: "too_many_requests" }] }]);
    await expect(c.domainSearch("x.nl", "x.nl")).rejects.toThrow(/429/);
    expect(calls.length).toBe(3);
  });
  it("401 surfaces immediately without retry", async () => {
    const { c, calls } = client(() => [401, { errors: [{ id: "authentication_failed" }] }]);
    await expect(c.domainSearch("x.nl", "x.nl")).rejects.toThrow(/401/);
    expect(calls.length).toBe(1);
  });
  it("budget guard blocks the call before any request is made", async () => {
    const { c, calls, cost } = client(() => [200, dsBody([])], 0.05);
    await expect(c.domainSearch("x.nl", "x.nl")).rejects.toThrow(/budget/i);
    expect(calls.length).toBe(0);
    expect(cost.calls[0]!.result).toBe("blocked_by_budget");
  });
});
