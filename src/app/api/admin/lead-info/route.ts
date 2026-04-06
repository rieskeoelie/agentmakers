import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  // Build query — admins can see any lead, regular users only their own
  let query = supabaseAdmin
    .from('leads')
    .select('business_info, scraped_at')
    .eq('demo_token', token)

  if (!session.isAdmin) {
    query = query.eq('user_id', session.userId)
  }

  const { data } = await query.single()

  return NextResponse.json({ business_info: data?.business_info ?? '', scraped: !!data?.scraped_at })
}
