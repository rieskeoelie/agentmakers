'use client'
import { useCallback, useState } from 'react'
import { ApiError, type OutreachApi } from '../../../lib/outreach/ui/api'
import { eur } from '../../../lib/outreach/ui/format'
import { verificationLabel } from '../../../lib/outreach/ui/prospects'
import { reasonLabel, REVIEW_ACTION_COPY, splitReasons } from '../../../lib/outreach/ui/review'
import type { Page, ReviewAction, ReviewQueueItem } from '../../../lib/outreach/ui/types'
import { EvidenceList } from './ProspectDetailView'
import { FitChip } from './ProspectsView'
import { Btn, C, Chip, EmptyState, ErrorBox, ExtLink, KeyValue, Loading, panel, useLoad } from './ui'

/** Presentational review card: everything needed to decide, plus the actions. */
export function ReviewCard({ item, onAction, busy, message, onOpen }: {
  item: ReviewQueueItem; onAction: (a: ReviewAction) => void; busy?: boolean; message?: { kind: 'error' | 'ok'; text: string } | null; onOpen: () => void
}) {
  const { resolvable, hard } = splitReasons(item.outcome_reasons)
  const blocked = item.blockers.length > 0
  const v = verificationLabel(item.verification_status, item.eligibility?.eligibility)
  return (
    <article data-testid="review-card" style={{ ...panel, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <button onClick={onOpen} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 800, fontSize: '.95rem', color: C.ink, fontFamily: 'inherit' }}>{item.company_name}</button>
          <div style={{ fontSize: '.76rem', color: C.muted }}>{item.domain}{item.city ? ` · ${item.city}` : ''} · run “{item.run_name}” · {eur(item.spent_eur)}</div>
        </div>
        <FitChip fit={item.fit?.classification ?? null} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 10 }}>
        <div>
          <KeyValue items={[
            ['Beslisser', item.contact_name ? `${item.contact_name}${item.contact_title ? ` — ${item.contact_title}` : ''}` : '—'],
            ['E-mail', item.email ?? '—'],
            ['Verificatie', <Chip key="v" color={v.tone === 'good' ? C.green : v.tone === 'bad' ? C.red : C.amber} bg={v.tone === 'good' ? C.greenBg : v.tone === 'bad' ? C.redBg : C.amberBg}>{v.label}</Chip>],
            ['Website', <ExtLink key="w" href={item.website ?? `https://${item.domain}`} />],
            ['Fit-reden', item.fit?.reason ?? '—'],
          ]} />
          <div style={{ marginTop: 10, fontSize: '.8rem' }}>
            <strong>Waarom review?</strong>
            <ul data-testid="review-reasons" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {resolvable.map((r) => <li key={r} style={{ color: C.amber }}>{reasonLabel(r)}</li>)}
              {hard.map((r) => <li key={r} style={{ color: C.red }}>{reasonLabel(r)}</li>)}
              {item.eligibility?.reasons.filter((r) => r !== 'NO_EMAIL').map((r) => <li key={`e-${r}`} style={{ color: C.muted }}>{reasonLabel(r)}</li>)}
            </ul>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '.78rem', fontWeight: 700, color: C.muted, marginBottom: 4 }}>VOORGESTELDE MAIL (concept — wordt niet verzonden)</div>
          {item.email_draft ? (
            <div style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, fontSize: '.82rem' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.email_draft.subject}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{item.email_draft.body}</div>
            </div>
          ) : <div style={{ color: C.muted, fontSize: '.82rem' }}>Geen mail opgesteld.</div>}
        </div>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: '.8rem', fontWeight: 700, color: C.teal }}>Bewijs ({item.evidence.length})</summary>
        <div style={{ marginTop: 8 }}><EvidenceList evidence={item.evidence} /></div>
      </details>

      {blocked && (
        <div data-testid="approve-blocked" style={{ marginTop: 10, background: C.redBg, color: C.red, borderRadius: 8, padding: '6px 10px', fontSize: '.8rem' }}>
          <strong>Goedkeuren niet mogelijk:</strong> {item.blockers.map(reasonLabel).join(' · ')}
        </div>
      )}
      {message && <div style={{ marginTop: 8, fontSize: '.8rem', color: message.kind === 'error' ? C.red : C.green }}>{message.text}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Btn kind="primary" disabled={busy || blocked} title={blocked ? 'Harde regel: kan niet worden goedgekeurd' : REVIEW_ACTION_COPY.APPROVE.help} onClick={() => onAction('APPROVE')}>{REVIEW_ACTION_COPY.APPROVE.label}</Btn>
        <Btn disabled={busy} title={REVIEW_ACTION_COPY.REJECT.help} onClick={() => onAction('REJECT')}>{REVIEW_ACTION_COPY.REJECT.label}</Btn>
        <Btn kind="danger" disabled={busy} title={REVIEW_ACTION_COPY.EXCLUDE_COMPANY.help} onClick={() => onAction('EXCLUDE_COMPANY')}>{REVIEW_ACTION_COPY.EXCLUDE_COMPANY.label}</Btn>
        <Btn kind="danger" disabled={busy || (!item.email && !item.contact_name)} title={REVIEW_ACTION_COPY.EXCLUDE_CONTACT.help} onClick={() => onAction('EXCLUDE_CONTACT')}>{REVIEW_ACTION_COPY.EXCLUDE_CONTACT.label}</Btn>
      </div>
      <div style={{ fontSize: '.72rem', color: C.faint, marginTop: 6 }}>Mail bewerken komt in een volgende fase.</div>
    </article>
  )
}

