import { requestJson, type FetchLike } from "../http";

/**
 * Smartlead API client (cold sending + sequences). Resend stays transactional only.
 *
 * - Fixed host (server.smartlead.ai, allowlisted in ../http.ts); the API key travels only as the `api_key` query
 *   parameter and is scrubbed from every error message.
 * - 429 / 5xx / network errors are retried (bounded) by requestJson; remaining failures surface as SmartleadError
 *   with `retryable` so callers can back off instead of failing permanently.
 * - Response parsing is tolerant: Smartlead's documented shapes differ between API versions.
 */
export const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";

export class SmartleadError extends Error {
  constructor(readonly status: number, readonly operation: string, message: string, readonly retryable: boolean) {
    super(`Smartlead ${operation} failed (HTTP ${status}): ${message}`);
    this.name = "SmartleadError";
  }
}

export interface SmartleadLeadInput {
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string;
  website: string | null;
  custom_fields: Record<string, string>;
}

export interface SmartleadSequenceStep {
  seq_number: number;
  delay_in_days: number;
  subject: string;
  email_body: string;
}

export interface SmartleadMailbox {
  id: string;
  from_email: string;
  from_name: string | null;
  active: boolean;
  daily_limit: number | null;
}

export interface SmartleadHistoryItem {
  type: "SENT" | "REPLY" | "OTHER";
  stats_id: string | null;
  message_id: string | null;
  time: string | null;
  subject: string | null;
  body: string | null;
  sequence_number: number | null;
  from: string | null;
  to: string | null;
}

export interface AddLeadsResult {
  uploaded: number;
  duplicates: number;
  blocked: number;
  invalid: number;
  raw: unknown;
}

/** The operations the sender / inbox need (tests inject a fake). */
export interface SmartleadPort {
  listCampaigns(): Promise<Array<{ id: string; name: string; status: string | null }>>;
  createCampaign(name: string): Promise<{ id: string }>;
  setSchedule(campaignId: string, s: { timezone: string; days: number[]; start_hour: string; end_hour: string; min_time_btw_emails: number; max_leads_per_day: number }): Promise<void>;
  setSettings(campaignId: string, s: { unsubscribe_text: string }): Promise<void>;
  setSequences(campaignId: string, steps: SmartleadSequenceStep[]): Promise<void>;
  listMailboxes(): Promise<SmartleadMailbox[]>;
  addMailboxes(campaignId: string, ids: string[]): Promise<void>;
  setCampaignStatus(campaignId: string, status: "START" | "PAUSED" | "STOPPED"): Promise<void>;
  createCampaignWebhook(campaignId: string, url: string): Promise<void>;
  addLeads(campaignId: string, leads: SmartleadLeadInput[]): Promise<AddLeadsResult>;
  findLeadId(email: string, campaignId: string): Promise<string | null>;
  pauseLead(campaignId: string, leadId: string): Promise<void>;
  unsubscribeLead(campaignId: string, leadId: string): Promise<void>;
  messageHistory(campaignId: string, leadId: string): Promise<SmartleadHistoryItem[]>;
  replyToThread(campaignId: string, input: { lead_id: string; reply_to: SmartleadHistoryItem; email_body: string }): Promise<{ message_id: string | null }>;
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Normalizes one message-history entry (old: {stats_id, type: SENT|REPLY, message_id, time, email_body}; new: {id, direction}). */
export function normalizeHistoryItem(raw: unknown): SmartleadHistoryItem {
  const h = (raw ?? {}) as Json;
  const t = String(h.type ?? h.direction ?? "").toUpperCase();
  const type = t === "SENT" || t === "OUTBOUND" ? "SENT" : t === "REPLY" || t === "INBOUND" || t === "REPLIED" ? "REPLY" : "OTHER";
  return {
    type,
    stats_id: str(h.stats_id ?? h.email_stats_id ?? h.id),
    message_id: str(h.message_id ?? h.messageId),
    time: str(h.time ?? h.sent_time ?? h.sent_at ?? h.received_at ?? h.reply_time),
    subject: str(h.subject),
    body: str(h.email_body ?? h.body ?? h.text),
    sequence_number: num(h.email_seq_number ?? h.seq_number ?? h.sequence_number),
    from: str(h.from ?? h.from_email ?? h.sent_from),
    to: str(h.to ?? h.to_email ?? h.sent_to),
  };
}

/**
 * Removes a field reported by the API ("settings.foo", "sequences[0].variants", "[1].subject") from the payload.
 * Array indexes apply to every element, so all steps are fixed at once. Returns false when nothing was removed.
 */
export function dropPath(payload: unknown, path: string): boolean {
  const parts = path.replace(/\[(\d+)\]/g, ".[]").split(".").filter(Boolean);
  const walk = (node: unknown, i: number): boolean => {
    if (node === null || typeof node !== "object") return false;
    const key = parts[i]!;
    if (key === "[]") return Array.isArray(node) ? node.map((n) => walk(n, i + 1)).some(Boolean) : false;
    const obj = node as Json;
    if (!(key in obj)) return false;
    if (i === parts.length - 1) { delete obj[key]; return true; }
    return walk(obj[key], i + 1);
  };
  return parts.length > 0 && walk(payload, 0);
}

export class SmartleadClient implements SmartleadPort {
  constructor(private readonly apiKey: string, private readonly fetchImpl?: FetchLike, private readonly timeoutMs = 20_000) {}

