import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'

/**
 * We use the existing `calendly_sent_at` column (TIMESTAMPTZ, unused) as
 * storage for outreach_sent_at — no DDL migration needed.
 *
 * GET  /api/admin/outreach-history?user_id=<id>
 *   Returns { [demo_token]: ISO-date } for leads of user_id where outreach was sent.
 *   Superadmin can request any user_id; partners only their own.
 *
 * POST /api/admin/outreach-history  { demo_token }
 *   Marks the lead as outreach sent.
 */

const OUTREACH_COL = 'calendly_sent_at' // repurposed — calendly not in use

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const requestedUserId = searchParams.get('user_id') ?? session.userId

  if (!session.isSuperAdmin && requestedUserId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select(`demo_token, ${OUTREACH_COL}`)
    .eq('user_id', requestedUserId)
    .not(OUTREACH_COL, 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    const sentAt = (row as Record<string, string>)[OUTREACH_COL]
    if (row.demo_token && sentAt) map[row.demo_token] = sentAt
  }
  return NextResponse.json(map)
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { demo_token } = await req.json()
  if (!demo_token) return NextResponse.json({ error: 'demo_token verplicht' }, { status: 400 })

  const update = { [OUTREACH_COL]: new Date().toISOString() } as Record<string, unknown>

  let query = supabaseAdmin
    .from('leads')
    .update(update)
    .eq('demo_token', demo_token)

  if (!session.isSuperAdmin) {
    query = query.eq('user_id', session.userId)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
