import { NextRequest, NextResponse, after } from 'next/server'
import { errorResponse, outreachDb, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { isUuid } from '@/lib/outreach/orchestration/service'
import { kickWorker } from '@/lib/outreach/orchestration/trigger'
import { sendRepo } from '@/lib/outreach/sending/repository'
import { queueRunReadyForActor } from '@/lib/outreach/sending/service'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/outreach/runs/[id]/sending — sends of the run + READY prospects that are not queued (with gate blockers). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    return NextResponse.json(await sendRepo.runSending(outreachDb(), actor, id))
  } catch (e) {
    return errorResponse(e)
  }
}

/** POST /api/outreach/runs/[id]/sending — queue every READY prospect that passes the send gate. Admin only. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  try {
    const res = await queueRunReadyForActor(outreachDb(), actor, id)
    if (res.queued > 0) {
      const origin = req.nextUrl.origin
      after(() => kickWorker({ origin, secret: process.env.CRON_SECRET }))
    }
    return NextResponse.json(res)
  } catch (e) {
    return errorResponse(e)
  }
}
