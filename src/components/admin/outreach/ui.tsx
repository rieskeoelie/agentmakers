'use client'
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Loads data for a view. Results are applied asynchronously (never synchronously inside the effect) and stale
 * responses are ignored. `reload()` refetches while keeping the previous data on screen.
 */
export function useLoad<T>(load: () => Promise<T>): { data: T | null; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    load().then(
      (data) => { if (live) setState({ data, error: null }) },
      (e: unknown) => { if (live) setState((s) => ({ ...s, error: (e as Error)?.message ?? 'Er ging iets mis.' })) },
    )
    return () => { live = false }
  }, [load, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

/** Small UI primitives in the existing admin's style (Nunito/Poppins, teal accent, white panels). */
export const C = {
  teal: '#0D9488', tealDark: '#0F766E', ink: '#0F172A', text: '#334155', muted: '#64748B', faint: '#94A3B8',
  line: '#E2E8F0', soft: '#F8FAFC', panel: '#FFFFFF', red: '#991B1B', redBg: '#FEE2E2', amber: '#B45309', amberBg: '#FEF3C7',
  green: '#166534', greenBg: '#DCFCE7', blue: '#0369A1', blueBg: '#E0F2FE',
}
export const font = "'Nunito',sans-serif"
export const headFont = "'Poppins',sans-serif"

export const panel: CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, boxSizing: 'border-box' }
export const th: CSSProperties = { textAlign: 'left', fontSize: '.72rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.03em', padding: '8px 10px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap', background: C.soft }
export const td: CSSProperties = { fontSize: '.82rem', color: C.text, padding: '9px 10px', borderBottom: `1px solid #F1F5F9`, verticalAlign: 'top' }
export const tableWrap: CSSProperties = { overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel }

export function Chip({ children, color = C.muted, bg = '#F1F5F9', title }: { children: ReactNode; color?: string; bg?: string; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: '.72rem', fontWeight: 700, color, background: bg, whiteSpace: 'nowrap', lineHeight: 1.5 }}>
      {children}
    </span>
  )
}

export function Btn({ children, onClick, kind = 'secondary', disabled, title, type = 'button', small }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; title?: string; type?: 'button' | 'submit'; small?: boolean
}) {
  const base: CSSProperties = { fontFamily: font, fontWeight: 700, fontSize: small ? '.76rem' : '.82rem', borderRadius: 8, padding: small ? '4px 10px' : '7px 14px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' }
  const kinds: Record<string, CSSProperties> = {
    primary: { background: C.teal, color: '#fff', border: `1px solid ${C.teal}` },
    secondary: { background: '#fff', color: C.text, border: `1px solid #CBD5E1` },
    danger: { background: '#fff', color: C.red, border: `1px solid #FCA5A5` },
    ghost: { background: 'transparent', color: C.teal, border: '1px solid transparent' },
  }
  return <button type={type} title={title} disabled={disabled} onClick={onClick} style={{ ...base, ...kinds[kind] }}>{children}</button>
}

export function Progress({ pct, color = C.teal }: { pct: number | null; color?: string }) {
  return (
    <div style={{ height: 6, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden', minWidth: 60 }} aria-label={pct === null ? 'onbekend' : `${pct}%`}>
      <div style={{ height: '100%', width: pct === null ? '30%' : `${pct}%`, background: pct === null ? '#CBD5E1' : color, borderRadius: 999 }} />
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div data-testid="empty-state" style={{ ...panel, textAlign: 'center', padding: '28px 16px', color: C.muted }}>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
      {text && <div style={{ fontSize: '.85rem', marginBottom: action ? 12 : 0 }}>{text}</div>}
      {action}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" data-testid="error-box" style={{ background: C.redBg, border: '1px solid #FCA5A5', color: C.red, borderRadius: 10, padding: '10px 14px', fontSize: '.85rem', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{message}</span>
      {onRetry && <Btn small onClick={onRetry}>Opnieuw</Btn>}
    </div>
  )
}

export function Loading({ label = 'Laden…' }: { label?: string }) {
  return <div data-testid="loading" style={{ color: C.muted, fontSize: '.85rem', padding: '12px 2px' }}>{label}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '18px 0 8px' }}>
      <h3 style={{ fontFamily: headFont, fontSize: '.95rem', margin: 0, color: C.ink }}>{children}</h3>
      {right}
    </div>
  )
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.8rem', color: C.text, fontWeight: 700 }}>
      {label}
      {children}
      {hint && !error && <span style={{ fontWeight: 400, color: C.faint, fontSize: '.74rem' }}>{hint}</span>}
      {error && <span style={{ fontWeight: 600, color: C.red, fontSize: '.74rem' }}>{error}</span>}
    </label>
  )
}

export const input: CSSProperties = { fontFamily: font, fontSize: '.85rem', padding: '7px 10px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', color: C.ink, minWidth: 0 }

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, max-content) 1fr', gap: '6px 14px', margin: 0, fontSize: '.82rem' }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ color: C.muted }}>{k}</dt>
          <dd style={{ margin: 0, color: C.ink, wordBreak: 'break-word' }}>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ExtLink({ href, children }: { href: string | null | undefined; children?: ReactNode }) {
  if (!href) return <>—</>
  const safe = /^https?:\/\//i.test(href) ? href : null
  if (!safe) return <>{children ?? href}</>
  return <a href={safe} target="_blank" rel="noopener noreferrer nofollow" style={{ color: C.teal, textDecoration: 'none', wordBreak: 'break-all' }}>{children ?? safe}</a>
}
