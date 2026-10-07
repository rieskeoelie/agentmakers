'use client'
import { type ReactNode } from 'react'
import { Bar, Callout, DataTable, ExtLink, KeyValue, LinkButton, Metrics, Section, Status, type Column } from '../ds'
import { dateTime, duration, eur } from '../../../lib/outreach/ui/format'
import { budgetUse, countryLabel, ownerFunnelSteps, ownerModeLabel, ownerTargetPersonLabel, rejectionLabel, runProgress, stopReasonLabel } from '../../../lib/outreach/ui/runs'
import {
  COMPANY_IDENTITY_LABEL, CONFIDENCE_META, EMAIL_STATE_META, identityEvidenceLabel, OWNER_STATUS_META, ownerRowStatus, OWNERSHIP_SIGNAL_LABEL,
  PROVIDER_STATE_LABEL, registrySourceLabel, ROLE_LABEL,
} from '../../../lib/outreach/ui/owner'
import type { OwnerDiscoverySummaryView, ProspectListItem, RunOverview } from '../../../lib/outreach/ui/types'
import { RunActivity } from './RunActivity'
import type { OutcomeCounts, ProspectReasons } from './activity'
import { RunFunnelChart } from './RunFunnelChart'

/** Owner Discovery results table: Company / Owner / Role / Identity confidence / Evidence / Business email / Email verification / Status. */
export function OwnerResultsTable({ items, onOpenProspect }: { items: ProspectListItem[]; onOpenProspect: (id: string) => void }) {
  const cols: Array<Column<ProspectListItem>> = [
    { key: 'co', header: 'Bedrijf', sort: (p) => p.company_name.toLowerCase(), render: (p) => (
      <div style={{ minWidth: 160 }}><LinkButton onClick={() => onOpenProspect(p.id)}>{p.company_name}</LinkButton>
        <span className="am-cell-secondary">{p.domain}{p.city ? ` · ${p.city}` : ''}</span></div>) },
    { key: 'owner', header: 'Eigenaar', render: (p) => p.owner?.person?.name
      ? <span>{p.owner.person.name}{p.owner.confidence === 'PARTIAL' ? <span className="am-cell-secondary">achternaam niet gepubliceerd</span> : null}</span>
      : <span className="am-faint">—</span> },
    { key: 'role', header: 'Rol', render: (p) => p.owner?.person
      ? <span>{p.owner.person.role_class ? ROLE_LABEL[p.owner.person.role_class] : '—'}{p.owner.person.title ? <span className="am-cell-secondary">“{p.owner.person.title}”</span> : null}</span>
      : <span className="am-faint">—</span> },
    { key: 'conf', header: 'Identiteit', render: (p) => {
      if (!p.owner) return <span className="am-faint">—</span>
      const m = CONFIDENCE_META[p.owner.confidence] ?? { label: p.owner.confidence, tone: 'neutral' as const }
      return <Status tone={m.tone} title={p.owner.confidence_reason}>{m.label}</Status>
    } },
    { key: 'ev', header: 'Bewijs', render: (p) => p.owner?.person
      ? <span className="am-muted">{p.owner.evidence_label}{p.owner.person.source_url ? <> · <ExtLink href={p.owner.person.source_url} /></> : null}</span>
      : <span className="am-faint">{p.owner ? COMPANY_IDENTITY_LABEL[p.owner.company_identity.state] === 'Bevestigd' ? '—' : COMPANY_IDENTITY_LABEL[p.owner.company_identity.state] : '—'}</span> },
    { key: 'mail', header: 'Zakelijke e-mail', render: (p) => p.owner?.email.state === 'VERIFIED' || p.owner?.email.state === 'REVIEW_ONLY'
      ? <span className="am-mono" style={{ fontSize: 12 }}>{p.email}</span> : <span className="am-faint">—</span> },
    { key: 'ver', header: 'E-mailverificatie', nowrap: true, render: (p) => {
      if (!p.owner) return <span className="am-faint">—</span>
      const m = EMAIL_STATE_META[p.owner.email.state] ?? { label: p.owner.email.state, tone: 'neutral' as const }
      return <Status tone={m.tone} dot={false}>{m.label}</Status>
    } },
    { key: 'st', header: 'Status', nowrap: true, sort: (p) => ownerRowStatus(p), render: (p) => {
      const s = ownerRowStatus(p)
      const m = OWNER_STATUS_META[s] ?? { label: s, tone: 'neutral' as const, hint: '' }
      return <Status tone={m.tone} title={m.hint}>{m.label}</Status>
    } },
  ]
  return <DataTable rows={items} columns={cols} rowKey={(p) => p.id} onRowClick={(p) => onOpenProspect(p.id)} minWidth={1040} testId="owner-results" />
}

