'use client'
import { useState, useEffect, useCallback } from 'react'

const ADMIN_KEY_STORAGE = 'agentmakers_admin_key'

interface Page {
  id: string; slug: string; industry: string; status: string
  visits: number; conversions: number; created_at: string; hero_image_url: string
}
interface Lead {
  id: string; naam: string; email: string; telefoon: string
  landing_page_slug: string; language: string; created_at: string; website?: string
}

export default function AdminDashboard() {
  const [key, setKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState<'pages' | 'leads' | 'analytics'>('pages')
  const [pages, setPages] = useState<Page[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newIndustry, setNewIndustry] = useState('')
  const [newSlug, setNewSlug] = useState('')

  const fetchData = useCallback(async (k: string) => {
    setLoading(true)
    const [pRes, lRes] = await Promise.all([
      fetch('/api/pages', { headers: { 'x-admin-key': k } }),
      fetch('/api/leads', { headers: { 'x-admin-key': k } }),
    ])
    if (pRes.ok) setPages(await pRes.json())
    if (lRes.ok) setLeads(await lRes.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY_STORAGE)
    if (stored) { setSavedKey(stored); setAuthed(true); fetchData(stored) }
  }, [fetchData])

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
    await fetch('/api/pages', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey }, body: JSON.stringify({ id: page.id, status: next }) })
    fetchData(savedKey)
  }

  const deletePage = async (page: Page) => {
    if (!confirm(`Verwijder "${page.industry}"? Dit kan niet ongedaan worden gemaakt.`)) return
    await fetch('/api/pages', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey }, body: JSON.stringify({ id: page.id }) })
    fetchData(savedKey)
  }

  const createPage = async () => {
    if (!newIndustry || !newSlug) return alert('Vul branche en URL-slug in')
    setCreating(true)
    const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': savedKey }, body: JSON.stringify({ industry: newIndustry, slug: newSlug, status: 'draft' }) })
    const data = await res.json()
    setCreating(false)
    if (data.success) { setShowCreate(false); setNewIndustry(''); setNewSlug(''); fetchData(savedKey) }
    else alert('Fout: ' + data.error)
  }

  const s = { background: '#fff', padding: '13px 16px', borderRadius: 10, border: '1.5px solid #CBD5E1', fontSize: '.92rem', fontFamily: "'Nunito',sans-serif", color: '#0F172A', outline: 'none', width: '100%' }

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

  const totalVisits = pages.reduce((s, p) => s + (p.visits || 0), 0)
  const totalConversions = pages.reduce((s, p) => s + (p.conversions || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: "'Nunito',sans-serif" }}>
      {/* Top nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: '#0D9488' }}>agentmakers.io <span style={{ fontSize: '.75rem', color: '#64748B', fontWeight: 400, marginLeft: 8 }}>admin</span></span>
        <button onClick={logout} style={{ background: 'none', border: '1px solid #CBD5E1', padding: '8px 18px', borderRadius: 8, fontSize: '.85rem', cursor: 'pointer', color: '#64748B', fontFamily: "'Nunito',sans-serif" }}>Uitloggen</button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            ['Pagina\'s', pages.length, '📄'],
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['pages', 'leads', 'analytics'] as const).map(t2 => (
            <button key={t2} onClick={() => setTab(t2)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", background: tab === t2 ? '#0D9488' : '#fff', color: tab === t2 ? '#fff' : '#64748B' }}>
              {t2 === 'pages' ? '📄 Pagina\'s' : t2 === 'leads' ? '📥 Aanvragen' : '📊 Analytics'}
            </button>
          ))}
        </div>

        {/* PAGES TAB */}
        {tab === 'pages' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem' }}>Landingspagina&apos;s</h2>
              <button onClick={() => setShowCreate(true)} style={{ background: '#0D9488', color: '#fff', padding: '12px 24px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: "'Nunito',sans-serif", display: 'flex', alignItems: 'center', gap: 8 }}>+ Nieuwe pagina</button>
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
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => toggleStatus(page)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: `1px solid ${page.status === 'live' ? '#EF4444' : '#22C55E'}`, background: '#fff', color: page.status === 'live' ? '#EF4444' : '#22C55E' }}>
                      {page.status === 'live' ? 'Offline' : 'Live zetten'}
                    </button>
                    <button onClick={() => window.open(`/nl/${page.slug}`, '_blank')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #CBD5E1', background: '#fff', color: '#334155' }}>Bekijken</button>
                    <button onClick={() => deletePage(page)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", border: '1px solid #EF4444', background: '#fff', color: '#EF4444' }}>Verwijder</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEADS TAB */}
        {tab === 'leads' && (
          <div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 20 }}>Demo-aanvragen ({leads.length})</h2>
            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #F1F5F9' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9' }}>
                    {['Naam', 'E-mail', 'Telefoon', 'Pagina', 'Taal', 'Datum'].map(h => (
                      <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: '.8rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr key={lead.id} style={{ borderTop: '1px solid #F1F5F9', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 600, color: '#0F172A' }}>{lead.naam}</td>
                      <td style={{ padding: '16px 20px' }}><a href={`mailto:${lead.email}`} style={{ color: '#0D9488' }}>{lead.email}</a></td>
                      <td style={{ padding: '16px 20px' }}>{lead.telefoon}</td>
                      <td style={{ padding: '16px 20px', color: '#0D9488' }}>/{lead.landing_page_slug}</td>
                      <td style={{ padding: '16px 20px' }}>{lead.language === 'nl' ? '🇳🇱' : lead.language === 'en' ? '🇬🇧' : '🇪🇸'}</td>
                      <td style={{ padding: '16px 20px', fontSize: '.85rem', color: '#64748B' }}>{new Date(lead.created_at).toLocaleDateString('nl-NL')}</td>
                    </tr>
                  ))}
                  {leads.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Nog geen aanvragen ontvangen.</td></tr>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
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
                        <td style={{ padding: '16px 20px', fontWeight: 600, color: '#0F172A' }}>{page.industry}<br /><span style={{ fontSize: '.8rem', color: '#0D9488', fontWeight: 400 }}>/{page.slug}</span></td>
                        <td style={{ padding: '16px 20px' }}>{page.visits || 0}</td>
                        <td style={{ padding: '16px 20px' }}>{page.conversions || 0}</td>
                        <td style={{ padding: '16px 20px' }}>{ratio}%</td>
                        <td style={{ padding: '16px 20px' }}><span style={{ padding: '4px 10px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700, background: page.status === 'live' ? '#DCFCE7' : '#FEF3C7', color: page.status === 'live' ? '#166534' : '#92400E' }}>{page.status}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 520, width: '100%', padding: 40, position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
            <button onClick={() => setShowCreate(false)} style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#F1F5F9', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', marginBottom: 8 }}>Nieuwe landingspagina</h2>
            <p style={{ color: '#64748B', fontSize: '.9rem', marginBottom: 28 }}>Claude AI schrijft de volledige pagina automatisch voor u.</p>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Branchenaam</label>
              <input value={newIndustry} onChange={e => { setNewIndustry(e.target.value); setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')) }} placeholder="bijv. Tandartspraktijken" style={s} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>URL-slug</label>
              <input value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="tandartsen" style={s} />
              <p style={{ fontSize: '.78rem', color: '#64748B', marginTop: 4 }}>Wordt: agentmakers.io/nl/<strong>{newSlug || 'slug'}</strong></p>
            </div>
            <button onClick={createPage} disabled={creating} style={{ width: '100%', padding: 14, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: creating ? 'wait' : 'pointer', fontFamily: "'Nunito',sans-serif" }}>
              {creating ? '⏳ Claude AI is aan het schrijven...' : '✨ Pagina genereren'}
            </button>
            {creating && <p style={{ textAlign: 'center', fontSize: '.85rem', color: '#64748B', marginTop: 12 }}>Dit duurt ±15 seconden. Even geduld...</p>}
          </div>
        </div>
      )}
    </div>
  )
}
