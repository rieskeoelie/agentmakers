'use client'
/**
 * AgentMakers admin design system — the only UI primitives admin screens use.
 * Visual rules live in admin.css (.am-*); components here only choose classes and structure.
 */
import {
  Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { Icon, type IconName } from './icons'

export { Icon, type IconName }

// ─── Data loading ────────────────────────────────────────────────────────────
/**
 * Loads data for a view. Results are applied asynchronously and stale responses are ignored.
 * `reload()` refetches while keeping the previous data on screen (no layout jump).
 */
export function useLoad<T>(load: () => Promise<T>): { data: T | null; error: string | null; reload: () => void; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    load().then(
      (data) => { if (live) setState({ data, error: null, loading: false }) },
      (e: unknown) => { if (live) setState((s) => ({ ...s, loading: false, error: (e as Error)?.message ?? 'Er ging iets mis.' })) },
    )
    return () => { live = false }
  }, [load, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

// ─── Buttons ─────────────────────────────────────────────────────────────────
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'

export function Button({ children, variant = 'secondary', size, icon, iconRight, loading, disabled, onClick, type = 'button', title, ...rest }: {
  children?: ReactNode; variant?: ButtonVariant; size?: 'sm' | 'md'; icon?: IconName; iconRight?: IconName; loading?: boolean
  disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit'; title?: string; 'data-testid'?: string; 'aria-label'?: string
}) {
  return (
    <button type={type} className="am-btn" data-variant={variant} data-size={size === 'sm' ? 'sm' : undefined} disabled={disabled || loading}
      onClick={onClick} title={title} {...rest}>
      {loading ? <span className="am-spinner" aria-hidden /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 15} /> : null}
      {children}
      {iconRight && <Icon name={iconRight} size={14} />}
    </button>
  )
}

export function IconButton({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick?: () => void; disabled?: boolean }) {
  return <button type="button" className="am-icon-btn" aria-label={label} title={label} onClick={onClick} disabled={disabled}><Icon name={icon} /></button>
}

export function LinkButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return <button type="button" className="am-link-btn" onClick={onClick} title={title}>{children}</button>
}

// ─── Status ──────────────────────────────────────────────────────────────────
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'violet' | 'neutral' | 'muted'

/** The single status component. Tone carries meaning; label carries the state. */
export function Status({ tone = 'neutral', children, title, dot = true }: { tone?: Tone; children: ReactNode; title?: string; dot?: boolean }) {
  return <span className="am-status" data-tone={tone} data-dot={dot ? undefined : 'false'} title={title}>{children}</span>
}

export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return <span className="am-tag" title={title}>{children}</span>
}

// ─── Page structure ──────────────────────────────────────────────────────────
export function Page({ children, width }: { children: ReactNode; width?: 'narrow' | 'full' }) {
  return <div className="am-page" data-width={width}>{children}</div>
}

