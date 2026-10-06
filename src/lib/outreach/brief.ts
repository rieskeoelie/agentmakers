import type { CampaignBrain } from "./brain";
import type { Eligibility, EmailSource, VerificationStatus } from "./eligibility";
import { bestAngle, type FitResult } from "./fit";
import type { Evidence, Inference, SignalType } from "./research";

export interface ProspectBrief {
  company: string;
  website: string;
  domain: string;
  city: string | null;
  contact_name: string | null;
  contact_first_name: string | null;
  contact_title: string | null;
  contact_source: string | null;
  email: string | null;
  email_source: EmailSource;
  verification_status: VerificationStatus;
  email_eligibility: Eligibility;
  fit: FitResult;
  observed_facts: Evidence[];
  inferences: Inference[];
  best_outreach_angle: { signal: SignalType; evidence_id: string; fact: string; source_url: string } | null;
  relevant_capability: string;
  source_urls: string[];
  confidence: "high" | "medium" | "low";
  risks: string[];
}

export function buildBrief(input: {
  company: string;
  website: string;
  domain: string;
  city: string | null;
  contact: { name: string | null; first_name: string | null; title: string | null; source: string | null };
  email: string | null;
  email_source: EmailSource;
  verification_status: VerificationStatus;
  email_eligibility: Eligibility;
  eligibility_reasons: string[];
  fit: FitResult;
  facts: Evidence[];
  inferences: Inference[];
  brain: CampaignBrain;
  suspicious_count: number;
}): ProspectBrief {
  const angle = bestAngle(input.facts);
  const capability =
    (angle && (input.brain.capability_by_signal as Record<string, string | null>)[angle.signal]) || input.brain.default_capability;
  const risks: string[] = [];
  if (!input.contact.name) risks.push("No named decision maker; generic or no address.");
  if (input.email_eligibility !== "ELIGIBLE") risks.push(`Email not auto-eligible: ${input.eligibility_reasons.join(", ") || input.email_eligibility}`);
  if (input.fit.negative_signals.length) risks.push(`Negative signals: ${input.fit.negative_signals.join(", ")}`);
  if (input.fit.evidence_confidence === "low") risks.push("Low evidence confidence.");
  if (input.suspicious_count) risks.push(`${input.suspicious_count} instruction-like website snippet(s) were quarantined and ignored.`);
  if (input.contact.source === "hunter_metadata") risks.push("Contact chosen on Hunter seniority metadata, not an explicit priority title.");
  return {
    company: input.company,
    website: input.website,
    domain: input.domain,
    city: input.city,
    contact_name: input.contact.name,
    contact_first_name: input.contact.first_name,
    contact_title: input.contact.title,
    contact_source: input.contact.source,
    email: input.email,
    email_source: input.email_source,
    verification_status: input.verification_status,
    email_eligibility: input.email_eligibility,
    fit: input.fit,
    observed_facts: input.facts,
    inferences: input.inferences,
    best_outreach_angle: angle ? { signal: angle.signal, evidence_id: angle.id, fact: angle.fact, source_url: angle.source_url } : null,
    relevant_capability: capability,
    source_urls: [...new Set(input.facts.map((f) => f.source_url))],
    confidence: input.fit.evidence_confidence,
    risks,
  };
}
