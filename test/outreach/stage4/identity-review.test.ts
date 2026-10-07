/**
 * Human identity review (migration 20261009090000_outreach_identity_review.sql) on real Postgres (PGlite) with every
 * outreach migration applied. Approval = "I accept this person/company identity" — never a send, never a bypass.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prospectDetailForActor, reviewActionForActor, reviewQueueForActor } from "../../../src/lib/outreach/orchestration/adminService.js";
import type { OutreachError } from "../../../src/lib/outreach/orchestration/db.js";
import { repo } from "../../../src/lib/outreach/orchestration/repository.js";
import { runSendTick } from "../../../src/lib/outreach/sending/sender.js";
import { identityApprovalText, reviewApprovability } from "../../../src/lib/outreach/ui/review.js";
import { drain, fixtureContext, newRun, OTHER, OWNER, PARTNER, SUPER, type TestDb } from "../stage2/helpers.js";
import { createStage4Db, FakeSmartlead, sendCtx } from "./helpers.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let t: TestDb;
let pool: Array<{ id: string; domain: string }>;
let next = 0;
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as OutreachError).code; } };
const ROLE = { rank: 0, matched_role: "owner", matched_text: "eigenaar" };
const UNCERTAIN = "Bedrijfsnaam komt sterk overeen, maar identiteit is niet volledig bevestigd.";

type Case = { reasons: string[]; email: string | null; contact: Record<string, unknown>; eligibility: Record<string, unknown> };
const nearMatch = (domain: string, corroboration: string[] = ["SAME_LOCALITY"]): Case => ({
  reasons: ["NEAR_MATCH_IDENTITY_UNCONFIRMED"], email: `joris@${domain}`,
  eligibility: { eligibility: "ELIGIBLE", reasons: [], is_generic: false, is_free_mail: false, domain_matches_company: true },
  contact: {
    name: "Joris Verburg", first_name: "Joris", last_name: "Verburg", title: "Eigenaar", title_source_url: "https://nl.linkedin.com/in/joris-verburg",
    source: "public_search_near_match+hunter_email_finder", identification: "near_match_review", role_match: ROLE, email: `joris@${domain}`,
    near_match: { full_name: "Joris Verburg", organisation: "Garage Verburg B.V", similarity: "STRONG_BUSINESS_NAME_MATCH", corroboration,
      result_url: "https://nl.linkedin.com/in/joris-verburg", evidence: "Joris Verburg - Ondernemer bij Garage Verburg b.v.", uncertainty: UNCERTAIN },
  },
});
const partialOnly = (): Case => ({
  reasons: ["PARTIAL_NAME_MATCH_REVIEW", "DECISION_MAKER_EMAIL_NOT_FOUND"], email: null,
  eligibility: { eligibility: "NOT_ELIGIBLE", reasons: ["NO_EMAIL"], is_generic: false, is_free_mail: false, domain_matches_company: false },
  contact: { name: "Richard", first_name: "Richard", last_name: null, title: "Eigenaar", title_source_url: "https://www.garageklimmert.nl/over-ons",
    source: "website_title", identification: "first_name_only", role_match: ROLE, email: null },
});
const partialHunter = (domain: string): Case => ({
  reasons: ["PARTIAL_NAME_MATCH_REVIEW"], email: `r.devries@${domain}`,
  eligibility: { eligibility: "ELIGIBLE", reasons: [], is_generic: false, is_free_mail: false, domain_matches_company: true },
  contact: { name: "Richard de Vries", first_name: "Richard", last_name: "de Vries", title: "Eigenaar", title_source_url: `https://${domain}/over-ons`,
    source: "website_title+hunter_domain_search", identification: "first_name_hunter_match", role_match: ROLE, email: `r.devries@${domain}` },
});

/** Put a finished fixture prospect into a NEEDS_REVIEW identity case (other prospects keep their own domains). */
async function setup(make: (domain: string) => Case): Promise<{ id: string; domain: string; c: Case }> {
  const p = pool[next++ % pool.length]!;
  const c = make(p.domain);
  await t.sql(`update outreach_prospects set queue_state = 'DONE', outcome = 'NEEDS_REVIEW', outcome_reasons = $2::jsonb, email = $3, contact_name = $4,
                 contact_key = null, record = jsonb_set(jsonb_set(record, '{contact}', $5::jsonb), '{email_eligibility}', $6::jsonb) where id = $1`,
    [p.id, JSON.stringify(c.reasons), c.email, c.contact.name, JSON.stringify(c.contact), JSON.stringify(c.eligibility)]);
  return { ...p, c };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form jsonb assertions in tests
type Json = Record<string, any>;
const row = async (id: string) => (await t.sql<{ outcome: string; outcome_reasons: string[]; record: Json; email: string | null }>(
  "select outcome, outcome_reasons, record, email from outreach_prospects where id = $1", [id]))[0]!;
const decisions = (id: string) => t.sql<{ reviewer_user_id: string; created_at: string; snapshot: Json }>("select reviewer_user_id, created_at, snapshot from outreach_review_decisions where prospect_id = $1", [id]);

beforeAll(async () => {
  t = await createStage4Db();
  const runId = (await newRun(t.db, { concurrency: 1 })).id;
  await drain(fixtureContext(t.db, { settings: { maxParallel: 1 } }), t);
  pool = await t.sql("select id, domain from outreach_prospects where run_id = $1 order by position", [runId]);
});
afterAll(async () => { await t.close(); });
beforeEach(async () => {
  // Isolate cases: no previous approvals' prospects may look like duplicates of the next case.
  await t.sql("update outreach_prospects set outcome = 'BLOCKED' where outcome in ('READY','NEEDS_REVIEW')");
  await t.sql("delete from outreach_suppressions");
  await t.sql("delete from public.leads");
  await t.sql("update outreach_sending_config set sending_enabled = false, autopilot_enabled = false where id = 1");
});

describe("near match", () => {
  it("a corroborated near match is approvable: identity human-approved, normal gates pass → READY; history kept", async () => {
    const { id } = await setup((d) => nearMatch(d));
    const item = (await reviewQueueForActor(t.db, OWNER, new URLSearchParams({ limit: "100" }))).items.find((x) => x.id === id)!;
    expect(item.identity_review).toMatchObject({ reason: "NEAR_MATCH_IDENTITY_UNCONFIRMED", substantiated: true });
    expect(reviewApprovability(item.blockers, item.identity_review)).toMatchObject({ kind: "identity", approvable: true, hard: [], missingAfterApproval: [] });
    const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" });
    expect(r).toMatchObject({ ok: true, outcome: "READY", identity_accepted: true });
    const p = await row(id);
    expect(p.outcome).toBe("READY");
    expect(p.outcome_reasons).toEqual(["REVIEW_APPROVED", "IDENTITY_HUMAN_APPROVED", "NEAR_MATCH_IDENTITY_UNCONFIRMED"]); // machine reason kept
    // Original machine evidence is NOT rewritten: still a near match with the same corroboration.
    expect(p.record.contact).toMatchObject({ identification: "near_match_review", near_match: { similarity: "STRONG_BUSINESS_NAME_MATCH", corroboration: ["SAME_LOCALITY"], uncertainty: UNCERTAIN } });
    expect(p.record.human_identity_approval).toMatchObject({ reviewer_user_id: OWNER.userId, review_reason: "NEAR_MATCH_IDENTITY_UNCONFIRMED", resulting_outcome: "READY",
      candidate: { name: "Joris Verburg" }, evidence: { near_match: { organisation: "Garage Verburg B.V" } } });
    expect(new Date(p.record.human_identity_approval.approved_at).getTime()).toBeGreaterThan(0);
  });

  it("a weak (uncorroborated) near match stays non-approvable, and nothing is recorded", async () => {
    const { id } = await setup((d) => nearMatch(d, []));
    const item = (await reviewQueueForActor(t.db, OWNER, new URLSearchParams({ limit: "100" }))).items.find((x) => x.id === id)!;
    expect(item.blockers).toContain("IDENTITY_REVIEW_NOT_SUBSTANTIATED");
    expect(reviewApprovability(item.blockers, item.identity_review).approvable).toBe(false);
    const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" });
    expect(r).toMatchObject({ ok: false });
    expect((await row(id)).outcome).toBe("NEEDS_REVIEW");
    expect(await decisions(id)).toEqual([]);
  });

  it("an unsubstantiated identity reason (e.g. candidate from another source) is never approvable", async () => {
    const { id } = await setup((d) => ({ ...nearMatch(d), contact: { ...nearMatch(d).contact, source: "public_search+hunter_email_finder" } }));
    expect((await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" })).blockers).toContain("IDENTITY_REVIEW_NOT_SUBSTANTIATED");
  });
});

describe("partial first name", () => {
  it("first-name-only: identity can be accepted, NO surname is created, prospect stays non-READY (missing email)", async () => {
    const { id } = await setup(() => partialOnly());
    const item = (await reviewQueueForActor(t.db, OWNER, new URLSearchParams({ limit: "100" }))).items.find((x) => x.id === id)!;
    const appr = reviewApprovability(item.blockers, item.identity_review);
    expect(appr).toMatchObject({ kind: "identity", approvable: true, hard: [] });
    expect(appr.missingAfterApproval.sort()).toEqual(["DECISION_MAKER_EMAIL_NOT_FOUND", "NO_NAMED_RECIPIENT", "NO_RECIPIENT"]);
    expect(identityApprovalText("Carteam Garagebedrijf Klimmert", item.identity_review!, appr.missingAfterApproval).description).toMatch(/GEEN achternaam.*blijft deze prospect niet-READY.*Er wordt niets verzonden/);
    const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" });
    expect(r).toMatchObject({ ok: true, identity_accepted: true, outcome: "DECISION_MAKER_EMAIL_NOT_FOUND" });
    const p = await row(id);
    expect(p.outcome).not.toBe("READY");
    expect(p.email).toBeNull();
    expect(p.record.contact).toMatchObject({ name: "Richard", last_name: null }); // approval never manufactures a surname
    expect(p.record.human_identity_approval).toMatchObject({ resulting_outcome: "DECISION_MAKER_EMAIL_NOT_FOUND", candidate: { name: "Richard", last_name: null } });
    expect(p.record.human_identity_approval.missing_after_approval.sort()).toEqual(["DECISION_MAKER_EMAIL_NOT_FOUND", "NO_NAMED_RECIPIENT", "NO_RECIPIENT"]);
    expect(p.outcome_reasons).toEqual(["IDENTITY_HUMAN_APPROVED", "PARTIAL_NAME_MATCH_REVIEW", "DECISION_MAKER_EMAIL_NOT_FOUND"]);
  });

  it("first name + one Hunter contact with a verified business email: approved identity progresses normally to READY", async () => {
    const { id } = await setup((d) => partialHunter(d));
    expect(await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" })).toMatchObject({ ok: true, outcome: "READY", identity_accepted: true });
  });
});

describe("approval bypasses nothing", () => {
  it("suppression still blocks", async () => {
    const { id, c } = await setup((d) => nearMatch(d));
    await repo.addSuppression(t.db, OWNER, { global: false, owner: null, kind: "EMAIL", value: c.email!, reason: "unsubscribe" });
    const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" });
    expect(r.ok).toBe(false);
    expect(r.blockers).toContain("SUPPRESSED_EMAIL:unsubscribe");
    expect((await row(id)).outcome).toBe("NEEDS_REVIEW");
  });
  it("suppression also blocks the no-email identity acceptance (company excluded)", async () => {
    const { id, domain } = await setup(() => partialOnly());
    await repo.addSuppression(t.db, OWNER, { global: false, owner: null, kind: "DOMAIN", value: domain, reason: "manual_exclusion" });
    expect((await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" })).blockers).toContain("SUPPRESSED_DOMAIN:manual_exclusion");
  });
  it("duplicate contact (same address already READY elsewhere) still blocks", async () => {
    const a = await setup((d) => nearMatch(d));
    const b = await setup(() => nearMatch(a.domain)); // same person/address on a second prospect
    await t.sql("update outreach_prospects set outcome = 'READY' where id = $1", [a.id]);
    const r = await reviewActionForActor(t.db, OWNER, b.id, { action: "APPROVE" });
    expect(r.ok).toBe(false);
    expect(r.blockers).toContain("DUPLICATE_CONTACT");
  });
  it("an existing CRM lead still blocks at the send gate after an identity approval", async () => {
    const { id, c } = await setup((d) => nearMatch(d));
    expect((await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" })).outcome).toBe("READY");
    await t.sql("insert into public.leads (landing_page_slug, naam, email, telefoon) values ('x', 'Joris', $1, '0')", [c.email]);
    const [g] = await t.sql<{ r: string[] }>("select outreach_send_gate($1) r", [id]);
    expect(g!.r).toContain("EXISTING_CRM_LEAD");
  });
  it("a generic mailbox still blocks", async () => {
    const { id } = await setup((d) => ({ ...nearMatch(d), email: `info@${d}`,
      eligibility: { eligibility: "NOT_ELIGIBLE", reasons: ["GENERIC_ADDRESS_NOT_A_RECIPIENT"], is_generic: true, is_free_mail: false, domain_matches_company: true } }));
    const r = await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" });
    expect(r.ok).toBe(false);
    expect(r.blockers).toEqual(expect.arrayContaining(["GENERIC_ADDRESS_NOT_A_RECIPIENT", "EMAIL_NOT_ELIGIBLE:NOT_ELIGIBLE"]));
  });
  it("sending OFF: an approved identity creates no send and the sender pushes nothing", async () => {
    const { id } = await setup((d) => nearMatch(d));
    expect((await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE" })).outcome).toBe("READY");
    expect(await t.sql("select 1 from outreach_sends where prospect_id = $1", [id])).toEqual([]);
    const fake = new FakeSmartlead();
    const tick = await runSendTick(sendCtx(t, fake), { push: true });
    expect(tick.enabled).toBe(false);
    expect(tick.pushed).toBe(0);
    expect(fake.calls).toEqual([]);
  });
});

describe("audit + tenant isolation", () => {
  it("reviewer, time, candidate, reason, visible evidence and resulting outcome are stored; event says identity accepted", async () => {
    const { id } = await setup((d) => nearMatch(d));
    const before = Date.now();
    await reviewActionForActor(t.db, OWNER, id, { action: "APPROVE", notes: "LinkedIn + KvK nagekeken" });
    const [d] = await decisions(id);
    expect(d!.reviewer_user_id).toBe(OWNER.userId);
    expect(new Date(d!.created_at).getTime()).toBeGreaterThanOrEqual(before - 5_000);
    expect(d!.snapshot).toMatchObject({
      outcome: "NEEDS_REVIEW", outcome_reasons: ["NEAR_MATCH_IDENTITY_UNCONFIRMED"], resulting_outcome: "READY",
      identity_review: { reason: "NEAR_MATCH_IDENTITY_UNCONFIRMED", substantiated: true, candidate: { name: "Joris Verburg", title: "Eigenaar" },
        evidence: { near_match: { corroboration: ["SAME_LOCALITY"], uncertainty: UNCERTAIN } } },
    });
    const [ev] = await t.sql<{ data: Record<string, unknown>; actor: string }>("select data, actor from outreach_events where prospect_id = $1 and type = 'REVIEW_DECISION'", [id]);
    expect(ev).toMatchObject({ actor: OWNER.userId, data: { decision: "APPROVE", outcome: "READY", identity_accepted: true } });
    // Detail view exposes the approval next to (not instead of) the machine record.
    const detail = await prospectDetailForActor(t.db, OWNER, id);
    expect(detail.prospect.record!.contact!.source).toBe("public_search_near_match+hunter_email_finder");
    expect((detail.review_decisions as Array<{ decision: string }>).map((x) => x.decision)).toEqual(["APPROVE"]);
  });
  it("tenant isolation: another account cannot see or approve the identity review; partners cannot approve; superadmin can see it", async () => {
    const { id } = await setup((d) => nearMatch(d));
    expect((await reviewQueueForActor(t.db, OTHER, new URLSearchParams({}))).items.map((x) => x.id)).not.toContain(id);
    expect(await code(reviewActionForActor(t.db, OTHER, id, { action: "APPROVE" }))).toBe("NOT_FOUND");
    expect(await code(prospectDetailForActor(t.db, OTHER, id))).toBe("NOT_FOUND");
    expect(await code(reviewActionForActor(t.db, PARTNER, id, { action: "APPROVE" }))).not.toBe("OK");
    expect((await reviewQueueForActor(t.db, SUPER, new URLSearchParams({ limit: "100" }))).items.map((x) => x.id)).toContain(id);
    expect((await row(id)).outcome).toBe("NEEDS_REVIEW");
  });
  it("identity functions are service_role only", async () => {
    const fns = await t.sql<{ n: string; anon: boolean; auth: boolean; svc: boolean }>(
      `select p.proname n, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth,
              has_function_privilege('service_role', p.oid, 'execute') svc
       from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'
         and p.proname in ('outreach_identity_review','outreach_identity_review_reasons','outreach_missing_recipient_blockers','outreach_review_action','outreach_review_blockers')`);
    expect(fns).toHaveLength(5);
    expect(fns.every((f) => !f.anon && !f.auth && f.svc)).toBe(true);
  });
});
