'use client'
import { useMemo } from 'react'
import { Button, LocalTabs, Page, PageHeader } from '../ds'
import { useAdmin } from '../app/AdminContext'
import type { Route } from '../app/routes'
import { NewRunScreen, type LandingOption } from './NewRunForm'
import { ProspectDetailScreen } from './ProspectDetailView'
import { ProspectsView } from './ProspectsView'
import { ReviewQueueView } from './ReviewQueueView'
import { RunDetailScreen } from './RunDetailView'
import { RunsView } from './RunsView'
import { OutreachSettingsView } from './SettingsView'

export type OutreachTab = 'runs' | 'prospects' | 'review' | 'settings'

export const OUTREACH_TABS: Array<{ key: OutreachTab; label: string }> = [
  { key: 'runs', label: 'Runs' }, { key: 'prospects', label: 'Prospects' }, { key: 'review', label: 'Review' }, { key: 'settings', label: 'Instellingen' },
]

/**
 * Outreach — one global area with local navigation (Runs · Prospects · Review · Instellingen).
 * List views share the Outreach header + local tabs; detail views (run, prospect, new run) are full pages with a breadcrumb.
 */
export function OutreachScreen({ route }: { route: Extract<Route, { screen: 'outreach' }> }) {
  const a = useAdmin()
  const landingOptions: LandingOption[] = useMemo(
    () => a.pages.filter((p) => p.status === 'live').map((p) => ({ label: `${p.industry} — /nl/${p.slug}`, url: `https://agentmakers.io/nl/${p.slug}` })),
    [a.pages])

  if (route.view === 'run' && route.id) return <RunDetailScreen runId={route.id} />
  if (route.view === 'prospect' && route.id) return <ProspectDetailScreen prospectId={route.id} />
  if (route.view === 'new') return <NewRunScreen landingOptions={landingOptions} duplicateOf={route.duplicateOf ?? null} />

  const tab: OutreachTab = route.view === 'prospects' ? 'prospects' : route.view === 'review' ? 'review' : route.view === 'settings' ? 'settings' : 'runs'
  return (
    <Page>
      <PageHeader title="Outreach" subtitle="Ontdek, kwalificeer en bereid prospects voor."
        actions={tab === 'runs' && a.canOperate ? <Button variant="primary" icon="plus" onClick={() => a.navigate({ screen: 'outreach', view: 'new' })}>Nieuwe run</Button> : undefined} />
      <LocalTabs label="Outreach" current={tab} onSelect={(k) => a.navigate({ screen: 'outreach', view: k })}
        tabs={OUTREACH_TABS.map((t) => ({ ...t, count: t.key === 'review' ? a.counts.review : null }))} />
      {tab === 'runs' && <RunsView />}
      {tab === 'prospects' && <ProspectsView key={route.runId ?? 'all'} initialRunId={route.runId ?? null} />}
      {tab === 'review' && <ReviewQueueView />}
      {tab === 'settings' && <OutreachSettingsView />}
    </Page>
  )
}
