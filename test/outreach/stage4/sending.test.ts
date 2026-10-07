import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutreachError } from "../../../src/lib/outreach/orchestration/db.js";
import { repo, type Actor } from "../../../src/lib/outreach/orchestration/repository.js";
import { sendRepo } from "../../../src/lib/outreach/sending/repository.js";
import { runSendTick } from "../../../src/lib/outreach/sending/sender.js";
import { cancelSendForActor, inboxActionForActor, queueProspectForActor, queueRunReadyForActor, setSendingConfigForActor } from "../../../src/lib/outreach/sending/service.js";
import { normalizeSmartleadEvent } from "../../../src/lib/outreach/sending/webhook.js";
import { drain, fixtureContext, newRun, OTHER, OWNER, PARTNER, SUPER, type TestDb } from "../stage2/helpers.js";
import { createStage4Db, enableSending, FakeSmartlead, OWNER_UUID, readyProspects, sendCtx } from "./helpers.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let t: TestDb;
let runId: string;
let ready: Array<{ id: string; email: string; domain: string; company_name: string }>;
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as OutreachError).code; } };
const sendOf = async (prospectId: string) => (await t.sql<Record<string, unknown>>("select * from outreach_sends where prospect_id = $1", [prospectId]))[0];
const webhook = (payload: Record<string, unknown>, requestId: string | null = null) =>
  normalizeSmartleadEvent(payload, { requestId, rawBody: JSON.stringify(payload) })!;

beforeAll(async () => {
  t = await createStage4Db();
  runId = (await newRun(t.db, { concurrency: 1 })).id;
  await drain(fixtureContext(t.db, { settings: { maxParallel: 1 } }), t);
  ready = await readyProspects(t, runId);
});
afterAll(async () => { await t.close(); });
beforeEach(async () => {
  await t.sql("delete from outreach_messages");
  await t.sql("delete from outreach_sends");
  await t.sql("delete from outreach_webhook_events");
  await t.sql("delete from outreach_suppressions");
  await t.sql("delete from public.leads");
  await t.sql("update outreach_runs set provider_campaign_id = null, provider_campaign_status = null, provider_lock_until = null, status = 'COMPLETED' where id = $1", [runId]);
  await t.sql("update outreach_sending_config set sending_enabled = false, autopilot_enabled = false, test_recipients = '{}', daily_new_leads_cap = 10, max_pushes_per_tick = 5 where id = 1");
});

describe("security", () => {
  it("new tables and functions are service_role only (RLS on, no anon/authenticated privileges)", async () => {
    const tables = ["outreach_sending_config", "outreach_audit_log", "outreach_sends", "outreach_messages", "outreach_webhook_events"];
    for (const tb of tables) {
      const [row] = await t.sql<{ rls: boolean; anon: boolean; auth: boolean; svc: boolean }>(
        `select c.relrowsecurity rls, has_table_privilege('anon', c.oid, 'select') anon, has_table_privilege('authenticated', c.oid, 'select') auth,
                has_table_privilege('service_role', c.oid, 'select') svc from pg_class c where c.relname = $1`, [tb]);
      expect(row).toEqual({ rls: true, anon: false, auth: false, svc: true });
    }
    const fns = await t.sql<{ n: string; anon: boolean; auth: boolean }>(
      `select p.proname n, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
       from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'outreach\\_%'`);
    expect(fns.length).toBeGreaterThan(70);
    expect(fns.filter((f) => f.anon || f.auth)).toEqual([]);
    const [leads] = await t.sql<{ anon: boolean }>("select has_table_privilege('anon', 'public.leads', 'select') anon");
    expect(leads!.anon).toBe(false);
  });

  it("sending is OFF by default and only a superadmin can enable it; any admin can switch it off", async () => {
    expect((await sendRepo.config(t.db)).sending_enabled).toBe(false);
    expect(await code(setSendingConfigForActor(t.db, OWNER, { sending_enabled: true }))).toBe("FORBIDDEN");
    expect(await code(setSendingConfigForActor(t.db, PARTNER, { sending_enabled: false }))).toBe("FORBIDDEN");
    expect((await setSendingConfigForActor(t.db, SUPER, { sending_enabled: true, test_recipients: ["Me@Example.com"] })).sending_enabled).toBe(true);
    const off = await setSendingConfigForActor(t.db, OWNER, { sending_enabled: false, kill_reason: "panic" });
    expect(off).toMatchObject({ sending_enabled: false, kill_reason: "panic", test_recipients: ["me@example.com"] });
    expect(await code(setSendingConfigForActor(t.db, SUPER, { nope: 1 }))).toBe("VALIDATION");
    const audit = await t.sql<{ action: string; actor: string }>("select action, actor from outreach_audit_log order by id");
    expect(audit.map((a) => a.actor)).toEqual(expect.arrayContaining([SUPER.userId, OWNER.userId]));
  });
});

