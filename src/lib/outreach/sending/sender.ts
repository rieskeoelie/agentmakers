import type { OutreachDb } from "../orchestration/db";
import type { Actor } from "../orchestration/repository";
import { campaignTemplate, leadCustomFields, UNSUBSCRIBE_TEXT } from "./sequence";
import { sendRepo, type ClaimedSend, type SendingConfig } from "./repository";
import { SmartleadError, type SmartleadPort } from "./smartlead";
import { queueProspect } from "./service";
import { htmlToText, stripQuoted, type ProviderEvent } from "./webhook";

/**
 * Send tick (runs inside the outreach worker invocation and right after queue / kill-switch actions):
 *   1. stop propagation — replies, bounces, unsubscribes, new suppressions and stopped runs pause the lead at Smartlead
 *      (always runs, also when sending is off: stopping is always safe);
 *   2. kill switch — sending off ⇒ every provider campaign is paused; on ⇒ campaigns we paused are started again;
 *   3. autopilot — READY prospects of AUTOPILOT runs are queued (only when sending + autopilot are enabled);
 *   4. push — claim QUEUED sends (cap, allowlist and the FINAL gate are enforced in the claim transaction), make sure the
 *      run's Smartlead campaign exists, add the lead;
 *   5. sync — reconcile live leads with Smartlead's message history (missed webhooks: sends, replies).
 */
export interface SendContext {
  db: OutreachDb;
  /** null when SMARTLEAD_API_KEY is not configured: nothing is pushed. */
  smartlead: SmartleadPort | null;
  /** Hard environment kill switch (OUTREACH_SENDING_DISABLED=true) — overrides the database flag. */
  envKill: boolean;
  /** Public URL Smartlead posts webhooks to (with the secret token), or null when not configured. */
  webhookUrl: string | null;
  workerId: string;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

export interface SendTickResult {
  enabled: boolean;
  stopped: number;
  campaignsPaused: number;
  campaignsResumed: number;
  autopilotQueued: number;
  pushed: number;
  pushFailed: number;
  cancelledByGate: number;
  synced: number;
  syncEvents: number;
}

const SYSTEM: Actor = { userId: "autopilot", isAdmin: true, isSuperAdmin: true };
const errMsg = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 500);

export async function runSendTick(ctx: SendContext, opts: { push?: boolean; sync?: boolean } = {}): Promise<SendTickResult> {
  const r: SendTickResult = { enabled: false, stopped: 0, campaignsPaused: 0, campaignsResumed: 0, autopilotQueued: 0, pushed: 0, pushFailed: 0, cancelledByGate: 0, synced: 0, syncEvents: 0 };
  const sl = ctx.smartlead;
  const config = await sendRepo.config(ctx.db);
  r.enabled = config.sending_enabled && !ctx.envKill && !!sl;

  if (sl) r.stopped = await propagateStops(ctx, sl);
  if (sl) {
    const k = await propagateKillSwitch(ctx, sl, r.enabled);
    r.campaignsPaused = k.paused;
    r.campaignsResumed = k.resumed;
  }
  if (!r.enabled || !sl) return r;

  if (config.autopilot_enabled) r.autopilotQueued = await autopilot(ctx);

  if (opts.push !== false) {
    const claim = await sendRepo.claimSends(ctx.db, ctx.workerId, config.max_pushes_per_tick);
    r.cancelledByGate = claim.cancelled.length;
    for (const c of claim.sends) {
      const ok = await pushOne(ctx, sl, config, c);
      if (ok) r.pushed++; else r.pushFailed++;
    }
  }
  if (opts.sync !== false) {
    const s = await syncWithProvider(ctx, sl);
    r.synced = s.synced;
    r.syncEvents = s.events;
  }
  return r;
}

/** Pause (and for unsubscribes: unsubscribe) leads that must not receive anything else. */
export async function propagateStops(ctx: SendContext, sl: SmartleadPort): Promise<number> {
  let n = 0;
  for (const c of await sendRepo.stopCandidates(ctx.db)) {
    if (!c.campaign_id || !c.lead_id) continue;
    try {
      await sl.pauseLead(c.campaign_id, c.lead_id);
      if (c.state === "UNSUBSCRIBED" || c.reason === "SUPPRESSED") await sl.unsubscribeLead(c.campaign_id, c.lead_id).catch(() => undefined);
      await sendRepo.markStopped(ctx.db, c.send_id, c.reason, true);
      n++;
    } catch (e) {
      ctx.log?.("stop propagation failed", { send: c.send_id, error: errMsg(e) });
    }
  }
  return n;
}

