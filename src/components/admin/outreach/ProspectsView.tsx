'use client'
import { useCallback, useEffect, useState } from 'react'
import type { OutreachApi } from '../../../lib/outreach/ui/api'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import { EMAIL_OPTIONS, EMPTY_FILTERS, FIT_META, lifecycle, OUTCOME_META, pageCount, PAGE_SIZE, STATUS_OPTIONS, STEP_LABEL, verificationLabel, type ProspectFilters } from '../../../lib/outreach/ui/prospects'
import type { Page, ProspectListItem, RunSummary } from '../../../lib/outreach/ui/types'
import { Btn, C, Chip, EmptyState, ErrorBox, input, Loading, tableWrap, td, th, useLoad } from './ui'

const toneColor = { good: [C.green, C.greenBg], warn: [C.amber, C.amberBg], bad: [C.red, C.redBg], none: [C.muted, '#F1F5F9'] } as const

export function LifecycleChip({ p }: { p: Pick<ProspectListItem, 'outcome' | 'queue_state' | 'current_step'> }) {
  const key = lifecycle(p)
  const m = OUTCOME_META[key] ?? { label: key, color: C.muted, bg: '#F1F5F9' }
  return <Chip color={m.color} bg={m.bg} title={p.queue_state === 'IN_PROGRESS' ? STEP_LABEL[p.current_step] : undefined}>{p.queue_state === 'IN_PROGRESS' ? `Bezig · ${STEP_LABEL[p.current_step] ?? p.current_step}` : m.label}</Chip>
}

export function FitChip({ fit }: { fit: ProspectListItem['fit'] }) {
  if (!fit) return <span style={{ color: C.faint }}>—</span>
  const m = FIT_META[fit]
  return <Chip color={m.color} bg={m.bg}>{fit}</Chip>
}

/** Presentational table. */
export function ProspectsTable({ items, onOpen }: { items: ProspectListItem[]; onOpen: (id: string) => void }) {
  return (
    <div style={tableWrap}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
        <thead><tr>{['Bedrijf', 'Locatie', 'Run', 'Fit', 'Beslisser', 'Rol', 'E-mail', 'Verificatie', 'Status', 'Kosten', 'Laatste activiteit'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {items.map((p) => {
            const v = verificationLabel(p.verification_status, p.eligibility)
            const [vc, vb] = toneColor[v.tone]
            return (
              <tr key={p.id} data-testid="prospect-row">
                <td style={td}>
                  <button onClick={() => onOpen(p.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: C.ink, fontFamily: 'inherit', fontSize: '.84rem', textAlign: 'left' }}>{p.company_name}</button>
                  <div style={{ color: C.faint, fontSize: '.72rem' }}>{p.domain}</div>
                </td>
                <td style={td}>{p.city ?? '—'}</td>
                <td style={{ ...td, maxWidth: 160 }}>{p.run_name}</td>
                <td style={td}><FitChip fit={p.fit} /></td>
                <td style={td}>{p.contact_name ?? '—'}</td>
                <td style={{ ...td, maxWidth: 140 }}>{p.contact_title ?? '—'}</td>
                <td style={{ ...td, wordBreak: 'break-all' }}>{p.email ?? '—'}</td>
                <td style={td}>{p.email && p.verification_status ? <Chip color={vc} bg={vb}>{v.label}</Chip> : '—'}</td>
                <td style={td}><LifecycleChip p={p} /></td>
                <td style={td}>{eur(p.spent_eur)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{dateTime(p.updated_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ProspectsView({ api, runs, initialRunId, onOpen }: { api: OutreachApi; runs: RunSummary[]; initialRunId?: string | null; onOpen: (id: string) => void }) {
  // Filters and page live together so changing a filter always returns to page 1.
  const [query, setQuery] = useState<{ filters: ProspectFilters; page: number }>({ filters: { ...EMPTY_FILTERS, run_id: initialRunId ?? '' }, page: 0 })
  const { filters, page } = query
  const [draft, setDraft] = useState({ q: '', location: '' })
  const { data, error, reload } = useLoad<Page<ProspectListItem>>(useCallback(() => api.listProspects(filters, page), [api, filters, page]))
  const setFilters = (update: (f: ProspectFilters) => ProspectFilters) => setQuery((q) => {
    const next = update(q.filters)
    return next === q.filters ? q : { filters: next, page: 0 }
  })
  const setPage = (update: (p: number) => number) => setQuery((q) => ({ ...q, page: update(q.page) }))
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.filters.q === draft.q && q.filters.location === draft.location ? q : { filters: { ...q.filters, q: draft.q, location: draft.location }, page: 0 })), 350)
    return () => clearTimeout(t)
  }, [draft])

  const set = <K extends keyof ProspectFilters>(k: K, v: ProspectFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const pages = data ? pageCount(data.total) : 1
  return (
    <div>
      <div data-testid="prospect-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <input style={{ ...input, flex: '2 1 200px' }} placeholder="Zoek bedrijf, domein, e-mail, naam…" value={draft.q} onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} />
        <select style={input} value={filters.run_id} onChange={(e) => set('run_id', e.target.value)}>
          <option value="">Alle runs</option>
          {runs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select style={input} value={filters.fit} onChange={(e) => set('fit', e.target.value as ProspectFilters['fit'])}>
          <option value="">Alle fits</option><option value="GOOD_FIT">GOOD_FIT</option><option value="POSSIBLE_FIT">POSSIBLE_FIT</option><option value="SKIP">SKIP</option>
        </select>
        <select style={input} value={filters.status} onChange={(e) => set('status', e.target.value as ProspectFilters['status'])}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select style={input} value={filters.email} onChange={(e) => set('email', e.target.value as ProspectFilters['email'])}>
          {EMAIL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input style={{ ...input, flex: '1 1 120px' }} placeholder="Locatie" value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
        <Btn small kind="ghost" onClick={() => { setDraft({ q: '', location: '' }); setFilters(() => EMPTY_FILTERS) }}>Wis filters</Btn>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && <EmptyState title="Geen prospects gevonden" text={Object.values(filters).some(Boolean) ? 'Pas de filters aan.' : 'Prospects verschijnen hier zodra een run bedrijven heeft onderzocht.'} />}
      {data && data.items.length > 0 && (
        <>
          <ProspectsTable items={data.items} onOpen={onOpen} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: '.8rem', color: C.muted }}>
            <span>{data.total} prospects · pagina {page + 1} van {pages} · {PAGE_SIZE} per pagina</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <Btn small disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Vorige</Btn>
              <Btn small disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Volgende →</Btn>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
