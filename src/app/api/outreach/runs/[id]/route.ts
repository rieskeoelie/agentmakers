import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, outreachDb, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { repo } from '@/lib/outreach/orchestration/repository'
import { isUuid } from '@/lib/outreach/orchestration/service'

/** GET /api/outreach/runs/[id] — run status, progress counts and prospects (?events=1 adds the timeline). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const db = outreachDb()
    const run = await repo.getRun(db, actor, id)
    const prospects = await repo.listProspects(db, actor, id, 500, 0)
    const events = req.nextUrl.searchParams.get('events') === '1' ? await repo.listEvents(db, actor, id, 0, 500) : undefined
    return NextResponse.json({ run, prospects, ...(events ? { events } : {}) })
  } catch (e) {
    return errorResponse(e)
  }
}
