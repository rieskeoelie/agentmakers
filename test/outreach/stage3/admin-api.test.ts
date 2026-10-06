import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROLE_PRIORITY, EnvSchema } from "../../../src/lib/outreach/config.js";
import { matchRole } from "../../../src/lib/outreach/roles.js";
import { CostTracker } from "../../../src/lib/outreach/cost.js";
import { computeFunnel } from "../../../src/lib/outreach/output.js";
import { runProof } from "../../../src/lib/outreach/pipeline.js";
import { adminRepo } from "../../../src/lib/outreach/orchestration/adminRepository.js";
import { createRunWithMode, ownerFilterFor, prospectDetailForActor, reviewActionForActor, reviewQueueForActor, searchProspectsForActor, settingsForActor } from "../../../src/lib/outreach/orchestration/adminService.js";
import type { OutreachError } from "../../../src/lib/outreach/orchestration/db.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import { DEFAULT_WORKER_SETTINGS } from "../../../src/lib/outreach/orchestration/settings.js";
import { RESOLVABLE_REVIEW_REASONS } from "../../../src/lib/outreach/ui/review.js";
import type { ReviewQueueItem } from "../../../src/lib/outreach/ui/types.js";
import { campaign, drain, fixtureContext, fixtureDeps, LANDING, newRun, OTHER, OWNER, PARTNER, prospectsOf, SUPER, type TestDb } from "../stage2/helpers.js";
import { createStage3Db } from "./helpers.js";

// Real Postgres (PGlite) work: generous timeouts so parallel test files under CPU load do not time out.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let t: TestDb;
let runId: string;
let otherRunId: string;
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as OutreachError).code; } };
const params = (o: Record<string, string>) => new URLSearchParams(o);

beforeAll(async () => {
  t = await createStage3Db();
  runId = (await newRun(t.db, { concurrency: 1 })).id;
  await drain(fixtureContext(t.db, { settings: { maxParallel: 1 } }), t);
  // A second account with its own (unstarted) run.
  otherRunId = (await newRun(t.db, { actor: OTHER, start: false })).id;
});
afterAll(async () => { await t.close(); });

describe("runs overview", () => {
  it("funnel counts use exactly the Phase 0 funnel definitions", async () => {
    const cost = new CostTracker("p0", 10);
    const d = fixtureDeps(cost);
    const p0 = computeFunnel(await runProof(campaign(), 20, d.deps, d.brainFetcher));
    const [run] = (await adminRepo.listRunsOverview(t.db, OWNER, null)).filter((r) => r.id === runId);
    expect(run!.funnel).toMatchObject({
      researched: p0.companies_researched, decision_makers: p0.named_decision_makers_found, business_emails: p0.business_emails_found,
      eligible_emails: p0.eligible_emails, ready: p0.ready_messages, total: 10, finished: 10, in_progress: 0, discovered: 15, selected: 10,
    });
    expect(run!.funnel.good_fit + run!.funnel.possible_fit).toBeLessThanOrEqual(run!.funnel.researched);
    expect(run!.funnel.needs_review).toBeGreaterThan(0);
  });

  it("tenant isolation: own runs only; superadmin sees all or narrows with view-as; view-as is ignored for non-superadmins", async () => {
    const mine = (await adminRepo.listRunsOverview(t.db, OWNER, null)).map((r) => r.id);
    expect(mine).toContain(runId);
    expect(mine).not.toContain(otherRunId);
    expect((await adminRepo.listRunsOverview(t.db, OWNER, OTHER.userId)).map((r) => r.id)).not.toContain(otherRunId); // DB ignores the filter
    expect(ownerFilterFor(OWNER, OTHER.userId)).toBeNull();
    const all = (await adminRepo.listRunsOverview(t.db, SUPER, null)).map((r) => r.id);
    expect(all).toEqual(expect.arrayContaining([runId, otherRunId]));
    const narrowed = (await adminRepo.listRunsOverview(t.db, SUPER, ownerFilterFor(SUPER, OTHER.userId))).map((r) => r.id);
    expect(narrowed).toEqual([otherRunId]);
    expect(await code(adminRepo.getRunOverview(t.db, OTHER, runId))).toBe("NOT_FOUND");
  });

  it("run overview lists blocked prospects and recent events", async () => {
    const o = await adminRepo.getRunOverview(t.db, OWNER, runId);
    expect(o.run.status).toBe("COMPLETED");
    expect(o.blocked.map((b) => b.domain)).toContain("tandarts-dewit-zwaag.example");
    expect(o.blocked[0]!.reasons).toContain("DUPLICATE_CONTACT");
    expect(o.recent_events.length).toBeGreaterThan(5);
    expect(o.errors).toEqual([]);
  });
});

