import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "../../src/lib/auth.js";
import { hasValidInternalSecret } from "../../src/lib/cronAuth.js";

const KEY = "admin-key-0123456789abcdef";
const req = (headers: Record<string, string> = {}) => new NextRequest("https://agentmakers.io/api/scrape", { method: "POST", headers });

afterEach(() => vi.unstubAllEnvs());

describe("/api/scrape internal secret (x-internal-secret = ADMIN_SECRET_KEY)", () => {
  it("1. missing secret + missing header → unauthorized", () => {
    vi.stubEnv("ADMIN_SECRET_KEY", undefined as unknown as string);
    expect(hasValidInternalSecret(req())).toBe(false);
  });
  it("2. missing secret + arbitrary header → unauthorized", () => {
    vi.stubEnv("ADMIN_SECRET_KEY", "");
    expect(hasValidInternalSecret(req({ "x-internal-secret": "anything" }))).toBe(false);
    expect(hasValidInternalSecret(req({ "x-internal-secret": "" }))).toBe(false);
    vi.stubEnv("ADMIN_SECRET_KEY", undefined as unknown as string);
    expect(hasValidInternalSecret(req({ "x-internal-secret": "undefined" }))).toBe(false);
  });
  it("3. configured secret + missing header → unauthorized", () => {
    vi.stubEnv("ADMIN_SECRET_KEY", KEY);
    expect(hasValidInternalSecret(req())).toBe(false);
  });
  it("4. configured secret + wrong header → unauthorized", () => {
    vi.stubEnv("ADMIN_SECRET_KEY", KEY);
    expect(hasValidInternalSecret(req({ "x-internal-secret": "wrong" }))).toBe(false);
    expect(hasValidInternalSecret(req({ "x-internal-secret": `${KEY}x` }))).toBe(false);
    expect(hasValidInternalSecret(req({ "x-internal-secret": KEY.slice(0, -1) }))).toBe(false);
    expect(hasValidInternalSecret(req({ "x-internal-secret": `${KEY.slice(0, -1)}X` }))).toBe(false);
    expect(hasValidInternalSecret(req({ "x-admin-key": KEY }))).toBe(false); // other header names do not count
    expect(hasValidInternalSecret(req({ authorization: `Bearer ${KEY}` }))).toBe(false);
  });
  it("5. configured secret + correct header → authorized", () => {
    vi.stubEnv("ADMIN_SECRET_KEY", KEY);
    expect(hasValidInternalSecret(req({ "x-internal-secret": KEY }))).toBe(true);
  });
  it("6. there is no alternate auth path in this route: a logged-in session alone does not authorize (unchanged)", () => {
    vi.stubEnv("ADMIN_SECRET_KEY", KEY);
    vi.stubEnv("SESSION_SECRET", "session-secret-for-tests-0123456789");
    const token = createSession({ userId: "u1", username: "richard", displayName: "R", isAdmin: true, isSuperAdmin: true });
    expect(hasValidInternalSecret(req({ cookie: `${SESSION_COOKIE}=${token}` }))).toBe(false);
  });
  it("the route uses the hardened helper and no longer compares the secret directly", () => {
    const src = readFileSync(join(import.meta.dirname, "..", "..", "src", "app", "api", "scrape", "route.ts"), "utf8");
    expect(src).toContain("if (!hasValidInternalSecret(req)) {");
    expect(src).not.toMatch(/process\.env\.ADMIN_SECRET_KEY/);
    expect(src).not.toMatch(/x-internal-secret/);
  });
});
