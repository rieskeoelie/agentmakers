import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/admin/update-business-info
 * Body: { demo_token: string; business_info: string }
 * Manually sets business_info for a lead so the agent has context
 * even when Firecrawl can't scrape the site.
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { demo_token, business_info } = await req.json()
  if (!demo_token) return NextResponse.json({ error: 'demo_token required' }, { status: 400 })
  if (typeof business_info !== 'string') return NextResponse.json({ error: 'business_info required' }, { status: 400 })

  // Fetch lead to verify ownership
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('id, user_id')
    .eq('demo_token', demo_token)
    .single()

  if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  if (!session.isSuperAdmin && lead.user_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await supabaseAdmin
    .from('leads')
    .update({
      business_info: business_info.trim(),
      scraped_at: business_info.trim() ? new Date().toISOString() : null,
    })
    .eq('id', lead.id)

  return NextResponse.json({ ok: true })
}
