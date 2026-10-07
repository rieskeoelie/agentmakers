import { NextRequest, NextResponse, after } from 'next/server'
import { errorResponse, outreachDb, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { isUuid } from '@/lib/outreach/orchestration/service'
import { kickWorker } from '@/lib/outreach/orchestration/trigger'
import { sendRepo } from '@/lib/outreach/sending/repository'
import { queueProspectForActor } from '@/lib/outreach/sending/service'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/outreach/prospects/[id]/send — send state, gate blockers and messages for one prospect. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    return NextResponse.json(await sendRepo.prospectSending(outreachDb(), actor, id))
  } catch (e) {
    return errorResponse(e)
  }
}

/** POST /api/outreach/prospects/[id]/send — queue one READY prospect (gate enforced in the database). Admin only. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  try {
    const res = await queueProspectForActor(outreachDb(), actor, id)
    if (res.ok && res.created) {
      const origin = req.nextUrl.origin
      after(() => kickWorker({ origin, secret: process.env.CRON_SECRET }))
    }
    return NextResponse.json(res, { status: res.ok ? 200 : 409 })
  } catch (e) {
    return errorResponse(e)
  }
}