describe("queue + final gate", () => {
  it("fixture run has READY prospects with business emails", () => {
    expect(ready.length).toBeGreaterThanOrEqual(2);
    expect(ready.every((r) => r.email.includes("@"))).toBe(true);
  });

  it("queues the stored Phase 0 email + 2 follow-ups with an opt-out line; idempotent; tenant-scoped; admin-only", async () => {
    const p = ready[0]!;
    expect(await code(queueProspectForActor(t.db, OTHER, p.id))).toBe("NOT_FOUND");
    expect(await code(queueProspectForActor(t.db, PARTNER, p.id))).toBe("FORBIDDEN");
    const a = await queueProspectForActor(t.db, OWNER, p.id);
    expect(a).toMatchObject({ ok: true, created: true });
    const s = await sendOf(p.id);
    const [rec] = await t.sql<{ subject: string; body: string }>("select record->'email'->>'subject' subject, record->'email'->>'body' body from outreach_prospects where id = $1", [p.id]);
    expect(s!.subject).toBe(rec!.subject);
    expect(String(s!.body).startsWith(rec!.body)).toBe(true);
    expect(String(s!.body)).toContain("stop");
    const seq = s!.sequence as Array<{ step: number; delay_days: number; subject: string; body: string }>;
    expect(seq.map((x) => [x.step, x.delay_days])).toEqual([[1, 0], [2, 3], [3, 4]]);
    expect(seq[1]!.subject).toBe("");
    expect(seq[1]!.body).not.toMatch(/\d/);
    expect(s!.state).toBe("QUEUED");
    expect(await queueProspectForActor(t.db, OWNER, p.id)).toMatchObject({ ok: true, created: false });
    expect((await t.sql("select 1 from outreach_sends")).length).toBe(1);
  });

  it("refuses suppressed, previously contacted (global, cross-account) and existing-CRM prospects", async () => {
    const [a, b] = ready;
    await repo.addSuppression(t.db, OWNER, { global: false, owner: null, kind: "EMAIL", value: a!.email, reason: "do_not_contact" });
    expect(await queueProspectForActor(t.db, OWNER, a!.id)).toMatchObject({ ok: false, blockers: ["SUPPRESSED_EMAIL:do_not_contact"] });
    await t.sql("insert into public.leads (landing_page_slug, naam, email, telefoon) values ('x', 'X', $1, '')", [b!.email.toUpperCase()]);
    expect((await queueProspectForActor(t.db, OWNER, b!.id)).blockers).toContain("EXISTING_CRM_LEAD");
    // The same address queued from another account's prospect counts as already contacted (global dedupe).
    await t.sql("delete from public.leads");
    const other = await newRun(t.db, { actor: OTHER, start: false });
    const otherProspect = (await t.sql<{ id: string }>(
      `insert into outreach_prospects (run_id, owner_user_id, position, company_name, domain, company_key, company, queue_state, outcome, email, record)
       select $1, $2, 1, company_name, 'other-' || domain, company_key, company, 'DONE', 'READY', email, record from outreach_prospects where id = $3 returning id`,
      [other.id, OTHER.userId, b!.id]))[0]!.id;
    await t.sql("update outreach_runs set status = 'COMPLETED' where id = $1", [other.id]);
    expect(await queueProspectForActor(t.db, OTHER, otherProspect)).toMatchObject({ ok: true, created: true });
    expect((await queueProspectForActor(t.db, OWNER, b!.id)).blockers).toContain("ALREADY_CONTACTED_EMAIL");
    await t.sql("delete from outreach_runs where id = $1", [other.id]);
  });

  it("not-READY prospects and stopped runs are refused", async () => {
    const [nr] = await t.sql<{ id: string }>("select id from outreach_prospects where run_id = $1 and outcome <> 'READY' limit 1", [runId]);
    expect((await queueProspectForActor(t.db, OWNER, nr!.id)).ok).toBe(false);
    await t.sql("update outreach_runs set status = 'STOPPED' where id = $1", [runId]);
    expect((await queueProspectForActor(t.db, OWNER, ready[0]!.id)).blockers).toContain("RUN_STOPPED");
  });

  it("queue-all for a run queues every gate-passing READY prospect; cancel only while QUEUED", async () => {
    const res = await queueRunReadyForActor(t.db, OWNER, runId);
    expect(res.queued).toBe(ready.length);
    const s = await sendOf(ready[0]!.id);
    expect((await cancelSendForActor(t.db, OWNER, String(s!.id), { reason: "changed my mind" })).state).toBe("CANCELLED");
    expect(await code(cancelSendForActor(t.db, OWNER, String(s!.id), {}))).toBe("INVALID_TRANSITION");
    // A cancelled send can be queued again (it was never pushed).
    expect(await queueProspectForActor(t.db, OWNER, ready[0]!.id)).toMatchObject({ ok: true, created: true });
  });
});

