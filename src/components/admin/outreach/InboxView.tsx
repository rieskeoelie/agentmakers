'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  BlockSkeleton, Button, Callout, Dialog, EmptyState, ErrorState, ExtLink, FilterSelect, Icon, IconButton, KeyValue, SearchInput, Select, Skeleton,
  Status, Textarea, Timeline, useConfirm, useLoad,
} from '../ds'
import { useAdmin } from '../app/AdminContext'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import {
  blockerLabel, CLASS_META, DISPOSITIONS, INBOX_TABS, latestSuggestion, replyProblems, stepProgress,
  type InboxItem, type InboxPage, type InboxTab, type ReplyClass, type Thread, type ThreadMessage,
} from '../../../lib/outreach/ui/sending'
import { SendStateChip } from './SendingPanel'
import { CLASS_TONE, EVENT_TONE, eventLabel } from './tones'

export { SendStateChip }

export function ClassChip({ c }: { c: ReplyClass | null }) {
  if (!c) return null
  return <Status tone={CLASS_TONE[c]}>{CLASS_META[c].label}</Status>
}

/** Conversation list (presentational). */
export function InboxList({ items, selected, onSelect }: { items: InboxItem[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div data-testid="inbox-list" role="list">
      {items.map((i) => (
        <button key={i.id} type="button" role="listitem" className="am-conv" onClick={() => onSelect(i.id)} aria-current={selected === i.id ? 'true' : undefined}
          data-attention={i.inbox_status === 'NEEDS_ACTION' ? 'true' : undefined}>
          <div className="am-conv-top"><span className="am-conv-name">{i.company_name}</span><span className="am-conv-time">{dateTime(i.last_message?.at ?? i.queued_at)}</span></div>
          <div className="am-conv-sub">{i.contact_name ?? '—'} · {i.email}</div>
          {i.last_message && <div className="am-conv-preview">{i.last_message.direction === 'INBOUND' ? '↩ ' : '→ '}{i.last_message.preview || '(leeg)'}</div>}
          <div className="am-conv-meta">
            <SendStateChip state={i.state} />
            <ClassChip c={i.classification} />
            {i.promoted_lead_id && <Status tone="success" dot={false}>In CRM</Status>}
          </div>
        </button>
      ))}
    </div>
  )
}

function MessageItem({ m }: { m: ThreadMessage }) {
  const inbound = m.direction === 'INBOUND'
  const label = inbound ? 'Reactie' : m.kind === 'MANUAL_REPLY' ? 'Handmatig antwoord' : `Stap ${m.sequence_number ?? '?'}`
  return (
    <div className="am-message" data-direction={inbound ? 'in' : 'out'} data-testid="thread-message">
      <div className="am-message-head">
        <span className="am-strong">{label}</span>
        <span>{inbound ? m.from_email : m.to_email ? `aan ${m.to_email}` : ''}</span>
        <span style={{ marginLeft: 'auto' }}>{dateTime(m.occurred_at)}</span>
        {m.status === 'PENDING' && <Status tone="warning">wordt verzonden</Status>}
        {m.status === 'FAILED' && <Status tone="danger">mislukt</Status>}
        {inbound && <ClassChip c={m.classification} />}
      </div>
      <div className="am-message-body">
        {m.subject && <div className="am-strong" style={{ marginBottom: 6 }}>{m.subject}</div>}
        <p className="am-pre">{m.body_text ?? ''}</p>
        {m.error && <p style={{ color: 'var(--am-red)', margin: '8px 0 0' }}>{m.error}</p>}
      </div>
    </div>
  )
}

/**
 * Thread + context columns (presentational). A reply is only ever sent by a human: the composer opens a
 * confirmation dialog naming the recipient. AI output is a suggestion the human may copy into the composer.
 */
export function ThreadBody({ t, busy, draft, setDraft, confirm, setConfirm, onSend, onAction, notice, onToggleContext }: {
  t: Thread; busy: boolean; draft: string; setDraft: (s: string) => void; confirm: boolean; setConfirm: (b: boolean) => void
  onSend: (suggestionId: string | null) => void; onAction: (body: Record<string, unknown>) => void; notice: string | null; onToggleContext?: () => void
}) {
  const s = t.send
  const suggestion = latestSuggestion(t.messages)
  const lastIn = [...t.messages].reverse().find((m) => m.direction === 'INBOUND') ?? null
  const problems = replyProblems(draft)
  const canReply = !!lastIn && !['BOUNCED', 'UNSUBSCRIBED'].includes(s.state)
  const facts = t.evidence.filter((e) => e.kind === 'FACT').slice(0, 6)
  const fit = t.prospect.fit
  const analysing = lastIn && (lastIn.analysis_state === 'PENDING' || lastIn.analysis_state === 'RUNNING')
  const suggestionId = suggestion && draft.trim() === (suggestion.suggested_reply ?? '').trim() ? suggestion.id : null

  return (
    <>
      <section className="am-inbox-col" data-testid="thread" aria-label="Gesprek">
        <div className="am-inbox-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div className="am-strong" style={{ fontSize: 15 }}>{t.prospect.company_name}</div>
            <div className="am-muted am-truncate">{t.prospect.contact_name ?? '—'}{t.prospect.contact_title ? ` · ${t.prospect.contact_title}` : ''} · {s.email}</div>
            <div className="am-inline" style={{ marginTop: 8 }}>
              <SendStateChip state={s.state} />
              <Status tone="neutral" dot={false}>{stepProgress({ steps_sent: s.steps_sent ?? 0, steps_total: s.steps_total ?? s.sequence?.length ?? 0 })} stappen</Status>
              {s.disposition && <Status tone="info">{DISPOSITIONS.find((d) => d.value === s.disposition)?.label ?? s.disposition}</Status>}
            </div>
          </div>
          <div className="am-inline" style={{ flexWrap: 'nowrap' }}>
            {s.inbox_status !== 'DONE'
              ? <Button size="sm" icon="check" disabled={busy} onClick={() => onAction({ action: 'state', inbox_status: 'DONE' })}>Afgehandeld</Button>
              : <Button size="sm" disabled={busy} onClick={() => onAction({ action: 'state', inbox_status: 'NEEDS_ACTION' })}>Heropenen</Button>}
            {onToggleContext && <span className="am-context-toggle"><IconButton icon="panel" label="Context tonen" onClick={onToggleContext} /></span>}
          </div>
        </div>

        <div className="am-inbox-scroll">
          <div className="am-thread">
            {t.messages.length === 0 && <p className="am-muted">Nog geen berichten. De sequence start volgens het verzendschema.</p>}
            {t.messages.map((m) => <MessageItem key={m.id} m={m} />)}

            {lastIn && (
              <div className="am-panel am-panel-pad" data-testid="ai-analysis" style={{ background: 'var(--am-surface-2)' }}>
                <div className="am-inline" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="am-inline"><Icon name="sparkle" size={14} /><span className="am-strong">AI-analyse</span><span className="am-faint">Alleen een suggestie — AI verstuurt nooit zelf.</span></span>
                  <Button size="sm" variant="ghost" icon="refresh" disabled={busy} onClick={() => onAction({ action: 'reanalyze', message_id: lastIn.id })}>Opnieuw analyseren</Button>
                </div>
                {analysing ? <div className="am-stack"><Skeleton width="60%" /><Skeleton width="80%" /></div> : (
                  <KeyValue items={[
                    ['Classificatie', <span key="c" className="am-inline"><ClassChip c={lastIn.classification} /><span className="am-faint">{lastIn.classification_source === 'rules' ? 'regel' : lastIn.classification_confidence !== null ? `${Math.round(Number(lastIn.classification_confidence) * 100)}% zeker` : ''}</span></span>],
                    ['Samenvatting', lastIn.summary],
                    ['Suggestie', lastIn.suggested_reply_status === 'REJECTED' ? `Afgekeurd door claimcontrole (${(lastIn.suggested_reply_issues ?? []).join(', ')})` : lastIn.suggested_reply_status === 'READY' ? 'Klaar om over te nemen' : lastIn.suggested_reply_status === 'USED' ? 'Gebruikt' : 'Geen'],
                  ]} />
                )}
                {suggestion && (
                  <div style={{ marginTop: 12 }}>
                    <pre className="am-pre am-quote" style={{ fontStyle: 'normal' }}>{suggestion.suggested_reply}</pre>
                    <div style={{ marginTop: 8 }}><Button size="sm" icon="edit" disabled={busy || !canReply} onClick={() => { setDraft(suggestion.suggested_reply ?? ''); setConfirm(false) }}>Gebruik suggestie</Button></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="am-composer">
          {!canReply && <p className="am-muted" style={{ margin: '0 0 8px' }}>Antwoorden kan zodra de prospect heeft gereageerd (niet na bounce of afmelding).</p>}
          <Textarea aria-label="Antwoord" value={draft} disabled={!canReply || busy} rows={5} placeholder="Schrijf of bewerk je antwoord…"
            onChange={(e) => { setDraft(e.target.value); setConfirm(false) }} />
          <div className="am-inline" style={{ marginTop: 8, justifyContent: 'space-between' }}>
            <span className="am-faint" style={{ fontSize: 12 }}>{draft && problems.length > 0 ? <span style={{ color: 'var(--am-red)' }}>{problems.join(' ')}</span> : notice ? <span role="status" className="am-muted">{notice}</span> : 'Wordt pas verstuurd na jouw bevestiging.'}</span>
            <Button variant="primary" icon="send" disabled={!canReply || busy || problems.length > 0} onClick={() => setConfirm(true)}>Verstuur…</Button>
          </div>
        </div>
        <Dialog open={confirm} onClose={() => setConfirm(false)} closeDisabled={busy} title="Antwoord versturen?" testId="send-confirm"
          description={`Dit antwoord gaat via Smartlead naar ${s.email}.`}
          footer={<>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>Annuleer</Button>
            <Button variant="primary" icon="send" loading={busy} onClick={() => onSend(suggestionId)}>Bevestig: verstuur naar {s.email}</Button>
          </>}>
          <pre className="am-pre am-quote" style={{ fontStyle: 'normal', maxHeight: 240, overflow: 'auto' }}>{draft}</pre>
        </Dialog>
      </section>

      <aside className="am-inbox-col" aria-label="Context">
        <div className="am-inbox-scroll">
          <div className="am-context">
            <div className="am-context-block">
              <h4>Acties</h4>
              <div className="am-stack">
                <Select aria-label="Uitkomst" value={s.disposition ?? ''} disabled={busy} onChange={(e) => e.target.value && onAction({ action: 'state', disposition: e.target.value })}>
                  <option value="">Uitkomst kiezen…</option>
                  {DISPOSITIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
                {t.prospect.promoted_lead_id
                  ? <Status tone="success">In CRM sinds {dateTime(t.prospect.promoted_at)}</Status>
                  : <Button icon="users" disabled={busy} onClick={() => onAction({ action: 'promote' })}>Naar CRM (lead)</Button>}
                <div className="am-inline">
                  <Button size="sm" variant="danger" icon="mail" disabled={busy} onClick={() => onAction({ action: 'suppress', scope: 'EMAIL', reason: 'do_not_contact' })}>Adres niet meer benaderen</Button>
                  <Button size="sm" variant="danger" icon="globe" disabled={busy} onClick={() => onAction({ action: 'suppress', scope: 'DOMAIN', reason: 'do_not_contact' })}>Bedrijf uitsluiten</Button>
                </div>
                {t.suppressions.length > 0 && <Callout tone="danger">{t.suppressions.map(blockerLabel).join(' · ')}</Callout>}
              </div>
            </div>
            <div className="am-context-block">
              <h4>Context</h4>
              <KeyValue dense items={[
                ['Run', t.run.name], ['Niche', `${t.run.niche ?? '—'}${t.run.region ? ` · ${t.run.region}` : ''}`],
                ['Website', <ExtLink key="w" href={t.prospect.website} />], ['Plaats', t.prospect.city], ['Telefoon', t.prospect.phone],
                ['Fit', fit?.verdict ?? fit?.fit ?? null], ['AI-kosten', eur(Number(t.llm_spend_eur ?? 0))],
              ]} />
            </div>
            {facts.length > 0 && (
              <div className="am-context-block">
                <h4>Company Brain · feiten</h4>
                <ul className="am-list">{facts.map((f) => <li key={f.ref}>{f.statement}</li>)}</ul>
              </div>
            )}
            <div className="am-context-block">
              <h4>Tijdlijn</h4>
              <Timeline items={t.events.slice(-15).reverse().map((e) => ({ id: e.id, time: dateTime(e.created_at), text: <>{eventLabel(e.type)}{e.actor ? <span className="am-faint"> · {e.actor}</span> : null}</>, tone: EVENT_TONE(e.type) }))} />
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`)

function ThreadView({ id, onChanged, onToggleContext }: { id: string; onChanged: () => void; onToggleContext: () => void }) {
  const { api } = useAdmin()
  const res = useLoad<Thread>(useCallback(() => api.thread(id), [api, id]))
  const [draft, setDraft] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [key, setKey] = useState(newKey)
  const [ask, askDialog] = useConfirm()
  useEffect(() => {
    const pending = res.data?.messages.some((m) => m.analysis_state === 'PENDING' || m.analysis_state === 'RUNNING' || m.status === 'PENDING')
    if (!pending) return
    const timer = setTimeout(res.reload, 4000)
    return () => clearTimeout(timer)
  }, [res.data, res.reload])
  const act = async (body: Record<string, unknown>) => {
    if (body.action === 'suppress' && !(await ask({
      title: body.scope === 'DOMAIN' ? 'Bedrijf uitsluiten?' : 'Adres niet meer benaderen?',
      description: 'Lopende sequences stoppen en dit contact wordt nooit meer benaderd.', confirmLabel: 'Uitsluiten',
    }))) return null
    setBusy(true); setNotice(null)
    try {
      const r = await api.inboxAction<{ ok?: boolean; blockers?: string[]; created?: boolean }>(id, body)
      if (r && r.ok === false) setNotice(`Niet verstuurd: ${(r.blockers ?? []).map(blockerLabel).join(', ')}`)
      else if (body.action === 'promote') setNotice(r.created === false ? 'Stond al in het CRM.' : 'Toegevoegd aan het CRM (leads).')
      res.reload(); onChanged()
      return r
    } catch (e) { setNotice((e as Error).message); return null } finally { setBusy(false) }
  }
  const send = async (suggestionId: string | null) => {
    const r = await act({ action: 'reply', body: draft, idempotency_key: key, confirm: true, ...(suggestionId ? { suggestion_message_id: suggestionId } : {}) })
    setConfirm(false)
    if (r && r.ok !== false) { setDraft(''); setKey(newKey()); setNotice('Antwoord verstuurd.') }
  }
  if (!res.data) {
    return (
      <>
        <section className="am-inbox-col"><div className="am-thread">{res.error ? <ErrorState message={res.error} onRetry={res.reload} /> : <BlockSkeleton lines={8} />}</div></section>
        <aside className="am-inbox-col">{!res.error && <div className="am-context"><BlockSkeleton lines={5} /></div>}</aside>
      </>
    )
  }
  return (
    <>
      <ThreadBody t={res.data} busy={busy} draft={draft} setDraft={setDraft} confirm={confirm} setConfirm={setConfirm} onSend={(sid) => void send(sid)}
        onAction={(b) => { void act(b) }} notice={notice} onToggleContext={onToggleContext} />
      {askDialog}
    </>
  )
}

/** Inbox: list · thread · context. URL: /admin/inbox/:sendId */
export function InboxScreen({ selectedId }: { selectedId: string | null }) {
  const a = useAdmin()
  const [tab, setTab] = useState<InboxTab>('needs_action')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [contextOpen, setContextOpen] = useState(false)
  useEffect(() => { const t = setTimeout(() => setQuery(q), 300); return () => clearTimeout(t) }, [q])
  const res = useLoad<InboxPage>(useCallback(() => a.api.inbox(tab, query), [a.api, tab, query]))
  useEffect(() => { const t = setInterval(res.reload, 30_000); return () => clearInterval(t) }, [res.reload])
  const counts = res.data?.counts
  const select = (id: string | null) => a.navigate({ screen: 'inbox', id: id ?? undefined })

  return (
    <div className="am-inbox" data-testid="inbox" data-context={contextOpen ? 'open' : undefined}>
      <section className="am-inbox-col" aria-label="Gesprekken">
        <div className="am-inbox-head am-stack" style={{ gap: 10 }}>
          <div className="am-inline" style={{ justifyContent: 'space-between' }}>
            <h1 className="am-page-title" style={{ fontSize: 18 }}>Inbox</h1>
            <IconButton icon="refresh" label="Vernieuwen" onClick={res.reload} />
          </div>
          <FilterSelect label="Weergave" value={tab} onChange={(v) => { setTab(v); select(null) }}
            options={INBOX_TABS.map((x) => { const n = counts ? (x.key === 'all' ? counts.all : counts[x.key]) : null; return { value: x.key, label: `${x.label}${n ? ` · ${n}` : ''}` } })} />
          <SearchInput value={q} onChange={setQ} placeholder="Bedrijf, naam of e-mail" label="Zoek gesprekken" />
        </div>
        <div className="am-inbox-scroll">
          {res.error && !res.data && <div style={{ padding: 16 }}><ErrorState message={res.error} onRetry={res.reload} /></div>}
          {!res.data && !res.error && <div style={{ padding: 16 }}><BlockSkeleton lines={8} /></div>}
          {res.data && res.data.items.length === 0 && (
            <EmptyState framed={false} icon="inbox" title={query ? 'Geen gesprekken gevonden' : tab === 'needs_action' ? 'Niets dat actie nodig heeft' : 'Geen gesprekken'}
              text={query ? 'Pas je zoekopdracht aan.' : 'Reacties op verzonden e-mails verschijnen hier automatisch.'} />
          )}
          {res.data && res.data.items.length > 0 && <InboxList items={res.data.items} selected={selectedId} onSelect={(id) => { setContextOpen(false); select(id) }} />}
        </div>
      </section>
      {selectedId
        ? <ThreadView key={selectedId} id={selectedId} onChanged={() => { res.reload(); a.refreshCounts() }} onToggleContext={() => setContextOpen((o) => !o)} />
        : (
          <>
            <section className="am-inbox-col"><EmptyState framed={false} icon="mail" title="Kies een gesprek" text="Antwoorden worden altijd door jou verstuurd, na bevestiging." /></section>
            <aside className="am-inbox-col" aria-label="Context" />
          </>
        )}
    </div>
  )
}
