import { describe, expect, it } from "vitest";
import { BudgetExceededError, CostTracker } from "../../src/lib/outreach/cost.js";

describe("cost cap", () => {
  it("records calls per prospect/provider and blocks once the cap would be exceeded", () => {
    const t = new CostTracker("c", 0.25);
    t.guard("hunter", "domain_search", "a.nl", 0.1);
    t.record({ prospect: "a.nl", provider: "hunter", operation: "domain_search", estimated_cost_eur: 0.1, actual_cost_eur: 0.1, native_cost: "1 credit", result: "ok" });
    t.guard("hunter", "domain_search", "b.nl", 0.1);
    t.record({ prospect: "b.nl", provider: "hunter", operation: "domain_search", estimated_cost_eur: 0.1, actual_cost_eur: 0.1, native_cost: "1 credit", result: "ok" });
    expect(() => t.guard("hunter", "domain_search", "c.nl", 0.1)).toThrow(BudgetExceededError);
    expect(t.isExhausted).toBe(true);
    // once exhausted, even a free-looking call is blocked (stop/pause semantics)
    expect(() => t.guard("anthropic", "personalization_hook", "a.nl", 0)).toThrow(BudgetExceededError);
    expect(t.costForProspect("a.nl")).toBeCloseTo(0.1);
    expect(t.spentEur).toBeCloseTo(0.2);
    expect(t.calls.filter((c) => c.result === "blocked_by_budget")).toHaveLength(2);
    expect(t.calls.every((c) => c.campaign === "c" && c.timestamp)).toBe(true);
  });
  it("uses actual cost when known, estimate otherwise", () => {
    const t = new CostTracker("c", 10);
    t.record({ prospect: null, provider: "anthropic", operation: "x", estimated_cost_eur: 0.05, actual_cost_eur: 0.01, native_cost: null, result: "ok" });
    t.record({ prospect: null, provider: "dataforseo", operation: "y", estimated_cost_eur: 0.002, actual_cost_eur: null, native_cost: null, result: "ok" });
    expect(t.spentEur).toBeCloseTo(0.012);
  });
});