describe("push (fake Smartlead — nothing leaves the process)", () => {
  it("kill switch off: nothing is claimed or pushed; no provider calls except stop/pause propagation", async () => {
    await queueRunReadyForActor(t.db, OWNER, runId);
    const sl = new FakeSmartlead();
    const r = await runSendTick(sendCtx(t, sl));
    expect(r).toMatchObject({ enabled: false, pushed: 0 });
    expect(sl.count("addLeads")).toBe(0);
    expect(sl.count("createCampaign")).toBe(0);
    // Environment kill switch overrides an enabled database flag.
    await enableSending(t);
    const r2 = await runSendTick(sendCtx(t, sl, { envKill: true }));
    expect(r2.pushed).toBe(0);
    expect(sl.count("addLeads")).toBe(0);
    // No provider configured → nothing either.
    expect((await runSendTick(sendCtx(t, null))).pushed).toBe(0);
  });

  it("enabled: provisions ONE campaign (stop on reply, plain text, no tracking, 3 steps from custom fields) and pushes leads", async () => {
    await queueRunReadyForActor(t.db, OWNER, runId);
    await enableSending(t);
    const sl = new FakeSmartlead();
    const r = await runSendTick(sendCtx(t, sl));
    expect(r.pushed).toBe(ready.length);
    expect(sl.count("createCampaign")).toBe(1);
    const settings = sl.calls.find((c) => c.op === "setSettings")!.args[1];
    expect(settings).toEqual({ unsubscribe_text: "Afmelden" });
    const steps = sl.calls.find((c) => c.op === "setSequences")!.args[1] as Array<{ email_body: string; delay_in_days: number }>;
    expect(steps.map((s) => [s.email_body, s.delay_in_days])).toEqual([["{{am_s1_body}}", 0], ["{{am_s2_body}}", 3], ["{{am_s3_body}}", 4]]);
    expect(sl.calls.find((c) => c.op === "setCampaignStatus")!.args[1]).toBe("START");
    expect(sl.count("createCampaignWebhook")).toBe(1);
    const s = await sendOf(ready[0]!.id);
    expect(s).toMatchObject({ state: "ACTIVE", provider_campaign_id: sl.campaigns[0]!.id });
    const lead = sl.leads.get(ready[0]!.email)!;
    expect(lead.lead.custom_fields.am_s1_subject).toBe(s!.subject);
    expect(lead.lead.custom_fields.am_s1_body).toContain("<p>");
    // Second tick: no new campaign, no duplicate leads.
    await runSendTick(sendCtx(t, sl));
    expect(sl.count("createCampaign")).toBe(1);
    expect(sl.count("addLeads")).toBe(ready.length);
  });

  it("daily cap and test-recipient allowlist are enforced in the claim", async () => {
    await queueRunReadyForActor(t.db, OWNER, runId);
    await enableSending(t, { daily_new_leads_cap: 1 });
    const sl = new FakeSmartlead();
    expect((await runSendTick(sendCtx(t, sl))).pushed).toBe(1);
    expect((await runSendTick(sendCtx(t, sl))).pushed).toBe(0);
    await t.sql("delete from outreach_sends where state <> 'QUEUED'");
    await t.sql("update outreach_sending_config set daily_new_leads_cap = 50, test_recipients = $1 where id = 1", [["nobody@example.org"]]);
    expect((await runSendTick(sendCtx(t, new FakeSmartlead()))).pushed).toBe(0);
    await t.sql("update outreach_sending_config set test_recipients = $1 where id = 1", [[ready[1]!.email]]);
    const sl2 = new FakeSmartlead();
    expect((await runSendTick(sendCtx(t, sl2))).pushed).toBe(1);
    expect([...sl2.leads.keys()]).toEqual([ready[1]!.email]);
  });

  it("FINAL gate at push time: a suppression added after queueing cancels the send instead of pushing it", async () => {
    await queueProspectForActor(t.db, OWNER, ready[0]!.id);
    await repo.addSuppression(t.db, OWNER, { global: true, owner: null, kind: "EMAIL", value: ready[0]!.email, reason: "unsubscribe" });
    await enableSending(t);
    const sl = new FakeSmartlead();
    const r = await runSendTick(sendCtx(t, sl));
    expect(r).toMatchObject({ pushed: 0, cancelledByGate: 1 });
    expect(sl.count("addLeads")).toBe(0);
    expect(await sendOf(ready[0]!.id)).toMatchObject({ state: "CANCELLED", state_reason: "GATE:SUPPRESSED_EMAIL:unsubscribe" });
  });

  it("paused runs are not pushed; provider rejections fail permanently; transient errors retry", async () => {
    await queueProspectForActor(t.db, OWNER, ready[0]!.id);
    await queueProspectForActor(t.db, OWNER, ready[1]!.id);
    await enableSending(t);
    await t.sql("update outreach_runs set status = 'PAUSED' where id = $1", [runId]);
    const sl = new FakeSmartlead();
    expect((await runSendTick(sendCtx(t, sl))).pushed).toBe(0);
    await t.sql("update outreach_runs set status = 'COMPLETED' where id = $1", [runId]);
    sl.blockEmails.add(ready[0]!.email);
    const { SmartleadError } = await import("../../../src/lib/outreach/sending/smartlead.js");
    sl.failNext.findLeadId = new SmartleadError(503, "find_lead", "down", true);
    const r = await runSendTick(sendCtx(t, sl));
    expect(r.pushFailed).toBe(2);
    expect(await sendOf(ready[0]!.id)).toMatchObject({ state: "FAILED" });
    expect(await sendOf(ready[1]!.id)).toMatchObject({ state: "QUEUED", attempts: 1 });
    await t.sql("update outreach_sends set next_attempt_at = now() where state = 'QUEUED'");
    expect((await runSendTick(sendCtx(t, sl))).pushed).toBe(1);
  });

  it("campaign setup errors never fail the send: it stays QUEUED and succeeds once the provider accepts", async () => {
    await queueProspectForActor(t.db, OWNER, ready[0]!.id);
    await enableSending(t);
    const sl = new FakeSmartlead();
    const { SmartleadError } = await import("../../../src/lib/outreach/sending/smartlead.js");
    sl.failNext.setSchedule = new SmartleadError(400, "set_schedule", "bad field", false);
    expect((await runSendTick(sendCtx(t, sl))).pushFailed).toBe(1);
    expect(await sendOf(ready[0]!.id)).toMatchObject({ state: "QUEUED" });
    expect((await t.sql("select provider_campaign_status from outreach_runs where id = $1", [runId]))[0]).toEqual({ provider_campaign_status: "ERROR" });
    await t.sql("update outreach_sends set next_attempt_at = now()");
    expect((await runSendTick(sendCtx(t, sl))).pushed).toBe(1);
    expect(sl.count("createCampaign")).toBe(1); // the existing campaign is re-configured, not duplicated
  });

  it("kill switch OFF pauses every live campaign; ON resumes them", async () => {
    await queueProspectForActor(t.db, OWNER, ready[0]!.id);
    await enableSending(t);
    const sl = new FakeSmartlead();
    await runSendTick(sendCtx(t, sl));
    await setSendingConfigForActor(t.db, OWNER, { sending_enabled: false });
    const off = await runSendTick(sendCtx(t, sl));
    expect(off.campaignsPaused).toBe(1);
    expect(sl.campaigns[0]!.status).toBe("PAUSED");
    await setSendingConfigForActor(t.db, SUPER, { sending_enabled: true });
    expect((await runSendTick(sendCtx(t, sl))).campaignsResumed).toBe(1);
    expect(sl.campaigns[0]!.status).toBe("START");
    // Stopping the run pauses its campaign and stops its live leads at the provider.
    await repo.runAction(t.db, SUPER, runId, "stop").catch(() => undefined);
    await t.sql("update outreach_runs set status = 'STOPPED' where id = $1", [runId]);
    const st = await runSendTick(sendCtx(t, sl));
    expect(st.stopped).toBe(1);
    expect(sl.leads.get(ready[0]!.email)!.paused).toBe(true);
    expect(sl.campaigns[0]!.status).toBe("PAUSED");
  });
});