describe("new run via the admin service", () => {
  const env = EnvSchema.parse({});
  const body = (o: Record<string, unknown> = {}) => ({ name: "Admin run", campaign: { niche: "tandarts", country: "Netherlands", agentmakers_url: LANDING, limit: 5 }, ...o });

  it("stores the sending mode (default: review before sending); never starts sending", async () => {
    const a = await createRunWithMode(t.db, OWNER, body({ sending_mode: "AUTOPILOT" }), env);
    expect(a.run.sending_mode).toBe("AUTOPILOT");
    const b = await createRunWithMode(t.db, OWNER, body(), env);
    expect((await repo.getRun(t.db, OWNER, b.run.id) as unknown as { sending_mode: string }).sending_mode).toBe("REVIEW_BEFORE_SENDING");
    expect(await code(createRunWithMode(t.db, OWNER, body({ sending_mode: "SEND_NOW" }), env))).toBe("VALIDATION");
  });

  it("keeps the 20-prospect hard limit", async () => {
    expect(await code(createRunWithMode(t.db, OWNER, body({ campaign: { ...body().campaign, limit: 21 } }), env))).toBe("VALIDATION");
    expect((await createRunWithMode(t.db, OWNER, body({ campaign: { ...body().campaign, limit: 20 } }), env)).run.prospect_limit).toBe(20);
    expect(await code(repo.createRun(t.db, { owner: "x", actor: "x", name: "x", campaign: {} as never, prospectLimit: 25, budgetCapEur: 1, concurrency: 1, maxAttempts: 3, idempotencyKey: null }))).toBe("VALIDATION");
  });

  it("partners cannot create runs", async () => {
    expect(await code(createRunWithMode(t.db, PARTNER, body(), env))).toBe("FORBIDDEN");
  });
});

describe("prospect search", () => {
  it("filters by run, fit, status, email status, location and text; paginates server-side", async () => {
    const all = await searchProspectsForActor(t.db, OWNER, params({ run_id: runId, limit: "200" }));
    expect(all.total).toBe(10);
    const page1 = await searchProspectsForActor(t.db, OWNER, params({ run_id: runId, limit: "4", offset: "0" }));
    const page3 = await searchProspectsForActor(t.db, OWNER, params({ run_id: runId, limit: "4", offset: "8" }));
    expect(page1.items).toHaveLength(4);
    expect(page3.items).toHaveLength(2);
    expect(page1.total).toBe(10);
    expect(new Set([...page1.items, ...page3.items].map((i) => i.id)).size).toBe(6);
    const ready = await searchProspectsForActor(t.db, OWNER, params({ status: "READY" }));
    expect(ready.items.every((i) => i.outcome === "READY")).toBe(true);
    expect(ready.total).toBeGreaterThan(0);
    const good = await searchProspectsForActor(t.db, OWNER, params({ fit: "GOOD_FIT" }));
    expect(good.items.every((i) => i.fit === "GOOD_FIT")).toBe(true);
    const eligible = await searchProspectsForActor(t.db, OWNER, params({ email: "eligible" }));
    expect(eligible.items.every((i) => i.eligibility === "ELIGIBLE")).toBe(true);
    const none = await searchProspectsForActor(t.db, OWNER, params({ email: "none" }));
    expect(none.items.every((i) => i.email === null)).toBe(true);
    const q = await searchProspectsForActor(t.db, OWNER, params({ q: "MONDZORG" })); // case-insensitive, name + domain + email + contact
    expect(q.items.map((i) => i.domain).sort()).toEqual(["kliniek-noord.example", "mondzorg-hoorn.example"]);
    const q2 = await searchProspectsForActor(t.db, OWNER, params({ q: "kliniek noord" }));
    expect(q2.items.map((i) => i.domain)).toEqual(["kliniek-noord.example"]);
    const wild = await searchProspectsForActor(t.db, OWNER, params({ q: "%" }));
    expect(wild.total).toBe(0); // no LIKE wildcards
    const [{ city }] = (await t.sql<{ city: string }>("select company->>'city' city from outreach_prospects where owner_user_id = $1 and company->>'city' is not null limit 1", [OWNER.userId])) as [{ city: string }];
    const loc = await searchProspectsForActor(t.db, OWNER, params({ location: city.toUpperCase() }));
    const [expected] = await t.sql<{ n: number }>("select count(*)::int n from outreach_prospects where owner_user_id = $1 and position(lower($2) in lower(coalesce(company->>'city','') || ' ' || coalesce(company->>'region','') || ' ' || coalesce(company->>'address',''))) > 0", [OWNER.userId, city]);
    expect(expected!.n).toBeGreaterThan(0);
    expect(loc.total).toBe(expected!.n);
  });

  it("validates filters and enforces tenant isolation", async () => {
    expect(await code(searchProspectsForActor(t.db, OWNER, params({ run_id: "not-a-uuid" })))).toBe("VALIDATION");
    expect(await code(searchProspectsForActor(t.db, OWNER, params({ status: "SENT" })))).toBe("VALIDATION");
    expect(await code(searchProspectsForActor(t.db, OWNER, params({ limit: "5000" })))).toBe("VALIDATION");
    expect((await searchProspectsForActor(t.db, OTHER, params({}))).total).toBe(0);
    expect((await searchProspectsForActor(t.db, OTHER, params({ run_id: runId }))).total).toBe(0);
    expect((await searchProspectsForActor(t.db, SUPER, params({ run_id: runId }))).total).toBe(10);
    expect((await searchProspectsForActor(t.db, SUPER, params({ view_as: OTHER.userId }))).total).toBe(0);
  });
});

