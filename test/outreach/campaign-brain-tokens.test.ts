import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BrainExtractionSchema, buildCampaignBrain, CAMPAIGN_BRAIN_MAX_TOKENS, type BrainExtraction } from "../../src/lib/outreach/brain.js";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { AnthropicLLM, STRUCTURED_TOOL_NAME, StructuredOutputError } from "../../src/lib/outreach/providers/anthropic.js";
import { FixturePageFetcher } from "./fixtures.js";
import { LANDING, mockFetch } from "./helpers.js";

/**
 * Regression: the first production run failed because the Campaign Brain call allowed only 3000 output tokens.
 * Anthropic stopped with stop_reason=max_tokens, the tool input was incomplete and schema validation rejected it.
 */

const base: BrainExtraction = BrainExtractionSchema.parse(
  JSON.parse(readFileSync(new URL("./fixtures/llm/campaign-brain.tandartspraktijken.json", import.meta.url), "utf8")),
);

/** Fills the list fields towards their schema maximums with realistic Dutch phrases (each within the 160-char limit). */
function largeBrain(): BrainExtraction {
  const p = (topic: string, i: number) =>
    `${topic} ${i + 1}: de praktijk wordt telefonisch goed bereikbaar, ook tijdens drukke spreekuren, zonder extra werkdruk voor de assistentes aan de balie`.slice(0, 158);
  const fill = (arr: string[], max: number, topic: string) => [...arr, ...Array.from({ length: Math.max(0, max - arr.length) }, (_, i) => p(topic, i))].slice(0, max);
  return {
    ...base,
    problems_addressed: fill(base.problems_addressed, 10, "Probleem"),
    voice_ai_use_cases: fill(base.voice_ai_use_cases, 12, "Toepassing"),
    supported_capabilities: fill(base.supported_capabilities, 15, "Mogelijkheid"),
    supported_benefits: fill(base.supported_benefits, 10, "Voordeel"),
    prohibited_or_unsupported_claims: fill(base.prohibited_or_unsupported_claims, 15, "Niet beweren"),
    objections: fill(base.objections, 8, "Bezwaar"),
    disqualifiers: fill(base.disqualifiers, 10, "Uitsluiting"),
    high_signal_website_triggers: fill(base.high_signal_website_triggers, 12, "Signaal"),
    email_framework: fill(base.email_framework, 6, "Mailstap"),
    followup_framework: fill(base.followup_framework, 4, "Opvolging"),
  };
}

/** Output-token estimate (≈4 characters per token) for the tool input. */
const tokensFor = (v: unknown) => Math.ceil(JSON.stringify(v).length / 4);

/**
 * Simulated Messages API that honours max_tokens like the real one: if the tool input does not fit, it returns the
 * fields that fit (later fields missing) with stop_reason=max_tokens.
 */
function simulatedAnthropic(output: BrainExtraction) {
  const needed = tokensFor(output);
  const m = mockFetch((_u, init) => {
    const maxTokens = JSON.parse(String(init.body)).max_tokens as number;
    let input: Record<string, unknown> = output;
    let stop = "tool_use";
    if (maxTokens < needed) {
      input = {};
      for (const [k, v] of Object.entries(output)) {
        if (tokensFor({ ...input, [k]: v }) > maxTokens) break;
        input[k] = v;
      }
      stop = "max_tokens";
    }
    return [200, { content: [{ type: "tool_use", id: "t1", name: STRUCTURED_TOOL_NAME, input }], stop_reason: stop, usage: { input_tokens: 3000, output_tokens: Math.min(needed, maxTokens) } }];
  });
  const llm = new AnthropicLLM("sk-test", "claude-sonnet-5-5", new CostTracker("t", 1), { usdPerMTokIn: 2, usdPerMTokOut: 10, usdToEur: 1 }, m.fetch);
  return { m, llm, needed };
}

describe("Campaign Brain output-token allowance (production regression)", () => {
  const big = largeBrain();

  it("a full, schema-valid Campaign Brain can need more than the old 3000-token ceiling", () => {
    expect(BrainExtractionSchema.safeParse(big).success).toBe(true);
    const needed = tokensFor(big);
    expect(needed).toBeGreaterThan(3000);
    expect(needed).toBeLessThanOrEqual(CAMPAIGN_BRAIN_MAX_TOKENS);
  });

  it("with the old 3000 ceiling the same response is truncated and rejected by the schema (the production failure)", async () => {
    const { llm, m } = simulatedAnthropic(big);
    await expect(llm.structured({ task: "campaign_brain", prospect: null, system: "s", user: "u", schema: BrainExtractionSchema, maxTokens: 3000 }))
      .rejects.toMatchObject({ name: StructuredOutputError.name, code: "SCHEMA_VALIDATION_FAILED" });
    expect(m.calls).toHaveLength(1);
  });

  it("buildCampaignBrain requests 6000 tokens and returns a brain that passes the unchanged schema", async () => {
    expect(CAMPAIGN_BRAIN_MAX_TOKENS).toBe(6000);
    const { llm, m } = simulatedAnthropic(big);
    const brain = await buildCampaignBrain(LANDING, "nl", new FixturePageFetcher(), llm);
    expect(m.calls).toHaveLength(1);
    expect(JSON.parse(String(m.calls[0]!.init.body)).max_tokens).toBe(6000);
    const extraction = Object.fromEntries(Object.keys(BrainExtractionSchema.shape).map((k) => [k, (brain as unknown as Record<string, unknown>)[k]]));
    expect(BrainExtractionSchema.safeParse(extraction).success).toBe(true);
    expect(brain.followup_framework).toHaveLength(4);
    expect(brain.disqualifiers).toHaveLength(10);
    expect(brain.category_keywords.length).toBeGreaterThan(0);
  });
});
