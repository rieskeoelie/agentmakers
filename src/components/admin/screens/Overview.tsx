'use client'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  Bar, Button, Callout, DataTable, EmptyState, Icon, LinkButton, Metrics, Page, PageHeader, Row, Rows, Section, Skeleton, Status, useLoad, type Column, type IconName,
} from '../ds'
import { useAdmin } from '../app/AdminContext'
import { shortDate, type Lead } from '../app/model'
import { dateTime } from '../../../lib/outreach/ui/format'
import { isLive, runProgress } from '../../../lib/outreach/ui/runs'
import type { InboxItem, SendingOverview } from '../../../lib/outreach/ui/sending'
import type { RunSummary } from '../../../lib/outreach/ui/types'
import { ClassChip } from '../outreach/InboxView'
import { RunStatus } from '../outreach/RunsView'
import { Configured, sendingLive } from '../outreach/SendingPanel'
import { SourceStatus } from './Leads'

export interface AttentionItem { key: string; tone: 'danger' | 'warning' | 'info'; icon: IconName; text: ReactNode; action: string; go: () => void }

/** What needs a human today, most urgent first. Pure: derived from already-loaded data. */
export function attentionItems(input: {
  review: number | null; inbox: number | null; newLeads: number; runs: RunSummary[] | null; sending: SendingOverview | null
}, go: { review: () => void; inbox: () => void; leads: () => void; run: (id: string) => void; settings: () => void }): AttentionItem[] {
  const out: AttentionItem[] = []
  const s = input.sending
  if (s && s.config.sending_enabled && s.provider.env_kill_switch) out.push({ key: 'kill', tone: 'danger', icon: 'alert', text: 'Verzenden staat aan, maar de noodstop in de omgeving blokkeert alles.', action: 'Bekijk', go: go.settings })
  if (s && s.config.sending_enabled && !s.provider.smartlead_configured) out.push({ key: 'sl', tone: 'danger', icon: 'alert', text: 'Verzenden staat aan, maar Smartlead is niet geconfigureerd.', action: 'Bekijk', go: go.settings })
  for (const r of input.runs ?? []) {
    if (r.status === 'FAILED') out.push({ key: `f-${r.id}`, tone: 'danger', icon: 'alert', text: <>Run <span className="am-strong">{r.name}</span> is mislukt.</>, action: 'Open run', go: () => go.run(r.id) })
    else if (r.status === 'PAUSED' && r.status_reason === 'BUDGET_EXHAUSTED') out.push({ key: `b-${r.id}`, tone: 'warning', icon: 'pause', text: <>Run <span className="am-strong">{r.name}</span> is gepauzeerd: budget op.</>, action: 'Open run', go: () => go.run(r.id) })
  }
  if (input.inbox) out.push({ key: 'inbox', tone: 'warning', icon: 'inbox', text: `${input.inbox} ${input.inbox === 1 ? 'reactie heeft' : 'reacties hebben'} een antwoord of besluit nodig.`, action: 'Naar inbox', go: go.inbox })
  if (input.review) out.push({ key: 'review', tone: 'info', icon: 'eye', text: `${input.review} ${input.review === 1 ? 'prospect wacht' : 'prospects wachten'} op review.`, action: 'Reviewen', go: go.review })
  if (input.newLeads) out.push({ key: 'leads', tone: 'info', icon: 'users', text: `${input.newLeads} nieuwe ${input.newLeads === 1 ? 'lead' : 'leads'} sinds je laatste bezoek.`, action: 'Bekijk leads', go: go.leads })
  return out
}

