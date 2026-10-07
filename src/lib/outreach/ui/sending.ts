/** Sending + Inbox view models (client-safe: no server imports). */

export type SendState = "QUEUED" | "PUSHING" | "ACTIVE" | "COMPLETED" | "REPLIED" | "BOUNCED" | "UNSUBSCRIBED" | "STOPPED" | "CANCELLED" | "FAILED";
export type InboxStatus = "NONE" | "NEEDS_ACTION" | "WAITING" | "DONE";
export type ReplyClass = "INTERESTED" | "QUESTION" | "NOT_NOW" | "NOT_INTERESTED" | "WRONG_PERSON" | "OOO" | "UNSUBSCRIBE" | "OTHER";
export type Disposition = "INTERESTED" | "MEETING" | "NOT_NOW" | "NOT_INTERESTED" | "WRONG_PERSON" | "UNSUBSCRIBED" | "CLOSED";
export type InboxTab = "needs_action" | "waiting" | "done" | "sequences" | "all";

export interface SendingConfigView {
  sending_enabled: boolean;
  autopilot_enabled: boolean;
  daily_new_leads_cap: number;
  max_pushes_per_tick: number;
  test_recipients: string[];
  followup_delays_days: number[];
  schedule: { timezone: string; days: number[]; start_hour: string; end_hour: string; min_time_btw_emails: number };
  email_account_ids: string[];
  daily_llm_budget_eur: number;
  kill_reason: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface SendingOverview {
  config: SendingConfigView;
  states: Partial<Record<SendState, number>>;
  pushed_today: number;
  needs_action: number;
  llm: { spent_eur: number; budget_eur: number };
  webhooks_24h: { received: number; unmatched: number; last_at: string | null };
  provider: { smartlead_configured: boolean; webhook_configured: boolean; env_kill_switch: boolean };
  can_configure: boolean;
}

export interface Mailbox { id: string; from_email: string; from_name: string | null; active: boolean; daily_limit: number | null }

export interface SendSummary {
  id: string;
  prospect_id: string;
  company_name: string;
  email: string;
  state: SendState;
  state_reason: string | null;
  steps_sent: number;
  steps_total: number;
  queued_at: string;
  pushed_at: string | null;
  inbox_status: InboxStatus;
  classification: ReplyClass | null;
}

export interface RunSending {
  provider_campaign_id: string | null;
  provider_campaign_status: string | null;
  provider_campaign_error: string | null;
  sends: SendSummary[];
  ready_unqueued: Array<{ prospect_id: string; company_name: string; email: string | null; blockers: string[] }>;
}

export interface ProspectSending {
  send: (SendSummary & { subject: string; body: string; sequence: Array<{ step: number; delay_days: number; subject: string; body: string }> }) | null;
  gate: string[] | null;
  promoted_lead_id: string | null;
  messages: Array<{ id: string; direction: "INBOUND" | "OUTBOUND"; kind: string; status: string; at: string; subject: string | null; classification: ReplyClass | null }>;
}

export interface InboxItem {
  id: string;
  prospect_id: string;
  run_id: string;
  run_name: string;
  company_name: string;
  contact_name: string | null;
  email: string;
  state: SendState;
  state_reason: string | null;
  inbox_status: InboxStatus;
  disposition: Disposition | null;
  classification: ReplyClass | null;
  steps_sent: number;
  steps_total: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  queued_at: string;
  promoted_lead_id: string | null;
  last_message: { direction: "INBOUND" | "OUTBOUND"; kind: string; at: string; preview: string } | null;
}

export interface InboxPage {
  counts: { needs_action: number; waiting: number; done: number; sequences: number; all: number };
  total: number;
  items: InboxItem[];
}

export interface ThreadMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  kind: "SEQUENCE" | "MANUAL_REPLY" | "REPLY";
  status: "RECORDED" | "PENDING" | "SENT" | "FAILED";
  sequence_number: number | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  occurred_at: string;
  classification: ReplyClass | null;
  classification_confidence: number | null;
  classification_source: string | null;
  summary: string | null;
  suggested_reply: string | null;
  suggested_reply_status: "NONE" | "READY" | "REJECTED" | "USED" | "FAILED";
  suggested_reply_issues: string[] | null;
  analysis_state: string;
  created_by_user_id: string | null;
  error: string | null;
}

export interface Thread {
  send: InboxItem & { subject: string; body: string; domain: string; sequence: Array<{ step: number; delay_days: number; subject: string; body: string }>; provider_campaign_id: string | null; owner_user_id: string };
  prospect: { id: string; company_name: string; domain: string; website: string | null; city: string | null; phone: string | null; contact_name: string | null; contact_title: string | null;
    fit: { verdict?: string; fit?: string; reasons?: string[] } | null; hook: unknown; outcome: string | null; promoted_lead_id: string | null; promoted_at: string | null };
  run: { id: string; name: string; status: string; sending_mode: string; niche: string | null; region: string | null; landing_url: string | null; provider_campaign_id: string | null };
  company_brain: { website: string | null; fit: unknown; brief: unknown; pages: unknown } | null;
  evidence: Array<{ kind: "FACT" | "INFERENCE"; ref: string; statement: string; source_url: string | null }>;
  messages: ThreadMessage[];
  events: Array<{ id: number; type: string; actor: string | null; data: Record<string, unknown> | null; created_at: string }>;
  suppressions: string[];
  llm_spend_eur: number;
}

