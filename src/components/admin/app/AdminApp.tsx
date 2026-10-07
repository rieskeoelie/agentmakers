'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Page } from '../ds'
import { AdminProvider, useAdmin } from './AdminContext'
import { Login } from './Login'
import type { CurrentUser } from './model'
import { canOpen, parseRoute } from './routes'
import { Shell } from './Shell'
import { OverviewScreen } from '../screens/Overview'
import { LeadsScreen } from '../screens/Leads'
import { LeadDetailScreen } from '../screens/LeadDetail'
import { ConversationsScreen } from '../screens/Conversations'
import { PagesScreen } from '../screens/Pages'
import { PageEditorScreen } from '../screens/PageEditor'
import { AnalyticsScreen } from '../screens/Analytics'
import { TeamScreen } from '../screens/Team'
import { SettingsScreen } from '../screens/Settings'
import { InboxScreen } from '../outreach/InboxView'
import { OutreachScreen } from '../outreach/OutreachWorkspace'

/** The admin application: session check → login, or the shell with the screen for the current URL. */
export default function AdminApp() {
  const pathname = usePathname() ?? '/admin'
  const router = useRouter()
  const [me, setMe] = useState<CurrentUser | null>(null)
  const [checked, setChecked] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)

  useEffect(() => {
    const rt = new URLSearchParams(window.location.search).get('reset')
    if (rt) window.history.replaceState({}, '', '/admin')
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        if (res.ok) {
          const u = await res.json()
          setMe({ userId: u.userId, displayName: u.displayName, isAdmin: !!u.isAdmin, isSuperAdmin: !!u.isSuperAdmin })
        }
      })
      .catch(() => undefined)
      .finally(() => { if (rt) setResetToken(rt); setChecked(true) })
  }, [])

  const push = useCallback((href: string) => { router.push(href); window.scrollTo?.(0, 0) }, [router])
  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setMe(null)
    router.push('/admin')
  }, [router])

  if (!checked) return <div className="am-login" aria-busy="true" />
  if (!me || resetToken) return <Login resetToken={resetToken} onLoggedIn={(u) => { setResetToken(null); setMe(u) }} />
  return (
    <AdminProvider me={me} route={parseRoute(pathname)} push={push} onLogout={logout}>
      <Shell><ScreenRouter /></Shell>
    </AdminProvider>
  )
}

export function ScreenRouter() {
  const a = useAdmin()
  const r = a.route
  if (!canOpen(r.screen, { isAdmin: a.me.isAdmin, isSuperAdmin: a.me.isSuperAdmin, viewingAs: !!a.viewAs })) {
    return <Page><EmptyState icon="shield" title={a.t('noAccess')} text={a.t('noAccessText')} /></Page>
  }
  switch (r.screen) {
    case 'overview': return <OverviewScreen />
    case 'outreach': return <OutreachScreen route={r} />
    case 'inbox': return <InboxScreen selectedId={r.id ?? null} />
    case 'leads': return r.id ? <LeadDetailScreen id={r.id} /> : <LeadsScreen />
    case 'conversations': return <ConversationsScreen openId={r.id ?? null} />
    case 'pages': return r.id ? <PageEditorScreen id={r.id} /> : <PagesScreen />
    case 'analytics': return <AnalyticsScreen />
    case 'team': return <TeamScreen />
    case 'settings': return <SettingsScreen />
  }
}