describe("provider events (webhook + sync)", () => {
  async function pushed() {
    await queueProspectForActor(t.db, OWNER, ready[0]!.id);
    await enableSending(t);
    const sl = new FakeSmartlead();
    await runSendTick(sendCtx(t, sl));
    const s = await sendOf(ready[0]!.id);
    return { sl, s: s!, cid: String(s!.provider_campaign_id), lid: String(s!.provider_lead_id), email: ready[0]!.email };
  }

  it("EMAIL_SENT is recorded once per step; webhook retries are idempotent", async () => {
    const { cid, email } = await pushed();
    const ev = { event_type: "EMAIL_SENT", campaign_id: Number(cid), to_email: email, from_email: "richard@mail.agentmakers.io", sequence_number: 1, message_id: "<m1@sl>", time_sent: "2026-10-08T08:00:00Z" };
    expect(await sendRepo.applyEvent(t.db, webhook(ev, "req-1"))).toMatchObject({ matched: true });
    expect(await sendRepo.applyEvent(t.db, webhook(ev, "req-1"))).toEqual({ duplicate: true });
    expect(await sendRepo.applyEvent(t.db, webhook({ ...ev }, null))).toMatchObject({ matched: true }); // different delivery id, same message
    const msgs = await t.sql("select * from outreach_messages where direction = 'OUTBOUND'");
    expect(msgs.length).toBe(1);
    expect(await sendOf(ready[0]!.id)).toMatchObject({ steps_sent: 1, state: "ACTIVE" });
  });

  it("a reply stops the sequence immediately (provider pause), opens the Inbox thread and is deduped against sync", async () => {
    const { sl, cid, lid, email } = await pushed();
    const ev = webhook({ event_type: "EMAIL_REPLY", campaign_id: cid, from_email: email.toUpperCase(), to_email: "richard@mail.agentmakers.io",
      reply_body: "<p>Klinkt interessant, stuur maar een voorbeeld.</p><p>Op 7 okt schreef Richard:</p><blockquote>oud</blockquote>", time_replied: "2026-10-08T09:00:00Z" }, "r-1");
    const res = await sendRepo.applyEvent(t.db, ev);
    expect(res).toMatchObject({ matched: true, analyze: true, stop: { campaign_id: cid, lead_id: lid } });
    const { stopAtProvider } = await import("../../../src/lib/outreach/sending/sender.js");
    expect(await stopAtProvider(sendCtx(t, sl), { send_id: res.send_id, ...res.stop! }, "REPLY")).toBe(true);
    expect(sl.leads.get(email)!.paused).toBe(true);
    const s = await sendOf(ready[0]!.id);
    expect(s).toMatchObject({ state: "REPLIED", inbox_status: "NEEDS_ACTION" });
    expect(s!.provider_stopped_at).not.toBeNull();
    const [m] = await t.sql<{ body_text: string; analysis_state: string }>("select body_text, analysis_state from outreach_messages where direction = 'INBOUND'");
    expect(m!.body_text).toBe("Klinkt interessant, stuur maar een voorbeeld.");
    expect(m!.analysis_state).toBe("PENDING");
    // The same reply seen by the sync (missed-webhook safety net) is not duplicated.
    sl.history.set(lid, [
      { type: "SENT", stats_id: "s1", message_id: "<m1@sl>", time: "2026-10-08T08:00:00Z", subject: "x", body: "<p>hi</p>", sequence_number: 1, from: null, to: email },
      { type: "REPLY", stats_id: "s2", message_id: "<r1@x>", time: "2026-10-08T09:01:00Z", subject: "Re: x", body: "Klinkt interessant", sequence_number: null, from: email, to: null },
    ]);
    await t.sql("update outreach_sends set last_synced_at = null");
    const { syncWithProvider } = await import("../../../src/lib/outreach/sending/sender.js");
    await syncWithProvider(sendCtx(t, sl), sl);
    expect((await t.sql("select 1 from outreach_messages where direction = 'INBOUND'")).length).toBe(1);
    expect((await t.sql("select 1 from outreach_messages where direction = 'OUTBOUND'")).length).toBe(1);
  });

  it("bounce and unsubscribe become GLOBAL suppressions and stop the lead; unmatched unsubscribes still suppress", async () => {
    const { cid, email } = await pushed();
    await sendRepo.applyEvent(t.db, webhook({ event_type: "EMAIL_BOUNCE", campaign_id: cid, to_email: email }, "b-1"));
    expect(await sendOf(ready[0]!.id)).toMatchObject({ state: "BOUNCED" });
    const sup = await t.sql<{ owner_user_id: string | null; reason: string }>("select owner_user_id, reason from outreach_suppressions where value = $1", [email]);
    expect(sup).toEqual([{ owner_user_id: null, reason: "bounce" }]);
    await sendRepo.applyEvent(t.db, webhook({ event_type: "LEAD_UNSUBSCRIBED", campaign_id: "999", lead_email: "stranger@else.example" }, "u-1"));
    expect((await t.sql("select reason from outreach_suppressions where value = 'stranger@else.example'"))[0]).toEqual({ reason: "unsubscribe" });
    expect((await sendRepo.stopCandidates(t.db)).map((c) => c.email)).toEqual([email]);
  });
});

