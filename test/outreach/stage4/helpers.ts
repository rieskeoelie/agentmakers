import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestDb } from "../stage2/helpers.js";
import { createTestDb } from "../stage2/helpers.js";
import { STAGE3_MIGRATION } from "../stage3/helpers.js";
import type { SmartleadHistoryItem, SmartleadLeadInput, SmartleadMailbox, SmartleadPort, SmartleadSequenceStep } from "../../../src/lib/outreach/sending/smartlead.js";
import { SmartleadError } from "../../../src/lib/outreach/sending/smartlead.js";
import type { SendContext } from "../../../src/lib/outreach/sending/sender.js";

export const STAGE4_MIGRATION = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261008090000_outreach_stage4_sending.sql");
export const OWNER_UUID = "11111111-1111-4111-8111-111111111111";

/**
 * Stage 2 + 3 + 4 on real Postgres (PGlite). public.users / public.leads mirror the live production columns
 * (they exist before the outreach migrations in production).
 */
export async function createStage4Db(): Promise<TestDb> {
  const t = await createTestDb();
  await t.pg.exec(readFileSync(STAGE3_MIGRATION, "utf8"));
  await t.pg.exec(`
    create table if not exists public.users (id uuid primary key, username text not null default 'u', display_name text not null default 'U', password_hash text not null default 'x', is_admin boolean default false, created_at timestamptz default now());
    create table if not exists public.leads (
      id uuid primary key default gen_random_uuid(), landing_page_slug text not null, language text, naam text not null, email text not null, telefoon text not null,
      website text, bedrijfsnaam text, ip_address text, user_agent text, referrer text, created_at timestamptz default now(), demo_token text,
      business_info text, scraped_at timestamptz, diensten text[], calendly_sent_at timestamptz, user_id uuid references public.users(id));
    alter table public.leads enable row level security;
    revoke all on table public.leads from anon, authenticated, public;
    grant all on table public.leads to service_role;
    grant all on table public.users to service_role;
    insert into public.users (id) values ('${OWNER_UUID}') on conflict do nothing;`);
  const sql = readFileSync(STAGE4_MIGRATION, "utf8");
  await t.pg.exec(sql);
  await t.pg.exec(sql); // re-runnable
  return t;
}

export interface FakeCall { op: string; args: unknown[] }

/** In-memory Smartlead: records every call; nothing leaves the process. */
export class FakeSmartlead implements SmartleadPort {
  calls: FakeCall[] = [];
  campaigns: Array<{ id: string; name: string; status: string | null }> = [];
  leads = new Map<string, { id: string; campaignId: string; lead: SmartleadLeadInput; paused: boolean; unsubscribed: boolean }>();
  history = new Map<string, SmartleadHistoryItem[]>();
  mailboxes: SmartleadMailbox[] = [{ id: "501", from_email: "richard@mail.agentmakers.io", from_name: "Richard", active: true, daily_limit: 30 }];
  failNext: Record<string, SmartleadError | undefined> = {};
  blockEmails = new Set<string>();
  private seq = 100;

  private rec(op: string, ...args: unknown[]) {
    this.calls.push({ op, args });
    const f = this.failNext[op];
    if (f) { delete this.failNext[op]; throw f; }
  }
  count(op: string) { return this.calls.filter((c) => c.op === op).length; }

  async listCampaigns() { this.rec("listCampaigns"); return this.campaigns.map((c) => ({ ...c })); }
  async createCampaign(name: string) { this.rec("createCampaign", name); const id = String(++this.seq); this.campaigns.push({ id, name, status: "DRAFTED" }); return { id }; }
  async setSchedule(id: string, s: unknown) { this.rec("setSchedule", id, s); }
  async setSettings(id: string, s: unknown) { this.rec("setSettings", id, s); }
  async setSequences(id: string, steps: SmartleadSequenceStep[]) { this.rec("setSequences", id, steps); }
  async listMailboxes() { this.rec("listMailboxes"); return this.mailboxes; }
  async addMailboxes(id: string, ids: string[]) { this.rec("addMailboxes", id, ids); }
  async setCampaignStatus(id: string, status: string) { this.rec("setCampaignStatus", id, status); const c = this.campaigns.find((x) => x.id === id); if (c) c.status = status; }
  async createCampaignWebhook(id: string, url: string) { this.rec("createCampaignWebhook", id, url); }
  async addLeads(id: string, leads: SmartleadLeadInput[]) {
    this.rec("addLeads", id, leads);
    let uploaded = 0, duplicates = 0, blocked = 0;
    for (const l of leads) {
      if (this.blockEmails.has(l.email)) { blocked++; continue; }
      if (this.leads.has(l.email)) { duplicates++; continue; }
      this.leads.set(l.email, { id: String(++this.seq), campaignId: id, lead: l, paused: false, unsubscribed: false });
      uploaded++;
    }
    return { uploaded, duplicates, blocked, invalid: 0, raw: {} };
  }
  async findLeadId(email: string, campaignId: string) { this.rec("findLeadId", email, campaignId); const l = this.leads.get(email); return l && l.campaignId === campaignId ? l.id : null; }
  async pauseLead(cid: string, lid: string) { this.rec("pauseLead", cid, lid); for (const l of this.leads.values()) if (l.id === lid) l.paused = true; }
  async unsubscribeLead(cid: string, lid: string) { this.rec("unsubscribeLead", cid, lid); for (const l of this.leads.values()) if (l.id === lid) l.unsubscribed = true; }
  async messageHistory(cid: string, lid: string) { this.rec("messageHistory", cid, lid); return this.history.get(lid) ?? []; }
  async replyToThread(cid: string, input: { reply_to: SmartleadHistoryItem; email_body: string }) { this.rec("replyToThread", cid, input); return { message_id: `<reply-${++this.seq}@sl>` }; }
}

export function sendCtx(t: TestDb, sl: FakeSmartlead | null, o: Partial<SendContext> = {}): SendContext {
  return { db: t.db, smartlead: sl, envKill: false, webhookUrl: "https://agentmakers.io/api/outreach/webhooks/smartlead?token=test", workerId: "test-sender", ...o };
}

export async function enableSending(t: TestDb, patch: Record<string, unknown> = {}) {
  await t.sql("update outreach_sending_config set sending_enabled = true, test_recipients = '{}', daily_new_leads_cap = 50, max_pushes_per_tick = 20 where id = 1");
  for (const [k, v] of Object.entries(patch)) await t.sql(`update outreach_sending_config set ${k} = $1 where id = 1`, [v]);
}

export async function readyProspects(t: TestDb, runId: string) {
  return t.sql<{ id: string; email: string; domain: string; company_name: string }>(
    "select id, email, domain, company_name from outreach_prospects where run_id = $1 and outcome = 'READY' order by position", [runId]);
}
