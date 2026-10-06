import { describe, expect, it } from "vitest";
import { CampaignInputSchema, effectiveLimit, EnvSchema, HARD_MAX_PROSPECTS, requiredRealModeEnvMissing } from "../../src/lib/outreach/config.js";

const base = { niche: "tandarts", country: "Netherlands", agentmakers_url: "https://www.agentmakers.io/nl/tandartspraktijken", limit: 20 };

describe("hard 20-prospect limit + campaign validation", () => {
  it("accepts up to 20 and rejects 21+", () => {
    expect(CampaignInputSchema.safeParse(base).success).toBe(true);
    expect(CampaignInputSchema.safeParse({ ...base, limit: 21 }).success).toBe(false);
    expect(CampaignInputSchema.safeParse({ ...base, limit: 0 }).success).toBe(false);
  });
  it("env cannot raise the cap above 20", () => {
    const env = EnvSchema.parse({ PROOF_MAX_PROSPECTS: "500" });
    expect(effectiveLimit(20, env)).toBe(HARD_MAX_PROSPECTS);
    expect(effectiveLimit(500, env)).toBe(20);
    expect(effectiveLimit(20, EnvSchema.parse({ PROOF_MAX_PROSPECTS: "5" }))).toBe(5);
  });
  it("only accepts AgentMakers niche pages as campaign source", () => {
    expect(CampaignInputSchema.safeParse({ ...base, agentmakers_url: "https://evil.example.com/page" }).success).toBe(false);
    expect(CampaignInputSchema.safeParse({ ...base, agentmakers_url: "http://www.agentmakers.io/nl/x" }).success).toBe(false);
  });
  it("compliance approval cannot be set in Phase 0 and template placeholders are ignored", () => {
    expect(CampaignInputSchema.safeParse({ ...base, compliance_approved: true }).success).toBe(false);
    expect(CampaignInputSchema.parse({ ...base, region: "REPLACE_OR_REMOVE" }).region).toBeUndefined();
  });
  it("reports missing env vars for a real run", () => {
    expect(requiredRealModeEnvMissing(EnvSchema.parse({}))).toEqual(["ANTHROPIC_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "HUNTER_API_KEY"]);
  });
});
