import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildBusinessInfo } from '@/lib/scrape'

const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID!

/**
 * GET /api/signed-url?token=xxx
 * Returns the ElevenLabs agent ID + business_info for the demo.
 * The agent is Public so no signed URL is needed.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    // Look up the lead by token
    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .select('naam, bedrijfsnaam, website, business_info, scraped_at')
      .eq('demo_token', token)
      .single()

    if (error || !lead) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    // Build business_info: use scraped version if available, otherwise basic fallback
    const business_info =
      lead.business_info ||
      buildBusinessInfo({
        naam: lead.naam,
        bedrijfsnaam: lead.bedrijfsnaam,
        website: lead.website,
        scrapedContent: null,
      })

    return NextResponse.json({
      agent_id: ELEVENLABS_AGENT_ID,
      business_info,
      scraped: !!lead.scraped_at,
    })
  } catch (err) {
    console.error('Signed URL error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