export function PageHeader({ title, subtitle, breadcrumb, actions, status }: {
  title: ReactNode; subtitle?: ReactNode; breadcrumb?: Array<{ label: string; onClick?: () => void }>; actions?: ReactNode; status?: ReactNode
}) {
  return (
    <header className="am-page-header">
      <div className="am-page-header-main">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="am-breadcrumb" aria-label="Kruimelpad">
            {breadcrumb.map((b, i) => (
              <Fragment key={i}>
                {b.onClick ? <button type="button" onClick={b.onClick}>{b.label}</button> : <span>{b.label}</span>}
                <Icon name="chevronRight" size={12} />
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="am-page-title">{title}{status}</h1>
        {subtitle && <p className="am-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="am-page-actions">{actions}</div>}
    </header>
  )
}

export function LocalTabs<K extends string>({ tabs, current, onSelect, label }: {
  tabs: Array<{ key: K; label: string; count?: number | null }>; current: K; onSelect: (k: K) => void; label: string
}) {
  return (
    <nav className="am-tabs" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" className="am-tab" aria-current={current === t.key ? 'page' : undefined} onClick={() => onSelect(t.key)}>
          {t.label}{t.count ? <span className="am-tab-count">{t.count}</span> : null}
        </button>
      ))}
    </nav>
  )
}

export function Section({ title, description, aside, children, id, anchor, testId }: {
  title?: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode; id?: string; anchor?: string; testId?: string
}) {
  return (
    <section className="am-section" id={anchor} data-section={id} data-testid={testId}>
      {(title || aside) && (
        <div className="am-section-head">
          <div>
            {title && <h2 className="am-section-title">{title}</h2>}
            {description && <p className="am-section-desc">{description}</p>}
          </div>
          {aside && <div className="am-section-aside">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Panel({ children, pad = true, style }: { children: ReactNode; pad?: boolean; style?: CSSProperties }) {
  return <div className={pad ? 'am-panel am-panel-pad' : 'am-panel'} style={style}>{children}</div>
}

/** Settings-style rows: label + one-line help on the left, aligned control on the right. */
export function Rows({ children, testId }: { children: ReactNode; testId?: string }) {
  return <div className="am-rows" data-testid={testId}>{children}</div>
}
export function Row({ label, help, children }: { label: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="am-row">
      <div><div className="am-row-label">{label}</div>{help && <div className="am-row-help">{help}</div>}</div>
      <div className="am-row-control">{children}</div>
    </div>
  )
}

// ─── Metrics ─────────────────────────────────────────────────────────────────
export interface MetricItem { label: string; value: ReactNode; sub?: ReactNode; tone?: 'success' | 'warning' | 'danger'; onClick?: () => void; title?: string }

export function Metrics({ items, testId }: { items: MetricItem[]; testId?: string }) {
  return (
    <div className="am-metrics" data-testid={testId}>
      {items.map((m) => (
        <div key={m.label} className="am-metric" data-tone={m.tone} data-clickable={m.onClick ? 'true' : undefined} title={m.title}
          onClick={m.onClick} role={m.onClick ? 'button' : undefined} tabIndex={m.onClick ? 0 : undefined}
          onKeyDown={m.onClick ? (e) => { if (e.key === 'Enter') m.onClick?.() } : undefined}>
          <div className="am-metric-label">{m.label}</div>
          <div className="am-metric-value">{m.value}</div>
          {m.sub !== undefined && <div className="am-metric-sub">{m.sub}</div>}
        </div>
      ))}
    </div>
  )
}

export function KeyValue({ items, cols, dense }: { items: Array<[string, ReactNode]>; cols?: 2; dense?: boolean }) {
  return (
    <dl className="am-kv" data-cols={cols} data-dense={dense ? 'true' : undefined}>
      {items.map(([k, v]) => (
        <Fragment key={k}><dt>{k}</dt><dd>{v === null || v === undefined || v === '' ? '—' : v}</dd></Fragment>
      ))}
    </dl>
  )
}

export function Bar({ pct, tone, state }: { pct: number | null; tone?: 'warning' | 'success' | 'danger' | 'muted'; state?: 'active' }) {
  return <div className="am-bar" data-tone={tone} data-state={state} aria-label={pct === null ? 'onbekend' : `${pct}%`}><span style={{ width: `${pct ?? 0}%` }} /></div>
}

export function Avatar({ name, size }: { name: string; size?: 'md' }) {
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?'
  return <span className="am-avatar" data-size={size} aria-hidden>{initials}</span>
}

export function ExtLink({ href, children }: { href: string | null | undefined; children?: ReactNode }) {
  if (!href) return <>—</>
  const safe = /^https?:\/\//i.test(href) ? href : null
  if (!safe) return <>{children ?? href}</>
  return <a href={safe} target="_blank" rel="noopener noreferrer nofollow" style={{ overflowWrap: 'anywhere' }}>{children ?? safe.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>
}

// ─── Feedback ────────────────────────────────────────────────────────────────
export function EmptyState({ title, text, action, icon = 'inbox', framed = true }: { title: string; text?: ReactNode; action?: ReactNode; icon?: IconName; framed?: boolean }) {
  return (
    <div className="am-empty" data-framed={framed ? 'true' : undefined} data-testid="empty-state">
      <div className="am-empty-icon"><Icon name={icon} size={22} /></div>
      <div className="am-empty-title">{title}</div>
      {text && <div className="am-empty-text">{text}</div>}
      {action && <div className="am-empty-action">{action}</div>}
    </div>
  )
}

export function Callout({ tone = 'neutral', title, children, action, icon, testId }: {
  tone?: 'danger' | 'warning' | 'success' | 'info' | 'neutral'; title?: ReactNode; children?: ReactNode; action?: ReactNode; icon?: IconName; testId?: string
}) {
  const ic: IconName = icon ?? (tone === 'danger' || tone === 'warning' ? 'alert' : tone === 'success' ? 'checkCircle' : 'info')
  return (
    <div className="am-callout" data-tone={tone} role={tone === 'danger' ? 'alert' : undefined} data-testid={testId}>
      <Icon name={ic} />
      <div className="am-callout-body">{title && <div className="am-callout-title">{title}</div>}{children}</div>
      {action && <div className="am-callout-action">{action}</div>}
    </div>
  )
}

/** Local, actionable error. Never shows raw stack traces. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div data-testid="error-box">
      <Callout tone="danger" title="Laden mislukt" action={onRetry ? <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>Opnieuw</Button> : undefined}>
        {message}
      </Callout>
    </div>
  )
}

export function Skeleton({ width = '100%', height = 12, style }: { width?: number | string; height?: number; style?: CSSProperties }) {
  return <span className="am-skeleton" style={{ width, height, ...style }} />
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="am-table-wrap" data-testid="loading" aria-busy="true">
      <div className="am-skeleton-rows">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="am-skeleton-row">
            {Array.from({ length: cols }, (_, c) => <Skeleton key={c} width={c === 0 ? '24%' : `${10 + ((r + c) % 4) * 4}%`} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function BlockSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="am-stack" data-testid="loading" aria-busy="true">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={`${90 - (i % 3) * 18}%`} height={14} />)}
    </div>
  )
}

// ─── Forms ───────────────────────────────────────────────────────────────────
export function Field({ label, help, error, children, htmlFor }: { label: ReactNode; help?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="am-field">
      <label className="am-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="am-field-error">{error}</span> : help ? <span className="am-help">{help}</span> : null}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`am-input${props.className ? ` ${props.className}` : ''}`} />
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`am-select${props.className ? ` ${props.className}` : ''}`} />
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`am-textarea${props.className ? ` ${props.className}` : ''}`} />
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" className="am-switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />
}

export function Segmented<K extends string>({ options, value, onChange, label }: { options: Array<{ value: K; label: string }>; value: K; onChange: (v: K) => void; label: string }) {
  return (
    <div className="am-segmented" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

// ─── Filter bar ──────────────────────────────────────────────────────────────
export function FilterBar({ children, end, testId }: { children: ReactNode; end?: ReactNode; testId?: string }) {
  return <div className="am-filterbar" data-testid={testId}>{children}{end && <div className="am-filterbar-end">{end}</div>}</div>
}

export function SearchInput({ value, onChange, placeholder, label = 'Zoeken' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <div className="am-search">
      <Icon name="search" size={14} />
      <input className="am-input" type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function FilterSelect<V extends string>({ value, onChange, options, label }: { value: V; onChange: (v: V) => void; options: Array<{ value: V; label: string }>; label: string }) {
  return (
    <select className="am-select am-filter-select" aria-label={label} data-active={value ? 'true' : undefined} value={value} onChange={(e) => onChange(e.target.value as V)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function ActiveFilters({ items, onClearAll }: { items: Array<{ key: string; label: string; onRemove: () => void }>; onClearAll: () => void }) {
  if (!items.length) return null
  return (
    <div className="am-chips" data-testid="active-filters">
      {items.map((f) => (
        <span key={f.key} className="am-chip">{f.label}<button type="button" aria-label={`Verwijder filter ${f.label}`} onClick={f.onRemove}><Icon name="x" size={12} /></button></span>
      ))}
      <LinkButton onClick={onClearAll}>Alles wissen</LinkButton>
    </div>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  sort?: (row: T) => string | number | null | undefined
  align?: 'right' | 'center'
  nowrap?: boolean
  shrink?: boolean
  width?: number | string
  /** Hide on narrower screens: 'lg' below 1520px, 'md' below 1360px, 'sm' below 1180px. Never hide the identifying column. */
  hide?: 'lg' | 'md' | 'sm'
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null

export function DataTable<T>({ rows, columns, rowKey, onRowClick, selectedKey, dimRow, defaultSort, minWidth, testId, rowTestId, groups, caption }: {
  rows: T[]; columns: Array<Column<T>>; rowKey: (row: T) => string; onRowClick?: (row: T) => void; selectedKey?: string | null
  dimRow?: (row: T) => boolean; defaultSort?: SortState; minWidth?: number; testId?: string; rowTestId?: string
  groups?: Array<{ key: string; label: ReactNode; rows: T[] }>; caption?: string
}) {
  const [sort, setSort] = useState<SortState>(defaultSort ?? null)
  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort])
  const toggle = (c: Column<T>) => {
    if (!c.sort) return
    setSort((s) => (s?.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }))
  }
  const renderRow = (r: T) => {
    const k = rowKey(r)
    return (
      <tr key={k} data-testid={rowTestId} data-clickable={onRowClick ? 'true' : undefined} aria-selected={selectedKey === k ? true : undefined}
        data-dim={dimRow?.(r) ? 'true' : undefined} onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest('button,a,input,select,textarea,[data-stop]')) onRowClick(r) } : undefined}>
        {columns.map((c) => (
          <td key={c.key} data-hide={c.hide} data-align={c.align} data-nowrap={c.nowrap ? 'true' : undefined} data-shrink={c.shrink ? 'true' : undefined} style={c.width ? { width: c.width } : undefined}>{c.render(r)}</td>
        ))}
      </tr>
    )
  }
  return (
    <div className="am-table-wrap" data-testid={testId}>
      <table className="am-table" style={minWidth ? { minWidth } : undefined}>
        {caption && <caption className="am-faint" style={{ display: 'none' }}>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} data-hide={c.hide} data-align={c.align} data-sortable={c.sort ? 'true' : undefined} data-shrink={c.shrink ? 'true' : undefined}
                aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} onClick={() => toggle(c)}
                style={c.width ? { width: c.width } : undefined}>
                {c.header}{c.sort && <span className="am-sort">{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups.filter((g) => g.rows.length > 0).map((g) => (
                <Fragment key={g.key}>
                  <tr className="am-table-group" data-testid={`group-${g.key}`}><td colSpan={columns.length}>{g.label}</td></tr>
                  {sortRows(g.rows, columns, sort).map(renderRow)}
                </Fragment>
              ))
            : sorted.map(renderRow)}
        </tbody>
      </table>
    </div>
  )
}

function sortRows<T>(rows: T[], columns: Array<Column<T>>, sort: SortState): T[] {
  if (!sort) return rows
  const col = columns.find((c) => c.key === sort.key)
  if (!col?.sort) return rows
  const val = col.sort
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b)
    if (x === y) return 0
    if (x === null || x === undefined) return 1
    if (y === null || y === undefined) return -1
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nl', { numeric: true })
    return sort.dir === 'asc' ? r : -r
  })
}

