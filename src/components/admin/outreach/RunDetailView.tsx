'use client'
import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import {
  Bar, BlockSkeleton, Button, Callout, DataTable, ErrorState, KeyValue, LinkButton, Menu, Metrics, Page, PageHeader, Section, useLoad, type Column,
} from '../ds'
import { useAdmin } from '../app/AdminContext'
import { dateTime, duration, eur } from '../../../lib/outreach/ui/format'
import { reasonLabel } from '../../../lib/outreach/ui/review'
import { activeFunnelIndex, budgetUse, geography, isLive, ownerActiveFunnelIndex, PAUSE_REASON_LABEL, runActions, runProgress, runStatusHint } from '../../../lib/outreach/ui/runs'
import { EMPTY_FILTERS } from '../../../lib/outreach/ui/prospects'
import type { ProspectListItem, RunOverview, TimelineEvent } from '../../../lib/outreach/ui/types'
import { isOwnerRun, MODE_COPY } from '../../../lib/outreach/ui/newRun'
import type { RunAction } from '../../../lib/outreach/orchestration/states'
import { RunStatus, useRunActions } from './RunsView'
import { RunActivity } from './RunActivity'
import type { OutcomeCounts, ProspectReasons } from './activity'
import { RunSendingSection } from './SendingPanel'
import { RunFunnelChart } from './RunFunnelChart'
import { OwnerRunBody } from './OwnerRunDetail'
import { eventLabel } from './tones'

const EVENT_LABEL: Record<string, string> = {
  RUN_CREATED: 'Run aangemaakt', RUN_STATUS: 'Status gewijzigd', RUN_BUDGET: 'Budget gewijzigd', RUN_MODE: 'Modus gewijzigd', SETUP_CLAIMED: 'Bedrijven zoeken gestart',
  SETUP_DONE: 'Bedrijven gevonden', SETUP_FAILED: 'Opzetten mislukt', SETUP_RETRY_SCHEDULED: 'Opzetten opnieuw ingepland', SETUP_LEASE_EXPIRED: 'Opzetten hervat na onderbreking',
  PROSPECT_CLAIMED: 'Prospect gestart', PROSPECT_DONE: 'Prospect verwerkt', PROSPECT_FAILED: 'Prospect mislukt', PROSPECT_RETRY_SCHEDULED: 'Prospect opnieuw ingepland',
  PROSPECT_LEASE_EXPIRED: 'Prospect hervat na onderbreking', PROSPECT_BLOCKED: 'Prospect geblokkeerd', REVIEW_DECISION: 'Reviewbesluit', REVIEW_APPROVAL_REFUSED: 'Goedkeuring geweigerd',
}

export function eventText(e: TimelineEvent): string {
  const d = (e.data ?? {}) as Record<string, unknown>
  const base = EVENT_LABEL[e.type] ?? eventLabel(e.type)
  if (e.type === 'RUN_STATUS') return `${base}: ${String(d.from ?? '?')} → ${String(d.to ?? '?')}${d.reason ? ` (${String(d.reason)})` : ''}`
  if (e.type === 'PROSPECT_DONE' || e.type === 'REVIEW_DECISION') return `${base}: ${String(d.outcome ?? d.decision ?? '')}`
  if (e.type === 'SETUP_DONE') return `${base}: ${String(d.selected ?? '?')} geselecteerd van ${String(d.returned ?? '?')}`
  if (d.error) return `${base}: ${String(d.error).slice(0, 140)}`
  return base
}

export { RunFunnelChart }

type ErrRow = RunOverview['errors'][number]
type BlockedRow = RunOverview['blocked'][number]

