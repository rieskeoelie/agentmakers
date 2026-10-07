import { BANNED_PHRASES, findClaimIssues, type ClaimFlags } from "../claims";

/**
 * The 3-step cold sequence (Day 0 / Day 3 / Day 7 by default).
 *
 * Step 1 is the Phase 0 email exactly as rendered and validated (reviewed when it needed review) plus a plain opt-out
 * line. Steps 2 and 3 are fixed, campaign-level copy: only first name and company name are filled in, they contain
 * no claims, no numbers and no links, and are validated with the same claim guard. Follow-ups are sent as replies in
 * the same thread (empty subject) and stop automatically when the lead replies (Smartlead stop_lead_settings) — and
 * again from our side (webhook / sync → pause lead).
 */

export type Language = "nl" | "en";
export type Formality = "formal" | "informal";

export interface SequenceStep {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
}

export interface BuiltSequence {
  subject: string;
  body: string;
  sequence: SequenceStep[];
}

export const OPT_OUT: Record<Language, Record<Formality, string>> = {
  nl: {
    formal: "P.S. Liever geen e-mails meer van mij? Antwoord dan met \"stop\", dan hoort u niets meer van mij.",
    informal: "P.S. Liever geen e-mails meer van mij? Antwoord dan met \"stop\", dan hoor je niets meer van me.",
  },
  en: {
    formal: "P.S. Not relevant? Reply \"stop\" and I won't email you again.",
    informal: "P.S. Not relevant? Reply \"stop\" and I won't email you again.",
  },
};

/** Smartlead's own unsubscribe footer text (campaign setting). */
export const UNSUBSCRIBE_TEXT: Record<Language, string> = { nl: "Afmelden", en: "Unsubscribe" };

type Copy = { greeting: (n: string | null) => string; step2: (company: string) => string; step3: (company: string) => string };

export const FOLLOWUP_COPY: Record<Language, Record<Formality, Copy>> = {
  nl: {
    formal: {
      greeting: (n) => (n ? `Beste ${n},` : "Goedendag,"),
      step2: (c) => `Ik stuur mijn vorige bericht nog even door, voor het geval het tussen de andere e-mails is beland. Is de telefonische bereikbaarheid bij ${c} iets waar u op dit moment mee bezig bent?`,
      step3: (c) => `Ik wil u niet blijven mailen, dus dit is mijn laatste bericht hierover. Als telefonie bij ${c} later wel een onderwerp wordt, dan hoor ik het graag.`,
    },
    informal: {
      greeting: (n) => (n ? `Hoi ${n},` : "Hallo,"),
      step2: (c) => `Ik stuur mijn vorige bericht nog even door, voor het geval het tussen de andere mails is beland. Is de telefonische bereikbaarheid bij ${c} iets waar je nu mee bezig bent?`,
      step3: (c) => `Ik wil je niet blijven mailen, dus dit is mijn laatste bericht hierover. Als telefonie bij ${c} later wel een onderwerp wordt, dan hoor ik het graag.`,
    },
  },
  en: {
    formal: {
      greeting: (n) => (n ? `Hi ${n},` : "Hi,"),
      step2: (c) => `Bumping my previous note in case it got buried. Is handling phone calls at ${c} something you are looking at right now?`,
      step3: (c) => `I don't want to keep emailing you, so this is my last note on this. If phone handling at ${c} becomes a topic later, I'd be glad to hear from you.`,
    },
    informal: {
      greeting: (n) => (n ? `Hi ${n},` : "Hi,"),
      step2: (c) => `Bumping my previous note in case it got buried. Is handling phone calls at ${c} something you are looking at right now?`,
      step3: (c) => `I don't want to keep emailing you, so this is my last note on this. If phone handling at ${c} becomes a topic later, I'd be glad to hear from you.`,
    },
  },
};

export class SequenceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SequenceError";
  }
}

