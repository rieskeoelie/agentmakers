'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

const SEEN_LEADS_STORAGE   = 'agentmakers_seen_leads'
const LEAD_STATUS_STORAGE  = 'agentmakers_lead_status'
const LEAD_NOTES_STORAGE   = 'agentmakers_lead_notes'
const OUTREACH_SENT_STORAGE = 'agentmakers_outreach_sent' // { [demo_token]: ISO date string }

const PIPELINE_STAGES = [
  { value: 'nieuw',    label: 'Nieuw',        color: '#64748B', bg: '#F1F5F9' },
  { value: 'contact',  label: 'Contact',       color: '#0369A1', bg: '#EFF6FF' },
  { value: 'demo',     label: 'Demo gepland',  color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'gewonnen', label: '🎉 Gewonnen',   color: '#166534', bg: '#DCFCE7' },
  { value: 'verloren', label: 'Verloren',      color: '#991B1B', bg: '#FEE2E2' },
]

interface Page {
  id: string; slug: string; industry: string; status: string
  visits: number; conversions: number; created_at: string; hero_image_url: string
  hero_headline_nl?: string
  hero_subline_nl?: string
  body_content_nl?: Record<string, unknown>
}
interface Lead {
  id: string; naam: string; email: string; telefoon: string
  landing_page_slug: string; language: string; created_at: string
  website?: string; bedrijfsnaam?: string; handled?: boolean
  demo_token?: string
}
interface Conversation {
  conversation_id: string; status: string
  start_time_unix_secs: number; call_duration_secs: number
  has_audio: boolean; has_user_audio: boolean; has_response_audio: boolean
}
interface TranscriptTurn {
  role: 'user' | 'agent'; message: string; time_in_call_secs?: number
}
interface ConversationDetail {
  conversation_id: string; status: string
  start_time_unix_secs: number; call_duration_secs: number
  cost?: number; has_audio: boolean; transcript: TranscriptTurn[]
  conversation_initiation_client_data?: {
    dynamic_variables?: { business_info?: string }
  }
}

function parseBusinessInfo(detail: ConversationDetail): { company: string; contact: string; website: string } {
  const biz = detail.conversation_initiation_client_data?.dynamic_variables?.business_info ?? ''
  const cMatch = biz.match(/Bedrijfsnaam:\s*(.+)/i)
  const nMatch = biz.match(/Contactpersoon:\s*(.+)/i)
  const wMatch = biz.match(/Website:\s*(.+)/i)
  return {
    company: cMatch ? cMatch[1].trim() : '',
    contact: nMatch ? nMatch[1].trim() : '',
    website: wMatch ? wMatch[1].trim() : '',
  }
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function normalize(str: string) { return str.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '') }

const GENERATION_STEPS = [
  'Prompt versturen naar Claude AI...',
  'Inhoud genereren in 3 talen (NL/EN/ES)...',
  'Teksten verifiëren en structureren...',
  'Pagina opslaan in database...',
  'Bijna klaar...',
]

