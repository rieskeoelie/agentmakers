/**
 * Run activity — turns stored run events into a short, human-readable timeline.
 * Presentation only: the stored events are never changed; every row keeps its source events for technical detail.
 */
import { CLASS_META, type ReplyClass } from '../../../lib/outreach/ui/sending'
import type { RunFunnel, TimelineEvent } from '../../../lib/outreach/ui/types'
import { eventLabel } from './tones'

export type ActivityTone = 'success' | 'neutral' | 'warning' | 'danger'
export type ActivityLevel = 'run' | 'detail'

export interface ActivityRow {
  key: string
  /** Time of the most recent event in the row. */
  at: string
  text: string
  /** Optional second line (e.g. the completion summary). */
  sub?: string
  tone: ActivityTone
  level: ActivityLevel
  /** The stored events this row represents, newest first. */
  events: TimelineEvent[]
  /** Number of prospects (or events) represented when grouped. */
  count: number
}

interface Described { group: string | null; one: string; many?: (n: number) => string; tone: ActivityTone; level: ActivityLevel; sub?: string }

const OUTCOME: Record<string, { one: string; many: (n: number) => string; tone: ActivityTone }> = {
  READY: { one: 'Prospect klaar voor verzending (READY)', many: (n) => `${n} prospects klaar voor verzending`, tone: 'success' },
  NEEDS_REVIEW: { one: 'Prospect wacht op review', many: (n) => `${n} prospects wachten op review`, tone: 'warning' },
  BLOCKED: { one: 'Prospect geblokkeerd', many: (n) => `${n} prospects geblokkeerd`, tone: 'warning' },
  CONTACT_NOT_FOUND: { one: 'Geen contactpersoon gevonden', many: (n) => `${n} prospects zonder contactpersoon`, tone: 'warning' },
  DECISION_MAKER_EMAIL_NOT_FOUND: { one: 'Beslisser gevonden, maar geen zakelijk e-mailadres', many: (n) => `${n} beslissers zonder zakelijk e-mailadres`, tone: 'warning' },
  EMAIL_NOT_ELIGIBLE: { one: 'E-mailadres niet bruikbaar', many: (n) => `${n} prospects met onbruikbaar e-mailadres`, tone: 'warning' },
  SKIPPED: { one: 'Prospect overgeslagen (geen fit)', many: (n) => `${n} prospects overgeslagen`, tone: 'neutral' },
  FAILED: { one: 'Prospect mislukt', many: (n) => `${n} prospects mislukt`, tone: 'danger' },
}

