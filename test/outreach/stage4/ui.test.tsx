import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { InboxList, ThreadBody } from "../../../src/components/admin/outreach/InboxView.js";
import { ProspectSendingBody, RunSendingBody, SendingBody } from "../../../src/components/admin/outreach/SendingPanel.js";
import { sendRepo } from "../../../src/lib/outreach/sending/repository.js";
import { runSendTick } from "../../../src/lib/outreach/sending/sender.js";
import { queueProspectForActor } from "../../../src/lib/outreach/sending/service.js";
import { normalizeSmartleadEvent } from "../../../src/lib/outreach/sending/webhook.js";
import { outreachApi } from "../../../src/lib/outreach/ui/api.js";
import { blockerLabel, inboxQuery, latestSuggestion, type InboxPage, type ProspectSending, type RunSending, type SendingOverview, type Thread } from "../../../src/lib/outreach/ui/sending.js";
import { drain, fixtureContext, newRun, OWNER, type TestDb } from "../stage2/helpers.js";
import { createStage4Db, enableSending, FakeSmartlead, readyProspects, sendCtx } from "./helpers.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => undefined;

let t: TestDb;
let runId: string;
let thread: Thread;
let page: InboxPage;

beforeAll(async () => {
  t = await createStage4Db();
  runId = (await newRun(t.db, { concurrency: 1 })).id;
  await drain(fixtureContext(t.db, { settings: { maxParallel: 1 } }), t);
  const [p] = await readyProspects(t, runId);
  await queueProspectForActor(t.db, OWNER, p!.id);
  await enableSending(t);
  const sl = new FakeSmartlead();
  await runSendTick(sendCtx(t, sl));
  const [s] = await t.sql<{ id: string; provider_campaign_id: string }>("select id, provider_campaign_id from outreach_sends");
  const ev = normalizeSmartleadEvent({ event_type: "EMAIL_REPLY", campaign_id: s!.provider_campaign_id, from_email: p!.email, reply_body: "Hoe werkt dat?", time_replied: "2026-10-08T09:00:00Z" }, { rawBody: "x", requestId: "ui-1" })!;
  const res = await sendRepo.applyEvent(t.db, ev);
  await sendRepo.setAnalysis(t.db, res.message_id!, { classification: "QUESTION", confidence: 0.8, source: "llm", summary: "Vraagt hoe het werkt", suggested_reply: "Beste Anna,\n\nGoede vraag.\n\nRichard", suggested_reply_status: "READY" }, null);
  thread = (await sendRepo.inboxThread(t.db, OWNER, s!.id)) as unknown as Thread;
  page = (await sendRepo.inboxList(t.db, OWNER, null, null, null, 50, 0)) as unknown as InboxPage;
});
afterAll(async () => { await t.close(); });

describe("Inbox UI", () => {
  it("list shows company, state, classification and last message", () => {
    const out = html(<InboxList items={page.items} selected={null} onSelect={noop} />);
    expect(out).toContain(thread.prospect.company_name);
    expect(out).toContain("Gereageerd");
    expect(out).toContain("Vraag");
    expect(out).toContain("Hoe werkt dat?");
  });
  it("thread: messages, AI suggestion (never auto-sent), context and actions; sending needs a confirm step", () => {
    const base = { t: thread, busy: false, draft: "", setDraft: noop, setConfirm: noop, onSend: noop, onAction: noop, notice: null };
    const out = html(<ThreadBody {...base} confirm={false} />);
    expect(out).toContain('data-testid="thread-message"');
    expect(out).toContain("AI verstuurt nooit zelf");
    expect(out).toContain("Gebruik suggestie");
    expect(out).toContain("Verstuur…");
    expect(out).not.toContain("Bevestig: verstuur");
    expect(out).toContain("Naar CRM (lead)");
    expect(out).toContain("Adres niet meer benaderen");
    expect(out).toContain("Company Brain");
    const confirm = html(<ThreadBody {...base} draft="Hallo" confirm />);
    expect(confirm).toContain(`Bevestig: verstuur naar ${thread.send.email}`);
    expect(latestSuggestion(thread.messages)?.suggested_reply).toContain("Goede vraag");
  });
});

