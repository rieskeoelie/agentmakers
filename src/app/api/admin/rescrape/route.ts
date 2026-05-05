import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { scrapeWebsite, fetchPlacesInfo, buildBusinessInfo } from '@/lib/scrape'

export const maxDuration = 60

/**
 * POST /api/admin/rescrape
 * Body: { demo_token: string }
 * Re-scrapes the website for a lead and updates business_info + scraped_at.
 * Returns the new business_info so the admin can see what the agent will know.
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { demo_token } = await req.json()
  if (!demo_token) return NextResponse.json({ error: 'demo_token required' }, { status: 400 })

  // Fetch the lead
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('id, naam, bedrijfsnaam, website, user_id')
    .eq('demo_token', demo_token)
    .single()

  if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Only allow if this is the owner or a superadmin
  if (!session.isSuperAdmin && lead.user_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!lead.website) {
    return NextResponse.json({ error: 'Lead has no website to scrape' }, { status: 400 })
  }

  // Run scrape + Places in parallel
  const [scrapedContent, placesInfo] = await Promise.all([
    scrapeWebsite(lead.website),
    fetchPlacesInfo(lead.bedrijfsnaam, lead.website),
  ])

  const business_info = buildBusinessInfo({
    naam: lead.naam,
    bedrijfsnaam: lead.bedrijfsnaam,
    website: lead.website,
    scrapedContent,
    placesInfo,
  })

  const hasContent = !!scrapedContent || !!(placesInfo?.description || placesInfo?.categories?.length)

  await supabaseAdmin
    .from('leads')
    .update({
      business_info,
      ...(hasContent ? { scraped_at: new Date().toISOString() } : {}),
    })
    .eq('demo_token', demo_token)

  return NextResponse.json({
    ok: true,
    scraped: hasContent,
    contentLength: scrapedContent?.length ?? 0,
    scrapedPreview: scrapedContent?.substring(0, 200) ?? '',
    business_info,
  })
}
