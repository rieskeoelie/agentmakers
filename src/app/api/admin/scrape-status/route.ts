import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Returns how many of the given demo_tokens have been scraped already
// GET /api/admin/scrape-status?tokens=tok1,tok2,tok3
export async function GET(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key')
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tokens = req.nextUrl.searchParams.get('tokens')?.split(',').filter(Boolean) ?? []
  if (tokens.length === 0) {
    return NextResponse.json({ scraped: 0, total: 0 })
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('demo_token, scraped_at')
    .in('demo_token', tokens)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const scraped = (data ?? []).filter(r => r.scraped_at !== null).length
  return NextResponse.json({ scraped, total: tokens.length })
}