export function Pagination({ page, pages, total, label, onPage }: { page: number; pages: number; total: number; label: string; onPage: (p: number) => void }) {
  return (
    <div className="am-table-foot">
      <span>{total} {label}{pages > 1 ? ` · pagina ${page + 1} van ${pages}` : ''}</span>
      {pages > 1 && (
        <span className="am-inline">
          <Button size="sm" icon="chevronLeft" disabled={page === 0} onClick={() => onPage(page - 1)}>Vorige</Button>
          <Button size="sm" iconRight="chevronRight" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Volgende</Button>
        </span>
      )}
    </div>
  )
}

// ─── Menu ────────────────────────────────────────────────────────────────────
export interface MenuItem { label: string; onSelect: () => void; icon?: IconName; tone?: 'danger'; disabled?: boolean; separatorBefore?: boolean }

/**
 * Row/page action menu. Rendered with fixed positioning so it is never clipped by a scrolling table, and flipped
 * above the trigger when there is no room below.
 */
export function Menu({ items, label = 'Acties', trigger, align, placement }: { items: MenuItem[]; label?: string; trigger?: ReactNode; align?: 'left'; placement?: 'top' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const dismiss = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss)
    return () => {
      document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss)
    }
  }, [open])
  useLayoutEffect(() => {
    if (!open) return
    const a = ref.current?.getBoundingClientRect()
    const m = menuRef.current?.getBoundingClientRect()
    if (!a || !m) return
    const room = window.innerHeight - a.bottom
    const up = placement === 'top' || (room < m.height + 12 && a.top > m.height + 12)
    const horizontal = align === 'left' ? { left: Math.max(8, Math.min(a.left, window.innerWidth - m.width - 8)) } : { left: Math.max(8, a.right - m.width) }
    // Position the floating menu directly on the DOM node (measurement-driven, no extra render).
    const el = menuRef.current!
    Object.assign(el.style, { top: `${up ? a.top - m.height - 4 : a.bottom + 4}px`, left: `${horizontal.left}px`, visibility: 'visible' })
  }, [open, align, placement])
  const toggle = () => setOpen((o) => !o)
  if (!items.length) return null
  return (
    <div className="am-menu-anchor am-row-actions" ref={ref} data-stop>
      {trigger
        ? <span onClick={toggle}>{trigger}</span>
        : <button type="button" className="am-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon name="more" /></button>}
      {open && (
        <div className="am-menu" role="menu" ref={menuRef} style={{ position: 'fixed', visibility: 'hidden', top: 0, left: 0, right: 'auto', bottom: 'auto' }}>
          {items.map((it, i) => (
            <Fragment key={i}>
              {it.separatorBefore && <div className="am-menu-sep" />}
              <button type="button" role="menuitem" className="am-menu-item" data-tone={it.tone} disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect() }}>
                {it.icon && <Icon name={it.icon} size={14} />}{it.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Dialog / Drawer ─────────────────────────────────────────────────────────
function useEscape(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose, active])
}

export function Dialog({ open, title, description, children, footer, onClose, size, closeDisabled, testId }: {
  open: boolean; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; onClose: () => void; size?: 'lg'; closeDisabled?: boolean; testId?: string
}) {
  const id = useId()
  useEscape(() => { if (!closeDisabled) onClose() }, open)
  if (!open) return null
  return (
    <div className="am-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !closeDisabled) onClose() }}>
      <div className="am-dialog" role="dialog" aria-modal="true" aria-labelledby={id} data-size={size} data-testid={testId}>
        <div className="am-dialog-head">
          <div><div className="am-dialog-title" id={id}>{title}</div>{description && <div className="am-dialog-desc">{description}</div>}</div>
          <IconButton icon="x" label="Sluiten" onClick={onClose} disabled={closeDisabled} />
        </div>
        {children && <div className="am-dialog-body">{children}</div>}
        {footer && <div className="am-dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

export interface ConfirmOptions { title: string; description?: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary' }

/** Replaces window.confirm: `const [confirm, confirmDialog] = useConfirm()` → `if (await confirm({...}))`. */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  const node = (
    <Dialog open={!!state} title={state?.title ?? ''} description={state?.description} onClose={() => close(false)} testId="confirm-dialog"
      footer={<>
        <Button variant="ghost" onClick={() => close(false)}>Annuleren</Button>
        <Button variant={state?.tone === 'primary' ? 'primary' : 'danger-solid'} onClick={() => close(true)}>{state?.confirmLabel ?? 'Bevestigen'}</Button>
      </>} />
  )
  return [confirm, node]
}

export function Drawer({ open, title, subtitle, children, footer, onClose, testId }: {
  open: boolean; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; testId?: string
}) {
  useEscape(onClose, open)
  if (!open) return null
  return (
    <>
      <div className="am-drawer-overlay" onMouseDown={onClose} />
      <aside className="am-drawer" role="dialog" aria-modal="true" data-testid={testId}>
        <div className="am-drawer-head">
          <div style={{ minWidth: 0 }}><div className="am-dialog-title">{title}</div>{subtitle && <div className="am-dialog-desc">{subtitle}</div>}</div>
          <IconButton icon="x" label="Sluiten" onClick={onClose} />
        </div>
        <div className="am-drawer-body">{children}</div>
        {footer && <div className="am-drawer-foot">{footer}</div>}
      </aside>
    </>
  )
}

// ─── Timeline ────────────────────────────────────────────────────────────────
export function Timeline({ items, empty = 'Nog geen activiteit.' }: { items: Array<{ id: string | number; time: string; text: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'accent' }>; empty?: string }) {
  if (!items.length) return <p className="am-muted">{empty}</p>
  return (
    <ul className="am-timeline">
      {items.map((it) => (
        <li key={it.id} data-tone={it.tone}><span className="am-timeline-time">{it.time}</span><span className="am-timeline-dot" /><span className="am-timeline-text">{it.text}</span></li>
      ))}
    </ul>
  )
}
