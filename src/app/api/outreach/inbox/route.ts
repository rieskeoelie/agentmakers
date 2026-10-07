import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, outreachDb, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { inboxListForActor } from '@/lib/outreach/sending/service'

/** GET /api/outreach/inbox?status=needs_action|waiting|done|sequences&q=&limit=&offset=&view_as= — conversations (tenant-scoped). */
export async function GET(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    return NextResponse.json(await inboxListForActor(outreachDb(), actor, req.nextUrl.searchParams))
  } catch (e) {
    return errorResponse(e)
  }
}
