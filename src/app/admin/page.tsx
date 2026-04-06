'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

const ADMIN_KEY_STORAGE    = 'agentmakers_admin_key'
const SEEN_LEADS_STORAGE   = 'agentmakers_seen_leads'
const LEAD_STATUS_STORAGE  = 'agentmakers_lead_status'
const LEAD_NOTES_STORAGE   = 'agentmakers_lead_notes'

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
  body_content_nl?: Record<string, string>
}
interface Lead {
  id: string; naam: string; email: string; telefoon: string
  landing_page_slug: string; language: string; created_at: string
  website?: string; bedrijfsnaam?: string; handled?: boolean
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
  const [key, setKey]           = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [authed, setAuthed]     = useState(false)
  const [tab, setTab]           = useState<'pages' | 'leads' | 'analytics' | 'conversations' | 'outreach'>('pages')
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
  const [editFields, setEditFields]         = useState<Record<string, string>>({})
  const [editSaving, setEditSaving]         = useState(false)

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
  const [copiedIdx, setCopiedIdx]       = useState<number | null>(null)

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
    try {
      const res = await fetch('/api/bulk-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: bulkParsed }),
      })
      const data = await res.json()
      if (!res.ok) { setBulkError(data.error || 'Fout bij aanmaken'); return }
      setBulkResults(data.results)
    } catch {
      setBulkError('Netwerkfout. Probeer opnieuw.')
    } finally {
      setBulkLoading(false)
    }
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

  // ─── Data fetching ─────────────────────────────────────────────
  const fetchData = useCallback(async (k: string) => {
    setLoading(true)
    const [pRes, lRes] = await Promise.all([
      fetch('/api/pages',  { headers: { 'x-admin-key': k } }),
      fetch('/api/leads',  { headers: { 'x-admin-key': k } }),
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

  const fetchConversations = useCallback(async (k: string) => {
    setConvLoading(true)
    const res = await fetch('/api/conversations', { headers: { 'x-admin-key': k } })
    if (res.ok) {
      const data = await res.json()
      const convs: Conversation[] = data.conversations ?? []
      setConversations(convs)
      const batchSize = 5
      for (let i = 0; i < convs.length; i += batchSize) {
        const batch = convs.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map(c =>
            fetch(`/api/conversations/${c.conversation_id}`, { headers: { 'x-admin-key': k } })
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
    const res = await fetch(`/api/conversations/${id}`, { headers: { 'x-admin-key': savedKey } })
    if (res.ok) {
      const data: ConversationDetail = await res.json()
      setConvDetails(prev => ({ ...prev, [id]: data }))
    }
  }, [convDetails, savedKey])

  // ─── Lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY_STORAGE)
    if (stored) {
      setSavedKey(stored); setAuthed(true); fetchData(stored)
      const st = localStorage.getItem(LEAD_STATUS_STORAGE)
      if (st) setLeadStatus(JSON.parse(st))
      const sn = localStorage.getItem(LEAD_NOTES_STORAGE)
      if (sn) setLeadNotes(JSON.parse(sn))
    }
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

  // ─── Handlers ──────────────────────────────────────────────────
  const login = () => {
    localStorage.setItem(ADMIN_KEY_STORAGE, key)
    setSavedKey(key); setAuthed(true); fetchData(key)
    const st = localStorage.getItem(LEAD_STATUS_STORAGE)
    if (st) setLeadStatus(JSON.parse(st))
    const sn = localStorage.getItem(LEAD_NOTES_STORAGE)
    if (sn) setLeadNotes(JSON.parse(sn))
  }

  const logout = () => {
    localStorage.removeItem(ADMIN_KEY_STORAGE)
    setAuthed(false); setSavedKey(''); setKey('')
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
      headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey },
      body: JSON.stringify({ id: page.id, status: next })
    })
  }

  const confirmDelete = async () => {
    if (!deleteModal) return
    setPages(prev => prev.filter(p => p.id !== deleteModal.id))
    setDeleteModal(null)
    await fetch('/api/pages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey },
      body: JSON.stringify({ id: deleteModal.id })
    })
  }

  const openEditModal = (page: Page) => {
    setEditModal(page)
    setEditFields({
      hero_headline_nl: page.hero_headline_nl || '',
      agents_headline:  page.body_content_nl?.agents_headline || '',
      steps_title:      page.body_content_nl?.steps_title || '',
      usecases_headline: page.body_content_nl?.usecases_headline || '',
    })
  }

  const saveEditModal = async () => {
    if (!editModal) return
    setEditSaving(true)
    const updates: Record<string, unknown> = { id: editModal.id }
    if (editFields.hero_headline_nl) updates.hero_headline_nl = editFields.hero_headline_nl
    const bodyContent = {
      ...(editModal.body_content_nl || {}),
      agents_headline:   editFields.agents_headline,
      steps_title:       editFields.steps_title,
      usecases_headline: editFields.usecases_headline,
    }
    updates.body_content_nl = bodyContent
    const res = await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey },
      body: JSON.stringify(updates)
    })
    if (res.ok) {
      const updated = await res.json()
      setPages(prev => prev.map(p => p.id === editModal.id ? { ...p, ...updated } : p))
      setEditModal(null)
    }
    setEditSaving(false)
  }

  const createPage = async () => {
    if (!newIndustry || !newSlug) return alert('Vul branche en URL-slug in')
    setCreating(true)
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey },
      body: JSON.stringify({ industry: newIndustry, slug: newSlug, status: 'draft' })
    })
    const data = await res.json()
    setCreating(false)
    if (data.success) { setShowCreate(false); setNewIndustry(''); setNewSlug(''); fetchData(savedKey) }
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
        headers: { 'x-admin-key': savedKey, 'Content-Type': 'application/json' },
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
        <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.5rem', marginBottom: 8 }}>Admin Dashboard</h1>
        <p style={{ color: '#64748B', fontSize: '.92rem', marginBottom: 32 }}>Voer uw admin sleutel in om in te loggen.</p>
        <input type="password" value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Admin sleutel" style={{ ...inp, marginBottom: 16 }} />
        <button onClick={login} style={{ width: '100%', padding: 14, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>Inloggen</button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: '.78rem', color: '#64748B' }}>Sleutel instellen in Vercel onder ADMIN_SECRET_KEY</p>
      </div>
    </div>
  )

  // ─── Main dashboard ────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: "'Nunito',sans-serif" }}>

      {/* Top nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: '#0D9488' }}>
          agentmakers.io <span style={{ fontSize: '.75rem', color: '#64748B', fontWeight: 400, marginLeft: 8 }}>admin</span>
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => fetchData(savedKey)} style={{ background: 'none', border: '1px solid #CBD5E1', padding: '7px 16px', borderRadius: 8, fontSize: '.82rem', cursor: 'pointer', color: '#64748B', fontFamily: "'Nunito',sans-serif" }}>↻ Verversen</button>
          <button onClick={logout} style={{ background: 'none', border: '1px solid #CBD5E1', padding: '7px 16px', borderRadius: 8, fontSize: '.82rem', cursor: 'pointer', color: '#64748B', fontFamily: "'Nunito',sans-serif" }}>Uitloggen</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 32 }}>
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
          {(['pages', 'leads', 'analytics', 'conversations', 'outreach'] as const).map(t2 => (
            <button key={t2} onClick={() => {
              setTab(t2 as typeof tab)
              if (t2 === 'leads') markAllSeen()
              if (t2 === 'conversations' && conversations.length === 0) fetchConversations(savedKey)
            }}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", background: tab === t2 ? '#0D9488' : '#fff', color: tab === t2 ? '#fff' : '#64748B', position: 'relative' }}>
              {t2 === 'pages' ? "📄 Pagina's" : t2 === 'leads' ? '📥 Aanvragen' : t2 === 'analytics' ? '📊 Analytics' : t2 === 'conversations' ? '🎙 Gesprekken' : '🚀 Outreach'}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem' }}>Landingspagina&apos;s</h2>
              <button onClick={() => setShowCreate(true)} style={{ background: '#0D9488', color: '#fff', padding: '12px 24px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
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
                    <button onClick={() => toggleStatus(page)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: `1px solid ${page.status === 'live' ? '#EF4444' : '#22C55E'}`, background: '#fff', color: page.status === 'live' ? '#EF4444' : '#22C55E' }}>
                      {page.status === 'live' ? 'Offline' : 'Live zetten'}
                    </button>
                    <button onClick={() => window.open(`/nl/${page.slug}`, '_blank')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #CBD5E1', background: '#fff', color: '#334155' }}>
                      Bekijken
                    </button>
                    <button onClick={() => openEditModal(page)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #0D9488', background: '#F0FDFA', color: '#0D9488' }}>
                      ✏ Bewerken
                    </button>
                    <button onClick={() => setDeleteModal(page)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #EF4444', background: '#fff', color: '#EF4444' }}>
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
                  <button onClick={deleteSelectedLeads} disabled={deleteLeadsLoading} style={{ background: '#FEF2F2', border: '1.5px solid #EF4444', color: '#DC2626', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", opacity: deleteLeadsLoading ? 0.5 : 1 }}>
                    🗑 Verwijder ({selectedLeads.size})
                  </button>
                )}
                <button onClick={exportCSV} style={{ background: '#fff', border: '1.5px solid #0D9488', color: '#0D9488', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
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
                        <input type="checkbox" checked={selectedLeads.has(lead.id)} onChange={() => toggleSelectLead(lead.id)} style={{ cursor: 'pointer', width: 16, height: 16 }} />

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
                          style={{ padding: '5px 8px', borderRadius: 7, border: `1.5px solid ${stage.color}50`, background: stage.bg, color: stage.color, fontWeight: 700, fontSize: '.72rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", outline: 'none' }}
                        >
                          {PIPELINE_STAGES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>

                        {/* Opvolgen button */}
                        <a href={makeMailto(lead)} style={{ padding: '6px 12px', borderRadius: 7, fontSize: '.75rem', fontWeight: 700, border: '1px solid #0D9488', background: '#F0FDFA', color: '#0D9488', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          ✉ Opvolgen
                        </a>

                        {/* Matched conversation badge */}
                        {matchedConv ? (
                          <button
                            onClick={() => { setTab('conversations'); setOpenConvId(matchedConv) }}
                            style={{ padding: '5px 10px', borderRadius: 7, fontSize: '.72rem', fontWeight: 700, border: '1px solid #7C3AED', background: '#F5F3FF', color: '#7C3AED', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", whiteSpace: 'nowrap' }}
                            title="Gekoppeld gesprek bekijken"
                          >
                            🎙 Gesprek
                          </button>
                        ) : <span />}

                        {/* Handled + expand */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => toggleHandled(lead.id)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: '.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: `1px solid ${isHandled ? '#CBD5E1' : '#22C55E'}`, background: isHandled ? '#F1F5F9' : '#F0FDF4', color: isHandled ? '#94A3B8' : '#166534', whiteSpace: 'nowrap' }}>
                            {isHandled ? 'Heropenen' : '✓ Klaar'}
                          </button>
                          <button onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)} style={{ padding: '5px 8px', borderRadius: 6, fontSize: '.72rem', border: '1px solid #CBD5E1', background: isExpanded ? '#F1F5F9' : '#fff', color: '#64748B', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem' }}>🎙 Gesprekken ({conversations.length})</h2>
              <button onClick={() => fetchConversations(savedKey)} disabled={convLoading} style={{ background: '#fff', border: '1.5px solid #0D9488', color: '#0D9488', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", opacity: convLoading ? 0.6 : 1 }}>
                {convLoading ? 'Laden…' : '↻ Vernieuwen'}
              </button>
            </div>

            {convLoading && conversations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>Gesprekken laden…</div>
            )}
            {!convLoading && conversations.length === 0 && (
              <div style={{ background: '#fff', borderRadius: 14, padding: '60px 24px', textAlign: 'center', color: '#94A3B8', border: '1px solid #F1F5F9' }}>
                Nog geen gesprekken gevonden voor deze agent.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {conversations.map(conv => {
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
                                <audio controls preload="none" style={{ width: '100%', height: 40 }} src={`/api/conversations/${detail.conversation_id}/audio?key=${encodeURIComponent(savedKey)}`}>
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
      </div>

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
      {editModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 600, width: '100%', padding: 40, position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={() => !editSaving && setEditModal(null)} style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#F1F5F9', cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: '1rem' }}>✕</button>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 4 }}>✏ Pagina bewerken</h2>
            <p style={{ color: '#0D9488', fontSize: '.85rem', marginBottom: 28 }}>{editModal.industry} · /{editModal.slug}</p>

            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 14px', fontSize: '.78rem', color: '#92400E', marginBottom: 24 }}>
              ✨ Wijzigingen in de Nederlandse tekst worden automatisch vertaald naar Engels en Spaans.
            </div>

            {[
              { key: 'hero_headline_nl', label: 'Hero headline', placeholder: 'De krachtige openingstekst bovenaan de pagina' },
              { key: 'agents_headline',  label: 'Agents headline', placeholder: 'Kop boven de agent-kaarten' },
              { key: 'steps_title',      label: 'Hoe het werkt — kop', placeholder: 'Kop boven de stappenuitleg' },
              { key: 'usecases_headline', label: 'Usecases headline', placeholder: 'Kop boven de use cases' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: 20 }}>
                <label style={{ fontSize: '.78rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>{field.label}</label>
                <textarea
                  value={editFields[field.key] || ''}
                  onChange={e => setEditFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  rows={2}
                  style={{ ...inp, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={() => setEditModal(null)} disabled={editSaving} style={{ flex: 1, padding: 14, background: '#F1F5F9', color: '#334155', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: '.95rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                Annuleren
              </button>
              <button onClick={saveEditModal} disabled={editSaving} style={{ flex: 2, padding: 14, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.95rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", opacity: editSaving ? 0.7 : 1 }}>
                {editSaving ? 'Opslaan & vertalen…' : '✓ Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ OUTREACH TAB ══════════════════════ */}
      {tab === 'outreach' && (
        <div>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 6 }}>🚀 Bulk outreach</h2>
            <p style={{ color: '#64748B', fontSize: '.88rem' }}>
              Plak een CSV met prospects. Systeem genereert voor iedereen een gepersonaliseerde demo-link. Minimale kolommen: <code style={{ background: '#F1F5F9', padding: '1px 6px', borderRadius: 4 }}>bedrijfsnaam, website</code> — optioneel: <code style={{ background: '#F1F5F9', padding: '1px 6px', borderRadius: 4 }}>naam, email, telefoon</code>
            </p>
          </div>

          {/* Step 1: CSV input */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #F1F5F9', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1rem' }}>Stap 1 — CSV plakken</h3>
              <button onClick={() => setBulkCsv('Loodgieter Jansen,loodgieterJansen.nl,Kees Jansen,kees@loodgieterjansen.nl,0612345678\nTandarts Smit,tandartsmit.nl,Dr. Smit,info@tandartsmit.nl,')}
                style={{ fontSize: '.75rem', color: '#0D9488', background: 'none', border: '1px solid #0D9488', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                Voorbeeld laden
              </button>
            </div>
            <textarea
              value={bulkCsv}
              onChange={e => setBulkCsv(e.target.value)}
              placeholder={'bedrijfsnaam,website,naam,email,telefoon\nLoodgieter Jansen,loodgieterjansen.nl,Kees,kees@test.nl,\nTandarts Smit,tandartsmit.nl,,,'}
              style={{ width: '100%', minHeight: 160, padding: 12, borderRadius: 8, border: '1.5px solid #E2E8F0', fontFamily: 'monospace', fontSize: '.82rem', color: '#334155', resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
            />
            {bulkError && <div style={{ marginTop: 8, color: '#DC2626', fontSize: '.83rem' }}>{bulkError}</div>}
            <button onClick={handleBulkProcess}
              style={{ marginTop: 12, background: '#0D9488', color: '#fff', padding: '11px 24px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
              Verwerk CSV →
            </button>
          </div>

          {/* Step 2: Preview */}
          {bulkParsed.length > 0 && bulkResults.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #F1F5F9', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1rem' }}>Stap 2 — Controleer ({bulkParsed.length} prospects)</h3>
                <button onClick={handleBulkGenerate} disabled={bulkLoading}
                  style={{ background: bulkLoading ? '#94A3B8' : '#7C3AED', color: '#fff', padding: '11px 24px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: '.9rem', cursor: bulkLoading ? 'not-allowed' : 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                  {bulkLoading ? '⏳ Aanmaken…' : `✨ Genereer ${bulkParsed.length} demo-links`}
                </button>
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
            <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1rem' }}>
                  Stap 3 — Demo-links klaar 🎉
                  <span style={{ marginLeft: 10, fontSize: '.78rem', fontWeight: 400, color: '#64748B' }}>
                    {bulkResults.filter(r => r.status === 'ok').length}/{bulkResults.length} gelukt
                  </span>
                </h3>
                <button onClick={() => { setBulkParsed([]); setBulkResults([]); setBulkCsv('') }}
                  style={{ fontSize: '.8rem', color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}>
                  ↺ Nieuwe batch
                </button>
              </div>
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
                              <button onClick={() => copyLink(r.demo_url, i)}
                                style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #E2E8F0', background: copiedIdx === i ? '#DCFCE7' : '#F8FAFC', color: copiedIdx === i ? '#166534' : '#64748B', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {copiedIdx === i ? '✓ Gekopieerd' : '📋 Kopieer link'}
                              </button>
                              {r.email && (
                                <a href={makeOutreachMailto(r)}
                                  style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #0D9488', background: '#F0FDFA', color: '#0D9488', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                  ✉ Mail openen
                                </a>
                              )}
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
                }} style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#334155', padding: '10px 20px', borderRadius: 9, fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                  ⬇ Download alle links als CSV
                </button>
              </div>
            </div>
          )}
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
