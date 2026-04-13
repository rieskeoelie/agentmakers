import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'

/**
 * GET  /api/admin/outreach-history?user_id=<id>
 *   Returns { [demo_token]: ISO-date } map for all leads belonging to user_id
 *   that have outreach_sent_at set. Superadmin can request any user_id;
 *   partners can only request their own.
 *
 * POST /api/admin/outreach-history
 *   Body: { demo_token: string }
 *   Marks the matching lead as outreach sent (sets outreach_sent_at = now()).
 *   Requires the lead to belong to the current user (or superadmin can mark any).
 */

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const requestedUserId = searchParams.get('user_id') ?? session.userId

  // Partners may only see their own history
  if (!session.isSuperAdmin && requestedUserId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('demo_token, outreach_sent_at')
    .eq('user_id', requestedUserId)
    .not('outreach_sent_at', 'is', null)

  if (error) {
    // Column might not exist yet — return empty map gracefully
    if (error.message?.includes('column') && error.message?.includes('outreach_sent_at')) {
      return NextResponse.json({})
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.demo_token && row.outreach_sent_at) {
      map[row.demo_token] = row.outreach_sent_at
    }
  }
  return NextResponse.json(map)
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { demo_token } = await req.json()
  if (!demo_token) return NextResponse.json({ error: 'demo_token verplicht' }, { status: 400 })

  // Find the lead — partner can only mark their own leads
  const query = supabaseAdmin
    .from('leads')
    .update({ outreach_sent_at: new Date().toISOString() } as Record<string, unknown>)
    .eq('demo_token', demo_token)

  if (!session.isSuperAdmin) {
    query.eq('user_id', session.userId)
  }

  const { error } = await query

  if (error) {
    if (error.message?.includes('column') && error.message?.includes('outreach_sent_at')) {
      // Column not yet added — acknowledge gracefully, localStorage is still the fallback
      return NextResponse.json({ ok: true, warning: 'outreach_sent_at column not yet in DB' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