/** Stop one send right away (webhook reply / suppression from the Inbox). Never throws. */
export async function stopAtProvider(ctx: SendContext, stop: { send_id?: string; campaign_id: string | null; lead_id: string | null }, reason: string): Promise<boolean> {
  if (!ctx.smartlead || !stop.campaign_id || !stop.lead_id) return false;
  try {
    await ctx.smartlead.pauseLead(stop.campaign_id, stop.lead_id);
    if (stop.send_id) await sendRepo.markStopped(ctx.db, stop.send_id, reason, true);
    return true;
  } catch (e) {
    ctx.log?.("provider stop failed (the sweep retries)", { send: stop.send_id, error: errMsg(e) });
    return false;
  }
}

async function propagateKillSwitch(ctx: SendContext, sl: SmartleadPort, enabled: boolean): Promise<{ paused: number; resumed: number }> {
  let paused = 0;
  let resumed = 0;
  for (const c of await sendRepo.providerCampaigns(ctx.db)) {
    try {
      if (!enabled && c.status === "ACTIVE") {
        await sl.setCampaignStatus(c.campaign_id, "PAUSED");
        await sendRepo.setRunCampaign(ctx.db, c.run_id, c.campaign_id, "PAUSED", "KILL_SWITCH");
        paused++;
      } else if (enabled && c.status === "PAUSED" && !["STOPPED", "FAILED", "PAUSED"].includes(c.run_status)) {
        await sl.setCampaignStatus(c.campaign_id, "START");
        await sendRepo.setRunCampaign(ctx.db, c.run_id, c.campaign_id, "ACTIVE", null);
        resumed++;
      } else if (c.status === "ACTIVE" && ["STOPPED", "FAILED", "PAUSED"].includes(c.run_status)) {
        // Run paused/stopped by its owner: pause its provider campaign too.
        await sl.setCampaignStatus(c.campaign_id, "PAUSED");
        await sendRepo.setRunCampaign(ctx.db, c.run_id, c.campaign_id, "PAUSED", `RUN_${c.run_status}`);
        paused++;
      }
    } catch (e) {
      ctx.log?.("campaign status propagation failed", { run: c.run_id, error: errMsg(e) });
    }
  }
  return { paused, resumed };
}

async function autopilot(ctx: SendContext): Promise<number> {
  let n = 0;
  for (const prospectId of await sendRepo.autopilotCandidates(ctx.db, 20)) {
    try {
      const res = await queueProspect(ctx.db, SYSTEM, prospectId, "autopilot");
      if (res.ok && res.created) n++;
    } catch (e) {
      ctx.log?.("autopilot queue failed", { prospect: prospectId, error: errMsg(e) });
    }
  }
  return n;
}

export function campaignName(run: { id: string; name: string }): string {
  return `AgentMakers · ${run.name.slice(0, 60)} · ${run.id.slice(0, 8)}`;
}

/** Makes sure the run has a configured, started Smartlead campaign. Returns its id, or null when another worker is busy. */
export async function ensureCampaign(ctx: SendContext, sl: SmartleadPort, config: SendingConfig, run: ClaimedSend["run"]): Promise<string | null> {
  const lock = await sendRepo.lockRunCampaign(ctx.db, run.id);
  if (lock.ready && lock.campaign_id) return lock.campaign_id;
  if (!lock.locked) return null;
  let campaignId = lock.campaign_id;
  try {
    if (!campaignId) {
      const name = campaignName(run);
      campaignId = (await sl.listCampaigns()).find((c) => c.name === name)?.id ?? (await sl.createCampaign(name)).id;
      await sendRepo.setRunCampaign(ctx.db, run.id, campaignId, "CONFIGURING", null);
      await sendRepo.lockRunCampaign(ctx.db, run.id); // re-take the lock released by setRunCampaign
    }
    const mailboxes = (await sl.listMailboxes()).filter((m) => m.active && (config.email_account_ids.length === 0 || config.email_account_ids.includes(m.id)));
    if (!mailboxes.length) throw new SmartleadError(0, "add_mailboxes", "no active Smartlead mailbox is configured", true);
    const language = (run.campaign as { language?: string }).language === "en" ? "en" : "nl";
    await sl.setSchedule(campaignId, { ...config.schedule, max_leads_per_day: Math.max(config.daily_new_leads_cap, 1) });
    await sl.setSettings(campaignId, { unsubscribe_text: UNSUBSCRIBE_TEXT[language] });
    await sl.setSequences(campaignId, campaignTemplate(config.followup_delays_days));
    await sl.addMailboxes(campaignId, mailboxes.map((m) => m.id));
    let webhookError: string | null = null;
    if (ctx.webhookUrl) {
      await sl.createCampaignWebhook(campaignId, ctx.webhookUrl).catch((e) => { webhookError = `WEBHOOK: ${errMsg(e)}`; });
    } else {
      webhookError = "WEBHOOK: OUTREACH_WEBHOOK_SECRET not configured (sync polling only)";
    }
    // Starting can be refused while the campaign has no leads yet; it is started again after every lead push.
    let startError: string | null = null;
    await sl.setCampaignStatus(campaignId, "START").catch((e) => { startError = `START: ${errMsg(e)}`; });
    await sendRepo.setRunCampaign(ctx.db, run.id, campaignId, "ACTIVE", [webhookError, startError].filter(Boolean).join(" | ") || null);
    return campaignId;
  } catch (e) {
    await sendRepo.setRunCampaign(ctx.db, run.id, campaignId, "ERROR", errMsg(e)).catch(() => undefined);
    throw e;
  }
}

