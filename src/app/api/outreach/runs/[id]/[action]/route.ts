import { NextRequest, NextResponse, after } from 'next/server'
import { errorResponse, outreachDb, readJson, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { isUuid, runActionForActor } from '@/lib/outreach/orchestration/service'
import { kickWorker } from '@/lib/outreach/orchestration/trigger'

/** POST /api/outreach/runs/[id]/(start|pause|resume|stop|budget) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id, action } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const run = await runActionForActor(outreachDb(), actor, id, action, await readJson(req))
    if (run.status === 'QUEUED' || run.status === 'RUNNING') {
      const origin = req.nextUrl.origin
      after(() => kickWorker({ origin, secret: process.env.CRON_SECRET }))
    }
    return NextResponse.json({ run })
  } catch (e) {
    return errorResponse(e)
  }
}
