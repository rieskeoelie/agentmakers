/**
 * Admin URL model. Every admin screen has a real URL under /admin so deep links, refresh and the browser back
 * button work. Pure functions — unit tested.
 */
export type OutreachView = 'runs' | 'new' | 'run' | 'prospects' | 'prospect' | 'review' | 'settings'

export type Route =
  | { screen: 'overview' }
  | { screen: 'outreach'; view: OutreachView; id?: string; runId?: string; duplicateOf?: string }
  | { screen: 'inbox'; id?: string }
  | { screen: 'leads'; id?: string }
  | { screen: 'conversations'; id?: string }
  | { screen: 'pages'; id?: string }
  | { screen: 'analytics' }
  | { screen: 'team' }
  | { screen: 'settings' }

export type Screen = Route['screen']

const seg = (s: string | undefined) => (s && /^[\w-]{1,80}$/.test(s) ? s : undefined)

export function parseRoute(pathname: string): Route {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  if (parts[0] === 'admin') parts.shift()
  const [a, b, c, d] = parts
  switch (a) {
    case undefined: return { screen: 'overview' }
    case 'outreach': {
      if (b === undefined || b === 'runs' && c === undefined) return { screen: 'outreach', view: 'runs' }
      if (b === 'new') return { screen: 'outreach', view: 'new' }
      if (b === 'runs' && seg(c)) {
        if (d === 'prospects') return { screen: 'outreach', view: 'prospects', runId: seg(c) }
        if (d === 'duplicate') return { screen: 'outreach', view: 'new', duplicateOf: seg(c) }
        return { screen: 'outreach', view: 'run', id: seg(c) }
      }
      if (b === 'prospects') return seg(c) ? { screen: 'outreach', view: 'prospect', id: seg(c) } : { screen: 'outreach', view: 'prospects' }
      if (b === 'review') return { screen: 'outreach', view: 'review' }
      if (b === 'settings') return { screen: 'outreach', view: 'settings' }
      return { screen: 'outreach', view: 'runs' }
    }
    case 'inbox': return { screen: 'inbox', id: seg(b) }
    case 'leads': return { screen: 'leads', id: seg(b) }
    case 'conversations': return { screen: 'conversations', id: seg(b) }
    case 'pages': return { screen: 'pages', id: seg(b) }
    case 'analytics': return { screen: 'analytics' }
    case 'team': return { screen: 'team' }
    case 'settings': return { screen: 'settings' }
    default: return { screen: 'overview' }
  }
}

export function routePath(r: Route): string {
  switch (r.screen) {
    case 'overview': return '/admin'
    case 'outreach':
      switch (r.view) {
        case 'runs': return '/admin/outreach'
        case 'new': return r.duplicateOf ? `/admin/outreach/runs/${r.duplicateOf}/duplicate` : '/admin/outreach/new'
        case 'run': return `/admin/outreach/runs/${r.id}`
        case 'prospects': return r.runId ? `/admin/outreach/runs/${r.runId}/prospects` : '/admin/outreach/prospects'
        case 'prospect': return `/admin/outreach/prospects/${r.id}`
        case 'review': return '/admin/outreach/review'
        case 'settings': return '/admin/outreach/settings'
      }
      return '/admin/outreach'
    case 'inbox': return r.id ? `/admin/inbox/${r.id}` : '/admin/inbox'
    case 'leads': return r.id ? `/admin/leads/${r.id}` : '/admin/leads'
    case 'conversations': return r.id ? `/admin/conversations/${r.id}` : '/admin/conversations'
    case 'pages': return r.id ? `/admin/pages/${r.id}` : '/admin/pages'
    default: return `/admin/${r.screen}`
  }
}

export interface Access { isAdmin: boolean; isSuperAdmin: boolean; viewingAs: boolean }

/** Screens a user may open. Pages and Team are superadmin-only and hidden while viewing as another account. */
export function canOpen(screen: Screen, a: Access): boolean {
  if (screen === 'pages' || screen === 'team') return a.isSuperAdmin && !a.viewingAs
  if (screen === 'settings') return a.isAdmin || a.isSuperAdmin
  return true
}

export interface NavItem { screen: Screen; icon: 'home' | 'target' | 'inbox' | 'users' | 'phone' | 'file' | 'chart' | 'team' | 'settings' }
export interface NavGroup { key: 'overview' | 'work' | 'manage' | 'admin'; items: NavItem[] }

export const NAV: NavGroup[] = [
  { key: 'overview', items: [{ screen: 'overview', icon: 'home' }] },
  { key: 'work', items: [{ screen: 'outreach', icon: 'target' }, { screen: 'inbox', icon: 'inbox' }, { screen: 'leads', icon: 'users' }, { screen: 'conversations', icon: 'phone' }] },
  { key: 'manage', items: [{ screen: 'pages', icon: 'file' }, { screen: 'analytics', icon: 'chart' }] },
  { key: 'admin', items: [{ screen: 'team', icon: 'team' }, { screen: 'settings', icon: 'settings' }] },
]

export function visibleNav(a: Access): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canOpen(i.screen, a)) })).filter((g) => g.items.length > 0)
}
