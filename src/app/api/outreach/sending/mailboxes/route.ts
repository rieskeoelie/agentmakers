import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { sendingEnvFrom, smartleadFor } from '@/lib/outreach/sending/runtime'

/** GET /api/outreach/sending/mailboxes — Smartlead sending mailboxes (superadmin only; addresses + status, no credentials). */
export async function GET(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  if (!actor.isSuperAdmin) return NextResponse.json({ error: 'Alleen superadmin' }, { status: 403 })
  const sl = smartleadFor(sendingEnvFrom())
  if (!sl) return NextResponse.json({ configured: false, mailboxes: [] })
  try {
    return NextResponse.json({ configured: true, mailboxes: await sl.listMailboxes() })
  } catch (e) {
    console.error('[outreach-sending] mailbox list failed', (e as Error)?.message)
    return errorResponse(e)
  }
}
