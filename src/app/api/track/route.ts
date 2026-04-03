import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { slug, language } = await req.json()
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

    await supabaseAdmin.from('page_views').insert([{
      landing_page_slug: slug,
      language: language || 'nl',
      referrer: req.headers.get('referer') || '',
    }])

    // Increment visits counter
    await supabaseAdmin
      .from('landing_pages')
      .update({ visits: supabaseAdmin.rpc('increment', { x: 1 }) as unknown as number })
      .eq('slug', slug)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // Silent fail — don't break page for analytics
  }
}
