import { NextRequest, NextResponse } from 'next/server'
import { prospectDetailForActor } from '@/lib/outreach/orchestration/adminService'
import { errorResponse, outreachDb, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { isUuid } from '@/lib/outreach/orchestration/service'

/** GET /api/outreach/prospects/[id] — full prospect detail (company, fit, brain, evidence, contact, outreach, trace, timeline). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    return NextResponse.json(await prospectDetailForActor(outreachDb(), actor, id))
  } catch (e) {
    return errorResponse(e)
  }
}
