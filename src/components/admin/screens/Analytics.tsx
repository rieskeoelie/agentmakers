'use client'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BlockSkeleton, DataTable, EmptyState, ErrorState, Metrics, TableSkeleton, Page, PageHeader, Section, Segmented, Status, type Column } from '../ds'
import { useAdmin } from '../app/AdminContext'
import { fmtDuration, leadsPerWeek, ratio, type LandingPage } from '../app/model'

/** Decision-oriented analytics: a few headline numbers, one trend, two breakdowns. Existing data only. */
export function AnalyticsScreen() {
  const a = useAdmin()
  const { t } = a
  const [lang, setLang] = useState<'all' | 'nl' | 'en' | 'es'>('all')
  useEffect(() => { a.loadConversations() }, [a.loadConversations]) // eslint-disable-line react-hooks/exhaustive-deps

  const pages = a.visiblePages
  const leads = useMemo(() => (lang === 'all' ? a.visibleLeads : a.visibleLeads.filter((l) => l.language === lang)), [a.visibleLeads, lang])
  const visits = pages.reduce((s, p) => s + (p.visits || 0), 0)
  const conversions = pages.reduce((s, p) => s + (p.conversions || 0), 0)
  const convs = a.visibleConversations
  const avg = convs.length ? convs.reduce((s, c) => s + c.call_duration_secs, 0) / convs.length : 0
  const weeks = useMemo(() => leadsPerWeek(leads, 8), [leads])
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count))
  const byLang = (['nl', 'en', 'es'] as const).map((l) => ({ l, n: a.visibleLeads.filter((x) => x.language === l).length }))
  const total = a.visibleLeads.length || 1
  const ranked = [...pages].sort((x, y) => (y.visits ? y.conversions / y.visits : -1) - (x.visits ? x.conversions / x.visits : -1))
  const maxRatio = Math.max(0.0001, ...pages.filter((p) => p.visits).map((p) => p.conversions / p.visits))

  const columns: Array<Column<LandingPage>> = [
    { key: 'page', header: t('pageCol'), sort: (p) => p.industry, render: (p) => <div><span className="am-cell-primary">{p.industry}</span><span className="am-cell-secondary">/nl/{p.slug}</span></div> },
    { key: 'visits', header: t('visitsCol'), align: 'right', sort: (p) => p.visits || 0, render: (p) => <span className="am-num">{p.visits || 0}</span> },
    { key: 'conv', header: t('convCol'), align: 'right', sort: (p) => p.conversions || 0, render: (p) => <span className="am-num">{p.conversions || 0}</span> },
    { key: 'ratio', header: t('ratioCol'), sort: (p) => (p.visits ? p.conversions / p.visits : -1), render: (p) => (
      <div className="am-inline" style={{ flexWrap: 'nowrap' }}><span className="am-num" style={{ width: 44, textAlign: 'right' }}>{ratio(p.conversions, p.visits)}</span>
        <div style={{ width: 120 }}><Bar pct={p.visits ? Math.round(((p.conversions / p.visits) / maxRatio) * 100) : 0} tone={p.visits ? undefined : 'muted'} /></div></div>) },
    { key: 'status', header: 'Status', render: (p) => <Status tone={p.status === 'live' ? 'success' : 'neutral'}>{p.status === 'live' ? t('pageLive') : t('pageDraft')}</Status>, nowrap: true },
  ]

  return (
    <Page>
      <PageHeader title={t('analyticsTitle')} subtitle={t('analyticsSubtitle')}
        actions={<Segmented label={t('colLanguage')} value={lang} onChange={setLang} options={[{ value: 'all', label: 'Alle' }, { value: 'nl', label: 'NL' }, { value: 'en', label: 'EN' }, { value: 'es', label: 'ES' }]} />} />
      {a.crmError && <div style={{ marginBottom: 16 }}><ErrorState message={a.crmError} onRetry={() => void a.refreshCrm()} /></div>}
      {a.crmLoading && !a.leads.length && !a.pages.length ? <><TableSkeleton rows={2} cols={5} /><div style={{ height: 24 }} /><BlockSkeleton lines={6} /></> : <>
      <Metrics testId="analytics-metrics" items={[
        { label: t('visits'), value: visits },
        { label: t('conversions'), value: conversions },
        { label: t('convRate'), value: ratio(conversions, visits) },
        { label: t('leads'), value: leads.length, sub: lang === 'all' ? undefined : lang.toUpperCase() },
        { label: t('conversations'), value: convs.length, sub: convs.length ? `${fmtDuration(avg)} ${t('avgDuration')}` : undefined },
      ]} />

      <div className="am-grid-2">
        <Section title={t('leadsPerWeek')} aside={t('last8Weeks')}>
          <div className="am-panel am-panel-pad" data-testid="leads-per-week">
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, gap: 8, alignItems: 'end', height: 140 }}>
              {weeks.map((w) => (
                <div key={w.label} title={`${w.label}: ${w.count}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                  <span className="am-num am-muted" style={{ fontSize: 11 }}>{w.count || ''}</span>
                  <div style={{ width: '100%', maxWidth: 28, height: `${Math.max(2, (w.count / maxWeek) * 100)}px`, background: w.count ? 'var(--am-accent)' : 'var(--am-border)', borderRadius: 3 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, gap: 8, marginTop: 6 }}>
              {weeks.map((w) => <span key={w.label} className="am-faint" style={{ fontSize: 11, textAlign: 'center' }}>{w.label}</span>)}
            </div>
          </div>
        </Section>
        <Section title={t('leadsByLanguage')}>
          <div className="am-panel am-panel-pad am-stack" style={{ gap: 14 }}>
            {byLang.map(({ l, n }) => (
              <div key={l} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 72px', gap: 12, alignItems: 'center' }}>
                <span className="am-strong" style={{ fontSize: 12 }}>{l.toUpperCase()}</span>
                <Bar pct={Math.round((n / total) * 100)} />
                <span className="am-num am-muted" style={{ textAlign: 'right' }}>{n} · {Math.round((n / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title={t('pagePerformance')}>
        {pages.length === 0
          ? <EmptyState icon="chart" title="Nog geen paginadata" text="Prestaties verschijnen zodra een van je pagina's bezoekers en aanvragen krijgt." />
          : <DataTable testId="page-performance" rows={ranked} columns={columns} rowKey={(p) => p.id} minWidth={640} />}
      </Section>
      </>}
    </Page>
  )
}