describe("prospect detail", () => {
  it("returns every section, keeps FACT and INFERENCE apart, never exposes the lease token", async () => {
    const id = (await prospectsOf(t, runId)).find((p) => p.domain === "tandartspraktijk-dewit.example")!.id;
    const d = await adminRepo.getProspectDetail(t.db, OWNER, id);
    expect(d.prospect.company_name).toBeTruthy();
    expect(d.prospect.record?.fit?.classification).toBe("GOOD_FIT");
    expect(d.prospect.record?.contact?.email).toBeTruthy();
    expect(d.prospect.record?.email?.body).toBeTruthy();
    expect(d.company_brain?.pages.length).toBeGreaterThan(0);
    const kinds = new Set(d.evidence.map((e) => e.kind));
    expect(kinds).toEqual(new Set(["FACT", "INFERENCE"]));
    expect(d.evidence.filter((e) => e.kind === "FACT").every((e) => e.source_url && e.snippet)).toBe(true);
    expect(d.evidence.filter((e) => e.kind === "INFERENCE").every((e) => !e.source_url)).toBe(true);
    expect(d.provider_calls.length).toBeGreaterThan(0);
    expect(d.events.map((e) => e.type)).toEqual(expect.arrayContaining(["PROSPECT_CLAIMED", "PROSPECT_DONE"]));
    expect(d.run).toMatchObject({ id: runId, niche: "tandarts" });
    expect(JSON.stringify(d)).not.toContain("lease_token");
    expect(await code(adminRepo.getProspectDetail(t.db, OTHER, id))).toBe("NOT_FOUND");
    expect((await adminRepo.getProspectDetail(t.db, SUPER, id)).prospect.id).toBe(id);
  });
});

