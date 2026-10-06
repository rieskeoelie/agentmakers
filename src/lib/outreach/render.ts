import { createHash } from "node:crypto";
import type { CampaignBrain } from "./brain";
import type { ProspectBrief } from "./brief";
import { BANNED_PHRASES, findClaimIssues } from "./claims";
import type { HookOutput } from "./hook";
import { validateHook } from "./hook";
import { isGenericEmail } from "./eligibility";

/**
 * Layer A — campaign-level controlled copy. The ONLY prospect-specific inputs are
 * first_name, company, personalization_hook and fit_sentence.
 */
export const CAMPAIGN_COPY = {
  nl: {
    formal: {
      greeting: (n: string | null) => (n ? `Beste ${n},` : "Goedendag,"),
      capability: (cap: string, handoff: boolean) =>
        `AgentMakers bouwt AI-voice agents die ${cap}${handoff ? ", en die het gesprek doorzetten naar een medewerker wanneer dat nodig is" : ""}.`,
      ctas: ["Zou het nuttig zijn als ik u een kort voorbeeld stuur van hoe dat klinkt?", "Mag ik u een kort voorbeeld sturen van hoe dat voor {company} zou kunnen werken?"],
      subjects: ["telefoontjes bij {company}", "vraag over uw telefonische bereikbaarheid", "AI-receptioniste voor {niche}"],
    },
    informal: {
      greeting: (n: string | null) => (n ? `Hoi ${n},` : "Hallo,"),
      capability: (cap: string, handoff: boolean) =>
        `AgentMakers bouwt AI-voice agents die ${cap}${handoff ? ", en die het gesprek doorzetten naar een collega wanneer dat nodig is" : ""}.`,
      ctas: ["Zal ik je een kort voorbeeld sturen van hoe dat klinkt?", "Mag ik je een kort voorbeeld sturen van hoe dat voor {company} zou kunnen werken?"],
      subjects: ["telefoontjes bij {company}", "vraag over jullie telefonische bereikbaarheid", "AI-receptioniste voor {niche}"],
    },
  },
  en: {
    formal: {
      greeting: (n: string | null) => (n ? `Hi ${n},` : "Hi,"),
      capability: (cap: string, handoff: boolean) => `AgentMakers builds AI voice agents that ${cap}${handoff ? ", while handing calls to a person when needed" : ""}.`,
      ctas: ["Worth sending you a short example?", "Would it be useful to show you how that could work for {company}?"],
      subjects: ["phone calls at {company}", "question about your phone process", "AI receptionist for {niche}"],
    },
  },
} as const;

function copyFor(language: "nl" | "en", formality: "formal" | "informal") {
  return language === "nl" ? CAMPAIGN_COPY.nl[formality] : CAMPAIGN_COPY.en.formal;
}

/** Deterministic variant choice → stable A/B attribution per prospect. */
function pick<T>(arr: readonly T[], seed: string, salt: string): { value: T; index: number } {
  const h = createHash("sha1").update(`${salt}:${seed}`).digest();
  const index = h[0]! % arr.length;
  return { value: arr[index]!, index };
}

export interface RenderedEmail {
  subject: string;
  body: string;
  variant: { subject: number; cta: number; hook_level: "A" | "B" | "none" };
  word_count: number;
}

