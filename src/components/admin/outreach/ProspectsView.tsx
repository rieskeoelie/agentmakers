'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  ActiveFilters, Button, DataTable, EmptyState, ErrorState, FilterBar, FilterSelect, Pagination, SearchInput, Status, TableSkeleton, useLoad, type Column,
} from '../ds'
import { useAdmin } from '../app/AdminContext'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import { EMAIL_OPTIONS, EMPTY_FILTERS, lifecycle, OUTCOME_META, pageCount, PAGE_SIZE, STATUS_OPTIONS, STEP_LABEL, verificationLabel, type ProspectFilters } from '../../../lib/outreach/ui/prospects'
import type { Page, ProspectListItem, RunSummary } from '../../../lib/outreach/ui/types'
import { FIT_TONE, OUTCOME_TONE, VERIFY_TONE } from './tones'

export function LifecycleChip({ p }: { p: Pick<ProspectListItem, 'outcome' | 'queue_state' | 'current_step'> }) {
  const key = lifecycle(p)
  if (p.queue_state === 'IN_PROGRESS') return <Status tone="info" title={STEP_LABEL[p.current_step]}>Bezig · {STEP_LABEL[p.current_step] ?? p.current_step}</Status>
  return <Status tone={OUTCOME_TONE[key] ?? 'neutral'}>{OUTCOME_META[key]?.label ?? key}</Status>
}

export function FitChip({ fit }: { fit: ProspectListItem['fit'] }) {
  if (!fit) return <span className="am-faint">—</span>
  return <Status tone={FIT_TONE[fit]}>{fit}</Status>
}

export function VerificationChip({ status, eligibility }: { status: string | null; eligibility: string | null }) {
  if (!status) return <span className="am-faint">—</span>
  const v = verificationLabel(status, eligibility)
  return <Status tone={VERIFY_TONE[v.tone]}>{v.label}</Status>
}

/** Presentational, dense prospects table. */
export function ProspectsTable({ items, onOpen }: { items: ProspectListItem[]; onOpen: (id: string) => void }) {
  const columns: Array<Column<ProspectListItem>> = [
    { key: 'co', header: 'Bedrijf', sort: (p) => p.company_name.toLowerCase(), render: (p) => <div style={{ minWidth: 160, maxWidth: 210 }}><span className="am-cell-primary am-truncate" style={{ display: 'block' }} title={p.company_name}>{p.company_name}</span><span className="am-cell-secondary am-truncate" style={{ display: 'block' }}>{[p.city, p.domain].filter(Boolean).join(' · ')}</span></div> },
    { key: 'run', hide: 'md', header: 'Run', sort: (p) => p.run_name, render: (p) => <span className="am-muted am-truncate" style={{ display: 'block', maxWidth: 160 }} title={p.run_name}>{p.run_name}</span> },
    { key: 'dm', header: 'Beslisser', sort: (p) => p.contact_name ?? '', render: (p) => p.contact_name
      ? <div style={{ maxWidth: 150 }}><span className="am-cell-primary am-truncate" style={{ display: 'block' }}>{p.contact_name}</span><span className="am-cell-secondary am-truncate" style={{ display: 'block' }} title={p.contact_title ?? undefined}>{p.contact_title ?? 'Rol onbekend'}</span></div>
      : <span className="am-faint">—</span> },
    { key: 'email', header: 'E-mail', render: (p) => p.email
      ? <div style={{ maxWidth: 200 }}><span className="am-truncate" style={{ display: 'block', marginBottom: 2 }} title={p.email}>{p.email}</span><VerificationChip status={p.verification_status} eligibility={p.eligibility} /></div>
      : <span className="am-faint">—</span> },
    { key: 'st', header: 'Status · fit', nowrap: true, sort: (p) => lifecycle(p), render: (p) => <div className="am-stack" style={{ gap: 2, alignItems: 'flex-start' }}><LifecycleChip p={p} />{p.fit && <FitChip fit={p.fit} />}</div> },
    { key: 'cost', hide: 'lg', header: 'Kosten', align: 'right', sort: (p) => Number(p.spent_eur), render: (p) => <span className="am-num am-muted">{eur(p.spent_eur)}</span> },
    { key: 'upd', hide: 'md', header: 'Bijgewerkt', nowrap: true, sort: (p) => p.updated_at, render: (p) => <span className="am-num am-muted">{dateTime(p.updated_at)}</span> },
  ]
  return <DataTable testId="prospects-table" rowTestId="prospect-row" rows={items} columns={columns} rowKey={(p) => p.id} onRowClick={(p) => onOpen(p.id)} />
}

