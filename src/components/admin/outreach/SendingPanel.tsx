'use client'
import { useCallback, useState } from 'react'
import type { OutreachApi } from '../../../lib/outreach/ui/api'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import { blockerLabel, SEND_STATE_META, stepProgress, type Mailbox, type ProspectSending, type RunSending, type SendingConfigView, type SendingOverview, type SendState } from '../../../lib/outreach/ui/sending'
import { SendStateChip } from './InboxView'
import { Btn, C, Chip, ErrorBox, Field, input, KeyValue, Loading, panel, SectionTitle, tableWrap, td, th, useLoad } from './ui'

const ok = (b: boolean, yes = 'ingesteld', no = 'ontbreekt') => <Chip color={b ? C.green : C.red} bg={b ? C.greenBg : C.redBg}>{b ? yes : no}</Chip>

/** Sending status + kill switch + limits (presentational). Enabling needs a second, explicit click. */
export function SendingBody({ o, mailboxes, busy, onPatch }: { o: SendingOverview; mailboxes: Mailbox[] | null; busy: boolean; onPatch: (p: Partial<SendingConfigView>) => void }) {
  const c = o.config
  const live = c.sending_enabled && !o.provider.env_kill_switch && o.provider.smartlead_configured
  const [arm, setArm] = useState(false)
  const [form, setForm] = useState({ cap: String(c.daily_new_leads_cap), test: c.test_recipients.join(', '), budget: String(c.daily_llm_budget_eur), d1: String(c.followup_delays_days[0] ?? 3), d2: String(c.followup_delays_days[1] ?? 4) })
  const states = Object.entries(o.states) as Array<[SendState, number]>
  return (
    <div data-testid="sending-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      <div style={{ ...panel, borderColor: live ? '#86EFAC' : '#FCD34D' }}>
        <SectionTitle>Verzenden (Smartlead)</SectionTitle>
        <KeyValue items={[
          ['Status', live ? <Chip key="s" color={C.green} bg={C.greenBg}>Aan</Chip> : <Chip key="s" color={C.amber} bg={C.amberBg}>Uit</Chip>],
          ['Smartlead', ok(o.provider.smartlead_configured)],
          ['Webhook', ok(o.provider.webhook_configured, 'ingesteld', 'ontbreekt (alleen sync)')],
          ['Noodstop (env)', o.provider.env_kill_switch ? <Chip key="k" color={C.red} bg={C.redBg}>actief</Chip> : 'niet actief'],
          ['Testmodus', c.test_recipients.length ? `alleen naar: ${c.test_recipients.join(', ')}` : 'uit (alle goedgekeurde prospects)'],
          ['Laatste wijziging', `${dateTime(c.updated_at)}${c.updated_by ? ` door ${c.updated_by}` : ''}${c.kill_reason ? ` — ${c.kill_reason}` : ''}`],
        ]} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {c.sending_enabled
            ? <Btn kind="danger" disabled={busy} onClick={() => onPatch({ sending_enabled: false, kill_reason: 'Handmatig uitgezet' })}>Zet verzenden UIT (noodstop)</Btn>
            : o.can_configure && (!arm
              ? <Btn kind="primary" disabled={busy || !o.provider.smartlead_configured} onClick={() => setArm(true)}>Verzenden aanzetten…</Btn>
              : <><Btn kind="primary" disabled={busy} onClick={() => { setArm(false); onPatch({ sending_enabled: true }) }}>Bevestig: verzenden AAN</Btn><Btn kind="ghost" onClick={() => setArm(false)}>Annuleer</Btn></>)}
        </div>
      </div>
      <div style={panel}>
        <SectionTitle>Vandaag</SectionTitle>
        <KeyValue items={[
          ['Nieuwe leads naar Smartlead', `${o.pushed_today} / ${c.daily_new_leads_cap}`],
          ['Actie nodig (inbox)', String(o.needs_action)],
          ['AI-kosten antwoorden', `${eur(o.llm.spent_eur)} / ${eur(o.llm.budget_eur)}`],
          ['Webhooks (24u)', `${o.webhooks_24h.received} ontvangen${o.webhooks_24h.unmatched ? `, ${o.webhooks_24h.unmatched} onbekend` : ''}`],
        ]} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {states.map(([s, n]) => <Chip key={s} title={SEND_STATE_META[s]?.label}>{SEND_STATE_META[s]?.label ?? s}: {n}</Chip>)}
        </div>
      </div>
      {o.can_configure && (
        <div style={panel}>
          <SectionTitle>Limieten en sequence</SectionTitle>
          <div style={{ display: 'grid', gap: 8 }}>
            <Field label="Max nieuwe leads per dag"><input style={input} inputMode="numeric" value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} /></Field>
            <Field label="Testmodus: alleen deze adressen (komma-gescheiden, leeg = uit)"><input style={input} value={form.test} onChange={(e) => setForm({ ...form, test: e.target.value })} /></Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Follow-up 1 na (dagen)"><input style={input} inputMode="numeric" value={form.d1} onChange={(e) => setForm({ ...form, d1: e.target.value })} /></Field>
              <Field label="Follow-up 2 daarna (dagen)"><input style={input} inputMode="numeric" value={form.d2} onChange={(e) => setForm({ ...form, d2: e.target.value })} /></Field>
            </div>
            <Field label="AI-budget antwoorden per dag (€)"><input style={input} inputMode="decimal" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
            <label style={{ fontSize: '.8rem', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={c.autopilot_enabled} disabled={busy} onChange={(e) => onPatch({ autopilot_enabled: e.target.checked })} />
              Autopilot: READY prospects van autopilot-runs automatisch in de wachtrij
            </label>
            <div><Btn disabled={busy} onClick={() => onPatch({
              daily_new_leads_cap: Number(form.cap), daily_llm_budget_eur: Number(form.budget), followup_delays_days: [Number(form.d1), Number(form.d2)],
              test_recipients: form.test.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
            })}>Opslaan</Btn></div>
          </div>
        </div>
      )}
      {mailboxes && (
        <div style={panel}>
          <SectionTitle>Mailboxen</SectionTitle>
          {mailboxes.length === 0 ? <div style={{ fontSize: '.82rem', color: C.red }}>Geen mailbox gekoppeld in Smartlead.</div> : (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: '.82rem' }}>
              {mailboxes.map((m) => <li key={m.id}>{m.from_email} {m.active ? '' : '(niet actief)'}{m.daily_limit ? ` · max ${m.daily_limit}/dag` : ''}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function SendingPanel({ api, onChanged }: { api: OutreachApi; onChanged?: () => void }) {
  const res = useLoad<SendingOverview>(useCallback(() => api.sending(), [api]))
  const mb = useLoad<{ configured: boolean; mailboxes: Mailbox[] } | null>(useCallback(() => api.mailboxes().catch(() => null), [api]))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const patch = async (p: Partial<SendingConfigView>) => {
    setBusy(true)
    setErr(null)
    try {
      await api.setSending(p)
      res.reload()
      onChanged?.()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      {err && <ErrorBox message={err} />}
      {res.error && <ErrorBox message={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Loading />}
      {res.data && <SendingBody key={res.data.config.updated_at} o={res.data} mailboxes={mb.data?.configured ? mb.data.mailboxes : null} busy={busy} onPatch={patch} />}
    </div>
  )
}

/** Run detail: sending section (queue READY prospects, see each send). */
export function RunSendingBody({ d, canOperate, busy, onQueueAll, onOpenProspect, notice }: {
  d: RunSending; canOperate: boolean; busy: boolean; onQueueAll: () => void; onOpenProspect: (id: string) => void; notice: string | null
}) {
  const sendable = d.ready_unqueued.filter((r) => r.blockers.length === 0)
  return (
    <div data-testid="run-sending">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        {canOperate && <Btn kind="primary" disabled={busy || sendable.length === 0} onClick={onQueueAll}>Zet {sendable.length} READY in wachtrij</Btn>}
        {d.provider_campaign_id && <Chip>Smartlead-campagne {d.provider_campaign_id} · {d.provider_campaign_status ?? '—'}</Chip>}
        {d.provider_campaign_error && <span style={{ fontSize: '.76rem', color: C.amber }}>{d.provider_campaign_error}</span>}
        {notice && <span role="status" style={{ fontSize: '.8rem', color: C.text }}>{notice}</span>}
      </div>
      {d.ready_unqueued.filter((r) => r.blockers.length > 0).map((r) => (
        <div key={r.prospect_id} style={{ fontSize: '.78rem', color: C.muted }}>{r.company_name}: geblokkeerd — {r.blockers.map(blockerLabel).join(', ')}</div>
      ))}
      {d.sends.length > 0 && (
        <div style={{ ...tableWrap, marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Bedrijf</th><th style={th}>E-mail</th><th style={th}>Status</th><th style={th}>Stappen</th><th style={th}>Wachtrij</th></tr></thead>
            <tbody>{d.sends.map((s) => (
              <tr key={s.id} onClick={() => onOpenProspect(s.prospect_id)} style={{ cursor: 'pointer' }}>
                <td style={td}>{s.company_name}</td><td style={td}>{s.email}</td>
                <td style={td}><SendStateChip state={s.state} />{s.state_reason ? <div style={{ fontSize: '.7rem', color: C.faint }}>{s.state_reason}</div> : null}</td>
                <td style={td}>{stepProgress(s)}</td><td style={td}>{dateTime(s.queued_at)}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function RunSendingSection({ api, runId, canOperate, onOpenProspect }: { api: OutreachApi; runId: string; canOperate: boolean; onOpenProspect: (id: string) => void }) {
  const res = useLoad<RunSending>(useCallback(() => api.runSending(runId), [api, runId]))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const queueAll = async () => {
    setBusy(true)
    try {
      const r = await api.queueRun(runId)
      setNotice(`${r.queued} in wachtrij gezet${r.refused.length ? `, ${r.refused.length} geweigerd` : ''}.`)
      res.reload()
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <SectionTitle>Verzenden</SectionTitle>
      {res.error && <ErrorBox message={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Loading />}
      {res.data && <RunSendingBody d={res.data} canOperate={canOperate} busy={busy} onQueueAll={queueAll} onOpenProspect={onOpenProspect} notice={notice} />}
    </div>
  )
}

/** Prospect detail: send state, sequence preview, queue / cancel. */
export function ProspectSendingBody({ d, busy, onQueue, onCancel, notice }: { d: ProspectSending; busy: boolean; onQueue: () => void; onCancel: () => void; notice: string | null }) {
  const s = d.send
  return (
    <div data-testid="prospect-sending" style={panel}>
      {!s || s.state === 'CANCELLED' ? (
        <>
          {d.gate && d.gate.length > 0
            ? <div style={{ fontSize: '.82rem', color: C.red }}>Kan niet verzonden worden: {d.gate.map(blockerLabel).join(', ')}</div>
            : d.gate ? <Btn kind="primary" disabled={busy} onClick={onQueue}>Zet in verzendwachtrij</Btn>
            : <div style={{ fontSize: '.82rem', color: C.muted }}>Alleen READY prospects kunnen verzonden worden.</div>}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <SendStateChip state={s.state} /><Chip>{stepProgress(s)} stappen</Chip>
            {s.state === 'QUEUED' && <Btn small kind="danger" disabled={busy} onClick={onCancel}>Annuleer</Btn>}
            {d.promoted_lead_id && <Chip color={C.green} bg={C.greenBg}>In CRM</Chip>}
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {s.sequence.map((st) => (
              <div key={st.step} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: '.72rem', color: C.muted, fontWeight: 700 }}>STAP {st.step} · {st.step === 1 ? 'dag 0' : `+${st.delay_days} dagen`}{st.subject ? ` · ${st.subject}` : ' · (antwoord in zelfde thread)'}</div>
                <div style={{ fontSize: '.8rem', whiteSpace: 'pre-wrap', color: C.ink }}>{st.body}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {notice && <div role="status" style={{ fontSize: '.8rem', color: C.text, marginTop: 6 }}>{notice}</div>}
    </div>
  )
}

export function ProspectSendingSection({ api, prospectId }: { api: OutreachApi; prospectId: string }) {
  const res = useLoad<ProspectSending>(useCallback(() => api.prospectSending(prospectId), [api, prospectId]))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true)
    setNotice(null)
    try {
      const r = (await f()) as { ok?: boolean; blockers?: string[] } | undefined
      if (r && r.ok === false) setNotice(`Geweigerd: ${(r.blockers ?? []).map(blockerLabel).join(', ')}`)
      res.reload()
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <SectionTitle>Verzenden</SectionTitle>
      {res.error && <ErrorBox message={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Loading />}
      {res.data && <ProspectSendingBody d={res.data} busy={busy} notice={notice} onQueue={() => run(() => api.queueProspect(prospectId))}
        onCancel={() => res.data?.send && run(() => api.cancelSend(res.data!.send!.id))} />}
    </div>
  )
}
