import { z } from "zod";
import type { CostTracker } from "../cost";
import { requestJson, type FetchLike } from "../http";

/**
 * Anthropic Messages API — structured output via STRICT tool use with tool_choice "auto".
 *
 * Claude Sonnet 5.5 rejects forced tool use (tool_choice "tool"/"any"), so we never send it.
 * Instead: one tool marked `strict: true`, tool_choice {type:"auto"}, and an explicit instruction to
 * call the tool. The tool is never "executed" (no browsing, no side effects) — it is a typed output channel.
 *
 * - Every tool input is validated with the ORIGINAL Zod schema (incl. constraints stripped for strict mode).
 * - No tool call → exactly one retry with a stronger instruction → else StructuredOutputError("NO_TOOL_CALL").
 * - Free-text replies are never parsed.
 *
 * Sampling/thinking: Sonnet 5.5 rejects `temperature` ("deprecated for this model"). We send NO sampling
 * parameters (temperature, top_p, top_k) and NO `thinking` configuration — the model runs on its defaults.
 * Output determinism/quality is enforced by the strict schema + Zod + deterministic validators instead.
 */
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const STRUCTURED_TOOL_NAME = "submit_structured_output";

export type LlmTask = "campaign_brain" | "personalization_hook";

export interface StructuredRequest<T> {
  task: LlmTask;
  prospect: string | null;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

export interface LLMProvider {
  readonly name: string;
  structured<T>(req: StructuredRequest<T>): Promise<T>;
}

export type StructuredOutputErrorCode = "NO_TOOL_CALL" | "SCHEMA_VALIDATION_FAILED";

/** Controlled pipeline error: the model did not return a valid structured tool call. */
export class StructuredOutputError extends Error {
  constructor(public readonly code: StructuredOutputErrorCode, public readonly task: LlmTask, detail: string) {
    super(`${code} (${task}): ${detail}`);
    this.name = "StructuredOutputError";
  }
}

/* ------------------------------------------------------------------ */
/* Strict-mode schema conversion                                       */
/* ------------------------------------------------------------------ */

/**
 * Keywords stripped from the schema sent to the API (strict mode does not support them, per Anthropic's
 * structured-outputs docs / SDK transform). They are appended to the description instead and still
 * enforced locally by Zod after the response.
 */
const STRIPPED_KEYWORDS = ["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "maxItems", "pattern", "default"] as const;

type Json = Record<string, unknown>;

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== "object") return node;
  const src = node as Json;
  const out: Json = {};
  const moved: string[] = [];
  for (const [k, v] of Object.entries(src)) {
    if (k === "$schema") continue;
    if ((STRIPPED_KEYWORDS as readonly string[]).includes(k)) {
      moved.push(`${k}: ${JSON.stringify(v)}`);
      continue;
    }
    if (k === "minItems" && typeof v === "number" && v > 1) {
      moved.push(`minItems: ${v}`);
      continue;
    }
    if (k === "properties" && v && typeof v === "object") {
      out[k] = Object.fromEntries(Object.entries(v as Json).map(([pk, pv]) => [pk, strictify(pv)]));
      continue;
    }
    out[k] = strictify(v);
  }
  const isObject = out.type === "object" || (Array.isArray(out.type) && out.type.includes("object")) || "properties" in out;
  if (isObject) {
    out.additionalProperties = false;
    out.properties ??= {};
    out.required = Object.keys(out.properties as Json);
  }
  if (moved.length) out.description = [out.description, `(constraints: ${moved.join(", ")})`].filter(Boolean).join(" ");
  return out;
}

/** Zod → JSON Schema compatible with Anthropic strict tool use. */
export function toStrictToolSchema(schema: z.ZodType): Json {
  return strictify(z.toJSONSchema(schema, { target: "draft-7" })) as Json;
}

export function buildToolDefinition(schema: z.ZodType) {
  return {
    name: STRUCTURED_TOOL_NAME,
    description: "Return the complete structured result. This is the ONLY accepted way to answer.",
    strict: true,
    input_schema: toStrictToolSchema(schema),
  };
}

/** Appended to every system prompt: the structured tool is the only valid output channel. */
export const TOOL_INSTRUCTION = `\n\nOUTPUT RULE: Respond ONLY by calling the tool "${STRUCTURED_TOOL_NAME}" exactly once with the complete result. Do not write any text outside the tool call. Plain-text answers are discarded.`;
export const RETRY_INSTRUCTION = `Your previous reply did not call the "${STRUCTURED_TOOL_NAME}" tool, so it was discarded. Call "${STRUCTURED_TOOL_NAME}" now with the complete result. Do NOT reply with text.`;

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

