'use client'
import { ProspectSendingSection } from './SendingPanel'
import { useCallback, type ReactNode } from 'react'
import type { OutreachApi } from '../../../lib/outreach/ui/api'
import { dateTime, eur } from '../../../lib/outreach/ui/format'
import { splitEvidence, STEP_LABEL, themeFacts, verificationLabel } from '../../../lib/outreach/ui/prospects'
import { reasonLabel } from '../../../lib/outreach/ui/review'
import type { EvidenceItem, ProspectDetail } from '../../../lib/outreach/ui/types'
import { eventText } from './RunDetailView'
import { FitChip, LifecycleChip } from './ProspectsView'
import { Btn, C, Chip, ErrorBox, ExtLink, KeyValue, Loading, panel, tableWrap, td, th, useLoad } from './ui'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-section={id} style={{ ...panel, marginTop: 12 }}>
      <h3 style={{ margin: '0 0 10px', fontFamily: "'Poppins',sans-serif", fontSize: '.92rem' }}><span style={{ color: C.teal, marginRight: 6 }}>{id}</span>{title}</h3>
      {children}
    </section>
  )
}

/** FACT (from the website, with source) and INFERENCE (reasoning, never stated as fact) are rendered differently. */
export function EvidenceList({ evidence }: { evidence: Array<Pick<EvidenceItem, 'kind' | 'ref' | 'signal' | 'statement' | 'snippet' | 'source_url' | 'strength'> & Partial<EvidenceItem>> }) {
  const { facts, inferences } = splitEvidence(evidence)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {facts.length === 0 && inferences.length === 0 && <div style={{ color: C.muted, fontSize: '.82rem' }}>Geen bewijs opgeslagen.</div>}
      {facts.map((f) => (
        <div key={`F-${f.ref}`} data-kind="FACT" style={{ borderLeft: `3px solid ${C.teal}`, background: '#F0FDFA', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
            <Chip color="#fff" bg={C.teal}>FEIT</Chip>
            {f.signal && <Chip>{f.signal}</Chip>}
            {f.strength && <Chip color={f.strength === 'strong' ? C.green : C.muted} bg={f.strength === 'strong' ? C.greenBg : '#F1F5F9'}>{f.strength}</Chip>}
            {f.polarity === 'negative' && <Chip color={C.red} bg={C.redBg}>negatief</Chip>}
            <span style={{ fontSize: '.72rem', color: C.faint }}>{f.ref}</span>
          </div>
          <div style={{ fontSize: '.84rem', color: C.ink }}>{f.statement}</div>
          {f.snippet && <blockquote style={{ margin: '6px 0 4px', padding: '4px 8px', borderLeft: `2px solid ${C.line}`, color: C.text, fontSize: '.8rem', fontStyle: 'italic' }}>&ldquo;{f.snippet}&rdquo;</blockquote>}
          <div style={{ fontSize: '.74rem' }}>Bron: <ExtLink href={f.source_url} /></div>
        </div>
      ))}
      {inferences.map((i) => (
        <div key={`I-${i.ref}`} data-kind="INFERENCE" style={{ border: `1px dashed #CBD5E1`, background: '#fff', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <Chip color={C.muted} bg="#F1F5F9">AFLEIDING</Chip>
            <span style={{ fontSize: '.72rem', color: C.faint }}>{i.ref}{i.confidence ? ` · ${i.confidence}` : ''}{i.based_on?.length ? ` · gebaseerd op ${i.based_on.join(', ')}` : ''}</span>
          </div>
          <div style={{ fontSize: '.84rem', color: C.text, fontStyle: 'italic' }}>{i.statement}</div>
          <div style={{ fontSize: '.72rem', color: C.faint, marginTop: 2 }}>Geen feit — wordt nooit als feit in een mail gebruikt.</div>
        </div>
      ))}
    </div>
  )
}

export function ProspectDetailBody({ d }: { d: ProspectDetail }) {
  const p = d.prospect
  const rec = p.record
  const co = p.company
  const contact = rec?.contact ?? null
  const fit = rec?.fit ?? d.company_brain?.fit ?? null
  const elig = rec?.email_eligibility ?? null
  const v = verificationLabel(rec?.verification_status ?? contact?.verification_status, elig?.eligibility)
  const themes = themeFacts(d.evidence)
  const cited = new Set(rec?.hook?.hook?.evidence_ids ?? [])
  const total = d.provider_calls.reduce((s, c) => s + Number(c.cost_eur), 0)
  return (
    <div>
      <div style={{ ...panel, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.15rem', margin: 0 }}>{p.company_name}</h2>
          <div style={{ fontSize: '.8rem', color: C.muted }}>{p.domain} · run “{d.run.name}”</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <LifecycleChip p={p} /><FitChip fit={fit?.classification ?? null} />
          {p.outcome_reasons.length > 0 && <span style={{ fontSize: '.78rem', color: C.text }}>{p.outcome_reasons.map(reasonLabel).join(' · ')}</span>}
        </div>
      </div>
      {p.outcome === 'NEEDS_REVIEW' && d.review_blockers.length > 0 && (
        <div data-testid="review-blockers" style={{ marginTop: 10, background: C.redBg, color: C.red, borderRadius: 8, padding: '8px 12px', fontSize: '.82rem' }}>
          <strong>Kan niet worden goedgekeurd:</strong> {d.review_blockers.map(reasonLabel).join(' · ')}
        </div>
      )}

      <Section id="A" title="Bedrijf">
        <KeyValue items={[
          ['Naam', p.company_name], ['Website', <ExtLink key="w" href={co.website ?? `https://${p.domain}`} />], ['Domein', p.domain],
          ['Locatie', [co.address, co.city, co.region, co.country].filter(Boolean).join(', ') || '—'], ['Telefoon', co.phone ?? '—'],
          ['Categorie', [co.category, ...(co.additional_categories ?? [])].filter(Boolean).join(', ') || '—'],
          ['Reviews', co.rating != null ? `${co.rating} (${co.review_count ?? 0})` : '—'],
          ['Bron', co.raw_reference ? `${co.raw_reference.provider} · ${co.raw_reference.endpoint}${co.raw_reference.rank != null ? ` · positie ${co.raw_reference.rank}` : ''}` : '—'],
        ]} />
      </Section>

      <Section id="B" title="Fit">
        {fit ? (
          <>
            <KeyValue items={[['Classificatie', <FitChip key="f" fit={fit.classification} />], ['Zekerheid', fit.evidence_confidence], ['Reden', fit.reason]]} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10, fontSize: '.8rem' }}>
              <div><strong style={{ color: C.green }}>Positieve signalen</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{fit.positive_signals.length ? fit.positive_signals.map((s) => <li key={s}>{s}</li>) : <li style={{ color: C.faint }}>geen</li>}</ul></div>
              <div><strong style={{ color: C.red }}>Negatieve signalen</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{fit.negative_signals.length ? fit.negative_signals.map((s) => <li key={s}>{s}</li>) : <li style={{ color: C.faint }}>geen</li>}</ul></div>
            </div>
          </>
        ) : <div style={{ color: C.muted, fontSize: '.82rem' }}>Nog geen fit bepaald ({STEP_LABEL[p.current_step] ?? p.current_step}).</div>}
      </Section>

      <Section id="C" title="Company Brain">
        {d.company_brain ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {themes.map((t) => (
                <div key={t.key} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: '.8rem', marginBottom: 4 }}>{t.label}</div>
                  {t.facts.length ? <ul style={{ margin: 0, paddingLeft: 16, fontSize: '.8rem' }}>{t.facts.map((f) => <li key={f.ref}>{f.statement}</li>)}</ul> : <div style={{ fontSize: '.78rem', color: C.faint }}>Niets gevonden op de website.</div>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <KeyValue items={[
                ['Diensten', [co.category, ...(co.additional_categories ?? [])].filter(Boolean).join(', ') || '—'],
                ['Beste invalshoek', d.company_brain.brief?.best_outreach_angle ? `${d.company_brain.brief.best_outreach_angle.signal}: ${d.company_brain.brief.best_outreach_angle.fact}` : '—'],
                ['Relevante capability', d.company_brain.brief?.relevant_capability ?? '—'],
                ["Pagina's onderzocht", d.company_brain.pages.map((pg) => pg.kind).join(', ') || '—'],
                ['Genegeerde instructie-tekst', d.company_brain.quarantined_snippets.length ? `${d.company_brain.quarantined_snippets.length} fragment(en) in quarantaine` : 'geen'],
              ]} />
            </div>
          </>
        ) : <div style={{ color: C.muted, fontSize: '.82rem' }}>Geen Company Brain (website niet onderzocht).</div>}
      </Section>

      <Section id="D" title="Bewijs">
        <EvidenceList evidence={d.evidence} />
      </Section>

      <Section id="E" title="Contact">
        {contact ? (
          <KeyValue items={[
            ['Beslisser', contact.name ?? '—'], ['Rol', contact.title ?? '—'], ['Rol gevonden op', contact.title_source_url ? <ExtLink key="t" href={contact.title_source_url} /> : '—'],
            ['Contactbron', contact.source], ['E-mail', contact.email ?? '—'], ['E-mailbron', contact.email_source],
            ['Verificatie', <Chip key="v" color={v.tone === 'good' ? C.green : v.tone === 'bad' ? C.red : C.amber} bg={v.tone === 'good' ? C.greenBg : v.tone === 'bad' ? C.redBg : C.amberBg}>{v.label}</Chip>],
            ['Bruikbaarheid', elig ? `${elig.eligibility}${elig.reasons.length ? ` — ${elig.reasons.map(reasonLabel).join(', ')}` : ''}` : '—'],
            ['Algemene adressen', contact.company_generic_emails.length ? `${contact.company_generic_emails.join(', ')} (nooit een ontvanger)` : '—'],
            ['Waarom geen contact', contact.failure_reason ?? '—'],
          ]} />
        ) : <div style={{ color: C.muted, fontSize: '.82rem' }}>Geen contactonderzoek gedaan.</div>}
      </Section>

      <Section id="F" title="Outreach">
        {rec?.email ? (
          <>
            <KeyValue items={[
              ['Opening (hook)', rec.hook?.hook?.personalization_hook ?? (rec.hook?.skipped_reason ? `geen — ${rec.hook.skipped_reason}` : 'geen')],
              ['Gebruikt bewijs', cited.size ? [...cited].join(', ') : '—'], ['Onderwerp', rec.email.subject],
              ['Resultaat', <LifecycleChip key="s" p={p} />], ['Waarschuwingen', p.warnings.length ? p.warnings.join(', ') : 'geen'],
            ]} />
            <pre data-testid="rendered-email" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '.84rem', background: C.soft, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginTop: 10 }}>{rec.email.body}</pre>
            <div style={{ fontSize: '.75rem', color: C.amber, fontWeight: 700 }}>Concept — er wordt niets verzonden.</div>
            {rec.hook && rec.hook.rejections.length > 0 && <div style={{ fontSize: '.75rem', color: C.muted, marginTop: 4 }}>Afgekeurde openingen: {rec.hook.rejections.map((r) => r.issues.join('/')).join(' · ')}</div>}
          </>
        ) : <div style={{ color: C.muted, fontSize: '.82rem' }}>Geen mail opgesteld (alleen voor prospects met een bruikbaar e-mailadres).</div>}
      </Section>

      <Section id="G" title="Providers & kosten">
        <div style={{ fontSize: '.8rem', marginBottom: 6 }}>Totaal: <strong>{eur(total)}</strong>{rec?.prospeo ? ` · Prospeo-fallback: ${rec.prospeo.result}${rec.prospeo.reason ? ` (${rec.prospeo.reason})` : ''}` : ''}{rec?.hunter_email_before_prospeo ? ` · eerder Hunter-adres: ${rec.hunter_email_before_prospeo}` : ''}</div>
        {d.provider_calls.length > 0 ? (
          <div style={tableWrap}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Tijd', 'Provider', 'Bewerking', 'Resultaat', 'Kosten', 'Detail'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{d.provider_calls.map((c, i) => (
              <tr key={i}><td style={{ ...td, whiteSpace: 'nowrap' }}>{dateTime(c.called_at)}</td><td style={td}>{c.provider}</td><td style={td}>{c.operation}</td><td style={td}>{c.result}</td><td style={td}>{eur(c.cost_eur)}</td><td style={{ ...td, color: C.muted, wordBreak: 'break-all' }}>{c.detail ?? ''}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <div style={{ color: C.muted, fontSize: '.82rem' }}>Geen betaalde provider-calls.</div>}
        {contact && contact.notes.length > 0 && <ul style={{ fontSize: '.78rem', color: C.text, marginTop: 8, paddingLeft: 18 }}>{contact.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      </Section>

      <Section id="H" title="Tijdlijn">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {d.events.map((e) => <li key={e.id} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid #F1F5F9', fontSize: '.8rem' }}><span style={{ color: C.faint, whiteSpace: 'nowrap' }}>{dateTime(e.created_at)}</span><span>{eventText(e)}</span></li>)}
          {d.review_decisions.map((r) => <li key={r.id} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid #F1F5F9', fontSize: '.8rem' }}><span style={{ color: C.faint, whiteSpace: 'nowrap' }}>{dateTime(r.created_at)}</span><span>Review: {r.decision}{r.reason ? ` — ${r.reason}` : ''}</span></li>)}
        </ul>
      </Section>
    </div>
  )
}

export function ProspectDetailView({ api, prospectId, onBack, onOpenRun }: { api: OutreachApi; prospectId: string; onBack: () => void; onOpenRun: (id: string) => void }) {
  const { data: d, error, reload } = useLoad<ProspectDetail>(useCallback(() => api.getProspect(prospectId), [api, prospectId]))
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Btn kind="ghost" onClick={onBack}>← Terug</Btn>
        {d && <Btn kind="ghost" onClick={() => onOpenRun(d.run.id)}>Run “{d.run.name}” →</Btn>}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!d && !error && <Loading />}
      {d && <ProspectDetailBody d={d} />}
      {d && <ProspectSendingSection api={api} prospectId={prospectId} />}
    </div>
  )
}
