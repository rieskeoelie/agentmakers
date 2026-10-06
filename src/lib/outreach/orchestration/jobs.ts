import { buildCampaignBrain } from "../brain";
import { CampaignInputSchema, HARD_MAX_PROSPECTS } from "../config";
import { CostTracker } from "../cost";
import { dedupe, rootDomain } from "../domain";
import { prefilter, processProspect, type PipelineDeps, type ProspectRecord } from "../pipeline";
import type { DiscoveredCompany } from "../providers/dataforseo";
import { extractEvidence, fetchWebsite, type PageFetcher } from "../research";
import type { OutreachDb } from "./db";
import { CallRecorder, capturingFetcher, replayFetcher, type CapturedPage } from "./journal";
import { DbBrainCache } from "./brainStore";
import { companyKey, contactKey, normalizeEmail } from "./normalize";
import { repo, type Ack, type ClaimedProspect, type ClaimedSetup, type ProspectResult, type SetupProspect } from "./repository";
import type { WorkerSettings } from "./settings";

/** Provider dependencies for one job, bound to that job's own CostTracker. */
export interface JobDeps {
  deps: PipelineDeps;
  brainFetcher: PageFetcher;
}

export interface WorkerContext {
  db: OutreachDb;
  /** Real providers in production (adapter.createLiveDeps), fixtures in tests. */
  makeDeps: (cost: CostTracker) => JobDeps;
  settings: WorkerSettings;
  workerId: string;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

const isBudgetError = (e: unknown) => (e as Error | undefined)?.name === "BudgetExceededError";
const errMessage = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 1000);

// ─── Setup job: Campaign Brain → DISCOVER → DEDUPE → PREFILTER → create prospects ─────────────────
export async function runSetupJob(ctx: WorkerContext, job: ClaimedSetup): Promise<Ack> {
  const { db } = ctx;
  const { run, lease_token } = job;
  const campaign = CampaignInputSchema.parse(run.campaign);
  const cost = new CostTracker(run.id, job.reservation_eur);
  const { deps, brainFetcher } = ctx.makeDeps(cost);
  const rec = new CallRecorder({ db, runId: run.id, prospectId: null, leaseToken: lease_token, cost, journal: await repo.getJournal(db, run.id) });
  try {
    const cache = await DbBrainCache.load(db, campaign.agentmakers_url, campaign.language);
    const brain = await buildCampaignBrain(campaign.agentmakers_url, campaign.language, brainFetcher, rec.llm(deps.llm), cache);
    const reused = cache.wasHit;
    const stored = await cache.persist(db, campaign.agentmakers_url, campaign.language);

    const found = await rec.discovery(deps.discovery).discover({
      niche: campaign.niche, country: campaign.country, region: campaign.region, language: campaign.language, depth: 100,
    });
    await rec.persist();

    // Identical to Phase 0 runProof: dedupe → prefilter → hard cap.
    const { kept: unique, duplicates } = dedupe(found);
    const { kept, rejected } = prefilter(unique, campaign, brain);
    const selected = kept.slice(0, Math.min(run.prospect_limit, HARD_MAX_PROSPECTS));
    const prospects: SetupProspect[] = [];
    selected.forEach((c: DiscoveredCompany, i) => {
      const domain = rootDomain(c.domain);
      if (domain) prospects.push({ position: i + 1, company_name: c.company_name, domain, company_key: companyKey(c.company_name), company: c });
    });
    const summary = {
      returned: found.length,
      duplicates: duplicates.map((d) => ({ company_name: d.item.company_name, key: d.key })),
      prefilter_rejected: rejected,
      selected: selected.length,
      campaign_brain: { cache_key: stored.cacheKey, reused, version: brain.version },
    };
    return await repo.completeSetup(db, { runId: run.id, leaseToken: lease_token, campaignBrainId: stored.id, campaignBrain: brain, summary, prospects });
  } catch (e) {
    await rec.persist().catch(() => undefined);
    if (isBudgetError(e)) return repo.deferSetupForBudget(db, run.id, lease_token, ctx.settings.minReservationEur);
    return repo.failSetup(db, run.id, lease_token, errMessage(e), true);
  }
}

