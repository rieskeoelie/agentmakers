import { NextRequest, NextResponse } from 'next/server'
import { reviewQueueForActor } from '@/lib/outreach/orchestration/adminService'
import { errorResponse, outreachDb, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'

/** GET /api/outreach/review — NEEDS_REVIEW queue with decision context (limit, offset, view_as). */
export async function GET(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    return NextResponse.json(await reviewQueueForActor(outreachDb(), actor, req.nextUrl.searchParams))
  } catch (e) {
    return errorResponse(e)
  }
}
