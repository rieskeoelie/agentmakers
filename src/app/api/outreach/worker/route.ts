import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse, after } from 'next/server'
import { createLiveDeps, loadOutreachEnv } from '@/lib/outreach/adapter'
import { requiredRealModeEnvMissing } from '@/lib/outreach/config'
import { outreachDb } from '@/lib/outreach/orchestration/http'
import { workerSettingsFromEnv } from '@/lib/outreach/orchestration/settings'
import { isWorkerAuthorized, kickWorker } from '@/lib/outreach/orchestration/trigger'
import { runWorkerTick } from '@/lib/outreach/orchestration/worker'
import { runSendingWork, sendContext, sendingEnvFrom } from '@/lib/outreach/sending/runtime'

// Worker ticks run after the 202 response (after()), bounded by this limit; leases (900 s) outlive it.
export const maxDuration = 300

/**
 * Outreach worker. Called by: start/resume (kick), its own continuation chain, queue actions, and the daily Vercel cron (sweeper).
 * Each invocation runs one research tick and one sending tick.
 * Auth: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!isWorkerAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const env = loadOutreachEnv()
  const missing = requiredRealModeEnvMissing(env)
  if (missing.length) {
    console.error('[outreach-worker] missing provider configuration:', missing.join(', '))
    return NextResponse.json({ error: 'Outreach providers not configured', missing }, { status: 503 })
  }
  const origin = req.nextUrl.origin
  after(async () => {
    const workerId = `vercel-${randomUUID()}`
    try {
      const result = await runWorkerTick({
        db: outreachDb(),
        makeDeps: (cost) => createLiveDeps(env, cost),
        settings: workerSettingsFromEnv(),
        workerId,
        log: (message, data) => console.log('[outreach-worker]', workerId, message, data ?? ''),
      })
      if (result.hasMoreWork) await kickWorker({ origin, secret })
    } catch (e) {
      console.error('[outreach-worker] tick failed', e)
    }
    // Sending: stop propagation, kill switch, autopilot, pushes (final gate in the claim), sync, reply analysis.
    try {
      const log = (message: string, data?: Record<string, unknown>) => console.log('[outreach-sender]', message, data ?? '')
      const res = await runSendingWork(sendContext(outreachDb(), sendingEnvFrom(), log), env)
      console.log('[outreach-sender] tick', JSON.stringify(res))
    } catch (e) {
      console.error('[outreach-sender] tick failed', e)
    }
  })
  return NextResponse.json({ accepted: true }, { status: 202 })
}

export const GET = handle
export const POST = handle