describe("inbox: tenant isolation, manual reply, promotion", () => {
  async function replied() {
    await queueProspectForActor(t.db, OWNER, ready[0]!.id);
    await enableSending(t);
    const sl = new FakeSmartlead();
    await runSendTick(sendCtx(t, sl));
    const s = await sendOf(ready[0]!.id);
    await sendRepo.applyEvent(t.db, webhook({ event_type: "EMAIL_REPLY", campaign_id: s!.provider_campaign_id, from_email: ready[0]!.email, reply_body: "Wat kost dat?", time_replied: "2026-10-08T09:00:00Z" }, `r-${Math.random()}`));
    sl.history.set(String(s!.provider_lead_id), [{ type: "REPLY", stats_id: "st-9", message_id: "<r@x>", time: "2026-10-08T09:00:00Z", subject: "Re", body: "Wat kost dat?", sequence_number: null, from: ready[0]!.email, to: null }]);
    return { sl, sendId: String(s!.id) };
  }

  it("lists and opens only own conversations; superadmin sees all", async () => {
    const { sendId } = await replied();
    const mine = await sendRepo.inboxList(t.db, OWNER, null, null, null, 50, 0) as { items: Array<{ id: string }>; counts: { needs_action: number } };
    expect(mine.items.map((i) => i.id)).toEqual([sendId]);
    expect(mine.counts.needs_action).toBe(1);
    expect(((await sendRepo.inboxList(t.db, OTHER, null, null, null, 50, 0)) as { items: unknown[] }).items).toEqual([]);
    expect(((await sendRepo.inboxList(t.db, SUPER, null, "needs_action", null, 50, 0)) as { items: unknown[] }).items.length).toBe(1);
    expect(await code(sendRepo.inboxThread(t.db, OTHER, sendId))).toBe("NOT_FOUND");
    const th = await sendRepo.inboxThread(t.db, OWNER, sendId);
    expect(th.messages.length).toBe(1);
    expect(th).toHaveProperty("company_brain");
    expect(th).toHaveProperty("evidence");
  });

  it("manual reply: requires confirm + human admin, idempotent, sent in the provider thread", async () => {
    const { sl, sendId } = await replied();
    const body = { action: "reply", body: "Hoi, dat hangt af van het aantal gesprekken. Zal ik het kort toelichten?", idempotency_key: "key-12345678", confirm: true };
    expect(await code(inboxActionForActor(t.db, OWNER, sendId, { ...body, confirm: false }, { smartlead: sl }))).toBe("VALIDATION");
    expect(await code(inboxActionForActor(t.db, PARTNER, sendId, body, { smartlead: sl }))).toBe("FORBIDDEN");
    expect(await code(inboxActionForActor(t.db, OTHER, sendId, body, { smartlead: sl }))).toBe("NOT_FOUND");
    const r = await inboxActionForActor(t.db, OWNER, sendId, body, { smartlead: sl });
    expect(r).toMatchObject({ ok: true });
    expect(sl.count("replyToThread")).toBe(1);
    const call = sl.calls.find((c) => c.op === "replyToThread")!.args[1] as { reply_to: { stats_id: string }; email_body: string };
    expect(call.reply_to.stats_id).toBe("st-9");
    const again = await inboxActionForActor(t.db, OWNER, sendId, body, { smartlead: sl });
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(sl.count("replyToThread")).toBe(1);
    expect(await sendOf(ready[0]!.id)).toMatchObject({ inbox_status: "WAITING" });
  });

  it("manual reply is refused when sending is off or the contact unsubscribed", async () => {
    const { sl, sendId } = await replied();
    await t.sql("update outreach_sending_config set sending_enabled = false");
    const body = { action: "reply", body: "Bedankt!", idempotency_key: "key-off-0001", confirm: true };
    expect(await inboxActionForActor(t.db, OWNER, sendId, body, { smartlead: sl })).toMatchObject({ ok: false, blockers: ["SENDING_DISABLED"] });
    await t.sql("update outreach_sending_config set sending_enabled = true");
    await repo.addSuppression(t.db, OWNER, { global: true, owner: null, kind: "EMAIL", value: ready[0]!.email, reason: "unsubscribe" });
    const r = await inboxActionForActor(t.db, OWNER, sendId, { ...body, idempotency_key: "key-unsub-001" }, { smartlead: sl }) as { blockers: string[] };
    expect(r.blockers).toContain("SUPPRESSED_EMAIL:unsubscribe");
    expect(sl.count("replyToThread")).toBe(0);
  });

  it("promotion to CRM is idempotent and keeps the outreach context; promoted leads are invisible to the legacy crons", async () => {
    const { sl, sendId } = await replied();
    const a = await inboxActionForActor(t.db, OWNER, sendId, { action: "promote" }, { smartlead: sl }) as { created: boolean; lead_id: string };
    const b = await inboxActionForActor(t.db, OWNER, sendId, { action: "promote" }, { smartlead: sl }) as { created: boolean; lead_id: string };
    expect(a.created).toBe(true);
    expect(b).toEqual({ created: false, lead_id: a.lead_id });
    const leads = await t.sql<Record<string, unknown>>("select * from public.leads");
    expect(leads.length).toBe(1);
    expect(leads[0]).toMatchObject({ email: ready[0]!.email, landing_page_slug: "tandartspraktijken", referrer: "outreach:smartlead", demo_token: null, user_id: null });
    expect(leads[0]!.scraped_at).not.toBeNull();
    expect(String(leads[0]!.business_info)).toContain("Wat kost dat?");
    expect((await t.sql("select promoted_lead_id from outreach_prospects where id = $1", [ready[0]!.id]))[0]).toEqual({ promoted_lead_id: a.lead_id });
    // The promoted lead must not block its own prospect's gate.
    expect(await sendRepo.gate(t.db, ready[0]!.id)).not.toContain("EXISTING_CRM_LEAD");
  });

  it("promotion links the lead to the AgentMakers user when the owner is a real users.id", async () => {
    const actor: Actor = { userId: OWNER_UUID, isAdmin: true, isSuperAdmin: false };
    await t.sql("update outreach_prospects set owner_user_id = $1 where id = $2", [OWNER_UUID, ready[1]!.id]);
    await t.sql("update outreach_runs set owner_user_id = $1 where id = $2", [OWNER_UUID, runId]);
    try {
      await queueProspectForActor(t.db, actor, ready[1]!.id);
      const s = await sendOf(ready[1]!.id);
      const r = await inboxActionForActor(t.db, actor, String(s!.id), { action: "promote" }, { smartlead: null }) as { lead_id: string };
      expect((await t.sql("select user_id from public.leads where id = $1", [r.lead_id]))[0]).toEqual({ user_id: OWNER_UUID });
    } finally {
      await t.sql("update outreach_prospects set owner_user_id = $1 where id = $2", [OWNER.userId, ready[1]!.id]);
      await t.sql("update outreach_runs set owner_user_id = $1 where id = $2", [OWNER.userId, runId]);
    }
  });

  it("suppress from the Inbox stops the live lead at the provider", async () => {
    await queueProspectForActor(t.db, OWNER, ready[0]!.id);
    await enableSending(t);
    const sl = new FakeSmartlead();
    await runSendTick(sendCtx(t, sl));
    const s = await sendOf(ready[0]!.id);
    await inboxActionForActor(t.db, OWNER, String(s!.id), { action: "suppress", scope: "DOMAIN", reason: "do_not_contact" }, { smartlead: sl });
    const r = await runSendTick(sendCtx(t, sl), { push: false, sync: false });
    expect(r.stopped).toBe(1);
    expect(sl.leads.get(ready[0]!.email)!.paused).toBe(true);
    expect(await sendOf(ready[0]!.id)).toMatchObject({ state: "STOPPED" });
  });
});

describe("autopilot", () => {
  it("queues READY prospects of AUTOPILOT runs only when sending AND autopilot are enabled", async () => {
    await t.sql("update outreach_runs set sending_mode = 'AUTOPILOT' where id = $1", [runId]);
    try {
      const sl = new FakeSmartlead();
      await enableSending(t);
      expect((await runSendTick(sendCtx(t, sl))).autopilotQueued).toBe(0);
      await t.sql("update outreach_sending_config set autopilot_enabled = true");
      const r = await runSendTick(sendCtx(t, sl));
      expect(r.autopilotQueued).toBe(ready.length);
      expect(r.pushed).toBe(ready.length);
      const src = await t.sql<{ queue_source: string; queued_by: string }>("select distinct queue_source, queued_by from outreach_sends");
      expect(src).toEqual([{ queue_source: "autopilot", queued_by: "autopilot" }]);
    } finally {
      await t.sql("update outreach_runs set sending_mode = 'REVIEW_BEFORE_SENDING' where id = $1", [runId]);
    }
  });
});