/** Request fields we never send to the Messages API (deprecated/rejected for Sonnet 5.5, or not needed). */
export const FORBIDDEN_REQUEST_FIELDS = ["temperature", "top_p", "top_k", "thinking"] as const;

/** Pure builder for the Messages API body — the single place request fields are decided. */
export function buildMessagesRequest(input: { model: string; maxTokens: number; system: string; user: string; tool: ReturnType<typeof buildToolDefinition> }) {
  const body = {
    model: input.model,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: [{ role: "user" as const, content: input.user }],
    tools: [input.tool],
    tool_choice: { type: "auto" as const }, // never forced ("tool"/"any") — unsupported on Sonnet 5.5
  };
  for (const f of FORBIDDEN_REQUEST_FIELDS) if (f in body) throw new Error(`Forbidden Anthropic request field: ${f}`);
  return body;
}

/** Only the stable version header; no `anthropic-beta` headers are sent. */
export function buildHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
}

export const MAX_STRUCTURED_ATTEMPTS = 2; // initial + one retry when no tool call is returned

export class AnthropicLLM implements LLMProvider {
  readonly name: string;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly cost: CostTracker,
    private readonly pricing: { usdPerMTokIn: number; usdPerMTokOut: number; usdToEur: number },
    private readonly fetchImpl?: FetchLike,
  ) {
    this.name = `anthropic:${model}`;
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    const tool = buildToolDefinition(req.schema);
    const system = req.system + TOOL_INSTRUCTION;
    for (let attempt = 1; attempt <= MAX_STRUCTURED_ATTEMPTS; attempt++) {
      const user = attempt === 1 ? req.user : `${req.user}\n\n${RETRY_INSTRUCTION}`;
      const content = await this.call(req, system, user, tool, attempt);
      const toolUse = content.find((c) => c.type === "tool_use" && c.name === STRUCTURED_TOOL_NAME);
      if (!toolUse) continue; // text-only reply: never parsed; retry once with a stronger instruction
      const parsed = req.schema.safeParse(toolUse.input);
      if (!parsed.success) throw new StructuredOutputError("SCHEMA_VALIDATION_FAILED", req.task, parsed.error.message.slice(0, 400));
      return parsed.data;
    }
    throw new StructuredOutputError("NO_TOOL_CALL", req.task, `model returned no "${STRUCTURED_TOOL_NAME}" tool call after ${MAX_STRUCTURED_ATTEMPTS} attempts`);
  }

  private async call(req: StructuredRequest<unknown>, system: string, user: string, tool: ReturnType<typeof buildToolDefinition>, attempt: number) {
    const inTokEst = Math.ceil((system.length + user.length + JSON.stringify(tool).length) / 3.5) + 400;
    const estEur = ((inTokEst * this.pricing.usdPerMTokIn + req.maxTokens * this.pricing.usdPerMTokOut) / 1e6) * this.pricing.usdToEur;
    this.cost.guard("anthropic", req.task, req.prospect, estEur);

    const res = await requestJson(ANTHROPIC_URL, {
      method: "POST",
      headers: buildHeaders(this.apiKey),
      body: buildMessagesRequest({ model: this.model, maxTokens: req.maxTokens, system, user, tool }),
      timeoutMs: 90_000,
      maxRetries: 2,
      fetchImpl: this.fetchImpl,
    });
    const body = res.body as {
      content?: Array<{ type: string; name?: string; input?: unknown }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
      error?: { message?: string };
    };
    const usage = body?.usage;
    const actualEur = usage
      ? (((usage.input_tokens ?? 0) * this.pricing.usdPerMTokIn + (usage.output_tokens ?? 0) * this.pricing.usdPerMTokOut) / 1e6) * this.pricing.usdToEur
      : null;
    if (res.status !== 200) {
      this.cost.record({ prospect: req.prospect, provider: "anthropic", operation: req.task, estimated_cost_eur: 0, actual_cost_eur: actualEur, native_cost: null, result: "error", detail: `attempt ${attempt}: HTTP ${res.status} ${body?.error?.message ?? ""}`.slice(0, 300) });
      throw new Error(`Anthropic HTTP ${res.status}: ${body?.error?.message ?? "error"}`);
    }
    const content = body.content ?? [];
    const hasTool = content.some((c) => c.type === "tool_use" && c.name === STRUCTURED_TOOL_NAME);
    this.cost.record({
      prospect: req.prospect,
      provider: "anthropic",
      operation: req.task,
      estimated_cost_eur: estEur,
      actual_cost_eur: actualEur,
      native_cost: usage ? `${usage.input_tokens} in / ${usage.output_tokens} out tokens` : null,
      result: hasTool ? "ok" : "empty",
      detail: `attempt ${attempt}, stop_reason=${body.stop_reason ?? "?"}${hasTool ? "" : ", no tool call"}`,
    });
    return content;
  }
}
