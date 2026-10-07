'use client'
import { useEffect, useMemo, useState } from 'react'
import { Button, DataTable, Drawer, EmptyState, FilterBar, FilterSelect, Icon, KeyValue, Page, PageHeader, SearchInput, Section, Status, TableSkeleton, BlockSkeleton, type Column } from '../ds'
import { useAdmin } from '../app/AdminContext'
import { fmtDuration, matchedLead, parseBusinessInfo, shortDate, type Conversation } from '../app/model'

export function ConversationsScreen({ openId }: { openId: string | null }) {
  const a = useAdmin()
  const { t } = a
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => { a.loadConversations() }, [a.loadConversations]) // eslint-disable-line react-hooks/exhaustive-deps

  const info = (c: Conversation) => (a.convDetails[c.conversation_id] ? parseBusinessInfo(a.convDetails[c.conversation_id]!) : null)
  const { visibleConversations, convDetails } = a
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return visibleConversations.filter((c) => {
      if (status && c.status !== status) return false
      if (!needle) return true
      const d = convDetails[c.conversation_id]
      const i = d ? parseBusinessInfo(d) : null
      return !!i && [i.company, i.contact, i.website].some((v) => v.toLowerCase().includes(needle))
    })
  }, [visibleConversations, convDetails, q, status])

  const statusTone = (s: string) => (s === 'done' ? 'success' : s === 'failed' ? 'danger' : 'warning') as 'success' | 'danger' | 'warning'
  const statusLabel = (s: string) => (s === 'done' ? t('convDone') : s === 'failed' ? t('convFailed') : s)

  const columns: Array<Column<Conversation>> = [
    { key: 'date', header: t('convDate'), sort: (c) => c.start_time_unix_secs, nowrap: true, render: (c) => (
      <div><span className="am-cell-primary am-num">{shortDate(c.start_time_unix_secs * 1000)}</span><span className="am-cell-secondary am-num">{new Date(c.start_time_unix_secs * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span></div>) },
    { key: 'contact', header: t('convContact'), render: (c) => {
      const i = info(c)
      if (!i) return <span className="am-faint">Laden…</span>
      return <div><span className="am-cell-primary">{i.contact || i.company || t('convUnknown')}</span>{i.contact && i.company && <span className="am-cell-secondary">{i.company}</span>}</div>
    } },
    { key: 'lead', header: t('convLead'), render: (c) => {
      const i = info(c)
      const l = i ? matchedLead(i, a.visibleLeads) : undefined
      return l ? <button type="button" className="am-link-btn" onClick={() => a.navigate({ screen: 'leads', id: l.id })}>{l.naam || l.bedrijfsnaam}</button> : <span className="am-faint">—</span>
    } },
    { key: 'dur', header: t('convDuration'), align: 'right', sort: (c) => c.call_duration_secs, render: (c) => <span className="am-num">{fmtDuration(c.call_duration_secs)}</span>, nowrap: true },
    { key: 'status', header: t('convResult'), sort: (c) => c.status, render: (c) => <Status tone={statusTone(c.status)}>{statusLabel(c.status)}</Status>, nowrap: true },
    { key: 'audio', header: t('convAudio'), shrink: true, render: (c) => (c.has_audio ? <span className="am-muted am-inline" style={{ gap: 4 }}><Icon name="play" size={12} />Ja</span> : <span className="am-faint">—</span>) },
  ]

  const open = openId ? a.conversations.find((c) => c.conversation_id === openId) : undefined
  const detail = openId ? a.convDetails[openId] : undefined
  const openInfo = detail ? parseBusinessInfo(detail) : null
  const openLead = openInfo ? matchedLead(openInfo, a.visibleLeads) : undefined
  useEffect(() => { if (openId) void a.loadConversationDetail(openId) }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader title={t('convTitle')} subtitle={t('convSubtitle')}
        actions={<Button icon="refresh" loading={a.convLoading} onClick={() => a.loadConversations(true)}>{t('refresh')}</Button>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Zoek contact of bedrijf…" />
        <FilterSelect label={t('convResult')} value={status} onChange={setStatus} options={[{ value: '', label: 'Alle resultaten' }, { value: 'done', label: t('convDone') }, { value: 'failed', label: t('convFailed') }]} />
      </FilterBar>
      {a.convLoading && a.visibleConversations.length === 0 && <TableSkeleton cols={6} />}
      {!a.convLoading && a.visibleConversations.length === 0 && <EmptyState icon="phone" title={t('convEmptyTitle')} text={t('convEmptyText')} />}
      {a.visibleConversations.length > 0 && rows.length === 0 && <EmptyState icon="search" title={t('noResults')} text={t('noResultsText')} />}
      {rows.length > 0 && (
        <DataTable testId="conversations-table" rowTestId="conversation-row" rows={rows} columns={columns} rowKey={(c) => c.conversation_id}
          selectedKey={openId} onRowClick={(c) => a.navigate({ screen: 'conversations', id: c.conversation_id })} defaultSort={{ key: 'date', dir: 'desc' }} minWidth={760} />
      )}

      <Drawer open={!!openId} onClose={() => a.navigate({ screen: 'conversations' })} testId="conversation-drawer"
        title={openInfo ? openInfo.contact || openInfo.company || t('convUnknown') : t('convTitle')}
        subtitle={open ? `${shortDate(open.start_time_unix_secs * 1000, true)} · ${fmtDuration(open.call_duration_secs)}` : undefined}>
        {!detail ? <BlockSkeleton lines={6} /> : (
          <>
            <KeyValue items={[
              [t('convCompany'), openInfo?.company], [t('convContact'), openInfo?.contact],
              [t('convResult'), <Status key="s" tone={statusTone(detail.status)}>{statusLabel(detail.status)}</Status>],
              [t('convLead'), openLead ? <button key="l" type="button" className="am-link-btn" onClick={() => a.navigate({ screen: 'leads', id: openLead.id })}>{openLead.naam || openLead.bedrijfsnaam}</button> : null],
              ...(detail.cost != null ? [[t('convCost'), `$${detail.cost.toFixed(4)}`] as [string, string]] : []),
            ]} />
            {detail.has_audio && (
              <Section title={t('convAudio')}>
                <audio controls preload="none" style={{ width: '100%', height: 36 }} src={`/api/conversations/${detail.conversation_id}/audio`} />
              </Section>
            )}
            <Section title={`${t('convTranscript')} · ${detail.transcript.length}`}>
              {detail.transcript.length === 0 ? <p className="am-muted">{t('convNoTranscript')}</p> : (
                <div className="am-stack" style={{ gap: 10 }}>
                  {detail.transcript.map((turn, i) => (
                    <div key={i} className="am-message" data-direction={turn.role === 'agent' ? 'out' : 'in'}>
                      <div className="am-message-head">
                        <strong className="am-strong" style={{ fontSize: 12 }}>{turn.role === 'user' ? t('convProspect') : t('convAgent')}</strong>
                        {turn.time_in_call_secs != null && <span className="am-num">{fmtDuration(turn.time_in_call_secs)}</span>}
                      </div>
                      <div className="am-message-body am-pre">{turn.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </Drawer>
    </Page>
  )
}
