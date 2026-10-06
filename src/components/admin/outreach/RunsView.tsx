'use client'
import { useCallback, useEffect, useState } from 'react'
import type { OutreachApi } from '../../../lib/outreach/ui/api'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import { geography, groupRuns, isLive, PAUSE_REASON_LABEL, RUN_GROUPS, RUN_STATUS_META, runActions, runProgress } from '../../../lib/outreach/ui/runs'
import type { RunSummary } from '../../../lib/outreach/ui/types'
import type { RunAction } from '../../../lib/outreach/orchestration/states'
import { Btn, C, Chip, EmptyState, ErrorBox, Loading, Progress, SectionTitle, tableWrap, td, th, useLoad } from './ui'

export function RunStatusChip({ run }: { run: Pick<RunSummary, 'status' | 'status_reason'> }) {
  const m = RUN_STATUS_META[run.status]
  const reason = run.status_reason ? PAUSE_REASON_LABEL[run.status_reason] ?? run.status_reason : m.hint
  return <Chip color={m.color} bg={m.bg} title={reason}>{m.label}</Chip>
}

/** Presentational: runs grouped into active / paused / completed / failed-stopped. */
export function RunsTable({ runs, onOpen, onAction, onDuplicate, busyId, canOperate }: {
  runs: RunSummary[]; onOpen: (id: string) => void; onAction: (run: RunSummary, action: RunAction) => void; onDuplicate?: (run: RunSummary) => void
  busyId?: string | null; canOperate: boolean
}) {
  const groups = groupRuns(runs)
  return (
    <div>
      {RUN_GROUPS.filter((g) => groups[g.key].length > 0).map((g) => (
        <div key={g.key} data-testid={`run-group-${g.key}`}>
          <SectionTitle>{g.label} <span style={{ color: C.faint, fontWeight: 600 }}>({groups[g.key].length})</span></SectionTitle>
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1050 }}>
              <thead>
                <tr>
                  {['Run', 'Status', 'Voortgang', 'Doel', 'Gevonden', 'Onderzocht', 'GOOD_FIT', 'Beslissers', 'E-mails', 'READY', 'Review', 'Kosten', 'Gestart', ''].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {groups[g.key].map((r) => {
                  const p = runProgress(r)
                  const f = r.funnel
                  return (
                    <tr key={r.id} data-testid="run-row">
                      <td style={td}>
                        <button onClick={() => onOpen(r.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: C.ink, fontFamily: 'inherit', fontSize: '.85rem', textAlign: 'left' }}>{r.name}</button>
                        <div style={{ color: C.muted, fontSize: '.75rem' }}>{r.campaign.niche} · {geography(r.campaign)}</div>
                      </td>
                      <td style={td}><RunStatusChip run={r} /></td>
                      <td style={{ ...td, minWidth: 120 }}><Progress pct={p.pct} /><div style={{ fontSize: '.72rem', color: C.muted, marginTop: 3 }}>{p.label}</div></td>
                      <td style={td}>{r.prospect_limit}</td>
                      <td style={td}>{f.discovered}</td>
                      <td style={td}>{f.researched}</td>
                      <td style={td}>{f.good_fit}</td>
                      <td style={td}>{f.decision_makers}</td>
                      <td style={td}>{f.business_emails}</td>
                      <td style={{ ...td, fontWeight: 700, color: f.ready ? C.green : C.text }}>{f.ready}</td>
                      <td style={{ ...td, fontWeight: 700, color: f.needs_review ? C.amber : C.text }}>{f.needs_review}</td>
                      <td style={td}>{eur(r.spent_eur)}<div style={{ fontSize: '.72rem', color: C.faint }}>van {eur(r.budget_cap_eur)}</div></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{dateTime(r.started_at ?? r.created_at)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn small onClick={() => onOpen(r.id)}>Open</Btn>
                          {runActions(r).filter((a) => canOperate || a.action === 'pause' || a.action === 'stop').map((a) => (
                            <Btn key={a.action} small kind={a.action === 'stop' ? 'danger' : 'secondary'} disabled={busyId === r.id} onClick={() => onAction(r, a.action)}>{a.label}</Btn>
                          ))}
                          {onDuplicate && canOperate && <Btn small kind="ghost" onClick={() => onDuplicate(r)} title="Nieuwe run met dezelfde instellingen">Dupliceer</Btn>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Container: loads runs, polls while something is running, performs actions via the Stage 2 API. */
export function RunsView({ api, onOpen, onNew, onDuplicate, canOperate }: {
  api: OutreachApi; onOpen: (id: string) => void; onNew: () => void; onDuplicate: (run: RunSummary) => void; canOperate: boolean
}) {
  const { data: runs, error: loadError, reload } = useLoad(useCallback(() => api.listRuns(), [api]))
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const error = actionError ?? loadError
  const live = !!runs?.some((r) => isLive(r.status))

  useEffect(() => {
    if (!live) return
    const t = setInterval(reload, 8000)
    return () => clearInterval(t)
  }, [live, reload])

  const act = async (run: RunSummary, action: RunAction) => {
    if (action === 'stop' && typeof window !== 'undefined' && !window.confirm(`Run "${run.name}" stoppen? Resterende prospects worden geannuleerd.`)) return
    setBusyId(run.id)
    setActionError(null)
    try {
      await api.runAction(run.id, action)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusyId(null)
      reload()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: '.85rem', color: C.muted }}>Elke run zoekt bedrijven, onderzoekt ze en stelt een mail op. <strong>Er wordt niets verzonden.</strong></div>
        {canOperate && <Btn kind="primary" onClick={onNew}>+ Nieuwe run</Btn>}
      </div>
      {error && <ErrorBox message={error} onRetry={() => { setActionError(null); reload() }} />}
      {runs === null && !error && <Loading />}
      {runs && runs.length === 0 && (
        <EmptyState title="Nog geen runs" text="Start een run om bedrijven te laten onderzoeken." action={canOperate ? <Btn kind="primary" onClick={onNew}>+ Nieuwe run</Btn> : undefined} />
      )}
      {runs && runs.length > 0 && <RunsTable runs={runs} onOpen={onOpen} onAction={act} onDuplicate={onDuplicate} busyId={busyId} canOperate={canOperate} />}
    </div>
  )
}
