import { NextRequest, NextResponse } from 'next/server'
import { loadOutreachEnv } from '@/lib/outreach/adapter'
import { settingsForActor } from '@/lib/outreach/orchestration/adminService'
import { errorResponse, sessionActor, unauthorized } from '@/lib/outreach/orchestration/http'
import { workerSettingsFromEnv } from '@/lib/outreach/orchestration/settings'

/** GET /api/outreach/settings — read-only configuration status (booleans only, never secret values). Admin only. */
export async function GET(req: NextRequest) {
  const actor = sessionActor(req)
  if (!actor) return unauthorized()
  try {
    return NextResponse.json(settingsForActor(actor, loadOutreachEnv(), workerSettingsFromEnv(), process.env.CRON_SECRET))
  } catch (e) {
    return errorResponse(e)
  }
}
