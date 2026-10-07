import { NextRequest, NextResponse, after } from 'next/server'
import { ownerFilterFor } from '@/lib/outreach/orchestration/adminService'
import { errorResponse, outreachDb, readJson, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { requireOperator } from '@/lib/outreach/orchestration/service'
import { sendRepo } from '@/lib/outreach/sending/repository'
import { sendContext, sendingEnvFrom, webhookUrlFor } from '@/lib/outreach/sending/runtime'
import { runSendTick } from '@/lib/outreach/sending/sender'
import { setSendingConfigForActor } from '@/lib/outreach/sending/service'

/** GET /api/outreach/sending — sending status, configuration and counters (booleans only for secrets). */
export async function GET(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    const s = sendingEnvFrom()
    const overview = await sendRepo.overview(outreachDb(), actor, ownerFilterFor(actor, req.nextUrl.searchParams.get('view_as')))
    return NextResponse.json({
      ...overview,
      provider: { smartlead_configured: !!s.smartleadKey, webhook_configured: !!webhookUrlFor(s), env_kill_switch: s.envKill },
      can_configure: actor.isSuperAdmin,
    })
  } catch (e) {
    return errorResponse(e)
  }
}

/** PATCH /api/outreach/sending — change settings. Any admin may switch sending OFF; everything else is superadmin-only. */
export async function PATCH(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    requireOperator(actor)
    const db = outreachDb()
    const config = await setSendingConfigForActor(db, actor, await readJson(req))
    // Propagate right away: switching off pauses every provider campaign; switching on resumes them.
    after(async () => {
      try {
        await runSendTick(sendContext(db, sendingEnvFrom(), (m, d) => console.log('[outreach-sending]', m, d ?? '')), { push: false, sync: false })
      } catch (e) {
        console.error('[outreach-sending] propagation failed', e)
      }
    })
    return NextResponse.json({ config })
  } catch (e) {
    return errorResponse(e)
  }
}
