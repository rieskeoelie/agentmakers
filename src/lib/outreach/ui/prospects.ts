import type { EvidenceItem, FitClass, ProspectOutcome, ProspectQueueState } from "./types";

export interface ProspectFilters {
  run_id: string;
  fit: "" | FitClass;
  status: "" | ProspectOutcome | ProspectQueueState;
  email: "" | "eligible" | "review_only" | "not_eligible" | "has_email" | "none";
  location: string;
  q: string;
}

export const EMPTY_FILTERS: ProspectFilters = { run_id: "", fit: "", status: "", email: "", location: "", q: "" };
export const PAGE_SIZE = 25;

export const STATUS_OPTIONS: Array<{ value: ProspectFilters["status"]; label: string }> = [
  { value: "", label: "Alle statussen" },
  { value: "READY", label: "READY" },
  { value: "NEEDS_REVIEW", label: "NEEDS_REVIEW" },
  { value: "BLOCKED", label: "BLOCKED" },
  { value: "SKIPPED", label: "Overgeslagen (fit)" },
  { value: "CONTACT_NOT_FOUND", label: "Geen contact" },
  { value: "DECISION_MAKER_EMAIL_NOT_FOUND", label: "Geen e-mail beslisser" },
  { value: "EMAIL_NOT_ELIGIBLE", label: "E-mail niet bruikbaar" },
  { value: "FAILED", label: "Mislukt" },
  { value: "PENDING", label: "Wacht" },
  { value: "IN_PROGRESS", label: "Bezig" },
  { value: "CANCELLED", label: "Geannuleerd" },
];

export const EMAIL_OPTIONS: Array<{ value: ProspectFilters["email"]; label: string }> = [
  { value: "", label: "Alle e-mailstatussen" },
  { value: "eligible", label: "Geverifieerd (eligible)" },
  { value: "review_only", label: "Alleen na review" },
  { value: "not_eligible", label: "Niet bruikbaar" },
  { value: "has_email", label: "Heeft e-mail" },
  { value: "none", label: "Geen e-mail" },
];

/** Query string for /api/outreach/prospects (empty filters omitted). */
export function prospectQuery(f: ProspectFilters, page: number, viewAs?: string | null, size: number = PAGE_SIZE): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (typeof v === "string" && v.trim()) p.set(k, v.trim());
  p.set("limit", String(size));
  p.set("offset", String(Math.max(0, page) * size));
  if (viewAs) p.set("view_as", viewAs);
  return p.toString();
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Lifecycle shown in tables: final outcome, or the queue state while still processing. */
export function lifecycle(p: { outcome: ProspectOutcome | null; queue_state: ProspectQueueState }): ProspectOutcome | ProspectQueueState {
  return p.outcome ?? p.queue_state;
}

export const OUTCOME_META: Record<string, { label: string; color: string; bg: string }> = {
  READY: { label: "READY", color: "#166534", bg: "#DCFCE7" },
  NEEDS_REVIEW: { label: "NEEDS_REVIEW", color: "#B45309", bg: "#FEF3C7" },
  BLOCKED: { label: "BLOCKED", color: "#991B1B", bg: "#FEE2E2" },
  FAILED: { label: "Mislukt", color: "#991B1B", bg: "#FEE2E2" },
  SKIPPED: { label: "Overgeslagen", color: "#475569", bg: "#F1F5F9" },
  CONTACT_NOT_FOUND: { label: "Geen contact", color: "#475569", bg: "#F1F5F9" },
  DECISION_MAKER_EMAIL_NOT_FOUND: { label: "Geen e-mail", color: "#475569", bg: "#F1F5F9" },
  EMAIL_NOT_ELIGIBLE: { label: "E-mail onbruikbaar", color: "#475569", bg: "#F1F5F9" },
  PENDING: { label: "Wacht", color: "#0369A1", bg: "#E0F2FE" },
  IN_PROGRESS: { label: "Bezig", color: "#0369A1", bg: "#E0F2FE" },
  CANCELLED: { label: "Geannuleerd", color: "#64748B", bg: "#F1F5F9" },
  DONE: { label: "Klaar", color: "#475569", bg: "#F1F5F9" },
};

export const FIT_META: Record<FitClass, { color: string; bg: string }> = {
  GOOD_FIT: { color: "#166534", bg: "#DCFCE7" },
  POSSIBLE_FIT: { color: "#B45309", bg: "#FEF3C7" },
  SKIP: { color: "#475569", bg: "#F1F5F9" },
};

export function verificationLabel(status: string | null | undefined, eligibility?: string | null): { label: string; tone: "good" | "warn" | "bad" | "none" } {
  if (!status) return { label: "—", tone: "none" };
  if (eligibility === "ELIGIBLE") return { label: `${status} · eligible`, tone: "good" };
  if (eligibility === "NOT_ELIGIBLE" || status === "invalid" || status === "disposable") return { label: `${status} · onbruikbaar`, tone: "bad" };
  return { label: `${status} · review`, tone: "warn" };
}

/** FACT vs INFERENCE are never mixed: facts come from the website, inferences are reasoning. */
export function splitEvidence<T extends Pick<EvidenceItem, "kind">>(items: T[]): { facts: T[]; inferences: T[] } {
  return { facts: items.filter((e) => e.kind === "FACT"), inferences: items.filter((e) => e.kind === "INFERENCE") };
}

/** Groups website facts into Company Brain themes. */
export const BRAIN_THEMES: Array<{ key: string; label: string; signals: string[] }> = [
  { key: "phone", label: "Telefoonproces", signals: ["APPOINTMENT_BY_PHONE", "RESCHEDULE_BY_PHONE", "PHONE_CTA", "RECEPTION_HIRING"] },
  { key: "hours", label: "Openingstijden / bereikbaarheid", signals: ["PHONE_HOURS", "WEEKEND_CLOSED"] },
  { key: "booking", label: "Afspraken / boeken", signals: ["ONLINE_BOOKING"] },
  { key: "emergency", label: "Spoed / doorverwijzing", signals: ["EMERGENCY_ROUTING"] },
  { key: "other", label: "Overige context", signals: ["FAQ_PRESENT", "MULTI_LOCATION", "EXISTING_VOICE_AI"] },
];

export function themeFacts<T extends Pick<EvidenceItem, "kind" | "signal">>(evidence: T[]): Array<{ key: string; label: string; facts: T[] }> {
  const facts = evidence.filter((e) => e.kind === "FACT");
  const known = new Set(BRAIN_THEMES.flatMap((t) => t.signals));
  return BRAIN_THEMES.map((t) => ({
    key: t.key,
    label: t.label,
    facts: facts.filter((f) => (t.key === "other" ? !f.signal || t.signals.includes(f.signal) || !known.has(f.signal) : !!f.signal && t.signals.includes(f.signal))),
  }));
}

export const STEP_LABEL: Record<string, string> = {
  RESEARCH: "Website onderzoeken", COMPANY_BRAIN: "Company Brain", FIT: "Fit bepalen", DECISION_MAKER: "Beslisser zoeken", EMAIL: "E-mail zoeken",
  ELIGIBILITY: "E-mail controleren", PERSONALIZATION: "Mail opstellen", DONE: "Klaar",
};