/** The bounded discovery plan (audit trail): basis, queries, stop reason, iterations, rejections. */
export function DiscoveryPlanPanel({ summary }: { summary: OwnerDiscoverySummaryView | null }) {
  if (!summary) return <p className="am-muted" style={{ margin: 0 }}>Het zoekplan verschijnt zodra de run bedrijven zoekt.</p>
  const plan = summary.plan
  const rejectedBy = new Map<string, number>()
  for (const r of summary.rejected ?? []) { const k = rejectionLabel(r.reason); rejectedBy.set(k, (rejectedBy.get(k) ?? 0) + 1) }
  return (
    <div className="am-stack" style={{ gap: 12 }} data-testid="owner-plan">
      {plan ? (
        <>
          <p style={{ margin: 0 }}>{plan.basis}</p>
          <KeyValue dense items={[
            ['Zoekrondes', `${summary.iterations.length} van max. ${plan.limits.max_iterations}`],
            ['Gestopt omdat', stopReasonLabel(summary.stop_reason)],
            ['Resultaten', `${summary.returned} vermeldingen · ${summary.eligible} bruikbare bedrijven · ${summary.selected} geselecteerd`],
            ['Grenzen', `${plan.limits.target_companies} bedrijven · max. ${eur(plan.limits.max_budget_eur)}`],
          ]} />
          <ol className="am-muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {plan.queries.map((q, i) => {
              const it = summary.iterations[i]
              return <li key={i}><span className="am-text">{q.category}{q.region ? ` · ${q.region}` : ''}</span> — {q.reason}
                {it ? ` · ${it.error ? `fout (${it.error === 'BUDGET' ? 'budget' : 'provider'})` : `${it.returned} gevonden, ${it.new_eligible} nieuw`}` : ' · niet uitgevoerd'}</li>
            })}
          </ol>
        </>
      ) : (
        <KeyValue dense items={[['Bron', 'Door jou opgegeven bedrijven'], ['Opgegeven', `${summary.returned}`], ['Geselecteerd', `${summary.selected}`]]} />
      )}
      {rejectedBy.size > 0 && (
        <p className="am-faint" style={{ margin: 0, fontSize: 12 }}>Niet geselecteerd: {[...rejectedBy].map(([k, n]) => `${n} ${k}`).join(' · ')}</p>
      )}
    </div>
  )
}

