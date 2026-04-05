'use client'
import { useState, useEffect, useCallback } from 'react'

const ADMIN_KEY_STORAGE = 'agentmakers_admin_key'
const SEEN_LEADS_STORAGE = 'agentmakers_seen_leads'

interface Page {
  id: string; slug: string; industry: string; status: string
  visits: number; conversions: number; created_at: string; hero_image_url: string
}
interface Lead {
  id: string; naam: string; email: string; telefoon: string
  landing_page_slug: string; language: string; created_at: string
  website?: string; bedrijfsnaam?: string; handled?: boolean
}
interface Conversation {
  conversation_id: string
  status: string
  start_time_unix_secs: number
  call_duration_secs: number
  has_audio: boolean
  has_user_audio: boolean
  has_response_audio: boolean
}
interface TranscriptTurn {
  role: 'user' | 'agent'
  message: string
  time_in_call_secs?: number
}
interface ConversationDetail {
  conversation_id: string
  status: string
  start_time_unix_secs: number
  call_duration_secs: number
  cost?: number
  has_audio: boolean
  transcript: TranscriptTurn[]
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

const GENERATION_STEPS = [
  'Prompt versturen naar Claude AI...',
  'Inhoud genereren in 3 talen (NL/EN/ES)...',
  'Teksten verifiëren en structureren...',
  'Pagina opslaan in database...',
  'Bijna klaar...',
]

export default function AdminDashboard() {
  const [key, setKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState<'pages' | 'leads' | 'analytics' | 'conversations'>('pages')
  const [pages, setPages] = useState<Page[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [handledLeads, setHandledLeads] = useState<Set<string>>(new Set())
  const [seenLeadIds, setSeenLeadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  // leads selection & delete state
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [deleteLeadsLoading, setDeleteLeadsLoading] = useState(false)
  // conversations state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convLoading, setConvLoading] = useState(false)
  const [openConvId, setOpenConvId] = useState<string | null>(null)
  const [convDetails, setConvDetails] = useState<Record<string, ConversationDetail>>({})
  const [creating, setCreating] = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [newIndustry, setNewIndustry] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [deleteModal, setDeleteModal] = useState<Page | null>(null)
  const [analyticsLang, setAnalyticsLang] = useState<'all' | 'nl' | 'en' | 'es'>('all')

  const fetchData = useCallback(async (k: string) => {
    setLoading(true)
    const [pRes, lRes] = await Promise.all([
      fetch('/api/pages', { headers: { 'x-admin-key': k } }),
      fetch('/api/leads', { headers: { 'x-admin-key': k } }),
    ])
    if (pRes.ok) setPages(await pRes.json())
    if (lRes.ok) {
      const fetchedLeads: Lead[] = await lRes.json()
      setLeads(fetchedLeads)
      // Mark new leads (not seen before)
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
      // Auto-fetch details for all conversations (parallel, max 5 at a time)
      const batchSize = 5
      for (let i = 0; i < convs.length; i += batchSize) {
        const batch = convs.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map(c =>
            fetch(`/api/conversations/${c.conversation_id}`, { headers: { 'x-admin-key': k } })
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
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
    if (convDetails[id]) return // already loaded
    const res = await fetch(`/api/conversations/${id}`, { headers: { 'x-admin-key': savedKey } })
    if (res.ok) {
      const data: ConversationDetail = await res.json()
      setConvDetails(prev => ({ ...prev, [id]: data }))
    }
  }, [convDetails, savedKey])

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY_STORAGE)
    if (stored) { setSavedKey(stored); setAuthed(true); fetchData(stored) }
  }, [fetchData])

  // Simulate generation progress
  useEffect(() => {
    if (!creating) { setGenerationStep(0); return }
    const intervals = [2000, 5000, 9000, 13000]
    const timers = intervals.map((delay, i) =>
      setTimeout(() => setGenerationStep(i + 1), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [creating])

  const markAllSeen = useCallback(() => {
    const allIds = leads.map(l => l.id)
    localStorage.setItem(SEEN_LEADS_STORAGE, JSON.stringify(allIds))
    setSeenLeadIds(new Set(allIds))
  }, [leads])

  const login = () => {
    localStorage.setItem(ADMIN_KEY_STORAGE, key)
    setSavedKey(key); setAuthed(true); fetchData(key)
  }

  const logout = () => {
    localStorage.removeItem(ADMIN_KEY_STORAGE)
    setAuthed(false); setSavedKey(''); setKey('')
  }

  const toggleStatus = async (page: Page) => {
    const next = page.status === 'live' ? 'offline' : 'live'
    // Optimistic update
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, status: next } : p))
    await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey },
      body: JSON.stringify({ id: page.id, status: next })
    })
  }

  const confirmDelete = async () => {
    if (!deleteModal) return
    // Optimistic update
    setPages(prev => prev.filter(p => p.id !== deleteModal.id))
    setDeleteModal(null)
    await fetch('/api/pages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey },
      body: JSON.stringify({ id: deleteModal.id })
    })
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
    if (data.success) {
      setShowCreate(false); setNewIndustry(''); setNewSlug('')
      fetchData(savedKey)
    } else alert('Fout: ' + data.error)
  }

