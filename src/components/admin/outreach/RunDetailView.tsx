'use client'
import { useCallback, useEffect, useState } from 'react'
import type { OutreachApi } from '../../../lib/outreach/ui/api'
import { dateTime, duration, eur } from '../../../lib/outreach/ui/format'
import { STEP_LABEL } from '../../../lib/outreach/ui/prospects'
import { reasonLabel } from '../../../lib/outreach/ui/review'
import { budgetUse, funnelSteps, geography, isLive, PAUSE_REASON_LABEL, RUN_STATUS_META, runActions, runProgress } from '../../../lib/outreach/ui/runs'
import type { RunOverview, TimelineEvent } from '../../../lib/outreach/ui/types'
import { MODE_COPY } from '../../../lib/outreach/ui/newRun'
import type { RunAction } from '../../../lib/outreach/orchestration/states'
import { RunStatusChip } from './RunsView'
import { RunSendingSection } from './SendingPanel'
import { Btn, C, ErrorBox, KeyValue, Loading, panel, Progress, SectionTitle, tableWrap, td, th, useLoad } from './ui'

const EVENT_LABEL: Record<string, string> = {
  RUN_CREATED: 'Run aangemaakt', RUN_STATUS: 'Status gewijzigd', RUN_BUDGET: 'Budget gewijzigd', RUN_MODE: 'Modus gewijzigd', SETUP_CLAIMED: 'Bedrijven zoeken gestart',
  SETUP_DONE: 'Bedrijven gevonden', SETUP_FAILED: 'Opzetten mislukt', SETUP_RETRY_SCHEDULED: 'Opzetten opnieuw ingepland', SETUP_LEASE_EXPIRED: 'Opzetten hervat na onderbreking',
  PROSPECT_CLAIMED: 'Prospect gestart', PROSPECT_DONE: 'Prospect verwerkt', PROSPECT_FAILED: 'Prospect mislukt', PROSPECT_RETRY_SCHEDULED: 'Prospect opnieuw ingepland',
  PROSPECT_LEASE_EXPIRED: 'Prospect hervat na onderbreking', PROSPECT_BLOCKED: 'Prospect geblokkeerd', REVIEW_DECISION: 'Reviewbesluit', REVIEW_APPROVAL_REFUSED: 'Goedkeuring geweigerd',
}

export function eventText(e: TimelineEvent): string {
  const d = (e.data ?? {}) as Record<string, unknown>
  const base = EVENT_LABEL[e.type] ?? e.type
  if (e.type === 'RUN_STATUS') return `${base}: ${String(d.from ?? '?')} → ${String(d.to ?? '?')}${d.reason ? ` (${String(d.reason)})` : ''}`
  if (e.type === 'PROSPECT_DONE' || e.type === 'REVIEW_DECISION') return `${base}: ${String(d.outcome ?? d.decision ?? '')}`
  if (e.type === 'SETUP_DONE') return `${base}: ${String(d.selected ?? '?')} geselecteerd van ${String(d.returned ?? '?')}`
  if (d.error) return `${base}: ${String(d.error).slice(0, 140)}`
  return base
}

