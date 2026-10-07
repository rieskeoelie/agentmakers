'use client'
import { useCallback, useState } from 'react'
import { BlockSkeleton, Button, ErrorState, LocalTabs, Page, PageHeader, Row, Rows, Section, Segmented, Status, useLoad } from '../ds'
import { useAdmin } from '../app/AdminContext'
import type { UiLang } from '../app/copy'
import { dateTime } from '../../../lib/outreach/ui/format'
import type { SendingOverview } from '../../../lib/outreach/ui/sending'
import { Configured, SendingPanel } from '../outreach/SendingPanel'
import { LimitsRows, ProviderRows, useOutreachSettings, WorkerRows } from '../outreach/SettingsView'

export type SettingsTab = 'general' | 'outreach' | 'sending' | 'providers' | 'integrations' | 'system'
export const SETTINGS_TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'general', label: 'Algemeen' }, { key: 'outreach', label: 'Outreach' }, { key: 'sending', label: 'Verzenden' },
  { key: 'providers', label: 'Providers' }, { key: 'integrations', label: 'Integraties' }, { key: 'system', label: 'Systeem' },
]

/** Global settings. Secrets are never shown — only Geconfigureerd / Niet geconfigureerd. */
export function SettingsScreen() {
  const a = useAdmin()
  const [tab, setTab] = useState<SettingsTab>('general')
  const outreach = useOutreachSettings()
  const sending = useLoad<SendingOverview | null>(useCallback(() => a.api.sending().catch(() => null), [a.api]))
  const needsOutreach = tab === 'outreach' || tab === 'providers' || tab === 'system'
  const s = outreach.data

  return (
    <Page>
      <PageHeader title={a.t('settingsTitle')} subtitle="Configuratie van de admin, outreach en verzending." />
      <LocalTabs label="Instellingen" current={tab} onSelect={setTab} tabs={SETTINGS_TABS} />
      <div style={{ maxWidth: 880 }}>
        {tab === 'general' && (
          <Section title={a.t('general')}>
            <Rows testId="settings-general">
              <Row label={a.t('interfaceLanguage')} help="Geldt voor leads, gesprekken, pagina's en analytics. Outreach en Inbox zijn Nederlandstalig.">
                <Segmented<UiLang> label={a.t('interfaceLanguage')} value={a.lang} onChange={a.setLang} options={[{ value: 'nl', label: 'Nederlands' }, { value: 'es', label: 'Español' }]} />
              </Row>
              <Row label="Ingelogd als"><span>{a.me.displayName}</span></Row>
              <Row label="Rol"><Status tone="info" dot={false}>{a.me.isSuperAdmin ? 'Superadmin' : a.me.isAdmin ? 'Admin' : 'Partner'}</Status></Row>
            </Rows>
          </Section>
        )}

        {needsOutreach && outreach.error && !s && <ErrorState message={outreach.error} onRetry={outreach.reload} />}
        {needsOutreach && !s && !outreach.error && <BlockSkeleton lines={5} />}

        {tab === 'outreach' && s && (
          <Section title="Outreach" description="Runlimieten worden door de server en database afgedwongen.">
            <LimitsRows s={s} />
            <div style={{ marginTop: 12 }}><Button size="sm" iconRight="chevronRight" onClick={() => a.navigate({ screen: 'outreach', view: 'settings' })}>Reviewregels</Button></div>
          </Section>
        )}

        {tab === 'sending' && <SendingPanel onChanged={a.refreshCounts} />}

        {tab === 'providers' && s && (
          <Section title="Providers" description="Onderzoek en verrijking. Sleutels worden nooit getoond."><ProviderRows s={s} /></Section>
        )}

        {tab === 'integrations' && (
          <Section title="Integraties">
            {sending.data === null && sending.loading ? <BlockSkeleton lines={3} /> : sending.data ? (
              <Rows testId="settings-integrations">
                <Row label="Smartlead API" help="Verzendprovider."><Configured ok={sending.data.provider.smartlead_configured} /></Row>
                <Row label="Smartlead webhook" help="Reacties, bounces en afmeldingen direct ontvangen."><Configured ok={sending.data.provider.webhook_configured} /></Row>
                <Row label="Webhooks (24u)"><span className="am-num">{sending.data.webhooks_24h.received} ontvangen{sending.data.webhooks_24h.unmatched ? `, ${sending.data.webhooks_24h.unmatched} onbekend` : ''}</span></Row>
                <Row label="Laatste webhook"><span className="am-muted">{dateTime(sending.data.webhooks_24h.last_at)}</span></Row>
              </Rows>
            ) : <p className="am-muted">Integratiestatus niet beschikbaar.</p>}
          </Section>
        )}

        {tab === 'system' && s && (
          <Section title="Systeem" description="Achtergrondworker.">
            <WorkerRows s={s} />
          </Section>
        )}
      </div>
    </Page>
  )
}
