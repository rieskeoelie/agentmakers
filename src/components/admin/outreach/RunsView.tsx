'use client'
import { useCallback, useEffect, useState } from 'react'
import { Bar, Button, Callout, DataTable, EmptyState, ErrorState, Menu, Status, TableSkeleton, useConfirm, useLoad, type Column, type MenuItem } from '../ds'
import { useAdmin } from '../app/AdminContext'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import { groupRuns, runTargetLabel, isLive, PAUSE_REASON_LABEL, RUN_GROUPS, RUN_STATUS_META, runActions, runProgress } from '../../../lib/outreach/ui/runs'
import type { RunSummary } from '../../../lib/outreach/ui/types'
import type { RunAction } from '../../../lib/outreach/orchestration/states'
import { RUN_TONE } from './tones'

export function RunStatus({ run }: { run: Pick<RunSummary, 'status' | 'status_reason'> }) {
  const m = RUN_STATUS_META[run.status]
  const reason = run.status_reason ? PAUSE_REASON_LABEL[run.status_reason] ?? run.status_reason : m.hint
  return <Status tone={RUN_TONE[run.status]} title={reason}>{m.label}</Status>
}

const ACTION_ICON: Record<RunAction, 'play' | 'pause' | 'stop'> = { start: 'play', resume: 'play', pause: 'pause', stop: 'stop' }

/** Shared run-action handling (confirmation for stop, error surfacing). */
export function useRunActions(onDone: () => void) {
  const { api } = useAdmin()
  const [confirm, confirmDialog] = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (run: Pick<RunSummary, 'id' | 'name'>, action: RunAction) => {
    if (action === 'stop' && !(await confirm({ title: `Run “${run.name}” stoppen?`, description: 'Resterende prospects worden geannuleerd. Dit kan niet worden teruggedraaid.', confirmLabel: 'Stoppen' }))) return
    setBusyId(run.id)
    setError(null)
    try { await api.runAction(run.id, action) } catch (e) { setError((e as Error).message) } finally { setBusyId(null); onDone() }
  }
  return { act, busyId, error, clearError: () => setError(null), confirmDialog }
}

export function runMenuItems(run: RunSummary, canOperate: boolean, act: (r: RunSummary, a: RunAction) => void, nav: { open: () => void; duplicate?: () => void; prospects?: () => void }): MenuItem[] {
  const items: MenuItem[] = [{ label: 'Openen', icon: 'chevronRight', onSelect: nav.open }]
  if (nav.prospects) items.push({ label: 'Prospects bekijken', icon: 'users', onSelect: nav.prospects })
  runActions(run).filter((x) => canOperate || x.action === 'pause' || x.action === 'stop').forEach((x, i) => items.push({
    label: x.label, icon: ACTION_ICON[x.action], tone: x.action === 'stop' ? 'danger' : undefined, separatorBefore: i === 0, onSelect: () => act(run, x.action),
  }))
  if (nav.duplicate && canOperate) items.push({ label: 'Dupliceren', icon: 'copy', separatorBefore: true, onSelect: nav.duplicate })
  return items
}

