'use client'
import { useCallback } from 'react'
import { BlockSkeleton, Button, ErrorState, Row, Rows, Section, Status, useLoad } from '../ds'
import { useAdmin } from '../app/AdminContext'
import { eur } from '../../../lib/outreach/ui/format'
import { reasonLabel, RESOLVABLE_REVIEW_REASONS } from '../../../lib/outreach/ui/review'
import type { OutreachSettingsView as SettingsData } from '../../../lib/outreach/ui/types'
import { Configured } from './SendingPanel'

/** Run limits (read-only; enforced server-side). */
export function LimitsRows({ s }: { s: SettingsData }) {
  return (
    <Rows testId="outreach-limits">
      <Row label="Max prospects per run" help={`Harde limiet in deze fase: ${s.hard_max_prospects}.`}><span className="am-num am-strong">{s.limits.max_prospects}</span></Row>
      <Row label="Max budget per run"><span className="am-num am-strong">{eur(s.limits.max_budget_eur)}</span></Row>
      <Row label="Gelijktijdig per run" help="Prospects die tegelijk worden onderzocht."><span className="am-num am-strong">{s.limits.concurrency}</span></Row>
    </Rows>
  )
}

/** Research providers. Keys are never shown — only whether they are configured. */
export function ProviderRows({ s }: { s: SettingsData }) {
  return (
    <Rows testId="provider-status">
      <Row label="DataForSEO" help="Bedrijven zoeken."><Configured ok={s.providers.dataforseo} /></Row>
      <Row label="Hunter" help="Beslisser en e-mail vinden en verifiëren."><Configured ok={s.providers.hunter} /></Row>
      <Row label="Anthropic" help={`Fit, opening en mail. Model: ${s.anthropic_model}.`}><Configured ok={s.providers.anthropic} /></Row>
      <Row label="Prospeo" help="Optionele fallback voor e-mailadressen."><Configured ok={s.providers.prospeo} no="Uit" /></Row>
    </Rows>
  )
}

export function WorkerRows({ s }: { s: SettingsData }) {
  return (
    <Rows testId="worker-status">
      <Row label="CRON_SECRET" help="Beveiligt de achtergrondworker."><Configured ok={s.worker.cron_secret_configured} /></Row>
      <Row label="Reservering per prospect"><span className="am-num">{eur(s.worker.reservation_eur)}</span></Row>
      <Row label="Parallel per worker"><span className="am-num">{s.worker.max_parallel}</span></Row>
      <Row label="Lease"><span className="am-num">{s.worker.lease_seconds}s</span></Row>
    </Rows>
  )
}

/** Kept for the presentational test: all read-only outreach configuration in one body. */
export function SettingsBody({ s }: { s: SettingsData }) {
  return (
    <div>
      <Section title="Limieten"><LimitsRows s={s} /></Section>
      <Section title="Providers" description="Sleutels worden nooit getoond."><ProviderRows s={s} /></Section>
      <Section title="Worker"><WorkerRows s={s} /></Section>
    </div>
  )
}

export function useOutreachSettings() {
  const { api } = useAdmin()
  return useLoad<SettingsData>(useCallback(() => api.settings(), [api]))
}

/** Outreach → Instellingen: run limits and review rules. Sending and providers live in global Settings. */
export function OutreachSettingsView() {
  const a = useAdmin()
  const { data: s, error, reload } = useOutreachSettings()
  return (
    <div style={{ maxWidth: 880 }}>
      {error && !s && <ErrorState message={error} onRetry={reload} />}
      {!s && !error && <BlockSkeleton lines={6} />}
      {s && (
        <>
          <Section title="Runlimieten" description="Vaste grenzen; de server en database dwingen ze af."><LimitsRows s={s} /></Section>
          <Section title="Reviewregels" description="Wat een mens in review mag oplossen. Al het andere is een harde regel die goedkeuren blokkeert.">
            <Rows>
              {RESOLVABLE_REVIEW_REASONS.map((r) => <Row key={r} label={reasonLabel(r)} help={r}><Status tone="warning" dot={false}>Oplosbaar in review</Status></Row>)}
              <Row label="Algemeen adres, ongeldig adres, geen beslisser, uitgesloten of dubbel contact, niet-onderbouwde claim" help="Harde regels"><Status tone="danger" dot={false}>Blokkeert altijd</Status></Row>
            </Rows>
          </Section>
          <Section title="Verzenden en providers" description="Kill switch, testmodus, limieten, mailboxen en providerstatus.">
            <Rows>
              <Row label="Verzenden" help="Staat centraal in Instellingen.">
                <span className="am-inline">
                  {a.counts.sendingLive === null ? null : <Status tone={a.counts.sendingLive ? 'success' : 'neutral'}>{a.counts.sendingLive ? 'Aan' : 'Uit'}</Status>}
                  <Button size="sm" iconRight="chevronRight" onClick={() => a.navigate({ screen: 'settings' })}>Instellingen</Button>
                </span>
              </Row>
            </Rows>
          </Section>
        </>
      )}
    </div>
  )
}