describe("review", () => {
  it("TypeScript display list equals the database allow-list", async () => {
    const [row] = await t.sql<{ r: string[] }>("select outreach_review_resolvable_reasons() r");
    expect([...row!.r].sort()).toEqual([...RESOLVABLE_REVIEW_REASONS].sort());
  });

  it("queue shows NEEDS_REVIEW prospects with full decision context; tenant-scoped", async () => {
    const q = await reviewQueueForActor(t.db, OWNER, params({}));
    expect(q.total).toBeGreaterThan(0);
    for (const it of q.items) {
      expect(it.outcome_reasons.length).toBeGreaterThan(0);
      expect(Array.isArray(it.blockers)).toBe(true);
      expect(it.email_draft?.body ?? "").not.toBe("");
    }
    expect((await reviewQueueForActor(t.db, OTHER, params({}))).total).toBe(0);
  });

  async function findItem(pred: (i: ReviewQueueItem) => boolean): Promise<ReviewQueueItem | undefined> {
    return (await reviewQueueForActor(t.db, OWNER, params({ limit: "100" }))).items.find(pred);
  }

  it("approves a review-only case → READY, decision persisted", async () => {
    const item = await findItem((i) => i.blockers.length === 0);
    expect(item, "fixture must contain a resolvable review case").toBeDefined();
    const r = await reviewActionForActor(t.db, OWNER, item!.id, { action: "APPROVE", notes: "checked" });
    expect(r).toMatchObject({ ok: true, outcome: "READY" });
    const [row] = await t.sql<{ outcome: string; reasons: string[] }>("select outcome, outcome_reasons reasons from outreach_prospects where id = $1", [item!.id]);
    expect(row!.outcome).toBe("READY");
    expect(row!.reasons[0]).toBe("REVIEW_APPROVED");
    const [dec] = await t.sql<{ decision: string; reviewer_user_id: string; notes: string }>("select decision, reviewer_user_id, notes from outreach_review_decisions where prospect_id = $1", [item!.id]);
    expect(dec).toMatchObject({ decision: "APPROVE", reviewer_user_id: OWNER.userId, notes: "checked" });
    expect(await code(reviewActionForActor(t.db, OWNER, item!.id, { action: "APPROVE" }))).toBe("INVALID_TRANSITION"); // no longer NEEDS_REVIEW
  });

  it("hard prohibitions can never be approved: generic mailbox, invalid email, suppressed contact, copy violation", async () => {
    const pool = (await reviewQueueForActor(t.db, OWNER, params({ limit: "100" }))).items;
    expect(pool.length).toBeGreaterThan(0);
    const target = pool[0]!;
    const refuse = async (setup: string, args: unknown[], expected: string) => {
      await t.sql("update outreach_prospects set outcome = 'NEEDS_REVIEW', outcome_reasons = '[\"NO_VALID_HOOK\"]', email = $2, record = jsonb_set(record, '{email_eligibility,is_generic}', 'false') where id = $1", [target.id, target.email ?? "x@y.example"]);
      if (setup) await t.sql(setup, args);
      const r = await reviewActionForActor(t.db, OWNER, target.id, { action: "APPROVE" });
      expect(r.ok, expected).toBe(false);
      expect(r.blockers, expected).toContain(expected);
      const [row] = await t.sql<{ outcome: string }>("select outcome from outreach_prospects where id = $1", [target.id]);
      expect(row!.outcome).toBe("NEEDS_REVIEW");
    };
    await refuse("update outreach_prospects set record = jsonb_set(record, '{email_eligibility,is_generic}', 'true') where id = $1", [target.id], "GENERIC_ADDRESS_NOT_A_RECIPIENT");
    await refuse("update outreach_prospects set email = 'not-an-email' where id = $1", [target.id], "INVALID_EMAIL");
    await refuse("update outreach_prospects set email = null where id = $1", [target.id], "NO_RECIPIENT");
    await refuse("update outreach_prospects set outcome_reasons = '[\"COPY:UNSUPPORTED_24_7:24/7\"]' where id = $1", [target.id], "COPY:UNSUPPORTED_24_7:24/7");
    await refuse("update outreach_prospects set outcome_reasons = '[\"GENERIC_ADDRESS_NOT_A_RECIPIENT\"]' where id = $1", [target.id], "GENERIC_ADDRESS_NOT_A_RECIPIENT");
    await refuse("update outreach_prospects set outcome_reasons = '[\"SOMETHING_NEW_AND_UNKNOWN\"]' where id = $1", [target.id], "SOMETHING_NEW_AND_UNKNOWN");
    await t.sql("update outreach_prospects set email = 'review-target@kliniek.example' where id = $1", [target.id]);
    await repo.addSuppression(t.db, PARTNER, { global: false, owner: null, kind: "EMAIL", value: "review-target@kliniek.example", reason: "unsubscribe" });
    await refuse("update outreach_prospects set email = 'review-target@kliniek.example' where id = $1", [target.id], "SUPPRESSED_EMAIL:unsubscribe");
    const refused = await t.sql("select 1 from outreach_events where prospect_id = $1 and type = 'REVIEW_APPROVAL_REFUSED'", [target.id]);
    expect(refused.length).toBeGreaterThanOrEqual(7);
    const decisions = await t.sql("select 1 from outreach_review_decisions where prospect_id = $1", [target.id]);
    expect(decisions).toHaveLength(0); // a refused approval is not a decision
  });

  it("an email that is already READY elsewhere cannot be approved again (duplicate contact)", async () => {
    const ready = (await prospectsOf(t, runId)).find((p) => p.outcome === "READY" && p.email)!;
    const item = (await reviewQueueForActor(t.db, OWNER, params({ limit: "100" }))).items[0]!;
    await t.sql("update outreach_prospects set outcome_reasons = '[\"NO_VALID_HOOK\"]', email = $2 where id = $1", [item.id, ready.email]);
    const r = await reviewActionForActor(t.db, OWNER, item.id, { action: "APPROVE" });
    expect(r.ok).toBe(false);
    expect(r.blockers).toContain("DUPLICATE_CONTACT");
  });

  it("reject / exclude company / exclude contact persist decisions, block the prospect and write account suppressions", async () => {
    const ids = (await prospectsOf(t, runId)).filter((p) => p.outcome !== "READY").slice(0, 3).map((p) => p.id);
    await t.sql("update outreach_prospects set outcome = 'NEEDS_REVIEW', queue_state = 'DONE', email = coalesce(email, 'person@' || domain), contact_key = coalesce(contact_key, 'jan jansen@' || domain) where id = any($1::uuid[])", [ids]);
    expect(await reviewActionForActor(t.db, OWNER, ids[0]!, { action: "REJECT", reason: "geen match" })).toMatchObject({ ok: true, outcome: "BLOCKED" });
    expect(await reviewActionForActor(t.db, OWNER, ids[1]!, { action: "EXCLUDE_COMPANY", reason: "klant" })).toMatchObject({ ok: true, outcome: "BLOCKED" });
    expect(await reviewActionForActor(t.db, OWNER, ids[2]!, { action: "EXCLUDE_CONTACT" })).toMatchObject({ ok: true, outcome: "BLOCKED" });
    const decisions = await t.sql<{ decision: string }>("select decision from outreach_review_decisions where prospect_id = any($1::uuid[]) order by created_at", [ids]);
    expect(decisions.map((d) => d.decision)).toEqual(["REJECT", "EXCLUDE_COMPANY", "EXCLUDE_CONTACT"]);
    const sup = await t.sql<{ owner_user_id: string; kind: string; reason: string; source: string }>("select owner_user_id, kind, reason, source from outreach_suppressions where source = 'review' order by kind");
    expect(sup.map((s) => s.kind).sort()).toEqual(["COMPANY", "CONTACT", "DOMAIN", "EMAIL"]);
    expect(sup.every((s) => s.owner_user_id === OWNER.userId && s.reason === "manual_exclusion")).toBe(true);
    const [row] = await t.sql<{ reasons: string[] }>("select outcome_reasons reasons from outreach_prospects where id = $1", [ids[1]]);
    expect(row!.reasons[0]).toBe("EXCLUDED_COMPANY");
  });

  it("validates actions and tenant boundaries", async () => {
    const item = (await reviewQueueForActor(t.db, OWNER, params({ limit: "100" }))).items[0];
    const someId = item?.id ?? (await prospectsOf(t, runId))[0]!.id;
    expect(await code(reviewActionForActor(t.db, OWNER, someId, { action: "SEND" }))).toBe("VALIDATION");
    expect(await code(reviewActionForActor(t.db, OTHER, someId, { action: "REJECT" }))).toBe("NOT_FOUND");
    expect(await code(reviewActionForActor(t.db, OWNER, "nope", { action: "REJECT" }))).toBe("NOT_FOUND");
  });
});