/** Presentational run detail body: metrics, funnel, blockers/errors, cost and activity. */
export function RunDetailBody({ data, onOpenProspect, onOpenProspects, now, sending, activeIndex = null, names = {}, outcomes, reasons, prospects }: {
  data: RunOverview; sending?: ReactNode; activeIndex?: number | null; names?: Record<string, string>; outcomes?: OutcomeCounts; reasons?: ProspectReasons; onAction?: (a: RunAction) => void; onOpenProspect: (id: string) => void; onOpenProspects?: () => void; busy?: boolean; canOperate?: boolean; now?: number
  /** The run's own prospects (Owner Discovery results table). */
  prospects?: ProspectListItem[] | null
}) {
  if (isOwnerRun(data.run)) {
    return <OwnerRunBody data={data} prospects={prospects} activeIndex={activeIndex} names={names} outcomes={outcomes} reasons={reasons}
      onOpenProspect={onOpenProspect} onOpenProspects={onOpenProspects} now={now} />
  }
  const r = data.run
  const p = runProgress(r)
  const used = budgetUse(r)

  const errCols: Array<Column<ErrRow>> = [
    { key: 'co', header: 'Bedrijf', render: (e) => <LinkButton onClick={() => onOpenProspect(e.id)}>{e.company_name}</LinkButton> },
    { key: 'st', header: 'Status', nowrap: true, render: (e) => <span className="am-muted">{e.queue_state === 'FAILED' ? 'Definitief mislukt' : 'Wordt opnieuw geprobeerd'}</span> },
    { key: 'at', header: 'Pogingen', align: 'right', render: (e) => <span className="am-num">{e.attempts}</span> },
    { key: 'err', header: 'Fout', render: (e) => <span style={{ color: 'var(--am-red)' }}>{e.last_error}</span> },
  ]
  const blockedCols: Array<Column<BlockedRow>> = [
    { key: 'co', header: 'Bedrijf', render: (b) => <LinkButton onClick={() => onOpenProspect(b.id)}>{b.company_name}</LinkButton> },
    { key: 'why', header: 'Reden', render: (b) => <span className="am-muted">{b.reasons.map(reasonLabel).join(' · ')}</span> },
  ]

  return (
    <div>
      <Metrics testId="run-metrics" items={[
        { label: 'Voortgang', value: p.pct === null ? '—' : `${p.pct}%`, sub: p.label },
        { label: 'Geselecteerd', value: r.funnel.selected, sub: `doel ${r.prospect_limit}` },
        { label: 'READY', value: r.funnel.ready, tone: r.funnel.ready ? 'success' : undefined },
        { label: 'Review nodig', value: r.funnel.needs_review, tone: r.funnel.needs_review ? 'warning' : undefined },
        { label: 'Geblokkeerd', value: r.funnel.blocked, tone: r.funnel.blocked ? 'danger' : undefined },
        { label: 'Kosten', value: eur(r.spent_eur), sub: `van ${eur(r.budget_cap_eur)} · ${used}%`, tone: used >= 90 ? 'danger' : undefined },
      ]} />

      <div className="am-split" data-aside="wide" style={{ marginTop: 24 }}>
        <div>
          <Section title="Funnel" aside={onOpenProspects ? <LinkButton onClick={onOpenProspects}>Alle prospects van deze run →</LinkButton> : undefined}>
            <div className="am-panel am-panel-pad" data-testid="run-funnel">
              <RunFunnelChart funnel={r.funnel} activeIndex={activeIndex} />
              <p className="am-faint" style={{ margin: '12px 0 0', fontSize: 12 }}>
                Ook: {r.funnel.blocked} geblokkeerd · {r.funnel.skipped} overgeslagen · {r.funnel.failed} mislukt{r.funnel.cancelled ? ` · ${r.funnel.cancelled} geannuleerd` : ''}
              </p>
            </div>
          </Section>

          {(r.setup_last_error || data.errors.length > 0) && (
            <Section title="Fouten" testId="run-errors">
              {r.setup_last_error && <div style={{ marginBottom: 12 }}><Callout tone="danger" title="Opzetten mislukt">{r.setup_last_error}</Callout></div>}
              {data.errors.length > 0 && <DataTable rows={data.errors} columns={errCols} rowKey={(e) => e.id} minWidth={560} />}
            </Section>
          )}

          {data.blocked.length > 0 && (
            <Section title={`Geblokkeerd (${data.blocked.length})`} description="Deze prospects kunnen niet worden benaderd." testId="run-blocked">
              <DataTable rows={data.blocked} columns={blockedCols} rowKey={(b) => b.id} minWidth={480} />
            </Section>
          )}

          {sending}
        </div>

        <aside>
          <Section title="Details">
            <div className="am-panel am-panel-pad">
              <KeyValue items={[
                ['Niche', r.campaign.niche], ['Regio', geography(r.campaign)], ['Modus', MODE_COPY[r.sending_mode ?? 'REVIEW_BEFORE_SENDING'].label],
                ['Gestart', dateTime(r.started_at)], ['Duur', duration(r.started_at, r.finished_at, now)], ['Aangemaakt', dateTime(r.created_at)],
              ]} />
            </div>
          </Section>
          <Section title="Kosten">
            <div className="am-panel am-panel-pad am-stack">
              <div className="am-inline" style={{ justifyContent: 'space-between' }}><span className="am-strong am-num">{eur(r.spent_eur)}</span><span className="am-muted am-num">van {eur(r.budget_cap_eur)}</span></div>
              <Bar pct={used} tone={used >= 90 ? 'danger' : undefined} />
              <span className="am-faint am-num" style={{ fontSize: 12 }}>Gereserveerd: {eur(r.reserved_eur)} · beschikbaar {eur(r.budget_available_eur)}</span>
            </div>
          </Section>
          <Section title="Activiteit">
            <div className="am-panel am-panel-pad">
              <RunActivity events={data.recent_events} funnel={r.funnel} outcomes={outcomes} reasons={reasons} names={names} onOpenProspect={onOpenProspect} />
            </div>
          </Section>
        </aside>
      </div>
    </div>
  )
}

