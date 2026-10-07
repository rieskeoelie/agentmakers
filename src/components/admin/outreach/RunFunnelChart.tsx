'use client'
import { Bar } from '../ds'
import { funnelRowState, funnelSteps, type FunnelStep } from '../../../lib/outreach/ui/runs'
import type { RunFunnel as RunFunnelCounts } from '../../../lib/outreach/ui/types'

const ROW_TONE: Partial<Record<string, 'success' | 'warning'>> = { ready: 'success', needs_review: 'warning' }

/**
 * Run funnel. Completed rows keep their colour and stay static, the one row being processed gets a calm pulse on its
 * track (never on text or numbers), later rows are neutral grey. With nothing processing every row is static.
 */
export function RunFunnelChart({ funnel, activeIndex, steps: given }: { funnel: RunFunnelCounts; activeIndex: number | null; steps?: FunnelStep[] }) {
  const steps = given ?? funnelSteps(funnel)
  const max = Math.max(1, ...steps.map((s) => s.value))
  return (
    <div className="am-stack am-funnel" style={{ gap: 10 }}>
      {steps.map((s, i) => {
        const state = funnelRowState(i, activeIndex)
        return (
          <div key={s.key} className="am-funnel-row" data-state={state} aria-current={state === 'active' ? 'step' : undefined}
            title={state === 'active' ? 'Wordt nu verwerkt' : undefined}
            style={{ display: 'grid', gridTemplateColumns: '150px 1fr 48px', alignItems: 'center', gap: 12 }}>
            <span className="am-muted">{s.label}</span>
            <Bar pct={Math.round((s.value / max) * 100)} state={state === 'active' ? 'active' : undefined}
              tone={state === 'future' ? 'muted' : ROW_TONE[s.key]} />
            <span className="am-num am-strong" style={{ textAlign: 'right' }}>{s.value}</span>
          </div>
        )
      })}
    </div>
  )
}