describe("settings", () => {
  it("returns booleans only — never secret values — and is admin-only", () => {
    const env = EnvSchema.parse({ DATAFORSEO_LOGIN: "login-secret-value", DATAFORSEO_PASSWORD: "pw-secret-value", HUNTER_API_KEY: "hunter-secret-value", ANTHROPIC_API_KEY: "sk-ant-secret" });
    const s = settingsForActor(OWNER, env, DEFAULT_WORKER_SETTINGS, "c".repeat(32));
    expect(s.providers).toEqual({ dataforseo: true, hunter: true, anthropic: true, prospeo: false });
    expect(s.worker.cron_secret_configured).toBe(true);
    expect(s.sending).toBe("DISABLED");
    expect(s.hard_max_prospects).toBe(20);
    const json = JSON.stringify(s);
    for (const secret of ["login-secret-value", "pw-secret-value", "hunter-secret-value", "sk-ant-secret", "c".repeat(32)]) expect(json).not.toContain(secret);
    expect(settingsForActor(OWNER, EnvSchema.parse({}), DEFAULT_WORKER_SETTINGS, "short").worker.cron_secret_configured).toBe(false);
    expect(() => settingsForActor(PARTNER, env, DEFAULT_WORKER_SETTINGS, undefined)).toThrow();
  });
});

