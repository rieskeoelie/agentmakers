import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CostTracker } from "./cost";
import type { ProofResult, ProspectRecord } from "./pipeline";
import { ALL_STATUSES } from "./render";

/** Per-prospect funnel flags. Generic/role mailboxes never count as a decision-maker email. */
export function funnelFlags(p: ProspectRecord) {
  const researched = p.stages.website_fetch.status === "ok";
  const decision_maker_found = !!p.contact?.name;
  const business_email_found = decision_maker_found && !!p.contact?.email && !p.email_eligibility?.is_generic;
  const email_eligible = business_email_found && p.email_eligibility?.eligibility === "ELIGIBLE";
  return { researched, decision_maker_found, business_email_found, email_eligible, ready: p.status === "READY" };
}

export interface Funnel {
  companies_researched: number;
  named_decision_makers_found: number;
  business_emails_found: number;
  eligible_emails: number;
  ready_messages: number;
}

export function computeFunnel(result: ProofResult): Funnel {
  const f = result.prospects.map(funnelFlags);
  const n = (k: keyof ReturnType<typeof funnelFlags>) => f.filter((x) => x[k]).length;
  return {
    companies_researched: n("researched"),
    named_decision_makers_found: n("decision_maker_found"),
    business_emails_found: n("business_email_found"),
    eligible_emails: n("email_eligible"),
    ready_messages: n("ready"),
  };
}

export function statusCounts(result: ProofResult): Record<string, number> {
  return Object.fromEntries(ALL_STATUSES.map((s) => [s, result.prospects.filter((p) => p.status === s).length]));
}

