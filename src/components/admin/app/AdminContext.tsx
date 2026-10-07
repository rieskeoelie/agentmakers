'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { outreachApi, type OutreachApi } from '../../../lib/outreach/ui/api'
import { copyFor, type T, type UiLang } from './copy'
import {
  conversationIndex, visibleConversationsFor, visibleLeadsFor, visiblePagesFor,
  type AccountStat, type Conversation, type ConversationDetail, type CurrentUser, type LandingPage, type Lead,
} from './model'
import { routePath, type Route } from './routes'

const SEEN_LEADS = 'agentmakers_seen_leads'
const LEAD_STATUS = 'agentmakers_lead_status'
const LEAD_NOTES = 'agentmakers_lead_notes'
const LEAD_HANDLED = 'agentmakers_lead_handled'
const UI_LANG = 'agentmakers_ui_lang'
const SIDEBAR = 'agentmakers_admin_sidebar'

function readJson<V>(key: string, fallback: V): V {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    return raw ? (JSON.parse(raw) as V) : fallback
  } catch { return fallback }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode: keep in memory */ }
}

export interface AdminState {
  me: CurrentUser
  t: T
  lang: UiLang
  setLang: (l: UiLang) => void
  route: Route
  navigate: (r: Route | string) => void
  viewAs: { id: string; name: string } | null
  setViewAs: (v: { id: string; name: string } | null) => void
  canOperate: boolean
  api: OutreachApi
  logout: () => void
  collapsed: boolean
  setCollapsed: (v: boolean) => void

  // CRM data (shared across screens)
  pages: LandingPage[]
  leads: Lead[]
  visibleLeads: Lead[]
  visiblePages: LandingPage[]
  crmLoading: boolean
  crmError: string | null
  refreshCrm: () => Promise<void>
  setPages: (f: (p: LandingPage[]) => LandingPage[]) => void
  setLeads: (f: (l: Lead[]) => Lead[]) => void

  conversations: Conversation[]
  visibleConversations: Conversation[]
  convDetails: Record<string, ConversationDetail>
  convIndex: Record<string, string>
  convLoading: boolean
  loadConversations: (force?: boolean) => void
  loadConversationDetail: (id: string) => Promise<void>

  accounts: AccountStat[]
  accountsLoading: boolean
  loadAccounts: () => void

  leadStatus: Record<string, string>
  setLeadStatus: (id: string, s: string) => void
  leadNotes: Record<string, string>
  setLeadNote: (id: string, note: string) => void
  handled: Set<string>
  toggleHandled: (id: string) => void
  seen: Set<string>
  markLeadsSeen: () => void

  counts: { review: number | null; inbox: number | null; newLeads: number; sendingLive: boolean | null }
  refreshCounts: () => void
}

const Ctx = createContext<AdminState | null>(null)

export function useAdmin(): AdminState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAdmin outside AdminProvider')
  return v
}

/** Test/preview helper: provide a ready-made state. */
export const AdminStateProvider = Ctx.Provider

