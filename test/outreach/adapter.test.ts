import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveDeps, loadOutreachEnv, OutreachConfigError, pipelineSettings } from "../../src/lib/outreach/adapter.js";
import { DEFAULT_ANTHROPIC_MODEL, loadEnv } from "../../src/lib/outreach/config.js";
import { CostTracker } from "../../src/lib/outreach/cost.js";

const creds = {
  ANTHROPIC_API_KEY: "test-anthropic",
  DATAFORSEO_LOGIN: "test-login",
  DATAFORSEO_PASSWORD: "test-password",
  HUNTER_API_KEY: "test-hunter",
};

describe("production adapter (Stage 1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses an explicit env object with the Phase 0 defaults", () => {
    const env = loadOutreachEnv({ ANTHROPIC_MODEL: "  " });
    expect(env.ANTHROPIC_MODEL).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(env.PROSPEO_API_KEY).toBeUndefined();
    expect(env.PROOF_MAX_PROSPECTS).toBe(20);
  });

  it("never loads an env file, unlike the Phase 0 CLI loader", () => {
    const dir = mkdtempSync(join(tmpdir(), "outreach-env-"));
    const cwd = process.cwd();
    writeFileSync(join(dir, ".env.local"), "OUTREACH_ADAPTER_SENTINEL=1\n");
    const spy = vi.spyOn(process, "loadEnvFile").mockImplementation(() => undefined);
    try {
      process.chdir(dir);
      loadOutreachEnv();
      expect(spy).not.toHaveBeenCalled();
      loadEnv(); // Phase 0 CLI loader: would read ./.env.local (mocked here, so nothing is loaded)
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
    expect(process.env.OUTREACH_ADAPTER_SENTINEL).toBeUndefined();
  });

  it("refuses to build live deps without credentials and reports names only", () => {
    const env = loadOutreachEnv({ DATAFORSEO_PASSWORD: "secret-value-123" });
    let err: unknown;
    try {
      createLiveDeps(env, new CostTracker("t", 1));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OutreachConfigError);
    expect((err as OutreachConfigError).missing).toEqual(["ANTHROPIC_API_KEY", "DATAFORSEO_LOGIN", "HUNTER_API_KEY"]);
    expect((err as Error).message).not.toContain("secret-value-123");
  });

  it("wires all providers; Prospeo only when its key is set; no network on construction", () => {
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy as typeof fetch;
    const cost = new CostTracker("t", 1);
    const without = createLiveDeps(loadOutreachEnv(creds), cost);
    expect(without.deps.discovery).toBeDefined();
    expect(without.deps.publicSearch).toBeDefined();
    expect(without.deps.hunter).toBeDefined();
    expect(without.deps.llm).toBeDefined();
    expect(without.deps.prospeo).toBeUndefined();
    expect(without.deps.cost).toBe(cost);
    expect(without.brainFetcher).toBe(without.deps.websiteFetcher);
    const withProspeo = createLiveDeps(loadOutreachEnv({ ...creds, PROSPEO_API_KEY: "test-prospeo" }), cost);
    expect(withProspeo.deps.prospeo).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cost.calls).toHaveLength(0);
  });

  it("clamps settings exactly like the Phase 0 CLI", () => {
    expect(pipelineSettings(loadOutreachEnv({ WEBSITE_MAX_PAGES: "50", PIPELINE_CONCURRENCY: "99" }))).toEqual({ maxPages: 6, maxTextChars: 30_000, concurrency: 5 });
    expect(pipelineSettings(loadOutreachEnv({ PIPELINE_CONCURRENCY: "0" })).concurrency).toBe(1);
  });
});
