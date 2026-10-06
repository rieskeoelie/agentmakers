/** Claim & tone guards from OUTREACH_RULES.md. Pure functions — used for hooks AND final emails. */

export interface ClaimFlags {
  /** Landing page explicitly supports 24/7 availability. */
  available_24_7: boolean;
  /** Landing page explicitly supports handing calls to a person / referral. */
  human_handoff: boolean;
  /** Landing page explicitly mentions agenda/system integration. */
  calendar_integration: boolean;
  /** Healthcare campaign (patients / dental / clinical care) → clinical-decision claims are always blocked. */
  healthcare_context: boolean;
  /** Landing page mentions emergency calls/referral → protocol-based routing wording is allowed. */
  emergency_referral: boolean;
}

const FLAG_RES: Record<keyof ClaimFlags, RegExp> = {
  available_24_7: /24\/7|24 uur per dag|dag en nacht|around the clock|24 hours a day/,
  // Generic staff handoff only. Emergency referral ("verwijst bij spoed door") is NOT a generic handoff claim.
  human_handoff: /doorverbind|doorschakel|doorzet(ten)? naar een (medewerker|collega)|overdragen aan (een )?(medewerker|collega)|hand(s|ing)? (off|over) to (a|your) (person|human|team|colleague)|transfer(s|red)? (the )?call to (a|your)/,
  calendar_integration: /in uw (praktijk)?agenda|rechtstreeks in uw|koppeling met|integratie met|integrates with|directly (in|into) your (calendar|agenda)/,
  healthcare_context: /patiënt|patient|tandarts|tandheelk|mondzorg|mondhygi|orthodont|fysiotherap|huisarts|dierenarts|zorgverzeker|kliniek|clinic\b|medisch|medical/,
  emergency_referral: /verwijst\b.{0,60}\bdoor\b|doorverwijs|spoedafspra|spoedgeval|spoedklacht|bij spoed|emergency call|urgent call/,
};

/** Deterministic claim flags from the landing-page text (the page is the evidence, not the LLM). */
export function deriveClaimFlags(landingText: string): ClaimFlags {
  const t = landingText.toLowerCase();
  return {
    available_24_7: FLAG_RES.available_24_7.test(t),
    human_handoff: FLAG_RES.human_handoff.test(t),
    calendar_integration: FLAG_RES.calendar_integration.test(t),
    healthcare_context: FLAG_RES.healthcare_context.test(t),
    emergency_referral: FLAG_RES.emergency_referral.test(t),
  };
}

/**
 * Healthcare guard: the AI never diagnoses, assesses urgency/severity on its own, triages clinically, gives medical
 * advice or decides treatment — even when a landing page says so. Allowed: receive calls, ask predefined questions,
 * follow practice-defined routing rules/protocol, forward urgent calls, schedule by predefined rules, collect info.
 */
export const CLINICAL_DECISION_RES: RegExp[] = [
  /urgentie\w*\s+(van\s+[\wëéï]+\s+)?(\w+\s+)?(beoordel|inschat|in\s+te\s+schatten|te\s+beoordelen|bepal|vaststel|vast\s+te\s+stellen)/i,
  /(beoordeelt|beoordelen|beoordeling\s+van|inschatten|inschatting\s+van|schat\w*\s+(\w+\s+)?in|bepaalt|bepalen|vaststellen|stelt\s+vast)\s+(van\s+)?(de\s+)?(medische\s+)?(urgentie|ernst|zwaarte|spoedeisendheid|hoe\s+(urgent|ernstig|dringend))/i,
  /\btri(age|ageren|ageert|eer\w*|ëren|eren|ëert|eert)\b/i,
  /\bdiagnos\w*/i,
  /\bmedisch\w*\s+advie\w*|\bbehandeladvie\w*|\badvies\s+(geven\s+)?over\s+(de\s+)?(behandeling|klachten|medicatie|medicijnen|pijnstilling)/i,
  /(bepaalt|bepalen|beslist|beslissen|kiest|kiezen)\s+(over\s+)?(de\s+)?(juiste\s+)?behandeling/i,
  /(bepaalt|bepalen|beslist|beslissen|kiest|kiezen)\s+welke\s+behandeling|\bbehandeling\w*\s+(kiezen|kiest|bepalen|bepaalt|vaststellen)\b/i,
  /\b(urgentie|ernst|zwaarte|spoedeisendheid)\s+(van\s+)?(de\s+|het\s+|een\s+)?[\wëéï-]+(\s+[\wëéï-]+)?\s+(beoordel\w*|bepal\w*|inschat\w*|in\s+te\s+schatten|vaststel\w*|vast\s+te\s+stellen)/i,
  /\bassess\w*\s+(the\s+)?(medical\s+|clinical\s+)?(urgency|severity)|\burgency\s+assessment|\bdetermin\w*\s+(the\s+)?(urgency|severity)|\bmedical\s+advice|\btreatment\s+advice|\bdecid\w*\s+(on\s+)?(the\s+)?treatment|\bclinical(ly)?\s+(assess\w*|decid\w*|judg\w*)/i,
];

