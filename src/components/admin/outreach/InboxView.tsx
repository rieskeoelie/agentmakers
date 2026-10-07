'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OutreachApi } from '../../../lib/outreach/ui/api'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import {
  blockerLabel, CLASS_META, DISPOSITIONS, INBOX_TABS, latestSuggestion, replyProblems, SEND_STATE_META, stepProgress,
  type InboxItem, type InboxPage, type InboxTab, type ReplyClass, type SendState, type Thread, type ThreadMessage,
} from '../../../lib/outreach/ui/sending'
import { Btn, C, Chip, EmptyState, ErrorBox, ExtLink, input, KeyValue, Loading, panel, SectionTitle, useLoad } from './ui'

const TONE: Record<string, { color: string; bg: string }> = {
  green: { color: C.green, bg: C.greenBg }, amber: { color: C.amber, bg: C.amberBg }, red: { color: C.red, bg: C.redBg },
  blue: { color: C.blue, bg: C.blueBg }, muted: { color: C.muted, bg: '#F1F5F9' },
}

export function SendStateChip({ state }: { state: SendState }) {
  const m = SEND_STATE_META[state]
  return <Chip {...TONE[m.tone]}>{m.label}</Chip>
}

export function ClassChip({ c }: { c: ReplyClass | null }) {
  if (!c) return null
  const m = CLASS_META[c]
  return <Chip {...TONE[m.tone]}>{m.label}</Chip>
}

/** Conversation list (presentational). */
export function InboxList({ items, selected, onSelect }: { items: InboxItem[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div data-testid="inbox-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((i) => (
        <button key={i.id} onClick={() => onSelect(i.id)} aria-current={selected === i.id ? 'true' : undefined}
          style={{ textAlign: 'left', ...panel, padding: 10, cursor: 'pointer', borderColor: selected === i.id ? C.teal : C.line, background: i.inbox_status === 'NEEDS_ACTION' ? '#F0FDFA' : C.panel }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: '.85rem', color: C.ink }}>{i.company_name}</strong>
            <span style={{ fontSize: '.72rem', color: C.faint, whiteSpace: 'nowrap' }}>{dateTime(i.last_message?.at ?? i.queued_at)}</span>
          </div>
          <div style={{ fontSize: '.76rem', color: C.muted }}>{i.contact_name ?? '—'} · {i.email}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '4px 0' }}>
            <SendStateChip state={i.state} />
            <ClassChip c={i.classification} />
            {i.promoted_lead_id && <Chip color={C.green} bg={C.greenBg}>In CRM</Chip>}
          </div>
          {i.last_message && <div style={{ fontSize: '.76rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {i.last_message.direction === 'INBOUND' ? '↩ ' : '→ '}{i.last_message.preview || '(leeg)'}</div>}
        </button>
      ))}
    </div>
  )
}