export function AdminProvider({ me, route, push, onLogout, children }: {
  me: CurrentUser; route: Route; push: (href: string) => void; onLogout: () => void; children: ReactNode
}) {
  const [lang, setLangState] = useState<UiLang>(() => (readJson<string>(UI_LANG, 'nl') === 'es' ? 'es' : 'nl'))
  const t = useMemo(() => copyFor(lang), [lang])
  const setLang = useCallback((l: UiLang) => { setLangState(l); try { localStorage.setItem(UI_LANG, l) } catch { /* ignore */ } }, [])
  const [collapsed, setCollapsedState] = useState<boolean>(() => readJson<boolean>(SIDEBAR, false))
  const setCollapsed = useCallback((v: boolean) => { setCollapsedState(v); writeJson(SIDEBAR, v) }, [])

  const [viewAs, setViewAsState] = useState<{ id: string; name: string } | null>(null)
  const navigate = useCallback((r: Route | string) => push(typeof r === 'string' ? r : routePath(r)), [push])
  const setViewAs = useCallback((v: { id: string; name: string } | null) => { setViewAsState(v) }, [])
  const api = useMemo(() => outreachApi(me.isSuperAdmin && viewAs ? viewAs.id : null), [me.isSuperAdmin, viewAs])
  const canOperate = me.isAdmin || me.isSuperAdmin

  // ─── CRM data ──────────────────────────────────────────────────────────────
  const [pages, setPagesState] = useState<LandingPage[]>([])
  const [leads, setLeadsState] = useState<Lead[]>([])
  const [crmLoading, setCrmLoading] = useState(true)
  const [crmError, setCrmError] = useState<string | null>(null)
  const refreshCrm = useCallback(async () => {
    setCrmLoading(true)
    setCrmError(null)
    try {
      const [p, l] = await Promise.all([fetch('/api/pages', { cache: 'no-store' }), fetch('/api/leads', { cache: 'no-store' })])
      if (p.ok) setPagesState(await p.json())
      if (l.ok) setLeadsState(await l.json())
      if (!p.ok || !l.ok) setCrmError('Leads of pagina’s konden niet worden geladen.')
    } catch {
      setCrmError('Geen verbinding met de server.')
    } finally {
      setCrmLoading(false)
    }
  }, [])
  useEffect(() => { void refreshCrm() }, [refreshCrm])
  // Keep scrape status fresh (the scrape cron runs every 10 min), as before.
  useEffect(() => {
    const i = setInterval(() => {
      fetch('/api/leads', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setLeadsState(d) }).catch(() => undefined)
    }, 15 * 60 * 1000)
    return () => clearInterval(i)
  }, [])

  const uid = viewAs?.id ?? me.userId
  const visibleLeads = useMemo(() => visibleLeadsFor(leads, uid), [leads, uid])
  const visiblePages = useMemo(() => visiblePagesFor(pages, visibleLeads), [pages, visibleLeads])

  // ─── Conversations (lazy) ─────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convDetails, setConvDetails] = useState<Record<string, ConversationDetail>>({})
  const [convLoading, setConvLoading] = useState(false)
  const [convLoaded, setConvLoaded] = useState(false)
  const loadConversations = useCallback((force = false) => {
    if (convLoaded && !force) return
    setConvLoaded(true)
    setConvLoading(true)
    void (async () => {
      try {
        const res = await fetch('/api/conversations', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const convs: Conversation[] = data.conversations ?? []
        setConversations(convs)
        for (let i = 0; i < convs.length; i += 5) {
          const batch = convs.slice(i, i + 5)
          const results = await Promise.all(batch.map((c) => fetch(`/api/conversations/${c.conversation_id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
          setConvDetails((prev) => {
            const next = { ...prev }
            results.forEach((d, idx) => { if (d) next[batch[idx]!.conversation_id] = d })
            return next
          })
        }
      } finally {
        setConvLoading(false)
      }
    })()
  }, [convLoaded])
  const loadConversationDetail = useCallback(async (id: string) => {
    if (convDetails[id]) return
    const res = await fetch(`/api/conversations/${id}`)
    if (res.ok) {
      const d: ConversationDetail = await res.json()
      setConvDetails((prev) => ({ ...prev, [id]: d }))
    }
  }, [convDetails])
  const convIndex = useMemo(() => conversationIndex(convDetails), [convDetails])
  const visibleConversations = useMemo(() => visibleConversationsFor(conversations, visibleLeads, convIndex), [conversations, visibleLeads, convIndex])

  // ─── Accounts (superadmin) ────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<AccountStat[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const loadAccounts = useCallback(() => {
    setAccountsLoading(true)
    fetch('/api/admin/users', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setAccounts(d.users ?? []))
      .catch(() => undefined)
      .finally(() => setAccountsLoading(false))
  }, [])

  // ─── Per-browser lead metadata (as before) ────────────────────────────────
  const [leadStatus, setLeadStatusMap] = useState<Record<string, string>>(() => readJson(LEAD_STATUS, {}))
  const [leadNotes, setLeadNotesMap] = useState<Record<string, string>>(() => readJson(LEAD_NOTES, {}))
  const [handled, setHandled] = useState<Set<string>>(() => new Set(readJson<string[]>(LEAD_HANDLED, [])))
  const [seen, setSeen] = useState<Set<string>>(() => new Set(readJson<string[]>(SEEN_LEADS, [])))
  const setLeadStatus = useCallback((id: string, s: string) => setLeadStatusMap((m) => { const n = { ...m, [id]: s }; writeJson(LEAD_STATUS, n); return n }), [])
  const setLeadNote = useCallback((id: string, note: string) => setLeadNotesMap((m) => { const n = { ...m, [id]: note }; writeJson(LEAD_NOTES, n); return n }), [])
  const toggleHandled = useCallback((id: string) => setHandled((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); writeJson(LEAD_HANDLED, [...n]); return n }), [])
  const markLeadsSeen = useCallback(() => {
    setSeen((s) => {
      const n = new Set([...s, ...visibleLeads.map((l) => l.id)])
      writeJson(SEEN_LEADS, [...n])
      return n
    })
  }, [visibleLeads])

  // ─── Navigation counters ──────────────────────────────────────────────────
  const [review, setReview] = useState<number | null>(null)
  const [inbox, setInbox] = useState<number | null>(null)
  const [sendingLive, setSendingLive] = useState<boolean | null>(null)
  const refreshCounts = useCallback(() => {
    api.reviewQueue(0, 1).then((r) => setReview(r.total)).catch(() => setReview(null))
    api.sending().then((s) => {
      setInbox(s.needs_action)
      setSendingLive(s.config.sending_enabled && s.provider.smartlead_configured && !s.provider.env_kill_switch)
    }).catch(() => { setInbox(null); setSendingLive(null) })
  }, [api])
  useEffect(() => { refreshCounts() }, [refreshCounts, route.screen])
  const newLeads = useMemo(() => visibleLeads.filter((l) => !seen.has(l.id)).length, [visibleLeads, seen])

  const value: AdminState = {
    me, t, lang, setLang, route, navigate, viewAs, setViewAs, canOperate, api, logout: onLogout, collapsed, setCollapsed,
    pages, leads, visibleLeads, visiblePages, crmLoading, crmError, refreshCrm,
    setPages: (f) => setPagesState(f), setLeads: (f) => setLeadsState(f),
    conversations, visibleConversations, convDetails, convIndex, convLoading, loadConversations, loadConversationDetail,
    accounts, accountsLoading, loadAccounts,
    leadStatus, setLeadStatus, leadNotes, setLeadNote, handled, toggleHandled, seen, markLeadsSeen,
    counts: { review, inbox, newLeads, sendingLive }, refreshCounts,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
