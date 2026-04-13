'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

const SEEN_LEADS_STORAGE   = 'agentmakers_seen_leads'
const LEAD_STATUS_STORAGE  = 'agentmakers_lead_status'
const LEAD_NOTES_STORAGE   = 'agentmakers_lead_notes'
// Outreach history is namespaced per userId so each partner has their own sent history.
// When superadmin views-as a partner, they read/write that partner's namespace.
const outreachStorageKey = (userId?: string) =>
  userId ? `agentmakers_outreach_sent_${userId}` : 'agentmakers_outreach_sent'

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
  // ── Password reset state ──────────────────────────────────────────
  type LoginScreen = 'login' | 'forgot' | 'forgot-sent' | 'reset' | 'reset-done'
  const [loginScreen, setLoginScreen] = useState<LoginScreen>('login')
  const [resetEmail, setResetEmail]   = useState('')
  const [resetToken, setResetToken]   = useState('')
  const [resetPw1, setResetPw1]       = useState('')
  const [resetPw2, setResetPw2]       = useState('')
  const [resetError, setResetError]   = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  // ── Superadmin set-password state ─────────────────────────────────
  const [setPwTarget, setSetPwTarget] = useState<{ id: string; name: string } | null>(null)
  const [setPwValue, setSetPwValue]   = useState('')
  const [setPwLoading, setSetPwLoading] = useState(false)
  const [setPwError, setSetPwError]   = useState('')
  const [setPwDone, setSetPwDone]     = useState(false)
  interface CurrentUser { userId: string; displayName: string; isAdmin: boolean; isSuperAdmin: boolean }
  interface AccountStat {
    id: string; username: string; displayName: string
    isAdmin: boolean; isSuperAdmin: boolean; createdAt: string
    leadsTotal: number; leadsThisMonth: number; demosGenerated: number
    conversations: number; lastActiveAt: string | null
  }
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [viewAsUser, setViewAsUser]   = useState<{ id: string; name: string } | null>(null)
  const [accounts, setAccounts]       = useState<AccountStat[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [authed, setAuthed]     = useState(false)
  const [tab, setTab]           = useState<'pages' | 'leads' | 'analytics' | 'conversations' | 'outreach' | 'accounts'>('leads')
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
  const [heroImageKey, setHeroImageKey]     = useState(0)

  // Analytics
  const [analyticsLang, setAnalyticsLang]   = useState<'all' | 'nl' | 'en' | 'es'>('all')

  // Invite modal
  const [inviteOpen, setInviteOpen]         = useState(false)
  const [inviteNaam, setInviteNaam]         = useState('')
  const [inviteBedrijf, setInviteBedrijf]   = useState('')
  const [inviteEmail, setInviteEmail]       = useState('')
  const [inviteWebsite, setInviteWebsite]   = useState('')
  const [inviteLang, setInviteLang]         = useState<'nl' | 'en' | 'es'>('nl')
  const [inviteLoading, setInviteLoading]   = useState(false)
  const [inviteResult, setInviteResult]     = useState<{ demo_url: string; naam: string } | null>(null)
  const [inviteError, setInviteError]       = useState('')

  const resetInvite = () => {
    setInviteNaam(''); setInviteBedrijf(''); setInviteEmail('')
    setInviteWebsite(''); setInviteLang('nl'); setInviteResult(null); setInviteError('')
  }

  const sendInvite = async () => {
    if (!inviteNaam || !inviteEmail || !inviteWebsite) { setInviteError('Naam, e-mail en website zijn verplicht'); return }
    setInviteLoading(true); setInviteError('')
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: inviteNaam, bedrijfsnaam: inviteBedrijf, email: inviteEmail, website: inviteWebsite, language: inviteLang }),
      })
      const data = await res.json()
      if (!res.ok) { setInviteError(data.error || 'Versturen mislukt'); return }
      setInviteResult({ demo_url: data.demo_url, naam: inviteNaam })
      fetchData() // refresh leads list
    } catch { setInviteError('Netwerkfout. Probeer opnieuw.') }
    finally { setInviteLoading(false) }
  }

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
  const [hunterLookingUp, setHunterLookingUp] = useState<Set<number>>(new Set())
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

  // Bulk mail send
  const [bulkMailOpen, setBulkMailOpen]     = useState(false)
  const [bulkMailSending, setBulkMailSending] = useState(false)
  const [bulkMailProgress, setBulkMailProgress] = useState<{ done: number; total: number } | null>(null)
  const [bulkMailDone, setBulkMailDone]     = useState(false)

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
        // Persist: localStorage (instant) + DB (duurzaam, cross-browser)
        const sentAt = new Date().toISOString()
        setOutreachSent(prev => {
          const updated = { ...prev, [emailModal.demo_token]: sentAt }
          localStorage.setItem(outreachStorageKey(viewAsUser?.id ?? currentUser?.userId), JSON.stringify(updated))
          return updated
        })
        fetch('/api/admin/outreach-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demo_token: emailModal.demo_token }),
        }).catch(() => {})
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

  const importSelectedProspects = async () => {
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

    // Hunter.io lookup: zoek naam + email van eigenaar per bedrijfswebsite
    const lookupIndices = new Set(parsed.map((_, i) => i))
    setHunterLookingUp(lookupIndices)

    await Promise.allSettled(
      parsed.map(async (row, i) => {
        if (!row.website) return
        try {
          const res = await fetch(`/api/admin/hunter-lookup?website=${encodeURIComponent(row.website)}`)
          const data = await res.json()
          if (data.contact) {
            setBulkParsed(prev => prev.map((r, idx) =>
              idx === i
                ? { ...r, naam: data.contact.naam || r.naam, email: data.contact.email || r.email }
                : r
            ))
          }
        } catch {
          // stil falen — gebruiker kan handmatig invullen
        } finally {
          setHunterLookingUp(prev => { const s = new Set(prev); s.delete(i); return s })
        }
      })
    )
  }

  const updateBulkRow = (i: number, field: 'naam' | 'email', value: string) => {
    setBulkParsed(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  const sendBulkMails = async () => {
    const withEmail = bulkResults.filter(r => r.status === 'ok' && r.email && !outreachSent[r.demo_token] && !sentIdx.has(bulkResults.indexOf(r)))
    if (!withEmail.length) return
    setBulkMailSending(true)
    setBulkMailProgress({ done: 0, total: withEmail.length })
    setBulkMailDone(false)
    let done = 0
    for (const r of withEmail) {
      try {
        // Generate AI email
        let business_info = ''
        try {
          const si = await fetch(`/api/admin/lead-info?token=${r.demo_token}`)
          if (si.ok) { const d = await si.json(); business_info = d.business_info || '' }
        } catch { /* ignore */ }
        const gen = await fetch('/api/admin/generate-email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bedrijfsnaam: r.bedrijfsnaam, naam: r.naam, demo_url: r.demo_url, business_info, language: bulkLanguage ?? 'nl' }),
        })
        if (!gen.ok) { done++; setBulkMailProgress({ done, total: withEmail.length }); continue }
        const { subject, body } = await gen.json()

        // Send
        await fetch('/api/admin/send-outreach', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ naam: r.naam, email: r.email, bedrijfsnaam: r.bedrijfsnaam, demo_url: r.demo_url, subject, body }),
        })
        // Mark sent: localStorage (instant) + DB (duurzaam, cross-browser)
        const sentAt = new Date().toISOString()
        setOutreachSent(prev => {
          const updated = { ...prev, [r.demo_token]: sentAt }
          localStorage.setItem(outreachStorageKey(viewAsUser?.id ?? currentUser?.userId), JSON.stringify(updated))
          return updated
        })
        fetch('/api/admin/outreach-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demo_token: r.demo_token }),
        }).catch(() => {})
        const origIdx = bulkResults.indexOf(r)
        if (origIdx >= 0) setSentIdx(prev => new Set(prev).add(origIdx))
      } catch { /* continue on error */ }
      done++
      setBulkMailProgress({ done, total: withEmail.length })
    }
    setBulkMailDone(true)
    setBulkMailSending(false)
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

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      const data = await res.json()
      setAccounts(data.users ?? [])
    }
    setAccountsLoading(false)
  }, [])

  // ─── Lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    // Check for password reset token in URL
    const params = new URLSearchParams(window.location.search)
    const rt = params.get('reset')
    if (rt) {
      setResetToken(rt)
      setLoginScreen('reset')
      // Clean URL
      window.history.replaceState({}, '', '/admin')
    }

    // Check if already logged in via session cookie
    fetch('/api/auth/me').then(async res => {
      if (res.ok) {
        const user = await res.json()
        setCurrentUser({ userId: user.userId, displayName: user.displayName, isAdmin: user.isAdmin, isSuperAdmin: user.isSuperAdmin ?? false })
        setAuthed(true)
        fetchData()
        const st = localStorage.getItem(LEAD_STATUS_STORAGE)
        if (st) setLeadStatus(JSON.parse(st))
        const sn = localStorage.getItem(LEAD_NOTES_STORAGE)
        if (sn) setLeadNotes(JSON.parse(sn))
        // Laad outreach-history: DB is leading, localStorage als fallback
        fetch(`/api/admin/outreach-history?user_id=${user.userId}`)
          .then(r => r.ok ? r.json() : null)
          .then(dbMap => {
            const localRaw = localStorage.getItem(outreachStorageKey(user.userId))
            const localMap = localRaw ? JSON.parse(localRaw) : {}
            setOutreachSent({ ...localMap, ...(dbMap ?? {}) })
          }).catch(() => {
            const os = localStorage.getItem(outreachStorageKey(user.userId))
            if (os) setOutreachSent(JSON.parse(os))
          })
      }
    }).catch(() => {})
  }, [fetchData])

  // Load all data as soon as we're authenticated
  useEffect(() => {
    if (authed) {
      fetchData()
    }
  }, [authed, fetchData])

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

  // ─── Zichtbaarheid (view-as isolatie) ─────────────────────────

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

  // visibleLeads: superadmin kan view-as gebruiken; partners zien altijd alleen eigen leads
  const visibleLeads = useMemo(() => {
    if (viewAsUser) return leads.filter(l => (l as Lead & { user_id?: string }).user_id === viewAsUser.id)
    return leads
  }, [leads, viewAsUser])

  // Gesprekken: superadmin ziet alles (of gefilterd via viewAsUser), partners alleen hun eigen
  const visibleConversations = useMemo(() => {
    if (currentUser?.isSuperAdmin && !viewAsUser) return conversations
    const srcLeads = viewAsUser ? visibleLeads : leads
    const myConvIds = new Set(srcLeads.map(l => getMatchedConv(l)).filter(Boolean) as string[])
    return conversations.filter(c => myConvIds.has(c.conversation_id))
  }, [conversations, currentUser, leads, visibleLeads, viewAsUser, convByKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pagina's: superadmin ziet alles (of gefilterd via viewAsUser), partners alleen hun eigen
  const visiblePages = useMemo(() => {
    if (!viewAsUser) return pages
    const mySlugs = new Set(visibleLeads.map(l => (l as Lead & { landing_page_slug?: string }).landing_page_slug).filter(Boolean))
    return pages.filter(p => mySlugs.has(p.slug))
  }, [pages, visibleLeads, viewAsUser])

  // ─── Computed ──────────────────────────────────────────────────
  const totalVisits      = visiblePages.reduce((acc, p) => acc + (p.visits || 0), 0)
  const totalConversions = visiblePages.reduce((acc, p) => acc + (p.conversions || 0), 0)
  const newLeadsCount    = visibleLeads.filter(l => !seenLeadIds.has(l.id)).length

  const startOfWeek = new Date()
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  const leadsThisWeek = visibleLeads.filter(l => new Date(l.created_at) >= startOfWeek).length

  const avgDuration = visibleConversations.length > 0
    ? visibleConversations.reduce((sum, c) => sum + c.call_duration_secs, 0) / visibleConversations.length : 0

  const bestPage = [...visiblePages].filter(p => p.visits > 0)
    .sort((a, b) => (b.conversions / b.visits) - (a.conversions / a.visits))[0]

  const sortedByRatio = [...visiblePages].filter(p => p.visits > 0)
    .sort((a, b) => (b.conversions / b.visits) - (a.conversions / a.visits))

  const leadsByLang = {
    nl: visibleLeads.filter(l => l.language === 'nl').length,
    en: visibleLeads.filter(l => l.language === 'en').length,
    es: visibleLeads.filter(l => l.language === 'es').length,
  }
  const filteredLeads = analyticsLang === 'all' ? visibleLeads : visibleLeads.filter(l => l.language === analyticsLang)

  const pipelineCounts = useMemo(() => ({
    nieuw:    visibleLeads.filter(l => !leadStatus[l.id] || leadStatus[l.id] === 'nieuw').length,
    contact:  visibleLeads.filter(l => leadStatus[l.id] === 'contact').length,
    demo:     visibleLeads.filter(l => leadStatus[l.id] === 'demo').length,
    gewonnen: visibleLeads.filter(l => leadStatus[l.id] === 'gewonnen').length,
    verloren: visibleLeads.filter(l => leadStatus[l.id] === 'verloren').length,
  }), [visibleLeads, leadStatus])

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
      setCurrentUser({ userId: data.user.userId, displayName: data.user.displayName, isAdmin: data.user.isAdmin, isSuperAdmin: data.user.isSuperAdmin ?? false })
      setAuthed(true)
      fetchData()
      const st = localStorage.getItem(LEAD_STATUS_STORAGE)
      if (st) setLeadStatus(JSON.parse(st))
      const sn = localStorage.getItem(LEAD_NOTES_STORAGE)
      if (sn) setLeadNotes(JSON.parse(sn))
      // Laad outreach-history: DB is leading, localStorage als fallback
      fetch(`/api/admin/outreach-history?user_id=${data.user.userId}`)
        .then(r => r.ok ? r.json() : null)
        .then(dbMap => {
          const localRaw = localStorage.getItem(outreachStorageKey(data.user.userId))
          const localMap = localRaw ? JSON.parse(localRaw) : {}
          setOutreachSent({ ...localMap, ...(dbMap ?? {}) })
        }).catch(() => {
          const os = localStorage.getItem(outreachStorageKey(data.user.userId))
          if (os) setOutreachSent(JSON.parse(os))
        })
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

  const refreshHeroImage = async (industry: string, slug?: string) => {
    setHeroImageLoading(true)
    try {
      const params = new URLSearchParams({ industry, t: String(Date.now()) })
      if (slug) params.set('slug', slug)
      const res = await fetch(`/api/admin/hero-image?${params.toString()}`)
      const data = await res.json()
      if (data.url) { setEditHeroImage(data.url); setHeroImageKey(k => k + 1) }
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

  // ─── Password reset handlers ────────────────────────────────────
  async function sendResetRequest() {
    if (!resetEmail.trim()) { setResetError('Vul uw gebruikersnaam in'); return }
    setResetLoading(true); setResetError('')
    try {
      await fetch('/api/auth/reset-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetEmail.trim() }),
      })
      setLoginScreen('forgot-sent')
    } finally { setResetLoading(false) }
  }

  async function confirmReset() {
    if (!resetPw1 || resetPw1.length < 8) { setResetError('Minimaal 8 tekens'); return }
    if (resetPw1 !== resetPw2) { setResetError('Wachtwoorden komen niet overeen'); return }
    setResetLoading(true); setResetError('')
    try {
      const res = await fetch('/api/auth/reset-confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: resetPw1 }),
      })
      const data = await res.json()
      if (!res.ok) { setResetError(data.error || 'Mislukt'); return }
      setLoginScreen('reset-done')
    } finally { setResetLoading(false) }
  }

  // ─── Login screen ──────────────────────────────────────────────
  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
      <div style={{ background: '#fff', padding: '48px 40px', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,.08)', maxWidth: 400, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.5rem', marginBottom: 8 }}>
            <span style={{ color: '#334155' }}>agent</span><span style={{ color: '#0D9488' }}>makers</span>.io
          </h1>
          <p style={{ color: '#64748B', fontSize: '.9rem', margin: 0 }}>Dashboard</p>
        </div>

        {/* ── Inloggen ── */}
        {loginScreen === 'login' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              style={inp} placeholder="Gebruikersnaam" value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              autoComplete="username"
            />
            <input
              style={inp} placeholder="Wachtwoord" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              autoComplete="current-password"
            />
            {loginError && <p style={{ color: '#DC2626', fontSize: '.84rem', margin: 0 }}>{loginError}</p>}
            <button
              onClick={login}
              style={{ width: '100%', padding: '14px 0', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}
            >
              Inloggen →
            </button>
            <button
              onClick={() => { setResetError(''); setResetEmail(''); setLoginScreen('forgot') }}
              style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '.83rem', cursor: 'pointer', textDecoration: 'underline', padding: 0, alignSelf: 'center' }}
            >
              Wachtwoord vergeten?
            </button>
          </div>
        )}

        {/* ── Wachtwoord vergeten ── */}
        {loginScreen === 'forgot' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: '#64748B', fontSize: '.9rem', margin: 0 }}>Vul uw gebruikersnaam in en we sturen een herstelkoppeling.</p>
            <input
              style={inp} placeholder="Gebruikersnaam" type="text" value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendResetRequest()}
            />
            {resetError && <p style={{ color: '#DC2626', fontSize: '.84rem', margin: 0 }}>{resetError}</p>}
            <button
              onClick={sendResetRequest} disabled={resetLoading}
              style={{ width: '100%', padding: '14px 0', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif', opacity: resetLoading ? .6 : 1" }}
            >
              {resetLoading ? 'Versturen…' : 'Stuur herstelkoppeling'}
            </button>
            <button
              onClick={() => setLoginScreen('login')}
              style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '.83rem', cursor: 'pointer', textDecoration: 'underline', padding: 0, alignSelf: 'center' }}
            >
              ← Terug naar inloggen
            </button>
          </div>
        )}

        {/* ── E-mail verstuurd ── */}
        {loginScreen === 'forgot-sent' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>✉️</div>
            <p style={{ color: '#334155', fontWeight: 700, marginBottom: 8 }}>Check uw inbox</p>
            <p style={{ color: '#64748B', fontSize: '.9rem', marginBottom: 24 }}>Als dit e-mailadres bekend is, ontvangt u een herstelkoppeling.</p>
            <button
              onClick={() => setLoginScreen('login')}
              style={{ background: 'none', border: 'none', color: '#0D9488', fontSize: '.9rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              ← Terug naar inloggen
            </button>
          </div>
        )}

        {/* ── Nieuw wachtwoord instellen ── */}
        {loginScreen === 'reset' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: '#64748B', fontSize: '.9rem', margin: 0 }}>Kies een nieuw wachtwoord (minimaal 8 tekens).</p>
            <input
              style={inp} placeholder="Nieuw wachtwoord" type="password" value={resetPw1}
              onChange={e => setResetPw1(e.target.value)}
            />
            <input
              style={inp} placeholder="Bevestig wachtwoord" type="password" value={resetPw2}
              onChange={e => setResetPw2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmReset()}
            />
            {resetError && <p style={{ color: '#DC2626', fontSize: '.84rem', margin: 0 }}>{resetError}</p>}
            <button
              onClick={confirmReset} disabled={resetLoading}
              style={{ width: '100%', padding: '14px 0', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}
            >
              {resetLoading ? 'Opslaan…' : 'Wachtwoord instellen'}
            </button>
          </div>
        )}

        {/* ── Reset gelukt ── */}
        {loginScreen === 'reset-done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>✅</div>
            <p style={{ color: '#334155', fontWeight: 700, marginBottom: 8 }}>Wachtwoord ingesteld!</p>
            <p style={{ color: '#64748B', fontSize: '.9rem', marginBottom: 24 }}>U kunt nu inloggen met uw nieuwe wachtwoord.</p>
            <button
              onClick={() => setLoginScreen('login')}
              style={{ background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontWeight: 700, fontSize: '.95rem', cursor: 'pointer' }}
            >
              Ga naar inloggen
            </button>
          </div>
        )}
      </div>
    </div>
  )

  // ─── Main dashboard ────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: "'Nunito',sans-serif", overflowX: 'hidden' }}>
      <style>{`
  @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  *, *::before, *::after { box-sizing: border-box !important; }
  body, html { overflow-x: hidden !important; max-width: 100vw; }
`}</style>

      {/* Top nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: '#0D9488' }}>
          agentmakers.io <span style={{ fontSize: '.75rem', color: '#64748B', fontWeight: 400, marginLeft: 8 }}>admin</span>
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {currentUser && <span style={{ fontSize: '.84rem', color: '#64748B' }}>{currentUser.displayName}</span>}
          <button onClick={() => { resetInvite(); setInviteOpen(true) }} style={{ background: '#0D9488', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, fontSize: '.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
            ✉️ Nodig prospect uit
          </button>
          <button onClick={() => fetchData()} title="Herlaad alle data" style={{ background: 'none', border: '1px solid #CBD5E1', padding: '7px 16px', borderRadius: 8, fontSize: '.82rem', cursor: 'pointer', color: '#64748B', fontFamily: "'Nunito',sans-serif" }}>↻</button>
          <button onClick={logout} style={{ background: 'none', border: '1px solid #CBD5E1', padding: '7px 16px', borderRadius: 8, fontSize: '.82rem', cursor: 'pointer', color: '#64748B', fontFamily: "'Nunito',sans-serif" }}>Uitloggen</button>
        </div>
      </div>

      {/* View-as banner */}
      {viewAsUser && (
        <div style={{ background: '#F59E0B', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '.9rem', color: '#fff' }}>
            👁 Je bekijkt als: <strong>{viewAsUser.name}</strong> — leads, pagina&apos;s, analytics, gesprekken en outreach zijn gefilterd op dit account
          </span>
          <button onClick={() => {
            setViewAsUser(null)
            setBulkParsed([]); setBulkResults([]); setProspectResults([]); setSelectedProspects(new Set()); setBulkError('')
            const os = localStorage.getItem(outreachStorageKey(currentUser?.userId))
            setOutreachSent(os ? JSON.parse(os) : {})
          }} style={{ background: '#fff', color: '#B45309', border: 'none', borderRadius: 6, padding: '5px 14px', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>
            ✕ Stop met bekijken
          </button>
        </div>
      )}

      <div style={{ maxWidth: '100%', margin: '0 auto', padding: '28px 20px', boxSizing: 'border-box' as const, width: '100%', overflowX: 'hidden' }}>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
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
          {([
            'leads', 'analytics', 'conversations', 'outreach',
            ...(currentUser?.isAdmin ? ['pages'] : []),
            ...(currentUser?.isSuperAdmin ? ['accounts'] : []),
          ] as ('leads'|'analytics'|'conversations'|'outreach'|'pages'|'accounts')[]).map(t2 => (
            <button key={t2} onClick={() => {
              setTab(t2 as typeof tab)
              if (t2 === 'leads') markAllSeen()
              if (t2 === 'conversations' && conversations.length === 0) fetchConversations()
              if (t2 === 'accounts' && accounts.length === 0) fetchAccounts()
            }}
              title={
                t2 === 'pages' ? "Beheer uw landingspagina's" :
                t2 === 'leads' ? 'Bekijk en beheer demo-aanvragen van prospects' :
                t2 === 'analytics' ? "Statistieken: bezoekers, conversies en ratio's" :
                t2 === 'conversations' ? 'Beluister en lees AI-gesprekken met prospects' :
                t2 === 'outreach' ? 'Verstuur gepersonaliseerde demo-links naar prospects' :
                'Overzicht van alle accounts en hun performance'
              }
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", background: tab === t2 ? (t2 === 'accounts' ? '#7C3AED' : '#0D9488') : '#fff', color: tab === t2 ? '#fff' : '#64748B', position: 'relative' }}>
              {t2 === 'pages' ? "📄 Pagina's" : t2 === 'leads' ? '📥 Aanvragen' : t2 === 'analytics' ? '📊 Analytics' : t2 === 'conversations' ? '🎙 Gesprekken' : t2 === 'outreach' ? '🚀 Outreach' : t2 === 'accounts' ? '👥 Accounts' : t2}
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
                      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 90px auto auto auto', gap: 12, alignItems: 'center', padding: '14px 16px' }}>

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
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

            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #F1F5F9', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
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
                      <img key={heroImageKey} src={editHeroImage} alt="Hero preview"
                        style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 10, marginBottom: 10, border: '1.5px solid #E2E8F0', display: 'block' }} />
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={editHeroImage} onChange={e => setEditHeroImage(e.target.value)}
                        placeholder="Plak een afbeelding-URL..."
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontFamily: "'Nunito',sans-serif", fontSize: '.88rem', color: '#1E293B', outline: 'none', boxSizing: 'border-box' }} />
                      <button onClick={() => editModal && refreshHeroImage(editModal.industry, editModal.slug)} disabled={heroImageLoading}
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
              <div style={{ display: 'flex', gap: 8 }}>
                <label title="Upload een .csv bestand van uw computer" style={{ fontSize: '.75rem', color: '#0D9488', background: 'none', border: '1px solid #0D9488', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  📂 CSV uploaden
                  <input type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => {
                      setBulkCsv(ev.target?.result as string ?? '')
                      setBulkError('')
                    }
                    reader.readAsText(file, 'UTF-8')
                    e.target.value = ''
                  }} />
                </label>
                <button onClick={() => setBulkCsv('Loodgieter Jansen,loodgieterJansen.nl,Kees Jansen,kees@loodgieterjansen.nl,0612345678\nTandarts Smit,tandartsmit.nl,Dr. Smit,info@tandartsmit.nl,')}
                  title="Vul het CSV-veld met voorbeelddata om te zien hoe het formaat werkt"
                  style={{ fontSize: '.75rem', color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                  Voorbeeld laden
                </button>
              </div>
            </div>
            <div style={{ fontSize: '.8rem', color: '#64748B', marginBottom: 6 }}>
              📋 <strong>Plak hier uw eigen data</strong> — kopieer rijen uit Excel of Google Sheets en plak ze hieronder (Ctrl+V). De grijze tekst is alleen een voorbeeld.
            </div>
            <textarea
              id="csv-textarea"
              value={bulkCsv}
              onChange={e => { setBulkCsv(e.target.value); setBulkError('') }}
              placeholder={'bedrijfsnaam,website,naam,email,telefoon\nLoodgieter Jansen,loodgieterjansen.nl,Kees,kees@test.nl,\nTandarts Smit,tandartsmit.nl,,,'}
              title="Plak hier uw CSV-data. Verplichte kolommen: bedrijfsnaam, website. Optioneel: naam, email, telefoon"
              style={{ width: '100%', minHeight: 160, padding: 12, borderRadius: 8, border: `1.5px solid ${bulkError ? '#DC2626' : '#E2E8F0'}`, fontFamily: 'monospace', fontSize: '.82rem', color: '#334155', resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
            />
            {bulkError && <div style={{ marginTop: 8, color: '#DC2626', fontSize: '.83rem' }}>⚠️ {bulkError}</div>}
            {bulkCsv.trim() === '' && <div style={{ marginTop: 6, fontSize: '.78rem', color: '#94A3B8' }}>Tip: klik op <strong>Voorbeeld laden</strong> om te zien hoe de opmaak eruit moet zien.</div>}
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
                      {['Bedrijf', 'Website', 'Naam (optioneel)', 'E-mailadres ✏️'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748B', fontWeight: 600, borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkParsed.map((r, i) => {
                      const looking = hunterLookingUp.has(i)
                      return (
                      <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E293B' }}>{r.bedrijfsnaam}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '.78rem' }}>{r.website}</td>
                        <td style={{ padding: '6px 10px', position: 'relative' }}>
                          <input
                            value={r.naam}
                            onChange={e => updateBulkRow(i, 'naam', e.target.value)}
                            placeholder={looking ? '🔍 zoeken…' : 'Voornaam'}
                            disabled={looking}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${r.naam ? '#0D9488' : '#E2E8F0'}`, fontSize: '.82rem', color: '#334155', outline: 'none', fontFamily: "'Nunito',sans-serif", background: looking ? '#F8FAFC' : 'white' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            value={r.email}
                            onChange={e => updateBulkRow(i, 'email', e.target.value)}
                            placeholder={looking ? '🔍 zoeken…' : 'info@bedrijf.nl'}
                            type="email"
                            disabled={looking}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${r.email ? '#0D9488' : '#E2E8F0'}`, fontSize: '.82rem', color: '#334155', outline: 'none', fontFamily: "'Nunito',sans-serif", background: looking ? '#F8FAFC' : 'white' }}
                          />
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#F0FDFA', borderRadius: 8, fontSize: '.8rem', color: '#0F766E', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💡</span>
                <span>
                  {hunterLookingUp.size > 0
                    ? <>🔍 Hunter.io zoekt contact­gegevens voor <strong>{hunterLookingUp.size}</strong> bedrijf{hunterLookingUp.size !== 1 ? 'en' : ''}… Niet gevonden? Vul handmatig in.</>
                    : <>Naam en e-mail zijn automatisch opgezocht via Hunter.io. Niet gevonden of onjuist? Pas ze handmatig aan.</>
                  }
                </span>
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

              {/* Export + Bulk mail */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => {
                  const rows = ['bedrijfsnaam,demo_url,email'].concat(
                    bulkResults.filter(r => r.status === 'ok').map(r => `"${r.bedrijfsnaam}","${r.demo_url}","${r.email}"`)
                  )
                  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'demo-links.csv'; a.click()
                  URL.revokeObjectURL(url)
                }} style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#334155', padding: '10px 20px', borderRadius: 9, fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                  ⬇ Download alle links als CSV
                </button>

                {(() => {
                  const toSend = bulkResults.filter(r => r.status === 'ok' && r.email && !outreachSent[r.demo_token])
                  if (!toSend.length) return null
                  return (
                    <button
                      onClick={() => { setBulkMailOpen(true); setBulkMailDone(false); setBulkMailProgress(null) }}
                      disabled={!scrapeDone}
                      title={scrapeDone ? `Verstuur gepersonaliseerde AI-mails naar ${toSend.length} bedrijven met een e-mailadres` : 'Wacht tot de AI-agent gepersonaliseerd is'}
                      style={{ background: scrapeDone ? '#0D9488' : '#94A3B8', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 9, fontWeight: 700, fontSize: '.85rem', cursor: scrapeDone ? 'pointer' : 'not-allowed', fontFamily: "'Nunito',sans-serif", display: 'flex', alignItems: 'center', gap: 8 }}>
                      📧 Verstuur {toSend.length} outreach-mail{toSend.length !== 1 ? 's' : ''} →
                    </button>
                  )
                })()}
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

      {/* ══════════════════════ BULK MAIL MODAL ══════════════════════ */}
      {bulkMailOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 520, width: '100%', padding: 36, boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>
            {bulkMailDone ? (
              <>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
                  <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', marginBottom: 8 }}>Mails verstuurd!</h2>
                  <p style={{ color: '#64748B', fontSize: '.9rem', marginBottom: 28 }}>
                    {bulkMailProgress?.done} outreach-mail{(bulkMailProgress?.done ?? 0) !== 1 ? 's' : ''} zijn verstuurd naar de bedrijven met een e-mailadres.
                  </p>
                  <button onClick={() => setBulkMailOpen(false)}
                    style={{ background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                    Sluiten ✓
                  </button>
                </div>
              </>
            ) : bulkMailSending ? (
              <>
                <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.1rem', marginBottom: 20 }}>📧 Mails versturen…</h2>
                <p style={{ color: '#64748B', fontSize: '.88rem', marginBottom: 20 }}>
                  De AI schrijft en verstuurt voor elk bedrijf een gepersonaliseerde outreach-mail. Even geduld…
                </p>
                {bulkMailProgress && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', color: '#64748B', marginBottom: 8 }}>
                      <span>{bulkMailProgress.done} van {bulkMailProgress.total} verstuurd</span>
                      <span>{Math.round((bulkMailProgress.done / bulkMailProgress.total) * 100)}%</span>
                    </div>
                    <div style={{ background: '#E2E8F0', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                      <div style={{ background: '#0D9488', height: '100%', borderRadius: 99, width: `${Math.round((bulkMailProgress.done / bulkMailProgress.total) * 100)}%`, transition: 'width .4s ease' }} />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.1rem', margin: 0 }}>📧 Bulk outreach versturen</h2>
                  <button onClick={() => setBulkMailOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94A3B8', lineHeight: 1 }}>×</button>
                </div>
                {(() => {
                  const toSend = bulkResults.filter(r => r.status === 'ok' && r.email && !outreachSent[r.demo_token])
                  return (
                    <>
                      <p style={{ color: '#334155', fontSize: '.9rem', marginBottom: 16, lineHeight: 1.6 }}>
                        De AI schrijft voor elk bedrijf een <strong>gepersonaliseerde outreach-mail</strong> op basis van hun website en verstuurt die direct. Je hoeft niets te doen.
                      </p>
                      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
                        <div style={{ fontSize: '.82rem', color: '#64748B', marginBottom: 8, fontWeight: 700 }}>Ontvangers ({toSend.length})</div>
                        {toSend.slice(0, 5).map((r, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: i < Math.min(toSend.length, 5) - 1 ? '1px solid #F1F5F9' : 'none' }}>
                            <span style={{ fontWeight: 600, fontSize: '.83rem', color: '#1E293B', flex: 1 }}>{r.bedrijfsnaam}</span>
                            <span style={{ fontSize: '.78rem', color: '#64748B' }}>{r.email}</span>
                          </div>
                        ))}
                        {toSend.length > 5 && (
                          <div style={{ fontSize: '.78rem', color: '#94A3B8', marginTop: 8 }}>+ {toSend.length - 5} meer…</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => setBulkMailOpen(false)}
                          style={{ flex: 1, padding: '12px', background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 10, fontWeight: 600, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                          Annuleren
                        </button>
                        <button onClick={sendBulkMails}
                          style={{ flex: 2, padding: '12px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                          📤 Verstuur {toSend.length} mail{toSend.length !== 1 ? 's' : ''} nu
                        </button>
                      </div>
                    </>
                  )
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ ACCOUNTS TAB ══════════════════════ */}
      {tab === 'accounts' && currentUser?.isSuperAdmin && (
        <div style={{ padding: '28px 20px', boxSizing: 'border-box' as const, width: '100%' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 4 }}>👥 Accounts</h2>
              <p style={{ fontSize: '.85rem', color: '#64748B', margin: 0 }}>Performance overzicht van alle partner accounts.</p>
            </div>
            <button onClick={fetchAccounts} disabled={accountsLoading} style={{ background: '#fff', border: '1.5px solid #7C3AED', color: '#7C3AED', padding: '9px 18px', borderRadius: 10, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', opacity: accountsLoading ? 0.6 : 1 }}>
              {accountsLoading ? '⏳ Laden…' : '↻ Verversen'}
            </button>
          </div>

          {/* KPI row — top */}
          {accounts.length > 0 && (() => {
            const partners = accounts.filter(a => !a.isSuperAdmin)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
                {[
                  { label: 'Partner accounts', val: partners.length, color: '#7C3AED', bg: '#F5F3FF', icon: '👥' },
                  { label: 'Leads deze maand', val: partners.reduce((s, a) => s + a.leadsThisMonth, 0), color: '#0D9488', bg: '#F0FDFA', icon: '📥' },
                  { label: "Demo's verstuurd", val: partners.reduce((s, a) => s + a.demosGenerated, 0), color: '#1D4ED8', bg: '#EFF6FF', icon: '🎯' },
                  { label: 'Gesprekken totaal', val: partners.reduce((s, a) => s + a.conversations, 0), color: '#DB2777', bg: '#FDF2F8', icon: '🎙' },
                ].map(({ label, val, color, bg, icon }) => (
                  <div key={label} style={{ background: bg, borderRadius: 14, border: `1.5px solid ${color}22`, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{icon}</div>
                    <div>
                      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.7rem', fontWeight: 700, color, lineHeight: 1.1 }}>{val}</div>
                      <div style={{ fontSize: '.73rem', color: '#64748B', marginTop: 3, fontWeight: 600 }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {accountsLoading && accounts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>Accounts laden…</div>
          )}
          {!accountsLoading && accounts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>Geen accounts gevonden.</div>
          )}

          {/* Account cards grid */}
          {accounts.length > 0 && (() => {
            const partners = accounts.filter(a => !a.isSuperAdmin)
            const maxLeads = Math.max(...partners.map(a => a.leadsTotal), 1)
            const maxMonth = Math.max(...partners.map(a => a.leadsThisMonth), 1)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {partners
                  .sort((a, b) => b.leadsThisMonth - a.leadsThisMonth || b.leadsTotal - a.leadsTotal)
                  .map((acc, rank) => {
                    const isViewing = viewAsUser?.id === acc.id
                    const initials = (acc.displayName || acc.username).slice(0, 2).toUpperCase()
                    const lastActive = acc.lastActiveAt
                      ? new Date(acc.lastActiveAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                      : 'Nog niet actief'
                    const convRate = acc.leadsTotal > 0
                      ? Math.round((acc.conversations / acc.leadsTotal) * 100)
                      : 0
                    const AVATAR_COLORS = ['#7C3AED','#0D9488','#1D4ED8','#DB2777','#EA580C','#0891B2']
                    const avatarColor = AVATAR_COLORS[rank % AVATAR_COLORS.length]
                    return (
                      <div key={acc.id} style={{
                        background: isViewing ? '#FFFBEB' : '#fff',
                        borderRadius: 16,
                        border: isViewing ? '2px solid #F59E0B' : '1.5px solid #E2E8F0',
                        padding: '22px 22px 18px',
                        boxShadow: isViewing ? '0 4px 20px rgba(245,158,11,.15)' : '0 2px 8px rgba(0,0,0,.04)',
                        transition: 'box-shadow .2s',
                        position: 'relative',
                      }}>
                        {/* Rank badge */}
                        {rank === 0 && partners.length > 1 && (
                          <div style={{ position: 'absolute', top: 14, right: 14, background: '#FEF9C3', color: '#854D0E', borderRadius: 99, fontSize: '.68rem', fontWeight: 800, padding: '2px 8px', letterSpacing: '.04em' }}>
                            🏆 #1
                          </div>
                        )}

                        {/* Avatar + name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                          <div style={{ width: 46, height: 46, borderRadius: '50%', background: avatarColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem', fontFamily: "'Poppins',sans-serif", flexShrink: 0 }}>
                            {initials}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acc.displayName}</div>
                            <div style={{ fontSize: '.75rem', color: '#94A3B8' }}>@{acc.username}</div>
                          </div>
                          <span style={{ background: '#DCFCE7', color: '#15803D', borderRadius: 99, padding: '2px 9px', fontSize: '.7rem', fontWeight: 700, flexShrink: 0 }}>Admin</span>
                        </div>

                        {/* Stats grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                          {[
                            { label: 'Leads totaal', val: acc.leadsTotal, color: '#0D9488' },
                            { label: 'Deze maand', val: acc.leadsThisMonth, color: acc.leadsThisMonth > 0 ? '#16A34A' : '#94A3B8', prefix: acc.leadsThisMonth > 0 ? '+' : '' },
                            { label: "Demo's", val: acc.demosGenerated, color: '#1D4ED8' },
                            { label: 'Gesprekken', val: acc.conversations, color: '#DB2777' },
                          ].map(({ label, val, color, prefix = '' }) => (
                            <div key={label} style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px' }}>
                              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', fontWeight: 700, color, lineHeight: 1 }}>{prefix}{val}</div>
                              <div style={{ fontSize: '.68rem', color: '#94A3B8', marginTop: 2, fontWeight: 600 }}>{label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Activity bar — leads this month vs best performer */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#94A3B8', marginBottom: 5 }}>
                            <span>Activiteit deze maand</span>
                            <span style={{ color: convRate > 0 ? '#0D9488' : '#94A3B8', fontWeight: 700 }}>{convRate}% conv.</span>
                          </div>
                          <div style={{ background: '#F1F5F9', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${avatarColor}, ${avatarColor}99)`, width: `${Math.round((acc.leadsThisMonth / maxMonth) * 100)}%`, minWidth: acc.leadsThisMonth > 0 ? '6px' : '0', transition: 'width .4s ease' }} />
                          </div>
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '.72rem', color: '#94A3B8' }}>⏱ {lastActive}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setSetPwTarget({ id: acc.id, name: acc.displayName }); setSetPwValue(''); setSetPwError(''); setSetPwDone(false) }}
                              style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 12px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
                              🔑
                            </button>
                            {isViewing
                              ? <button onClick={() => {
                                  setViewAsUser(null)
                                  // Reset outreach workflow state
                                  setBulkParsed([])
                                  setBulkResults([])
                                  setProspectResults([])
                                  setSelectedProspects(new Set())
                                  setBulkError('')
                                  // Herstel superadmin's eigen outreach-history
                                  const os = localStorage.getItem(outreachStorageKey(currentUser?.userId))
                                  setOutreachSent(os ? JSON.parse(os) : {})
                                }} style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', borderRadius: 8, padding: '6px 12px', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
                                  ✕ Stop
                                </button>
                              : <button onClick={() => {
                                  setViewAsUser({ id: acc.id, name: acc.displayName })
                                  setTab('leads')
                                  // Reset outreach workflow state zodat superadmin niet zijn eigen sessie ziet
                                  setBulkParsed([])
                                  setBulkResults([])
                                  setProspectResults([])
                                  setSelectedProspects(new Set())
                                  setBulkError('')
                                  // Laad outreach-history van deze partner (DB + localStorage)
                                  fetch(`/api/admin/outreach-history?user_id=${acc.id}`)
                                    .then(r => r.ok ? r.json() : null)
                                    .then(dbMap => {
                                      const localRaw = localStorage.getItem(outreachStorageKey(acc.id))
                                      const localMap = localRaw ? JSON.parse(localRaw) : {}
                                      setOutreachSent({ ...localMap, ...(dbMap ?? {}) })
                                    }).catch(() => {
                                      const os = localStorage.getItem(outreachStorageKey(acc.id))
                                      setOutreachSent(os ? JSON.parse(os) : {})
                                    })
                                }} style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 8, padding: '6px 12px', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
                                  👁 Bekijk als
                                </button>
                            }
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )
          })()}
        </div>
      )}

      {/* ══════════════════════ SET PASSWORD MODAL (superadmin) ══════════════════════ */}
      {setPwTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setSetPwTarget(null) }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 400, padding: 36, boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.1rem', margin: 0, marginBottom: 4 }}>🔑 Wachtwoord instellen</h2>
                <p style={{ fontSize: '.82rem', color: '#64748B', margin: 0 }}>Voor account: <strong>{setPwTarget.name}</strong></p>
              </div>
              <button onClick={() => setSetPwTarget(null)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
            </div>

            {setPwDone ? (
              <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✅</div>
                <p style={{ color: '#16A34A', fontWeight: 700, marginBottom: 20 }}>Wachtwoord succesvol gewijzigd</p>
                <button onClick={() => setSetPwTarget(null)} style={{ background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>Sluiten</button>
              </div>
            ) : (
              <>
                <input
                  type="password"
                  value={setPwValue}
                  onChange={e => setSetPwValue(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key !== 'Enter') return
                    if (!setPwValue || setPwValue.length < 8) { setSetPwError('Minimaal 8 tekens'); return }
                    setSetPwLoading(true); setSetPwError('')
                    try {
                      const res = await fetch('/api/auth/set-password', {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: setPwTarget.id, password: setPwValue }),
                      })
                      const data = await res.json()
                      if (!res.ok) { setSetPwError(data.error || 'Mislukt'); return }
                      setSetPwDone(true)
                    } finally { setSetPwLoading(false) }
                  }}
                  placeholder="Nieuw wachtwoord (min. 8 tekens)"
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 10, border: '1.5px solid #CBD5E1', fontSize: '.92rem', fontFamily: "'Nunito',sans-serif", color: '#0F172A', outline: 'none', marginBottom: 14, boxSizing: 'border-box' }}
                  autoFocus
                />
                {setPwError && <p style={{ color: '#EF4444', fontSize: '.84rem', marginBottom: 12 }}>{setPwError}</p>}
                <button
                  disabled={setPwLoading}
                  onClick={async () => {
                    if (!setPwValue || setPwValue.length < 8) { setSetPwError('Minimaal 8 tekens'); return }
                    setSetPwLoading(true); setSetPwError('')
                    try {
                      const res = await fetch('/api/auth/set-password', {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: setPwTarget.id, password: setPwValue }),
                      })
                      const data = await res.json()
                      if (!res.ok) { setSetPwError(data.error || 'Mislukt'); return }
                      setSetPwDone(true)
                    } finally { setSetPwLoading(false) }
                  }}
                  style={{ width: '100%', padding: 13, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", opacity: setPwLoading ? 0.7 : 1 }}>
                  {setPwLoading ? 'Opslaan…' : 'Wachtwoord instellen'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ INVITE MODAL ══════════════════════ */}
      {inviteOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setInviteOpen(false) } }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480, padding: 40, boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>

            {!inviteResult ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <div>
                    <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', margin: 0, marginBottom: 4 }}>✉️ Nodig prospect uit</h2>
                    <p style={{ fontSize: '.82rem', color: '#64748B', margin: 0 }}>Prospect ontvangt direct een gepersonaliseerde voice demo link.</p>
                  </div>
                  <button onClick={() => setInviteOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94A3B8', lineHeight: 1 }}>✕</button>
                </div>

                {/* Language toggle */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  {([['nl','🇳🇱 NL'],['en','🇬🇧 EN'],['es','🇪🇸 ES']] as const).map(([code, label]) => (
                    <button key={code} onClick={() => setInviteLang(code)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `2px solid ${inviteLang === code ? '#0D9488' : '#E2E8F0'}`, background: inviteLang === code ? '#CCFBF1' : '#fff', color: inviteLang === code ? '#0D9488' : '#64748B', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Fields */}
                {[
                  { label: 'Naam contactpersoon *', value: inviteNaam, set: setInviteNaam, placeholder: 'Jan de Vries', type: 'text' },
                  { label: 'Bedrijfsnaam', value: inviteBedrijf, set: setInviteBedrijf, placeholder: 'Loodgieter Jansen BV', type: 'text' },
                  { label: 'E-mailadres *', value: inviteEmail, set: setInviteEmail, placeholder: 'jan@bedrijf.nl', type: 'email' },
                  { label: 'Website *', value: inviteWebsite, set: setInviteWebsite, placeholder: 'https://bedrijf.nl', type: 'url' },
                ].map(({ label, value, set, placeholder, type }) => (
                  <div key={label} style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
                    <input
                      type={type} value={value}
                      onChange={e => { set(e.target.value); setInviteError('') }}
                      placeholder={placeholder}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: '.92rem', color: '#1E293B', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}

                {inviteError && <div style={{ color: '#DC2626', fontSize: '.82rem', marginBottom: 12 }}>⚠️ {inviteError}</div>}

                <button onClick={sendInvite} disabled={inviteLoading}
                  style={{ width: '100%', padding: '13px', background: inviteLoading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: inviteLoading ? 'not-allowed' : 'pointer', fontFamily: "'Nunito',sans-serif", marginTop: 4 }}>
                  {inviteLoading ? '⏳ Demo aanmaken en e-mail verzenden…' : '✉️ Verstuur demo uitnodiging'}
                </button>
              </>
            ) : (
              /* Success state */
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
                <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', marginBottom: 8 }}>Uitnodiging verstuurd!</h2>
                <p style={{ color: '#64748B', fontSize: '.88rem', marginBottom: 24 }}>
                  <strong>{inviteResult.naam}</strong> heeft een e-mail ontvangen met de gepersonaliseerde demo link. De AI wordt ondertussen getraind op hun website.
                </p>
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 16px', marginBottom: 24, wordBreak: 'break-all' }}>
                  <div style={{ fontSize: '.72rem', color: '#16A34A', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Demo link</div>
                  <a href={inviteResult.demo_url} target="_blank" rel="noreferrer" style={{ fontSize: '.82rem', color: '#0D9488', wordBreak: 'break-all' }}>{inviteResult.demo_url}</a>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { resetInvite() }} style={{ flex: 1, padding: '11px', background: '#F1F5F9', color: '#334155', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                    Nog een uitnodiging
                  </button>
                  <button onClick={() => { setInviteOpen(false); resetInvite() }} style={{ flex: 1, padding: '11px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                    Sluiten
                  </button>
                </div>
              </div>
            )}
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
