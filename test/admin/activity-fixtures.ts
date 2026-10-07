import type { RunFunnel, TimelineEvent } from "../../src/lib/outreach/ui/types.js";

let id = 1000;
const at = (hhmm: string, day = "2026-10-07") => `${day}T${hhmm}:00+02:00`;
export const ev = (time: string, type: string, data: Record<string, unknown> | null = null, prospect: string | null = null, day?: string): TimelineEvent =>
  ({ id: id--, type, actor: prospect ? "worker" : "system", data, prospect_id: prospect, created_at: at(time, day) });

/** Mirrors the real production event sequence of a completed run (newest first). */
export const completedRun: TimelineEvent[] = [
  ev("15:50", "RUN_STATUS", { from: "RUNNING", to: "COMPLETED" }),
  ev("15:50", "PROSPECT_DONE", { outcome: "CONTACT_NOT_FOUND" }, "p1"),
  ev("15:49", "PROSPECT_DONE", { outcome: "CONTACT_NOT_FOUND" }, "p2"),
  ev("15:47", "PROSPECT_CLAIMED", { attempt: 1, reservation_eur: 1 }, "p1"),
  ev("15:47", "PROSPECT_CLAIMED", { attempt: 1, reservation_eur: 1 }, "p2"),
  ev("15:47", "PROSPECT_DONE", { outcome: "CONTACT_NOT_FOUND" }, "p3"),
  ev("15:47", "PROSPECT_DONE", { outcome: "CONTACT_NOT_FOUND" }, "p4"),
  ev("15:46", "PROSPECT_DONE", { outcome: "CONTACT_NOT_FOUND" }, "p5"),
  ev("15:45", "PROSPECT_CLAIMED", { attempt: 1 }, "p3"),
  ev("15:45", "PROSPECT_DONE", { outcome: "SKIPPED" }, "p6"),
  ev("15:45", "PROSPECT_CLAIMED", { attempt: 1 }, "p4"),
  ev("15:45", "PROSPECT_DONE", { outcome: "DECISION_MAKER_EMAIL_NOT_FOUND" }, "p7"),
  ev("15:44", "PROSPECT_CLAIMED", { attempt: 1 }, "p5"),
  ev("15:44", "PROSPECT_DONE", { outcome: "SKIPPED" }, "p8"),
  ev("15:44", "PROSPECT_CLAIMED", { attempt: 1 }, "p6"),
  ev("15:44", "PROSPECT_DONE", { outcome: "SKIPPED" }, "p9"),
  ev("15:44", "PROSPECT_CLAIMED", { attempt: 1 }, "p7"),
  ev("15:44", "PROSPECT_DONE", { outcome: "SKIPPED" }, "p10"),
  ev("15:44", "PROSPECT_CLAIMED", { attempt: 1 }, "p8"),
  ev("15:44", "SETUP_DONE", { blocked: 0, inserted: 10, returned: 80, selected: 10 }),
  ev("15:44", "SETUP_CLAIMED", { attempt: 1 }),
  ev("15:44", "RUN_STATUS", { from: "QUEUED", to: "RUNNING" }),
  ev("15:44", "RUN_STATUS", { from: "CREATED", to: "QUEUED", action: "start" }),
  ev("15:44", "RUN_CREATED", { name: "Go-live test 3" }),
];

export const completedFunnel: RunFunnel = {
  discovered: 80, selected: 10, total: 10, researched: 6, good_fit: 6, possible_fit: 0, decision_makers: 1, business_emails: 0, eligible_emails: 0,
  ready: 0, needs_review: 0, blocked: 0, skipped: 10, failed: 0, pending: 0, in_progress: 0, finished: 10, cancelled: 0,
};

/** A run whose company search failed, spanning two days. */
export const failedRun: TimelineEvent[] = [
  ev("08:20", "RUN_STATUS", { from: "RUNNING", to: "FAILED" }),
  ev("08:20", "SETUP_FAILED", { error: "SCHEMA_VALIDATION_FAILED (campaign_brain): [ { \"expected\": \"array\", \"code\": \"invalid_type\", \"path\": [\"category_keywords\"] } ]", attempts: 3 }),
  ev("08:19", "SETUP_RETRY_SCHEDULED", { error: "SCHEMA_VALIDATION_FAILED", attempts: 2 }),
  ev("08:18", "SETUP_RETRY_SCHEDULED", { error: "SCHEMA_VALIDATION_FAILED", attempts: 1 }),
  ev("08:18", "SETUP_CLAIMED", { attempt: 1 }),
  ev("23:58", "RUN_STATUS", { from: "QUEUED", to: "RUNNING" }, null, "2026-10-06"),
  ev("23:58", "RUN_STATUS", { from: "CREATED", to: "QUEUED" }, null, "2026-10-06"),
  ev("23:57", "RUN_CREATED", { name: "Go-live test" }, null, "2026-10-06"),
];

/** Sending activity as seen on the production test run. */
export const sendingRun: TimelineEvent[] = [
  ev("11:16", "PROVIDER_CAMPAIGN", { status: "PAUSED", error: "KILL_SWITCH", campaign_id: "4094821" }),
  ev("11:15", "PROMOTED_TO_LEAD", { lead_id: "l1", send_id: "s1" }, "p1"),
  ev("11:15", "MANUAL_REPLY_SENT", { error: null, send_id: "s1", message_id: "m2" }, "p1"),
  ev("11:15", "MANUAL_REPLY_STARTED", { send_id: "s1", message_id: "m2" }, "p1"),
  ev("11:14", "REPLY_CLASSIFIED", { classification: "QUESTION", source: "llm" }, "p1"),
  ev("11:14", "SEND_STOPPED", { reason: "REPLIED", send_id: "s1" }, "p1"),
  ev("11:14", "EMAIL_REPLY", { send_id: "s1", message_id: "m1" }, "p1"),
  ev("11:13", "PROVIDER_CAMPAIGN", { status: "PAUSED", error: "KILL_SWITCH" }),
  ev("10:51", "EMAIL_SENT", { step: 1, send_id: "s1" }, "p1"),
  ev("10:40", "SEND_PUSHED", { send_id: "s1", campaign_id: "4094821" }, "p1"),
  ev("10:40", "PROVIDER_CAMPAIGN", { status: "ACTIVE", error: null }),
  ev("10:40", "SEND_QUEUED", { source: "manual" }, "p1"),
  ev("10:40", "SEND_CANCELLED", { reason: "requeue" }, "p1"),
  ev("10:09", "SEND_FAILED", { error: "Smartlead: \"max_leads_per_day\" is not allowed" }, "p1"),
  ev("10:09", "PROVIDER_CAMPAIGN", { status: "PAUSED", error: "KILL_SWITCH" }),
  ev("10:09", "PROVIDER_CAMPAIGN", { status: "PAUSED", error: "KILL_SWITCH" }),
];
