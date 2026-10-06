import { describe, expect, it, vi } from "vitest";
import type { CampaignBrain } from "../../../src/lib/outreach/brain.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import type { LLMProvider, StructuredRequest } from "../../../src/lib/outreach/providers/anthropic.js";
import type { PageFetcher } from "../../../src/lib/outreach/research.js";
import { FixtureLLM, FixturePageFetcher } from "../fixtures.js";
import { createTestDb, drain, fixtureContext, LANDING, newRun, OWNER } from "./helpers.js";

// Real Postgres (PGlite) work: generous timeouts so parallel test files under CPU load do not time out.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

class CountingLlm implements LLMProvider {
  readonly name = "fixture-llm";
  private readonly inner = new FixtureLLM();
  brainCalls = 0;
  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    if (req.task === "campaign_brain") this.brainCalls++;
    return this.inner.structured(req);
  }
}

/** Landing-page fetcher that can append text (= the AgentMakers page changed). */
function landingFetcher(extra: () => string): PageFetcher {
  const inner = new FixturePageFetcher();
  return {
    fetch: async (url) => {
      const r = await inner.fetch(url);
      return url === LANDING && extra() ? { ...r, body: r.body.replace("</body>", `<p>${extra()}</p></body>`) } : r;
    },
  };
}

const summaryOf = async (t: Awaited<ReturnType<typeof createTestDb>>, runId: string) =>
  ((await repo.getRun(t.db, OWNER, runId)).discovery_summary as { campaign_brain: { cache_key: string; reused: boolean; version: string } }).campaign_brain;

describe("Campaign Brain cache (database-backed)", () => {
  it("generates once, reuses while the landing page is unchanged, regenerates when it changes", async () => {
    const t = await createTestDb();
    let extra = "";
    const llm = new CountingLlm();
    const ctx = fixtureContext(t.db, { llm, brainFetcher: landingFetcher(() => extra), settings: { maxParallel: 5 } });

    const r1 = await newRun(t.db);
    await drain(ctx, t);
    expect(llm.brainCalls).toBe(1);
    const s1 = await summaryOf(t, r1.id);
    expect(s1.reused).toBe(false);

    await repo.runAction(t.db, OWNER, r1.id, "stop").catch(() => undefined);
    const r2 = await newRun(t.db);
    await drain(ctx, t);
    expect(llm.brainCalls).toBe(1); // no new LLM extraction
    const s2 = await summaryOf(t, r2.id);
    expect(s2).toMatchObject({ reused: true, cache_key: s1.cache_key, version: s1.version });

    extra = "Nieuw: onze AI-receptioniste plant nu ook terugbelverzoeken in op basis van uw eigen regels en geeft een samenvatting door aan de praktijk.";
    const r3 = await newRun(t.db);
    await drain(ctx, t);
    expect(llm.brainCalls).toBe(2);
    const s3 = await summaryOf(t, r3.id);
    expect(s3.reused).toBe(false);
    expect(s3.version).not.toBe(s1.version);
    expect(s3.cache_key).not.toBe(s1.cache_key);

    const rows = await t.sql<{ source_url: string; language: string }>("select source_url, language from outreach_campaign_brains");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source_url === LANDING && r.language === "nl")).toBe(true);
    const ids = await t.sql<{ id: string }>("select distinct campaign_brain_id as id from outreach_runs where campaign_brain_id is not null");
    expect(ids).toHaveLength(2);
    await t.close();
  });

  it("a cached brain is re-gated by the engine on load (a stored unsupported claim cannot reach outreach)", async () => {
    const t = await createTestDb();
    const ctx = fixtureContext(t.db, { llm: new CountingLlm() });
    await newRun(t.db);
    await drain(ctx, t);
    const [row] = await t.sql<{ id: string; brain: CampaignBrain }>("select id, brain from outreach_campaign_brains");
    const signal = Object.keys(row!.brain.capability_by_signal)[0]!;
    const tampered = { ...row!.brain, capability_by_signal: { ...row!.brain.capability_by_signal, [signal]: "beantwoorden 100% van alle oproepen binnen 2 seconden" } };
    await t.sql("update outreach_campaign_brains set brain = $2 where id = $1", [row!.id, JSON.stringify(tampered)]);

    const r2 = await newRun(t.db, { actor: OWNER });
    await drain(ctx, t);
    const [eff] = await t.sql<{ b: CampaignBrain }>("select campaign_brain b from outreach_runs where id = $1", [r2.id]);
    expect((await summaryOf(t, r2.id)).reused).toBe(true);
    expect(JSON.stringify(eff!.b.capability_by_signal)).not.toContain("100%");
    expect(eff!.b.rejected_capabilities.some((x) => x.text.includes("100%"))).toBe(true);
    await t.close();
  });
});
