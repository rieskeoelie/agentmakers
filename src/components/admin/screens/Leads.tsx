'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActiveFilters, Button, DataTable, EmptyState, ErrorState, FilterBar, FilterSelect, Icon, Menu, Metrics, Page, PageHeader,
  SearchInput, Status, TableSkeleton, useConfirm, type Column,
} from '../ds'
import { useAdmin } from '../app/AdminContext'
import { leadsCsv, leadSource, SOURCE_LABEL, STAGE_META, STAGES, stageOf, shortDate, matchedConversation, type Lead, type LeadSource, type Stage } from '../app/model'
import { InviteDialog } from './InviteDialog'

export function StageSelect({ value, onChange }: { value: Stage; onChange: (s: Stage) => void }) {
  const { t } = useAdmin()
  return (
    <select className="am-select" data-stop aria-label="Status" value={value} onChange={(e) => onChange(e.target.value as Stage)}
      style={{ height: 26, fontSize: 12.5, paddingLeft: 8 }} data-tone={STAGE_META[value].tone}>
      {STAGES.map((s) => <option key={s} value={s}>{t(STAGE_META[s].label)}</option>)}
    </select>
  )
}

export function SourceStatus({ lead }: { lead: Lead }) {
  const { t } = useAdmin()
  const s = leadSource(lead)
  return <Status tone={s === 'outreach' ? 'accent' : 'neutral'} dot={s === 'outreach'}>{t(SOURCE_LABEL[s])}</Status>
}