const REVIEW: Record<string, { one: string; tone: ActivityTone }> = {
  APPROVE: { one: 'Goedgekeurd in review', tone: 'success' },
  REJECT: { one: 'Afgewezen in review', tone: 'neutral' },
  EXCLUDE_COMPANY: { one: 'Bedrijf uitgesloten in review', tone: 'warning' },
  EXCLUDE_CONTACT: { one: 'Contact uitgesloten in review', tone: 'warning' },
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Per-outcome counts taken from the run's own prospects (real data, not estimated). */
export type OutcomeCounts = Partial<Record<string, number>>

/**
 * Completion summary. With the run's own prospect outcomes it lists them per outcome; without them it only uses
 * unambiguous funnel counts (the funnel's "skipped" bucket also contains not-found outcomes, so it is not shown).
 */
export function completionSummary(f: RunFunnel, outcomes?: OutcomeCounts): string {
  const parts = [plural(f.finished, 'prospect verwerkt', 'prospects verwerkt')]
  if (!outcomes) {
    parts.push(`${f.ready} READY`)
    if (f.needs_review) parts.push(`${f.needs_review} review`)
    if (f.blocked) parts.push(`${f.blocked} geblokkeerd`)
    if (f.failed) parts.push(`${f.failed} mislukt`)
    return parts.join(' · ')
  }
  const o = outcomes
  parts.push(`${o.READY ?? 0} READY`)
  const add = (k: string, label: string) => { if (o[k]) parts.push(`${o[k]} ${label}`) }
  add('NEEDS_REVIEW', 'review')
  add('CONTACT_NOT_FOUND', 'zonder contactpersoon')
  add('DECISION_MAKER_EMAIL_NOT_FOUND', 'zonder zakelijk e-mailadres')
  add('EMAIL_NOT_ELIGIBLE', 'met onbruikbaar e-mailadres')
  add('BLOCKED', 'geblokkeerd')
  add('SKIPPED', 'overgeslagen')
  add('FAILED', 'mislukt')
  return parts.join(' · ')
}

/** Human description of one stored event, or null when it adds nothing for a person. */
export function describeEvent(e: TimelineEvent, funnel?: RunFunnel, outcomes?: OutcomeCounts): Described | null {
  const d = (e.data ?? {}) as Record<string, unknown>
  switch (e.type) {
    // Internal bookkeeping: worker claims and the "manual reply started" half of a reply.
    case 'PROSPECT_CLAIMED': case 'SETUP_CLAIMED': case 'MANUAL_REPLY_STARTED': return null
    case 'RUN_CREATED': return { group: null, one: 'Run aangemaakt', tone: 'neutral', level: 'run' }
    case 'RUN_STATUS': {
      const from = s(d.from), to = s(d.to)
      if (to === 'QUEUED' && from === 'CREATED') return null // shown as "Run gestart" when it actually starts
      if (to === 'RUNNING') return { group: null, one: from === 'PAUSED' ? 'Run hervat' : 'Run gestart', tone: 'neutral', level: 'run' }
      if (to === 'QUEUED' && from === 'PAUSED') return { group: null, one: 'Run hervat', tone: 'neutral', level: 'run' }
      if (to === 'PAUSED') return { group: null, one: d.reason === 'BUDGET_EXHAUSTED' ? 'Run gepauzeerd: budget op' : 'Run gepauzeerd', tone: 'warning', level: 'run' }
      if (to === 'COMPLETED') return { group: null, one: 'Run afgerond', tone: 'success', level: 'run', sub: funnel ? completionSummary(funnel, outcomes) : undefined }
      if (to === 'STOPPED') return { group: null, one: 'Run gestopt', tone: 'neutral', level: 'run' }
      if (to === 'FAILED') return { group: null, one: 'Run mislukt', tone: 'danger', level: 'run' }
      return { group: null, one: 'Status van de run gewijzigd', tone: 'neutral', level: 'run' }
    }
    case 'RUN_BUDGET': return { group: null, one: 'Budget aangepast', tone: 'neutral', level: 'run' }
    case 'RUN_MODE': return { group: null, one: 'Modus aangepast', tone: 'neutral', level: 'run' }
    case 'SETUP_DONE': {
      const sel = Number(d.selected ?? 0), ret = Number(d.returned ?? 0), blocked = Number(d.blocked ?? 0)
      return { group: null, one: `${plural(sel, 'bedrijf', 'bedrijven')} geselecteerd uit ${ret}`, tone: 'success', level: 'run', sub: blocked ? `${blocked} al uitgesloten` : undefined }
    }
    case 'SETUP_FAILED': return { group: null, one: 'Bedrijven zoeken mislukt', tone: 'danger', level: 'run' }
    case 'SETUP_RETRY_SCHEDULED': return { group: 'setup-retry', one: 'Bedrijven zoeken opnieuw ingepland', many: (n) => `Bedrijven zoeken ${n}× opnieuw ingepland`, tone: 'warning', level: 'run' }
    case 'SETUP_LEASE_EXPIRED': return { group: null, one: 'Bedrijven zoeken hervat na onderbreking', tone: 'neutral', level: 'run' }
    case 'PROSPECT_DONE': {
      const o = OUTCOME[s(d.outcome)]
      if (!o) return { group: `done:${s(d.outcome)}`, one: 'Prospect verwerkt', many: (n) => `${n} prospects verwerkt`, tone: 'neutral', level: 'detail' }
      return { group: `done:${s(d.outcome)}`, one: o.one, many: o.many, tone: o.tone, level: 'detail' }
    }
    case 'PROSPECT_FAILED': return { group: 'p-failed', one: 'Verwerking van prospect mislukt', many: (n) => `Verwerking van ${n} prospects mislukt`, tone: 'danger', level: 'detail' }
    case 'PROSPECT_RETRY_SCHEDULED': return { group: 'p-retry', one: 'Prospect opnieuw ingepland', many: (n) => `${n} prospects opnieuw ingepland`, tone: 'warning', level: 'detail' }
    case 'PROSPECT_LEASE_EXPIRED': return { group: 'p-lease', one: 'Prospect hervat na onderbreking', many: (n) => `${n} prospects hervat na onderbreking`, tone: 'neutral', level: 'detail' }
    case 'PROSPECT_BLOCKED': return { group: 'p-blocked', one: 'Prospect geblokkeerd', many: (n) => `${n} prospects geblokkeerd`, tone: 'warning', level: 'detail' }
    case 'REVIEW_DECISION': {
      const r = REVIEW[s(d.decision)] ?? { one: 'Reviewbesluit genomen', tone: 'neutral' as const }
      return { group: `review:${s(d.decision)}`, one: r.one, many: (n) => `${r.one} (${n}×)`, tone: r.tone, level: 'detail' }
    }
    case 'REVIEW_APPROVAL_REFUSED': return { group: 'review-refused', one: 'Goedkeuring geweigerd door harde regel', many: (n) => `Goedkeuring ${n}× geweigerd door harde regel`, tone: 'warning', level: 'detail' }
    case 'SEND_QUEUED': return { group: 'send-queued', one: 'In verzendwachtrij gezet', many: (n) => `${n} prospects in verzendwachtrij gezet`, tone: 'neutral', level: 'detail' }
    case 'SEND_PUSHED': return { group: 'send-pushed', one: 'Naar Smartlead gestuurd', many: (n) => `${n} prospects naar Smartlead gestuurd`, tone: 'success', level: 'detail' }
    case 'SEND_PUSH_RETRY': return { group: 'send-retry', one: 'Smartlead opnieuw geprobeerd', many: (n) => `Smartlead ${n}× opnieuw geprobeerd`, tone: 'neutral', level: 'detail' }
    case 'SEND_FAILED': return { group: 'send-failed', one: 'Klaarzetten bij Smartlead mislukt', many: (n) => `Klaarzetten bij Smartlead ${n}× mislukt`, tone: 'danger', level: 'detail' }
    case 'SEND_CANCELLED': return { group: 'send-cancelled', one: 'Verzending geannuleerd', many: (n) => `${n} verzendingen geannuleerd`, tone: 'neutral', level: 'detail' }
    case 'SEND_STOPPED': return { group: 'send-stopped', one: 'Sequence gestopt', many: (n) => `${n} sequences gestopt`, tone: 'neutral', level: 'detail' }
    case 'EMAIL_SENT': return { group: 'email-sent', one: d.step ? `E-mail verstuurd (stap ${s(d.step)})` : 'E-mail verstuurd', many: (n) => `${n} e-mails verstuurd`, tone: 'success', level: 'detail' }
    case 'EMAIL_REPLY': return { group: 'email-reply', one: 'Reactie ontvangen', many: (n) => `${n} reacties ontvangen`, tone: 'success', level: 'detail' }
    case 'EMAIL_BOUNCE': case 'EMAIL_BOUNCED': return { group: 'bounce', one: 'E-mail gebounced', many: (n) => `${n} e-mails gebounced`, tone: 'danger', level: 'detail' }
    case 'LEAD_UNSUBSCRIBED': case 'UNSUBSCRIBED': return { group: 'unsub', one: 'Contact afgemeld', many: (n) => `${n} contacten afgemeld`, tone: 'warning', level: 'detail' }
    case 'REPLY_CLASSIFIED': {
      const c = CLASS_META[s(d.classification) as ReplyClass]
      return { group: null, one: c ? `Reactie herkend als ${c.label.toLowerCase()}` : 'Reactie geanalyseerd', tone: 'neutral', level: 'detail' }
    }
    case 'MANUAL_REPLY_SENT': return d.error ? { group: null, one: 'Handmatig antwoord mislukt', tone: 'danger', level: 'detail' } : { group: null, one: 'Handmatig antwoord verstuurd', tone: 'success', level: 'detail' }
    case 'PROMOTED_TO_LEAD': return { group: null, one: 'Toegevoegd aan CRM', tone: 'success', level: 'detail' }
    case 'PROVIDER_CAMPAIGN': {
      const st = s(d.status)
      const text = st === 'PAUSED' ? 'Smartlead-campagne gepauzeerd' : st === 'ACTIVE' || st === 'STARTED' ? 'Smartlead-campagne actief' : 'Smartlead-campagne bijgewerkt'
      const sub = st === 'PAUSED' && d.error === 'KILL_SWITCH' ? 'Verzenden staat uit' : undefined
      return { group: `campaign:${st}:${s(d.error)}`, one: text, many: (n) => `${text} · ${n}×`, tone: 'neutral', level: 'detail', sub }
    }
    default: return { group: null, one: eventLabel(e.type), tone: e.type.includes('FAIL') ? 'danger' : 'neutral', level: e.prospect_id ? 'detail' : 'run' }
  }
}

/**
 * Builds the timeline: hides noise, humanizes, and merges consecutive events of the same kind into one row
 * (e.g. five CONTACT_NOT_FOUND outcomes → "5 prospects zonder contactpersoon"). Input and output are newest first.
 */
export function buildActivity(events: TimelineEvent[], funnel?: RunFunnel, outcomes?: OutcomeCounts): ActivityRow[] {
  const rows: ActivityRow[] = []
  let last: { row: ActivityRow; group: string | null; d: Described } | null = null
  for (const e of events) {
    const d = describeEvent(e, funnel, outcomes)
    if (!d) continue
    if (last && d.group && last.group === d.group) {
      last.row.events.push(e)
      last.row.count += 1
      last.row.text = d.many ? d.many(last.row.count) : d.one
      continue
    }
    const row: ActivityRow = { key: `${e.id}`, at: e.created_at, text: d.one, sub: d.sub, tone: d.tone, level: d.level, events: [e], count: 1 }
    rows.push(row)
    last = { row, group: d.group, d }
  }
  return rows
}

/** Day label for separators: "Vandaag", "Gisteren" or "5 oktober" (with year when not this year). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(now) - startOf(d)) / 864e5)
  if (diff === 0) return 'Vandaag'
  if (diff === 1) return 'Gisteren'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
