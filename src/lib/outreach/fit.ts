import type { Evidence, SignalType } from "./research";

export type FitClass = "GOOD_FIT" | "POSSIBLE_FIT" | "SKIP";

export interface FitResult {
  classification: FitClass;
  positive_signals: string[];
  negative_signals: string[];
  reason: string;
  evidence_confidence: "high" | "medium" | "low";
}

/** Order = preference for the outreach angle. */
export const ANGLE_PRIORITY: SignalType[] = [
  "RESCHEDULE_BY_PHONE",
  "APPOINTMENT_BY_PHONE",
  "PHONE_HOURS",
  "EMERGENCY_ROUTING",
  "RECEPTION_HIRING",
  "PHONE_CTA",
  "WEEKEND_CLOSED",
  "MULTI_LOCATION",
  "FAQ_PRESENT",
];

/**
 * Deterministic, explainable classification (no fake 0–100 score).
 * GOOD_FIT: ≥1 strong, evidence-backed positive signal and no blocking negative.
 * POSSIBLE_FIT: niche relevant, only weak/no company-specific evidence.
 * SKIP: existing equivalent voice AI, no website evidence at all, or niche mismatch.
 */
export function classifyFit(input: { facts: Evidence[]; pagesFetched: number; nicheRelevant: boolean | null }): FitResult {
  const pos = input.facts.filter((f) => f.polarity === "positive");
  const neg = input.facts.filter((f) => f.polarity === "negative");
  const strongPos = pos.filter((f) => f.strength === "strong");
  const positive_signals = [...new Set(pos.map((f) => f.signal))];
  const negative_signals = [...new Set(neg.map((f) => f.signal))];
  const distinctStrong = new Set(strongPos.map((f) => f.signal)).size;
  const evidence_confidence = distinctStrong >= 2 ? "high" : distinctStrong === 1 ? "medium" : "low";

  if (input.pagesFetched === 0) {
    return { classification: "SKIP", positive_signals, negative_signals, reason: "INSUFFICIENT_EVIDENCE: no website pages could be fetched", evidence_confidence: "low" };
  }
  if (neg.some((f) => f.signal === "EXISTING_VOICE_AI")) {
    return { classification: "SKIP", positive_signals, negative_signals, reason: "EXISTING_VOICE_AI: website indicates an AI phone assistant is already used", evidence_confidence };
  }
  if (input.nicheRelevant === false) {
    return { classification: "SKIP", positive_signals, negative_signals, reason: "NICHE_MISMATCH: category does not match campaign niche", evidence_confidence };
  }
  if (strongPos.length > 0) {
    const sig = [...new Set(strongPos.map((f) => f.signal))].join(", ");
    const caveat = negative_signals.length ? ` (note: ${negative_signals.join(", ")})` : "";
    return { classification: "GOOD_FIT", positive_signals, negative_signals, reason: `Evidence-backed phone-process signal(s): ${sig}${caveat}`, evidence_confidence };
  }
  return {
    classification: "POSSIBLE_FIT",
    positive_signals,
    negative_signals,
    reason: pos.length ? `Niche relevant; only weak signals (${positive_signals.join(", ")})` : "Niche relevant; no company-specific phone-process evidence found",
    evidence_confidence,
  };
}

export function bestAngle(facts: Evidence[]): Evidence | null {
  for (const s of ANGLE_PRIORITY) {
    const f = facts.find((e) => e.signal === s && e.polarity === "positive");
    if (f) return f;
  }
  return null;
}
