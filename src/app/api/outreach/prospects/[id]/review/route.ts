import { NextRequest, NextResponse } from 'next/server'
import { reviewActionForActor } from '@/lib/outreach/orchestration/adminService'
import { errorResponse, outreachDb, readJson, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'

/** POST /api/outreach/prospects/[id]/review — { action: APPROVE | REJECT | EXCLUDE_COMPANY | EXCLUDE_CONTACT, reason? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  try {
    const result = await reviewActionForActor(outreachDb(), actor, id, await readJson(req))
    if (!result.ok) return NextResponse.json({ error: 'Goedkeuren niet toegestaan', ...result }, { status: 409 })
    return NextResponse.json(result)
  } catch (e) {
    return errorResponse(e)
  }
}
