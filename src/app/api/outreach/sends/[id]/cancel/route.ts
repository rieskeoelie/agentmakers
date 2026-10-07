import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, outreachDb, readJson, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { cancelSendForActor } from '@/lib/outreach/sending/service'

/** POST /api/outreach/sends/[id]/cancel — cancel a QUEUED (not yet pushed) send. Admin only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  const { id } = await params
  try {
    return NextResponse.json({ send: await cancelSendForActor(outreachDb(), actor, id, await readJson(req)) })
  } catch (e) {
    return errorResponse(e)
  }
}