function MessageBubble({ m }: { m: ThreadMessage }) {
  const inbound = m.direction === 'INBOUND'
  const label = inbound ? 'Reactie' : m.kind === 'MANUAL_REPLY' ? 'Handmatig antwoord' : `Stap ${m.sequence_number ?? '?'}`
  return (
    <div data-testid="thread-message" style={{ alignSelf: inbound ? 'flex-start' : 'flex-end', maxWidth: '88%', background: inbound ? '#fff' : '#F0FDFA',
      border: `1px solid ${inbound ? C.line : '#99F6E4'}`, borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.72rem', color: C.muted, marginBottom: 4, flexWrap: 'wrap' }}>
        <strong style={{ color: C.text }}>{label}</strong>
        <span>{dateTime(m.occurred_at)}</span>
        {m.status === 'PENDING' && <Chip color={C.amber} bg={C.amberBg}>wordt verzonden</Chip>}
        {m.status === 'FAILED' && <Chip color={C.red} bg={C.redBg}>mislukt</Chip>}
        {inbound && <ClassChip c={m.classification} />}
      </div>
      {m.subject && <div style={{ fontSize: '.78rem', fontWeight: 700, color: C.ink, marginBottom: 2 }}>{m.subject}</div>}
      <div style={{ fontSize: '.84rem', color: C.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body_text ?? ''}</div>
      {m.error && <div style={{ fontSize: '.74rem', color: C.red, marginTop: 4 }}>{m.error}</div>}
    </div>
  )
}

/** Thread body (presentational). Sending a reply always needs an explicit second click (confirm). */
export function ThreadBody({ t, busy, draft, setDraft, confirm, setConfirm, onSend, onAction, notice }: {
  t: Thread; busy: boolean; draft: string; setDraft: (s: string) => void; confirm: boolean; setConfirm: (b: boolean) => void
  onSend: (suggestionId: string | null) => void; onAction: (body: Record<string, unknown>) => void; notice: string | null
}) {
  const s = t.send
  const suggestion = latestSuggestion(t.messages)
  const lastIn = [...t.messages].reverse().find((m) => m.direction === 'INBOUND') ?? null
  const problems = replyProblems(draft)
  const canReply = !!lastIn && !['BOUNCED', 'UNSUBSCRIBED'].includes(s.state)
  const facts = t.evidence.filter((e) => e.kind === 'FACT').slice(0, 6)
  const fit = t.prospect.fit
  return (
    <div data-testid="thread" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...panel, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, color: C.ink }}>{t.prospect.company_name}</div>
              <div style={{ fontSize: '.8rem', color: C.muted }}>{t.prospect.contact_name ?? '—'}{t.prospect.contact_title ? ` · ${t.prospect.contact_title}` : ''} · {s.email}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <SendStateChip state={s.state} />
              <Chip>{stepProgress(s)} stappen</Chip>
              {s.disposition && <Chip color={C.blue} bg={C.blueBg}>{DISPOSITIONS.find((d) => d.value === s.disposition)?.label ?? s.disposition}</Chip>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {t.messages.length === 0 && <div style={{ fontSize: '.84rem', color: C.muted }}>Nog geen berichten. De sequence start volgens het verzendschema.</div>}
          {t.messages.map((m) => <MessageBubble key={m.id} m={m} />)}
        </div>

        {lastIn && (
          <div style={{ ...panel, marginBottom: 10, background: '#FAFAF9' }} data-testid="ai-analysis">
            <SectionTitle>AI-analyse <span style={{ fontWeight: 400, fontSize: '.75rem', color: C.muted }}>(alleen suggestie — AI verstuurt nooit zelf)</span></SectionTitle>
            {lastIn.analysis_state === 'PENDING' || lastIn.analysis_state === 'RUNNING' ? <div style={{ fontSize: '.82rem', color: C.muted }}>Wordt geanalyseerd…</div> : (
              <KeyValue items={[
                ['Classificatie', <span key="c"><ClassChip c={lastIn.classification} /> {lastIn.classification_source === 'rules' ? '(regel)' : lastIn.classification_confidence !== null ? `(${Math.round(Number(lastIn.classification_confidence) * 100)}% zeker)` : ''}</span>],
                ['Samenvatting', lastIn.summary ?? '—'],
                ['Suggestie', lastIn.suggested_reply_status === 'REJECTED' ? `Afgekeurd door claimcontrole (${(lastIn.suggested_reply_issues ?? []).join(', ')})` : lastIn.suggested_reply_status === 'READY' ? 'Klaar om te gebruiken' : lastIn.suggested_reply_status === 'USED' ? 'Gebruikt' : 'Geen'],
              ]} />
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {suggestion && <Btn small kind="primary" disabled={busy} onClick={() => { setDraft(suggestion.suggested_reply ?? ''); setConfirm(false) }}>Gebruik suggestie</Btn>}
              <Btn small disabled={busy} onClick={() => onAction({ action: 'reanalyze', message_id: lastIn.id })}>Opnieuw analyseren</Btn>
            </div>
          </div>
        )}

        <div style={panel}>
          <SectionTitle>Antwoord</SectionTitle>
          {!canReply && <div style={{ fontSize: '.82rem', color: C.muted, marginBottom: 6 }}>Antwoorden kan zodra de prospect heeft gereageerd (niet na bounce/afmelding).</div>}
          <textarea aria-label="Antwoord" value={draft} disabled={!canReply || busy} onChange={(e) => { setDraft(e.target.value); setConfirm(false) }} rows={7}
            style={{ ...input, width: '100%', resize: 'vertical', boxSizing: 'border-box' }} placeholder="Schrijf of bewerk je antwoord…" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {!confirm
              ? <Btn kind="primary" disabled={!canReply || busy || problems.length > 0} onClick={() => setConfirm(true)}>Verstuur…</Btn>
              : <>
                  <Btn kind="primary" disabled={busy} onClick={() => onSend(suggestion && draft.trim() === (suggestion.suggested_reply ?? '').trim() ? suggestion.id : null)}>Bevestig: verstuur naar {s.email}</Btn>
                  <Btn kind="ghost" disabled={busy} onClick={() => setConfirm(false)}>Annuleer</Btn>
                </>}
            {draft && problems.length > 0 && <span style={{ fontSize: '.76rem', color: C.red }}>{problems.join(' ')}</span>}
          </div>
          {notice && <div role="status" style={{ fontSize: '.8rem', color: C.text, marginTop: 6 }}>{notice}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={panel}>
          <SectionTitle>Acties</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <select aria-label="Status" value={s.disposition ?? ''} disabled={busy} style={input}
              onChange={(e) => e.target.value && onAction({ action: 'state', disposition: e.target.value })}>
              <option value="">Uitkomst kiezen…</option>
              {DISPOSITIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {s.inbox_status !== 'DONE' && <Btn small disabled={busy} onClick={() => onAction({ action: 'state', inbox_status: 'DONE' })}>Afgehandeld</Btn>}
              {s.inbox_status === 'DONE' && <Btn small disabled={busy} onClick={() => onAction({ action: 'state', inbox_status: 'NEEDS_ACTION' })}>Heropenen</Btn>}
              {t.prospect.promoted_lead_id
                ? <Chip color={C.green} bg={C.greenBg}>In CRM ({dateTime(t.prospect.promoted_at)})</Chip>
                : <Btn small kind="primary" disabled={busy} onClick={() => onAction({ action: 'promote' })}>Naar CRM (lead)</Btn>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn small kind="danger" disabled={busy} onClick={() => onAction({ action: 'suppress', scope: 'EMAIL', reason: 'do_not_contact' })}>Adres niet meer benaderen</Btn>
              <Btn small kind="danger" disabled={busy} onClick={() => onAction({ action: 'suppress', scope: 'DOMAIN', reason: 'do_not_contact' })}>Bedrijf uitsluiten</Btn>
            </div>
            {t.suppressions.length > 0 && <div style={{ fontSize: '.76rem', color: C.red }}>{t.suppressions.map(blockerLabel).join(' · ')}</div>}
          </div>
        </div>
        <div style={panel}>
          <SectionTitle>Context</SectionTitle>
          <KeyValue items={[
            ['Run', t.run.name], ['Niche', `${t.run.niche ?? '—'}${t.run.region ? ` · ${t.run.region}` : ''}`],
            ['Website', <ExtLink key="w" href={t.prospect.website} />], ['Plaats', t.prospect.city ?? '—'],
            ['Fit', fit?.verdict ?? fit?.fit ?? '—'], ['AI-kosten', eur(Number(t.llm_spend_eur ?? 0))],
          ]} />
          {facts.length > 0 && <>
            <div style={{ fontSize: '.74rem', fontWeight: 700, color: C.muted, margin: '10px 0 4px' }}>COMPANY BRAIN — FEITEN</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: '.8rem', color: C.text }}>{facts.map((f) => <li key={f.ref}>{f.statement}</li>)}</ul>
          </>}
        </div>
        <div style={panel}>
          <SectionTitle>Tijdlijn</SectionTitle>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: '.76rem', color: C.muted, maxHeight: 220, overflow: 'auto' }}>
            {t.events.slice(-25).reverse().map((e) => <li key={e.id}>{dateTime(e.created_at)} — {e.type}{e.actor ? ` (${e.actor})` : ''}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`)

function ThreadView({ api, id, onChanged }: { api: OutreachApi; id: string; onChanged: () => void }) {
  const res = useLoad<Thread>(useCallback(() => api.thread(id), [api, id]))
  const [draft, setDraft] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [key, setKey] = useState(newKey)
  useEffect(() => {
    const pending = res.data?.messages.some((m) => m.analysis_state === 'PENDING' || m.analysis_state === 'RUNNING' || m.status === 'PENDING')
    if (!pending) return
    const timer = setTimeout(res.reload, 4000)
    return () => clearTimeout(timer)
  }, [res.data, res.reload])
  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    setNotice(null)
    try {
      const r = await api.inboxAction<{ ok?: boolean; blockers?: string[]; created?: boolean }>(id, body)
      if (r && r.ok === false) setNotice(`Niet verstuurd: ${(r.blockers ?? []).map(blockerLabel).join(', ')}`)
      else if (body.action === 'promote') setNotice(r.created === false ? 'Stond al in het CRM.' : 'Toegevoegd aan het CRM (leads).')
      res.reload()
      onChanged()
      return r
    } catch (e) {
      setNotice((e as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }
  const send = async (suggestionId: string | null) => {
    const r = await act({ action: 'reply', body: draft, idempotency_key: key, confirm: true, ...(suggestionId ? { suggestion_message_id: suggestionId } : {}) })
    setConfirm(false)
    if (r && r.ok !== false) {
      setDraft('')
      setKey(newKey())
      setNotice('Antwoord verstuurd.')
    }
  }
  if (res.error && !res.data) return <ErrorBox message={res.error} onRetry={res.reload} />
  if (!res.data) return <Loading />
  return <ThreadBody t={res.data} busy={busy} draft={draft} setDraft={setDraft} confirm={confirm} setConfirm={setConfirm} onSend={send} onAction={(b) => { void act(b) }} notice={notice} />
}

export function InboxView({ api, onChanged }: { api: OutreachApi; onChanged?: () => void }) {
  const [tab, setTab] = useState<InboxTab>('needs_action')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const res = useLoad<InboxPage>(useCallback(() => api.inbox(tab, q), [api, tab, q]))
  const counts = res.data?.counts
  const label = useMemo(() => (k: InboxTab) => {
    const n = counts ? (k === 'all' ? counts.all : counts[k]) : null
    return `${INBOX_TABS.find((x) => x.key === k)!.label}${n ? ` (${n})` : ''}`
  }, [counts])
  return (
    <div data-testid="inbox">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {INBOX_TABS.map((x) => <Btn key={x.key} small kind={tab === x.key ? 'primary' : 'secondary'} onClick={() => { setTab(x.key); setSelected(null) }}>{label(x.key)}</Btn>)}
        <input aria-label="Zoeken" placeholder="Zoek bedrijf, naam of e-mail" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, minWidth: 220 }} />
      </div>
      {res.error && <ErrorBox message={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Loading />}
      {res.data && res.data.items.length === 0 && <EmptyState title="Geen gesprekken" text="Reacties op verzonden e-mails verschijnen hier automatisch." />}
      {res.data && res.data.items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
          <InboxList items={res.data.items} selected={selected} onSelect={setSelected} />
          <div>{selected ? <ThreadView key={selected} api={api} id={selected} onChanged={() => { res.reload(); onChanged?.() }} /> : <EmptyState title="Kies een gesprek" />}</div>
        </div>
      )}
    </div>
  )
}