const lang = (l: string | null | undefined): Language => (l === "en" ? "en" : "nl");
const form = (f: string | null | undefined): Formality => (f === "informal" ? "informal" : "formal");

export function buildSequence(input: {
  message: { subject: string; body: string } | null | undefined;
  firstName: string | null;
  companyName: string;
  language: string | null | undefined;
  formality: string | null | undefined;
  senderName: string;
  delaysDays: number[];
  claimFlags?: ClaimFlags | null;
}): BuiltSequence {
  const l = lang(input.language);
  const f = form(input.formality);
  const subject = input.message?.subject?.trim() ?? "";
  const body = input.message?.body?.trim() ?? "";
  if (!subject || !body) throw new SequenceError("NO_MESSAGE", "Prospect has no rendered email");
  if (input.delaysDays.length !== 2 || input.delaysDays.some((d) => !Number.isInteger(d) || d < 1 || d > 30)) {
    throw new SequenceError("INVALID_DELAYS", "Follow-up delays must be two whole days between 1 and 30");
  }
  const copy = FOLLOWUP_COPY[l][f];
  const sign = input.senderName.trim() || "Richard";
  const optOut = OPT_OUT[l][f];
  const step1 = `${body}\n\n${optOut}`;
  const step2 = [copy.greeting(input.firstName), copy.step2(input.companyName), sign, optOut].join("\n\n");
  const step3 = [copy.greeting(input.firstName), copy.step3(input.companyName), sign].join("\n\n");
  // Defense in depth: the fixed follow-up copy must pass the same claim/tone guard as Phase 0 emails.
  if (input.claimFlags) {
    for (const t of [copy.step2(input.companyName), copy.step3(input.companyName)]) {
      const issues = findClaimIssues(t.replace(input.companyName, "Bedrijf"), input.claimFlags);
      if (issues.length) throw new SequenceError("FOLLOWUP_CLAIM_ISSUE", issues.map((i) => i.code).join(","));
    }
  }
  if (BANNED_PHRASES.some((re) => re.test(step2) || re.test(step3))) throw new SequenceError("FOLLOWUP_BANNED_PHRASE", "Follow-up copy contains a banned phrase");
  return {
    subject,
    body: step1,
    sequence: [
      { step: 1, delay_days: 0, subject, body: step1 },
      { step: 2, delay_days: input.delaysDays[0]!, subject: "", body: step2 },
      { step: 3, delay_days: input.delaysDays[1]!, subject: "", body: step3 },
    ],
  };
}

/** Plain text → minimal HTML for the provider (escaped; blank lines = paragraphs, newlines = <br>). */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return text.trim().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** Provider campaign template: every step body/subject comes from per-lead custom fields, so the pushed copy is exactly ours. */
export const CUSTOM_FIELD = { subject: "am_s1_subject", body: (step: number) => `am_s${step}_body`, sendId: "am_send_id" } as const;

export function campaignTemplate(delaysDays: number[]): Array<{ seq_number: number; delay_in_days: number; subject: string; email_body: string }> {
  return [
    { seq_number: 1, delay_in_days: 0, subject: `{{${CUSTOM_FIELD.subject}}}`, email_body: `{{${CUSTOM_FIELD.body(1)}}}` },
    { seq_number: 2, delay_in_days: delaysDays[0] ?? 3, subject: "", email_body: `{{${CUSTOM_FIELD.body(2)}}}` },
    { seq_number: 3, delay_in_days: delaysDays[1] ?? 4, subject: "", email_body: `{{${CUSTOM_FIELD.body(3)}}}` },
  ];
}

export function leadCustomFields(sendId: string, seq: SequenceStep[]): Record<string, string> {
  const out: Record<string, string> = { [CUSTOM_FIELD.sendId]: sendId, [CUSTOM_FIELD.subject]: seq[0]?.subject ?? "" };
  for (const s of seq) out[CUSTOM_FIELD.body(s.step)] = textToHtml(s.body);
  return out;
}