async function pushOne(ctx: SendContext, sl: SmartleadPort, config: SendingConfig, c: ClaimedSend): Promise<boolean> {
  const { send, lease_token } = c;
  let campaignId: string | null;
  try {
    campaignId = await ensureCampaign(ctx, sl, config, c.run);
  } catch (e) {
    // Campaign setup problems (provider config, missing mailbox, API changes) never fail the send itself: it stays queued.
    ctx.log?.("campaign setup failed", { run: c.run.id, error: errMsg(e) });
    await sendRepo.failPush(ctx.db, send.id, lease_token, `CAMPAIGN_SETUP: ${errMsg(e)}`, true).catch(() => undefined);
    return false;
  }
  try {
    if (!campaignId) {
      await sendRepo.failPush(ctx.db, send.id, lease_token, "CAMPAIGN_BUSY", true);
      return false;
    }
    const res = await sl.addLeads(campaignId, [{
      email: send.email, first_name: send.first_name, last_name: send.last_name, company_name: send.company_name, website: send.website,
      custom_fields: leadCustomFields(send.id, send.sequence),
    }]);
    if (res.uploaded === 0 && (res.blocked > 0 || res.invalid > 0)) {
      await sendRepo.failPush(ctx.db, send.id, lease_token, `PROVIDER_REJECTED_LEAD: blocked=${res.blocked} invalid=${res.invalid}`, false);
      return false;
    }
    const leadId = await sl.findLeadId(send.email, campaignId);
    if (!leadId) {
      // Not in this campaign (e.g. the provider kept it in another campaign): never retry blindly.
      await sendRepo.failPush(ctx.db, send.id, lease_token, `PROVIDER_LEAD_NOT_IN_CAMPAIGN (uploaded=${res.uploaded}, duplicates=${res.duplicates})`, false);
      return false;
    }
    await sendRepo.completePush(ctx.db, send.id, lease_token, campaignId, leadId);
    await sl.setCampaignStatus(campaignId, "START").catch((e) => ctx.log?.("campaign start after push failed", { campaign: campaignId, error: errMsg(e) }));
    return true;
  } catch (e) {
    const retryable = !(e instanceof SmartleadError) || e.retryable;
    ctx.log?.("push failed", { send: send.id, retryable, error: errMsg(e) });
    await sendRepo.failPush(ctx.db, send.id, lease_token, errMsg(e), retryable).catch(() => undefined);
    return false;
  }
}

/** Missed-webhook safety net: replays Smartlead's message history as idempotent provider events. */
export async function syncWithProvider(ctx: SendContext, sl: SmartleadPort, limit = 25): Promise<{ synced: number; events: number }> {
  let synced = 0;
  let events = 0;
  for (const c of await sendRepo.syncCandidates(ctx.db, limit)) {
    try {
      const history = await sl.messageHistory(c.campaign_id, c.lead_id);
      let step = 0;
      for (const h of history) {
        if (h.type === "SENT") step++;
        if (h.type === "OTHER") continue;
        const e: ProviderEvent = {
          id: `sl:sync:${c.send_id}:${h.type}:${h.message_id ?? h.stats_id ?? h.time ?? step}`,
          provider: "smartlead", type: h.type, raw_type: `SYNC_${h.type}`, campaign_id: c.campaign_id, lead_email: c.email, lead_id: c.lead_id,
          sequence_number: h.type === "SENT" ? (h.sequence_number ?? step) : h.sequence_number, message_id: h.message_id, stats_id: h.stats_id,
          occurred_at: h.time ? new Date(h.time).toISOString() : null, subject: h.subject, body: h.type === "REPLY" ? stripQuoted(htmlToText(h.body)) : htmlToText(h.body), from_email: h.from, to_email: h.to, payload: null,
        };
        const res = await sendRepo.applyEvent(ctx.db, e);
        if (!res.duplicate) events++;
        if (res.stop) await stopAtProvider(ctx, { send_id: res.send_id, ...res.stop }, e.type);
      }
      await sendRepo.markSynced(ctx.db, c.send_id);
      synced++;
    } catch (e) {
      ctx.log?.("sync failed", { send: c.send_id, error: errMsg(e) });
    }
  }
  return { synced, events };
}
