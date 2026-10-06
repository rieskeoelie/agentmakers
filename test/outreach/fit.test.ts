import { describe, expect, it } from "vitest";
import { bestAngle, classifyFit } from "../../src/lib/outreach/fit.js";
import type { Evidence } from "../../src/lib/outreach/research.js";

const ev = (signal: Evidence["signal"], polarity: Evidence["polarity"], strength: Evidence["strength"], id = signal): Evidence => ({
  id, signal, polarity, strength, fact: "f", snippet: "s", source_url: "https://x.nl/", page_kind: "home", fetched_at: "t", confidence: "high",
});

describe("fit classification", () => {
  it("GOOD_FIT requires ≥1 strong evidence-backed positive signal", () => {
    const r = classifyFit({ facts: [ev("APPOINTMENT_BY_PHONE", "positive", "strong")], pagesFetched: 3, nicheRelevant: true });
    expect(r.classification).toBe("GOOD_FIT");
    expect(r.positive_signals).toEqual(["APPOINTMENT_BY_PHONE"]);
    expect(r.evidence_confidence).toBe("medium");
  });
  it("two distinct strong signals → high confidence", () => {
    expect(classifyFit({ facts: [ev("APPOINTMENT_BY_PHONE", "positive", "strong"), ev("PHONE_HOURS", "positive", "strong")], pagesFetched: 3, nicheRelevant: true }).evidence_confidence).toBe("high");
  });
  it("only weak signals → POSSIBLE_FIT", () => {
    expect(classifyFit({ facts: [ev("FAQ_PRESENT", "positive", "weak")], pagesFetched: 2, nicheRelevant: true }).classification).toBe("POSSIBLE_FIT");
    expect(classifyFit({ facts: [], pagesFetched: 2, nicheRelevant: null }).classification).toBe("POSSIBLE_FIT");
  });
  it("existing voice AI → SKIP even with positive signals", () => {
    const r = classifyFit({ facts: [ev("APPOINTMENT_BY_PHONE", "positive", "strong"), ev("EXISTING_VOICE_AI", "negative", "strong")], pagesFetched: 1, nicheRelevant: true });
    expect(r.classification).toBe("SKIP");
    expect(r.negative_signals).toContain("EXISTING_VOICE_AI");
  });
  it("no pages fetched → SKIP (insufficient evidence); niche mismatch → SKIP", () => {
    expect(classifyFit({ facts: [], pagesFetched: 0, nicheRelevant: true }).classification).toBe("SKIP");
    expect(classifyFit({ facts: [ev("APPOINTMENT_BY_PHONE", "positive", "strong")], pagesFetched: 1, nicheRelevant: false }).classification).toBe("SKIP");
  });
  it("online booking is noted but does not by itself downgrade a strong phone signal", () => {
    const r = classifyFit({ facts: [ev("PHONE_HOURS", "positive", "strong"), ev("ONLINE_BOOKING", "negative", "weak")], pagesFetched: 2, nicheRelevant: true });
    expect(r.classification).toBe("GOOD_FIT");
    expect(r.reason).toContain("ONLINE_BOOKING");
  });
  it("best angle follows the configured priority and ignores negative evidence", () => {
    expect(bestAngle([ev("PHONE_CTA", "positive", "strong"), ev("RESCHEDULE_BY_PHONE", "positive", "strong"), ev("ONLINE_BOOKING", "negative", "weak")])!.signal).toBe("RESCHEDULE_BY_PHONE");
    expect(bestAngle([ev("ONLINE_BOOKING", "negative", "weak")])).toBeNull();
  });
});