/** Safe operational wording for emergency routing (replaces clinical-decision capability phrases). */
export const SAFE_EMERGENCY_CAPABILITY = {
  nl: "spoedoproepen aannemen en volgens het protocol van de praktijk doorzetten naar de juiste persoon of spoedroute",
  en: "take urgent calls and route them to the right person or emergency line according to the practice's protocol",
} as const;

/** Protocol-based routing is not a generic "human handoff" claim when the page itself covers emergency referral. */
const PROTOCOL_ROUTING_RE = /(volgens|conform)\s+(het|de|uw)\s+[\w-]*(protocol|afspraken|regels)\s+van\s+(de|uw)\s+praktijk\s+doorzetten\s+naar\s+de\s+juiste\s+persoon(\s+of\s+spoedroute)?|route\w*\s+(them\s+)?to\s+the\s+right\s+person(\s+or\s+emergency\s+line)?\s+according\s+to\s+the\s+practice'?s?\s+protocol/gi;

/** The landing-page sentence that justified each flag (for operator review). */
export function claimFlagEvidence(landingText: string): Partial<Record<keyof ClaimFlags, string>> {
  const out: Partial<Record<keyof ClaimFlags, string>> = {};
  const sentences = landingText.split(/(?<=[.!?])\s+|\n+/);
  for (const key of Object.keys(FLAG_RES) as Array<keyof ClaimFlags>) {
    const s = sentences.find((x) => FLAG_RES[key].test(x.toLowerCase()));
    if (s) out[key] = s.trim().slice(0, 240);
  }
  return out;
}

export const BANNED_PHRASES: RegExp[] = [
  /i hope (this|you)/i,
  /hope this email finds you/i,
  /ik hoop dat (deze|dit|alles|het goed)/i,
  /came across your (impressive|amazing|great)/i,
  /indrukwekkend(e)? (bedrijf|praktijk|website)/i,
  /ai is transforming/i,
  /ai (verandert|transformeert) (de wereld|alles)/i,
  /cutting[- ]edge/i,
  /revolution(ary|air)/i,
  /game[- ]?chang/i,
  /baanbrekend/i,
  /state[- ]of[- ]the[- ]art/i,
  /next[- ]level/i,
  /\bunleash\b/i,
  /\bsupercharge\b/i,
  /alleen (deze|vandaag)|limited time|act now|nu of nooit|laatste kans/i,
  /!{2,}/,
];

export interface ClaimIssue {
  code: string;
  match: string;
}

/**
 * Unsupported/forbidden claims. Numbers are not allowed in prospect copy unless explicitly allowed
 * (hooks may contain numbers that are literally present in cited evidence — checked separately).
 */
export function findClaimIssues(text: string, flags: ClaimFlags, opts: { allowNumbers?: boolean } = {}): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  const checkIn = (hay: string, code: string, re: RegExp) => {
    const m = hay.match(re);
    if (m) issues.push({ code, match: m[0] });
  };
  const check = (code: string, re: RegExp) => checkIn(text, code, re);
  check("PERCENTAGE_CLAIM", /\d+\s?%|\bprocent\b|\bpercent\b/i);
  check("MONEY_CLAIM", /€\s?\d|\d+\s?(euro|eur)\b|\$\s?\d/i);
  check("GUARANTEE_CLAIM", /garantie|gegarandeerd|guarantee|guaranteed|nooit meer (een )?(gemist|oproep)|never miss/i);
  check("ROI_CLAIM", /\broi\b|terugverdien|omzetverlies|verloren omzet|gemiste omzet|lost revenue|pays for itself/i);
  check("LOSS_ASSERTION", /(u|jullie|je|you) (verliest|verliezen|mist|missen|are losing|are missing)\b/i);
  check("PERSONALIZED_DEMO_CLAIM", /demo (voor|for) (u|jou|jullie|you)|(gemaakt|gebouwd|built|made) (speciaal )?(voor|for) (u|jullie|you|your)|al een (demo|voorbeeld) (klaar|gemaakt)/i);
  if (!flags.available_24_7) check("UNSUPPORTED_24_7", /24\/7|24 uur|dag en nacht|altijd bereikbaar|around the clock|24 hours/i);
  if (flags.healthcare_context) for (const re of CLINICAL_DECISION_RES) check("CLINICAL_DECISION_CLAIM", re);
  const handoffText = flags.emergency_referral ? text.replace(PROTOCOL_ROUTING_RE, " ") : text;
  if (!flags.human_handoff) checkIn(handoffText, "UNSUPPORTED_HANDOFF", /doorverbind|doorzet|doorschakel|overdragen|hand(ing)? (off|over)|to a person|naar een (medewerker|collega|mens)/i);
  if (!flags.calendar_integration) check("UNSUPPORTED_INTEGRATION", /integrat|koppel|in uw agenda|in jullie agenda|into your (calendar|system)/i);
  check("NAMED_SYSTEM_IN_PROSPECT_COPY", /\b(salesforce|hubspot|exquise|simplex|oase|chipsoft|epic|calendly|zenchef|formitable)\b/i);
  if (!opts.allowNumbers) check("UNSUPPORTED_NUMBER", /\d/);
  for (const re of BANNED_PHRASES) check("BANNED_PHRASE", re);
  return issues;
}
