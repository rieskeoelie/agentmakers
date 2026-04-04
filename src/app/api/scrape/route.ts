import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { scrapeWebsite, buildBusinessInfo } from '@/lib/scrape'

/**
 * POST /api/scrape
 * Internal route called after a lead submits the form.
 * Scrapes the lead's website and stores the result in Supabase.
 *
 * Body: { lead_id: string }
 * Secured with ADMIN_SECRET_KEY header.
 */
export async function POST(req: NextRequest) {
  try {
    // Basic internal auth
    const secret = req.headers.get('x-internal-secret')
    if (secret !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { lead_id } = await req.json()
    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
    }

    // Fetch lead
    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .select('naam, bedrijfsnaam, website')
      .eq('id', lead_id)
      .single()

    if (error || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Scrape website
    const scrapedContent = await scrapeWebsite(lead.website || '')
    const business_info = buildBusinessInfo({
      naam: lead.naam,
      bedrijfsnaam: lead.bedrijfsnaam,
      website: lead.website,
      scrapedContent,
    })

    // Store result
    await supabaseAdmin
      .from('leads')
      .update({ business_info, scraped_at: new Date().toISOString() })
      .eq('id', lead_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Scrape error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
