import { describe, expect, it } from "vitest";
import { evaluateEmail, isFreeMail, isGenericEmail } from "../../src/lib/outreach/eligibility.js";

describe("email eligibility (CLAUDE.md policy)", () => {
  it("valid personal company-domain email → ELIGIBLE", () => {
    expect(evaluateEmail("pieter@dewit.nl", "valid", "dewit.nl").eligibility).toBe("ELIGIBLE");
    expect(evaluateEmail("pieter@mail.dewit.nl", "valid", "www.dewit.nl").eligibility).toBe("ELIGIBLE");
  });
  it("accept_all → REVIEW_ONLY", () => {
    const r = evaluateEmail("pieter@dewit.nl", "accept_all", "dewit.nl");
    expect(r.eligibility).toBe("REVIEW_ONLY");
    expect(r.reasons).toContain("ACCEPT_ALL_REVIEW_ONLY");
  });
  it("unknown / not verified → never automatically sendable", () => {
    expect(evaluateEmail("pieter@dewit.nl", "unknown", "dewit.nl").eligibility).toBe("REVIEW_ONLY");
    expect(evaluateEmail("pieter@dewit.nl", "not_verified", "dewit.nl").eligibility).toBe("REVIEW_ONLY");
  });
  it("generic addresses are never a recipient (NOT_ELIGIBLE) even when valid", () => {
    for (const e of ["info@dewit.nl", "receptie@dewit.nl", "praktijk@dewit.nl", "contact@dewit.nl", "info.hoorn@dewit.nl"]) {
      expect(isGenericEmail(e)).toBe(true);
      expect(evaluateEmail(e, "valid", "dewit.nl").eligibility).toBe("NOT_ELIGIBLE");
    }
    expect(isGenericEmail("pieter@dewit.nl")).toBe(false);
  });
  it("free-mail domains are not automatically eligible", () => {
    expect(isFreeMail("jan@gmail.com")).toBe(true);
    expect(isFreeMail("jan@ziggo.nl")).toBe(true);
    const r = evaluateEmail("jan@gmail.com", "valid", "dewit.nl");
    expect(r.eligibility).toBe("REVIEW_ONLY");
    expect(r.reasons).toContain("FREE_MAIL_DOMAIN_REVIEW_ONLY");
  });
  it("email on a different domain than the company → REVIEW_ONLY", () => {
    expect(evaluateEmail("pieter@other.nl", "valid", "dewit.nl").reasons).toContain("EMAIL_DOMAIN_DIFFERS_FROM_COMPANY");
  });
  it("invalid / disposable / malformed → NOT_ELIGIBLE", () => {
    expect(evaluateEmail("pieter@dewit.nl", "invalid", "dewit.nl").eligibility).toBe("NOT_ELIGIBLE");
    expect(evaluateEmail("pieter@dewit.nl", "disposable", "dewit.nl").eligibility).toBe("NOT_ELIGIBLE");
    expect(evaluateEmail("pieter@@dewit", "valid", "dewit.nl").eligibility).toBe("NOT_ELIGIBLE");
    expect(evaluateEmail(null, "valid", "dewit.nl").eligibility).toBe("NOT_ELIGIBLE");
  });
});