export default function AdminDashboard() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  interface CurrentUser { displayName: string; isAdmin: boolean }
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [authed, setAuthed]     = useState(false)
  const [tab, setTab]           = useState<'pages' | 'leads' | 'analytics' | 'conversations' | 'outreach'>('leads')
  const [pages, setPages]       = useState<Page[]>([])
  const [leads, setLeads]       = useState<Lead[]>([])
  const [loading, setLoading]   = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // Lead tracking
  const [handledLeads, setHandledLeads]     = useState<Set<string>>(new Set())
  const [seenLeadIds, setSeenLeadIds]       = useState<Set<string>>(new Set())
  const [selectedLeads, setSelectedLeads]   = useState<Set<string>>(new Set())
  const [leadStatus, setLeadStatus]         = useState<Record<string, string>>({})
  const [leadNotes, setLeadNotes]           = useState<Record<string, string>>({})
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null)
  const [deleteLeadsLoading, setDeleteLeadsLoading] = useState(false)

  // Conversations
  const [conversations, setConversations]   = useState<Conversation[]>([])
  const [convLoading, setConvLoading]       = useState(false)
  const [openConvId, setOpenConvId]         = useState<string | null>(null)
  const [convDetails, setConvDetails]       = useState<Record<string, ConversationDetail>>({})

  // Page creation
  const [creating, setCreating]             = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [newIndustry, setNewIndustry]       = useState('')
  const [newSlug, setNewSlug]               = useState('')

  // Modals
  const [deleteModal, setDeleteModal]       = useState<Page | null>(null)
  const [editModal, setEditModal]           = useState<Page | null>(null)
  const [editContent, setEditContent]       = useState<Record<string, unknown>>({})
  const [editSection, setEditSection]       = useState('hero')
  const [editSaving, setEditSaving]         = useState(false)
  const [editHeroImage, setEditHeroImage]   = useState('')
  const [heroImageLoading, setHeroImageLoading] = useState(false)

  // Analytics
  const [analyticsLang, setAnalyticsLang]   = useState<'all' | 'nl' | 'en' | 'es'>('all')

  // Bulk outreach
  interface BulkRow { bedrijfsnaam: string; website: string; naam: string; email: string; telefoon: string }
  interface BulkResult { bedrijfsnaam: string; website: string; naam: string; email: string; demo_token: string; demo_url: string; status: 'ok' | 'error'; error?: string }
  const [bulkCsv, setBulkCsv]           = useState('')
  const [bulkParsed, setBulkParsed]     = useState<BulkRow[]>([])
  const [bulkResults, setBulkResults]   = useState<BulkResult[]>([])
  const [bulkLoading, setBulkLoading]   = useState(false)
  const [bulkError, setBulkError]       = useState('')
  const [bulkLanguage, setBulkLanguage] = useState<'nl' | 'en' | 'es' | null>(null)
  const [copiedIdx, setCopiedIdx]       = useState<number | null>(null)
  const [scrapeQueueLoading, setScrapeQueueLoading] = useState(false)
  const [scrapeQueueResult, setScrapeQueueResult]   = useState<{ processed: number; total: number } | null>(null)
  const [scrapeLoading, setScrapeLoading] = useState(false)
  const [scrapeDone, setScrapeDone]       = useState(false)
  const [scrapeProgress, setScrapeProgress] = useState<{ scraped: number; total: number } | null>(null)
  const [scrapeTimedOut, setScrapeTimedOut] = useState(false)

  // Prospect finder
  interface ProspectResult { bedrijfsnaam: string; website: string; adres: string; telefoon: string; rating?: number; reviews?: number }
  const [prospectQuery, setProspectQuery]       = useState('')
  const [prospectLoading, setProspectLoading]   = useState(false)
  const [prospectResults, setProspectResults]   = useState<ProspectResult[]>([])
  const [prospectError, setProspectError]       = useState('')
  const [selectedProspects, setSelectedProspects] = useState<Set<number>>(new Set())
  const [prospectNoApiKey, setProspectNoApiKey] = useState(false)
  const [sendingIdx, setSendingIdx]     = useState<Set<number>>(new Set())
  const [sentIdx, setSentIdx]           = useState<Set<number>>(new Set())
  const [sendErrors, setSendErrors]     = useState<Record<number, string>>({})
  // Persistent outreach history: demo_token → ISO date sent
  const [outreachSent, setOutreachSent] = useState<Record<string, string>>({})

  // AI email modal
  interface EmailModal { idx: number; bedrijfsnaam: string; naam: string; email: string; demo_url: string; demo_token: string; language?: string }
  const [emailModal, setEmailModal]         = useState<EmailModal | null>(null)
  const [emailSubject, setEmailSubject]     = useState('')
  const [emailBody, setEmailBody]           = useState('')
  const [emailGenerating, setEmailGenerating] = useState(false)
  const [emailSending, setEmailSending]     = useState(false)
  const [emailGenError, setEmailGenError]   = useState('')

  const parseCsv = (raw: string): BulkRow[] => {
    const lines = raw.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) return []
    // Auto-detect header
    const first = lines[0].toLowerCase()
    const hasHeader = first.includes('bedrijf') || first.includes('website') || first.includes('company')
    const dataLines = hasHeader ? lines.slice(1) : lines
    return dataLines.map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      return {
        bedrijfsnaam: cols[0] || '',
        website:      cols[1] || '',
        naam:         cols[2] || '',
        email:        cols[3] || '',
        telefoon:     cols[4] || '',
      }
    }).filter(r => r.bedrijfsnaam && r.website)
  }

  const handleBulkProcess = () => {
    setBulkError('')
    const parsed = parseCsv(bulkCsv)
    if (parsed.length === 0) { setBulkError('Geen geldige rijen gevonden. Zorg voor minimaal: bedrijfsnaam, website per rij.'); return }
    setBulkParsed(parsed)
    setBulkResults([])
  }

  const handleBulkGenerate = async () => {
    if (bulkParsed.length === 0) return
    setBulkLoading(true)
    setBulkError('')
    setScrapeLoading(false)
    setScrapeDone(false)
    setScrapeProgress(null)
    setScrapeQueueResult(null)
    setScrapeTimedOut(false)
    try {
      const res = await fetch('/api/bulk-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: bulkParsed.map(r => ({ ...r, language: bulkLanguage ?? 'nl' })) }),
      })
      const data = await res.json()
      if (!res.ok) { setBulkError(data.error || 'Fout bij aanmaken'); return }
      const results: BulkResult[] = data.results
      setBulkResults(results)

      const tokens = results.filter(r => r.status === 'ok').map(r => r.demo_token)
      if (tokens.length === 0) { setScrapeDone(true); return }

      setScrapeLoading(true)
      setScrapeProgress({ scraped: 0, total: tokens.length })

      // Also trigger the scrape-queue as a safety net in case after() doesn't fire
      // (e.g. very short-lived function invocations). This ensures scraping starts.
      fetch('/api/cron/scrape-queue').catch(() => {})

      let attempts = 0
      const MAX_ATTEMPTS = 24 // 24 × 5s = 2 min max wait

      const poll = async () => {
        attempts++
        try {
          const r = await fetch(
            `/api/admin/scrape-status?tokens=${tokens.join(',')}`
          )
          const d = await r.json()
          const scraped = d.scraped ?? 0
          setScrapeProgress({ scraped, total: d.total ?? tokens.length })

          if (scraped >= tokens.length) {
            // All done!
            setScrapeQueueResult({ processed: scraped, total: tokens.length })
            setScrapeLoading(false)
            setScrapeDone(true)
          } else if (attempts >= MAX_ATTEMPTS) {
            // 2-minute timeout — scraping is taking too long or failed
            // Keep buttons LOCKED (scrapeDone stays false), show error + retry option
            setScrapeLoading(false)
            setScrapeTimedOut(true)
          } else {
            // Every 6 polls (30s), kick off the cron queue again to pick up remaining leads
            if (attempts % 6 === 0) {
              fetch('/api/cron/scrape-queue').catch(() => {})
            }
            setTimeout(poll, 5000)
          }
        } catch {
          if (attempts >= MAX_ATTEMPTS) {
            setScrapeLoading(false)
            setScrapeTimedOut(true)
          } else {
            setTimeout(poll, 5000)
          }
        }
      }
      setTimeout(poll, 5000) // First check after 5s
    } catch {
      setBulkError('Netwerkfout. Probeer opnieuw.')
    } finally {
      setBulkLoading(false)
    }
  }

  // Retry scraping after a timeout — re-trigger the queue and resume polling
  const handleRetryScrapin = async (tokens: string[]) => {
    setScrapeTimedOut(false)
    setScrapeLoading(true)
    setScrapeProgress(prev => prev)
    fetch('/api/cron/scrape-queue').catch(() => {})

    let attempts = 0
    const MAX_ATTEMPTS = 24

    const poll = async () => {
      attempts++
      try {
        const r = await fetch(
          `/api/admin/scrape-status?tokens=${tokens.join(',')}`
        )
        const d = await r.json()
        const scraped = d.scraped ?? 0
        setScrapeProgress({ scraped, total: d.total ?? tokens.length })
        if (scraped >= tokens.length) {
          setScrapeQueueResult({ processed: scraped, total: tokens.length })
          setScrapeLoading(false)
          setScrapeDone(true)
        } else if (attempts >= MAX_ATTEMPTS) {
          setScrapeLoading(false)
          setScrapeTimedOut(true)
        } else {
          if (attempts % 6 === 0) {
            fetch('/api/cron/scrape-queue').catch(() => {})
          }
          setTimeout(poll, 5000)
        }
      } catch {
        if (attempts >= MAX_ATTEMPTS) { setScrapeLoading(false); setScrapeTimedOut(true) }
        else { setTimeout(poll, 5000) }
      }
    }
    setTimeout(poll, 5000)
  }

  const copyLink = (url: string, idx: number) => {
    navigator.clipboard.writeText(url)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1800)
  }

  const makeOutreachMailto = (r: BulkResult) => {
    const subject = encodeURIComponent(`Ik heb een AI receptioniste gebouwd voor ${r.bedrijfsnaam}`)
    const body = encodeURIComponent(
`Hallo${r.naam ? ` ${r.naam.split(' ')[0]}` : ''},

Ik ben Richard van Agentmakers.io — wij bouwen AI receptionistes voor Nederlandse bedrijven.

Ik heb alvast een persoonlijke demo gemaakt voor ${r.bedrijfsnaam}. Ze is getraind op jullie website en staat klaar om vragen van bezoekers en klanten te beantwoorden, 24/7.

👉 Beluister haar hier: ${r.demo_url}

Ze is nu al in staat om jullie bedrijf voor te stellen, vragen te beantwoorden over diensten en prijzen, en een afspraak in te plannen.

Geen verplichtingen — het is gewoon leuk om te zien wat er al mogelijk is.

Met vriendelijke groet,
Richard
Agentmakers.io`)
    return `mailto:${r.email}?subject=${subject}&body=${body}`
  }

  const openEmailModal = async (r: BulkResult, idx: number) => {
    await _openEmailModalRaw({ idx, bedrijfsnaam: r.bedrijfsnaam, naam: r.naam, email: r.email, demo_url: r.demo_url, demo_token: r.demo_token, language: bulkLanguage ?? 'nl' })
  }

  // Generic handler — works for both BulkResult rows and inbound Lead rows
  const _openEmailModalRaw = async (modal: EmailModal) => {
    setEmailModal(modal)
    setEmailSubject('')
    setEmailBody('')
    setEmailGenError('')
    setEmailGenerating(true)
    try {
      let business_info = ''
      if (modal.demo_token) {
        try {
          const siRes = await fetch(`/api/admin/lead-info?token=${modal.demo_token}`)
          if (siRes.ok) { const d = await siRes.json(); business_info = d.business_info || '' }
        } catch { /* ignore */ }
      }
      const res = await fetch('/api/admin/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bedrijfsnaam: modal.bedrijfsnaam, naam: modal.naam, demo_url: modal.demo_url, business_info, language: modal.language ?? 'nl' }),
      })
      const data = await res.json()
      if (!res.ok) { setEmailGenError(data.error || 'Genereren mislukt'); return }
      setEmailSubject(data.subject)
      setEmailBody(data.body)
    } catch { setEmailGenError('Netwerkfout') } finally { setEmailGenerating(false) }
  }

  // Open modal for an inbound lead from the leads tab
  const openLeadEmailModal = async (lead: Lead) => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentmakers.io'
    const demo_url = lead.demo_token ? `${siteUrl}/demo/${lead.demo_token}` : ''
    await _openEmailModalRaw({
      idx: -1, // not used for per-lead sent tracking (we use demo_token in localStorage)
      bedrijfsnaam: lead.bedrijfsnaam || lead.naam,
      naam: lead.naam,
      email: lead.email,
      demo_url,
      demo_token: lead.demo_token || '',
      language: lead.language || 'nl',
    })
  }

  const sendEmailFromModal = async () => {
    if (!emailModal) return
    setEmailSending(true)
    try {
      const res = await fetch('/api/admin/send-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: emailModal.naam, email: emailModal.email, bedrijfsnaam: emailModal.bedrijfsnaam, demo_url: emailModal.demo_url, subject: emailSubject, body: emailBody }),
      })
      if (res.ok) {
        setSentIdx(prev => new Set(prev).add(emailModal.idx))
        // Persist to localStorage so status survives page reload
        const sentAt = new Date().toISOString()
        setOutreachSent(prev => {
          const updated = { ...prev, [emailModal.demo_token]: sentAt }
          localStorage.setItem(OUTREACH_SENT_STORAGE, JSON.stringify(updated))
          return updated
        })
        setEmailModal(null)
      } else {
        const d = await res.json()
        setEmailGenError(d.error || 'Verzenden mislukt')
      }
    } catch { setEmailGenError('Netwerkfout') } finally { setEmailSending(false) }
  }

  const sendOutreach = async (r: BulkResult, idx: number) => {
    if (!r.email) return
    setSendingIdx(prev => new Set(prev).add(idx))
    setSendErrors(prev => { const n = { ...prev }; delete n[idx]; return n })
    try {
      const res = await fetch('/api/admin/send-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: r.naam, email: r.email, bedrijfsnaam: r.bedrijfsnaam, demo_url: r.demo_url }),
      })
      if (res.ok) {
        setSentIdx(prev => new Set(prev).add(idx))
      } else {
        const d = await res.json()
        setSendErrors(prev => ({ ...prev, [idx]: d.error || 'Fout' }))
      }
    } catch {
      setSendErrors(prev => ({ ...prev, [idx]: 'Netwerkfout' }))
    } finally {
      setSendingIdx(prev => { const n = new Set(prev); n.delete(idx); return n })
    }
  }

  const searchProspects = async () => {
    if (!prospectQuery.trim()) return
    setProspectLoading(true)
    setProspectError('')
    setProspectResults([])
    setSelectedProspects(new Set())
    setProspectNoApiKey(false)
    try {
      const res = await fetch(`/api/admin/prospects?q=${encodeURIComponent(prospectQuery)}`)
      const data = await res.json()
      if (!res.ok) {
        if (data.error?.includes('GOOGLE_MAPS_API_KEY')) setProspectNoApiKey(true)
        else setProspectError(data.error || 'Zoeken mislukt')
        return
      }
      setProspectResults(data.results)
      if (data.results.length === 0) setProspectError('Geen resultaten met website gevonden. Probeer een andere zoekopdracht.')
    } catch {
      setProspectError('Netwerkfout. Probeer opnieuw.')
    } finally {
      setProspectLoading(false)
    }
  }

  const importSelectedProspects = () => {
    const toImport = prospectResults.filter((_, i) => selectedProspects.has(i))
    const parsed = toImport.map(p => ({
      bedrijfsnaam: p.bedrijfsnaam,
      website: p.website,
      naam: '',
      email: '',
      telefoon: p.telefoon,
    }))
    setBulkParsed(parsed)
    setBulkResults([])
    setBulkError('')
  }

  const handleScrapeQueue = async () => {
    setScrapeQueueLoading(true)
    setScrapeQueueResult(null)
    try {
      const res = await fetch('/api/cron/scrape-queue')
      const data = await res.json()
      setScrapeQueueResult({ processed: data.processed ?? 0, total: data.total ?? 0 })
    } catch {
      setScrapeQueueResult({ processed: 0, total: 0 })
    } finally {
      setScrapeQueueLoading(false)
    }
  }

  // ─── Data fetching ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pRes, lRes] = await Promise.all([
      fetch('/api/pages'),
      fetch('/api/leads'),
    ])
    if (pRes.ok) setPages(await pRes.json())
    if (lRes.ok) {
      const fetchedLeads: Lead[] = await lRes.json()
      setLeads(fetchedLeads)
      const stored = localStorage.getItem(SEEN_LEADS_STORAGE)
      const seen: string[] = stored ? JSON.parse(stored) : []
      setSeenLeadIds(new Set(seen))
    }
    setLoading(false)
  }, [])

  const fetchConversations = useCallback(async () => {
    setConvLoading(true)
    const res = await fetch('/api/conversations')
    if (res.ok) {
      const data = await res.json()
      const convs: Conversation[] = data.conversations ?? []
      setConversations(convs)
      const batchSize = 5
      for (let i = 0; i < convs.length; i += batchSize) {
        const batch = convs.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map(c =>
            fetch(`/api/conversations/${c.conversation_id}`)
              .then(r => r.ok ? r.json() : null).catch(() => null)
          )
        )
        setConvDetails(prev => {
          const next = { ...prev }
          results.forEach((d, idx) => { if (d) next[batch[idx].conversation_id] = d })
          return next
        })
      }
    }
    setConvLoading(false)
  }, [])

  const fetchConversationDetail = useCallback(async (id: string) => {
    if (convDetails[id]) return
    const res = await fetch(`/api/conversations/${id}`)
    if (res.ok) {
      const data: ConversationDetail = await res.json()
      setConvDetails(prev => ({ ...prev, [id]: data }))
    }
  }, [convDetails])

  // ─── Lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    // Check if already logged in via session cookie
    fetch('/api/auth/me').then(async res => {
      if (res.ok) {
        const user = await res.json()
        setCurrentUser({ displayName: user.displayName, isAdmin: user.isAdmin })
        setAuthed(true)
        fetchData()
        const st = localStorage.getItem(LEAD_STATUS_STORAGE)
        if (st) setLeadStatus(JSON.parse(st))
        const sn = localStorage.getItem(LEAD_NOTES_STORAGE)
        if (sn) setLeadNotes(JSON.parse(sn))
        const os = localStorage.getItem(OUTREACH_SENT_STORAGE)
        if (os) setOutreachSent(JSON.parse(os))
      }
    }).catch(() => {})
  }, [fetchData])

  useEffect(() => {
    if (authed) localStorage.setItem(LEAD_STATUS_STORAGE, JSON.stringify(leadStatus))
  }, [leadStatus, authed])

  useEffect(() => {
    if (authed) localStorage.setItem(LEAD_NOTES_STORAGE, JSON.stringify(leadNotes))
  }, [leadNotes, authed])

  useEffect(() => {
    if (!creating) { setGenerationStep(0); return }
    const intervals = [2000, 5000, 9000, 13000]
    const timers = intervals.map((delay, i) => setTimeout(() => setGenerationStep(i + 1), delay))
    return () => timers.forEach(clearTimeout)
  }, [creating])

  // ─── Computed ──────────────────────────────────────────────────
  const totalVisits      = pages.reduce((acc, p) => acc + (p.visits || 0), 0)
  const totalConversions = pages.reduce((acc, p) => acc + (p.conversions || 0), 0)
  const newLeadsCount    = leads.filter(l => !seenLeadIds.has(l.id)).length

  const startOfWeek = new Date()
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  const leadsThisWeek = leads.filter(l => new Date(l.created_at) >= startOfWeek).length

  const avgDuration = conversations.length > 0
    ? conversations.reduce((sum, c) => sum + c.call_duration_secs, 0) / conversations.length : 0

  const bestPage = [...pages].filter(p => p.visits > 0)
    .sort((a, b) => (b.conversions / b.visits) - (a.conversions / a.visits))[0]

  const sortedByRatio = [...pages].filter(p => p.visits > 0)
    .sort((a, b) => (b.conversions / b.visits) - (a.conversions / a.visits))

  const leadsByLang = {
    nl: leads.filter(l => l.language === 'nl').length,
    en: leads.filter(l => l.language === 'en').length,
    es: leads.filter(l => l.language === 'es').length,
  }
  const filteredLeads = analyticsLang === 'all' ? leads : leads.filter(l => l.language === analyticsLang)

  const pipelineCounts = useMemo(() => ({
    nieuw:    leads.filter(l => !leadStatus[l.id] || leadStatus[l.id] === 'nieuw').length,
    contact:  leads.filter(l => leadStatus[l.id] === 'contact').length,
    demo:     leads.filter(l => leadStatus[l.id] === 'demo').length,
    gewonnen: leads.filter(l => leadStatus[l.id] === 'gewonnen').length,
    verloren: leads.filter(l => leadStatus[l.id] === 'verloren').length,
  }), [leads, leadStatus])

  // Map conversations to leads by company/website name
  const convByKey = useMemo(() => {
    const map: Record<string, string> = {}
    Object.values(convDetails).forEach(d => {
      const info = parseBusinessInfo(d)
      if (info.company) map[normalize(info.company)] = d.conversation_id
      if (info.website) map[normalize(info.website)] = d.conversation_id
    })
    return map
  }, [convDetails])

  const getMatchedConv = (lead: Lead): string | undefined => {
    if (lead.bedrijfsnaam && convByKey[normalize(lead.bedrijfsnaam)]) return convByKey[normalize(lead.bedrijfsnaam)]
    if (lead.website && convByKey[normalize(lead.website)]) return convByKey[normalize(lead.website)]
    return undefined
  }

  // For non-admins: filter conversations to only those matched to their own leads
  const visibleConversations = useMemo(() => {
    if (currentUser?.isAdmin) return conversations
    const myConvIds = new Set(leads.map(l => getMatchedConv(l)).filter(Boolean) as string[])
    return conversations.filter(c => myConvIds.has(c.conversation_id))
  }, [conversations, currentUser, leads, convByKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ──────────────────────────────────────────────────
  const login = async () => {
    setLoginError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setLoginError(data.error || 'Inloggen mislukt'); return }
      setCurrentUser({ displayName: data.user.displayName, isAdmin: data.user.isAdmin })
      setAuthed(true)
      fetchData()
      const st = localStorage.getItem(LEAD_STATUS_STORAGE)
      if (st) setLeadStatus(JSON.parse(st))
      const sn = localStorage.getItem(LEAD_NOTES_STORAGE)
      if (sn) setLeadNotes(JSON.parse(sn))
      const os = localStorage.getItem(OUTREACH_SENT_STORAGE)
      if (os) setOutreachSent(JSON.parse(os))
    } catch { setLoginError('Netwerkfout. Probeer opnieuw.') }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setAuthed(false); setCurrentUser(null); setUsername(''); setPassword('')
  }

  const markAllSeen = useCallback(() => {
    const allIds = leads.map(l => l.id)
    localStorage.setItem(SEEN_LEADS_STORAGE, JSON.stringify(allIds))
    setSeenLeadIds(new Set(allIds))
  }, [leads])

  const toggleStatus = async (page: Page) => {
    const next = page.status === 'live' ? 'offline' : 'live'
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, status: next } : p))
    await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: page.id, status: next })
    })
  }

  const confirmDelete = async () => {
    if (!deleteModal) return
    setPages(prev => prev.filter(p => p.id !== deleteModal.id))
    setDeleteModal(null)
    await fetch('/api/pages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteModal.id })
    })
  }

  const openEditModal = (page: Page) => {
    setEditModal(page)
    setEditContent(page.body_content_nl || {})
    setEditHeroImage(page.hero_image_url || '')
    setEditSection('hero')
  }

  const refreshHeroImage = async (industry: string) => {
    setHeroImageLoading(true)
    try {
      const res = await fetch(`/api/admin/hero-image?industry=${encodeURIComponent(industry)}`)
      const data = await res.json()
      if (data.url) setEditHeroImage(data.url)
    } finally {
      setHeroImageLoading(false)
    }
  }

  const setTextField = (key: string, value: string) =>
    setEditContent(prev => ({ ...prev, [key]: value }))

  const setArrayField = (key: string, idx: number, field: string, value: string) =>
    setEditContent(prev => {
      const arr = [...((prev[key] as Record<string, unknown>[]) || [])]
      arr[idx] = { ...(arr[idx] || {}), [field]: value }
      return { ...prev, [key]: arr }
    })

  const saveEditModal = async () => {
    if (!editModal) return
    setEditSaving(true)
    const res = await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editModal.id,
        body_content_nl: editContent,
        hero_headline_nl: (editContent.hero_headline as string) || editModal.hero_headline_nl,
        hero_subline_nl: (editContent.hero_subline as string) || editModal.hero_subline_nl,
        hero_image_url: editHeroImage || editModal.hero_image_url,
      })
    })
    if (res.ok) {
      const updated = await res.json()
      setPages(prev => prev.map(p => p.id === editModal.id ? { ...p, ...updated, body_content_nl: editContent } : p))
      setEditModal(null)
    }
    setEditSaving(false)
  }

  const createPage = async () => {
    if (!newIndustry || !newSlug) return alert('Vul branche en URL-slug in')
    setCreating(true)
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ industry: newIndustry, slug: newSlug, status: 'draft' })
    })
    const data = await res.json()
    setCreating(false)
    if (data.success) { setShowCreate(false); setNewIndustry(''); setNewSlug(''); fetchData() }
    else alert('Fout: ' + data.error)
  }

  const toggleHandled = (id: string) => {
    setHandledLeads(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleSelectLead = (id: string) => {
    setSelectedLeads(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleSelectAll = () => {
    setSelectedLeads(selectedLeads.size === leads.length ? new Set() : new Set(leads.map(l => l.id)))
  }

  const deleteSelectedLeads = async () => {
    if (selectedLeads.size === 0) return
    if (!confirm(`Weet je zeker dat je ${selectedLeads.size} aanvra${selectedLeads.size === 1 ? 'ag' : 'gen'} wilt verwijderen?`)) return
    setDeleteLeadsLoading(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedLeads) }),
      })
      if (res.ok) { setLeads(prev => prev.filter(l => !selectedLeads.has(l.id))); setSelectedLeads(new Set()) }
    } catch (e) { console.error('Delete failed', e) }
    setDeleteLeadsLoading(false)
  }

  const exportCSV = () => {
    const headers = ['Naam', 'E-mail', 'Telefoon', 'Bedrijf', 'Website', 'Pagina', 'Taal', 'Status', 'Notitie', 'Datum', 'Afgehandeld']
    const rows = leads.map(l => [
      l.naam, l.email, l.telefoon,
      l.bedrijfsnaam || '', l.website || '',
      '/' + l.landing_page_slug, l.language,
      leadStatus[l.id] || 'nieuw',
      leadNotes[l.id] || '',
      new Date(l.created_at).toLocaleDateString('nl-NL'),
      handledLeads.has(l.id) ? 'Ja' : 'Nee'
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const makeMailto = (lead: Lead) => {
    const subject = `Demo aanvraag – ${lead.bedrijfsnaam || lead.naam}`
    const body = `Hallo ${lead.naam},\n\nBedankt voor uw aanvraag via agentmakers.io!\n\nWe staan klaar om u een persoonlijke demo te geven van onze AI receptioniste. Kunt u ons laten weten wanneer het u het beste uitkomt?\n\nMet vriendelijke groet,\nHet Agentmakers.io team`
    return `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  // ─── Input style ───────────────────────────────────────────────
  const inp = {
    background: '#fff', padding: '13px 16px', borderRadius: 10,
    border: '1.5px solid #CBD5E1', fontSize: '.92rem',
    fontFamily: "'Nunito',sans-serif", color: '#0F172A', outline: 'none', width: '100%'
  }

  // ─── Login screen ──────────────────────────────────────────────
  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
      <div style={{ background: '#fff', padding: '48px 40px', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,.08)', maxWidth: 400, width: '100%' }}>
        <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.5rem', marginBottom: 8 }}>Agentmakers.io</h1>
        <p style={{ color: '#64748B', fontSize: '.92rem', marginBottom: 32 }}>Log in om door te gaan naar het dashboard.</p>
        <input type="text" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Gebruikersnaam" autoComplete="username" style={{ ...inp, marginBottom: 12 }} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Wachtwoord" autoComplete="current-password" style={{ ...inp, marginBottom: 16 }} />
        {loginError && <p style={{ color: '#EF4444', fontSize: '.84rem', marginBottom: 12, textAlign: 'center' }}>{loginError}</p>}
        <button onClick={login} style={{ width: '100%', padding: 14, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>Inloggen</button>
      </div>
    </div>
  )

  // ─── Main dashboard ────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: "'Nunito',sans-serif" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* Top nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: '#0D9488' }}>
          agentmakers.io <span style={{ fontSize: '.75rem', color: '#64748B', fontWeight: 400, marginLeft: 8 }}>admin</span>
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {currentUser && <span style={{ fontSize: '.84rem', color: '#64748B' }}>{currentUser.displayName}</span>}
          <button onClick={() => fetchData()} title="Herlaad alle data (pagina's, leads en gesprekken)" style={{ background: 'none', border: '1px solid #CBD5E1', padding: '7px 16px', borderRadius: 8, fontSize: '.82rem', cursor: 'pointer', color: '#64748B', fontFamily: "'Nunito',sans-serif" }}>↻ Verversen</button>
          <button onClick={logout} title="Uitloggen uit het admin dashboard" style={{ background: 'none', border: '1px solid #CBD5E1', padding: '7px 16px', borderRadius: 8, fontSize: '.82rem', cursor: 'pointer', color: '#64748B', fontFamily: "'Nunito',sans-serif" }}>Uitloggen</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 48px' }}>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 36 }}>
          {[
            { icon: '📄', val: pages.length,              label: "Pagina's",       sub: `${pages.filter(p => p.status === 'live').length} live` },
            { icon: '👁️', val: totalVisits,               label: 'Bezoekers',      sub: 'totaal' },
            { icon: '📥', val: leads.length,              label: 'Aanvragen',      sub: leadsThisWeek > 0 ? `+${leadsThisWeek} deze week` : 'totaal', subColor: leadsThisWeek > 0 ? '#166534' : undefined },
            { icon: '🎙', val: conversations.length,      label: 'Gesprekken',     sub: conversations.length > 0 ? fmtDuration(avgDuration) + ' gem.' : '—' },
            { icon: '📊', val: totalVisits > 0 ? `${((totalConversions / totalVisits) * 100).toFixed(1)}%` : '—', label: 'Conv. ratio', sub: `${totalConversions} conversies` },
            { icon: '🏆', val: bestPage ? `${((bestPage.conversions / bestPage.visits) * 100).toFixed(1)}%` : '—', label: 'Beste pagina', sub: bestPage ? bestPage.industry : '—' },
          ].map(({ icon, val, label, sub, subColor }) => (
            <div key={label} style={{ background: '#fff', padding: '18px 16px', borderRadius: 14, border: '1px solid #F1F5F9', textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>{icon}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#0D9488', lineHeight: 1.1 }}>{val}</div>
              <div style={{ fontSize: '.78rem', color: '#64748B', marginTop: 4 }}>{label}</div>
              {sub && <div style={{ fontSize: '.7rem', color: subColor || '#94A3B8', marginTop: 2, fontWeight: subColor ? 700 : 400 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {(['leads', 'analytics', 'conversations', 'outreach', ...(currentUser?.isAdmin ? ['pages'] : [])] as const).map(t2 => (
            <button key={t2} onClick={() => {
              setTab(t2 as typeof tab)
              if (t2 === 'leads') markAllSeen()
              if (t2 === 'conversations' && conversations.length === 0) fetchConversations()
            }}
              title={t2 === 'pages' ? "Beheer uw landingspagina's" : t2 === 'leads' ? 'Bekijk en beheer demo-aanvragen van prospects' : t2 === 'analytics' ? "Statistieken: bezoekers, conversies en ratio's" : t2 === 'conversations' ? 'Beluister en lees AI-gesprekken met prospects' : 'Verstuur gepersonaliseerde demo-links naar prospects'}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", background: tab === t2 ? '#0D9488' : '#fff', color: tab === t2 ? '#fff' : '#64748B', position: 'relative' }}>
              {t2 === 'pages' ? "📄 Pagina's" : t2 === 'leads' ? '📥 Aanvragen' : t2 === 'analytics' ? '📊 Analytics' : t2 === 'conversations' ? '🎙 Gesprekken' : t2 === 'outreach' ? '🚀 Outreach' : t2}
              {t2 === 'leads' && newLeadsCount > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: '.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {newLeadsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════ PAGES TAB ══════════════════════ */}
        {tab === 'pages' && (
          <div>
            {/* Uitlegbanner */}
            <div style={{ background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>📄</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.92rem', color: '#0D9488', marginBottom: 4 }}>Landingspagina&apos;s beheren</div>
                <div style={{ fontSize: '.83rem', color: '#334155', lineHeight: 1.6 }}>
                  Hier staan alle gepersonaliseerde landingspagina&apos;s. Elke pagina is gericht op een specifieke branche en bevat een AI-receptionist die bezoekers helpt.
                  Maak een nieuwe pagina aan met <strong>+ Nieuwe pagina</strong>, zet hem <strong>Live</strong> als hij klaar is, en pas teksten aan met <strong>✏ Bewerken</strong>.
                  Concept-pagina&apos;s zijn niet zichtbaar voor bezoekers.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem' }}>Landingspagina&apos;s</h2>
              <button onClick={() => setShowCreate(true)} title="Genereer een nieuwe landingspagina met AI voor een specifieke branche" style={{ background: '#0D9488', color: '#fff', padding: '12px 24px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                + Nieuwe pagina
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {loading ? <p>Laden...</p> : pages.map(page => (
                <div key={page.id} style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.05rem', fontWeight: 700 }}>{page.industry}</h3>
                    <span style={{ padding: '4px 12px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', background: page.status === 'live' ? '#DCFCE7' : '#FEF3C7', color: page.status === 'live' ? '#166534' : '#92400E' }}>
                      {page.status === 'live' ? 'Live' : 'Concept'}
                    </span>
                  </div>
                  <div style={{ fontSize: '.85rem', color: '#0D9488', marginBottom: 8 }}>/{page.slug}</div>
                  <div style={{ fontSize: '.8rem', color: '#64748B', marginBottom: 16 }}>
                    👁 {page.visits || 0} bezoeken &nbsp;|&nbsp; 📥 {page.conversions || 0} conversies
                    {page.visits > 0 && (
                      <span style={{ marginLeft: 8, background: '#F0FDF4', color: '#166534', padding: '2px 8px', borderRadius: 6, fontSize: '.72rem', fontWeight: 600 }}>
                        {((page.conversions / page.visits) * 100).toFixed(1)}% ratio
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => toggleStatus(page)} title={page.status === 'live' ? 'Pagina offline halen (onzichtbaar voor bezoekers)' : 'Pagina live zetten (zichtbaar voor bezoekers)'} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: `1px solid ${page.status === 'live' ? '#EF4444' : '#22C55E'}`, background: '#fff', color: page.status === 'live' ? '#EF4444' : '#22C55E' }}>
                      {page.status === 'live' ? 'Offline' : 'Live zetten'}
                    </button>
                    <button onClick={() => window.open(`/nl/${page.slug}`, '_blank')} title="Open deze landingspagina in een nieuw tabblad" style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #CBD5E1', background: '#fff', color: '#334155' }}>
                      Bekijken
                    </button>
                    <button onClick={() => openEditModal(page)} title="Bewerk de headlines en teksten op deze pagina (automatisch vertaald naar EN en ES)" style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #0D9488', background: '#F0FDFA', color: '#0D9488' }}>
                      ✏ Bewerken
                    </button>
                    <button onClick={() => setDeleteModal(page)} title="Pagina permanent verwijderen (kan niet ongedaan worden gemaakt)" style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #EF4444', background: '#fff', color: '#EF4444' }}>
                      Verwijder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════ LEADS TAB ══════════════════════ */}
        {tab === 'leads' && (
          <div>
            {/* Uitlegbanner */}
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>📥</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.92rem', color: '#1D4ED8', marginBottom: 4 }}>Demo-aanvragen opvolgen</div>
                <div style={{ fontSize: '.83rem', color: '#334155', lineHeight: 1.6 }}>
                  Hier zie je alle prospects die een demo hebben aangevraagd. Gebruik de <strong>status-dropdown</strong> per lead om bij te houden waar je staat in het verkoopproces
                  (Nieuw → Contact → Demo gepland → Gewonnen). Klik op <strong>▼</strong> om notities toe te voegen. Klik op <strong>✨ AI Opvolgen</strong> om een door AI geschreven, gepersonaliseerde mail te versturen.
                  Gebruik <strong>✓ Klaar</strong> als een lead volledig is afgehandeld. Met <strong>⬇ Exporteer CSV</strong> download je de volledige lijst.
                </div>
              </div>
            </div>
            {/* Pipeline summary bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              {PIPELINE_STAGES.map(stage => (
                <div key={stage.value} style={{ background: stage.bg, border: `1px solid ${stage.color}30`, borderRadius: 10, padding: '10px 18px', textAlign: 'center', flex: '1 1 0', minWidth: 80 }}>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.4rem', fontWeight: 700, color: stage.color }}>
                    {pipelineCounts[stage.value as keyof typeof pipelineCounts]}
                  </div>
                  <div style={{ fontSize: '.72rem', color: stage.color, fontWeight: 600, marginTop: 2 }}>{stage.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem' }}>Demo-aanvragen ({leads.length})</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                {selectedLeads.size > 0 && (
                  <button onClick={deleteSelectedLeads} disabled={deleteLeadsLoading} title={`Verwijder de ${selectedLeads.size} geselecteerde leads permanent`} style={{ background: '#FEF2F2', border: '1.5px solid #EF4444', color: '#DC2626', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", opacity: deleteLeadsLoading ? 0.5 : 1 }}>
                    🗑 Verwijder ({selectedLeads.size})
                  </button>
                )}
                <button onClick={exportCSV} title="Download alle leads inclusief status, notities en contactgegevens als CSV-bestand" style={{ background: '#fff', border: '1.5px solid #0D9488', color: '#0D9488', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                  ⬇ Exporteer CSV
                </button>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #F1F5F9' }}>
              {leads.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>Nog geen aanvragen ontvangen.</div>
              ) : (
                leads.map((lead, i) => {
                  const isNew      = !seenLeadIds.has(lead.id)
                  const isHandled  = handledLeads.has(lead.id)
                  const isExpanded = expandedLeadId === lead.id
                  const status     = leadStatus[lead.id] || 'nieuw'
                  const stage      = PIPELINE_STAGES.find(s => s.value === status) || PIPELINE_STAGES[0]
                  const matchedConv = getMatchedConv(lead)

                  return (
                    <div key={lead.id} style={{ borderTop: i > 0 ? '1px solid #F1F5F9' : 'none', background: selectedLeads.has(lead.id) ? '#EFF6FF' : isNew ? '#F0FDF4' : i % 2 === 0 ? '#fff' : '#FAFAFA', opacity: isHandled ? 0.55 : 1, transition: 'opacity .2s' }}>

                      {/* Main row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 110px auto auto auto', gap: 12, alignItems: 'center', padding: '14px 16px' }}>

                        {/* Checkbox */}
                        <input type="checkbox" checked={selectedLeads.has(lead.id)} onChange={() => toggleSelectLead(lead.id)} title="Selecteer voor bulk-verwijdering" style={{ cursor: 'pointer', width: 16, height: 16 }} />

                        {/* Name / Company */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isNew && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', flexShrink: 0, display: 'inline-block' }} title="Nieuw" />}
                            <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '.88rem' }}>{lead.naam}</span>
                          </div>
                          <div style={{ fontSize: '.76rem', color: '#64748B' }}>
                            {lead.bedrijfsnaam && <span>{lead.bedrijfsnaam}</span>}
                            {lead.bedrijfsnaam && lead.telefoon && ' · '}
                            {lead.telefoon && <span>{lead.telefoon}</span>}
                          </div>
                          {lead.website && (
                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.72rem', color: '#0D9488', display: 'block' }}>
                              {lead.website}
                            </a>
                          )}
                        </div>

                        {/* Email + pagina */}
                        <div>
                          <a href={`mailto:${lead.email}`} style={{ color: '#0D9488', fontSize: '.83rem', display: 'block' }}>{lead.email}</a>
                          <div style={{ fontSize: '.72rem', color: '#94A3B8' }}>/{lead.landing_page_slug} · {lead.language === 'nl' ? '🇳🇱' : lead.language === 'en' ? '🇬🇧' : '🇪🇸'} · {new Date(lead.created_at).toLocaleDateString('nl-NL')}</div>
                        </div>

                        {/* Status dropdown */}
                        <select
                          value={status}
                          onChange={e => setLeadStatus(prev => ({ ...prev, [lead.id]: e.target.value }))}
                          title="Verander de status van deze lead in de sales pipeline"
                          style={{ padding: '5px 8px', borderRadius: 7, border: `1.5px solid ${stage.color}50`, background: stage.bg, color: stage.color, fontWeight: 700, fontSize: '.72rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", outline: 'none' }}
                        >
                          {PIPELINE_STAGES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>

                        {/* Opvolgen button — AI email modal */}
                        {outreachSent[lead.demo_token || ''] ? (
                          <span title={`Outreach verstuurd op ${new Date(outreachSent[lead.demo_token || '']).toLocaleDateString('nl-NL')}`}
                            style={{ padding: '6px 12px', borderRadius: 7, fontSize: '.75rem', fontWeight: 700, border: '1px solid #86EFAC', background: '#F0FDF4', color: '#166534', whiteSpace: 'nowrap' }}>
                            ✓ Outreach verstuurd
                          </span>
                        ) : (
                          <button onClick={() => lead.email && openLeadEmailModal(lead)} disabled={!lead.email}
                            title={lead.email ? 'Laat AI een gepersonaliseerde outreach-mail schrijven en verstuur direct vanuit het dashboard' : 'Geen e-mailadres bekend voor deze lead'}
                            style={{ padding: '6px 12px', borderRadius: 7, fontSize: '.75rem', fontWeight: 700, border: '1px solid #7C3AED', background: '#7C3AED', color: '#fff', cursor: lead.email ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: lead.email ? 1 : 0.45, fontFamily: "'Nunito',sans-serif" }}>
                            ✨ AI Opvolgen
                          </button>
                        )}

                        {/* Matched conversation badge */}
                        {matchedConv ? (
                          <button
                            onClick={() => { setTab('conversations'); setOpenConvId(matchedConv) }}
                            style={{ padding: '5px 10px', borderRadius: 7, fontSize: '.72rem', fontWeight: 700, border: '1px solid #7C3AED', background: '#F5F3FF', color: '#7C3AED', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", whiteSpace: 'nowrap' }}
                            title="Er is een AI-gesprek gekoppeld aan deze lead — klik om het te bekijken"
                          >
                            🎙 Gesprek
                          </button>
                        ) : <span />}

                        {/* Handled + expand */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => toggleHandled(lead.id)} title={isHandled ? 'Markeer als niet-afgehandeld en heropenen' : 'Markeer deze lead als afgehandeld'} style={{ padding: '5px 10px', borderRadius: 6, fontSize: '.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: `1px solid ${isHandled ? '#CBD5E1' : '#22C55E'}`, background: isHandled ? '#F1F5F9' : '#F0FDF4', color: isHandled ? '#94A3B8' : '#166534', whiteSpace: 'nowrap' }}>
                            {isHandled ? 'Heropenen' : '✓ Klaar'}
                          </button>
                          <button onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)} title={isExpanded ? 'Verberg notities' : 'Toon notities voor deze lead'} style={{ padding: '5px 8px', borderRadius: 6, fontSize: '.72rem', border: '1px solid #CBD5E1', background: isExpanded ? '#F1F5F9' : '#fff', color: '#64748B', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded notes row */}
                      {isExpanded && (
                        <div style={{ padding: '0 16px 14px 64px', borderTop: '1px dashed #E2E8F0' }}>
                          <label style={{ fontSize: '.72rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4, marginTop: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Notitie</label>
                          <textarea
                            value={leadNotes[lead.id] || ''}
                            onChange={e => setLeadNotes(prev => ({ ...prev, [lead.id]: e.target.value }))}
                            placeholder="Voeg een notitie toe... (bijv. 'Gebeld op 3 april, demo gepland voor vrijdag')"
                            rows={3}
                            title="Interne notitie voor deze lead — alleen zichtbaar in het admin dashboard"
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: '.83rem', fontFamily: "'Nunito',sans-serif", color: '#0F172A', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════ ANALYTICS TAB ══════════════════════ */}
        {tab === 'analytics' && (
          <div>
            {/* Uitlegbanner */}
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>📊</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.92rem', color: '#B45309', marginBottom: 4 }}>Statistieken & prestaties</div>
                <div style={{ fontSize: '.83rem', color: '#334155', lineHeight: 1.6 }}>
                  Hier zie je hoeveel bezoekers elke pagina heeft ontvangen en hoeveel daarvan een demo hebben aangevraagd (<strong>conversieratio</strong>).
                  Filter op taal (NL/EN/ES) om te zien welke markt het best presteert. De <strong>beste pagina&apos;s</strong> rangschikking laat zien welke branches het meest converteren —
                  gebruik dit om te bepalen voor welke branche je nieuwe pagina&apos;s aanmaakt.
                </div>
              </div>
            </div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 20 }}>Analytics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
              {[
                ['Totaal bezoekers', totalVisits, '#0D9488'],
                ['Totaal conversies', totalConversions, '#22C55E'],
                ['Conversieratio', totalVisits > 0 ? `${((totalConversions / totalVisits) * 100).toFixed(1)}%` : '0%', '#F59E0B'],
              ].map(([label, val, color]) => (
                <div key={label as string} style={{ background: '#fff', padding: '32px 24px', borderRadius: 14, border: '1px solid #F1F5F9', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '2.4rem', fontWeight: 700, color: color as string }}>{val}</div>
                  <div style={{ fontSize: '.9rem', color: '#64748B', marginTop: 8 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #F1F5F9', marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1rem', fontWeight: 600 }}>Aanvragen per taal</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['all', 'nl', 'en', 'es'] as const).map(lang => (
                    <button key={lang} onClick={() => setAnalyticsLang(lang)} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: '.82rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", background: analyticsLang === lang ? '#0D9488' : '#F1F5F9', color: analyticsLang === lang ? '#fff' : '#64748B' }}>
                      {lang === 'all' ? 'Alle' : lang === 'nl' ? '🇳🇱 NL' : lang === 'en' ? '🇬🇧 EN' : '🇪🇸 ES'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                {[{ lang: 'nl', flag: '🇳🇱', label: 'Nederlands' }, { lang: 'en', flag: '🇬🇧', label: 'Engels' }, { lang: 'es', flag: '🇪🇸', label: 'Spaans' }].map(({ lang, flag, label }) => {
                  const count = leadsByLang[lang as 'nl' | 'en' | 'es']
                  const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0
                  return (
                    <div key={lang} style={{ textAlign: 'center', padding: '16px', background: '#F8FAFC', borderRadius: 10 }}>
                      <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{flag}</div>
                      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#0D9488' }}>{count}</div>
                      <div style={{ fontSize: '.8rem', color: '#64748B' }}>{label} · {pct}%</div>
                    </div>
                  )
                })}
              </div>
              {filteredLeads.length > 0 && <p style={{ fontSize: '.82rem', color: '#64748B', margin: 0 }}>Toont {filteredLeads.length} aanvragen{analyticsLang !== 'all' ? ` voor taal: ${analyticsLang.toUpperCase()}` : ''}</p>}
            </div>

            {sortedByRatio.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #F1F5F9', marginBottom: 24 }}>
                <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>🏆 Beste pagina&apos;s op conversieratio</h3>
                {sortedByRatio.map((page, i) => {
                  const ratio = ((page.conversions / page.visits) * 100).toFixed(1)
                  return (
                    <div key={page.id} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '.88rem', fontWeight: 600, color: '#0F172A' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {page.industry}</span>
                        <span style={{ fontSize: '.88rem', fontWeight: 700, color: '#0D9488' }}>{ratio}%</span>
                      </div>
                      <div style={{ background: '#F1F5F9', borderRadius: 4, height: 6 }}>
                        <div style={{ background: '#0D9488', borderRadius: 4, height: 6, width: `${Math.min(100, parseFloat(ratio) * 10)}%`, transition: 'width .4s' }} />
                      </div>
                      <div style={{ fontSize: '.75rem', color: '#94A3B8', marginTop: 2 }}>{page.visits} bezoekers · {page.conversions} conversies</div>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #F1F5F9' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9' }}>
                    {['Pagina', 'Bezoekers', 'Conversies', 'Ratio', 'Status'].map(h => (
                      <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: '.8rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page, i) => (
                    <tr key={page.id} style={{ borderTop: '1px solid #F1F5F9', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 600, color: '#0F172A' }}>
                        {page.industry}<br /><span style={{ fontSize: '.8rem', color: '#0D9488', fontWeight: 400 }}>/{page.slug}</span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>{page.visits || 0}</td>
                      <td style={{ padding: '16px 20px' }}>{page.conversions || 0}</td>
                      <td style={{ padding: '16px 20px' }}>{page.visits > 0 ? `${((page.conversions / page.visits) * 100).toFixed(1)}%` : '0%'}</td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700, background: page.status === 'live' ? '#DCFCE7' : '#FEF3C7', color: page.status === 'live' ? '#166534' : '#92400E' }}>
                          {page.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════ CONVERSATIONS TAB ══════════════════════ */}
        {tab === 'conversations' && (
          <div>
            {/* Uitlegbanner */}
            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🎙</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.92rem', color: '#7C3AED', marginBottom: 4 }}>AI-gesprekken beluisteren & lezen</div>
                <div style={{ fontSize: '.83rem', color: '#334155', lineHeight: 1.6 }}>
                  Hier staan alle gesprekken die bezoekers hebben gevoerd met de AI-receptionist. Klik op een gesprek om het <strong>transcript te lezen</strong> en (indien beschikbaar) de
                  <strong> geluidsopname te beluisteren</strong>. Als een gesprek gekoppeld is aan een lead uit de Aanvragen-tab, zie je een groene badge — klik daarop om direct naar die lead te gaan.
                  Gebruik <strong>↻ Vernieuwen</strong> om nieuwe gesprekken te laden.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem' }}>🎙 Gesprekken ({visibleConversations.length})</h2>
              <button onClick={() => fetchConversations()} disabled={convLoading} title="Herlaad de lijst met AI-gesprekken van de ElevenLabs agent" style={{ background: '#fff', border: '1.5px solid #0D9488', color: '#0D9488', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", opacity: convLoading ? 0.6 : 1 }}>
                {convLoading ? 'Laden…' : '↻ Vernieuwen'}
              </button>
            </div>

            {convLoading && visibleConversations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>Gesprekken laden…</div>
            )}
            {!convLoading && visibleConversations.length === 0 && (
              <div style={{ background: '#fff', borderRadius: 14, padding: '60px 24px', textAlign: 'center', color: '#94A3B8', border: '1px solid #F1F5F9' }}>
                Nog geen gesprekken gevonden.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleConversations.map(conv => {
                const isOpen = openConvId === conv.conversation_id
                const detail = convDetails[conv.conversation_id]
                const startDate = new Date(conv.start_time_unix_secs * 1000)
                const info = detail ? parseBusinessInfo(detail) : null
                const statusColor = conv.status === 'done' ? '#166534' : conv.status === 'failed' ? '#991B1B' : '#92400E'
                const statusBg   = conv.status === 'done' ? '#DCFCE7' : conv.status === 'failed' ? '#FEE2E2' : '#FEF3C7'

                // Find matching lead
                const matchedLead = info ? leads.find(l =>
                  (info.company && l.bedrijfsnaam && normalize(l.bedrijfsnaam) === normalize(info.company)) ||
                  (info.website && l.website && normalize(l.website) === normalize(info.website))
                ) : undefined

                return (
                  <div key={conv.conversation_id} style={{ background: '#fff', borderRadius: 14, border: `2px solid ${isOpen ? '#0D9488' : '#F1F5F9'}`, overflow: 'hidden', transition: 'border-color .2s' }}>
                    <div
                      onClick={async () => {
                        if (isOpen) { setOpenConvId(null); return }
                        setOpenConvId(conv.conversation_id)
                        await fetchConversationDetail(conv.conversation_id)
                      }}
                      style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ fontSize: '1rem', color: '#94A3B8', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▶</span>
                      <div style={{ minWidth: 130 }}>
                        <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#0F172A' }}>
                          {startDate.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '.76rem', color: '#94A3B8' }}>
                          {startDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {info && (info.contact || info.company) ? (
                          <>
                            <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {info.contact || info.company}
                            </div>
                            {info.contact && info.company && (
                              <div style={{ fontSize: '.76rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.company}</div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: '.85rem', color: '#CBD5E1' }}>{detail ? 'Onbekend' : 'Laden…'}</div>
                        )}
                        {/* Linked lead badge */}
                        {matchedLead && (
                          <button
                            onClick={e => { e.stopPropagation(); setTab('leads'); setExpandedLeadId(matchedLead.id) }}
                            style={{ marginTop: 4, padding: '2px 8px', borderRadius: 5, fontSize: '.68rem', fontWeight: 700, border: '1px solid #22C55E', background: '#F0FDF4', color: '#166534', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}
                          >
                            📥 Aanvraag: {matchedLead.naam}
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '.82rem', color: '#64748B', minWidth: 60, textAlign: 'right' }}>{fmtDuration(conv.call_duration_secs)}</div>
                      <span style={{ padding: '4px 10px', borderRadius: 100, fontSize: '.7rem', fontWeight: 700, background: statusBg, color: statusColor, minWidth: 60, textAlign: 'center' }}>
                        {conv.status === 'done' ? 'Klaar' : conv.status === 'failed' ? 'Mislukt' : conv.status}
                      </span>
                      {conv.has_audio && <span style={{ fontSize: '.72rem', fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8', padding: '3px 9px', borderRadius: 100 }}>🔊 Audio</span>}
                    </div>

                    {isOpen && (
                      <div style={{ borderTop: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                        {!detail ? (
                          <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>Transcript laden…</div>
                        ) : (
                          <div style={{ padding: '24px' }}>
                            {detail.has_audio && (
                              <div style={{ marginBottom: 24, background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>🔊 Geluidsopname</div>
                                <audio controls preload="none" style={{ width: '100%', height: 40 }} src={`/api/conversations/${detail.conversation_id}/audio`}>
                                  Uw browser ondersteunt geen audio element.
                                </audio>
                                <div style={{ fontSize: '.72rem', color: '#94A3B8', marginTop: 6 }}>
                                  Duur: {fmtDuration(detail.call_duration_secs)}{detail.cost != null && ` · Kosten: $${detail.cost.toFixed(4)}`}
                                </div>
                              </div>
                            )}
                            <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>💬 Transcript ({detail.transcript.length} berichten)</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
                              {detail.transcript.map((turn, j) => (
                                <div key={j} style={{ display: 'flex', justifyContent: turn.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                  <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: turn.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: turn.role === 'user' ? '#0D9488' : '#fff', color: turn.role === 'user' ? '#fff' : '#0F172A', fontSize: '.85rem', lineHeight: 1.5, border: turn.role === 'agent' ? '1px solid #E2E8F0' : 'none', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                                    <div style={{ fontSize: '.68rem', fontWeight: 700, marginBottom: 4, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                      {turn.role === 'user' ? '👤 Prospect' : '🤖 Agent'}{turn.time_in_call_secs != null && ` · ${fmtDuration(turn.time_in_call_secs)}`}
                                    </div>
                                    {turn.message}
                                  </div>
                                </div>
                              ))}
                              {detail.transcript.length === 0 && <p style={{ color: '#94A3B8', fontSize: '.85rem', textAlign: 'center', padding: '20px 0' }}>Geen transcript beschikbaar.</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      {/* ══════════════════════ CREATE MODAL ══════════════════════ */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 520, width: '100%', padding: 40, position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
            <button onClick={() => !creating && setShowCreate(false)} style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#F1F5F9', cursor: creating ? 'not-allowed' : 'pointer', fontSize: '1rem' }}>✕</button>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 8 }}>Nieuwe landingspagina</h2>
            <p style={{ color: '#64748B', fontSize: '.9rem', marginBottom: 28 }}>Claude AI schrijft de volledige pagina automatisch voor u.</p>
            {!creating ? (
              <>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Branchenaam</label>
                  <input value={newIndustry} onChange={e => { setNewIndustry(e.target.value); setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')) }} placeholder="bijv. Tandartspraktijken" style={inp} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>URL-slug</label>
                  <input value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="tandartsen" style={inp} />
                  <p style={{ fontSize: '.78rem', color: '#64748B', marginTop: 4 }}>Wordt: agentmakers.io/nl/<strong>{newSlug || 'slug'}</strong></p>
                </div>
                <button onClick={createPage} style={{ width: '100%', padding: 14, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                  ✨ Pagina genereren
                </button>
              </>
            ) : (
              <div style={{ paddingTop: 8 }}>
                {GENERATION_STEPS.map((step, i) => {
                  const done = i < generationStep; const active = i === generationStep
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, opacity: i > generationStep ? 0.3 : 1, transition: 'opacity .3s' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: done ? '#0D9488' : active ? '#FEF3C7' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', flexShrink: 0, border: active ? '2px solid #F59E0B' : 'none', transition: 'all .3s' }}>
                        {done ? '✓' : active ? '⏳' : i + 1}
                      </div>
                      <span style={{ fontSize: '.9rem', color: done ? '#0D9488' : active ? '#92400E' : '#94A3B8', fontWeight: active ? 600 : 400 }}>{step}</span>
                    </div>
                  )
                })}
                <div style={{ marginTop: 20, background: '#F1F5F9', borderRadius: 8, height: 6 }}>
                  <div style={{ background: '#0D9488', borderRadius: 8, height: 6, width: `${(generationStep / GENERATION_STEPS.length) * 100}%`, transition: 'width .5s ease' }} />
                </div>
                <p style={{ textAlign: 'center', fontSize: '.83rem', color: '#64748B', marginTop: 12 }}>Dit duurt ±15 seconden. Even geduld...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ EDIT MODAL ══════════════════════ */}
      {editModal && (() => {
        const ec = editContent
        const str = (k: string) => (ec[k] as string) || ''
        const arr = (k: string) => (ec[k] as Record<string, unknown>[]) || []

        const SECTIONS = [
          { id: 'hero',       icon: '🏠', label: 'Hero' },
          { id: 'probleem',   icon: '❓', label: 'Probleem' },
          { id: 'oplossing',  icon: '✅', label: 'Oplossing' },
          { id: 'usecases',   icon: '💡', label: 'Use Cases' },
          { id: 'agents',     icon: '🤖', label: 'Agents' },
          { id: 'stappen',    icon: '📋', label: 'Stappen' },
          { id: 'statistieken', icon: '📊', label: 'Statistieken' },
          { id: 'cta',        icon: '🎯', label: 'CTA' },
          { id: 'calculator', icon: '🧮', label: 'Calculator' },
        ]

        const Field = ({ label, k, rows = 1 }: { label: string; k: string; rows?: number }) => (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
            <textarea rows={rows} value={str(k)} onChange={e => setTextField(k, e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontFamily: "'Nunito',sans-serif", fontSize: '.9rem', color: '#1E293B', resize: 'vertical', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }} />
          </div>
        )

        const ArrayItemField = ({ arrKey, idx, field, label, rows = 1 }: { arrKey: string; idx: number; field: string; label: string; rows?: number }) => (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: '.68rem', fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
            <textarea rows={rows} value={(arr(arrKey)[idx]?.[field] as string) || ''}
              onChange={e => setArrayField(arrKey, idx, field, e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1.5px solid #E2E8F0', fontFamily: "'Nunito',sans-serif", fontSize: '.88rem', color: '#1E293B', resize: 'vertical', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }} />
          </div>
        )

        const SectionTitle = ({ title, sub }: { title: string; sub?: string }) => (
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.1rem', color: '#0F172A', margin: 0 }}>{title}</h3>
            {sub && <p style={{ color: '#94A3B8', fontSize: '.8rem', margin: '4px 0 0' }}>{sub}</p>}
          </div>
        )

        const Divider = () => <div style={{ borderTop: '1px solid #F1F5F9', margin: '20px 0' }} />

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: '1.05rem', color: '#0F172A' }}>✏ Pagina bewerken</div>
                <div style={{ fontSize: '.78rem', color: '#0D9488', marginTop: 2 }}>{editModal.industry} · /{editModal.slug}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '6px 12px', fontSize: '.75rem', color: '#92400E' }}>
                  ✨ Automatisch vertaald naar EN + ES bij opslaan
                </div>
                <button onClick={() => !editSaving && setEditModal(null)} disabled={editSaving}
                  style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                  Annuleren
                </button>
                <button onClick={saveEditModal} disabled={editSaving}
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: '.88rem', cursor: editSaving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito',sans-serif", opacity: editSaving ? 0.7 : 1 }}>
                  {editSaving ? '⏳ Opslaan…' : '✓ Opslaan & vertalen'}
                </button>
              </div>
            </div>

            {/* Body: sidebar + content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Sidebar */}
              <div style={{ width: 180, background: '#F8FAFC', borderRight: '1px solid #E2E8F0', padding: '20px 12px', overflowY: 'auto', flexShrink: 0 }}>
                {SECTIONS.map(s => (
                  <button key={s.id} onClick={() => setEditSection(s.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, border: 'none', marginBottom: 4, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", fontWeight: editSection === s.id ? 700 : 500, fontSize: '.85rem', background: editSection === s.id ? '#0D9488' : 'transparent', color: editSection === s.id ? '#fff' : '#334155', textAlign: 'left' }}>
                    <span>{s.icon}</span>{s.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', background: '#fff' }}>

                {editSection === 'hero' && <>
                  {SectionTitle({ title: 'Hero', sub: 'Eerste sectie bovenaan de pagina' })}
                  {Field({ label: 'Headline', k: 'hero_headline', rows: 2 })}
                  {Field({ label: 'Subline', k: 'hero_subline', rows: 3 })}
                  {Field({ label: 'Badge (klein label boven headline)', k: 'hero_badge' })}
                  {Divider()}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: '.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Hero afbeelding</label>
                    {editHeroImage && (
                      <img src={editHeroImage} alt="Hero preview"
                        style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 10, marginBottom: 10, border: '1.5px solid #E2E8F0', display: 'block' }} />
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={editHeroImage} onChange={e => setEditHeroImage(e.target.value)}
                        placeholder="Plak een afbeelding-URL..."
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontFamily: "'Nunito',sans-serif", fontSize: '.88rem', color: '#1E293B', outline: 'none', boxSizing: 'border-box' }} />
                      <button onClick={() => editModal && refreshHeroImage(editModal.industry)} disabled={heroImageLoading}
                        style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: heroImageLoading ? '#E2E8F0' : '#0D9488', color: heroImageLoading ? '#94A3B8' : '#fff', fontWeight: 700, fontSize: '.82rem', cursor: heroImageLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: "'Nunito',sans-serif" }}>
                        {heroImageLoading ? '⏳ Laden…' : '🔄 Nieuwe foto'}
                      </button>
                    </div>
                    <p style={{ fontSize: '.75rem', color: '#94A3B8', marginTop: 6 }}>Klik op &quot;Nieuwe foto&quot; voor een andere Unsplash-foto, of plak zelf een URL.</p>
                  </div>
                </>}

                {editSection === 'probleem' && <>
                  {SectionTitle({ title: 'Probleem', sub: 'Blok dat het probleem van de klant beschrijft' })}
                  {Field({ label: 'Headline', k: 'problem_headline', rows: 2 })}
                  {Field({ label: 'Tekst', k: 'problem_body', rows: 4 })}
                </>}

                {editSection === 'oplossing' && <>
                  {SectionTitle({ title: 'Oplossing', sub: 'Blok dat de oplossing introduceert' })}
                  {Field({ label: 'Headline', k: 'solution_headline', rows: 2 })}
                  {Field({ label: 'Subline', k: 'solution_subline', rows: 3 })}
                </>}

                {editSection === 'usecases' && <>
                  {SectionTitle({ title: 'Use Cases', sub: 'Sectie met concrete toepassingen' })}
                  {Field({ label: 'Label (klein label boven sectie)', k: 'usecases_label' })}
                  {Field({ label: 'Headline', k: 'usecases_headline', rows: 2 })}
                  {Field({ label: 'Subline', k: 'usecases_subline', rows: 2 })}
                  {Divider()}
                  {arr('usecases').map((_, i) => (
                    <div key={i} style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 18px', marginBottom: 14, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#0D9488', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Use case {i + 1}</div>
                      {ArrayItemField({ arrKey: 'usecases', idx: i, field: 'title', label: 'Titel' })}
                      {ArrayItemField({ arrKey: 'usecases', idx: i, field: 'body', label: 'Tekst', rows: 2 })}
                    </div>
                  ))}
                </>}

                {editSection === 'agents' && <>
                  {SectionTitle({ title: 'Agents', sub: 'Kaarten met de verschillende agent-types' })}
                  {Field({ label: 'Label', k: 'agents_label' })}
                  {Field({ label: 'Headline', k: 'agents_headline', rows: 2 })}
                  {Field({ label: 'Subline', k: 'agents_subline', rows: 2 })}
                  {Divider()}
                  {arr('agents').map((_, i) => (
                    <div key={i} style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 18px', marginBottom: 14, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#0D9488', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Agent {i + 1}</div>
                      {ArrayItemField({ arrKey: 'agents', idx: i, field: 'title', label: 'Titel' })}
                      {ArrayItemField({ arrKey: 'agents', idx: i, field: 'body', label: 'Tekst', rows: 2 })}
                      {ArrayItemField({ arrKey: 'agents', idx: i, field: 'tag', label: "Tag (bijv. 'Inkomend')" })}
                    </div>
                  ))}
                </>}

                {editSection === 'stappen' && <>
                  {SectionTitle({ title: 'Stappen', sub: 'Hoe het werkt — stappenplan' })}
                  {Field({ label: 'Titel', k: 'steps_title', rows: 2 })}
                  {Field({ label: 'Subtitel', k: 'steps_sub', rows: 2 })}
                  {Divider()}
                  {arr('steps').map((_, i) => (
                    <div key={i} style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 18px', marginBottom: 14, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#0D9488', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Stap {i + 1}</div>
                      {ArrayItemField({ arrKey: 'steps', idx: i, field: 'title', label: 'Titel' })}
                      {ArrayItemField({ arrKey: 'steps', idx: i, field: 'body', label: 'Tekst', rows: 2 })}
                    </div>
                  ))}
                </>}

                {editSection === 'statistieken' && <>
                  {SectionTitle({ title: 'Statistieken', sub: 'Cijfers en resultaten' })}
                  {Field({ label: 'Label', k: 'stats_label' })}
                  {Field({ label: 'Headline', k: 'stats_title', rows: 2 })}
                  {Divider()}
                  {arr('stats').map((_, i) => (
                    <div key={i} style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 18px', marginBottom: 14, border: '1px solid #E2E8F0', display: 'flex', gap: 16 }}>
                      <div style={{ width: 100, flexShrink: 0 }}>
                        {ArrayItemField({ arrKey: 'stats', idx: i, field: 'value', label: 'Waarde' })}
                      </div>
                      <div style={{ flex: 1 }}>
                        {ArrayItemField({ arrKey: 'stats', idx: i, field: 'label', label: 'Label', rows: 2 })}
                      </div>
                    </div>
                  ))}
                </>}

                {editSection === 'cta' && <>
                  {SectionTitle({ title: 'Call to Action', sub: 'Afsluitende sectie onderaan de pagina' })}
                  {Field({ label: 'Headline', k: 'cta_headline', rows: 2 })}
                </>}

                {editSection === 'calculator' && <>
                  {SectionTitle({ title: 'Calculator', sub: 'Interactieve omzetberekening' })}
                  {Field({ label: 'Label slider 1 (gemiste afspraken)', k: 'calc_calls_label' })}
                  {Field({ label: 'Label slider 2 (gemiddelde waarde per afspraak)', k: 'calc_value_label' })}
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Standaard aantal gemiste afspraken</label>
                      <input type="number" value={(ec.revenue_calls as number) || 5}
                        onChange={e => setEditContent(prev => ({ ...prev, revenue_calls: Number(e.target.value) }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: '.9rem', color: '#1E293B', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Standaard waarde per afspraak (€)</label>
                      <input type="number" value={(ec.revenue_per_call as number) || 500}
                        onChange={e => setEditContent(prev => ({ ...prev, revenue_per_call: Number(e.target.value) }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: '.9rem', color: '#1E293B', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </>}

              </div>
            </div>
          </div>
        )
      })()}

      {/* ══════════════════════ OUTREACH TAB ══════════════════════ */}
      {tab === 'outreach' && (
        <div>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 16 }}>🚀 Bulk outreach</h2>

            {/* Uitlegbanner */}
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🗺️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '.92rem', color: '#C2410C', marginBottom: 8 }}>Zo werkt de outreach — 3 stappen</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: '.82rem', color: '#334155', lineHeight: 1.6 }}>
                  <div><strong>Stap 1 — Prospects zoeken:</strong> Gebruik de <em>Prospect finder</em> om bedrijven te zoeken via Google Maps. Vink de gewenste prospects aan en klik op <em>Importeer geselecteerd</em>.</div>
                  <div><strong>Stap 2 — Controleer &amp; genereer:</strong> Controleer de lijst, kies een taal en klik op <em>Genereer demo-links</em>. Wil je handmatig een lijst invoeren? Gebruik het CSV-veld bovenaan.</div>
                  <div><strong>Stap 3 — Versturen:</strong> Kopieer de links of klik op <em>✉ Verstuur mail</em> om direct een outreach-e-mail te sturen naar prospects met een e-mailadres.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Auto-scraper — subtiele statusregel */}
          <div style={{ fontSize: '.78rem', color: '#94A3B8', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🤖</span>
            <span>De AI-agent wordt automatisch gepersonaliseerd op de website van elk bedrijf zodra je demo-links genereert.</span>
            {scrapeQueueResult && (
              <span style={{ color: '#0D9488', fontWeight: 600 }}>✓ {scrapeQueueResult.processed} bedrijven verwerkt</span>
            )}
          </div>

          {/* Prospect finder */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, border: '1px solid #E2E8F0', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ background: '#0D9488', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.85rem', flexShrink: 0 }}>1</span>
              <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.05rem', margin: 0 }}>🔍 Prospect finder — bedrijven zoeken</h3>
            </div>
            <p style={{ color: '#64748B', fontSize: '.82rem', marginBottom: 16, marginLeft: 40 }}>Typ een branche + stad (bijv. <em>"loodgieter amsterdam"</em>). Vink de bedrijven aan die je wilt benaderen en klik op <strong>Importeer geselecteerd</strong> — je gaat direct naar de controleer-stap.</p>

            {prospectNoApiKey ? (
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: 16, fontSize: '.85rem', color: '#92400E' }}>
                <strong>GOOGLE_MAPS_API_KEY ontbreekt.</strong> Voeg deze toe in je Vercel project → Settings → Environment Variables. Vraag een gratis sleutel aan via <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: '#0D9488' }}>Google Cloud Console</a> en activeer de &quot;Places API&quot;.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input
                    value={prospectQuery}
                    onChange={e => setProspectQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchProspects()}
                    placeholder='bijv. "loodgieter amsterdam" of "tandarts rotterdam"'
                    title="Typ een branche en stad om bedrijven te zoeken via Google Maps (druk Enter of klik Zoek)"
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: '.88rem', color: '#1E293B', outline: 'none' }}
                  />
                  <button onClick={searchProspects} disabled={prospectLoading}
                    title="Zoek bedrijven op Google Maps op basis van uw zoekopdracht"
                    style={{ background: '#0D9488', color: '#fff', padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '.88rem', cursor: prospectLoading ? 'not-allowed' : 'pointer', fontFamily: "'Nunito',sans-serif", whiteSpace: 'nowrap', opacity: prospectLoading ? 0.7 : 1 }}>
                    {prospectLoading ? '⏳ Zoeken…' : '🔍 Zoek'}
                  </button>
                </div>

                {prospectError && <div style={{ color: '#DC2626', fontSize: '.83rem', marginBottom: 12 }}>{prospectError}</div>}

                {prospectResults.length > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: '.82rem', color: '#64748B' }}>{prospectResults.length} bedrijven gevonden met website</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setSelectedProspects(new Set(prospectResults.map((_, i) => i)))}
                          title="Selecteer alle gevonden prospects voor import"
                          style={{ fontSize: '.75rem', padding: '5px 12px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', color: '#334155' }}>
                          Alles selecteren
                        </button>
                        {selectedProspects.size > 0 && (
                          <button onClick={importSelectedProspects}
                            title="Voeg de geselecteerde prospects toe aan de controleer-lijst en genereer direct demo-links"
                            style={{ fontSize: '.75rem', padding: '5px 12px', borderRadius: 6, border: '1px solid #7C3AED', background: '#7C3AED', cursor: 'pointer', color: '#fff', fontWeight: 700 }}>
                            ↓ Importeer {selectedProspects.size} geselecteerd
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC' }}>
                            <th style={{ padding: '8px 10px', width: 32 }}></th>
                            {['Bedrijf', 'Website', 'Telefoon', 'Adres', '⭐'].map(h => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748B', fontWeight: 600, borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {prospectResults.map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #F8FAFC', background: selectedProspects.has(i) ? '#F0FDFA' : 'transparent', cursor: 'pointer' }}
                              onClick={() => setSelectedProspects(prev => {
                                const n = new Set(prev)
                                n.has(i) ? n.delete(i) : n.add(i)
                                return n
                              })}>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <input type="checkbox" checked={selectedProspects.has(i)} readOnly style={{ cursor: 'pointer' }} />
                              </td>
                              <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1E293B' }}>{p.bedrijfsnaam}</td>
                              <td style={{ padding: '8px 10px' }}>
                                <a href={p.website.startsWith('http') ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{ color: '#0D9488', fontSize: '.78rem' }}>
                                  {p.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                                </a>
                              </td>
                              <td style={{ padding: '8px 10px', color: '#334155', fontSize: '.78rem', whiteSpace: 'nowrap' }}>
                                {p.telefoon
                                  ? <a href={`tel:${p.telefoon}`} onClick={e => e.stopPropagation()} style={{ color: '#0369A1', textDecoration: 'none' }}>{p.telefoon}</a>
                                  : <span style={{ color: '#CBD5E1' }}>—</span>}
                              </td>
                              <td style={{ padding: '8px 10px', color: '#94A3B8', fontSize: '.75rem' }}>{p.adres?.split(',')[1]?.trim() || '—'}</td>
                              <td style={{ padding: '8px 10px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                {p.rating ? `${p.rating} (${p.reviews})` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Step 2: CSV input — verborgen zodra prospects zijn geïmporteerd of resultaten klaar zijn */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, border: '1px solid #E2E8F0', marginBottom: 20, display: bulkParsed.length === 0 ? 'block' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ background: '#0D9488', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.85rem', flexShrink: 0 }}>2</span>
                <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.05rem', margin: 0 }}>CSV plakken of importeren</h3>
              </div>
              <button onClick={() => setBulkCsv('Loodgieter Jansen,loodgieterJansen.nl,Kees Jansen,kees@loodgieterjansen.nl,0612345678\nTandarts Smit,tandartsmit.nl,Dr. Smit,info@tandartsmit.nl,')}
                title="Vul het CSV-veld met voorbeelddata om te zien hoe het formaat werkt"
                style={{ fontSize: '.75rem', color: '#0D9488', background: 'none', border: '1px solid #0D9488', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                Voorbeeld laden
              </button>
            </div>
            <textarea
              id="csv-textarea"
              value={bulkCsv}
              onChange={e => setBulkCsv(e.target.value)}
              placeholder={'bedrijfsnaam,website,naam,email,telefoon\nLoodgieter Jansen,loodgieterjansen.nl,Kees,kees@test.nl,\nTandarts Smit,tandartsmit.nl,,,'}
              title="Plak hier uw CSV-data. Verplichte kolommen: bedrijfsnaam, website. Optioneel: naam, email, telefoon"
              style={{ width: '100%', minHeight: 160, padding: 12, borderRadius: 8, border: '1.5px solid #E2E8F0', fontFamily: 'monospace', fontSize: '.82rem', color: '#334155', resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
            />
            {bulkError && <div style={{ marginTop: 8, color: '#DC2626', fontSize: '.83rem' }}>{bulkError}</div>}
            <button onClick={handleBulkProcess}
              title="Verwerk de ingevoerde CSV-data en toon een voorbeeld van de prospects"
              style={{ marginTop: 12, background: '#0D9488', color: '#fff', padding: '11px 24px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
              Verwerk CSV →
            </button>
          </div>

          {/* Step 2: Preview */}
          {bulkParsed.length > 0 && bulkResults.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 28, border: '1px solid #E2E8F0', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ background: '#7C3AED', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.85rem', flexShrink: 0 }}>2</span>
                  <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.05rem', margin: 0 }}>Controleer de lijst ({bulkParsed.length} prospects)</h3>
                  <button onClick={() => { setBulkParsed([]); setBulkCsv('') }} style={{ fontSize: '.75rem', color: '#64748B', background: 'none', border: '1px solid #CBD5E1', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>← Terug</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Language selector — mandatory */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: '.7rem', fontWeight: 700, color: bulkLanguage ? '#64748B' : '#DC2626', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                      {bulkLanguage ? 'Taal demo' : '⚠ Kies een taal'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: `1px solid ${bulkLanguage ? '#E2E8F0' : '#FCA5A5'}`, borderRadius: 9, padding: '4px 6px' }}
                      title="Verplicht — kies de taal van de demo-pagina die de prospect te zien krijgt">
                      {(['nl', 'en', 'es'] as const).map(lang => (
                        <button key={lang} onClick={() => setBulkLanguage(lang)}
                          style={{ padding: '5px 10px', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer', transition: 'all .15s',
                            background: bulkLanguage === lang ? '#7C3AED' : 'transparent',
                            color: bulkLanguage === lang ? '#fff' : '#64748B' }}>
                          {lang === 'nl' ? '🇳🇱 NL' : lang === 'en' ? '🇬🇧 EN' : '🇪🇸 ES'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleBulkGenerate} disabled={bulkLoading || !bulkLanguage}
                    title={!bulkLanguage ? 'Kies eerst een taal voor de demo-pagina' : 'Genereer voor elke prospect een gepersonaliseerde demo-pagina en unieke link'}
                    style={{ background: bulkLoading || !bulkLanguage ? '#94A3B8' : '#7C3AED', color: '#fff', padding: '11px 24px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: '.9rem', cursor: bulkLoading || !bulkLanguage ? 'not-allowed' : 'pointer', fontFamily: "'Nunito',sans-serif", opacity: !bulkLanguage ? 0.6 : 1 }}>
                    {bulkLoading ? '⏳ Aanmaken…' : `✨ Genereer ${bulkParsed.length} demo-links`}
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['Bedrijf', 'Website', 'Naam', 'Email'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748B', fontWeight: 600, borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkParsed.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E293B' }}>{r.bedrijfsnaam}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>{r.website}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>{r.naam || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>{r.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {bulkResults.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 28, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ background: '#166534', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.85rem', flexShrink: 0 }}>3</span>
                  <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.05rem', margin: 0 }}>
                    Demo-links klaar 🎉
                    <span style={{ marginLeft: 10, fontSize: '.78rem', fontWeight: 400, color: '#64748B' }}>
                      {bulkResults.filter(r => r.status === 'ok').length}/{bulkResults.length} gelukt
                    </span>
                  </h3>
                </div>
                <button onClick={() => { setBulkParsed([]); setBulkResults([]); setBulkCsv(''); setScrapeLoading(false); setScrapeDone(false); setScrapeQueueResult(null); setScrapeProgress(null); setScrapeTimedOut(false); setBulkLanguage(null) }}
                  title="Verwijder de huidige resultaten en start met een nieuwe batch prospects"
                  style={{ fontSize: '.8rem', color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}>
                  ↺ Nieuwe batch
                </button>
              </div>

              {/* Scrape progress banner */}
              {scrapeLoading && scrapeProgress && (
                <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontSize: '.85rem', color: '#92400E' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ display: 'inline-block', animation: 'spin 1.2s linear infinite' }}>⏳</span>
                    AI-agent wordt gepersonaliseerd op de websites van de bedrijven… ({scrapeProgress.scraped}/{scrapeProgress.total})
                  </div>
                  <div style={{ background: '#FED7AA', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                    <div style={{ background: '#EA580C', height: '100%', borderRadius: 99, width: `${Math.round((scrapeProgress.scraped / scrapeProgress.total) * 100)}%`, transition: 'width .5s ease' }} />
                  </div>
                </div>
              )}
              {scrapeTimedOut && !scrapeDone && (
                <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontSize: '.85rem', color: '#9F1239', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span>
                    ❌ Website-scraping duurde langer dan 2 minuten. De knoppen blijven geblokkeerd tot de personalisatie klaar is.
                    {scrapeProgress && scrapeProgress.scraped < scrapeProgress.total && (
                      <> ({scrapeProgress.scraped}/{scrapeProgress.total} klaar)</>
                    )}
                  </span>
                  <button
                    onClick={() => handleRetryScrapin(bulkResults.filter(r => r.status === 'ok').map(r => r.demo_token))}
                    style={{ background: '#9F1239', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Nunito',sans-serif" }}>
                    ↺ Opnieuw proberen
                  </button>
                </div>
              )}
              {scrapeDone && !scrapeTimedOut && scrapeQueueResult && (
                <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, padding: '12px 18px', marginBottom: 16, fontSize: '.85rem', color: '#166534' }}>
                  ✅ AI-agent gepersonaliseerd voor <strong>{scrapeQueueResult.processed}</strong> van de {scrapeQueueResult.total} bedrijven — links zijn klaar om te versturen!
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['Bedrijf', 'Demo-link', 'Acties'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748B', fontWeight: 600, borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F8FAFC', background: r.status === 'error' ? '#FEF2F2' : 'transparent' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600, color: '#1E293B' }}>{r.bedrijfsnaam}</div>
                          {r.naam && <div style={{ fontSize: '.75rem', color: '#94A3B8' }}>{r.naam}</div>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {r.status === 'ok' ? (
                            <a href={r.demo_url} target="_blank" rel="noopener noreferrer"
                              style={{ color: '#0D9488', fontSize: '.78rem', fontFamily: 'monospace', textDecoration: 'none' }}>
                              {r.demo_url.replace('https://agentmakers.io', '')}
                            </a>
                          ) : (
                            <span style={{ color: '#DC2626', fontSize: '.78rem' }}>Fout: {r.error}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {r.status === 'ok' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => scrapeDone && copyLink(r.demo_url, i)}
                                disabled={!scrapeDone}
                                title={scrapeDone ? 'Kopieer de demo-link naar het klembord om te plakken in een e-mail of WhatsApp' : 'Wacht tot de AI-agent gepersonaliseerd is…'}
                                style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #E2E8F0', background: copiedIdx === i ? '#DCFCE7' : '#F8FAFC', color: copiedIdx === i ? '#166534' : '#64748B', fontWeight: 600, fontSize: '.75rem', cursor: scrapeDone ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: scrapeDone ? 1 : 0.4 }}>
                                {copiedIdx === i ? '✓ Gekopieerd' : '📋 Kopieer link'}
                              </button>
                              {r.email && (() => {
                                const alreadySent = sentIdx.has(i) || !!outreachSent[r.demo_token]
                                const sentDate = outreachSent[r.demo_token]
                                  ? new Date(outreachSent[r.demo_token]).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                                  : null
                                return alreadySent ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{ padding: '6px 12px', borderRadius: 7, background: '#DCFCE7', color: '#166534', fontWeight: 700, fontSize: '.75rem', whiteSpace: 'nowrap' }}>✓ Outreach verstuurd</span>
                                    {sentDate && <span style={{ fontSize: '.68rem', color: '#94A3B8', paddingLeft: 4 }}>{sentDate}</span>}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => openEmailModal(r, i)}
                                    disabled={!scrapeDone}
                                    title={scrapeDone ? 'Laat AI een gepersonaliseerde outreach-mail schrijven op basis van de website van dit bedrijf' : 'Wacht tot de AI-agent gepersonaliseerd is…'}
                                    style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #7C3AED', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: '.75rem', cursor: !scrapeDone ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: !scrapeDone ? 0.4 : 1 }}>
                                    ✨ AI-mail schrijven
                                  </button>
                                )
                              })()}
                              {sendErrors[i] && <span style={{ fontSize: '.7rem', color: '#DC2626' }}>{sendErrors[i]}</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Export all links */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
                <button onClick={() => {
                  const rows = ['bedrijfsnaam,demo_url,email'].concat(
                    bulkResults.filter(r => r.status === 'ok').map(r => `"${r.bedrijfsnaam}","${r.demo_url}","${r.email}"`)
                  )
                  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'demo-links.csv'; a.click()
                  URL.revokeObjectURL(url)
                }} title="Download een CSV met alle gegenereerde demo-links — handig om in te laden in een e-mailtool zoals Mailchimp of HubSpot" style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#334155', padding: '10px 20px', borderRadius: 9, fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                  ⬇ Download alle links als CSV
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* ══════════════════════ AI EMAIL MODAL ══════════════════════ */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 640, width: '100%', padding: 36, boxShadow: '0 24px 64px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.1rem', margin: 0, marginBottom: 4 }}>✨ AI-mail voor {emailModal.bedrijfsnaam}</h2>
                <p style={{ fontSize: '.8rem', color: '#64748B', margin: 0 }}>Naar: {emailModal.email}</p>
              </div>
              <button onClick={() => setEmailModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94A3B8', lineHeight: 1, padding: 4 }}>×</button>
            </div>

            {emailGenerating ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 14 }}>
                <div style={{ fontSize: '2rem', animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>✨</div>
                <p style={{ color: '#64748B', fontSize: '.9rem', margin: 0 }}>AI schrijft een gepersonaliseerde mail op basis van de website van {emailModal.bedrijfsnaam}…</p>
              </div>
            ) : emailGenError ? (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '16px', marginBottom: 16, color: '#DC2626', fontSize: '.85rem' }}>
                ⚠ {emailGenError}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 6 }}>Onderwerp</label>
                  <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: '.9rem', fontFamily: "'Nunito',sans-serif", boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 6 }}>E-mailtekst</label>
                  <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                    rows={12}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: '.85rem', fontFamily: "'Nunito',sans-serif", lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <button onClick={() => setEmailModal(null)}
                style={{ flex: 1, padding: '11px', background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 10, fontWeight: 600, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                Annuleren
              </button>
              <button onClick={() => { setEmailSubject(''); setEmailBody(''); setEmailGenError(''); openEmailModal({ bedrijfsnaam: emailModal.bedrijfsnaam, naam: emailModal.naam, email: emailModal.email, demo_url: emailModal.demo_url, demo_token: emailModal.demo_token, website: '', status: 'ok' } as BulkResult, emailModal.idx) }}
                disabled={emailGenerating}
                style={{ padding: '11px 18px', background: '#F8FAFC', color: '#7C3AED', border: '1px solid #7C3AED', borderRadius: 10, fontWeight: 600, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", whiteSpace: 'nowrap' }}>
                ↺ Herschrijven
              </button>
              <button onClick={sendEmailFromModal}
                disabled={emailSending || emailGenerating || !emailSubject || !emailBody}
                style={{ flex: 2, padding: '11px', background: emailSending || !emailSubject ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.9rem', cursor: emailSending || !emailSubject ? 'not-allowed' : 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                {emailSending ? '⏳ Verzenden…' : `📤 Verstuur naar ${emailModal.email}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ DELETE CONFIRM MODAL ══════════════════════ */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 440, width: '100%', padding: 40, boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 16 }}>🗑️</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', marginBottom: 8, textAlign: 'center' }}>Pagina verwijderen?</h2>
            <p style={{ color: '#64748B', fontSize: '.9rem', textAlign: 'center', marginBottom: 28 }}>
              Je staat op het punt <strong>{deleteModal.industry}</strong> (<code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, fontSize: '.82rem' }}>/{deleteModal.slug}</code>) permanent te verwijderen. Dit kan niet ongedaan worden gemaakt.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteModal(null)} style={{ flex: 1, padding: 14, background: '#F1F5F9', color: '#334155', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: '.95rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>Annuleren</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: 14, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.95rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>Ja, verwijder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