export function ReviewQueueView({ api, onOpen, onChanged }: { api: OutreachApi; onOpen: (id: string) => void; onChanged?: () => void }) {
  const { data, error, reload } = useLoad<Page<ReviewQueueItem>>(useCallback(() => api.reviewQueue(0, 20), [api]))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, { kind: 'error' | 'ok'; text: string }>>({})
  const load = () => { reload(); onChanged?.() }

  const act = async (item: ReviewQueueItem, a: ReviewAction) => {
    if (a !== 'APPROVE' && typeof window !== 'undefined' && !window.confirm(`${REVIEW_ACTION_COPY[a].label}: ${item.company_name}?\n${REVIEW_ACTION_COPY[a].help}`)) return
    setBusyId(item.id)
    try {
      const r = await api.review(item.id, a)
      setMessages((m) => ({ ...m, [item.id]: { kind: 'ok', text: `Opgeslagen: ${r.outcome}` } }))
      load()
    } catch (e) {
      const blockers = e instanceof ApiError && Array.isArray(e.details?.blockers) ? (e.details!.blockers as string[]) : null
      setMessages((m) => ({ ...m, [item.id]: { kind: 'error', text: blockers ? `Niet goedgekeurd: ${blockers.map(reasonLabel).join(' · ')}` : (e as Error).message } }))
      load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div style={{ fontSize: '.85rem', color: C.muted, marginBottom: 10 }}>
        Prospects met status NEEDS_REVIEW. Je kunt review-gevallen oplossen; harde regels (algemeen adres, ongeldig adres, uitgesloten contact, dubbel contact, niet-onderbouwde claims) kun je niet overrulen. <strong>Goedkeuren verstuurt niets.</strong>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && <EmptyState title="Niets te reviewen" text="Alle prospects zijn READY, verwerkt of nog bezig." />}
      {data && data.items.map((it) => (
        <ReviewCard key={it.id} item={it} busy={busyId === it.id} message={messages[it.id] ?? null} onAction={(a) => void act(it, a)} onOpen={() => onOpen(it.id)} />
      ))}
      {data && data.total > data.items.length && <div style={{ fontSize: '.8rem', color: C.muted }}>{data.total - data.items.length} meer — handel deze eerst af.</div>}
    </div>
  )
}