export function LeadsScreen() {
  const a = useAdmin()
  const { t } = a
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<'' | Stage>('')
  const [source, setSource] = useState<'' | LeadSource>('')
  const [lang, setLang] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviteOpen, setInviteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  // "New" is judged against what was seen before this visit; the visit itself marks everything seen.
  const seenAtOpen = useRef<Set<string> | null>(null)
  if (seenAtOpen.current === null) seenAtOpen.current = new Set(a.seen)
  const { markLeadsSeen, crmLoading } = a
  useEffect(() => { if (!crmLoading) markLeadsSeen() }, [crmLoading, markLeadsSeen])
  useEffect(() => { a.loadConversations() }, [a.loadConversations]) // eslint-disable-line react-hooks/exhaustive-deps

  const leads = a.visibleLeads
  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s, leads.filter((l) => stageOf(a.leadStatus, l.id) === s).length])) as Record<Stage, number>, [leads, a.leadStatus])
  const languages = useMemo(() => [...new Set(leads.map((l) => l.language).filter(Boolean))].sort(), [leads])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return leads.filter((l) =>
      (!stage || stageOf(a.leadStatus, l.id) === stage) && (!source || leadSource(l) === source) && (!lang || l.language === lang) &&
      (!needle || [l.naam, l.bedrijfsnaam, l.email, l.website, l.telefoon].some((v) => (v ?? '').toLowerCase().includes(needle))))
  }, [leads, q, stage, source, lang, a.leadStatus])

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const exportCsv = () => {
    const blob = new Blob(['﻿' + leadsCsv(leads, a.leadStatus, a.leadNotes, a.handled)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url; el.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; el.click(); URL.revokeObjectURL(url)
  }
  const deleteLeads = async (ids: string[]) => {
    if (!ids.length) return
    if (!(await confirm({ title: t('deleteLeadsTitle'), description: `${ids.length} × — ${t('deleteLeadsText')}`, confirmLabel: t('delete') }))) return
    setDeleting(true)
    try {
      const res = await fetch('/api/leads', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      if (res.ok) { a.setLeads((ls) => ls.filter((l) => !ids.includes(l.id))); setSelected(new Set()) }
    } finally { setDeleting(false) }
  }

  const columns: Array<Column<Lead>> = [
    { key: 'sel', shrink: true, header: <input type="checkbox" aria-label="Selecteer alles" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />,
      render: (l) => <input type="checkbox" aria-label={`Selecteer ${l.naam}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} /> },
    { key: 'contact', header: t('colContact'), sort: (l) => (l.naam || l.bedrijfsnaam || '').toLowerCase(), render: (l) => (
      <div style={{ minWidth: 150, maxWidth: 210 }}>
        <span className="am-cell-primary am-inline" style={{ gap: 6, flexWrap: 'nowrap' }} title={l.naam || l.bedrijfsnaam || undefined}>
          {!seenAtOpen.current!.has(l.id) && <span title={t('newBadge')} style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--am-accent)', flexShrink: 0 }} />}
          <span className="am-truncate" style={{ minWidth: 0 }}>{l.naam || l.bedrijfsnaam || '—'}</span>
        </span>
        {l.naam && l.bedrijfsnaam && <span className="am-cell-secondary am-truncate" style={{ display: 'block' }} title={l.bedrijfsnaam}>{l.bedrijfsnaam}</span>}
      </div>) },
    { key: 'email', header: t('colEmail'), render: (l) => <div style={{ maxWidth: 200 }}><span className="am-cell-primary am-truncate" style={{ fontWeight: 400, display: 'block' }} title={l.email}>{l.email}</span>{l.telefoon && <span className="am-cell-secondary">{l.telefoon}</span>}</div> },
    { key: 'source', header: t('colSource'), sort: (l) => leadSource(l), render: (l) => <SourceStatus lead={l} />, nowrap: true },
    { key: 'stage', header: t('colStatus'), sort: (l) => STAGES.indexOf(stageOf(a.leadStatus, l.id)), render: (l) => <StageSelect value={stageOf(a.leadStatus, l.id)} onChange={(s) => a.setLeadStatus(l.id, s)} />, nowrap: true },
    { key: 'page', hide: 'lg', header: t('colPage'), sort: (l) => l.landing_page_slug, render: (l) => <span className="am-muted">/{l.landing_page_slug}</span>, nowrap: true },
    { key: 'lang', hide: 'md', header: t('colLanguage'), render: (l) => <span className="am-muted" style={{ textTransform: 'uppercase' }}>{l.language}</span>, shrink: true },
    { key: 'conv', hide: 'md', header: t('colConversation'), shrink: true, render: (l) => {
      const c = matchedConversation(l, a.convIndex)
      return c ? <button type="button" className="am-link-btn am-inline" style={{ gap: 4, flexWrap: 'nowrap', whiteSpace: 'nowrap' }} onClick={() => a.navigate({ screen: 'conversations', id: c })}><Icon name="phone" size={13} />{t('open')}</button> : <span className="am-faint">—</span>
    } },
    { key: 'created', hide: 'sm', header: t('colCreated'), sort: (l) => l.created_at, render: (l) => <span className="am-num am-muted">{shortDate(l.created_at)}</span>, nowrap: true },
    { key: 'act', header: '', shrink: true, render: (l) => (
      <Menu items={[
        { label: t('open'), icon: 'chevronRight', onSelect: () => a.navigate({ screen: 'leads', id: l.id }) },
        { label: t('sendEmail'), icon: 'mail', onSelect: () => { window.location.href = `mailto:${l.email}` } },
        { label: a.handled.has(l.id) ? t('reopen') : t('markHandled'), icon: 'check', onSelect: () => a.toggleHandled(l.id) },
        { label: t('delete'), icon: 'trash', tone: 'danger', separatorBefore: true, onSelect: () => void deleteLeads([l.id]) },
      ]} />
    ) },
  ]

  const filters = [
    ...(stage ? [{ key: 'stage', label: t(STAGE_META[stage].label), onRemove: () => setStage('') }] : []),
    ...(source ? [{ key: 'source', label: t(SOURCE_LABEL[source]), onRemove: () => setSource('') }] : []),
    ...(lang ? [{ key: 'lang', label: lang.toUpperCase(), onRemove: () => setLang('') }] : []),
  ]

  return (
    <Page>
      <PageHeader title={t('leadsTitle')} subtitle={t('leadsSubtitle')}
        actions={<>
          <Button icon="download" onClick={exportCsv} disabled={!leads.length}>{t('exportCsv')}</Button>
          <Button variant="primary" icon="send" onClick={() => setInviteOpen(true)}>{t('invite')}</Button>
        </>} />

      <Metrics testId="lead-pipeline" items={STAGES.map((s) => ({
        label: t(STAGE_META[s].label), value: counts[s],
        tone: s === 'gewonnen' && counts[s] ? 'success' : s === 'verloren' && counts[s] ? 'danger' : undefined,
        onClick: () => setStage(stage === s ? '' : s), title: 'Filter op deze status',
      }))} />

      <div style={{ height: 16 }} />
      <FilterBar testId="lead-filters"
        end={selected.size > 0 ? <><span className="am-muted">{selected.size} {t('selected')}</span><Button variant="danger" icon="trash" size="sm" loading={deleting} onClick={() => void deleteLeads([...selected])}>{t('deleteSelected')}</Button></> : undefined}>
        <SearchInput value={q} onChange={setQ} placeholder={t('searchLeads')} />
        <FilterSelect label={t('colStatus')} value={stage} onChange={setStage} options={[{ value: '', label: t('allStages') }, ...STAGES.map((s) => ({ value: s, label: `${t(STAGE_META[s].label)} (${counts[s]})` }))]} />
        <FilterSelect label={t('colSource')} value={source} onChange={setSource} options={[{ value: '', label: t('allSources') }, ...(['outreach', 'website', 'invite', 'demo_link'] as LeadSource[]).map((s) => ({ value: s, label: t(SOURCE_LABEL[s]) }))]} />
        {languages.length > 1 && <FilterSelect label={t('colLanguage')} value={lang} onChange={setLang} options={[{ value: '', label: t('colLanguage') }, ...languages.map((l) => ({ value: l, label: l.toUpperCase() }))]} />}
      </FilterBar>
      <ActiveFilters items={filters} onClearAll={() => { setStage(''); setSource(''); setLang(''); setQ('') }} />

      {a.crmError && !leads.length && <ErrorState message={a.crmError} onRetry={() => void a.refreshCrm()} />}
      {a.crmLoading && !leads.length && !a.crmError && <TableSkeleton cols={7} />}
      {!a.crmLoading && !a.crmError && leads.length === 0 && (
        <EmptyState icon="users" title={t('leadsEmptyTitle')} text={t('leadsEmptyText')} action={<Button variant="primary" icon="send" onClick={() => setInviteOpen(true)}>{t('invite')}</Button>} />
      )}
      {leads.length > 0 && rows.length === 0 && <EmptyState icon="search" title={t('noResults')} text={t('noResultsText')} />}
      {rows.length > 0 && (
        <DataTable testId="leads-table" rowTestId="lead-row" rows={rows} columns={columns} rowKey={(l) => l.id} minWidth={720}
          onRowClick={(l) => a.navigate({ screen: 'leads', id: l.id })} dimRow={(l) => a.handled.has(l.id)}
          defaultSort={{ key: 'created', dir: 'desc' }} />
      )}
      {rows.length > 0 && <div className="am-table-foot"><span className="am-num">{rows.length} / {leads.length}</span></div>}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      {confirmDialog}
    </Page>
  )
}
