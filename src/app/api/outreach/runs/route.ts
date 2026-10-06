import { NextRequest, NextResponse, after } from 'next/server'
import { loadOutreachEnv } from '@/lib/outreach/adapter'
import { adminRepo } from '@/lib/outreach/orchestration/adminRepository'
import { createRunWithMode, ownerFilterFor } from '@/lib/outreach/orchestration/adminService'
import { errorResponse, outreachDb, readJson, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { kickWorker } from '@/lib/outreach/orchestration/trigger'

/** GET /api/outreach/runs — runs with funnel counts (own account; superadmin: all, or ?view_as=<userId>). */
export async function GET(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100)
    const owner = ownerFilterFor(actor, req.nextUrl.searchParams.get('view_as'))
    return NextResponse.json({ runs: await adminRepo.listRunsOverview(outreachDb(), actor, owner, Number.isFinite(limit) ? limit : 100) })
  } catch (e) {
    return errorResponse(e)
  }
}

/** POST /api/outreach/runs — create a run ({ campaign, name?, sending_mode?, idempotency_key?, start? }). Admin only. Never sends. */
export async function POST(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    const res = await createRunWithMode(outreachDb(), actor, await readJson(req), loadOutreachEnv())
    if (res.run.status === 'QUEUED') {
      const origin = req.nextUrl.origin
      after(() => kickWorker({ origin, secret: process.env.CRON_SECRET }))
    }
    return NextResponse.json(res, { status: res.created ? 201 : 200 })
  } catch (e) {
    return errorResponse(e)
  }
}