export function renderEmail(input: {
  brief: ProspectBrief;
  brain: CampaignBrain;
  hook: HookOutput | null;
  language: "nl" | "en";
  formality: "formal" | "informal";
  niche: string;
  senderName: string;
}): RenderedEmail {
  const c = copyFor(input.language, input.formality);
  const fill = (s: string) => s.replace(/\{company\}/g, input.brief.company).replace(/\{niche\}/g, input.niche.toLowerCase());
  const subj = pick(c.subjects, input.brief.domain, "subject");
  const cta = pick(c.ctas, input.brief.domain, "cta");
  const opening = input.hook ? [input.hook.personalization_hook, input.hook.fit_sentence].filter(Boolean).join(" ") : null;
  const paragraphs = [
    c.greeting(input.brief.contact_first_name),
    opening,
    c.capability(input.brief.relevant_capability, input.brain.claim_flags.human_handoff),
    fill(cta.value),
    input.senderName,
  ].filter((p): p is string => !!p);
  const body = paragraphs.join("\n\n");
  return {
    subject: fill(subj.value),
    body,
    variant: { subject: subj.index, cta: cta.index, hook_level: input.hook?.hook_level ?? "none" },
    word_count: body.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Terminal contact statuses (generic/role mailboxes never count as a decision-maker email):
 * - CONTACT_NOT_FOUND              no relevant named decision maker identified
 * - DECISION_MAKER_EMAIL_NOT_FOUND named decision maker identified, no business email found
 * - EMAIL_NOT_ELIGIBLE             named decision maker + email found, but the email fails eligibility (invalid, disposable, …)
 */
export const CONTACT_FAILURE_STATUSES = ["CONTACT_NOT_FOUND", "DECISION_MAKER_EMAIL_NOT_FOUND", "EMAIL_NOT_ELIGIBLE"] as const;
export type ProspectStatus = "READY" | "NEEDS_REVIEW" | (typeof CONTACT_FAILURE_STATUSES)[number] | "SKIPPED" | "FAILED";
export const ALL_STATUSES: ProspectStatus[] = ["READY", "NEEDS_REVIEW", ...CONTACT_FAILURE_STATUSES, "SKIPPED", "FAILED"];

/** READY validation from OUTREACH_RULES.md. Phase 0 never sends regardless of result. */
export function validateMessage(input: {
  email: RenderedEmail;
  brief: ProspectBrief;
  brain: CampaignBrain;
  hook: HookOutput | null;
  suppressed: boolean;
  duplicateContact: boolean;
}): { status: Extract<ProspectStatus, "READY" | "NEEDS_REVIEW">; issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const { email, brief, brain, hook } = input;
  if (!brief.email) issues.push("NO_RECIPIENT");
  if (brief.email && isGenericEmail(brief.email)) issues.push("GENERIC_ADDRESS_NOT_A_RECIPIENT");
  if (brief.email_eligibility !== "ELIGIBLE") issues.push(`EMAIL_NOT_ELIGIBLE:${brief.email_eligibility}`);
  if (!brief.contact_first_name) issues.push("NO_NAMED_RECIPIENT");
  if (input.suppressed) issues.push("SUPPRESSED");
  if (input.duplicateContact) issues.push("DUPLICATE_CONTACT");
  if (brief.fit.classification !== "GOOD_FIT") issues.push(`FIT_${brief.fit.classification}_REQUIRES_MANUAL_APPROVAL`);
  if (!hook) issues.push("NO_VALID_HOOK");
  else {
    if (hook.hook_level !== "A") issues.push("HOOK_LEVEL_B_REVIEW");
    issues.push(...validateHook(hook, brief, brain).map((i) => `HOOK:${i}`));
  }
  // Everything except the (separately validated) hook must be free of numbers and unsupported claims.
  const nonHook = [email.subject, email.body.replace(hook?.personalization_hook ?? "\u0000", "").replace(hook?.fit_sentence ?? "\u0000", "")].join("\n");
  issues.push(...findClaimIssues(nonHook, brain.claim_flags).map((i) => `COPY:${i.code}:${i.match}`));
  for (const re of BANNED_PHRASES) if (re.test(email.body)) issues.push(`BANNED_PHRASE:${re.source}`);
  if (/\{[a-z_]+\}/i.test(email.body + email.subject)) issues.push("UNREPLACED_VARIABLE");
  if (/<[a-z/][^>]*>/i.test(email.body)) issues.push("NOT_PLAIN_TEXT");
  const questions = (email.body.match(/\?/g) ?? []).length;
  if (questions !== 1) issues.push(`CTA_COUNT_${questions}`);
  // 50–90 words is the OUTREACH_RULES default target, not a READY criterion → warning only; extreme lengths block.
  const warnings: string[] = [];
  if (email.word_count < 50 || email.word_count > 90) warnings.push(`WORD_COUNT_${email.word_count}_OUTSIDE_TARGET_50_90`);
  if (email.word_count < 30 || email.word_count > 120) issues.push(`WORD_COUNT_${email.word_count}_EXTREME`);
  return { status: issues.length ? "NEEDS_REVIEW" : "READY", issues, warnings };
}
