/**
 * Extension point for an OFFICIAL company-registry source (e.g. a chamber-of-commerce / trade-register API).
 *
 * No registry provider is integrated yet: nothing here calls an external service or needs credentials.
 * When a provider is added it implements `RegistrySource` and is passed as `PipelineDeps.registry`
 * (wrapped by `CallRecorder.registry` in the worker so paid lookups are journaled and never repeated).
 *
 * Evidence stage (contacts.ts `discoverContact`): the registry runs
 *   after  Hunter Domain Search and the company's own website (incl. same-domain team pages),
 *   before the public-search fallback,
 * and only when no FULLY named decision maker was found yet. A first-name-only owner from the company's own site
 * ("Richard — Eigenaar") can be completed by a registry officer with the same first name: that surname then comes
 * from an authoritative record, not from inference. Officers still have to match the campaign's role rules.
 *
 * Registry data must never be invented or guessed: return `not_found` / `ambiguous` instead.
 */

export type RegistryConfidence = "authoritative" | "high" | "medium";

export interface RegistryEvidence {
  /** Name of the registry / dataset, e.g. "KvK Handelsregister". */
  source_name: string;
  /** Public reference to the record when one exists (stored for audit, not fetched by the pipeline). */
  source_url: string | null;
  /** Registry's own record id (e.g. registration number). */
  record_id: string | null;
  retrieved_at: string;
}

export interface RegistryCompanyIdentity {
  legal_name: string;
  trade_names: string[];
  registration_id: string | null;
  jurisdiction: string;
  address: string | null;
  city: string | null;
  website: string | null;
  status: "active" | "inactive" | "unknown";
}

export interface RegistryOfficer {
  full_name: string;
  first_name: string;
  last_name: string;
  /** Role / function exactly as the registry states it (e.g. "Bestuurder", "Eigenaar", "Vennoot"). */
  role: string;
  since: string | null;
  evidence: RegistryEvidence;
  confidence: RegistryConfidence;
}

export type RegistryLookupResult =
  | { status: "found"; company: RegistryCompanyIdentity; officers: RegistryOfficer[]; match: { on: Array<"name" | "city" | "address" | "website" | "registration_id">; confidence: RegistryConfidence }; evidence: RegistryEvidence }
  | { status: "not_found"; evidence: RegistryEvidence | null }
  /** More than one registered company could be this prospect — never resolved by guessing. */
  | { status: "ambiguous"; candidates: number; evidence: RegistryEvidence | null };

export interface RegistryLookupInput {
  company_name: string;
  domain: string;
  city: string | null;
  country: string;
  address: string | null;
}

export interface RegistrySource {
  /** Stable provider name for audit + cost records. */
  readonly name: string;
  lookup(input: RegistryLookupInput, prospect: string): Promise<RegistryLookupResult>;
}

/** Audit trace stored on the contact selection. */
export type RegistryTrace =
  | { status: "NOT_CONFIGURED" }
  | { status: "NOT_NEEDED"; reason: string }
  | { status: "ERROR"; source: string; error: string }
  | { status: "NOT_FOUND" | "AMBIGUOUS" | "NO_COMPANY_MATCH"; source: string }
  | { status: "FOUND"; source: string; company: string; officers_seen: number; selected: { full_name: string; role: string; confidence: RegistryConfidence } | null; rejected: Array<{ full_name: string; role: string; reason: string }> };