// ─── Prospect job: RESEARCH → COMPANY_BRAIN → FIT → DECISION_MAKER → EMAIL → ELIGIBILITY → PERSONALIZATION ──
export async function runProspectJob(ctx: WorkerContext, job: ClaimedProspect): Promise<Ack> {
  const { db } = ctx;
  const { run, prospect, lease_token } = job;
  const brain = run.campaign_brain;
  if (!brain) return repo.failProspect(db, prospect.id, lease_token, "RUN_HAS_NO_CAMPAIGN_BRAIN", false);
  const campaign = CampaignInputSchema.parse(run.campaign);
  const cost = new CostTracker(run.id, job.reservation_eur);
  const { deps: base } = ctx.makeDeps(cost);
  const rec = new CallRecorder({ db, runId: run.id, prospectId: prospect.id, leaseToken: lease_token, cost, journal: await repo.getJournal(db, prospect.id) });
  const pages = new Map<string, CapturedPage>();
  const deps: PipelineDeps = {
    ...base,
    hunter: rec.contactProvider(base.hunter),
    llm: rec.llm(base.llm),
    prospeo: base.prospeo ? rec.emailFallback(base.prospeo) : undefined,
    publicSearch: base.publicSearch ? rec.publicSearch(base.publicSearch) : undefined,
    websiteFetcher: capturingFetcher(base.websiteFetcher, pages),
    cost,
    brainCache: undefined,
  };

  let record: ProspectRecord;
  try {
    record = await processProspect(prospect.company, prospect.position, campaign, brain, deps);
  } finally {
    await rec.persist();
  }

  if (record.status === "FAILED") {
    if (record.status_reasons.some((r) => r.includes("BUDGET_EXCEEDED"))) {
      return repo.deferProspectForBudget(db, prospect.id, lease_token, ctx.settings.minReservationEur);
    }
    const final = toResult(record, null);
    return repo.failProspect(db, prospect.id, lease_token, record.status_reasons[0] ?? "FAILED", true, final);
  }

  const brainData = await deriveCompanyBrain(prospect.company, record, pages, base.settings).catch((e) => {
    ctx.log?.("company brain derivation failed", { prospect: prospect.id, error: errMessage(e) });
    return null;
  });
  return repo.completeProspect(db, prospect.id, lease_token, toResult(record, brainData));
}

export function toResult(record: ProspectRecord, brainData: { company_brain: unknown; evidence: unknown[] } | null): ProspectResult {
  return {
    outcome: record.status,
    reasons: record.status_reasons,
    warnings: record.warnings,
    email: normalizeEmail(record.contact?.email),
    contact_name: record.contact?.name ?? null,
    contact_key: contactKey(record.contact?.name, record.domain),
    stages: record.stages,
    record,
    company_brain: brainData?.company_brain ?? null,
    evidence: brainData?.evidence ?? [],
  };
}

/**
 * Company Brain = the research snapshot (pages, evidence, inferences, fit, brief). Evidence is re-derived with the
 * engine's own fetchWebsite + extractEvidence over the responses captured during the pipeline (no network), so it
 * is available for every researched company, also when no brief was built.
 */
export async function deriveCompanyBrain(
  company: DiscoveredCompany, record: ProspectRecord, pages: Map<string, CapturedPage>, settings: PipelineDeps["settings"],
): Promise<{ company_brain: unknown; evidence: unknown[] } | null> {
  if (record.stages.website_fetch.status !== "ok") return null;
  const site = await fetchWebsite(company.website ?? `https://${company.domain}`, replayFetcher(pages), {
    maxPages: settings.maxPages, maxTextChars: settings.maxTextChars, prospect: record.domain,
  });
  const ev = extractEvidence(site.pages);
  return {
    company_brain: {
      website: record.pages[0]?.url ?? null,
      pages: record.pages,
      fetch_errors: record.fetch_errors,
      quarantined_snippets: record.quarantined_snippets,
      fit: record.fit,
      brief: record.brief,
    },
    evidence: [
      ...ev.observed_facts.map((f) => ({
        kind: "FACT", ref: f.id, signal: f.signal, polarity: f.polarity, strength: f.strength, statement: f.fact,
        snippet: f.snippet, source_url: f.source_url, confidence: f.confidence, data: f,
      })),
      ...ev.inferences.map((i) => ({ kind: "INFERENCE", ref: i.id, statement: i.text, based_on: i.based_on, confidence: i.confidence, data: i })),
    ],
  };
}

export async function safeRunSetup(ctx: WorkerContext, job: ClaimedSetup): Promise<void> {
  try {
    await runSetupJob(ctx, job);
  } catch (e) {
    ctx.log?.("setup job crashed", { run: job.run.id, error: errMessage(e) });
    await repo.failSetup(ctx.db, job.run.id, job.lease_token, errMessage(e), true).catch(() => undefined); // else: lease expiry recovers
  }
}

export async function safeRunProspect(ctx: WorkerContext, job: ClaimedProspect): Promise<void> {
  try {
    await runProspectJob(ctx, job);
  } catch (e) {
    ctx.log?.("prospect job crashed", { prospect: job.prospect.id, error: errMessage(e) });
    await repo.failProspect(ctx.db, job.prospect.id, job.lease_token, errMessage(e), true).catch(() => undefined);
  }
}