describe("Sending UI", () => {
  const overview = (o: Partial<SendingOverview> = {}): SendingOverview => ({
    config: { sending_enabled: false, autopilot_enabled: false, daily_new_leads_cap: 10, max_pushes_per_tick: 5, test_recipients: [], followup_delays_days: [3, 4],
      schedule: { timezone: "Europe/Amsterdam", days: [1, 2, 3, 4, 5], start_hour: "09:00", end_hour: "17:00", min_time_btw_emails: 10 }, email_account_ids: [],
      daily_llm_budget_eur: 2, kill_reason: null, updated_by: null, updated_at: "2026-10-08T00:00:00Z" },
    states: { ACTIVE: 2 }, pushed_today: 1, needs_action: 1, llm: { spent_eur: 0.01, budget_eur: 2 }, webhooks_24h: { received: 3, unmatched: 0, last_at: null },
    provider: { smartlead_configured: true, webhook_configured: true, env_kill_switch: false }, can_configure: true, ...o,
  });
  it("off: superadmin sees an arm-then-confirm switch; admins only ever see the off switch", () => {
    const out = html(<SendingBody o={overview()} mailboxes={[]} busy={false} onPatch={noop} />);
    expect(out).toContain("Verzenden aanzetten…");
    expect(out).toContain("Geen mailbox gekoppeld");
    const admin = html(<SendingBody o={overview({ can_configure: false })} mailboxes={null} busy={false} onPatch={noop} />);
    expect(admin).not.toContain("aanzetten");
    const on = html(<SendingBody o={overview({ config: { ...overview().config, sending_enabled: true, test_recipients: ["me@x.nl"] }, can_configure: false })} mailboxes={null} busy={false} onPatch={noop} />);
    expect(on).toContain("Zet verzenden UIT (noodstop)");
    expect(on).toContain("alleen naar: me@x.nl");
  });
  it("run + prospect sections explain gate blockers in plain language", () => {
    const rs: RunSending = { provider_campaign_id: "9", provider_campaign_status: "ACTIVE", provider_campaign_error: null, sends: [],
      ready_unqueued: [{ prospect_id: "p1", company_name: "A", email: "a@a.nl", blockers: [] }, { prospect_id: "p2", company_name: "B", email: "b@b.nl", blockers: ["ALREADY_CONTACTED_DOMAIN"] }] };
    const out = html(<RunSendingBody d={rs} canOperate busy={false} onQueueAll={noop} onOpenProspect={noop} notice={null} />);
    expect(out).toContain("Zet 1 READY in wachtrij");
    expect(out).toContain("Dit bedrijf (domein) is al eerder benaderd");
    const ps: ProspectSending = { send: null, gate: ["SUPPRESSED_EMAIL:unsubscribe"], promoted_lead_id: null, messages: [] };
    expect(html(<ProspectSendingBody d={ps} busy={false} onQueue={noop} onCancel={noop} notice={null} />)).toContain("E-mailadres geblokkeerd (afgemeld)");
    expect(blockerLabel("NOT_READY:BLOCKED")).toBe("Niet READY (BLOCKED)");
  });
  it("api client uses the session-cookie endpoints only", async () => {
    const urls: Array<[string, string]> = [];
    const api = outreachApi("viewas-1", (async (u: string, init?: RequestInit) => { urls.push([String(u), init?.method ?? "GET"]); return new Response("{}"); }) as typeof fetch);
    await api.inbox("needs_action", "tand");
    await api.inboxAction("s1", { action: "promote" });
    await api.setSending({ sending_enabled: false });
    await api.queueRun("r1");
    expect(urls).toEqual([
      ["/api/outreach/inbox?status=needs_action&q=tand&limit=50&offset=0&view_as=viewas-1", "GET"],
      ["/api/outreach/inbox/s1", "POST"],
      ["/api/outreach/sending", "PATCH"],
      ["/api/outreach/runs/r1/sending", "POST"],
    ]);
    expect(inboxQuery("all", "", 1, 20, null)).toBe("limit=20&offset=20");
  });
});