  private scrub(s: string): string {
    return this.apiKey ? s.split(this.apiKey).join("[redacted]") : s;
  }

  private async call(operation: string, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, query: Record<string, string> = {}): Promise<unknown> {
    const qs = new URLSearchParams({ ...query, api_key: this.apiKey });
    let payload = body === undefined ? undefined : structuredClone(body);
    // Smartlead validates strictly and its documented field sets differ between API versions. We send a superset and
    // drop exactly the fields the API reports as '"x" is not allowed' (bounded), so both versions work.
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await requestJson(`${SMARTLEAD_BASE}${path}?${qs}`, { method, body: payload, timeoutMs: this.timeoutMs, maxRetries: 2, fetchImpl: this.fetchImpl });
      } catch (e) {
        throw new SmartleadError(0, operation, this.scrub(String((e as Error)?.message ?? e)).slice(0, 300), true);
      }
      if (res.status >= 200 && res.status < 300) return res.body;
      const b = (res.body ?? {}) as Json;
      const msg = this.scrub(String(b.message ?? b.error ?? (b as { non_json?: string }).non_json ?? "error")).slice(0, 300);
      const unknown = /"([^"]+)" is not allowed/.exec(msg)?.[1];
      if (res.status === 400 && unknown && payload !== undefined && attempt < 8 && dropPath(payload, unknown)) continue;
      throw new SmartleadError(res.status, operation, msg, res.status === 429 || res.status >= 500 || res.status === 0);
    }
  }

  /** Tries the documented variants in order; moves on only when the endpoint itself is missing (404/405). */
  private async callFirst(operation: string, variants: Array<{ method: "POST" | "PATCH"; path: string; body: unknown }>): Promise<unknown> {
    let last: unknown;
    for (const v of variants) {
      try {
        return await this.call(operation, v.method, v.path, v.body);
      } catch (e) {
        last = e;
        if (!(e instanceof SmartleadError) || (e.status !== 404 && e.status !== 405)) throw e;
      }
    }
    throw last;
  }

  async listCampaigns() {
    const body = await this.call("list_campaigns", "GET", "/campaigns/");
    const list = Array.isArray(body) ? body : arr((body as Json)?.data ?? (body as Json)?.campaigns);
    return list.map((c) => ({ id: String((c as Json).id), name: String((c as Json).name ?? ""), status: str((c as Json).status) }));
  }

  async createCampaign(name: string) {
    const body = (await this.call("create_campaign", "POST", "/campaigns/create", { name })) as Json;
    const id = str(body?.id ?? (body?.data as Json | undefined)?.id ?? body?.campaign_id);
    if (!id) throw new SmartleadError(200, "create_campaign", "response has no campaign id", true);
    return { id };
  }

  async setSchedule(campaignId: string, s: { timezone: string; days: number[]; start_hour: string; end_hour: string; min_time_btw_emails: number; max_leads_per_day: number }) {
    await this.call("set_schedule", "POST", `/campaigns/${encodeURIComponent(campaignId)}/schedule`, {
      timezone: s.timezone, days_of_the_week: s.days, start_hour: s.start_hour, end_hour: s.end_hour,
      min_time_btw_emails: s.min_time_btw_emails, max_new_leads_per_day: s.max_leads_per_day, max_leads_per_day: s.max_leads_per_day,
    });
  }

  async setSettings(campaignId: string, s: { unsubscribe_text: string }) {
    const body = {
      track_settings: ["DONT_TRACK_EMAIL_OPEN", "DONT_TRACK_LINK_CLICK"],
      stop_lead_settings: "REPLY_TO_AN_EMAIL",
      unsubscribe_text: s.unsubscribe_text,
      send_as_plain_text: true,
      follow_up_percentage: 100,
      enable_ai_esp_matching: false,
    };
    const path = `/campaigns/${encodeURIComponent(campaignId)}/settings`;
    await this.callFirst("set_settings", [{ method: "POST", path, body }, { method: "PATCH", path, body }]);
  }

  async setSequences(campaignId: string, steps: SmartleadSequenceStep[]) {
    const base = (st: SmartleadSequenceStep) => ({ seq_number: st.seq_number, seq_delay_details: { delay_in_days: st.delay_in_days } });
    // Production finding: this API rejects variant_distribution_type "MANUALLY_EQUAL". The classic form (subject/email_body
    // per step, blank subject = same thread) is tried first; the single-variant form only if that shape is refused.
    const formats: unknown[] = [
      { sequences: steps.map((st) => ({ ...base(st), subject: st.subject, email_body: st.email_body })) },
      { sequences: steps.map((st) => ({ ...base(st), seq_variants: [{ subject: st.subject, email_body: st.email_body, variant_label: "A" }] })) },
    ];
    const path = `/campaigns/${encodeURIComponent(campaignId)}/sequences`;
    let last: unknown;
    for (const body of formats) {
      try {
        await this.call("set_sequences", "POST", path, body);
        return;
      } catch (e) {
        last = e;
        if (!(e instanceof SmartleadError) || e.retryable || e.status === 401 || e.status === 403) throw e;
      }
    }
    throw last;
  }

  async listMailboxes() {
    const out: SmartleadMailbox[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const body = await this.call("list_mailboxes", "GET", "/email-accounts/", undefined, { offset: String(offset), limit: "100" });
      const list = Array.isArray(body) ? body : arr((body as Json)?.data ?? (body as Json)?.email_accounts);
      for (const m of list) {
        const x = m as Json;
        const warm = (x.warmup_details ?? {}) as Json;
        out.push({
          id: String(x.id), from_email: String(x.from_email ?? x.email ?? ""), from_name: str(x.from_name),
          active: x.is_smtp_success !== false && x.is_imap_success !== false && String(warm.status ?? "").toUpperCase() !== "BLOCKED",
          daily_limit: num(x.message_per_day ?? x.daily_limit),
        });
      }
      if (list.length < 100) break;
    }
    return out;
  }

  async addMailboxes(campaignId: string, ids: string[]) {
    await this.call("add_mailboxes", "POST", `/campaigns/${encodeURIComponent(campaignId)}/email-accounts`, { email_account_ids: ids.map((i) => (/^\d+$/.test(i) ? Number(i) : i)) });
  }

  async setCampaignStatus(campaignId: string, status: "START" | "PAUSED" | "STOPPED") {
    const path = `/campaigns/${encodeURIComponent(campaignId)}/status`;
    await this.callFirst("set_campaign_status", [{ method: "POST", path, body: { status } }, { method: "PATCH", path, body: { status: status === "START" ? "ACTIVE" : status } }]);
  }

  async createCampaignWebhook(campaignId: string, url: string) {
    const events = ["EMAIL_SENT", "EMAIL_REPLY", "EMAIL_BOUNCE", "LEAD_UNSUBSCRIBED"];
    await this.callFirst("create_webhook", [
      { method: "POST", path: `/campaigns/${encodeURIComponent(campaignId)}/webhooks`, body: { id: null, name: `agentmakers-${campaignId}`, webhook_url: url, event_types: events, categories: [] } },
      { method: "POST", path: "/webhook/create", body: { name: `agentmakers-${campaignId}`, webhook_url: url, association_type: 3, email_campaign_id: Number(campaignId) || campaignId,
        event_type_map: Object.fromEntries(events.map((e) => [e, true])) } },
    ]);
  }

  async addLeads(campaignId: string, leads: SmartleadLeadInput[]) {
    if (leads.length > 400) throw new SmartleadError(0, "add_leads", "at most 400 leads per request", false);
    const body = (await this.call("add_leads", "POST", `/campaigns/${encodeURIComponent(campaignId)}/leads`, {
      lead_list: leads,
      settings: { ignore_global_block_list: false, ignore_unsubscribe_list: false, ignore_community_bounce_list: false, ignore_duplicate_leads_in_other_campaign: false },
    })) as Json;
    const n = (k: string) => Number(body?.[k] ?? 0) || 0;
    return { uploaded: n("upload_count"), duplicates: n("duplicate_count"), blocked: n("block_count") + n("unsubscribed_leads") + n("bounce_count"), invalid: n("invalid_email_count"), raw: body };
  }

  async findLeadId(email: string, campaignId: string) {
    let body: Json | null;
    try {
      body = (await this.call("find_lead", "GET", "/leads/", undefined, { email })) as Json | null;
    } catch (e) {
      if (!(e instanceof SmartleadError) || e.status !== 404) throw e;
      body = (await this.call("find_lead", "GET", "/leads", undefined, { email }).catch((x) => {
        if (x instanceof SmartleadError && x.status === 404) return null;
        throw x;
      })) as Json | null;
    }
    if (!body || typeof body !== "object") return null;
    const id = str(body.id ?? (body.data as Json | undefined)?.id);
    const campaigns = arr(body.lead_campaign_data ?? (body.data as Json | undefined)?.lead_campaign_data);
    if (campaigns.length && !campaigns.some((c) => String((c as Json).campaign_id) === String(campaignId))) return null;
    return id;
  }

  async pauseLead(campaignId: string, leadId: string) {
    await this.call("pause_lead", "POST", `/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(leadId)}/pause`, {});
  }

  async unsubscribeLead(campaignId: string, leadId: string) {
    await this.call("unsubscribe_lead", "POST", `/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(leadId)}/unsubscribe`, {});
  }

  async messageHistory(campaignId: string, leadId: string) {
    const body = (await this.call("message_history", "GET", `/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(leadId)}/message-history`)) as Json;
    const list = Array.isArray(body) ? body : arr(body?.history ?? body?.messages ?? body?.data);
    return list.map(normalizeHistoryItem);
  }

  async replyToThread(campaignId: string, input: { lead_id: string; reply_to: SmartleadHistoryItem; email_body: string }) {
    const r = input.reply_to;
    const body = (await this.call("reply", "POST", `/campaigns/${encodeURIComponent(campaignId)}/reply-email-thread`, {
      email_stats_id: r.stats_id, lead_id: Number(input.lead_id) || input.lead_id, email_body: input.email_body, reply_message_id: r.message_id, reply_email_time: r.time,
      reply_email_body: r.body, add_signature: false,
    })) as Json | null;
    return { message_id: str(body?.message_id ?? (body?.data as Json | undefined)?.message_id) };
  }
}
