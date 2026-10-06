import { NextRequest, NextResponse, after } from 'next/server'
import { loadOutreachEnv } from '@/lib/outreach/adapter'
import { errorResponse, outreachDb, readJson, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { repo } from '@/lib/outreach/orchestration/repository'
import { createRunForActor } from '@/lib/outreach/orchestration/service'
import { kickWorker } from '@/lib/outreach/orchestration/trigger'

/** GET /api/outreach/runs — runs visible to the caller (own runs; superadmin: all). */
export async function GET(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 50)
    return NextResponse.json({ runs: await repo.listRuns(outreachDb(), actor, Number.isFinite(limit) ? limit : 50) })
  } catch (e) {
    return errorResponse(e)
  }
}

/** POST /api/outreach/runs — create a run ({ campaign, name?, idempotency_key?, start? }). Admin only. */
export async function POST(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    const res = await createRunForActor(outreachDb(), actor, await readJson(req), loadOutreachEnv())
    if (res.run.status === 'QUEUED') {
      const origin = req.nextUrl.origin
      after(() => kickWorker({ origin, secret: process.env.CRON_SECRET }))
    }
    return NextResponse.json(res, { status: res.created ? 201 : 200 })
  } catch (e) {
    return errorResponse(e)
  }
}