  const toggleHandled = (id: string) => {
    setHandledLeads(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectLead = (id: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)))
    }
  }
  const deleteSelectedLeads = async () => {
    if (selectedLeads.size === 0) return
    if (!confirm(`Weet je zeker dat je ${selectedLeads.size} aanvra${selectedLeads.size === 1 ? 'ag' : 'gen'} wilt verwijderen? Dit kan niet ongedaan worden.`)) return
    setDeleteLeadsLoading(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'x-admin-key': savedKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedLeads) }),
      })
      if (res.ok) {
        setLeads(prev => prev.filter(l => !selectedLeads.has(l.id)))
        setSelectedLeads(new Set())
      }
    } catch (e) { console.error('Delete failed', e) }
    setDeleteLeadsLoading(false)
  }

  const exportCSV = () => {
    const headers = ['Naam', 'E-mail', 'Telefoon', 'Bedrijf', 'Website', 'Pagina', 'Taal', 'Datum', 'Afgehandeld']
    const rows = leads.map(l => [
      l.naam, l.email, l.telefoon,
      l.bedrijfsnaam || '', l.website || '',
      '/' + l.landing_page_slug, l.language,
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

  const newLeadsCount = leads.filter(l => !seenLeadIds.has(l.id)).length

  const s = {
    background: '#fff', padding: '13px 16px', borderRadius: 10,
    border: '1.5px solid #CBD5E1', fontSize: '.92rem',
    fontFamily: "'Nunito',sans-serif", color: '#0F172A', outline: 'none', width: '100%'
  }

  const totalVisits = pages.reduce((acc, p) => acc + (p.visits || 0), 0)
  const totalConversions = pages.reduce((acc, p) => acc + (p.conversions || 0), 0)

  // Analytics: sort pages by conversion ratio
  const sortedByRatio = [...pages]
    .filter(p => p.visits > 0)
    .sort((a, b) => (b.conversions / b.visits) - (a.conversions / a.visits))

  // Analytics: per-language lead breakdown
  const leadsByLang = {
    nl: leads.filter(l => l.language === 'nl').length,
    en: leads.filter(l => l.language === 'en').length,
    es: leads.filter(l => l.language === 'es').length,
  }
  const filteredLeads = analyticsLang === 'all' ? leads : leads.filter(l => l.language === analyticsLang)

  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
      <div style={{ background: '#fff', padding: '48px 40px', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,.08)', maxWidth: 400, width: '100%' }}>
        <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.5rem', marginBottom: 8 }}>Admin Dashboard</h1>
        <p style={{ color: '#64748B', fontSize: '.92rem', marginBottom: 32 }}>Voer uw admin sleutel in om in te loggen.</p>
        <input type="password" value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Admin sleutel" style={{ ...s, marginBottom: 16 }} />
        <button onClick={login} style={{ width: '100%', padding: 14, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>Inloggen</button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: '.78rem', color: '#64748B' }}>Sleutel instellen in Vercel onder ADMIN_SECRET_KEY</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: "'Nunito',sans-serif" }}>
      {/* Top nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: '#0D9488' }}>
          agentmakers.io <span style={{ fontSize: '.75rem', color: '#64748B', fontWeight: 400, marginLeft: 8 }}>admin</span>
        </span>
        <button onClick={logout} style={{ background: 'none', border: '1px solid #CBD5E1', padding: '8px 18px', borderRadius: 8, fontSize: '.85rem', cursor: 'pointer', color: '#64748B', fontFamily: "'Nunito',sans-serif" }}>Uitloggen</button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            ["Pagina's", pages.length, '📄'],
            ['Live', pages.filter(p => p.status === 'live').length, '🟢'],
            ['Bezoekers', totalVisits, '👁️'],
            ['Aanvragen', leads.length, '📥'],
          ].map(([label, val, icon]) => (
            <div key={label as string} style={{ background: '#fff', padding: '24px', borderRadius: 14, border: '1px solid #F1F5F9', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{icon}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '2rem', fontWeight: 700, color: '#0D9488' }}>{val}</div>
              <div style={{ fontSize: '.85rem', color: '#64748B', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {(['pages', 'leads', 'analytics', 'conversations'] as const).map(t2 => (
            <button key={t2} onClick={() => {
              setTab(t2)
              if (t2 === 'leads') markAllSeen()
              if (t2 === 'conversations' && conversations.length === 0) fetchConversations(savedKey)
            }}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", background: tab === t2 ? '#0D9488' : '#fff', color: tab === t2 ? '#fff' : '#64748B', position: 'relative' }}>
              {t2 === 'pages' ? "📄 Pagina's" : t2 === 'leads' ? '📥 Aanvragen' : t2 === 'analytics' ? '📊 Analytics' : '🎙 Gesprekken'}
              {t2 === 'leads' && newLeadsCount > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: '.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {newLeadsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* PAGES TAB */}
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
                    <button onClick={() => setDeleteModal(page)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #EF4444', background: '#fff', color: '#EF4444' }}>
                      Verwijder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEADS TAB */}
        {tab === 'leads' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
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
            <div style={{ background: '#fff', borderRadius: 14, overflowX: 'auto', border: '1px solid #F1F5F9' }}>
              <table style={{ width: '100%', minWidth: 950, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9' }}>
                    <th style={{ padding: '14px 16px', width: 40 }}>
                      <input type="checkbox" checked={leads.length > 0 && selectedLeads.size === leads.length} onChange={toggleSelectAll} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                    </th>
                    {['', 'Naam', 'E-mail', 'Telefoon', 'Bedrijf', 'Pagina', 'Taal', 'Datum', 'Status'].map(h => (
                      <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => {
                    const isNew = !seenLeadIds.has(lead.id)
                    const isHandled = handledLeads.has(lead.id)
                    return (
                      <tr key={lead.id} style={{ borderTop: '1px solid #F1F5F9', background: selectedLeads.has(lead.id) ? '#EFF6FF' : isNew ? '#F0FDF4' : i % 2 === 0 ? '#fff' : '#FAFAFA', opacity: isHandled ? 0.55 : 1, transition: 'opacity .2s, background .15s' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <input type="checkbox" checked={selectedLeads.has(lead.id)} onChange={() => toggleSelectLead(lead.id)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {isNew && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22C55E', marginRight: 4 }} title="Nieuw" />}
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0F172A' }}>{lead.naam}</td>
                        <td style={{ padding: '14px 16px' }}><a href={`mailto:${lead.email}`} style={{ color: '#0D9488' }}>{lead.email}</a></td>
                        <td style={{ padding: '14px 16px' }}><a href={`tel:${lead.telefoon}`} style={{ color: '#334155' }}>{lead.telefoon}</a></td>
                        <td style={{ padding: '14px 16px', color: '#64748B', fontSize: '.85rem' }}>{lead.bedrijfsnaam || lead.website || '—'}</td>
                        <td style={{ padding: '14px 16px', color: '#0D9488', fontSize: '.85rem' }}>/{lead.landing_page_slug}</td>
                        <td style={{ padding: '14px 16px' }}>{lead.language === 'nl' ? '🇳🇱' : lead.language === 'en' ? '🇬🇧' : '🇪🇸'}</td>
                        <td style={{ padding: '14px 16px', fontSize: '.82rem', color: '#64748B' }}>{new Date(lead.created_at).toLocaleDateString('nl-NL')}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <button onClick={() => toggleHandled(lead.id)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: `1px solid ${isHandled ? '#CBD5E1' : '#22C55E'}`, background: isHandled ? '#F1F5F9' : '#F0FDF4', color: isHandled ? '#94A3B8' : '#166534' }}>
                            {isHandled ? 'Heropenen' : '✓ Afgehandeld'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {leads.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Nog geen aanvragen ontvangen.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {tab === 'analytics' && (
          <div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 20 }}>Analytics</h2>

            {/* Totaal stats */}
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

            {/* Aanvragen per taal */}
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
                {[
                  { lang: 'nl', flag: '🇳🇱', label: 'Nederlands' },
                  { lang: 'en', flag: '🇬🇧', label: 'Engels' },
                  { lang: 'es', flag: '🇪🇸', label: 'Spaans' },
                ].map(({ lang, flag, label }) => {
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
              {filteredLeads.length > 0 && (
                <p style={{ fontSize: '.82rem', color: '#64748B', margin: 0 }}>
                  Toont {filteredLeads.length} aanvragen{analyticsLang !== 'all' ? ` voor taal: ${analyticsLang.toUpperCase()}` : ''}
                </p>
              )}
            </div>

            {/* Beste pagina's op conversieratio */}
            {sortedByRatio.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #F1F5F9', marginBottom: 24 }}>
                <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>🏆 Beste pagina&apos;s op conversieratio</h3>
                {sortedByRatio.map((page, i) => {
                  const ratio = ((page.conversions / page.visits) * 100).toFixed(1)
                  const barWidth = Math.min(100, parseFloat(ratio) * 10)
                  return (
                    <div key={page.id} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '.88rem', fontWeight: 600, color: '#0F172A' }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {page.industry}
                        </span>
                        <span style={{ fontSize: '.88rem', fontWeight: 700, color: '#0D9488' }}>{ratio}%</span>
                      </div>
                      <div style={{ background: '#F1F5F9', borderRadius: 4, height: 6 }}>
                        <div style={{ background: '#0D9488', borderRadius: 4, height: 6, width: `${barWidth}%`, transition: 'width .4s' }} />
                      </div>
                      <div style={{ fontSize: '.75rem', color: '#94A3B8', marginTop: 2 }}>
                        {page.visits} bezoekers · {page.conversions} conversies
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Alle pagina's tabel */}
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
                  {pages.map((page, i) => {
                    const ratio = page.visits > 0 ? ((page.conversions / page.visits) * 100).toFixed(1) : '0'
                    return (
                      <tr key={page.id} style={{ borderTop: '1px solid #F1F5F9', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '16px 20px', fontWeight: 600, color: '#0F172A' }}>
                          {page.industry}<br />
                          <span style={{ fontSize: '.8rem', color: '#0D9488', fontWeight: 400 }}>/{page.slug}</span>
                        </td>
                        <td style={{ padding: '16px 20px' }}>{page.visits || 0}</td>
                        <td style={{ padding: '16px 20px' }}>{page.conversions || 0}</td>
                        <td style={{ padding: '16px 20px' }}>{ratio}%</td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ padding: '4px 10px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700, background: page.status === 'live' ? '#DCFCE7' : '#FEF3C7', color: page.status === 'live' ? '#166534' : '#92400E' }}>
                            {page.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CONVERSATIONS TAB */}
        {tab === 'conversations' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem' }}>
                🎙 Gesprekken ({conversations.length})
              </h2>
              <button
                onClick={() => fetchConversations(savedKey)}
                disabled={convLoading}
                style={{ background: '#fff', border: '1.5px solid #0D9488', color: '#0D9488', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", opacity: convLoading ? 0.6 : 1 }}
              >
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
                const statusBg   = conv.status === 'done' ? '#DCFCE7' : conv.status === 'failed' ? '#FEE2E2'  : '#FEF3C7'

                return (
                  <div key={conv.conversation_id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #F1F5F9', overflow: 'hidden' }}>
                    {/* Row header */}
                    <div
                      onClick={async () => {
                        if (isOpen) { setOpenConvId(null); return }
                        setOpenConvId(conv.conversation_id)
                        await fetchConversationDetail(conv.conversation_id)
                      }}
                      style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', userSelect: 'none' }}
                    >
                      {/* Expand arrow */}
                      <span style={{ fontSize: '1rem', color: '#94A3B8', transition: 'transform .2s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>

                      {/* Date */}
                      <div style={{ minWidth: 130 }}>
                        <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#0F172A' }}>
                          {startDate.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '.76rem', color: '#94A3B8' }}>
                          {startDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      {/* Contact & company info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {info && (info.contact || info.company) ? (
                          <>
                            <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {info.contact || info.company}
                            </div>
                            {info.contact && info.company && (
                              <div style={{ fontSize: '.76rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {info.company}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: '.85rem', color: '#CBD5E1' }}>
                            {detail ? 'Onbekend' : 'Laden…'}
                          </div>
                        )}
                      </div>

                      {/* Duration */}
                      <div style={{ fontSize: '.82rem', color: '#64748B', minWidth: 60, textAlign: 'right' }}>
                        {fmtDuration(conv.call_duration_secs)}
                      </div>

                      {/* Status */}
                      <span style={{ padding: '4px 10px', borderRadius: 100, fontSize: '.7rem', fontWeight: 700, background: statusBg, color: statusColor, minWidth: 60, textAlign: 'center' }}>
                        {conv.status === 'done' ? 'Klaar' : conv.status === 'failed' ? 'Mislukt' : conv.status}
                      </span>

                      {/* Audio badge */}
                      {conv.has_audio && (
                        <span style={{ fontSize: '.72rem', fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8', padding: '3px 9px', borderRadius: 100 }}>
                          🔊 Audio
                        </span>
                      )}
                    </div>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                        {!detail ? (
                          <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>Transcript laden…</div>
                        ) : (
                          <div style={{ padding: '24px' }}>

                            {/* Audio player */}
                            {detail.has_audio && (
                              <div style={{ marginBottom: 24, background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                                  🔊 Geluidsopname
                                </div>
                                <audio
                                  controls
                                  preload="none"
                                  style={{ width: '100%', height: 40 }}
                                  src={`/api/conversations/${detail.conversation_id}/audio?key=${encodeURIComponent(savedKey)}`}
                                >
                                  Uw browser ondersteunt geen audio element.
                                </audio>
                                <div style={{ fontSize: '.72rem', color: '#94A3B8', marginTop: 6 }}>
                                  Duur: {fmtDuration(detail.call_duration_secs)}
                                  {detail.cost != null && ` · Kosten: $${detail.cost.toFixed(4)}`}
                                </div>
                              </div>
                            )}

                            {/* Transcript */}
                            <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
                              💬 Transcript ({detail.transcript.length} berichten)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
                              {detail.transcript.map((turn, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: turn.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                  <div style={{
                                    maxWidth: '72%',
                                    padding: '10px 14px',
                                    borderRadius: turn.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    background: turn.role === 'user' ? '#0D9488' : '#fff',
                                    color: turn.role === 'user' ? '#fff' : '#0F172A',
                                    fontSize: '.85rem',
                                    lineHeight: 1.5,
                                    border: turn.role === 'agent' ? '1px solid #E2E8F0' : 'none',
                                    boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                                  }}>
                                    <div style={{ fontSize: '.68rem', fontWeight: 700, marginBottom: 4, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                      {turn.role === 'user' ? '👤 Prospect' : '🤖 Agent'}
                                      {turn.time_in_call_secs != null && ` · ${fmtDuration(turn.time_in_call_secs)}`}
                                    </div>
                                    {turn.message}
                                  </div>
                                </div>
                              ))}
                              {detail.transcript.length === 0 && (
                                <p style={{ color: '#94A3B8', fontSize: '.85rem', textAlign: 'center', padding: '20px 0' }}>Geen transcript beschikbaar.</p>
                              )}
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

      {/* CREATE MODAL */}
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
                  <input value={newIndustry} onChange={e => { setNewIndustry(e.target.value); setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')) }} placeholder="bijv. Tandartspraktijken" style={s} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>URL-slug</label>
                  <input value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="tandartsen" style={s} />
                  <p style={{ fontSize: '.78rem', color: '#64748B', marginTop: 4 }}>Wordt: agentmakers.io/nl/<strong>{newSlug || 'slug'}</strong></p>
                </div>
                <button onClick={createPage} style={{ width: '100%', padding: 14, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                  ✨ Pagina genereren
                </button>
              </>
            ) : (
              <div style={{ paddingTop: 8 }}>
                {GENERATION_STEPS.map((step, i) => {
                  const done = i < generationStep
                  const active = i === generationStep
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

      {/* DELETE CONFIRM MODAL */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 440, width: '100%', padding: 40, boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 16 }}>🗑️</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', marginBottom: 8, textAlign: 'center' }}>Pagina verwijderen?</h2>
            <p style={{ color: '#64748B', fontSize: '.9rem', textAlign: 'center', marginBottom: 28 }}>
              Je staat op het punt <strong>{deleteModal.industry}</strong> (<code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, fontSize: '.82rem' }}>/{deleteModal.slug}</code>) permanent te verwijderen. Dit kan niet ongedaan worden gemaakt.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteModal(null)} style={{ flex: 1, padding: 14, background: '#F1F5F9', color: '#334155', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: '.95rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                Annuleren
              </button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: 14, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.95rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif" }}>
                Ja, verwijder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
