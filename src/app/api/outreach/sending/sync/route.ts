import { NextRequest, NextResponse } from 'next/server'
import { loadOutreachEnv } from '@/lib/outreach/adapter'
import { errorResponse, outreachDb, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { requireOperator } from '@/lib/outreach/orchestration/service'
import { replyLlmFactory, runAnalysisTick, sendContext, sendingEnvFrom } from '@/lib/outreach/sending/runtime'
import { runSendTick } from '@/lib/outreach/sending/sender'

export const maxDuration = 120

/**
 * POST /api/outreach/sending/sync — admin "Nu synchroniseren": stop propagation, kill-switch propagation, provider sync
 * (sends/replies missed by webhooks) and reply analysis. Never pushes new leads (that only happens in the worker).
 */
export async function POST(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    requireOperator(actor)
    const ctx = sendContext(outreachDb(), sendingEnvFrom(), (m, d) => console.log('[outreach-sync]', m, d ?? ''))
    const send = await runSendTick(ctx, { push: false, sync: true, syncMinAgeSeconds: 15 })
    const analysis = await runAnalysisTick(ctx, replyLlmFactory(loadOutreachEnv()))
    return NextResponse.json({ send, analysis })
  } catch (e) {
    return errorResponse(e)
  }
}