/** Run detail for an Owner Discovery run. Research only: no sending section, no GOOD_FIT, no landing page. */
export function OwnerRunBody({ data, prospects, activeIndex, names, outcomes, reasons, onOpenProspect, onOpenProspects, now }: {
  data: RunOverview; prospects: ProspectListItem[] | null | undefined; activeIndex: number | null; names: Record<string, string>
  outcomes?: OutcomeCounts; reasons?: ProspectReasons; onOpenProspect: (id: string) => void; onOpenProspects?: () => void; now?: number
}): ReactNode {
  const r = data.run
  const f = r.funnel
  const p = runProgress(r)
  const used = budgetUse(r)
  const c = r.campaign
  const summary = (r.discovery_summary ?? null) as OwnerDiscoverySummaryView | null
  const items = prospects ?? []
  return (
    <div data-testid="owner-run">
      <Metrics testId="run-metrics" items={[
        { label: 'Voortgang', value: p.pct === null ? '—' : `${p.pct}%`, sub: p.label },
        { label: 'Bedrijven', value: f.selected, sub: `doel ${r.prospect_limit}` },
        { label: 'READY', value: f.ready, tone: f.ready ? 'success' : undefined, title: 'Bedrijf, eigenaar en persoonlijk zakelijk e-mailadres geverifieerd' },
        { label: 'Review nodig', value: f.needs_review, tone: f.needs_review ? 'warning' : undefined },
        { label: 'Eigenaar zonder e-mail', value: f.owner_found_no_email ?? 0 },
        { label: 'Kosten', value: eur(r.spent_eur), sub: `van ${eur(r.budget_cap_eur)} · ${used}%`, tone: used >= 90 ? 'danger' : undefined },
      ]} />

      <div className="am-split" data-aside="wide" style={{ marginTop: 24 }}>
        <div>
          <Section title="Funnel" aside={onOpenProspects ? <LinkButton onClick={onOpenProspects}>Alle bedrijven van deze run →</LinkButton> : undefined}>
            <div className="am-panel am-panel-pad" data-testid="run-funnel">
              <RunFunnelChart funnel={f} activeIndex={activeIndex} steps={ownerFunnelSteps(f)} />
              <p className="am-faint" style={{ margin: '12px 0 0', fontSize: 12 }}>
                Ook: {f.owner_found_no_email ?? 0} eigenaar zonder e-mail · {f.skipped} zonder resultaat · {f.blocked} geblokkeerd · {f.failed} mislukt
              </p>
            </div>
          </Section>

          {r.setup_last_error && <Section title="Fouten" testId="run-errors"><Callout tone="danger" title="Bedrijven zoeken mislukt">{r.setup_last_error}</Callout></Section>}

          <Section title="Resultaten" description="Alleen onderzoek. Er wordt niets verzonden en er wordt geen campagne aangemaakt." testId="owner-results-section">
            {items.length
              ? <OwnerResultsTable items={items} onOpenProspect={onOpenProspect} />
              : <div className="am-panel am-panel-pad"><p className="am-muted" style={{ margin: 0 }}>{r.setup_state === 'DONE' ? 'Geen bedrijven geselecteerd.' : 'Bedrijven worden gezocht…'}</p></div>}
          </Section>

          <Section title="Zoekplan" description="Wat AgentMakers heeft gezocht en waarom (audit).">
            <div className="am-panel am-panel-pad"><DiscoveryPlanPanel summary={summary} /></div>
          </Section>
        </div>

        <aside>
          <Section title="Details">
            <div className="am-panel am-panel-pad">
              <KeyValue items={[
                ['Type', 'Eigenaar vinden'], ['Werkwijze', ownerModeLabel(c.discovery_mode)],
                ['Branche', c.industry || 'Automatisch'], ['Regio', [c.region, countryLabel(c.country)].filter(Boolean).join(', ')],
                ['Doelpersoon', ownerTargetPersonLabel(c.target_person)],
                ['Registerbron', registrySourceLabel(items.map((x) => x.owner))],
                ['Verzenden', 'Nooit — alleen onderzoek'],
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
              <RunActivity ownerRun events={data.recent_events} funnel={f} outcomes={outcomes} reasons={reasons} names={names} onOpenProspect={onOpenProspect} />
            </div>
          </Section>
        </aside>
      </div>
    </div>
  )
}

/** Prospect detail: the owner-first research result, exactly as stored (no evidence is upgraded). */
export function OwnerDiscoveryPanel({ od, email }: { od: NonNullable<ProspectListItem['owner']>; email: string | null }) {
  const conf = CONFIDENCE_META[od.confidence] ?? { label: od.confidence, tone: 'neutral' as const }
  const mail = EMAIL_STATE_META[od.email.state] ?? { label: od.email.state, tone: 'neutral' as const }
  const st = OWNER_STATUS_META[od.status] ?? { label: od.status, tone: 'neutral' as const, hint: '' }
  return (
    <div data-testid="owner-discovery-panel">
      <KeyValue items={[
        ['Resultaat', <span key="s"><Status tone={st.tone}>{st.label}</Status> <span className="am-muted">{st.hint}</span></span>],
        ['Bedrijfsidentiteit', `${COMPANY_IDENTITY_LABEL[od.company_identity.state] ?? od.company_identity.state}${od.company_identity.evidence.length ? ` — ${od.company_identity.evidence.map(identityEvidenceLabel).join(', ')}` : ''}`],
        ['Persoon', od.person?.name ?? null],
        ['Rol', od.person ? `${od.person.role_class ? ROLE_LABEL[od.person.role_class] : '—'}${od.person.title ? ` (“${od.person.title}”)` : ''}` : null],
        ['Identiteit', <span key="c"><Status tone={conf.tone}>{conf.label}</Status> <span className="am-muted">{od.confidence_reason}</span></span>],
        ['Bewijs', od.person ? <span key="e">{od.evidence_label}{od.person.source_url ? <> · <ExtLink href={od.person.source_url} /></> : null}</span> : null],
        ['Eigendomssignalen', od.ownership_signals.length ? od.ownership_signals.map((x) => OWNERSHIP_SIGNAL_LABEL[x] ?? x).join(', ') : 'geen'],
        ['Zakelijke e-mail', od.email.state === 'VERIFIED' || od.email.state === 'REVIEW_ONLY' ? email : null],
        ['E-mailverificatie', <Status key="m" tone={mail.tone} dot={false}>{mail.label}</Status>],
        ['Algemene adressen', od.email.generic_company_emails.length ? `${od.email.generic_company_emails.join(', ')} (nooit een ontvanger)` : null],
        ['Bronnen', `Hunter: ${PROVIDER_STATE_LABEL[od.providers.hunter]} · Publieke zoekbron: ${PROVIDER_STATE_LABEL[od.providers.public_search]} · Prospeo: ${PROVIDER_STATE_LABEL[od.providers.prospeo]} · Register: ${PROVIDER_STATE_LABEL[od.providers.registry]}`],
      ]} />
    </div>
  )
}
