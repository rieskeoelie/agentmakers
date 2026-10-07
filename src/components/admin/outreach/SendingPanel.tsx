'use client'
import { useCallback, useState } from 'react'
import {
  BlockSkeleton, Button, Callout, DataTable, ErrorState, Input, Metrics, Row, Rows, Section, Status, Switch, useConfirm, useLoad, type Column,
} from '../ds'
import { useAdmin } from '../app/AdminContext'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import {
  blockerLabel, SEND_STATE_META, stepProgress, type Mailbox, type ProspectSending, type RunSending, type SendingConfigView, type SendingOverview, type SendState, type SendSummary,
} from '../../../lib/outreach/ui/sending'
import { SEND_TONE } from './tones'

export function SendStateChip({ state }: { state: SendState }) {
  return <Status tone={SEND_TONE[state] ?? 'neutral'}>{SEND_STATE_META[state]?.label ?? state}</Status>
}

/** Secrets and provider wiring are only ever shown as configured / not configured. */
export function Configured({ ok, no = 'Niet geconfigureerd' }: { ok: boolean; no?: string }) {
  return <Status tone={ok ? 'success' : 'warning'}>{ok ? 'Geconfigureerd' : no}</Status>
}

export function sendingLive(o: Pick<SendingOverview, 'config' | 'provider'>): boolean {
  return o.config.sending_enabled && !o.provider.env_kill_switch && o.provider.smartlead_configured
}

/**
 * Sending controls (presentational). Turning sending on always needs an explicit confirmation dialog;
 * turning it off (kill switch) is one click.
 */
