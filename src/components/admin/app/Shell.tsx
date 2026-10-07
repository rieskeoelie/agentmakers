'use client'
import type { ReactNode } from 'react'
import { Avatar, Icon, Menu } from '../ds'
import { useAdmin } from './AdminContext'
import type { CopyKey } from './copy'
import { visibleNav, type NavGroup, type Screen } from './routes'

const GROUP_LABEL: Record<NavGroup['key'], CopyKey> = { overview: 'groupOverview', work: 'groupWork', manage: 'groupManage', admin: 'groupAdmin' }
const NAV_LABEL: Record<Screen, CopyKey> = {
  overview: 'navOverview', outreach: 'navOutreach', inbox: 'navInbox', leads: 'navLeads', conversations: 'navConversations',
  pages: 'navPages', analytics: 'navAnalytics', team: 'navTeam', settings: 'navSettings',
}

export function Sidebar() {
  const a = useAdmin()
  const { t, me, route, counts } = a
  const groups = visibleNav({ isAdmin: me.isAdmin, isSuperAdmin: me.isSuperAdmin, viewingAs: !!a.viewAs })
  const badge = (s: Screen): { n: number; tone?: 'muted' } | null => {
    if (s === 'inbox' && counts.inbox) return { n: counts.inbox }
    if (s === 'outreach' && counts.review) return { n: counts.review, tone: 'muted' }
    if (s === 'leads' && counts.newLeads) return { n: counts.newLeads }
    return null
  }
  const role = me.isSuperAdmin ? t('roleSuper') : me.isAdmin ? t('roleAdmin') : t('rolePartner')
  return (
    <aside className="am-sidebar" aria-label="Hoofdnavigatie" data-testid="admin-sidebar">
      <div className="am-sidebar-brand">
        <span className="am-brand-mark">am</span>
        <span className="am-brand-name">agentmakers <span>admin</span></span>
      </div>
      <nav className="am-nav">
        {groups.map((g) => (
          <div key={g.key} className="am-nav-section">
            {g.key !== 'overview' && <div className="am-nav-label">{t(GROUP_LABEL[g.key])}</div>}
            {g.items.map((it) => {
              const b = badge(it.screen)
              const label = t(NAV_LABEL[it.screen])
              return (
                <button key={it.screen} type="button" className="am-nav-item" aria-current={route.screen === it.screen ? 'page' : undefined}
                  title={a.collapsed ? label : undefined} onClick={() => a.navigate({ screen: it.screen } as never)} data-nav={it.screen}>
                  <Icon name={it.icon} />
                  <span className="am-nav-text">{label}</span>
                  {b && <span className="am-nav-count" data-tone={b.tone}>{b.n > 99 ? '99+' : b.n}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="am-sidebar-foot">
        <button type="button" className="am-nav-item" onClick={() => a.setCollapsed(!a.collapsed)} title={a.collapsed ? t('expand') : t('collapse')}>
          <Icon name="panel" /><span className="am-nav-text">{a.collapsed ? t('expand') : t('collapse')}</span>
        </button>
        <div className="am-user">
          <span className="am-hide-collapsed"><Avatar name={me.displayName} /></span>
          <div className="am-user-meta" style={{ flex: 1 }}>
            <div className="am-user-name">{me.displayName}</div>
            <div className="am-user-role">{role}</div>
          </div>
          <span>
            <Menu label="Account" placement="top" items={[
              { label: a.lang === 'nl' ? 'Español' : 'Nederlands', icon: 'globe', onSelect: () => a.setLang(a.lang === 'nl' ? 'es' : 'nl') },
              { label: t('logout'), icon: 'logout', onSelect: a.logout, separatorBefore: true },
            ]} />
          </span>
        </div>
      </div>
    </aside>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const a = useAdmin()
  return (
    <div className="am-app" data-collapsed={a.collapsed ? 'true' : undefined}>
      <Sidebar />
      <main className="am-main">
        {a.viewAs && (
          <div className="am-banner" data-tone="warning" role="status" data-testid="view-as-banner">
            <span className="am-inline"><Icon name="eye" size={14} /> {a.t('viewingAs')} <strong>{a.viewAs.name}</strong>. {a.t('viewingAsScope')}</span>
            <button type="button" className="am-btn" data-variant="secondary" data-size="sm" onClick={() => a.setViewAs(null)}>{a.t('stopViewing')}</button>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
