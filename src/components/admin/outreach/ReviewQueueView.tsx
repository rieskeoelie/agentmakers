'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button, Callout, EmptyState, ErrorState, ExtLink, KeyValue, LinkButton, Status, TableSkeleton, useConfirm, useLoad } from '../ds'
import { useAdmin } from '../app/AdminContext'
import { ApiError } from '../../../lib/outreach/ui/api'
import { eur } from '../../../lib/outreach/ui/format'
import { identityApprovalText, reasonLabel, REVIEW_ACTION_COPY, reviewApprovability, splitReasons } from '../../../lib/outreach/ui/review'
import type { Page, ReviewAction, ReviewQueueItem } from '../../../lib/outreach/ui/types'
import { IdentityReviewPanel } from './IdentityReviewPanel'
import { EvidenceList } from './ProspectDetailView'
import { FitChip, VerificationChip } from './ProspectsView'

/**
 * Presentational decision panel: hard blockers first (impossible to miss), then the reasons, recipient,
 * draft and evidence, with the four actions in a sticky footer.
 */
export function ReviewCard({ item, onAction, busy, message, onOpen }: {
  item: ReviewQueueItem; onAction: (a: ReviewAction) => void; busy?: boolean; message?: { kind: 'error' | 'ok'; text: string } | null; onOpen: () => void
}) {
  const { resolvable, hard } = splitReasons(item.outcome_reasons)
  const appr = reviewApprovability(item.blockers, item.identity_review)
  const blocked = !appr.approvable
  const eligReasons = item.eligibility?.reasons.filter((r) => r !== 'NO_EMAIL') ?? []
  return (
    <article className="am-decision" data-testid="review-card">
      <div className="am-decision-head">
        <div style={{ minWidth: 0 }}>
          <div className="am-inline"><span className="am-strong" style={{ fontSize: 16 }}>{item.company_name}</span><FitChip fit={item.fit?.classification ?? null} /></div>
          <div className="am-muted" style={{ marginTop: 2 }}>{item.domain}{item.city ? ` · ${item.city}` : ''} · run “{item.run_name}” · {eur(item.spent_eur)}</div>
        </div>
        <LinkButton onClick={onOpen}>Volledig profiel →</LinkButton>
      </div>

      <div className="am-decision-body">
        {blocked && (
          <div data-testid="approve-blocked">
            <Callout tone="danger" title="Goedkeuren niet mogelijk — harde regel">{appr.hard.map(reasonLabel).join(' · ')}</Callout>
          </div>
        )}
        {item.identity_review?.substantiated && <IdentityReviewPanel identity={item.identity_review} missingAfterApproval={appr.missingAfterApproval} />}

        <div>
          <h3 className="am-subhead">Waarom review?</h3>
          <ul data-testid="review-reasons" className="am-list">
            {resolvable.map((r) => <li key={r}>{reasonLabel(r)}</li>)}
            {hard.map((r) => <li key={r} style={{ color: 'var(--am-red)' }}>{reasonLabel(r)}</li>)}
            {eligReasons.map((r) => <li key={`e-${r}`} className="am-muted">{reasonLabel(r)}</li>)}
            {!resolvable.length && !hard.length && !eligReasons.length && <li className="am-muted">Geen reden opgegeven.</li>}
          </ul>
        </div>

        <div className="am-grid-2">
          <div>
            <h3 className="am-subhead">Ontvanger</h3>
            <KeyValue dense items={[
              ['Beslisser', item.contact_name ? `${item.contact_name}${item.contact_title ? ` — ${item.contact_title}` : ''}` : null],
              ['E-mail', item.email],
              ['Verificatie', <VerificationChip key="v" status={item.verification_status} eligibility={item.eligibility?.eligibility ?? null} />],
              ['Website', <ExtLink key="w" href={item.website ?? `https://${item.domain}`} />],
              ['Fit-reden', item.fit?.reason],
            ]} />
          </div>
          <div>
            <h3 className="am-subhead">Voorgestelde mail <span className="am-faint" style={{ fontWeight: 400 }}>· concept, wordt niet verzonden</span></h3>
            {item.email_draft ? (
              <div className="am-message">
                <div className="am-message-head"><span className="am-strong">{item.email_draft.subject}</span></div>
                <div className="am-message-body"><pre className="am-pre">{item.email_draft.body}</pre></div>
              </div>
            ) : <p className="am-muted" style={{ margin: 0 }}>Geen mail opgesteld.</p>}
          </div>
        </div>

        <details>
          <summary className="am-subhead" style={{ cursor: 'pointer', margin: 0 }}>Bewijs ({item.evidence.length})</summary>
          <div style={{ marginTop: 12 }}><EvidenceList evidence={item.evidence} /></div>
        </details>
      </div>

      <div className="am-decision-actions">
        <Button variant="primary" icon="check" disabled={busy || blocked} title={blocked ? 'Harde regel: kan niet worden goedgekeurd' : appr.kind === 'identity' ? 'Bevestigt de identiteit van deze kandidaat. Verstuurt niets.' : REVIEW_ACTION_COPY.APPROVE.help} onClick={() => onAction('APPROVE')}>{REVIEW_ACTION_COPY.APPROVE.label}</Button>
        <Button disabled={busy} title={REVIEW_ACTION_COPY.REJECT.help} onClick={() => onAction('REJECT')}>{REVIEW_ACTION_COPY.REJECT.label}</Button>
        <span style={{ flex: 1 }} />
        <Button variant="danger" disabled={busy} title={REVIEW_ACTION_COPY.EXCLUDE_COMPANY.help} onClick={() => onAction('EXCLUDE_COMPANY')}>{REVIEW_ACTION_COPY.EXCLUDE_COMPANY.label}</Button>
        <Button variant="danger" disabled={busy || (!item.email && !item.contact_name)} title={REVIEW_ACTION_COPY.EXCLUDE_CONTACT.help} onClick={() => onAction('EXCLUDE_CONTACT')}>{REVIEW_ACTION_COPY.EXCLUDE_CONTACT.label}</Button>
        {message && <div role="status" style={{ width: '100%', color: message.kind === 'error' ? 'var(--am-red)' : 'var(--am-green)' }}>{message.text}</div>}
      </div>
    </article>
  )
}

