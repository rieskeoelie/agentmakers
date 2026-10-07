'use client'
import { useCallback, type ReactNode } from 'react'
import {
  BlockSkeleton, Button, Callout, DataTable, ErrorState, ExtLink, KeyValue, LinkButton, Page, PageHeader, Section, Status, Timeline, useLoad, type Column,
} from '../ds'
import { useAdmin } from '../app/AdminContext'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import { splitEvidence, STEP_LABEL, themeFacts } from '../../../lib/outreach/ui/prospects'
import { reasonLabel, reviewApprovability, splitReasons } from '../../../lib/outreach/ui/review'
import type { EvidenceItem, ProspectDetail } from '../../../lib/outreach/ui/types'
import { eventText } from './RunDetailView'
import { FitChip, LifecycleChip, VerificationChip } from './ProspectsView'
import { ProspectSendingSection } from './SendingPanel'
import { IdentityReviewPanel } from './IdentityReviewPanel'
import { EVENT_TONE } from './tones'

type Ev = Pick<EvidenceItem, 'kind' | 'ref' | 'signal' | 'statement' | 'snippet' | 'source_url' | 'strength'> & Partial<EvidenceItem>

export function FactItem({ f, cited }: { f: Ev; cited?: boolean }) {
  return (
    <div className="am-evidence" data-kind="FACT">
      <div className="am-evidence-head">
        <span className="am-evidence-kind">FEIT</span>
        {f.signal && <span className="am-tag">{f.signal}</span>}
        {f.strength && <Status tone={f.strength === 'strong' ? 'success' : 'neutral'} dot={false}>{f.strength}</Status>}
        {f.polarity === 'negative' && <Status tone="danger" dot={false}>negatief</Status>}
        {cited && <Status tone="accent" dot={false}>gebruikt in mail</Status>}
        <span>{f.ref}</span>
      </div>
      <div className="am-evidence-text">{f.statement}</div>
      {f.snippet && <div className="am-quote" style={{ margin: '6px 0 2px' }}>&ldquo;{f.snippet}&rdquo;</div>}
      <div className="am-evidence-meta">Bron: <ExtLink href={f.source_url} /></div>
    </div>
  )
}

export function InferenceItem({ i }: { i: Ev }) {
  return (
    <div className="am-evidence" data-kind="INFERENCE">
      <div className="am-evidence-head">
        <span className="am-evidence-kind">AFLEIDING</span>
        <span>{i.ref}{i.confidence ? ` · ${i.confidence}` : ''}{i.based_on?.length ? ` · gebaseerd op ${i.based_on.join(', ')}` : ''}</span>
      </div>
      <div className="am-evidence-text">{i.statement}</div>
      <div className="am-evidence-meta">Geen feit — wordt nooit als feit in een mail gebruikt.</div>
    </div>
  )
}

/** FACT (from the website, with source) and INFERENCE (reasoning, never stated as fact) are rendered differently. */
export function EvidenceList({ evidence, cited }: { evidence: Ev[]; cited?: Set<string> }) {
  const { facts, inferences } = splitEvidence(evidence)
  if (!facts.length && !inferences.length) return <p className="am-muted" style={{ margin: 0 }}>Geen bewijs opgeslagen.</p>
  return (
    <div className="am-stack" style={{ gap: 8 }}>
      {facts.length > 0 && <div className="am-faint" style={{ fontSize: 12 }}>Feiten van de website · {facts.length}</div>}
      {facts.map((f) => <FactItem key={`F-${f.ref}`} f={f} cited={cited?.has(f.ref)} />)}
      {inferences.length > 0 && <div className="am-faint" style={{ fontSize: 12, marginTop: 8 }}>Afleidingen · {inferences.length}</div>}
      {inferences.map((i) => <InferenceItem key={`I-${i.ref}`} i={i} />)}
    </div>
  )
}

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'company', label: 'Bedrijf' }, { id: 'qualification', label: 'Kwalificatie' }, { id: 'decision-maker', label: 'Beslisser' },
  { id: 'verification', label: 'E-mailverificatie' }, { id: 'brain', label: 'Company Brain' }, { id: 'evidence', label: 'Bewijs' },
  { id: 'personalization', label: 'Personalisatie' }, { id: 'outreach', label: 'Outreach' }, { id: 'providers', label: 'Providers & kosten' }, { id: 'timeline', label: 'Tijdlijn' },
]

