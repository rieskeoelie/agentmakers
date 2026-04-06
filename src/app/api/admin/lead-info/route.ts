import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  if (req.headers.get('x-admin-key') !== process.env.ADMIN_SECRET_KEY)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data } = await supabaseAdmin
    .from('leads')
    .select('business_info, scraped_at')
    .eq('demo_token', token)
    .single()

  return NextResponse.json({ business_info: data?.business_info ?? '', scraped: !!data?.scraped_at })
}
