'use client'
import { useCallback, useMemo, useState } from 'react'
import { outreachApi } from '../../../lib/outreach/ui/api'
import { inputFromRun, type NewRunInput } from '../../../lib/outreach/ui/newRun'
import type { RunSummary } from '../../../lib/outreach/ui/types'
import type { SendingOverview } from '../../../lib/outreach/ui/sending'
import { NewRunForm, type LandingOption } from './NewRunForm'
import { InboxView } from './InboxView'
import { ProspectDetailView } from './ProspectDetailView'
import { ProspectsView } from './ProspectsView'
import { ReviewQueueView } from './ReviewQueueView'
import { RunDetailView } from './RunDetailView'
import { RunsView } from './RunsView'
import { SettingsView } from './SettingsView'
import { C, font, useLoad } from './ui'

export type OutreachSection = 'runs' | 'prospects' | 'review' | 'inbox' | 'settings'
type View =
  | { s: 'runs' } | { s: 'new'; initial?: NewRunInput } | { s: 'run'; id: string }
  | { s: 'prospects'; runId?: string | null } | { s: 'prospect'; id: string; back: View }
  | { s: 'review' } | { s: 'inbox' } | { s: 'settings' }

const SECTION_OF: Record<View['s'], OutreachSection> = { runs: 'runs', new: 'runs', run: 'runs', prospects: 'prospects', prospect: 'prospects', review: 'review', inbox: 'inbox', settings: 'settings' }

/**
 * Outreach workspace inside the existing admin (Runs → Prospects → Review → Inbox, + Settings).
 * Uses only the outreach API with the existing session cookie. Cold sending goes through Smartlead and is
 * controlled centrally (kill switch in Instellingen); replies are answered by a human from the Inbox.
 */
export default function OutreachWorkspace({ currentUser, viewAsUser, landingOptions }: {
  currentUser: { userId: string; isAdmin: boolean; isSuperAdmin: boolean }
  viewAsUser: { id: string; name: string } | null
  landingOptions: LandingOption[]
}) {
  const viewAs = currentUser.isSuperAdmin && viewAsUser ? viewAsUser.id : null
  const api = useMemo(() => outreachApi(viewAs), [viewAs])
  const canOperate = currentUser.isAdmin || currentUser.isSuperAdmin
  const [view, setViewState] = useState<View>({ s: 'runs' })
  // Run list (for the Prospects filter) and the review badge; errors are shown inside the views themselves.
  const runsRes = useLoad<RunSummary[]>(useCallback(() => api.listRuns(), [api]))
  const reviewRes = useLoad(useCallback(() => api.reviewQueue(0, 1), [api]))
  const sendingRes = useLoad<SendingOverview | null>(useCallback(() => api.sending().catch(() => null), [api]))
  const runs = runsRes.data ?? []
  const reviewCount = reviewRes.data?.total ?? null
  const setView = (v: View | ((old: View) => View)) => {
    setViewState(v)
    runsRes.reload()
    reviewRes.reload()
    sendingRes.reload()
  }
  const sending = sendingRes.data
  const live = !!sending && sending.config.sending_enabled && sending.provider.smartlead_configured && !sending.provider.env_kill_switch
  const inboxCount = sending?.needs_action ?? null

  const section = SECTION_OF[view.s]
  const tabs: Array<{ key: OutreachSection; label: string; to: View }> = [
    { key: 'runs', label: 'Runs', to: { s: 'runs' } },
    { key: 'prospects', label: 'Prospects', to: { s: 'prospects' } },
    { key: 'review', label: `Review${reviewCount ? ` (${reviewCount})` : ''}`, to: { s: 'review' } },
    { key: 'inbox', label: `Inbox${inboxCount ? ` (${inboxCount})` : ''}`, to: { s: 'inbox' } },
    { key: 'settings', label: 'Instellingen', to: { s: 'settings' } },
  ]
  const openProspect = (id: string) => setView((v) => ({ s: 'prospect', id, back: v }))

  return (
    <div style={{ fontFamily: font }} data-testid="outreach-workspace">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <nav aria-label="Outreach" style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 4 }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setView(t.to)} aria-current={section === t.key ? 'page' : undefined}
              style={{ border: 'none', borderRadius: 7, padding: '7px 14px', fontFamily: font, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer',
                background: section === t.key ? C.teal : 'transparent', color: section === t.key ? '#fff' : C.muted }}>{t.label}</button>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button data-testid="sending-badge" onClick={() => setView({ s: 'settings' })} title="Verzendinstellingen"
            style={{ border: 'none', cursor: 'pointer', fontFamily: font, fontSize: '.75rem', fontWeight: 700, borderRadius: 999, padding: '3px 10px',
              color: live ? C.green : C.amber, background: live ? C.greenBg : C.amberBg }}>
            {sending === null ? 'Verzenden: …' : live ? `Verzenden aan${sending.config.test_recipients.length ? ' (testmodus)' : ''}` : 'Verzenden uit'}
          </button>
        </div>
      </div>

      {view.s === 'runs' && <RunsView api={api} canOperate={canOperate} onOpen={(id) => setView({ s: 'run', id })} onNew={() => setView({ s: 'new' })} onDuplicate={(r) => setView({ s: 'new', initial: inputFromRun(r) })} />}
      {view.s === 'new' && <NewRunForm api={api} landingOptions={landingOptions} initial={view.initial} onCancel={() => setView({ s: 'runs' })} onCreated={(r) => setView({ s: 'run', id: r.id })} />}
      {view.s === 'run' && <RunDetailView api={api} runId={view.id} canOperate={canOperate} onBack={() => setView({ s: 'runs' })} onOpenProspects={(id) => setView({ s: 'prospects', runId: id })} onOpenProspect={openProspect} />}
      {view.s === 'prospects' && <ProspectsView key={view.runId ?? 'all'} api={api} runs={runs} initialRunId={view.runId} onOpen={openProspect} />}
      {view.s === 'prospect' && <ProspectDetailView api={api} prospectId={view.id} onBack={() => setView(view.back)} onOpenRun={(id) => setView({ s: 'run', id })} />}
      {view.s === 'review' && <ReviewQueueView api={api} onOpen={openProspect} onChanged={reviewRes.reload} />}
      {view.s === 'inbox' && <InboxView api={api} onChanged={sendingRes.reload} />}
      {view.s === 'settings' && (canOperate ? <SettingsView api={api} /> : <div style={{ color: C.muted, fontSize: '.85rem' }}>Alleen beschikbaar voor admins.</div>)}
    </div>
  )
}