/** Full page: /admin/outreach/runs/:id. Polls every 5 s while the run is live. */
export function RunDetailScreen({ runId }: { runId: string }) {
  const a = useAdmin()
  const { data, error, reload } = useLoad<RunOverview>(useCallback(() => a.api.getRun(runId), [a.api, runId]))
  const { act, busyId, error: actionError, clearError, confirmDialog } = useRunActions(reload)
  const live = !!data && isLive(data.run.status)
  useEffect(() => {
    if (!live) return
    const t = setInterval(reload, 5000)
    return () => clearInterval(t)
  }, [live, reload])

  // Which funnel step is being processed: derived from the run's own prospects (existing endpoint; ≤ 20 per audience
  // run, ≤ 50 per Owner Discovery run). Also gives the activity timeline the company names of its prospects.
  const { data: steps, reload: reloadSteps } = useLoad(useCallback(
    () => a.api.listProspects({ ...EMPTY_FILTERS, run_id: runId }, 0, 50).then((p) => p.items).catch(() => null),
    [a.api, runId]))
  useEffect(() => { if (live) reloadSteps() }, [data, live, reloadSteps])
  const owner = !!data && isOwnerRun(data.run)
  const activeIndex = data ? (owner ? ownerActiveFunnelIndex : activeFunnelIndex)(data.run, data.run.setup_state === 'DONE' ? steps : null) : null
  const names = useMemo(() => Object.fromEntries((steps ?? []).map((p) => [p.id, p.company_name])), [steps])
  const reasons = useMemo<ProspectReasons>(() => Object.fromEntries((steps ?? []).map((p) => [p.id, p.outcome_reasons])), [steps])
  // Outcome counts for the completion summary — only when the full list of the run's prospects is known.
  const outcomes = useMemo(() => {
    if (!steps || !data || steps.length < data.run.funnel.total) return undefined
    const c: OutcomeCounts = {}
    for (const p of steps) if (p.outcome) c[p.outcome] = (c[p.outcome] ?? 0) + 1
    return c
  }, [steps, data])

  const toRuns = () => a.navigate({ screen: 'outreach', view: 'runs' })
  const r = data?.run
  const actions = r ? runActions(r).filter((x) => a.canOperate || x.action === 'pause' || x.action === 'stop') : []
  const primary = actions.find((x) => x.action === 'start' || x.action === 'resume')
  const secondary = actions.filter((x) => x !== primary)

  return (
    <Page>
      <PageHeader breadcrumb={[{ label: 'Outreach', onClick: toRuns }, { label: 'Runs', onClick: toRuns }]}
        title={r ? r.name : 'Run'} status={r ? <RunStatus run={r} /> : undefined}
        subtitle={r ? <span data-testid="run-status-text">{r.status_reason ? (PAUSE_REASON_LABEL[r.status_reason] ?? r.status_reason) : runStatusHint(r)}
          {r.status === 'RUNNING' && r.funnel.in_progress > 0 ? ` ${r.funnel.in_progress} bezig, ${r.funnel.pending} in wachtrij.` : ''}</span> : undefined}
        actions={r ? <>
          <Menu label="Meer acties" items={[
            { label: 'Prospects van deze run', icon: 'users', onSelect: () => a.navigate({ screen: 'outreach', view: 'prospects', runId: r.id }) },
            ...(a.canOperate ? [{ label: 'Dupliceren', icon: 'copy' as const, onSelect: () => a.navigate({ screen: 'outreach', view: 'new', duplicateOf: r.id }) }] : []),
            ...secondary.filter((x) => x.action !== 'pause').map((x, i) => ({ label: x.label, icon: (x.action === 'stop' ? 'stop' : 'pause') as 'stop' | 'pause', tone: x.action === 'stop' ? 'danger' as const : undefined, separatorBefore: i === 0, onSelect: () => void act(r, x.action) })),
          ]} />
          {secondary.some((x) => x.action === 'pause') && <Button icon="pause" loading={busyId === r.id} onClick={() => void act(r, 'pause')}>Pauzeer</Button>}
          {primary && <Button variant="primary" icon="play" loading={busyId === r.id} onClick={() => void act(r, primary.action)}>{primary.label}</Button>}
        </> : undefined} />
      {actionError && <div style={{ marginBottom: 16 }}><Callout tone="danger" action={<Button size="sm" variant="ghost" onClick={clearError}>Sluiten</Button>}>{actionError}</Callout></div>}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <BlockSkeleton lines={8} />}
      {data && <RunDetailBody data={data} activeIndex={activeIndex} names={names} outcomes={outcomes} reasons={reasons} prospects={steps} onOpenProspect={(id) => a.navigate({ screen: 'outreach', view: 'prospect', id })}
        onOpenProspects={() => a.navigate({ screen: 'outreach', view: 'prospects', runId: data.run.id })}
        sending={data.run.status !== 'CREATED' && !owner ? <RunSendingSection runId={data.run.id} onOpenProspect={(id) => a.navigate({ screen: 'outreach', view: 'prospect', id })} /> : undefined} />}
      {confirmDialog}
    </Page>
  )
}
