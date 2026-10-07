'use client'
import { useEffect, useState } from 'react'
import {
  Button, Callout, EmptyState, ErrorState, ExtLink, Icon, KeyValue, Menu, Page, PageHeader, Section, Status, Textarea, useConfirm, BlockSkeleton,
} from '../ds'
import { useAdmin } from '../app/AdminContext'
import { fmtDuration, leadSource, matchedConversation, shortDate, stageOf } from '../app/model'
import { SourceStatus, StageSelect } from './Leads'

/** One lead: contact, origin, outreach history, demo-agent knowledge, notes, linked conversation. */
export function LeadDetailScreen({ id }: { id: string }) {
  const a = useAdmin()
  const { t } = a
  const lead = a.visibleLeads.find((l) => l.id === id) ?? null
  const [confirm, confirmDialog] = useConfirm()
  const [bizInfo, setBizInfo] = useState<string | null>(null)
  const [bizState, setBizState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [scrape, setScrape] = useState<{ busy: boolean; ok?: boolean; msg?: string }>({ busy: false })
  useEffect(() => { a.loadConversations() }, [a.loadConversations]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lead?.demo_token) return
    let live = true
    fetch(`/api/admin/lead-info?token=${encodeURIComponent(lead.demo_token)}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setBizInfo(d.business_info || '') }).catch(() => undefined)
    return () => { live = false }
  }, [lead?.demo_token])

  if (!lead) {
    return (
      <Page>
        <PageHeader breadcrumb={[{ label: t('leadsTitle'), onClick: () => a.navigate({ screen: 'leads' }) }]} title={t('leadsTitle')} />
        {a.crmLoading ? <BlockSkeleton /> : a.crmError ? <ErrorState message={a.crmError} onRetry={() => void a.refreshCrm()} /> : <EmptyState icon="users" title="Lead niet gevonden" text="Deze lead bestaat niet (meer) of hoort bij een ander account." action={<Button onClick={() => a.navigate({ screen: 'leads' })}>{t('back')}</Button>} />}
      </Page>
    )
  }

  const convId = matchedConversation(lead, a.convIndex)
  const conv = convId ? a.conversations.find((c) => c.conversation_id === convId) : undefined
  const source = leadSource(lead)
  const handled = a.handled.has(lead.id)

  const saveBiz = async () => {
    if (!lead.demo_token) return
    setBizState('saving')
    try {
      await fetch('/api/admin/update-business-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demo_token: lead.demo_token, business_info: bizInfo || '' }) })
      setBizState('saved')
      setTimeout(() => setBizState('idle'), 2500)
    } catch { setBizState('idle') }
  }
  const rescrape = async () => {
    if (!lead.demo_token) return
    setScrape({ busy: true })
    try {
      const res = await fetch('/api/admin/rescrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demo_token: lead.demo_token }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ophalen mislukt')
      if (data.business_info) setBizInfo(data.business_info)
      setScrape({ busy: false, ok: true, msg: data.scraped ? `Website opgehaald (${data.contentLength} tekens).` : 'Geen inhoud gevonden — de agent heeft alleen basisinformatie.' })
    } catch (e) {
      setScrape({ busy: false, ok: false, msg: (e as Error).message })
    }
  }
  const remove = async () => {
    if (!(await confirm({ title: t('deleteLeadsTitle'), description: `${lead.naam} — ${t('deleteLeadsText')}`, confirmLabel: t('delete') }))) return
    const res = await fetch('/api/leads', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [lead.id] }) })
    if (res.ok) { a.setLeads((ls) => ls.filter((l) => l.id !== lead.id)); a.navigate({ screen: 'leads' }) }
  }

  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('leadsTitle'), onClick: () => a.navigate({ screen: 'leads' }) }]}
        title={lead.naam || lead.bedrijfsnaam || lead.email}
        status={<>{handled && <Status tone="muted">{t('handled')}</Status>}</>}
        subtitle={[lead.bedrijfsnaam, lead.email].filter(Boolean).join(' · ')}
        actions={<>
          <StageSelect value={stageOf(a.leadStatus, lead.id)} onChange={(s) => a.setLeadStatus(lead.id, s)} />
          <Menu items={[
            { label: handled ? t('reopen') : t('markHandled'), icon: 'check', onSelect: () => a.toggleHandled(lead.id) },
            { label: t('delete'), icon: 'trash', tone: 'danger', separatorBefore: true, onSelect: () => void remove() },
          ]} />
          <Button variant="primary" icon="mail" onClick={() => { window.location.href = `mailto:${lead.email}` }}>{t('sendEmail')}</Button>
        </>} />

      <div className="am-split">
        <div>
          <Section title={t('colContact')}>
            <KeyValue items={[
              ['Naam', lead.naam], ['Bedrijf', lead.bedrijfsnaam], ['E-mail', <a key="e" href={`mailto:${lead.email}`}>{lead.email}</a>],
              ['Telefoon', lead.telefoon], ['Website', lead.website ? <ExtLink key="w" href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} /> : null],
            ]} />
          </Section>

          {source === 'outreach' && (
            <Section title={t('outreachHistory')} aside={lead.outreach_prospect_id
              ? <Button size="sm" iconRight="chevronRight" onClick={() => a.navigate({ screen: 'outreach', view: 'prospect', id: lead.outreach_prospect_id! })}>{t('openInOutreach')}</Button> : undefined}>
              {lead.business_info ? <pre className="am-pre am-panel am-panel-pad" style={{ fontSize: 12.5 }}>{lead.business_info}</pre> : <p className="am-muted">Geen outreach-context opgeslagen.</p>}
            </Section>
          )}

          {lead.demo_token && (
            <Section title={t('leadAgent')} description={t('leadAgentHelp')}
              aside={lead.website ? <Button size="sm" icon="refresh" loading={scrape.busy} onClick={() => void rescrape()}>{t('rescrape')}</Button> : undefined}>
              {scrape.msg && <div style={{ marginBottom: 8 }}><Callout tone={scrape.ok ? 'success' : 'danger'}>{scrape.msg}</Callout></div>}
              {bizInfo === null ? <BlockSkeleton lines={3} /> : (
                <div className="am-stack">
                  <Textarea rows={8} value={bizInfo} onChange={(e) => setBizInfo(e.target.value)} aria-label={t('leadAgent')}
                    placeholder={'Bedrijfsnaam: …\nDiensten: …\nOpeningstijden: …'} />
                  <div className="am-inline">
                    <Button variant="primary" size="sm" loading={bizState === 'saving'} disabled={!bizInfo.trim()} onClick={() => void saveBiz()}>{t('saveForAgent')}</Button>
                    {bizState === 'saved' && <span className="am-inline" style={{ color: 'var(--am-green)', gap: 4 }}><Icon name="check" size={14} />{t('saved')}</span>}
                    {!lead.scraped_at && <span className="am-muted">Website nog niet automatisch gelezen.</span>}
                  </div>
                </div>
              )}
            </Section>
          )}

          <Section title={t('leadNotes')} description={t('leadNotesHelp')}>
            <Textarea rows={4} value={a.leadNotes[lead.id] || ''} onChange={(e) => a.setLeadNote(lead.id, e.target.value)} aria-label={t('leadNotes')} style={{ width: '100%' }} />
          </Section>
        </div>

        <aside>
          <Section title="Details">
            <KeyValue items={[
              [t('colSource'), <SourceStatus key="s" lead={lead} />], [t('colPage'), `/${lead.landing_page_slug}`],
              [t('colLanguage'), lead.language?.toUpperCase()], [t('colCreated'), shortDate(lead.created_at, true)],
              ['Demo', lead.demo_token ? <ExtLink key="d" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/demo/${lead.demo_token}`}>Demo openen</ExtLink> : null],
            ]} />
          </Section>
          <Section title={t('colConversation')}>
            {conv ? (
              <button type="button" className="am-panel am-panel-pad" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => a.navigate({ screen: 'conversations', id: conv.conversation_id })}>
                <div className="am-strong">{shortDate(conv.start_time_unix_secs * 1000, true)}</div>
                <div className="am-muted">{fmtDuration(conv.call_duration_secs)} · {conv.status === 'done' ? t('convDone') : conv.status}</div>
              </button>
            ) : <p className="am-muted">{a.convLoading ? 'Laden…' : 'Geen gekoppeld gesprek.'}</p>}
          </Section>
        </aside>
      </div>
      {confirmDialog}
    </Page>
  )
}
