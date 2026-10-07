import { createHash, randomUUID } from "node:crypto";
import type { CostTracker, ProviderCall } from "../cost";
import type { LLMProvider, StructuredRequest } from "../providers/anthropic";
import type { CompanyDiscoveryProvider, PublicSearchProvider } from "../providers/dataforseo";
import type { ContactProvider } from "../providers/hunter";
import type { EmailFallbackProvider } from "../providers/prospeo";
import type { RegistrySource } from "../registry";
import type { PageFetcher } from "../research";
import type { OutreachDb } from "./db";
import { repo, type JournalEntry } from "./repository";
import { stepForCall, stepRank, type PipelineStep } from "./states";

/**
 * Durable call journal ("record once, replay on retry").
 *
 * Every PAID provider call made by the Phase 0 engine goes through a wrapper. The first time a call completes,
 * its result is stored in outreach_call_journal together with the cost records it produced (ledger). If the job
 * is retried — crash, timeout, duplicate execution — the same call (same provider, method, arguments and
 * occurrence) returns the stored result without contacting the provider again, so completed paid work is never
 * repeated and never billed twice. Failed calls are not journaled, so they are retried.
 *
 * Free website fetches are not journaled (page bodies can be megabytes); they are re-fetched on retry.
 */

type Persisted = { v: unknown } | { u: true };

function stable(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => (v === undefined || typeof v === "function" ? null : stable(v)));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined || typeof v === "function") continue;
    out[k] = stable(v);
  }
  return out;
}

export function hashArgs(args: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(stable(args))).digest("hex").slice(0, 32);
}

export interface CallRecorderOptions {
  db: OutreachDb;
  runId: string;
  /** null for run-level (setup) work. */
  prospectId: string | null;
  leaseToken: string;
  cost: CostTracker;
  /** Journal already stored for this scope (from outreach_get_journal). */
  journal: Record<string, unknown>;
}

export class CallRecorder {
  private readonly replay: Map<string, Persisted>;
  private readonly occurrences = new Map<string, number>();
  private readonly ids = new WeakMap<ProviderCall, string>();
  private persistedCalls = 0;
  private chain: Promise<void> = Promise.resolve();
  private step: PipelineStep | null = null;
  readonly stats = { replayed: 0, live: 0 };

  constructor(private readonly o: CallRecorderOptions) {
    this.replay = new Map(Object.entries(o.journal) as Array<[string, Persisted]>);
  }

  private nextKey(provider: string, method: string, args: unknown[]): string {
    const base = `${provider}.${method}:${hashArgs(args)}`;
    const n = (this.occurrences.get(base) ?? 0) + 1;
    this.occurrences.set(base, n);
    return `${base}#${n}`;
  }

  private idFor(c: ProviderCall): string {
    let id = this.ids.get(c);
    if (!id) {
      id = randomUUID();
      this.ids.set(c, id);
    }
    return id;
  }