describe("LOCKED RULE: READY requires a confirmed named person in a Phase 0 decision-maker role", () => {
  type Contact = Record<string, unknown>;
  const roleMatch = (title: string) => { const m = matchRole(title, DEFAULT_ROLE_PRIORITY); expect(m, title).not.toBeNull(); return m; };
  const NAMED: Contact = { name: "Jan de Vries", first_name: "Jan", last_name: "de Vries", source: "website_title", title: "Praktijkhouder", role_match: roleMatch("Praktijkhouder") };
  const NO_PERSON: Contact = { name: null, first_name: null, last_name: null };

  /** An isolated prospect: a clone of a processed fixture prospect under a unique synthetic company/domain, so
   *  blockers come only from what each test sets up (no shared suppressions, duplicates or earlier decisions). */
  let clone = 0;
  async function freshProspect(): Promise<string> {
    clone += 1;
    const rows = await t.sql<{ id: string }>(
      `insert into outreach_prospects (run_id, owner_user_id, position, company_name, domain, company_key, company,
                                       queue_state, current_step, outcome, outcome_reasons, warnings, stages, record, completed_at)
       select run_id, owner_user_id, 1000 + $3, 'Locked Rule ' || $3, $2, 'locked rule ' || $3, company,
              'DONE', 'DONE', 'NEEDS_REVIEW', '[]'::jsonb, warnings, stages, record, now()
         from outreach_prospects where run_id = $1 and record ? 'contact' order by position limit 1
       returning id`, [runId, `locked-rule-${clone}.example`, clone]);
    expect(rows.length, "fixture must contain a processed prospect to clone").toBe(1);
    return rows[0]!.id;
  }

  /** NEEDS_REVIEW with an otherwise clean, review-only business email and the given contact fields. */
  async function setup(id: string, reasons: string[], contact: Contact): Promise<void> {
    await t.sql(
      `update outreach_prospects set queue_state = 'DONE', outcome = 'NEEDS_REVIEW', outcome_reasons = $2::jsonb,
              email = 'jan.locked@' || domain, contact_name = $3::jsonb->>'name', contact_key = 'jan de vries@' || domain,
              record = jsonb_set(jsonb_set(record, '{contact}', coalesce(record->'contact', '{}'::jsonb) || $3::jsonb),
                                 '{email_eligibility}', coalesce(record->'email_eligibility', '{}'::jsonb) || '{"is_generic":false,"eligibility":"REVIEW_ONLY"}'::jsonb)
        where id = $1`, [id, JSON.stringify(reasons), JSON.stringify(contact)]);
  }
  const RESOLVABLE = ["FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL", "EMAIL_NOT_ELIGIBLE:REVIEW_ONLY"];

  const state = async (id: string) => {
    const [row] = await t.sql<{ outcome: string; reasons: string[] }>("select outcome, outcome_reasons reasons from outreach_prospects where id = $1", [id]);
    const refused = await t.sql("select 1 from outreach_events where prospect_id = $1 and type = 'REVIEW_APPROVAL_REFUSED'", [id]);
    const decided = await t.sql("select 1 from outreach_events where prospect_id = $1 and type = 'REVIEW_DECISION'", [id]);
    const decisions = await t.sql("select 1 from outreach_review_decisions where prospect_id = $1", [id]);
    return { outcome: row!.outcome, reasons: row!.reasons, refused: refused.length, decided: decided.length, decisions: decisions.length };
  };
  const UNCHANGED = { outcome: "NEEDS_REVIEW", refused: 1, decided: 0, decisions: 0 };

  /** Approval must be refused with `code`, change nothing, log the refusal; the queue (UI mirror) shows the same blocker. */
  async function expectRefused(contact: Contact, code: string, label: string) {
    const id = await freshProspect();
    await setup(id, RESOLVABLE, contact);
    const queued = (await reviewQueueForActor(t.db, OWNER, params({ limit: "100" }))).items.find((x) => x.id === id)!;
    expect(queued.blockers, label).toContain(code);
    const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" });
    expect(r.ok, label).toBe(false); // the route maps ok:false → HTTP 409 with these blockers
    expect(r.blockers, label).toContain(code);
    expect(await state(id), label).toMatchObject(UNCHANGED);
    expect(await reviewActionForActor(t.db, OWNER, id, { action: "REJECT" }), label).toMatchObject({ ok: true, outcome: "BLOCKED" }); // reject stays possible
    return id;
  }

  it("NO_NAMED_RECIPIENT is not in the resolvable allow-list (database and UI)", async () => {
    const [row] = await t.sql<{ r: string[] }>("select outreach_review_resolvable_reasons() r");
    expect(row!.r).not.toContain("NO_NAMED_RECIPIENT");
    expect(RESOLVABLE_REVIEW_REASONS as readonly string[]).not.toContain("NO_NAMED_RECIPIENT");
  });

  it("NO_NAMED_RECIPIENT reason => approval refused, no READY transition, REVIEW_APPROVAL_REFUSED logged", async () => {
    const id = await freshProspect();
    await setup(id, ["NO_NAMED_RECIPIENT", "FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL"], NAMED);
    const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE", notes: "override attempt" });
    expect(r).toMatchObject({ ok: false, blockers: ["NO_NAMED_RECIPIENT"] });
    expect(await state(id)).toEqual({ ...UNCHANGED, reasons: ["NO_NAMED_RECIPIENT", "FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL"] });
  });

  it("missing name / missing contact source => cannot approve", async () => {
    await expectRefused({ ...NAMED, ...NO_PERSON }, "NO_NAMED_RECIPIENT", "no person");
    await expectRefused({ ...NAMED, first_name: null }, "NO_NAMED_RECIPIENT", "no first name");
    await expectRefused({ ...NAMED, last_name: "" }, "NO_NAMED_RECIPIENT", "no last name");
    await expectRefused({ ...NAMED, name: "  " }, "NO_NAMED_RECIPIENT", "blank name");
    await expectRefused({ ...NAMED, source: "none" }, "CONTACT_SOURCE_UNKNOWN", "source none");
    await expectRefused({ ...NAMED, source: null }, "CONTACT_SOURCE_UNKNOWN", "source missing");
  });

  it("1: named person + no role => cannot approve", async () => {
    await expectRefused({ ...NAMED, title: null, role_match: null }, "NO_DECISION_MAKER_ROLE", "title null");
    await expectRefused({ ...NAMED, title: "   ", role_match: null }, "NO_DECISION_MAKER_ROLE", "title blank");
  });

  it("2: named person + non-decision role => cannot approve (Phase 0 matchRole decides, incl. negative modifiers)", async () => {
    for (const title of ["Mondhygiënist", "Receptioniste", "Tandartsassistente", "Assistent praktijkmanager", "Junior office manager", "Voormalig eigenaar", "Marketing medewerker"]) {
      expect(matchRole(title, DEFAULT_ROLE_PRIORITY), title).toBeNull(); // sanity: Phase 0 rejects it too
      // even when a (forged/stale) stored role_match claims otherwise, the server re-check refuses
      await expectRefused({ ...NAMED, title, role_match: { rank: 0, matched_role: "owner", matched_text: "owner" } }, "ROLE_NOT_DECISION_MAKER", title);
    }
    // valid-looking title but Phase 0 never confirmed the role (e.g. Hunter seniority metadata fallback: role_match null)
    await expectRefused({ ...NAMED, source: "hunter_metadata", role_match: null }, "ROLE_NOT_DECISION_MAKER", "unconfirmed role_match");
  });

  it("3: named person + valid Phase 0 decision-maker role + resolvable review reasons => can approve into READY", async () => {
    for (const title of ["Praktijkhouder", "Eigenaar", "Directeur", "Praktijkmanager", "Office manager", "Oprichter", "Managing Partner"]) {
      const id = await freshProspect();
      await setup(id, [...RESOLVABLE, "HOOK_LEVEL_B_REVIEW", "NO_VALID_HOOK"], { ...NAMED, title, role_match: roleMatch(title) });
      const queued = (await reviewQueueForActor(t.db, OWNER, params({ limit: "100" }))).items.find((x) => x.id === id)!;
      expect(queued.blockers, title).toEqual([]);
      expect((await prospectDetailForActor(t.db, OWNER, id)).review_blockers, title).toEqual([]);
      const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE", notes: "beslisser bevestigd" });
      expect(r, title).toMatchObject({ ok: true, outcome: "READY" });
      const s = await state(id);
      expect(s, title).toMatchObject({ outcome: "READY", refused: 0, decided: 1, decisions: 1 });
      expect(s.reasons[0]).toBe("REVIEW_APPROVED");
      const [dec] = await t.sql<{ snapshot: { role_check: { qualified: boolean; title: string } } }>("select snapshot from outreach_review_decisions where prospect_id = $1", [id]);
      expect(dec!.snapshot.role_check).toMatchObject({ qualified: true, title });
    }
  });

  it("4: role text alone without a confirmed named person => cannot approve", async () => {
    await expectRefused({ ...NO_PERSON, title: "Eigenaar", role_match: roleMatch("Eigenaar") }, "NO_NAMED_RECIPIENT", "role only");
    await expectRefused({ ...NO_PERSON, name: "Praktijkhouder", title: "Praktijkhouder", role_match: roleMatch("Praktijkhouder") }, "NO_NAMED_RECIPIENT", "role as name");
    await expectRefused({ ...NAMED, source: "none" }, "CONTACT_SOURCE_UNKNOWN", "named role, no source");
  });

  it("5: the server/database is authoritative — frontend-style bypass attempts are refused", async () => {
    // (a) Request body cannot inject a role verdict: the schema strips unknown fields; the verdict comes from the stored title.
    const a = await freshProspect();
    await setup(a, RESOLVABLE, { ...NAMED, title: "Receptioniste" });
    const ra = await reviewActionForActor(t.db, OWNER, a, { action: "APPROVE", role_check: { title: "Receptioniste", qualified: true }, qualified: true, blockers: [] });
    expect(ra).toMatchObject({ ok: false, blockers: ["ROLE_NOT_DECISION_MAKER"] });
    expect(await state(a)).toMatchObject(UNCHANGED);

    // (b) Calling the database function directly without the server's role verdict is refused.
    const b = await freshProspect();
    await setup(b, RESOLVABLE, NAMED);
    const rb = await t.db.rpc<{ ok: boolean; blockers: string[] }>("outreach_review_action", { p_prospect_id: b, p_actor: OWNER.userId, p_is_superadmin: false, p_action: "APPROVE", p_reason: null, p_notes: null });
    expect(rb).toMatchObject({ ok: false, blockers: ["ROLE_NOT_VERIFIED"] });
    expect(await state(b)).toMatchObject(UNCHANGED);

    // (c) A forged "qualified" verdict for a different title than the stored one is refused.
    const c = await freshProspect();
    await setup(c, RESOLVABLE, { ...NAMED, title: "Receptioniste" });
    const rc = await t.db.rpc<{ ok: boolean; blockers: string[] }>("outreach_review_action", {
      p_prospect_id: c, p_actor: OWNER.userId, p_is_superadmin: false, p_action: "APPROVE", p_reason: null, p_notes: null,
      p_role_check: { title: "Eigenaar", qualified: true, matched_role: "owner" } });
    expect(rc.ok).toBe(false);
    expect(rc.blockers).toContain("ROLE_NOT_VERIFIED");
    expect(await state(c)).toMatchObject(UNCHANGED);

    // (d) A forged "qualified" verdict cannot override the stored Phase 0 role result, nor a missing named person.
    const d = await freshProspect();
    await setup(d, RESOLVABLE, { ...NAMED, role_match: null });
    const rd = await t.db.rpc<{ ok: boolean; blockers: string[] }>("outreach_review_action", {
      p_prospect_id: d, p_actor: OWNER.userId, p_is_superadmin: false, p_action: "APPROVE", p_reason: null, p_notes: null,
      p_role_check: { title: "Praktijkhouder", qualified: true, matched_role: "practice owner" } });
    expect(rd).toMatchObject({ ok: false, blockers: ["ROLE_NOT_DECISION_MAKER"] });
    const e = await freshProspect();
    await setup(e, RESOLVABLE, { ...NAMED, ...NO_PERSON });
    const re = await t.db.rpc<{ ok: boolean; blockers: string[] }>("outreach_review_action", {
      p_prospect_id: e, p_actor: OWNER.userId, p_is_superadmin: false, p_action: "APPROVE", p_reason: null, p_notes: null,
      p_role_check: { title: "Praktijkhouder", qualified: true, matched_role: "practice owner" } });
    expect(re).toMatchObject({ ok: false, blockers: ["NO_NAMED_RECIPIENT"] });
    for (const id of [d, e]) expect(await state(id)).toMatchObject(UNCHANGED);

    // (e) Another account cannot even read the role input or act on the prospect.
    expect(await code(reviewActionForActor(t.db, OTHER, b, { action: "APPROVE" }))).toBe("NOT_FOUND");
  });

  it("existing hard blockers remain blocked even with a confirmed named decision maker", async () => {
    const hard: Array<[string, string]> = [
      ["GENERIC_ADDRESS_NOT_A_RECIPIENT", "update outreach_prospects set record = jsonb_set(record, '{email_eligibility,is_generic}', 'true') where id = $1"],
      ["EMAIL_NOT_ELIGIBLE:NOT_ELIGIBLE", "update outreach_prospects set record = jsonb_set(record, '{email_eligibility,eligibility}', '\"NOT_ELIGIBLE\"') where id = $1"],
      ["INVALID_EMAIL", "update outreach_prospects set email = 'not-an-email' where id = $1"],
      ["NO_RECIPIENT", "update outreach_prospects set email = null where id = $1"],
      ["COPY:UNSUPPORTED_24_7:24/7", "update outreach_prospects set outcome_reasons = '[\"COPY:UNSUPPORTED_24_7:24/7\"]' where id = $1"],
      ["SOMETHING_NEW_AND_UNKNOWN", "update outreach_prospects set outcome_reasons = '[\"SOMETHING_NEW_AND_UNKNOWN\"]' where id = $1"],
    ];
    for (const [expected, sql] of hard) {
      const id = await freshProspect();
      await setup(id, ["NO_VALID_HOOK"], NAMED);
      await t.sql(sql, [id]);
      const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" });
      expect(r.ok, expected).toBe(false);
      expect(r.blockers, expected).toEqual([expected]);
      expect(await state(id), expected).toMatchObject(UNCHANGED);
    }
    const sup = await freshProspect();
    await setup(sup, ["NO_VALID_HOOK"], NAMED);
    const [{ email }] = (await t.sql<{ email: string }>("select email from outreach_prospects where id = $1", [sup])) as [{ email: string }];
    await repo.addSuppression(t.db, PARTNER, { global: false, owner: null, kind: "EMAIL", value: email, reason: "unsubscribe" });
    expect(await reviewActionForActor(t.db, OWNER, sup, { action: "APPROVE" })).toMatchObject({ ok: false, blockers: ["SUPPRESSED_EMAIL:unsubscribe"] });
    expect(await state(sup)).toMatchObject(UNCHANGED);
    const ready = (await prospectsOf(t, runId)).find((p) => p.outcome === "READY" && p.email)!;
    const dup = await freshProspect();
    await setup(dup, ["NO_VALID_HOOK"], NAMED);
    await t.sql("update outreach_prospects set email = $2 where id = $1", [dup, ready.email]);
    const rd = await reviewActionForActor(t.db, OWNER, dup, { action: "APPROVE" });
    expect(rd.ok).toBe(false);
    expect(rd.blockers).toContain("DUPLICATE_CONTACT");
    expect(await state(dup)).toMatchObject(UNCHANGED);
  });
});