const eur = (n: number) => `€${n.toFixed(4)}`;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formula injection from untrusted website/provider text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(result: ProofResult): string {
  const header = [
    "index", "status", "status_reasons", "warnings", "company", "website", "domain", "city", "category", "contact_name", "contact_title", "contact_source",
    "email", "verification_status", "email_eligibility", "fit", "fit_reason", "best_angle", "hook_level", "personalization_hook", "fit_sentence",
    "subject", "email_body", "evidence_count", "evidence_source_urls", "cost_eur", "failed_stage", "company_generic_emails_metadata", "email_source", "prospeo_result", "researched", "decision_maker_found", "business_email_found", "email_eligible",
  ];
  const rows = result.prospects.map((p) => {
    const failed = Object.entries(p.stages).find(([, s]) => s.status === "failed");
    return [
      p.index, p.status, p.status_reasons.join(" | "), p.warnings.join(" | "), p.company.company_name, p.pages[0]?.url ?? p.company.website, p.domain, p.company.city, p.company.category,
      p.contact?.name, p.contact?.title, p.contact?.source, p.contact?.email, p.verification_status, p.email_eligibility?.eligibility,
      p.fit?.classification, p.fit?.reason, p.brief?.best_outreach_angle?.signal, p.hook?.hook?.hook_level, p.hook?.hook?.personalization_hook, p.hook?.hook?.fit_sentence,
      p.email?.subject, p.email?.body, p.brief?.observed_facts.length ?? 0, p.brief?.source_urls.join(" ") ?? "", p.cost_eur.toFixed(4),
      failed ? `${failed[0]}: ${failed[1].reason}` : "",
      p.contact?.company_generic_emails?.join(" ") ?? "",
      p.contact?.email_source ?? "",
      p.prospeo ? `${p.prospeo.result}${"reason" in p.prospeo ? `:${p.prospeo.reason}` : ""}` : "",
      ...(() => { const f = funnelFlags(p); return [f.researched, f.decision_maker_found, f.business_email_found, f.email_eligible]; })(),
    ].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\n") + "\n";
}

function prospectMd(p: ProspectRecord): string {
  const L: string[] = [];
  L.push(`### ${p.index}. ${p.company.company_name} — **${p.status}**`);
  L.push("");
  L.push(`- Website: ${p.pages[0]?.url ?? p.company.website ?? "—"} (\`${p.domain}\`)  `);
  L.push(`- Category / location: ${p.company.category ?? "—"} / ${p.company.city ?? "—"}`);
  if (p.status_reasons.length) L.push(`- Status reasons: ${p.status_reasons.map((r) => `\`${r}\``).join(", ")}`);
  if (p.warnings.length) L.push(`- Warnings: ${p.warnings.map((r) => `\`${r}\``).join(", ")}`);
  L.push(`- Cost: ${eur(p.cost_eur)}`);
  if (p.contact) {
    L.push(`- Contact: ${p.contact.name ?? "—"} — ${p.contact.title ?? "—"} (source: ${p.contact.source}${p.contact.title_source_url ? `, title seen on ${p.contact.title_source_url}` : ""})`);
    if (p.prospeo && p.prospeo.result !== "not_run") {
      const pr = p.prospeo;
      L.push(`- Prospeo email fallback: **${pr.result}**${pr.result === "verified_email" ? ` → ${pr.email}` : ""}${"reason" in pr ? ` (${pr.reason})` : ""}${p.hunter_email_before_prospeo ? `; replaced review-only Hunter address ${p.hunter_email_before_prospeo}` : ""}`);
    }
    const sd = p.contact.same_domain_discovery;
    if (sd) {
      L.push(`- Same-domain team discovery: ${sd.candidates.length} candidate page(s); fetched (max 3): ${sd.fetched.join(", ") || "—"}${sd.site_search_query ? `; site search \`${sd.site_search_query}\`` : ""}`);
      for (const e of sd.errors) L.push(`  - Discovery error: ${e}`);
    }
    const ps = p.contact.public_search;
    if (ps) {
      L.push(`- Public search fallback: ${ps.queries.length} search(es) — ${ps.queries.map((q) => `\`${q}\``).join(", ")}`);
      if (ps.selected) L.push(`  - Selected: ${ps.selected.full_name} — ${ps.selected.title} (${ps.selected.confidence}, ${ps.selected.association}); result ${ps.selected.result_url} (metadata only, not fetched)  \n    > "${ps.selected.evidence}"`);
      for (const r of ps.rejected) L.push(`  - Rejected: ${r.name ?? "—"} / ${r.title ?? "—"} — ${r.reason} (${r.result_url})`);
      for (const e of ps.errors) L.push(`  - Search error: ${e}`);
    }
    if (p.contact.company_generic_emails?.length) L.push(`- Company generic mailbox(es) (metadata only, never a recipient): ${p.contact.company_generic_emails.join(", ")}`);
    L.push(`- Email: ${p.contact.email ?? "—"} — verification: \`${p.verification_status}\` — eligibility: **${p.email_eligibility?.eligibility ?? "—"}**${p.email_eligibility?.reasons.length ? ` (${p.email_eligibility.reasons.join(", ")})` : ""}`);
  }
  if (p.fit) L.push(`- Fit: **${p.fit.classification}** (${p.fit.evidence_confidence} confidence) — ${p.fit.reason}`);
  L.push("");
  L.push("<details><summary>Stages</summary>");
  L.push("");
  for (const [k, s] of Object.entries(p.stages)) L.push(`- ${k}: ${s.status}${s.reason ? ` — ${s.reason}` : ""}`);
  if (p.contact?.notes.length) L.push(...p.contact.notes.map((n) => `  - contact: ${n}`));
  if (p.fetch_errors.length) L.push(...p.fetch_errors.map((e) => `  - fetch error: ${e.url} — ${e.error}`));
  L.push("");
  L.push("</details>");
  L.push("");
  const facts = p.brief?.observed_facts ?? [];
  if (facts.length) {
    L.push("**Observed facts (from website)**");
    L.push("");
    for (const f of facts) L.push(`- \`${f.id}\` ${f.polarity === "negative" ? "➖" : "➕"} ${f.signal} (${f.strength}): ${f.fact}  \n  > "${f.snippet}"  \n  Source: ${f.source_url}`);
    L.push("");
  }
  if (p.brief?.inferences.length) {
    L.push("**Inferences (NOT facts — never stated as fact in outreach)**");
    L.push("");
    for (const i of p.brief.inferences) L.push(`- \`${i.id}\` ${i.text} _(based on ${i.based_on.join(", ")}; ${i.confidence})_`);
    L.push("");
  }
  if (p.brief?.risks.length) L.push(`**Risks:** ${p.brief.risks.join(" ")}`, "");
  if (p.quarantined_snippets.length) {
    L.push("**Quarantined instruction-like website text (ignored)**");
    for (const q of p.quarantined_snippets) L.push(`- ${q.source_url}: "${q.snippet}"`);
    L.push("");
  }
  if (p.hook?.rejections.length) {
    L.push("**Rejected hook attempts**");
    for (const r of p.hook.rejections) L.push(`- attempt ${r.attempt}: "${r.output?.personalization_hook ?? "—"}" → ${r.issues.join(", ")}`);
    L.push("");
  }
  if (p.email) {
    L.push(`**Rendered email** (hook level ${p.email.variant.hook_level}, ${p.email.word_count} words${p.hook?.hook?.evidence_ids.length ? `, hook cites ${p.hook.hook.evidence_ids.join(", ")}` : ""})`);
    L.push("");
    L.push("```text");
    L.push(`Subject: ${p.email.subject}`);
    L.push("");
    L.push(p.email.body);
    L.push("```");
    L.push("");
  }
  return L.join("\n");
}