/** Presentational run detail: status, funnel, budget, errors, blocked prospects, recent activity. */
export function RunDetailBody({ data, onAction, onOpenProspect, busy, canOperate, now }: {
  data: RunOverview; onAction: (a: RunAction) => void; onOpenProspect: (id: string) => void; busy?: boolean; canOperate: boolean; now?: number
}) {
  const r = data.run
  const p = runProgress(r)
  const meta = RUN_STATUS_META[r.status]
  const steps = funnelSteps(r.funnel)
  const max = Math.max(1, ...steps.map((s) => s.value))
  const actions = runActions(r).filter((a) => canOperate || a.action === 'pause' || a.action === 'stop')
  return (
    <div>
      <div style={{ ...panel, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.15rem', margin: 0 }}>{r.name}</h2>
            <RunStatusChip run={r} />
          </div>
          <div data-testid="run-status-text" style={{ fontSize: '.85rem', color: C.text, marginTop: 4 }}>
            {r.status_reason ? (PAUSE_REASON_LABEL[r.status_reason] ?? r.status_reason) : meta.hint}
            {r.status === 'RUNNING' && r.funnel.in_progress > 0 && <> · {r.funnel.in_progress} bezig, {r.funnel.pending} in wachtrij</>}
          </div>
          <div style={{ fontSize: '.78rem', color: C.muted, marginTop: 2 }}>{r.campaign.niche} · {geography(r.campaign)} · {MODE_COPY[r.sending_mode ?? 'REVIEW_BEFORE_SENDING'].label}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {actions.map((a) => <Btn key={a.action} kind={a.action === 'stop' ? 'danger' : a.action === 'resume' || a.action === 'start' ? 'primary' : 'secondary'} disabled={busy} onClick={() => onAction(a.action)}>{a.label}</Btn>)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
        <div style={panel}>
          <div style={{ fontSize: '.75rem', color: C.muted, fontWeight: 700 }}>VOORTGANG</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, margin: '4px 0 6px' }}>{p.pct === null ? '—' : `${p.pct}%`}</div>
          <Progress pct={p.pct} /><div style={{ fontSize: '.75rem', color: C.muted, marginTop: 4 }}>{p.label}</div>
        </div>
        <div style={panel}>
          <div style={{ fontSize: '.75rem', color: C.muted, fontWeight: 700 }}>KOSTEN</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, margin: '4px 0 6px' }}>{eur(r.spent_eur)} <span style={{ fontSize: '.8rem', color: C.muted, fontWeight: 600 }}>van {eur(r.budget_cap_eur)}</span></div>
          <Progress pct={budgetUse(r)} color={budgetUse(r) >= 90 ? C.red : C.teal} /><div style={{ fontSize: '.75rem', color: C.muted, marginTop: 4 }}>Gereserveerd: {eur(r.reserved_eur)}</div>
        </div>
        <div style={panel}>
          <KeyValue items={[['Gestart', dateTime(r.started_at)], ['Duur', duration(r.started_at, r.finished_at, now)], ['Doel', `${r.prospect_limit} prospects`], ['Aangemaakt', dateTime(r.created_at)]]} />
        </div>
      </div>

      <SectionTitle>Funnel</SectionTitle>
      <div data-testid="run-funnel" style={{ ...panel, display: 'grid', gap: 6 }}>
        {steps.map((s) => (
          <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 48px', alignItems: 'center', gap: 10, fontSize: '.82rem' }}>
            <span style={{ color: C.text, fontWeight: 700 }}>{s.label}</span>
            <div style={{ height: 10, background: '#F1F5F9', borderRadius: 6 }}>
              <div style={{ height: '100%', width: `${Math.round((s.value / max) * 100)}%`, background: s.key === 'needs_review' ? '#F59E0B' : s.key === 'ready' ? '#16A34A' : C.teal, borderRadius: 6 }} />
            </div>
            <span style={{ textAlign: 'right', fontWeight: 800 }}>{s.value}</span>
          </div>
        ))}
        <div style={{ fontSize: '.75rem', color: C.muted, marginTop: 4 }}>
          Ook: {r.funnel.blocked} geblokkeerd · {r.funnel.skipped} overgeslagen · {r.funnel.failed} mislukt{r.funnel.cancelled ? ` · ${r.funnel.cancelled} geannuleerd` : ''}
        </div>
      </div>

      {(r.setup_last_error || data.errors.length > 0) && (
        <>
          <SectionTitle>Fouten</SectionTitle>
          {r.setup_last_error && <div style={{ marginBottom: 8 }}><ErrorBox message={`Opzetten: ${r.setup_last_error}`} /></div>}
          {data.errors.length > 0 && (
            <div style={tableWrap}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Bedrijf', 'Status', 'Pogingen', 'Fout'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{data.errors.map((e) => (
                <tr key={e.id}><td style={td}><button onClick={() => onOpenProspect(e.id)} style={{ background: 'none', border: 'none', padding: 0, color: C.teal, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>{e.company_name}</button></td>
                  <td style={td}>{e.queue_state === 'FAILED' ? 'Definitief mislukt' : 'Wordt opnieuw geprobeerd'}</td><td style={td}>{e.attempts}</td><td style={{ ...td, color: C.red }}>{e.last_error}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}

      {data.blocked.length > 0 && (
        <>
          <SectionTitle>Geblokkeerd ({data.blocked.length})</SectionTitle>
          <div style={tableWrap}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Bedrijf', 'Reden'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{data.blocked.map((b) => (
              <tr key={b.id}><td style={td}><button onClick={() => onOpenProspect(b.id)} style={{ background: 'none', border: 'none', padding: 0, color: C.teal, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>{b.company_name}</button></td>
                <td style={td}>{b.reasons.map(reasonLabel).join(' · ')}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      <SectionTitle>Recente activiteit</SectionTitle>
      <div style={{ ...panel, padding: 0 }}>
        {data.recent_events.filter((e) => e.type !== 'PROSPECT_CLAIMED').length === 0 ? <div style={{ padding: 12, color: C.muted, fontSize: '.82rem' }}>Nog geen activiteit.</div> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {data.recent_events.filter((e) => e.type !== 'PROSPECT_CLAIMED').slice(0, 15).map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: 12, padding: '7px 12px', borderBottom: '1px solid #F1F5F9', fontSize: '.8rem' }}>
                <span style={{ color: C.faint, whiteSpace: 'nowrap' }}>{dateTime(e.created_at)}</span><span>{eventText(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {r.status === 'RUNNING' && <div style={{ fontSize: '.75rem', color: C.faint, marginTop: 8 }}>Stappen per prospect: {Object.values(STEP_LABEL).join(' → ')}</div>}
    </div>
  )
}

/** Container: polls every 5 s while the run is live. */
export function RunDetailView({ api, runId, onBack, onOpenProspects, onOpenProspect, canOperate }: {
  api: OutreachApi; runId: string; onBack: () => void; onOpenProspects: (runId: string) => void; onOpenProspect: (id: string) => void; canOperate: boolean
}) {
  const { data, error: loadError, reload } = useLoad<RunOverview>(useCallback(() => api.getRun(runId), [api, runId]))
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const error = actionError ?? loadError
  const live = !!data && isLive(data.run.status)
  useEffect(() => {
    if (!live) return
    const t = setInterval(reload, 5000)
    return () => clearInterval(t)
  }, [live, reload])

  const act = async (a: RunAction) => {
    if (a === 'stop' && typeof window !== 'undefined' && !window.confirm('Run stoppen? Resterende prospects worden geannuleerd.')) return
    setBusy(true)
    setActionError(null)
    try { await api.runAction(runId, a) } catch (e) { setActionError((e as Error).message) } finally { setBusy(false); reload() }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Btn kind="ghost" onClick={onBack}>← Runs</Btn>
        <Btn kind="ghost" onClick={() => onOpenProspects(runId)}>Prospects van deze run →</Btn>
      </div>
      {error && <div style={{ marginBottom: 10 }}><ErrorBox message={error} onRetry={() => { setActionError(null); reload() }} /></div>}
      {!data && !error && <Loading />}
      {data && <RunDetailBody data={data} onAction={act} onOpenProspect={onOpenProspect} busy={busy} canOperate={canOperate} />}
      {data && data.run.status !== 'CREATED' && <RunSendingSection api={api} runId={runId} canOperate={canOperate} onOpenProspect={onOpenProspect} />}
    </div>
  )
}