  /** Persists new ledger rows (+ optional journal entries / step) in order; safe to call repeatedly. */
  persist(journal: JournalEntry[] = [], step: PipelineStep | null = null): Promise<void> {
    const run = async () => {
      const fresh = this.o.cost.calls.slice(this.persistedCalls);
      if (!fresh.length && !journal.length && !step) return;
      await repo.recordCalls(this.o.db, {
        runId: this.o.runId, prospectId: this.o.prospectId, leaseToken: this.o.leaseToken,
        calls: fresh.map((c) => ({ ...c, id: this.idFor(c) })), journal, step,
      });
      this.persistedCalls += fresh.length;
    };
    const p = this.chain.then(run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** Advances the live progress marker (prospect jobs only; never moves backwards). */
  async advance(step: PipelineStep | null): Promise<void> {
    if (!step || !this.o.prospectId) return;
    if (this.step && stepRank(step) <= stepRank(this.step)) return;
    this.step = step;
    await this.persist([], step);
  }

  async call<T>(provider: string, method: string, args: unknown[], invoke: () => Promise<T>, revive?: (v: unknown) => T): Promise<T> {
    const key = this.nextKey(provider, method, args);
    await this.advance(stepForCall(provider, method));
    const hit = this.replay.get(key);
    if (hit) {
      this.stats.replayed++;
      if ("u" in hit) return undefined as T;
      return revive ? revive(hit.v) : (hit.v as T);
    }
    const out = await invoke();
    this.stats.live++;
    const result: Persisted = out === undefined ? { u: true } : { v: out };
    await this.persist([{ key, result }]);
    return out;
  }

  // ─── Provider wrappers (same interfaces the engine already uses) ───────────
  contactProvider(p: ContactProvider): ContactProvider {
    return {
      domainSearch: (domain, prospect) => this.call("hunter", "domainSearch", [domain, prospect], () => p.domainSearch(domain, prospect)),
      emailFinder: (domain, first, last, prospect) =>
        this.call("hunter", "emailFinder", [domain, first, last, prospect], () => p.emailFinder(domain, first, last, prospect)),
      verify: (email, prospect) => this.call("hunter", "verify", [email, prospect], () => p.verify(email, prospect)),
    };
  }

  emailFallback(p: EmailFallbackProvider): EmailFallbackProvider {
    return { enrichPerson: (req, prospect) => this.call("prospeo", "enrichPerson", [req, prospect], () => p.enrichPerson(req, prospect)) };
  }

  /** Official registry source (extension point): lookups are journaled like every other paid provider call. */
  registry(p: RegistrySource): RegistrySource {
    return { name: p.name, lookup: (input, prospect) => this.call("registry", "lookup", [input, prospect], () => p.lookup(input, prospect)) };
  }

  publicSearch(p: PublicSearchProvider): PublicSearchProvider {
    return { search: (keyword, prospect, q) => this.call("publicSearch", "search", [keyword, prospect, q], () => p.search(keyword, prospect, q)) };
  }

  discovery(p: CompanyDiscoveryProvider): CompanyDiscoveryProvider {
    return { discover: (q) => this.call("discovery", "discover", [q], () => p.discover(q)) };
  }

  llm(p: LLMProvider): LLMProvider {
    return {
      name: p.name,
      structured: <T>(req: StructuredRequest<T>) => {
        const { schema, ...keyed } = req;
        return this.call<T>("llm", req.task, [keyed], () => p.structured(req), (v) => schema.parse(v));
      },
    };
  }
}

export type CapturedPage = { ok: { finalUrl: string; body: string; fetchedAt: string } } | { err: Error };

/**
 * Passes website fetches through unchanged and remembers the responses, so the Company Brain (evidence) can be
 * re-derived after the pipeline without fetching again.
 */
export function capturingFetcher(inner: PageFetcher, store: Map<string, CapturedPage>): PageFetcher {
  const wrap = (kind: string, fn: (url: string) => Promise<{ finalUrl: string; body: string; fetchedAt: string }>) => async (url: string) => {
    try {
      const r = await fn(url);
      store.set(`${kind}:${url}`, { ok: r });
      return r;
    } catch (e) {
      store.set(`${kind}:${url}`, { err: e as Error });
      throw e;
    }
  };
  const f: PageFetcher = { fetch: wrap("page", (u) => inner.fetch(u)) };
  if (inner.fetchResource) {
    const res = inner.fetchResource.bind(inner);
    f.fetchResource = wrap("resource", (u) => res(u));
  }
  return f;
}

/** Serves only previously captured responses (no network). */
export function replayFetcher(store: Map<string, CapturedPage>): PageFetcher {
  const get = (kind: string) => async (url: string) => {
    const hit = store.get(`${kind}:${url}`);
    if (!hit) throw new Error(`NOT_CAPTURED: ${url}`);
    if ("err" in hit) throw hit.err;
    return hit.ok;
  };
  return { fetch: get("page"), fetchResource: get("resource") };
}
