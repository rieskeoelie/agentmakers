/**
 * Admin data model + pure helpers for the CRM screens (leads, conversations, pages, team).
 * Behaviour is identical to the previous single-page admin (visibility rules, matching, pipeline stages).
 */
import type { CopyKey } from './copy'
import type { Tone } from '../ds'

export interface CurrentUser { userId: string; displayName: string; isAdmin: boolean; isSuperAdmin: boolean }

export interface LandingPage {
  id: string; slug: string; industry: string; status: string
  visits: number; conversions: number; created_at: string; hero_image_url: string
  hero_headline_nl?: string; hero_subline_nl?: string; body_content_nl?: Record<string, unknown>
}

export interface Lead {
  id: string; naam: string; email: string; telefoon: string
  landing_page_slug: string; language: string; created_at: string
  website?: string | null; bedrijfsnaam?: string | null; demo_token?: string | null; scraped_at?: string | null
  user_id?: string | null; referrer?: string | null; user_agent?: string | null; business_info?: string | null
  outreach_prospect_id?: string | null
}

export interface Conversation {
  conversation_id: string; status: string; start_time_unix_secs: number; call_duration_secs: number
  has_audio: boolean; has_user_audio?: boolean; has_response_audio?: boolean
}
export interface TranscriptTurn { role: 'user' | 'agent'; message: string; time_in_call_secs?: number }
export interface ConversationDetail {
  conversation_id: string; status: string; start_time_unix_secs: number; call_duration_secs: number
  cost?: number; has_audio: boolean; transcript: TranscriptTurn[]
  conversation_initiation_client_data?: { dynamic_variables?: { business_info?: string } }
}

export interface AccountStat {
  id: string; username: string; displayName: string; isAdmin: boolean; isSuperAdmin: boolean; createdAt: string
  leadsTotal: number; leadsThisMonth: number; demosGenerated: number; conversations: number; lastActiveAt: string | null
}

// ─── Pipeline (stored per browser, as before) ─────────────────────────────────
export const STAGES = ['nieuw', 'contact', 'demo', 'gewonnen', 'verloren'] as const
export type Stage = (typeof STAGES)[number]
export const STAGE_META: Record<Stage, { label: CopyKey; tone: Tone }> = {
  nieuw: { label: 'stageNew', tone: 'neutral' },
  contact: { label: 'stageContact', tone: 'info' },
  demo: { label: 'stageDemo', tone: 'violet' },
  gewonnen: { label: 'stageWon', tone: 'success' },
  verloren: { label: 'stageLost', tone: 'danger' },
}
export const stageOf = (status: Record<string, string>, id: string): Stage => {
  const s = status[id]
  return s && (STAGES as readonly string[]).includes(s) ? (s as Stage) : 'nieuw'
}

// ─── Lead source (one CRM; origin is shown, not split) ───────────────────────
export type LeadSource = 'outreach' | 'demo_link' | 'invite' | 'website'
export const SOURCE_LABEL: Record<LeadSource, CopyKey> = { outreach: 'srcOutreach', demo_link: 'srcDemoLink', invite: 'srcInvite', website: 'srcWebsite' }

export function leadSource(l: Pick<Lead, 'referrer' | 'outreach_prospect_id' | 'landing_page_slug' | 'user_agent'>): LeadSource {
  if (l.outreach_prospect_id || (l.referrer ?? '').startsWith('outreach')) return 'outreach'
  if (l.landing_page_slug === 'bulk-outreach' || l.user_agent === 'bulk-import') return 'demo_link'
  if (l.landing_page_slug === 'invite' || (l.user_agent ?? '').startsWith('invite')) return 'invite'
  return 'website'
}

// ─── Visibility (unchanged rules) ────────────────────────────────────────────
/** Always the own account; view-as shows the viewed partner's account. */
export function visibleLeadsFor(leads: Lead[], uid: string | null | undefined): Lead[] {
  if (!uid) return leads
  return leads.filter((l) => l.user_id === uid)
}

export function normalizeKey(str: string): string {
  return str.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '')
}

