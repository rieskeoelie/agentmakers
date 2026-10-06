import { NextRequest, NextResponse } from 'next/server'
import { searchProspectsForActor } from '@/lib/outreach/orchestration/adminService'
import { errorResponse, outreachDb, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'

/** GET /api/outreach/prospects — paginated, filtered (run_id, fit, status, email, location, q, limit, offset, view_as). */
export async function GET(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    return NextResponse.json(await searchProspectsForActor(outreachDb(), actor, req.nextUrl.searchParams))
  } catch (e) {
    return errorResponse(e)
  }
}
