'use client'
import { Fragment, useMemo, useState } from 'react'
import { Icon, LinkButton } from '../ds'
import type { RunFunnel, TimelineEvent } from '../../../lib/outreach/ui/types'
import { buildActivity, dayLabel, timeOf, type ActivityRow, type OutcomeCounts } from './activity'

const COLLAPSED_ROWS = 10

const fullTime = (iso: string) => new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Technical codes for one stored event — only shown on request. */
function code(e: TimelineEvent): string {
  const d = (e.data ?? {}) as Record<string, unknown>
  const detail = d.outcome ?? (d.from || d.to ? `${String(d.from ?? '?')} → ${String(d.to ?? '?')}` : d.decision ?? d.status ?? d.classification ?? null)
  return [e.type, detail].filter(Boolean).join(' · ')
}

function Detail({ row, names, onOpenProspect }: { row: ActivityRow; names: Record<string, string>; onOpenProspect?: (id: string) => void }) {
  const codes = [...new Set(row.events.map(code))]
  const actors = [...new Set(row.events.map((e) => e.actor).filter(Boolean))]
  return (
    <div className="am-activity-detail">
      <div className="am-activity-code" title={actors.length ? `door ${actors.join(', ')}` : undefined}>{codes.join(' | ')}</div>
      {(row.events.length > 1 || !!row.events[0]?.prospect_id || !!(row.events[0]?.data as Record<string, unknown> | null)?.error) && (
        <ul>
          {row.events.map((e) => {
            const d = (e.data ?? {}) as Record<string, unknown>
            const name = e.prospect_id ? names[e.prospect_id] : null
            const err = typeof d.error === 'string' && d.error ? d.error : null
            return (
              <li key={e.id}>
                <span className="am-activity-detail-time" title={fullTime(e.created_at)}>{timeOf(e.created_at)}</span>
                <span className="am-activity-detail-body">
                  {e.prospect_id && onOpenProspect
                    ? <LinkButton onClick={() => onOpenProspect(e.prospect_id!)} title={name ?? undefined}><span className="am-truncate" style={{ display: 'block' }}>{name ?? 'Prospect openen'}</span></LinkButton>
                    : !err ? <span className="am-faint">{fullTime(e.created_at)}</span> : null}
                  {err && <span className="am-activity-error" title={err}>{err}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Compact, human-readable run timeline: humanized and grouped events, quiet prospect-level rows, emphasised run-level
 * rows, day separators, and technical codes per row on request.
 */
export function RunActivity({ events, funnel, outcomes, names = {}, onOpenProspect, now }: {
  events: TimelineEvent[]; funnel?: RunFunnel; outcomes?: OutcomeCounts; names?: Record<string, string>; onOpenProspect?: (id: string) => void; now?: Date
}) {
  const rows = useMemo(() => buildActivity(events, funnel, outcomes), [events, funnel, outcomes])
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  if (!rows.length) return <p className="am-muted" style={{ margin: 0 }}>Nog geen activiteit.</p>
  const shown = all ? rows : rows.slice(0, COLLAPSED_ROWS)
  const days = shown.map((r) => dayLabel(r.at, now))
  return (
    <div className="am-activity" data-testid="run-activity">
      {shown.map((row, i) => {
        const day = days[i]!
        const sep = i === 0 ? day !== 'Vandaag' : day !== days[i - 1]
        const isOpen = open === row.key
        return (
          <Fragment key={row.key}>
            {sep && <div className="am-activity-day">{day}</div>}
            <div className="am-activity-row" data-tone={row.tone} data-level={row.level} data-testid="activity-row">
              <button type="button" className="am-activity-main" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.key)}
                title={`${row.text} — ${fullTime(row.at)}`}>
                <time className="am-activity-time" dateTime={row.at}>{timeOf(row.at)}</time>
                <span className="am-activity-dot" aria-hidden />
                <span className="am-activity-text">
                  <span className="am-activity-title">{row.text}</span>
                  {row.sub && <span className="am-activity-sub">{row.sub}</span>}
                </span>
                <span className="am-activity-chev" aria-hidden><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></span>
              </button>
              {isOpen && <Detail row={row} names={names} onOpenProspect={onOpenProspect} />}
            </div>
          </Fragment>
        )
      })}
      {rows.length > COLLAPSED_ROWS && (
        <div className="am-activity-more"><LinkButton onClick={() => setAll(!all)}>{all ? 'Minder tonen' : `Alle activiteit tonen (${rows.length})`}</LinkButton></div>
      )}
    </div>
  )
}
