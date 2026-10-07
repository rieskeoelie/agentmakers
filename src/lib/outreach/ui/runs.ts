import { planRunAction, RUN_ACTIONS, type PipelineStep, type ProspectQueueState, type RunAction, type RunStatus } from "../orchestration/states";
import { percent } from "./format";
import type { RunFunnel, RunSummary } from "./types";

/** Labels/colours for run states (Dutch UI). */
export const RUN_STATUS_META: Record<RunStatus, { label: string; color: string; bg: string; hint: string }> = {
  CREATED:   { label: "Aangemaakt", color: "#475569", bg: "#F1F5F9", hint: "Nog niet gestart." },
  QUEUED:    { label: "In wachtrij", color: "#0369A1", bg: "#E0F2FE", hint: "Wacht op een worker; start zo." },
  RUNNING:   { label: "Loopt", color: "#0F766E", bg: "#CCFBF1", hint: "Prospects worden onderzocht." },
  PAUSED:    { label: "Gepauzeerd", color: "#B45309", bg: "#FEF3C7", hint: "Er wordt niets nieuws opgepakt." },
  COMPLETED: { label: "Klaar", color: "#166534", bg: "#DCFCE7", hint: "Alle prospects zijn verwerkt." },
  STOPPED:   { label: "Gestopt", color: "#475569", bg: "#E2E8F0", hint: "Handmatig gestopt; resterende prospects geannuleerd." },
  FAILED:    { label: "Mislukt", color: "#991B1B", bg: "#FEE2E2", hint: "De run kon niet worden opgezet." },
};

export const PAUSE_REASON_LABEL: Record<string, string> = {
  BUDGET_EXHAUSTED: "Budget op — verhoog het budget en hervat.",
  MANUAL: "Handmatig gepauzeerd.",
};

export type RunGroup = "active" | "paused" | "completed" | "ended";
export const RUN_GROUPS: Array<{ key: RunGroup; label: string; statuses: RunStatus[] }> = [
  { key: "active", label: "Actief", statuses: ["RUNNING", "QUEUED", "CREATED"] },
  { key: "paused", label: "Gepauzeerd", statuses: ["PAUSED"] },
  { key: "completed", label: "Afgerond", statuses: ["COMPLETED"] },
  { key: "ended", label: "Mislukt / gestopt", statuses: ["FAILED", "STOPPED"] },
];

export function groupRuns<T extends { status: RunStatus }>(runs: T[]): Record<RunGroup, T[]> {
  const out: Record<RunGroup, T[]> = { active: [], paused: [], completed: [], ended: [] };
  for (const r of runs) {
    const g = RUN_GROUPS.find((x) => x.statuses.includes(r.status));
    if (g) out[g.key].push(r);
  }
  return out;
}

const ACTION_LABEL: Record<RunAction, string> = { start: "Start", pause: "Pauzeer", resume: "Hervat", stop: "Stop" };

/**
 * Buttons to offer for a run. Uses the shared state machine (states.ts, verified against the database);
 * the server stays authoritative and rejects anything invalid.
 */
export function runActions(run: { status: RunStatus; setup_state: string }): Array<{ action: RunAction; label: string }> {
  return RUN_ACTIONS.filter((a) => planRunAction(run.status, a, run.setup_state === "DONE").to !== null).map((a) => ({ action: a, label: ACTION_LABEL[a] }));
}

export function isLive(status: RunStatus): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

/** Progress = processed prospects / selected prospects. Before setup completes, progress is unknown (null). */
export function runProgress(run: Pick<RunSummary, "setup_state" | "funnel" | "status">): { finished: number; total: number; pct: number | null; label: string } {
  const f = run.funnel;
  if (run.setup_state !== "DONE") {
    const label = run.setup_state === "FAILED" ? "Opzetten mislukt" : run.status === "CREATED" ? "Niet gestart" : "Bedrijven zoeken…";
    return { finished: 0, total: 0, pct: null, label };
  }
  if (f.total === 0) return { finished: 0, total: 0, pct: 100, label: "Geen geschikte bedrijven gevonden" };
  return { finished: f.finished, total: f.total, pct: percent(f.finished, f.total), label: `${f.finished} / ${f.total} verwerkt` };
}

export interface FunnelStep {
  key: keyof RunFunnel;
  label: string;
  value: number;
}

/** Discovered → researched → GOOD_FIT → decision makers → business emails → READY → NEEDS_REVIEW */
export function funnelSteps(f: RunFunnel): FunnelStep[] {
  return [
    { key: "discovered", label: "Gevonden", value: f.discovered },
    { key: "researched", label: "Onderzocht", value: f.researched },
    { key: "good_fit", label: "GOOD_FIT", value: f.good_fit },
    { key: "decision_makers", label: "Beslissers", value: f.decision_makers },
    { key: "business_emails", label: "Zakelijke e-mails", value: f.business_emails },
    { key: "ready", label: "READY", value: f.ready },
    { key: "needs_review", label: "NEEDS_REVIEW", value: f.needs_review },
  ];
}

export function geography(c: { country: string; region?: string | null }): string {
  return [c.region, c.country].filter(Boolean).join(", ");
}

export function budgetUse(run: Pick<RunSummary, "spent_eur" | "budget_cap_eur">): number {
  return percent(Number(run.spent_eur), Number(run.budget_cap_eur));
}

/** Funnel row (index into funnelSteps) that a prospect at this pipeline step is working towards. */
const STEP_ROW: Record<PipelineStep, number> = {
  RESEARCH: 1, COMPANY_BRAIN: 1, FIT: 2, DECISION_MAKER: 3, EMAIL: 4, ELIGIBILITY: 4, PERSONALIZATION: 5, DONE: 6,
};

/**
 * The funnel row that is currently being processed, derived from existing state only:
 * - while the run is live and setup (company search) is not done → "Gevonden" (row 0);
 * - afterwards → the earliest step any still-open (PENDING / IN_PROGRESS) prospect of the run is at.
 * Returns null when nothing is processing (not live, finished, paused, failed) or prospects are not known yet.
 */
export function activeFunnelIndex(
  run: Pick<RunSummary, "status" | "setup_state">,
  prospects: Array<{ queue_state: ProspectQueueState; current_step: PipelineStep }> | null | undefined,
): number | null {
  if (!isLive(run.status)) return null;
  if (run.setup_state !== "DONE") return 0;
  if (!prospects) return null;
  let min: number | null = null;
  for (const p of prospects) {
    if (p.queue_state !== "PENDING" && p.queue_state !== "IN_PROGRESS") continue;
    const row = STEP_ROW[p.current_step] ?? 1;
    if (row > 5) continue;
    min = min === null ? row : Math.min(min, row);
  }
  return min;
}

export type FunnelRowState = "complete" | "active" | "future" | "idle";

/** complete before the active row, active (exactly one), future after it; "idle" for every row when nothing is processing. */
export function funnelRowState(index: number, active: number | null): FunnelRowState {
  if (active === null) return "idle";
  return index < active ? "complete" : index === active ? "active" : "future";
}