/** Compact queue entry. */
function QueueItem({ item, current, onSelect }: { item: ReviewQueueItem; current: boolean; onSelect: () => void }) {
  return (
    <button type="button" className="am-conv" aria-current={current ? 'true' : undefined} onClick={onSelect} data-testid="review-item">
      <div className="am-conv-top"><span className="am-conv-name">{item.company_name}</span><span className="am-conv-time">{item.city ?? ''}</span></div>
      <div className="am-conv-sub">{item.contact_name ?? 'Geen beslisser'}{item.contact_title ? ` · ${item.contact_title}` : ''}</div>
      <div className="am-conv-meta">
        <FitChip fit={item.fit?.classification ?? null} />
        {!reviewApprovability(item.blockers, item.identity_review).approvable ? <Status tone="danger">Geblokkeerd</Status>
          : item.identity_review?.substantiated ? <Status tone="warning">Bevestiging nodig</Status> : null}
      </div>
    </button>
  )
}

export function ReviewQueueView() {
  const a = useAdmin()
  const { data, error, reload } = useLoad<Page<ReviewQueueItem>>(useCallback(() => a.api.reviewQueue(0, 50), [a.api]))
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ id: string; kind: 'error' | 'ok'; text: string } | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const items = data?.items ?? []
  const current = items.find((x) => x.id === selected) ?? items[0] ?? null
  useEffect(() => { if (current && current.id !== selected) setSelected(current.id) }, [current, selected])

  const act = async (item: ReviewQueueItem, action: ReviewAction) => {
    if (action !== 'APPROVE' && !(await confirm({ title: `${REVIEW_ACTION_COPY[action].label}: ${item.company_name}?`, description: REVIEW_ACTION_COPY[action].help, confirmLabel: REVIEW_ACTION_COPY[action].label }))) return
    if (action === 'APPROVE' && item.identity_review?.substantiated) {
      // Identity approval: say exactly what is accepted (and that nothing is sent) before confirming.
      const t = identityApprovalText(item.company_name, item.identity_review, reviewApprovability(item.blockers, item.identity_review).missingAfterApproval)
      if (!(await confirm({ title: t.title, description: t.description, confirmLabel: 'Identiteit bevestigen' }))) return
    }
    setBusy(true)
    const idx = items.findIndex((x) => x.id === item.id)
    try {
      const r = await a.api.review(item.id, action)
      setMessage({ id: items[idx + 1]?.id ?? '', kind: 'ok', text: `${item.company_name}: ${r.identity_accepted ? 'identiteit bevestigd → ' : ''}${r.outcome}` })
      setSelected(items[idx + 1]?.id ?? items[idx - 1]?.id ?? null) // advance to the next decision
    } catch (e) {
      const blockers = e instanceof ApiError && Array.isArray(e.details?.blockers) ? (e.details!.blockers as string[]) : null
      setMessage({ id: item.id, kind: 'error', text: blockers ? `Niet goedgekeurd: ${blockers.map(reasonLabel).join(' · ')}` : (e as Error).message })
    } finally {
      setBusy(false); reload(); a.refreshCounts()
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Callout tone="info" icon="shield" title="Goedkeuren verstuurt niets.">
          Goedgekeurde prospects worden READY als alle regels kloppen; een bevestigde identiteit zonder bruikbaar e-mailadres blijft niet-READY. Verzenden gebeurt alleen via de verzendwachtrij als verzenden centraal aan staat. Harde regels kun je niet overrulen.
        </Callout>
      </div>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <TableSkeleton rows={5} cols={3} />}
      {data && items.length === 0 && <EmptyState icon="checkCircle" title="Niets te reviewen" text="Alle prospects zijn READY, verwerkt of nog bezig." />}
      {current && (
        <div className="am-review">
          <div className="am-review-list" role="list" aria-label="Te reviewen">
            {items.map((it) => <QueueItem key={it.id} item={it} current={it.id === current.id} onSelect={() => { setSelected(it.id); setMessage(null) }} />)}
            {data && data.total > items.length && <div className="am-table-foot">{data.total - items.length} meer — handel deze eerst af.</div>}
          </div>
          <ReviewCard key={current.id} item={current} busy={busy} message={message && (message.id === current.id || message.kind === 'ok') ? message : null}
            onAction={(x) => void act(current, x)} onOpen={() => a.navigate({ screen: 'outreach', view: 'prospect', id: current.id })} />
        </div>
      )}
      {confirmDialog}
    </div>
  )
}