export function SendingBody({ o, mailboxes, busy, onPatch, onSync }: {
  o: SendingOverview; mailboxes: Mailbox[] | null; busy: boolean; onPatch: (p: Partial<SendingConfigView>) => void; onSync?: () => void
}) {
  const c = o.config
  const live = sendingLive(o)
  const [confirm, confirmDialog] = useConfirm()
  const [form, setForm] = useState({ cap: String(c.daily_new_leads_cap), test: c.test_recipients.join(', '), budget: String(c.daily_llm_budget_eur), d1: String(c.followup_delays_days[0] ?? 3), d2: String(c.followup_delays_days[1] ?? 4) })
  const states = (Object.entries(o.states) as Array<[SendState, number]>).filter(([, n]) => n > 0)
  const arm = async () => {
    const ok = await confirm({
      title: 'Verzenden aanzetten?', tone: 'primary', confirmLabel: 'Bevestig: verzenden AAN',
      description: c.test_recipients.length
        ? `Testmodus is actief: alleen ${c.test_recipients.join(', ')} kan mail ontvangen. Max ${c.daily_new_leads_cap} nieuwe leads per dag.`
        : `Goedgekeurde prospects in de wachtrij gaan naar Smartlead en ontvangen echte mail. Max ${c.daily_new_leads_cap} nieuwe leads per dag.`,
    })
    if (ok) onPatch({ sending_enabled: true })
  }
  const save = () => onPatch({
    daily_new_leads_cap: Number(form.cap), daily_llm_budget_eur: Number(form.budget), followup_delays_days: [Number(form.d1), Number(form.d2)],
    test_recipients: form.test.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
  })

  return (
    <div data-testid="sending-panel">
      <div style={{ marginBottom: 16 }} data-testid="sending-state">
        {live
          ? <Callout tone="success" icon="send" title="Verzenden staat AAN"
              action={<Button variant="danger-solid" icon="stop" disabled={busy} onClick={() => onPatch({ sending_enabled: false, kill_reason: 'Handmatig uitgezet' })}>Zet verzenden UIT (noodstop)</Button>}>
              {c.test_recipients.length ? `Testmodus: alleen naar: ${c.test_recipients.join(', ')}.` : 'Goedgekeurde prospects in de wachtrij ontvangen echte mail.'}
            </Callout>
          : <Callout tone="neutral" icon="shield" title="Verzenden staat UIT"
              action={c.sending_enabled
                ? <Button variant="danger-solid" icon="stop" disabled={busy} onClick={() => onPatch({ sending_enabled: false, kill_reason: 'Handmatig uitgezet' })}>Zet verzenden UIT (noodstop)</Button>
                : o.can_configure ? <Button variant="secondary" disabled={busy || !o.provider.smartlead_configured} onClick={() => void arm()}>Verzenden aanzetten…</Button> : undefined}>
              {o.provider.env_kill_switch ? 'De noodstop in de omgeving is actief; er gaat niets de deur uit.' : 'Er wordt niets naar Smartlead gestuurd. Runs, review en de wachtrij werken gewoon.'}
            </Callout>}
      </div>

      <Section title="Status">
        <Rows>
          <Row label="Smartlead" help="API-sleutel van de verzendprovider."><Configured ok={o.provider.smartlead_configured} /></Row>
          <Row label="Webhook" help="Zonder webhook komen reacties alleen via synchronisatie binnen."><Configured ok={o.provider.webhook_configured} no="Niet geconfigureerd (alleen sync)" /></Row>
          <Row label="Noodstop (omgeving)">{o.provider.env_kill_switch ? <Status tone="danger">Actief</Status> : <Status tone="muted">Niet actief</Status>}</Row>
          <Row label="Testmodus">{c.test_recipients.length ? <span>alleen naar: {c.test_recipients.join(', ')}</span> : <span className="am-muted">Uit (alle goedgekeurde prospects)</span>}</Row>
          <Row label="Laatste wijziging"><span className="am-muted">{dateTime(c.updated_at)}{c.updated_by ? ` door ${c.updated_by}` : ''}{c.kill_reason ? ` — ${c.kill_reason}` : ''}</span></Row>
          {onSync && o.provider.smartlead_configured && <Row label="Synchroniseren" help="Haalt statussen en reacties direct op bij Smartlead."><Button size="sm" icon="refresh" disabled={busy} onClick={onSync}>Nu synchroniseren</Button></Row>}
        </Rows>
      </Section>

      <Section title="Vandaag">
        <Metrics testId="sending-today" items={[
          { label: 'Nieuwe leads naar Smartlead', value: `${o.pushed_today} / ${c.daily_new_leads_cap}` },
          { label: 'Actie nodig (inbox)', value: o.needs_action, tone: o.needs_action ? 'warning' : undefined },
          { label: 'AI-kosten antwoorden', value: eur(o.llm.spent_eur), sub: `van ${eur(o.llm.budget_eur)}` },
          { label: 'Webhooks (24u)', value: o.webhooks_24h.received, sub: o.webhooks_24h.unmatched ? `${o.webhooks_24h.unmatched} onbekend` : undefined },
        ]} />
        {states.length > 0 && <div className="am-inline" style={{ marginTop: 12 }}>{states.map(([s, n]) => <Status key={s} tone={SEND_TONE[s]}>{SEND_STATE_META[s]?.label ?? s} · {n}</Status>)}</div>}
      </Section>

      {o.can_configure && (
        <Section title="Limieten en sequence" description="Wijzigingen gelden direct voor de volgende verzendronde.">
          <Rows>
            <Row label="Max nieuwe leads per dag"><Input aria-label="Max nieuwe leads per dag" style={{ width: 96 }} inputMode="numeric" value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} /></Row>
            <Row label="Testmodus" help="Alleen deze adressen ontvangen mail. Leeg = uit.">
              <Input aria-label="Testadressen" style={{ width: 320 }} value={form.test} placeholder="naam@voorbeeld.nl" onChange={(e) => setForm({ ...form, test: e.target.value })} />
            </Row>
            <Row label="Follow-ups" help="Dagen na de vorige stap.">
              <span className="am-inline" style={{ flexWrap: 'nowrap' }}>
                <Input aria-label="Follow-up 1 na (dagen)" style={{ width: 64 }} inputMode="numeric" value={form.d1} onChange={(e) => setForm({ ...form, d1: e.target.value })} />
                <span className="am-faint">en</span>
                <Input aria-label="Follow-up 2 daarna (dagen)" style={{ width: 64 }} inputMode="numeric" value={form.d2} onChange={(e) => setForm({ ...form, d2: e.target.value })} />
                <span className="am-faint">dagen</span>
              </span>
            </Row>
            <Row label="AI-budget antwoorden" help="Per dag, in euro."><Input aria-label="AI-budget per dag" style={{ width: 96 }} inputMode="decimal" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Row>
            <Row label="Autopilot" help="READY-prospects van autopilot-runs gaan automatisch in de wachtrij.">
              <Switch label="Autopilot" checked={c.autopilot_enabled} disabled={busy} onChange={(v) => onPatch({ autopilot_enabled: v })} />
            </Row>
          </Rows>
          <div className="am-form-actions" style={{ marginTop: 12 }}><Button variant="primary" disabled={busy} onClick={save}>Opslaan</Button></div>
        </Section>
      )}

      {mailboxes && (
        <Section title="Mailboxen" description="Gekoppeld in Smartlead.">
          {mailboxes.length === 0
            ? <Callout tone="warning">Geen mailbox gekoppeld in Smartlead.</Callout>
            : <Rows>{mailboxes.map((m) => (
                <Row key={m.id} label={m.from_email} help={m.from_name ?? undefined}>
                  <span className="am-inline">{m.daily_limit ? <span className="am-muted">max {m.daily_limit}/dag</span> : null}<Status tone={m.active ? 'success' : 'muted'}>{m.active ? 'Actief' : 'Niet actief'}</Status></span>
                </Row>))}
              </Rows>}
        </Section>
      )}
      {confirmDialog}
    </div>
  )
}