/** Presentational: runs grouped by state in one table. */
export function RunsTable({ runs, onOpen, onAction, onDuplicate, canOperate }: {
  runs: RunSummary[]; onOpen: (id: string) => void; onAction: (run: RunSummary, action: RunAction) => void; onDuplicate?: (run: RunSummary) => void; canOperate: boolean
}) {
  const groups = groupRuns(runs)
  const columns: Array<Column<RunSummary>> = [
    { key: 'run', header: 'Run', sort: (r) => r.name.toLowerCase(), render: (r) => <div style={{ minWidth: 200 }}><span className="am-cell-primary">{r.name}</span><span className="am-cell-secondary">{runTargetLabel(r.campaign)}</span></div> },
    { key: 'status', header: 'Status', sort: (r) => r.status, nowrap: true, render: (r) => <RunStatus run={r} /> },
    { key: 'progress', header: 'Voortgang', render: (r) => { const p = runProgress(r); return <div style={{ minWidth: 120 }}><Bar pct={p.pct} tone={r.status === 'FAILED' ? 'danger' : r.status === 'PAUSED' ? 'warning' : undefined} /><span className="am-cell-secondary" style={{ marginTop: 3 }}>{p.label}</span></div> } },
    { key: 'selected', hide: 'sm', header: 'Geselecteerd', align: 'right', sort: (r) => r.funnel.selected, render: (r) => <span className="am-num">{r.funnel.selected}<span className="am-faint"> / {r.prospect_limit}</span></span> },
    { key: 'dm', hide: 'md', header: 'Beslissers', align: 'right', sort: (r) => r.funnel.decision_makers, render: (r) => <span className="am-num">{r.funnel.decision_makers}</span> },
    { key: 'ready', header: 'READY', align: 'right', sort: (r) => r.funnel.ready, render: (r) => <span className="am-num" style={{ fontWeight: 600, color: r.funnel.ready ? 'var(--am-green)' : undefined }}>{r.funnel.ready}</span> },
    { key: 'review', header: 'Review', align: 'right', sort: (r) => r.funnel.needs_review, render: (r) => <span className="am-num" style={{ fontWeight: 600, color: r.funnel.needs_review ? 'var(--am-amber)' : undefined }}>{r.funnel.needs_review}</span> },
    { key: 'spend', hide: 'sm', header: 'Kosten', align: 'right', sort: (r) => Number(r.spent_eur), nowrap: true, render: (r) => <span className="am-num">{eur(r.spent_eur)}<span className="am-faint"> / {eur(r.budget_cap_eur)}</span></span> },
    { key: 'started', hide: 'md', header: 'Gestart', sort: (r) => r.started_at ?? r.created_at, nowrap: true, render: (r) => <span className="am-muted am-num">{dateTime(r.started_at ?? r.created_at)}</span> },
    { key: 'act', header: '', shrink: true, render: (r) => <Menu items={runMenuItems(r, canOperate, onAction, { open: () => onOpen(r.id), duplicate: onDuplicate ? () => onDuplicate(r) : undefined })} /> },
  ]
  return (
    <DataTable testId="runs-table" rowTestId="run-row" rows={runs} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => onOpen(r.id)} minWidth={700}
      groups={RUN_GROUPS.map((g) => ({ key: g.key, label: `${g.label} · ${groups[g.key].length}`, rows: groups[g.key] }))} />
  )
}

/** Container: loads runs and polls while one is live. */
export function RunsView() {
  const a = useAdmin()
  const { data: runs, error, reload } = useLoad(useCallback(() => a.api.listRuns(), [a.api]))
  const { act, error: actionError, clearError, confirmDialog } = useRunActions(reload)
  const live = !!runs?.some((r) => isLive(r.status))
  useEffect(() => {
    if (!live) return
    const t = setInterval(reload, 8000)
    return () => clearInterval(t)
  }, [live, reload])

  return (
    <div>
      {actionError && <div style={{ marginBottom: 12 }}><Callout tone="danger" action={<Button size="sm" variant="ghost" onClick={clearError}>Sluiten</Button>}>{actionError}</Callout></div>}
      {error && !runs && <ErrorState message={error} onRetry={reload} />}
      {runs === null && !error && <TableSkeleton cols={8} rows={4} />}
      {runs && runs.length === 0 && (
        <EmptyState icon="target" title="Nog geen runs" text="Een run zoekt bedrijven in een niche en regio, onderzoekt ze en stelt per beslisser een mail op. Een run verstuurt zelf niets."
          action={a.canOperate ? <Button variant="primary" icon="plus" onClick={() => a.navigate({ screen: 'outreach', view: 'new' })}>Nieuwe run</Button> : undefined} />
      )}
      {runs && runs.length > 0 && (
        <RunsTable runs={runs} canOperate={a.canOperate} onAction={(r, x) => void act(r, x)}
          onOpen={(id) => a.navigate({ screen: 'outreach', view: 'run', id })}
          onDuplicate={(r) => a.navigate({ screen: 'outreach', view: 'new', duplicateOf: r.id })} />
      )}
      {confirmDialog}
    </div>
  )
}