export function toMarkdown(result: ProofResult, cost: CostTracker, mode: string): string {
  const L: string[] = [];
  const fitCount = (s: string) => result.prospects.filter((p) => p.fit?.classification === s).length;
  L.push(`# Phase 0 proof report — ${result.campaign.niche} / ${result.campaign.country}${result.campaign.region ? ` / ${result.campaign.region}` : ""}`);
  L.push("");
  L.push(`Mode: **${mode}** · Sending: **${result.sending}** · Limit: ${result.limit} (hard max 20) · Started ${result.started_at} · Finished ${result.finished_at}`);
  L.push("");
  if (result.brain_error) L.push(`> **Campaign Brain failed:** ${result.brain_error}`, "");
  if (result.discovery_error) L.push(`> **Company discovery failed:** ${result.discovery_error}`, "");
  L.push("## Summary");
  L.push("");
  L.push(`| Metric | Value |`);
  L.push(`|---|---|`);
  L.push(`| Companies returned by discovery | ${result.discovery.returned} |`);
  L.push(`| Duplicates merged | ${result.discovery.duplicates.length} |`);
  L.push(`| Rejected by pre-filter | ${result.discovery.prefilter_rejected.length} |`);
  L.push(`| Prospects processed | ${result.prospects.length} |`);
  for (const [status, c] of Object.entries(statusCounts(result))) L.push(`| Status ${status} | ${c} |`);
  L.push(`| GOOD_FIT / POSSIBLE_FIT / SKIP | ${fitCount("GOOD_FIT")} / ${fitCount("POSSIBLE_FIT")} / ${fitCount("SKIP")} |`);

  L.push(`| Spend (est./actual) | ${eur(result.budget.spent_eur)} of ${eur(result.budget.max_eur)}${result.budget.exhausted ? " — **BUDGET EXHAUSTED**" : ""} |`);
  L.push(`| Cost per processed prospect | ${result.prospects.length ? eur(result.budget.spent_eur / result.prospects.length) : "—"} |`);
  L.push("");
  const fun = computeFunnel(result);
  L.push("### Funnel (generic mailboxes never count as a decision-maker email)");
  L.push("");
  L.push("| Stage | Count |");
  L.push("|---|---|");
  L.push(`| 1. Companies researched | ${fun.companies_researched} |`);
  L.push(`| 2. Named decision makers found | ${fun.named_decision_makers_found} |`);
  L.push(`| 3. Business emails found | ${fun.business_emails_found} |`);
  L.push(`| 4. Eligible emails | ${fun.eligible_emails} |`);
  L.push(`| 5. READY messages | ${fun.ready_messages} |`);
  L.push("");
  const reasons = new Map<string, number>();
  for (const p of result.prospects) if (p.status !== "READY") for (const r of p.status_reasons) { const k = r.split(":")[0]!; reasons.set(k, (reasons.get(k) ?? 0) + 1); }
  for (const r of result.discovery.prefilter_rejected) { const head = r.reason.split(":")[0]!; const k = head.startsWith("PREFILTER_") ? head : `PREFILTER_${head}`; reasons.set(k, (reasons.get(k) ?? 0) + 1); }
  if (reasons.size) {
    L.push("### Failure / review reason distribution");
    L.push("");
    for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) L.push(`- ${k}: ${v}`);
    L.push("");
  }
  L.push("### Provider calls");
  L.push("");
  L.push("| Provider:operation | Calls | € |");
  L.push("|---|---|---|");
  for (const [k, v] of Object.entries(cost.byProvider())) L.push(`| ${k} | ${v.calls} | ${eur(v.eur)} |`);
  L.push("");
  if (result.brain) {
    const b = result.brain;
    L.push("## Campaign Brain");
    L.push("");
    L.push(`- Version \`${b.version}\` · source ${b.source_url} · fetched ${b.fetched_at} · sha256 \`${b.content_hash.slice(0, 16)}…\` · extracted by ${b.extracted_by}`);
    L.push(`- Claim flags (deterministic from page): 24/7=${b.claim_flags.available_24_7}, human handoff=${b.claim_flags.human_handoff}, calendar=${b.claim_flags.calendar_integration}`);
    for (const [k, v] of Object.entries(b.claim_flag_evidence)) L.push(`  - ${k}: "${v}"`);
    L.push(`- Category keywords: ${b.category_keywords.join(", ")}`);
    L.push(`- Default capability: "${b.default_capability}"`);
    L.push(`- Capability by signal: ${Object.entries(b.capability_by_signal).filter(([, v]) => v).map(([k, v]) => `${k} → "${v}"`).join("; ")}`);
    if (b.rejected_capabilities.length) L.push(`- Rejected capability phrases: ${b.rejected_capabilities.map((r) => `"${r.text}" (${r.issues.join(",")})`).join("; ")}`);
    L.push(`- Prohibited/unsupported claims: ${b.prohibited_or_unsupported_claims.join("; ")}`);
    L.push("");
  }
  if (result.discovery.prefilter_rejected.length || result.discovery.duplicates.length) {
    L.push("## Not processed");
    L.push("");
    for (const d of result.discovery.duplicates) L.push(`- ${d.company_name} — DUPLICATE (${d.key})`);
    for (const r of result.discovery.prefilter_rejected) L.push(`- ${r.company_name} (${r.domain ?? "no domain"}) — ${r.reason}`);
    L.push("");
  }
  L.push("## Prospects");
  L.push("");
  for (const p of result.prospects) L.push(prospectMd(p));
  return L.join("\n");
}

export function writeOutputs(dir: string, result: ProofResult, cost: CostTracker, mode: string): string[] {
  mkdirSync(dir, { recursive: true });
  const files = [join(dir, "proof.json"), join(dir, "proof.csv"), join(dir, "proof-report.md")];
  writeFileSync(files[0]!, JSON.stringify({ mode, ...result, status_counts: statusCounts(result), funnel: computeFunnel(result), prospects: result.prospects.map((p) => ({ ...p, funnel: funnelFlags(p) })), provider_calls: cost.calls, provider_summary: cost.byProvider() }, null, 2));
  writeFileSync(files[1]!, toCsv(result));
  writeFileSync(files[2]!, toMarkdown(result, cost, mode));
  return files;
}