function Block({ id, children, aside }: { id: string; children: ReactNode; aside?: ReactNode }) {
  const label = SECTIONS.find((s) => s.id === id)?.label ?? id
  return <Section id={id} anchor={`ps-${id}`} title={label} aside={aside}><div className="am-panel am-panel-pad">{children}</div></Section>
}

const none = (t: string) => <p className="am-muted" style={{ margin: 0 }}>{t}</p>

type Call = ProspectDetail['provider_calls'][number]

/** All prospect sections; `outreach` is a slot so the body stays presentational. */
export function ProspectDetailBody({ d, outreach }: { d: ProspectDetail; outreach?: ReactNode }) {
  const p = d.prospect
  const rec = p.record
  const co = p.company
  const contact = rec?.contact ?? null
  const fit = rec?.fit ?? d.company_brain?.fit ?? null
  const elig = rec?.email_eligibility ?? null
  const themes = themeFacts(d.evidence)
  const cited = new Set(rec?.hook?.hook?.evidence_ids ?? [])
  const total = d.provider_calls.reduce((s, c) => s + Number(c.cost_eur), 0)
  const { hard, resolvable } = splitReasons(p.outcome_reasons)
  const appr = reviewApprovability(d.review_blockers, d.identity_review)
  const callCols: Array<Column<Call>> = [
    { key: 't', header: 'Tijd', nowrap: true, render: (c) => <span className="am-num am-muted">{dateTime(c.called_at)}</span> },
    { key: 'p', header: 'Provider', render: (c) => <span className="am-strong">{c.provider}</span> },
    { key: 'o', header: 'Bewerking', render: (c) => c.operation },
    { key: 'r', header: 'Resultaat', render: (c) => c.result },
    { key: 'c', header: 'Kosten', align: 'right', render: (c) => <span className="am-num">{eur(c.cost_eur)}</span> },
    { key: 'd', header: 'Detail', render: (c) => <span className="am-muted" style={{ overflowWrap: 'anywhere' }}>{c.detail ?? ''}</span> },
  ]
  const timeline = [
    ...d.events.map((e) => ({ id: `e${e.id}`, at: e.created_at, text: eventText(e), tone: EVENT_TONE(e.type) })),
    ...d.review_decisions.map((r) => ({ id: `r${r.id}`, at: r.created_at, text: `Review: ${r.decision}${r.reason ? ` — ${r.reason}` : ''}`, tone: 'accent' as const })),
  ].sort((x, y) => y.at.localeCompare(x.at))

  return (
    <div className="am-split">
      <div>
        {p.outcome === 'NEEDS_REVIEW' && !appr.approvable && (
          <div data-testid="review-blockers" style={{ marginBottom: 24 }}>
            <Callout tone="danger" title="Kan niet worden goedgekeurd">{appr.hard.map(reasonLabel).join(' · ')}</Callout>
          </div>
        )}
        {p.outcome === 'NEEDS_REVIEW' && d.identity_review?.substantiated && (
          <div style={{ marginBottom: 24 }}><IdentityReviewPanel identity={d.identity_review} missingAfterApproval={appr.missingAfterApproval} /></div>
        )}
        {(hard.length > 0 || resolvable.length > 0) && p.outcome !== 'READY' && (
          <div style={{ marginBottom: 24 }} className="am-stack">
            {hard.length > 0 && p.outcome !== 'NEEDS_REVIEW' && <Callout tone="warning" title="Waarom niet READY">{hard.map(reasonLabel).join(' · ')}</Callout>}
            {resolvable.length > 0 && <Callout tone="info" title="Te beoordelen in review">{resolvable.map(reasonLabel).join(' · ')}</Callout>}
          </div>
        )}

        <Block id="company">
          <KeyValue items={[
            ['Naam', p.company_name], ['Website', <ExtLink key="w" href={co.website ?? `https://${p.domain}`} />],
            ['Locatie', [co.address, co.city, co.region, co.country].filter(Boolean).join(', ')], ['Telefoon', co.phone],
            ['Categorie', [co.category, ...(co.additional_categories ?? [])].filter(Boolean).join(', ')],
            ['Reviews', co.rating != null ? `${co.rating} (${co.review_count ?? 0})` : null],
            ['Bron', co.raw_reference ? `${co.raw_reference.provider} · ${co.raw_reference.endpoint}${co.raw_reference.rank != null ? ` · positie ${co.raw_reference.rank}` : ''}` : null],
          ]} />
        </Block>

        <Block id="qualification">
          {fit ? (
            <>
              <KeyValue items={[['Classificatie', <FitChip key="f" fit={fit.classification} />], ['Zekerheid', fit.evidence_confidence], ['Reden', fit.reason]]} />
              <div className="am-grid-2" style={{ marginTop: 16 }}>
                <div><div className="am-strong" style={{ fontSize: 12, marginBottom: 4 }}>Positieve signalen</div><ul style={{ margin: 0, paddingLeft: 18 }}>{fit.positive_signals.length ? fit.positive_signals.map((s) => <li key={s}>{s}</li>) : <li className="am-faint">geen</li>}</ul></div>
                <div><div className="am-strong" style={{ fontSize: 12, marginBottom: 4 }}>Negatieve signalen</div><ul style={{ margin: 0, paddingLeft: 18 }}>{fit.negative_signals.length ? fit.negative_signals.map((s) => <li key={s}>{s}</li>) : <li className="am-faint">geen</li>}</ul></div>
              </div>
            </>
          ) : none(`Nog geen fit bepaald (${STEP_LABEL[p.current_step] ?? p.current_step}).`)}
        </Block>

        <Block id="decision-maker">
          {contact ? (
            <KeyValue items={[
              ['Beslisser', contact.name], ['Rol', contact.title], ['Rol gevonden op', contact.title_source_url ? <ExtLink key="t" href={contact.title_source_url} /> : null],
              ['Contactbron', contact.source], ['Waarom geen contact', contact.failure_reason],
            ]} />
          ) : none('Geen contactonderzoek gedaan.')}
        </Block>

        <Block id="verification">
          {contact ? (
            <KeyValue items={[
              ['E-mail', contact.email], ['E-mailbron', contact.email_source],
              ['Verificatie', <VerificationChip key="v" status={rec?.verification_status ?? contact.verification_status} eligibility={elig?.eligibility ?? null} />],
              ['Hunter-zekerheid', contact.hunter_confidence != null ? `${contact.hunter_confidence}%` : null],
              ['Bruikbaarheid', elig ? `${elig.eligibility}${elig.reasons.length ? ` — ${elig.reasons.map(reasonLabel).join(', ')}` : ''}` : null],
              ['Algemene adressen', contact.company_generic_emails.length ? `${contact.company_generic_emails.join(', ')} (nooit een ontvanger)` : null],
            ]} />
          ) : none('Geen e-mailadres onderzocht.')}
        </Block>

        <Block id="brain">
          {d.company_brain ? (
            <>
              <div className="am-grid-2">
                {themes.map((t) => (
                  <div key={t.key}>
                    <div className="am-strong" style={{ fontSize: 12, marginBottom: 4 }}>{t.label}</div>
                    {t.facts.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{t.facts.map((f) => <li key={f.ref}>{f.statement} <span className="am-faint">({f.ref})</span></li>)}</ul> : <span className="am-faint">Niets gevonden op de website.</span>}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <KeyValue items={[
                  ['Beste invalshoek', d.company_brain.brief?.best_outreach_angle ? `${d.company_brain.brief.best_outreach_angle.signal}: ${d.company_brain.brief.best_outreach_angle.fact}` : null],
                  ['Relevante capability', d.company_brain.brief?.relevant_capability],
                  ["Pagina's onderzocht", d.company_brain.pages.map((pg) => pg.kind).join(', ')],
                  ['Genegeerde instructie-tekst', d.company_brain.quarantined_snippets.length ? `${d.company_brain.quarantined_snippets.length} fragment(en) in quarantaine` : 'geen'],
                  ['Ophaalfouten', d.company_brain.fetch_errors.length ? d.company_brain.fetch_errors.map((e) => e.url).join(', ') : 'geen'],
                ]} />
              </div>
            </>
          ) : none('Geen Company Brain (website niet onderzocht).')}
        </Block>

        <Block id="evidence"><EvidenceList evidence={d.evidence} cited={cited} /></Block>

        <Block id="personalization">
          {rec?.email ? (
            <>
              <KeyValue items={[
                ['Opening (hook)', rec.hook?.hook?.personalization_hook ?? (rec.hook?.skipped_reason ? `geen — ${rec.hook.skipped_reason}` : 'geen')],
                ['Niveau', rec.hook?.hook?.hook_level ?? null],
                ['Gebruikt bewijs', cited.size ? [...cited].join(', ') : null], ['Onderwerp', rec.email.subject],
                ['Waarschuwingen', p.warnings.length ? p.warnings.join(', ') : 'geen'],
              ]} />
              <div className="am-message" style={{ marginTop: 16 }}>
                <div className="am-message-head"><span className="am-strong">{rec.email.subject}</span><span>· {rec.email.word_count} woorden</span><span style={{ marginLeft: 'auto' }}><Status tone="warning" dot={false}>Concept — er wordt niets verzonden.</Status></span></div>
                <div className="am-message-body"><pre className="am-pre" data-testid="rendered-email">{rec.email.body}</pre></div>
              </div>
              {rec.hook && rec.hook.rejections.length > 0 && <p className="am-faint" style={{ margin: '8px 0 0', fontSize: 12 }}>Afgekeurde openingen: {rec.hook.rejections.map((r) => r.issues.join('/')).join(' · ')}</p>}
            </>
          ) : none('Geen mail opgesteld (alleen voor prospects met een bruikbaar e-mailadres).')}
        </Block>

        <Block id="outreach">{outreach ?? none('Verzendstatus wordt geladen in de volledige weergave.')}</Block>

        <Block id="providers" aside={<span className="am-num">Totaal <span className="am-strong">{eur(total)}</span></span>}>
          {(rec?.prospeo || rec?.hunter_email_before_prospeo) && (
            <p className="am-muted" style={{ margin: '0 0 12px' }}>
              {rec?.prospeo ? `Prospeo-fallback: ${rec.prospeo.result}${rec.prospeo.reason ? ` (${rec.prospeo.reason})` : ''}` : ''}
              {rec?.hunter_email_before_prospeo ? ` · eerder Hunter-adres: ${rec.hunter_email_before_prospeo}` : ''}
            </p>
          )}
          {d.provider_calls.length > 0 ? <DataTable rows={d.provider_calls} columns={callCols} rowKey={(c) => `${c.called_at}-${c.provider}-${c.operation}`} /> : none('Geen betaalde provider-calls.')}
          {contact && contact.notes.length > 0 && <ul className="am-muted" style={{ margin: '12px 0 0', paddingLeft: 18 }}>{contact.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </Block>

        <Block id="timeline"><Timeline items={timeline.map((x) => ({ id: x.id, time: dateTime(x.at), text: x.text, tone: x.tone }))} /></Block>
      </div>

      <aside>
        <div className="am-toc" aria-label="Secties">
          <div className="am-panel am-panel-pad" style={{ marginBottom: 16 }}>
            <KeyValue dense items={[
              ['Status', <LifecycleChip key="s" p={p} />], ['Fit', <FitChip key="f" fit={fit?.classification ?? null} />],
              ['Beslisser', contact?.name], ['E-mail', p.email], ['Kosten', eur(p.spent_eur)], ['Bijgewerkt', dateTime(p.updated_at)],
            ]} />
          </div>
          {SECTIONS.map((s) => <a key={s.id} href={`#ps-${s.id}`}>{s.label}</a>)}
        </div>
      </aside>
    </div>
  )
}

/** Full page: /admin/outreach/prospects/:id */
export function ProspectDetailScreen({ prospectId }: { prospectId: string }) {
  const a = useAdmin()
  const { data: d, error, reload } = useLoad<ProspectDetail>(useCallback(() => a.api.getProspect(prospectId), [a.api, prospectId]))
  const toList = () => a.navigate({ screen: 'outreach', view: 'prospects' })
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: 'Outreach', onClick: () => a.navigate({ screen: 'outreach', view: 'runs' }) }, { label: 'Prospects', onClick: toList }]}
        title={d ? d.prospect.company_name : 'Prospect'} status={d ? <LifecycleChip p={d.prospect} /> : undefined}
        subtitle={d ? <>{d.prospect.domain} · run <LinkButton onClick={() => a.navigate({ screen: 'outreach', view: 'run', id: d.run.id })}>{d.run.name}</LinkButton></> : undefined}
        actions={d?.prospect.outcome === 'NEEDS_REVIEW' ? <Button variant="primary" iconRight="chevronRight" onClick={() => a.navigate({ screen: 'outreach', view: 'review' })}>Naar review</Button> : undefined} />
      {error && !d && <ErrorState message={error} onRetry={reload} />}
      {!d && !error && <BlockSkeleton lines={10} />}
      {d && <ProspectDetailBody d={d} outreach={<ProspectSendingSection prospectId={prospectId} />} />}
    </Page>
  )
}
