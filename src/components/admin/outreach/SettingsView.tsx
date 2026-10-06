'use client'
import { useCallback } from 'react'
import type { OutreachApi } from '../../../lib/outreach/ui/api'
import { eur } from '../../../lib/outreach/ui/format'
import type { OutreachSettingsView } from '../../../lib/outreach/ui/types'
import { C, Chip, ErrorBox, KeyValue, Loading, panel, SectionTitle, useLoad } from './ui'

const yes = (ok: boolean, label = ok ? 'ingesteld' : 'ontbreekt') => <Chip color={ok ? C.green : C.red} bg={ok ? C.greenBg : C.redBg}>{label}</Chip>

export function SettingsBody({ s }: { s: OutreachSettingsView }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      <div style={panel}>
        <SectionTitle>Verzenden</SectionTitle>
        <KeyValue items={[['Status', <Chip key="s" color={C.amber} bg={C.amberBg}>Uitgeschakeld</Chip>], ['Uitleg', 'Er bestaat nog geen verzending. Runs stoppen bij READY / NEEDS_REVIEW.']]} />
      </div>
      <div style={panel}>
        <SectionTitle>Limieten</SectionTitle>
        <KeyValue items={[['Max prospects per run', `${s.limits.max_prospects} (harde limiet ${s.hard_max_prospects})`], ['Max budget per run', eur(s.limits.max_budget_eur)], ['Gelijktijdig per run', String(s.limits.concurrency)]]} />
      </div>
      <div style={panel}>
        <SectionTitle>Providers</SectionTitle>
        <KeyValue items={[['DataForSEO', yes(s.providers.dataforseo)], ['Hunter', yes(s.providers.hunter)], ['Anthropic', yes(s.providers.anthropic)], ['Prospeo (optioneel)', yes(s.providers.prospeo, s.providers.prospeo ? 'ingesteld' : 'uit')], ['Model', s.anthropic_model]]} />
      </div>
      <div style={panel}>
        <SectionTitle>Worker</SectionTitle>
        <KeyValue items={[['CRON_SECRET', yes(s.worker.cron_secret_configured)], ['Reservering per prospect', eur(s.worker.reservation_eur)], ['Parallel per worker', String(s.worker.max_parallel)], ['Lease', `${s.worker.lease_seconds}s`]]} />
      </div>
    </div>
  )
}

export function SettingsView({ api }: { api: OutreachApi }) {
  const { data: s, error, reload } = useLoad<OutreachSettingsView>(useCallback(() => api.settings(), [api]))
  return (
    <div>
      <div style={{ fontSize: '.85rem', color: C.muted, marginBottom: 10 }}>Alleen-lezen. Waarden van sleutels worden nooit getoond.</div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!s && !error && <Loading />}
      {s && <SettingsBody s={s} />}
    </div>
  )
}
