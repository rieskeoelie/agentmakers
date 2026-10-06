import type { BrainCache, CampaignBrain } from "../brain";
import type { OutreachDb } from "./db";
import { repo } from "./repository";

/**
 * Database-backed Campaign Brain cache (replaces the Phase 0 file cache).
 *
 * The engine's BrainCache interface is synchronous, so this cache is preloaded with every stored brain for the
 * landing page + language before buildCampaignBrain runs. The engine itself decides hit/miss exactly as in
 * Phase 0: its key contains the landing-page content hash, so an unchanged page reuses the stored brain (and the
 * engine re-applies its deterministic claim gate to it), and a changed page produces a new key → new LLM
 * extraction → new row. Nothing about that logic is re-implemented here.
 */
export class DbBrainCache implements BrainCache {
  private readonly stored = new Map<string, { id: string; brain: CampaignBrain }>();
  private readonly added = new Map<string, CampaignBrain>();
  private lastKey: string | null = null;

  private constructor() {}

  static async load(db: OutreachDb, sourceUrl: string, language: string): Promise<DbBrainCache> {
    const c = new DbBrainCache();
    for (const row of await repo.campaignBrainsForSource(db, sourceUrl, language)) c.stored.set(row.cache_key, { id: row.id, brain: row.brain });
    return c;
  }

  get(key: string): CampaignBrain | null {
    this.lastKey = key;
    return this.stored.get(key)?.brain ?? null;
  }

  set(key: string, brain: CampaignBrain): void {
    this.lastKey = key;
    this.added.set(key, brain);
  }

  /** True when the last lookup was served from the database. */
  get wasHit(): boolean {
    return !!this.lastKey && this.stored.has(this.lastKey) && !this.added.has(this.lastKey);
  }

  /**
   * Persists a newly generated brain (or marks the cached one as used) and returns its row id.
   * `sourceUrl` is the campaign's landing page (the preload key), which may differ from brain.source_url
   * after redirects.
   */
  async persist(db: OutreachDb, sourceUrl: string, language: string): Promise<{ id: string; cacheKey: string; created: boolean }> {
    const key = this.lastKey;
    if (!key) throw new Error("Campaign Brain cache was not consulted");
    const brain = this.added.get(key) ?? this.stored.get(key)?.brain;
    if (!brain) throw new Error("Campaign Brain missing for cache key");
    const out = await repo.putCampaignBrain(db, {
      cacheKey: key, sourceUrl, language, contentHash: brain.content_hash, version: brain.version, llmName: brain.extracted_by, brain,
    });
    if (this.added.has(key)) {
      this.stored.set(key, { id: out.id, brain });
      this.added.delete(key);
    }
    return { id: out.id, cacheKey: key, created: out.created };
  }
}
