import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "../../src/lib/auth.js";
import {
  hasValidAdminKey, hasValidCronSecret, isCronOrAdminKeyAuthorized, isScrapeQueueAuthorized, secretMatches,
} from "../../src/lib/cronAuth.js";

const CRON = "cron-secret-0123456789abcdef";
const ADMIN = "admin-key-0123456789abcdef";

function req(headers: Record<string, string> = {}, cookie?: string): NextRequest {
  return new NextRequest("https://agentmakers.io/api/cron/x", { headers: { ...headers, ...(cookie ? { cookie } : {}) } });
}

afterEach(() => vi.unstubAllEnvs());

describe("secretMatches", () => {
  it("never authorizes when the secret is missing or empty", () => {
    expect(secretMatches(undefined, undefined)).toBe(false);
    expect(secretMatches(null, undefined)).toBe(false);
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches("anything", undefined)).toBe(false);
    expect(secretMatches("", "  ")).toBe(false);
    expect(secretMatches("  ", "  ")).toBe(false);
  });
  it("needs a supplied value that matches exactly", () => {
    expect(secretMatches(undefined, CRON)).toBe(false);
    expect(secretMatches("", CRON)).toBe(false);
    expect(secretMatches("wrong", CRON)).toBe(false);
    expect(secretMatches(`${CRON}x`, CRON)).toBe(false);
    expect(secretMatches(CRON, CRON)).toBe(true);
  });
});

// The three affected routes share two policies:
//   scrape-queue           → CRON_SECRET bearer OR logged-in session
//   follow-up, weekly-report → CRON_SECRET bearer OR x-admin-key = ADMIN_SECRET_KEY
const policies = [
  { route: "scrape-queue", check: isScrapeQueueAuthorized },
  { route: "follow-up / weekly-report", check: isCronOrAdminKeyAuthorized },
] as const;

describe.each(policies)("$route", ({ check }) => {
  it("1. secret missing + header missing → unauthorized", () => {
    vi.stubEnv("CRON_SECRET", undefined as unknown as string);
    vi.stubEnv("ADMIN_SECRET_KEY", undefined as unknown as string);
    expect(check(req())).toBe(false);
  });
  it("2. secret missing + arbitrary header → unauthorized", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("ADMIN_SECRET_KEY", "");
    expect(check(req({ authorization: "Bearer " }))).toBe(false);
    expect(check(req({ authorization: "Bearer anything" }))).toBe(false);
    expect(check(req({ authorization: "anything", "x-admin-key": "anything" }))).toBe(false);
    expect(check(req({ "x-admin-key": "" }))).toBe(false);
  });
  it("3. configured secret + missing header → unauthorized", () => {
    vi.stubEnv("CRON_SECRET", CRON);
    vi.stubEnv("ADMIN_SECRET_KEY", ADMIN);
    expect(check(req())).toBe(false);
  });
  it("4. configured secret + wrong value → unauthorized", () => {
    vi.stubEnv("CRON_SECRET", CRON);
    vi.stubEnv("ADMIN_SECRET_KEY", ADMIN);
    expect(check(req({ authorization: "Bearer wrong" }))).toBe(false);
    expect(check(req({ authorization: `Bearer ${ADMIN}` }))).toBe(false);
    expect(check(req({ "x-admin-key": CRON }))).toBe(false);
  });
  it("5. configured CRON_SECRET + correct bearer → authorized", () => {
    vi.stubEnv("CRON_SECRET", CRON);
    expect(check(req({ authorization: `Bearer ${CRON}` }))).toBe(true);
  });
});

describe("6. existing legitimate authorization paths are preserved", () => {
  it("scrape-queue: a valid logged-in session still works (admin dashboard), even without CRON_SECRET", () => {
    vi.stubEnv("SESSION_SECRET", "session-secret-for-tests-0123456789");
    vi.stubEnv("CRON_SECRET", undefined as unknown as string);
    const token = createSession({ userId: "u1", username: "partner", displayName: "P", isAdmin: false, isSuperAdmin: false });
    expect(isScrapeQueueAuthorized(req({}, `${SESSION_COOKIE}=${token}`))).toBe(true);
    expect(isScrapeQueueAuthorized(req({}, `${SESSION_COOKIE}=forged.token`))).toBe(false);
  });
  it("follow-up / weekly-report: a correct x-admin-key still works; a session alone does not (unchanged)", () => {
    vi.stubEnv("ADMIN_SECRET_KEY", ADMIN);
    vi.stubEnv("CRON_SECRET", undefined as unknown as string);
    vi.stubEnv("SESSION_SECRET", "session-secret-for-tests-0123456789");
    expect(isCronOrAdminKeyAuthorized(req({ "x-admin-key": ADMIN }))).toBe(true);
    expect(hasValidAdminKey(req({ "x-admin-key": ADMIN }))).toBe(true);
    const token = createSession({ userId: "u1", username: "richard", displayName: "R", isAdmin: true, isSuperAdmin: true });
    expect(isCronOrAdminKeyAuthorized(req({}, `${SESSION_COOKIE}=${token}`))).toBe(false);
  });
  it("Vercel Cron header format keeps working", () => {
    vi.stubEnv("CRON_SECRET", CRON);
    expect(hasValidCronSecret(req({ authorization: `Bearer ${CRON}` }))).toBe(true);
  });
});

describe("routes use the hardened helper (no raw secret comparisons left)", () => {
  const root = join(import.meta.dirname, "..", "..", "src", "app", "api", "cron");
  it.each([
    ["scrape-queue", "isScrapeQueueAuthorized"],
    ["follow-up", "isCronOrAdminKeyAuthorized"],
    ["weekly-report", "isCronOrAdminKeyAuthorized"],
  ])("%s", (route, helper) => {
    const src = readFileSync(join(root, route, "route.ts"), "utf8");
    expect(src).toContain(`return ${helper}(req)`);
    expect(src).not.toMatch(/===\s*process\.env\.(CRON_SECRET|ADMIN_SECRET_KEY)/);
    expect(src).not.toMatch(/process\.env\.(CRON_SECRET|ADMIN_SECRET_KEY)/);
  });
});
