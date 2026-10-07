/**
 * Run and prospect state machines. The database functions are authoritative; this TypeScript mirror is used
 * for typing and is verified against the SQL behaviour by tests.
 */
export const RUN_STATUSES = ["CREATED", "QUEUED", "RUNNING", "PAUSED", "COMPLETED", "STOPPED", "FAILED"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["COMPLETED", "STOPPED", "FAILED"];

export const RUN_ACTIONS = ["start", "pause", "resume", "stop"] as const;
export type RunAction = (typeof RUN_ACTIONS)[number];

export type SetupState = "PENDING" | "IN_PROGRESS" | "DONE" | "FAILED";

/** Result of applying a user action: a new status, a no-op (already in effect), or invalid (to = null, noop = false). */
export function planRunAction(status: RunStatus, action: RunAction, setupDone: boolean): { to: RunStatus | null; noop: boolean } {
  switch (action) {
    case "start":
      if (status === "CREATED") return { to: "QUEUED", noop: false };
      if (status === "QUEUED" || status === "RUNNING") return { to: null, noop: true };
      break;
    case "pause":
      if (status === "QUEUED" || status === "RUNNING") return { to: "PAUSED", noop: false };
      if (status === "PAUSED") return { to: null, noop: true };
      break;
    case "resume":
      if (status === "PAUSED") return { to: setupDone ? "RUNNING" : "QUEUED", noop: false };
      if (status === "QUEUED" || status === "RUNNING") return { to: null, noop: true };
      break;
    case "stop":
      if (status === "CREATED" || status === "QUEUED" || status === "RUNNING" || status === "PAUSED") return { to: "STOPPED", noop: false };
      if (status === "STOPPED") return { to: null, noop: true };
      break;
  }
  return { to: null, noop: false };
}

/** Pipeline progress of one prospect (DISCOVER → DEDUPE → PREFILTER happen once per run, during setup). */
export const PIPELINE_STEPS = ["RESEARCH", "COMPANY_BRAIN", "FIT", "DECISION_MAKER", "EMAIL", "ELIGIBILITY", "PERSONALIZATION", "DONE"] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const PROSPECT_QUEUE_STATES = ["PENDING", "IN_PROGRESS", "DONE", "FAILED", "CANCELLED"] as const;
export type ProspectQueueState = (typeof PROSPECT_QUEUE_STATES)[number];

/** READY / NEEDS_REVIEW / BLOCKED plus the validated Phase 0 diagnostic outcomes, kept verbatim. */
export type ProspectOutcome =
  | "READY" | "NEEDS_REVIEW" | "BLOCKED" | "SKIPPED" | "CONTACT_NOT_FOUND" | "DECISION_MAKER_EMAIL_NOT_FOUND" | "EMAIL_NOT_ELIGIBLE" | "FAILED";

/** Live progress marker derived from the provider call being made (monotonic). */
export function stepForCall(provider: string, method: string): PipelineStep | null {
  if (provider === "hunter" && (method === "domainSearch" || method === "emailFinder")) return "DECISION_MAKER";
  if (provider === "publicSearch" || provider === "registry") return "DECISION_MAKER";
  if (provider === "hunter" && method === "verify") return "ELIGIBILITY";
  if (provider === "prospeo") return "EMAIL";
  if (provider === "llm" && method === "personalization_hook") return "PERSONALIZATION";
  return null;
}

export const stepRank = (s: PipelineStep): number => PIPELINE_STEPS.indexOf(s);