export function parseBusinessInfo(detail: ConversationDetail): { company: string; contact: string; website: string } {
  const biz = detail.conversation_initiation_client_data?.dynamic_variables?.business_info ?? ''
  const c = biz.match(/Bedrijfsnaam:\s*(.+)/i)
  const n = biz.match(/Contactpersoon:\s*(.+)/i)
  const w = biz.match(/Website:\s*(.+)/i)
  return { company: c ? c[1]!.trim() : '', contact: n ? n[1]!.trim() : '', website: w ? w[1]!.trim() : '' }
}

/** company/website key → conversation id, from loaded conversation details. */
export function conversationIndex(details: Record<string, ConversationDetail>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const d of Object.values(details)) {
    const info = parseBusinessInfo(d)
    if (info.company) map[normalizeKey(info.company)] = d.conversation_id
    if (info.website) map[normalizeKey(info.website)] = d.conversation_id
  }
  return map
}

export function matchedConversation(lead: Pick<Lead, 'bedrijfsnaam' | 'website'>, index: Record<string, string>): string | undefined {
  if (lead.bedrijfsnaam && index[normalizeKey(lead.bedrijfsnaam)]) return index[normalizeKey(lead.bedrijfsnaam)]
  if (lead.website && index[normalizeKey(lead.website)]) return index[normalizeKey(lead.website)]
  return undefined
}

export function matchedLead(info: { company: string; website: string }, leads: Lead[]): Lead | undefined {
  return leads.find((l) =>
    (info.company && l.bedrijfsnaam && normalizeKey(l.bedrijfsnaam) === normalizeKey(info.company)) ||
    (info.website && l.website && normalizeKey(l.website) === normalizeKey(info.website)))
}

/** Conversations: always limited to conversations matched to the visible leads. */
export function visibleConversationsFor(conversations: Conversation[], leads: Lead[], index: Record<string, string>): Conversation[] {
  const ids = new Set(leads.map((l) => matchedConversation(l, index)).filter(Boolean) as string[])
  return conversations.filter((c) => ids.has(c.conversation_id))
}

/** Pages: limited to the slugs of the visible leads (as before). */
export function visiblePagesFor(pages: LandingPage[], leads: Lead[]): LandingPage[] {
  const slugs = new Set(leads.map((l) => l.landing_page_slug).filter(Boolean))
  return pages.filter((p) => slugs.has(p.slug))
}

// ─── Formatting ──────────────────────────────────────────────────────────────
export function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function ratio(conversions: number, visits: number): string {
  return visits > 0 ? `${((conversions / visits) * 100).toFixed(1)}%` : '—'
}

export function shortDate(iso: string | number | null | undefined, withTime = false): string {
  if (iso === null || iso === undefined || iso === '') return '—'
  const d = typeof iso === 'number' ? new Date(iso) : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('nl-NL', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Leads per ISO week for the last `weeks` weeks (oldest first). */
export function leadsPerWeek(leads: Pick<Lead, 'created_at'>[], weeks = 8, now = new Date()): Array<{ label: string; count: number }> {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // Monday of this week
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const from = new Date(start)
    from.setDate(from.getDate() - (weeks - 1 - i) * 7)
    return { from, label: from.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), count: 0 }
  })
  for (const l of leads) {
    const t = new Date(l.created_at).getTime()
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i]!.from.getTime()) {
        const end = i + 1 < buckets.length ? buckets[i + 1]!.from.getTime() : Infinity
        if (t < end) buckets[i]!.count++
        break
      }
    }
  }
  return buckets.map(({ label, count }) => ({ label, count }))
}

export function leadsCsv(leads: Lead[], status: Record<string, string>, notes: Record<string, string>, handled: Set<string>): string {
  const headers = ['Naam', 'E-mail', 'Telefoon', 'Bedrijf', 'Website', 'Pagina', 'Taal', 'Bron', 'Status', 'Notitie', 'Datum', 'Afgehandeld']
  const rows = leads.map((l) => [
    l.naam, l.email, l.telefoon, l.bedrijfsnaam || '', l.website || '', '/' + l.landing_page_slug, l.language, leadSource(l),
    stageOf(status, l.id), notes[l.id] || '', new Date(l.created_at).toLocaleDateString('nl-NL'), handled.has(l.id) ? 'Ja' : 'Nee',
  ])
  return [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}
