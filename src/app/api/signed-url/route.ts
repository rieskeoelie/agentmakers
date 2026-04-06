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

async function getSignedUrl(agentId: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY!
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: { 'xi-api-key': apiKey } }
  )
  if (!res.ok) throw new Error(`ElevenLabs signed URL error: ${res.status}`)
  const data = await res.json()
  return data.signed_url as string
}

/**
 * GET /api/signed-url?token=xxx
 * Returns a signed ElevenLabs WebSocket URL + business_info for the demo.
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
    const agentId = getAgentId(lang)

    const system_prompt = buildAgentPrompt({
      prospect_naam,
      prospect_email,
      prospect_telefoon,
      business_info,
      bedrijfsnaam: lead.bedrijfsnaam || '',
      lang,
    })

    // Generate a signed WebSocket URL so the client can connect securely
    const signed_url = await getSignedUrl(agentId)

    return NextResponse.json({
      signed_url,
      agent_id: agentId,
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
