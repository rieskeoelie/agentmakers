import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildBusinessInfo } from '@/lib/scrape'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID!

/**
 * GET /api/signed-url?token=xxx
 * Returns a short-lived ElevenLabs signed WebSocket URL for the demo agent,
 * plus the business_info string to inject as a dynamic variable.
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

    // Get signed URL from ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    )

    if (!response.ok) {
      const text = await response.text()
      console.error('ElevenLabs signed URL error:', text)
      return NextResponse.json({ error: 'Failed to get signed URL' }, { status: 500 })
    }

    const { signed_url } = await response.json()

    return NextResponse.json({
      signed_url,
      business_info,
      scraped: !!lead.scraped_at,
    })
  } catch (err) {
    console.error('Signed URL error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
