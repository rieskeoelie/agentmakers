import { NextRequest, NextResponse, after } from 'next/server'
import { loadOutreachEnv } from '@/lib/outreach/adapter'
import { errorResponse, outreachDb, readJson, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { replyLlmFactory, runAnalysisTick, sendContext, sendingEnvFrom, smartleadFor } from '@/lib/outreach/sending/runtime'
import { runSendTick } from '@/lib/outreach/sending/sender'
import { inboxActionForActor, inboxThreadForActor } from '@/lib/outreach/sending/service'

export const maxDuration = 60
type Ctx = { params: Promise<{ id: string }> }

/** GET /api/outreach/inbox/[id] — thread: messages, prospect / company / run / Company Brain context, events. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  try {
    return NextResponse.json(await inboxThreadForActor(outreachDb(), actor, id))
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * POST /api/outreach/inbox/[id] — { action: reply | state | promote | suppress | reanalyze }.
 * reply requires { confirm: true } and an idempotency key: a human sends every reply; the AI only suggests.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  const db = outreachDb()
  const s = sendingEnvFrom()
  const ctx = sendContext(db, s, (m, d) => console.log('[outreach-inbox]', m, d ?? ''))
  try {
    const res = await inboxActionForActor(db, actor, id, await readJson(req), {
      smartlead: smartleadFor(s),
      afterChange: () => after(async () => {
        try {
          await runSendTick(ctx, { push: false, sync: false })
          await runAnalysisTick(ctx, replyLlmFactory(loadOutreachEnv()))
        } catch (e) {
          console.error('[outreach-inbox] follow-up work failed', e)
        }
      }),
    })
    return NextResponse.json(res)
  } catch (e) {
    return errorResponse(e)
  }
}