export function OverviewScreen() {
  const a = useAdmin()
  const { t } = a
  const runs = useLoad<RunSummary[]>(useCallback(() => a.api.listRuns(), [a.api]))
  const inbox = useLoad<InboxItem[]>(useCallback(() => a.api.inbox('needs_action', '', 0, 5).then((p) => p.items), [a.api]))
  const sending = useLoad<SendingOverview | null>(useCallback(() => a.api.sending().catch(() => null), [a.api]))

  const activeRuns = useMemo(() => (runs.data ?? []).filter((r) => isLive(r.status) || r.status === 'PAUSED' || r.status === 'CREATED'), [runs.data])
  const recentLeads = useMemo(() => [...a.visibleLeads].sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 6), [a.visibleLeads])
  const [weekAgo] = useState(() => Date.now() - 7 * 864e5)
  const leadsThisWeek = a.visibleLeads.filter((l) => Date.parse(l.created_at) >= weekAgo).length
  const s = sending.data
  const live = s ? sendingLive(s) : null
  const go = {
    review: () => a.navigate({ screen: 'outreach', view: 'review' }), inbox: () => a.navigate({ screen: 'inbox' }), leads: () => a.navigate({ screen: 'leads' }),
    run: (id: string) => a.navigate({ screen: 'outreach', view: 'run', id }), settings: () => a.navigate({ screen: 'settings' }),
  }
  const attention = attentionItems({ review: a.counts.review, inbox: a.counts.inbox, newLeads: a.counts.newLeads, runs: runs.data, sending: s }, go)
  const loading = runs.data === null && !runs.error

  const runCols: Array<Column<RunSummary>> = [
    { key: 'n', header: 'Run', render: (r) => <div><span className="am-cell-primary">{r.name}</span><span className="am-cell-secondary">{r.campaign.niche}</span></div> },
    { key: 's', header: 'Status', nowrap: true, render: (r) => <RunStatus run={r} /> },
    { key: 'p', header: 'Voortgang', render: (r) => { const p = runProgress(r); return <div style={{ minWidth: 90 }}><Bar pct={p.pct} tone={r.status === 'PAUSED' ? 'warning' : undefined} /></div> } },
    { key: 'r', header: 'READY', align: 'right', render: (r) => <span className="am-num">{r.funnel.ready}</span> },
    { key: 'v', header: 'Review', align: 'right', render: (r) => <span className="am-num" style={{ color: r.funnel.needs_review ? 'var(--am-amber)' : undefined }}>{r.funnel.needs_review}</span> },
  ]
  const replyCols: Array<Column<InboxItem>> = [
    { key: 'c', header: 'Bedrijf', render: (i) => <div><span className="am-cell-primary">{i.company_name}</span><span className="am-cell-secondary am-truncate" style={{ maxWidth: 220, display: 'block' }}>{i.last_message?.preview ?? i.email}</span></div> },
    { key: 'k', header: 'Type', nowrap: true, render: (i) => <ClassChip c={i.classification} /> },
    { key: 't', header: 'Ontvangen', nowrap: true, render: (i) => <span className="am-muted am-num">{dateTime(i.last_inbound_at)}</span> },
  ]
  const leadCols: Array<Column<Lead>> = [
    { key: 'n', header: t('colContact'), render: (l) => <div style={{ maxWidth: 210 }}><span className="am-cell-primary am-truncate" style={{ display: 'block' }}>{l.naam || l.bedrijfsnaam || l.email}</span><span className="am-cell-secondary am-truncate" style={{ display: 'block' }}>{l.naam ? (l.bedrijfsnaam || l.email) : l.email}</span></div> },
    { key: 's', header: t('colSource'), nowrap: true, render: (l) => <SourceStatus lead={l} /> },
    { key: 'd', header: t('colCreated'), nowrap: true, render: (l) => <span className="am-muted am-num">{shortDate(l.created_at)}</span> },
  ]

  return (
    <Page>
      <PageHeader title={t('overviewTitle')} subtitle={t('overviewSubtitle')} />
      <Metrics testId="overview-metrics" items={[
        { label: 'Actieve runs', value: runs.data ? activeRuns.length : '—', onClick: () => a.navigate({ screen: 'outreach', view: 'runs' }) },
        { label: 'Review', value: a.counts.review ?? '—', tone: a.counts.review ? 'warning' : undefined, onClick: go.review },
        { label: 'Inbox · actie nodig', value: a.counts.inbox ?? '—', tone: a.counts.inbox ? 'warning' : undefined, onClick: go.inbox },
        { label: 'Leads · 7 dagen', value: a.crmLoading && !a.leads.length ? '—' : leadsThisWeek, sub: `${a.visibleLeads.length} totaal`, onClick: go.leads },
        { label: 'Verzenden', value: live === null ? '—' : live ? 'Aan' : 'Uit', tone: live ? 'success' : undefined, title: 'Centrale verzendstatus' },
      ]} />

      <Section title={t('attention')} testId="attention">
        {loading ? <div className="am-panel am-panel-pad am-stack"><Skeleton width="60%" /><Skeleton width="45%" /></div>
          : attention.length === 0 ? <div className="am-panel am-panel-pad am-inline"><Icon name="checkCircle" size={16} /><span className="am-muted">{t('attentionNone')}</span></div>
          : (
            <div className="am-rows">
              {attention.map((x) => (
                <div key={x.key} className="am-row" data-layout="action" data-testid="attention-item">
                  <div className="am-inline" style={{ flexWrap: 'nowrap' }}>
                    <span style={{ color: `var(--am-${x.tone === 'danger' ? 'red' : x.tone === 'warning' ? 'amber' : 'blue'})`, display: 'inline-flex' }}><Icon name={x.icon} size={16} /></span>
                    <span>{x.text}</span>
                  </div>
                  <div className="am-row-control"><Button size="sm" iconRight="chevronRight" onClick={x.go}>{x.action}</Button></div>
                </div>
              ))}
            </div>
          )}
      </Section>

      <div className="am-grid-2">
        <Section title={t('activeRuns')} aside={<LinkButton onClick={() => a.navigate({ screen: 'outreach', view: 'runs' })}>{t('allRuns')} →</LinkButton>}>
          {runs.error ? <Callout tone="danger">{runs.error}</Callout>
            : loading ? <div className="am-panel am-panel-pad am-stack"><Skeleton /><Skeleton width="80%" /></div>
            : activeRuns.length === 0 ? <EmptyState icon="target" title="Geen actieve runs" action={a.canOperate ? <Button size="sm" icon="plus" onClick={() => a.navigate({ screen: 'outreach', view: 'new' })}>Nieuwe run</Button> : undefined} />
            : <DataTable testId="overview-runs" rows={activeRuns.slice(0, 6)} columns={runCols} rowKey={(r) => r.id} onRowClick={(r) => go.run(r.id)} />}
        </Section>
        <Section title="Reacties met actie nodig" aside={<LinkButton onClick={go.inbox}>Inbox →</LinkButton>}>
          {inbox.error ? <Callout tone="danger">{inbox.error}</Callout>
            : inbox.data === null ? <div className="am-panel am-panel-pad am-stack"><Skeleton /><Skeleton width="80%" /></div>
            : inbox.data.length === 0 ? <EmptyState icon="inbox" title="Geen reacties die wachten" />
            : <DataTable testId="overview-replies" rows={inbox.data} columns={replyCols} rowKey={(i) => i.id} onRowClick={(i) => a.navigate({ screen: 'inbox', id: i.id })} />}
        </Section>
      </div>

      <div className="am-grid-2">
        <Section title={t('recentLeads')} aside={<LinkButton onClick={go.leads}>{t('allLeads')} →</LinkButton>}>
          {a.crmError && !a.leads.length ? <Callout tone="danger">{a.crmError}</Callout>
            : a.crmLoading && !a.leads.length ? <div className="am-panel am-panel-pad am-stack"><Skeleton /><Skeleton width="80%" /></div>
            : recentLeads.length === 0 ? <EmptyState icon="users" title={t('leadsEmptyTitle')} />
            : <DataTable testId="overview-leads" rows={recentLeads} columns={leadCols} rowKey={(l) => l.id} onRowClick={(l) => a.navigate({ screen: 'leads', id: l.id })} />}
        </Section>
        <Section title="Verzendstatus" aside={a.me.isAdmin || a.me.isSuperAdmin ? <LinkButton onClick={go.settings}>Instellingen →</LinkButton> : undefined}>
          {s ? (
            <Rows testId="overview-sending">
              <Row label="Verzenden"><Status tone={live ? 'success' : 'neutral'}>{live ? 'Aan' : 'Uit'}</Status></Row>
              <Row label="Testmodus">{s.config.test_recipients.length ? <Status tone="warning" dot={false}>Alleen {s.config.test_recipients.length} testadres{s.config.test_recipients.length === 1 ? '' : 'sen'}</Status> : <span className="am-muted">Uit</span>}</Row>
              <Row label="Vandaag naar Smartlead"><span className="am-num">{s.pushed_today} / {s.config.daily_new_leads_cap}</span></Row>
              <Row label="Smartlead"><Configured ok={s.provider.smartlead_configured} /></Row>
              <Row label="Noodstop (omgeving)">{s.provider.env_kill_switch ? <Status tone="danger">Actief</Status> : <span className="am-muted">Niet actief</span>}</Row>
            </Rows>
          ) : sending.data === null && !sending.error && sending.loading ? <div className="am-panel am-panel-pad am-stack"><Skeleton /><Skeleton width="70%" /></div>
            : <div className="am-panel am-panel-pad"><span className="am-muted">Verzendstatus niet beschikbaar.</span></div>}
        </Section>
      </div>
    </Page>
  )
}
