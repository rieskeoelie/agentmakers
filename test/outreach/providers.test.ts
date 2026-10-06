import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CostTracker } from "../../src/lib/outreach/cost.js";
import { DEFAULT_ANTHROPIC_MODEL, EnvSchema } from "../../src/lib/outreach/config.js";
import { requestJson } from "../../src/lib/outreach/http.js";
import { AnthropicLLM, buildMessagesRequest, buildToolDefinition, FORBIDDEN_REQUEST_FIELDS, RETRY_INSTRUCTION, STRUCTURED_TOOL_NAME, StructuredOutputError, toStrictToolSchema } from "../../src/lib/outreach/providers/anthropic.js";
import { BrainExtractionSchema } from "../../src/lib/outreach/brain.js";
import { HookSchema } from "../../src/lib/outreach/hook.js";
import { DataForSeoDiscovery, normalizeMapsItems } from "../../src/lib/outreach/providers/dataforseo.js";
import { mockFetch } from "./helpers.js";

const maps = JSON.parse(readFileSync(new URL("./fixtures/dataforseo/maps-tandarts-hoorn.json", import.meta.url), "utf8"));

describe("DataForSEO discovery (mocked)", () => {
  it("normalizes maps_search items to the PROVIDERS.md shape", () => {
    const out = normalizeMapsItems(maps.tasks[0].result[0].items);
    expect(out[0]).toMatchObject({
      company_name: "Tandartspraktijk De Wit", domain: "tandartspraktijk-dewit.example", category: "Tandarts", city: "Hoorn", country: "NL",
      rating: 4.5, raw_reference: { provider: "dataforseo", place_id: "fixture-place-1" },
    });
    expect(out.find((c) => c.company_name === "Tandarts Zonder Site")!.domain).toBeNull();
    expect(out.find((c) => c.company_name === "Tandarts Gesloten")!.closed_signal).toBe("closed_forever");
  });
  it("ignores non-maps items and malformed entries", () => {
    expect(normalizeMapsItems([{ type: "ads" }, { nope: true }, { type: "maps_search" }])).toEqual([]);
  });
  it("posts keyword+location with Basic auth, caps depth to one billed page, records actual cost", async () => {
    const m = mockFetch(() => [200, maps]);
    const cost = new CostTracker("t", 1);
    const d = new DataForSeoDiscovery({ login: "l", password: "p" }, cost, 0.9, m.fetch);
    const out = await d.discover({ niche: "tandarts", country: "Netherlands", region: "Hoorn", language: "nl", depth: 500 });
    expect(out.length).toBe(15);
    const body = JSON.parse(String(m.calls[0]!.init.body));
    expect(body[0]).toMatchObject({ keyword: "tandarts Hoorn", location_name: "Netherlands", language_code: "nl", depth: 100 });
    expect((m.calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("l:p").toString("base64")}`);
    expect(cost.calls[0]!.actual_cost_eur).toBeCloseTo(0.002 * 0.9);
  });
  it("surfaces task-level errors", async () => {
    const m = mockFetch(() => [200, { status_code: 20000, cost: 0, tasks: [{ status_code: 40501, status_message: "Invalid Field", result: null }] }]);
    const d = new DataForSeoDiscovery({ login: "l", password: "p" }, new CostTracker("t", 1), 0.9, m.fetch);
    await expect(d.discover({ niche: "x", country: "Netherlands", language: "nl", depth: 100 })).rejects.toThrow(/40501/);
  });
});

describe("Anthropic structured output for claude-sonnet-5-5 (mocked, strict tool use + tool_choice auto)", () => {
  const Schema = z.object({ answer: z.string().max(20), items: z.array(z.string()).max(3), nested: z.object({ n: z.number() }), maybe: z.string().nullable() });
  const valid = { answer: "ok", items: ["a"], nested: { n: 1 }, maybe: null };
  const toolUse = (input: unknown) => ({ content: [{ type: "tool_use", id: "t1", name: STRUCTURED_TOOL_NAME, input }], stop_reason: "tool_use", usage: { input_tokens: 1000, output_tokens: 100 } });
  const textOnly = { content: [{ type: "text", text: '{"answer":"ok","items":[],"nested":{"n":1},"maybe":null}' }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } };
  const llm = (responses: unknown[], budget = 1) => {
    const m = mockFetch((_u, _i, n) => [200, responses[Math.min(n - 1, responses.length - 1)]]);
    const cost = new CostTracker("t", budget);
    return { l: new AnthropicLLM("sk-test", "claude-sonnet-5-5", cost, { usdPerMTokIn: 2, usdPerMTokOut: 10, usdToEur: 1 }, m.fetch), m, cost };
  };
  const req = { task: "personalization_hook" as const, prospect: "x.nl", system: "s", user: "u", schema: Schema, maxTokens: 200 };
  const sent = (m: ReturnType<typeof llm>["m"], i = 0) => JSON.parse(String(m.calls[i]!.init.body));

  it("uses model claude-sonnet-5-5 with tool_choice auto", async () => {
    const { l, m } = llm([toolUse(valid)]);
    await l.structured(req);
    expect(sent(m).model).toBe("claude-sonnet-5-5");
    expect(sent(m).tool_choice).toEqual({ type: "auto" });
  });
  it("never sends a forced tool choice (type tool / any), on any attempt", async () => {
    const { l, m } = llm([textOnly, toolUse(valid)]);
    await l.structured(req);
    expect(m.calls).toHaveLength(2);
    for (let i = 0; i < m.calls.length; i++) {
      const tc = sent(m, i).tool_choice;
      expect(tc.type).toBe("auto");
      expect(["tool", "any"]).not.toContain(tc.type);
      expect(tc.name).toBeUndefined();
    }
  });
  it("sends strict=true and a strict-compatible schema (additionalProperties:false, all keys required, no unsupported keywords)", async () => {
    const { l, m } = llm([toolUse(valid)]);
    await l.structured(req);
    const tool = sent(m).tools[0];
    expect(sent(m).tools).toHaveLength(1);
    expect(tool.strict).toBe(true);
    expect(tool.name).toBe(STRUCTURED_TOOL_NAME);
    expect(tool.input_schema.additionalProperties).toBe(false);
    expect(tool.input_schema.properties.nested.additionalProperties).toBe(false);
    expect(tool.input_schema.required.sort()).toEqual(["answer", "items", "maybe", "nested"]);
    expect(tool.input_schema.$schema).toBeUndefined();
    expect(tool.input_schema.properties.answer.maxLength).toBeUndefined();
    expect(tool.input_schema.properties.items.maxItems).toBeUndefined();
    expect(tool.input_schema.properties.answer.description).toContain("maxLength: 20"); // constraint preserved as guidance
  });
  it("instructs the model to use the structured tool", async () => {
    const { l, m } = llm([toolUse(valid)]);
    await l.structured(req);
    expect(sent(m).system).toContain(`Respond ONLY by calling the tool "${STRUCTURED_TOOL_NAME}"`);
  });
  it("valid structured response passes Zod validation and records token cost", async () => {
    const { l, m, cost } = llm([toolUse(valid)]);
    expect(await l.structured(req)).toEqual(valid);
    expect(m.calls).toHaveLength(1);
    expect(cost.calls[0]!.actual_cost_eur).toBeCloseTo((1000 * 2 + 100 * 10) / 1e6);
  });
  it("missing tool call → retries exactly once with a stronger instruction, then succeeds", async () => {
    const { l, m, cost } = llm([textOnly, toolUse(valid)]);
    expect(await l.structured(req)).toEqual(valid);
    expect(m.calls).toHaveLength(2);
    expect(sent(m, 0).messages[0].content).not.toContain("did not call");
    expect(sent(m, 1).messages[0].content).toContain(RETRY_INSTRUCTION);
    expect(cost.calls.map((c) => c.result)).toEqual(["empty", "ok"]);
  });
  it("second missing tool call fails cleanly with a controlled NO_TOOL_CALL error (prose is never parsed)", async () => {
    const { l, m } = llm([textOnly, textOnly]);
    const err = await l.structured(req).catch((e) => e);
    expect(err).toBeInstanceOf(StructuredOutputError);
    expect(err.code).toBe("NO_TOOL_CALL");
    expect(m.calls).toHaveLength(2); // exactly one retry
  });
  it("a tool call with the wrong tool name counts as missing", async () => {
    const wrong = { content: [{ type: "tool_use", name: "something_else", input: valid }], usage: { input_tokens: 1, output_tokens: 1 } };
    const err = await llm([wrong, wrong]).l.structured(req).catch((e) => e);
    expect(err.code).toBe("NO_TOOL_CALL");
  });
  it("malformed tool payload fails Zod schema validation (incl. constraints stripped from the API schema)", async () => {
    for (const bad of [{ ...valid, answer: 42 }, { ...valid, answer: "x".repeat(21) }, { ...valid, items: ["a", "b", "c", "d"] }, { answer: "ok" }]) {
      const err = await llm([toolUse(bad)]).l.structured(req).catch((e) => e);
      expect(err).toBeInstanceOf(StructuredOutputError);
      expect(err.code).toBe("SCHEMA_VALIDATION_FAILED");
    }
  });
  it("blocks the call when the budget cannot cover the estimate", async () => {
    const { l, m } = llm([{}], 0.000001);
    await expect(l.structured({ ...req, maxTokens: 3000 })).rejects.toThrow(/budget/i);
    expect(m.calls).toHaveLength(0);
  });
  it("real pipeline schemas convert to strict-compatible schemas", () => {
    const walk = (n: unknown, path = "$"): string[] => {
      if (Array.isArray(n)) return n.flatMap((x, i) => walk(x, `${path}[${i}]`));
      if (!n || typeof n !== "object") return [];
      const o = n as Record<string, unknown>;
      const bad: string[] = [];
      for (const k of ["minLength", "maxLength", "maxItems", "minimum", "maximum", "pattern", "$schema"]) if (k in o) bad.push(`${path}.${k}`);
      if (typeof o.minItems === "number" && o.minItems > 1) bad.push(`${path}.minItems`);
      if (o.type === "object") {
        if (o.additionalProperties !== false) bad.push(`${path}.additionalProperties`);
        if (JSON.stringify([...(o.required as string[])].sort()) !== JSON.stringify(Object.keys(o.properties as object).sort())) bad.push(`${path}.required`);
      }
      for (const [k, v] of Object.entries(o)) if (k !== "description") bad.push(...walk(v, `${path}.${k}`));
      return bad;
    };
    for (const s of [BrainExtractionSchema, HookSchema]) {
      const tool = buildToolDefinition(s);
      expect(tool.strict).toBe(true);
      expect(walk(tool.input_schema)).toEqual([]);
    }
    // Anthropic strict-mode limit: ≤16 union-typed parameters per request
    const unions = JSON.stringify(toStrictToolSchema(BrainExtractionSchema)).match(/"anyOf"/g)?.length ?? 0;
    expect(unions).toBeLessThanOrEqual(16);
  });
});

describe("hook generation with a model that never calls the tool", () => {
  it("stops after the provider's single retry and fails the hook cleanly (no extra spend)", async () => {
    const { generateHook } = await import("../../src/lib/outreach/hook.js");
    const { fixtureBrain, briefFromHtml } = await import("./helpers.js");
    const brain = await fixtureBrain();
    const brief = briefFromHtml(brain, "<p>Voor het maken van een afspraak kunt u ons bellen.</p>");
    const m = mockFetch(() => [200, { content: [{ type: "text", text: "Sure! Here is a hook: ..." }], usage: { input_tokens: 1, output_tokens: 1 } }]);
    const l = new AnthropicLLM("sk-test", "claude-sonnet-5-5", new CostTracker("t", 1), { usdPerMTokIn: 2, usdPerMTokOut: 10, usdToEur: 1 }, m.fetch);
    const r = await generateHook(brief, brain, l, { language: "nl", formality: "formal", niche: "tandarts", prospect: "x.nl" });
    expect(r.hook).toBeNull();
    expect(m.calls).toHaveLength(2);
    expect(r.rejections[0]!.issues[0]).toMatch(/^LLM_ERROR:NO_TOOL_CALL/);
    const body = JSON.parse(String(m.calls[0]!.init.body));
    expect(body.system).toContain("structured output tool");
  });
});

describe("provider HTTP guard", () => {
  it("refuses non-allowlisted hosts (website URLs must use safeFetch)", async () => {
    await expect(requestJson("https://evil.example.com/x")).rejects.toThrow(/not allowlisted/);
  });
});

describe("Sonnet 5.5 sampling/thinking compatibility", () => {
  const Schema = z.object({ answer: z.string() });
  const ok = { content: [{ type: "tool_use", name: STRUCTURED_TOOL_NAME, input: { answer: "ok" } }], usage: { input_tokens: 1, output_tokens: 1 } };
  const text = { content: [{ type: "text", text: "no tool" }], usage: { input_tokens: 1, output_tokens: 1 } };
  const run = async (responses: unknown[]) => {
    const m = mockFetch((_u, _i, n) => [200, responses[Math.min(n - 1, responses.length - 1)]]);
    const l = new AnthropicLLM("sk-test", "claude-sonnet-5-5", new CostTracker("t", 1), { usdPerMTokIn: 2, usdPerMTokOut: 10, usdToEur: 1 }, m.fetch);
    await l.structured({ task: "campaign_brain", prospect: null, system: "s", user: "u", schema: Schema, maxTokens: 100 }).catch(() => undefined);
    return m.calls.map((c) => ({ body: JSON.parse(String(c.init.body)), headers: c.init.headers as Record<string, string> }));
  };

  it("sends no temperature / top_p / top_k / thinking on the first attempt or the retry", async () => {
    const reqs = await run([text, ok]);
    expect(reqs).toHaveLength(2);
    for (const { body } of reqs) {
      expect(body.model).toBe("claude-sonnet-5-5");
      for (const f of ["temperature", "top_p", "top_k", "thinking", "budget_tokens"]) expect(body).not.toHaveProperty(f);
      expect(JSON.stringify(body)).not.toMatch(/budget_tokens|"temperature"|"top_p"|"top_k"/);
    }
  });
  it("never sends a forced tool_choice; keeps strict tool + auto", async () => {
    for (const { body } of await run([text, text])) {
      expect(body.tool_choice).toEqual({ type: "auto" });
      expect(body.tools[0].strict).toBe(true);
    }
  });
  it("sends no anthropic-beta header, only the stable version header", async () => {
    const { headers } = (await run([ok]))[0]!;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("anthropic-beta");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });
  it("request builder exposes exactly the allowed top-level fields", () => {
    const body = buildMessagesRequest({ model: "claude-sonnet-5-5", maxTokens: 10, system: "s", user: "u", tool: buildToolDefinition(Schema) });
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model", "system", "tool_choice", "tools"]);
    for (const f of FORBIDDEN_REQUEST_FIELDS) expect(body).not.toHaveProperty(f);
  });
});

describe("ANTHROPIC_MODEL configuration", () => {
  it("empty, whitespace or missing ANTHROPIC_MODEL falls back to claude-sonnet-5-5", () => {
    expect(EnvSchema.parse({ ANTHROPIC_MODEL: "" }).ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
    expect(EnvSchema.parse({ ANTHROPIC_MODEL: "   " }).ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
    expect(EnvSchema.parse({}).ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
    expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
  });
  it("an explicit value is respected (trimmed)", () => {
    expect(EnvSchema.parse({ ANTHROPIC_MODEL: " claude-sonnet-5-5 " }).ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
  });
});
