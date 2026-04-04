import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildBusinessInfo } from '@/lib/scrape'
import { buildAgentPrompt } from '@/lib/agentPrompt'

const ELEVENLABS_AGENT_ID_NL = process.env.ELEVENLABS_AGENT_ID_NL || process.env.ELEVENLABS_AGENT_ID!
const ELEVENLABS_AGENT_ID_EN = process.env.ELEVENLABS_AGENT_ID_EN || process.env.ELEVENLABS_AGENT_ID!
const ELEVENLABS_AGENT_ID_ES = process.env.ELEVENLABS_AGENT_ID_ES || process.env.ELEVENLABS_AGENT_ID!

function getAgentId(lang: string): string {
  if (lang === 'en') return ELEVENLABS_AGENT_ID_EN
  if (lang === 'es') return ELEVENLABS_AGENT_ID_ES
  return ELEVENLABS_AGENT_ID_NL
}

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
      .select('naam, email, telefoon, bedrijfsnaam, website, business_info, scraped_at, language')
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

    const prospect_naam = lead.naam || ''
    const prospect_email = lead.email || ''
    const prospect_telefoon = lead.telefoon || ''

    const lang = (lead.language as string) || 'nl'

    const system_prompt = buildAgentPrompt({
      prospect_naam,
      prospect_email,
      prospect_telefoon,
      business_info,
      lang,
    })

    return NextResponse.json({
      agent_id: getAgentId(lang),
      language: lang,
      business_info,
      system_prompt,
      scraped: !!lead.scraped_at,
      prospect_naam,
      prospect_email,
      prospect_telefoon,
      bedrijfsnaam: lead.bedrijfsnaam || '',
    })
  } catch (err) {
    console.error('Signed URL error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