export const SEND_STATE_META: Record<SendState, { label: string; tone: "green" | "amber" | "red" | "blue" | "muted" }> = {
  QUEUED: { label: "In wachtrij", tone: "blue" },
  PUSHING: { label: "Wordt klaargezet", tone: "blue" },
  ACTIVE: { label: "Sequence loopt", tone: "green" },
  COMPLETED: { label: "Sequence klaar", tone: "muted" },
  REPLIED: { label: "Gereageerd", tone: "green" },
  BOUNCED: { label: "Bounce", tone: "red" },
  UNSUBSCRIBED: { label: "Afgemeld", tone: "red" },
  STOPPED: { label: "Gestopt", tone: "amber" },
  CANCELLED: { label: "Geannuleerd", tone: "muted" },
  FAILED: { label: "Mislukt", tone: "red" },
};

export const CLASS_META: Record<ReplyClass, { label: string; tone: "green" | "amber" | "red" | "blue" | "muted" }> = {
  INTERESTED: { label: "Geïnteresseerd", tone: "green" },
  QUESTION: { label: "Vraag", tone: "blue" },
  NOT_NOW: { label: "Niet nu", tone: "amber" },
  NOT_INTERESTED: { label: "Geen interesse", tone: "red" },
  WRONG_PERSON: { label: "Verkeerde persoon", tone: "amber" },
  OOO: { label: "Afwezig", tone: "muted" },
  UNSUBSCRIBE: { label: "Afmelding", tone: "red" },
  OTHER: { label: "Overig", tone: "muted" },
};

export const DISPOSITIONS: Array<{ value: Exclude<Disposition, "UNSUBSCRIBED">; label: string }> = [
  { value: "INTERESTED", label: "Geïnteresseerd" }, { value: "MEETING", label: "Afspraak gepland" }, { value: "NOT_NOW", label: "Later opvolgen" },
  { value: "NOT_INTERESTED", label: "Geen interesse" }, { value: "WRONG_PERSON", label: "Verkeerde persoon" }, { value: "CLOSED", label: "Gesloten" },
];

export const INBOX_TABS: Array<{ key: InboxTab; label: string }> = [
  { key: "needs_action", label: "Actie nodig" }, { key: "waiting", label: "Wacht op reactie" }, { key: "sequences", label: "Lopende sequences" },
  { key: "done", label: "Afgehandeld" }, { key: "all", label: "Alles" },
];

const BLOCKER_LABEL: Record<string, string> = {
  ALREADY_CONTACTED_EMAIL: "Dit adres is al eerder benaderd",
  ALREADY_CONTACTED_DOMAIN: "Dit bedrijf (domein) is al eerder benaderd",
  EXISTING_CRM_LEAD: "Staat al als lead in het CRM",
  EXISTING_CRM_LEAD_DOMAIN: "Bedrijf staat al in het CRM",
  NO_MESSAGE: "Geen e-mail opgesteld",
  NO_NAMED_RECIPIENT: "Geen benoemde ontvanger",
  ROLE_NOT_DECISION_MAKER: "Geen beslisser-rol",
  NO_RECIPIENT: "Geen e-mailadres",
  INVALID_EMAIL: "Ongeldig e-mailadres",
  GENERIC_ADDRESS_NOT_A_RECIPIENT: "Algemeen adres (info@ e.d.)",
  RUN_STOPPED: "Run is gestopt",
  RUN_FAILED: "Run is mislukt",
  SENDING_DISABLED: "Verzenden staat uit",
  NOT_PUSHED: "Nog niet bij Smartlead",
  NO_INBOUND_MESSAGE: "Er is nog geen reactie om op te antwoorden",
  BOUNCED: "E-mailadres bounced",
  REPLY_IN_PROGRESS: "Er wordt al een antwoord verstuurd",
  PROVIDER_SEND_FAILED: "Smartlead kon het antwoord niet versturen",
};

export function blockerLabel(code: string): string {
  if (BLOCKER_LABEL[code]) return BLOCKER_LABEL[code];
  const sup = /^SUPPRESSED_(EMAIL|DOMAIN|COMPANY|CONTACT):(.+)$/.exec(code);
  if (sup) {
    const what = { EMAIL: "E-mailadres", DOMAIN: "Domein", COMPANY: "Bedrijf", CONTACT: "Contact" }[sup[1] as "EMAIL"];
    const why = { unsubscribe: "afgemeld", bounce: "bounce", do_not_contact: "niet benaderen", manual_exclusion: "uitgesloten", customer: "klant", wrong_target: "verkeerde persoon" }[sup[2]!] ?? sup[2];
    return `${what} geblokkeerd (${why})`;
  }
  if (code.startsWith("NOT_READY:")) return `Niet READY (${code.slice(10)})`;
  if (code.startsWith("EMAIL_NOT_ELIGIBLE:")) return `E-mail niet geschikt (${code.slice(19)})`;
  return code;
}

export function stepProgress(s: { steps_sent: number; steps_total: number }): string {
  return `${Math.min(s.steps_sent, s.steps_total)}/${s.steps_total}`;
}

/** Client-side check before the confirm step; the server re-validates everything. */
export function replyProblems(body: string): string[] {
  const t = body.trim();
  const out: string[] = [];
  if (t.length < 2) out.push("Antwoord is leeg.");
  if (t.length > 5000) out.push("Antwoord is te lang (max 5000 tekens).");
  return out;
}

export function inboxQuery(tab: InboxTab, q: string, page: number, size: number, viewAs: string | null): string {
  const p = new URLSearchParams();
  if (tab !== "all") p.set("status", tab);
  if (q.trim()) p.set("q", q.trim());
  p.set("limit", String(size));
  p.set("offset", String(page * size));
  if (viewAs) p.set("view_as", viewAs);
  return p.toString();
}

/** The latest inbound message with a usable (guard-approved) suggestion, if any. */
export function latestSuggestion(messages: ThreadMessage[]): ThreadMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.direction === "INBOUND") return m.suggested_reply_status === "READY" && m.suggested_reply ? m : null;
  }
  return null;
}
