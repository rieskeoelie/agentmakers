'use client'
import { useEffect, useMemo, useState } from 'react'
import { Bar, Button, DataTable, Dialog, EmptyState, ErrorState, Field, FilterBar, FilterSelect, Input, Menu, Page, PageHeader, SearchInput, Status, TableSkeleton, useConfirm, type Column } from '../ds'
import { useAdmin } from '../app/AdminContext'
import { ratio, shortDate, type LandingPage } from '../app/model'

const GENERATION_STEPS = ['Prompt versturen', 'Inhoud genereren in NL, EN en ES', 'Teksten controleren en structureren', 'Pagina opslaan', 'Bijna klaar']

export function PagesScreen() {
  const a = useAdmin()
  const { t } = a
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, confirmDialog] = useConfirm()

  const rows = useMemo(() => a.pages.filter((p) => (!status || p.status === status) && (!q.trim() || `${p.industry} ${p.slug}`.toLowerCase().includes(q.trim().toLowerCase()))), [a.pages, q, status])
  const maxRatio = Math.max(0.0001, ...a.pages.filter((p) => p.visits > 0).map((p) => p.conversions / p.visits))

  const toggleStatus = async (p: LandingPage) => {
    const next = p.status === 'live' ? 'offline' : 'live'
    a.setPages((ps) => ps.map((x) => (x.id === p.id ? { ...x, status: next } : x)))
    await fetch('/api/pages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, status: next }) })
  }
  const remove = async (p: LandingPage) => {
    if (!(await confirm({ title: t('deletePageTitle'), description: `${p.industry} (/${p.slug}) ${t('deletePageText')}`, confirmLabel: t('delete') }))) return
    a.setPages((ps) => ps.filter((x) => x.id !== p.id))
    await fetch('/api/pages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
  }

  const columns: Array<Column<LandingPage>> = [
    { key: 'page', header: t('pageCol'), sort: (p) => p.industry.toLowerCase(), render: (p) => <div><span className="am-cell-primary">{p.industry}</span><span className="am-cell-secondary">/nl/{p.slug}</span></div> },
    { key: 'status', header: 'Status', sort: (p) => p.status, nowrap: true, render: (p) => <Status tone={p.status === 'live' ? 'success' : 'neutral'}>{p.status === 'live' ? t('pageLive') : t('pageDraft')}</Status> },
    { key: 'locales', hide: 'sm', header: 'Talen', nowrap: true, render: () => <span className="am-muted">NL · EN · ES</span> },
    { key: 'visits', header: t('visitsCol'), align: 'right', sort: (p) => p.visits || 0, render: (p) => <span className="am-num">{p.visits || 0}</span> },
    { key: 'conv', header: t('convCol'), align: 'right', sort: (p) => p.conversions || 0, render: (p) => <span className="am-num">{p.conversions || 0}</span> },
    { key: 'ratio', header: t('ratioCol'), sort: (p) => (p.visits ? p.conversions / p.visits : -1), render: (p) => (
      <div className="am-inline" style={{ gap: 8, flexWrap: 'nowrap' }}><span className="am-num" style={{ width: 44, textAlign: 'right' }}>{ratio(p.conversions, p.visits)}</span>
        <div style={{ width: 64 }}><Bar pct={p.visits ? Math.round(((p.conversions / p.visits) / maxRatio) * 100) : 0} tone={p.visits ? undefined : 'muted'} /></div></div>) },
    { key: 'created', header: 'Aangemaakt', sort: (p) => p.created_at, nowrap: true, render: (p) => <span className="am-muted am-num">{shortDate(p.created_at)}</span> },
    { key: 'act', header: '', shrink: true, render: (p) => (
      <Menu items={[
        { label: t('editPage'), icon: 'edit', onSelect: () => a.navigate({ screen: 'pages', id: p.id }) },
        { label: t('viewPage'), icon: 'external', onSelect: () => window.open(`/nl/${p.slug}`, '_blank') },
        { label: p.status === 'live' ? t('setOffline') : t('setLive'), icon: p.status === 'live' ? 'pause' : 'play', onSelect: () => void toggleStatus(p) },
        { label: t('delete'), icon: 'trash', tone: 'danger', separatorBefore: true, onSelect: () => void remove(p) },
      ]} />
    ) },
  ]

  return (
    <Page>
      <PageHeader title={t('pagesTitle')} subtitle={t('pagesSubtitle')} actions={<Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>{t('pagesNew')}</Button>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Zoek branche of slug…" />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Alle statussen' }, { value: 'live', label: t('pageLive') }, { value: 'draft', label: t('pageDraft') }, { value: 'offline', label: 'Offline' }]} />
      </FilterBar>
      {a.crmLoading && !a.pages.length && <TableSkeleton cols={6} />}
      {a.crmError && !a.pages.length && <ErrorState message={a.crmError} onRetry={() => void a.refreshCrm()} />}
      {!a.crmLoading && !a.crmError && !a.pages.length && <EmptyState icon="file" title={t('pagesEmptyTitle')} text={t('pagesEmptyText')} action={<Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>{t('pagesNew')}</Button>} />}
      {a.pages.length > 0 && rows.length === 0 && <EmptyState icon="search" title={t('noResults')} text={t('noResultsText')} />}
      {rows.length > 0 && <DataTable testId="pages-table" rows={rows} columns={columns} rowKey={(p) => p.id} onRowClick={(p) => a.navigate({ screen: 'pages', id: p.id })} defaultSort={{ key: 'visits', dir: 'desc' }} />}
      <NewPageDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {confirmDialog}
    </Page>
  )
}

function NewPageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAdmin()
  const { t } = a
  const [industry, setIndustry] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!busy) { setStep(0); return }
    const timers = [2000, 5000, 9000, 13000].map((d, i) => setTimeout(() => setStep(i + 1), d))
    return () => timers.forEach(clearTimeout)
  }, [busy])
  const create = async () => {
    if (!industry || !slug) { setError('Vul branche en URL-slug in.'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ industry, slug, status: 'draft' }) })
      const data = await res.json()
      if (data.success) { setIndustry(''); setSlug(''); onClose(); void a.refreshCrm() } else setError(data.error || 'Genereren mislukt')
    } catch { setError(t('networkError')) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} closeDisabled={busy} title={t('newPageTitle')} description={t('newPageDesc')}
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>{t('cancel')}</Button><Button variant="primary" icon="sparkle" loading={busy} onClick={() => void create()}>{busy ? t('generating') : t('generate')}</Button></>}>
      {busy ? (
        <ol className="am-stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
          {GENERATION_STEPS.map((s, i) => (
            <li key={s} className="am-inline" style={{ color: i < step ? 'var(--am-green)' : i === step ? 'var(--am-text)' : 'var(--am-text-4)', fontWeight: i === step ? 600 : 400 }}>
              {i < step ? '✓' : i === step ? <span className="am-spinner" /> : '·'} {s}
            </li>
          ))}
        </ol>
      ) : (
        <form className="am-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); void create() }}>
          <Field label={t('industry')}><Input value={industry} placeholder="Tandartspraktijken" autoFocus onChange={(e) => { setIndustry(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')) }} /></Field>
          <Field label={t('slug')} help={<>agentmakers.io/nl/<strong>{slug || 'slug'}</strong></>}><Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></Field>
          {error && <p className="am-field-error">{error}</p>}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  )
}