/** Container for SendingBody (used in Settings → Verzenden). */
export function SendingPanel({ onChanged }: { onChanged?: () => void }) {
  const { api } = useAdmin()
  const res = useLoad<SendingOverview>(useCallback(() => api.sending(), [api]))
  const mb = useLoad<{ configured: boolean; mailboxes: Mailbox[] } | null>(useCallback(() => api.mailboxes().catch(() => null), [api]))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr(null)
    try { await f(); res.reload(); onChanged?.() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div>
      {err && <div style={{ marginBottom: 12 }}><Callout tone="danger" title="Niet opgeslagen">{err}</Callout></div>}
      {res.error && !res.data && <ErrorState message={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <BlockSkeleton lines={6} />}
      {res.data && <SendingBody key={res.data.config.updated_at} o={res.data} mailboxes={mb.data?.configured ? mb.data.mailboxes : null} busy={busy}
        onPatch={(p) => void run(() => api.setSending(p))} onSync={() => void run(() => api.syncNow())} />}
    </div>
  )
}

/** Run detail: queue READY prospects and follow each send. */
export function RunSendingBody({ d, canOperate, busy, onQueueAll, onOpenProspect, notice }: {
  d: RunSending; canOperate: boolean; busy: boolean; onQueueAll: () => void; onOpenProspect: (id: string) => void; notice: string | null
}) {
  const sendable = d.ready_unqueued.filter((r) => r.blockers.length === 0)
  const blocked = d.ready_unqueued.filter((r) => r.blockers.length > 0)
  const columns: Array<Column<SendSummary>> = [
    { key: 'co', header: 'Bedrijf', sort: (s) => s.company_name, render: (s) => <span className="am-cell-primary">{s.company_name}</span> },
    { key: 'em', header: 'E-mail', render: (s) => <span className="am-muted am-truncate" style={{ display: 'block', maxWidth: 180 }} title={s.email}>{s.email}</span> },
    { key: 'st', header: 'Status', nowrap: true, render: (s) => <span title={s.state_reason ?? undefined}><SendStateChip state={s.state} /></span> },
    { key: 'steps', header: 'Stappen', align: 'right', render: (s) => <span className="am-num">{stepProgress(s)}</span> },
    { key: 'q', hide: 'md', header: 'In wachtrij', nowrap: true, sort: (s) => s.queued_at, render: (s) => <span className="am-muted am-num">{dateTime(s.queued_at)}</span> },
  ]
  return (
    <div data-testid="run-sending" className="am-stack" style={{ gap: 12 }}>
      <div className="am-inline">
        {canOperate && <Button variant="secondary" icon="send" disabled={busy || sendable.length === 0} onClick={onQueueAll}>Zet {sendable.length} READY in wachtrij</Button>}
        {d.provider_campaign_id && <Status tone="neutral" dot={false}>Smartlead-campagne {d.provider_campaign_id} · {d.provider_campaign_status ?? '—'}</Status>}
        {notice && <span role="status" className="am-muted">{notice}</span>}
      </div>
      {d.provider_campaign_error && <Callout tone="warning">{d.provider_campaign_error}</Callout>}
      {blocked.length > 0 && (
        <Callout tone="warning" title={`${blocked.length} READY ${blocked.length === 1 ? 'prospect kan' : 'prospects kunnen'} niet in de wachtrij`}>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{blocked.map((r) => <li key={r.prospect_id}>{r.company_name}: {r.blockers.map(blockerLabel).join(', ')}</li>)}</ul>
        </Callout>
      )}
      {d.sends.length > 0
        ? <DataTable testId="run-sends" rows={d.sends} columns={columns} rowKey={(s) => s.id} onRowClick={(s) => onOpenProspect(s.prospect_id)} />
        : <p className="am-muted" style={{ margin: 0 }}>Nog niets in de verzendwachtrij.</p>}
    </div>
  )
}

export function RunSendingSection({ runId, onOpenProspect }: { runId: string; onOpenProspect: (id: string) => void }) {
  const { api, canOperate } = useAdmin()
  const res = useLoad<RunSending>(useCallback(() => api.runSending(runId), [api, runId]))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const queueAll = async () => {
    setBusy(true)
    try {
      const r = await api.queueRun(runId)
      setNotice(`${r.queued} in wachtrij gezet${r.refused.length ? `, ${r.refused.length} geweigerd` : ''}.`)
      res.reload()
    } catch (e) { setNotice((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Section title="Verzenden" description="De wachtrij verstuurt alleen als verzenden centraal aan staat.">
      {res.error && !res.data && <ErrorState message={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <BlockSkeleton lines={3} />}
      {res.data && <RunSendingBody d={res.data} canOperate={canOperate} busy={busy} onQueueAll={() => void queueAll()} onOpenProspect={onOpenProspect} notice={notice} />}
    </Section>
  )
}

/** Prospect detail: send state, sequence preview, queue / cancel. */
export function ProspectSendingBody({ d, busy, onQueue, onCancel, notice }: { d: ProspectSending; busy: boolean; onQueue: () => void; onCancel: () => void; notice: string | null }) {
  const s = d.send
  return (
    <div data-testid="prospect-sending" className="am-stack" style={{ gap: 12 }}>
      {!s || s.state === 'CANCELLED' ? (
        d.gate && d.gate.length > 0
          ? <Callout tone="danger" title="Kan niet verzonden worden">{d.gate.map(blockerLabel).join(', ')}</Callout>
          : d.gate ? <div><Button variant="secondary" icon="send" disabled={busy} onClick={onQueue}>Zet in verzendwachtrij</Button></div>
          : <p className="am-muted" style={{ margin: 0 }}>Alleen READY prospects kunnen verzonden worden.</p>
      ) : (
        <>
          <div className="am-inline">
            <SendStateChip state={s.state} /><Status tone="neutral" dot={false}>{stepProgress(s)} stappen</Status>
            {d.promoted_lead_id && <Status tone="success">In CRM</Status>}
            {s.state === 'QUEUED' && <Button size="sm" variant="danger" disabled={busy} onClick={onCancel}>Annuleer</Button>}
          </div>
          <div className="am-stack" style={{ gap: 8 }}>
            {s.sequence.map((st) => (
              <div key={st.step} className="am-panel am-panel-pad">
                <div className="am-faint" style={{ fontSize: 12, marginBottom: 4 }}>Stap {st.step} · {st.step === 1 ? 'dag 0' : `+${st.delay_days} dagen`}{st.subject ? ` · ${st.subject}` : ' · antwoord in zelfde thread'}</div>
                <p className="am-pre">{st.body}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {notice && <div role="status" className="am-muted">{notice}</div>}
    </div>
  )
}

export function ProspectSendingSection({ prospectId }: { prospectId: string }) {
  const { api } = useAdmin()
  const res = useLoad<ProspectSending>(useCallback(() => api.prospectSending(prospectId), [api, prospectId]))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setNotice(null)
    try {
      const r = (await f()) as { ok?: boolean; blockers?: string[] } | undefined
      if (r && r.ok === false) setNotice(`Geweigerd: ${(r.blockers ?? []).map(blockerLabel).join(', ')}`)
      res.reload()
    } catch (e) { setNotice((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <>
      {res.error && !res.data && <ErrorState message={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <BlockSkeleton lines={3} />}
      {res.data && <ProspectSendingBody d={res.data} busy={busy} notice={notice} onQueue={() => void run(() => api.queueProspect(prospectId))}
        onCancel={() => { const id = res.data?.send?.id; if (id) void run(() => api.cancelSend(id)) }} />}
    </>
  )
}