const FIT_OPTIONS: Array<{ value: ProspectFilters['fit']; label: string }> = [
  { value: '', label: 'Alle fits' }, { value: 'GOOD_FIT', label: 'GOOD_FIT' }, { value: 'POSSIBLE_FIT', label: 'POSSIBLE_FIT' }, { value: 'SKIP', label: 'SKIP' },
]

export function ProspectsView({ initialRunId }: { initialRunId: string | null }) {
  const a = useAdmin()
  const [runs, setRuns] = useState<RunSummary[]>([])
  useEffect(() => { a.api.listRuns().then(setRuns, () => setRuns([])) }, [a.api])
  // Filters and page live together so changing a filter always returns to page 1.
  const [query, setQuery] = useState<{ filters: ProspectFilters; page: number }>({ filters: { ...EMPTY_FILTERS, run_id: initialRunId ?? '' }, page: 0 })
  const { filters, page } = query
  const [draft, setDraft] = useState({ q: '', location: '' })
  const { data, error, reload } = useLoad<Page<ProspectListItem>>(useCallback(() => a.api.listProspects(filters, page), [a.api, filters, page]))
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.filters.q === draft.q && q.filters.location === draft.location ? q : { filters: { ...q.filters, q: draft.q, location: draft.location }, page: 0 })), 300)
    return () => clearTimeout(t)
  }, [draft])

  const set = <K extends keyof ProspectFilters>(k: K, v: ProspectFilters[K]) => setQuery((q) => ({ filters: { ...q.filters, [k]: v }, page: 0 }))
  const clearAll = () => { setDraft({ q: '', location: '' }); setQuery({ filters: EMPTY_FILTERS, page: 0 }) }
  const runName = runs.find((r) => r.id === filters.run_id)?.name ?? 'Run'
  const chips = [
    filters.q && { key: 'q', label: `“${filters.q}”`, onRemove: () => setDraft((d) => ({ ...d, q: '' })) },
    filters.run_id && { key: 'run', label: `Run: ${runName}`, onRemove: () => set('run_id', '') },
    filters.fit && { key: 'fit', label: `Fit: ${filters.fit}`, onRemove: () => set('fit', '') },
    filters.status && { key: 'status', label: `Status: ${STATUS_OPTIONS.find((o) => o.value === filters.status)?.label}`, onRemove: () => set('status', '') },
    filters.email && { key: 'email', label: EMAIL_OPTIONS.find((o) => o.value === filters.email)?.label ?? filters.email, onRemove: () => set('email', '') },
    filters.location && { key: 'loc', label: `Locatie: ${filters.location}`, onRemove: () => setDraft((d) => ({ ...d, location: '' })) },
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>
  const pages = data ? pageCount(data.total) : 1

  return (
    <div>
      <FilterBar testId="prospect-filters">
        <SearchInput value={draft.q} onChange={(v) => setDraft((d) => ({ ...d, q: v }))} placeholder="Bedrijf, domein, e-mail, naam…" label="Zoek prospects" />
        <FilterSelect label="Run" value={filters.run_id} onChange={(v) => set('run_id', v)} options={[{ value: '', label: 'Alle runs' }, ...runs.map((r) => ({ value: r.id, label: r.name }))]} />
        <FilterSelect label="Fit" value={filters.fit} onChange={(v) => set('fit', v)} options={FIT_OPTIONS} />
        <FilterSelect label="Status" value={filters.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} />
        <FilterSelect label="E-mailstatus" value={filters.email} onChange={(v) => set('email', v)} options={EMAIL_OPTIONS} />
        <input className="am-input" style={{ width: 140 }} aria-label="Locatie" placeholder="Locatie" value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
      </FilterBar>
      <ActiveFilters items={chips} onClearAll={clearAll} />
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <TableSkeleton cols={9} rows={8} />}
      {data && data.items.length === 0 && (
        chips.length
          ? <EmptyState icon="search" title="Geen prospects met deze filters" action={<Button onClick={clearAll}>Filters wissen</Button>} />
          : <EmptyState icon="users" title="Nog geen prospects" text="Prospects verschijnen hier zodra een run bedrijven heeft onderzocht." />
      )}
      {data && data.items.length > 0 && (
        <>
          <ProspectsTable items={data.items} onOpen={(id) => a.navigate({ screen: 'outreach', view: 'prospect', id })} />
          <Pagination page={page} pages={pages} total={data.total} label={`prospects · ${PAGE_SIZE} per pagina`} onPage={(p) => setQuery((q) => ({ ...q, page: p }))} />
        </>
      )}
    </div>
  )
}
