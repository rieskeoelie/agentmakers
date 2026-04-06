import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { scrapeWebsite, fetchPlacesInfo, buildBusinessInfo } from '@/lib/scrape'

// Allow up to 60s — Firecrawl can be slow; we process 5 leads per call (~10s each = 50s max)
export const maxDuration = 60

// Called by Vercel Cron every 10 minutes — also callable manually from admin
// Auth: Authorization: Bearer {CRON_SECRET}  OR  x-admin-key: {ADMIN_SECRET_KEY}
function isAuthorized(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const adminKey = req.headers.get('x-admin-key')
  return (
    bearer === process.env.CRON_SECRET ||
    adminKey === process.env.ADMIN_SECRET_KEY
  )
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch leads that have a website but no scraped_at yet — max 15 per run
  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('id, naam, bedrijfsnaam, website')
    .is('scraped_at', null)
    .not('website', 'is', null)
    .neq('website', '')
    .neq('website', 'https://')
    .order('created_at', { ascending: true })
    .limit(5) // Keep small: 5 leads × ~10s each ≈ 50s, safely within maxDuration=60

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ message: 'Niets te scrapen', processed: 0 })
  }

  const results = await Promise.allSettled(
    leads.map(async (lead) => {
      try {
        // Website scrape + Places lookup in parallel
        const [scrapedContent, placesInfo] = await Promise.all([
          scrapeWebsite(lead.website),
          fetchPlacesInfo(lead.bedrijfsnaam || '', lead.website),
        ])

        const business_info = buildBusinessInfo({
          naam: lead.naam || '',
          bedrijfsnaam: lead.bedrijfsnaam || '',
          website: lead.website,
          scrapedContent,
          placesInfo,
        })

        const hasContent = !!scrapedContent || !!(placesInfo?.description || placesInfo?.categories?.length)
        if (hasContent) {
          await supabaseAdmin
            .from('leads')
            .update({ business_info, scraped_at: new Date().toISOString() })
            .eq('id', lead.id)
        } else {
          await supabaseAdmin
            .from('leads')
            .update({ business_info })
            .eq('id', lead.id)
        }
        return { id: lead.id, bedrijfsnaam: lead.bedrijfsnaam, status: hasContent ? 'ok' : 'no-content' }
      } catch (err) {
        // Mark as attempted so we don't retry endlessly — set scraped_at to a sentinel
        await supabaseAdmin
          .from('leads')
          .update({ scraped_at: 'failed' })
          .eq('id', lead.id)
        return { id: lead.id, bedrijfsnaam: lead.bedrijfsnaam, status: 'error', error: String(err) }
      }
    })
  )

  const processed = results.filter(r => r.status === 'fulfilled').length
  const details = results.map(r => r.status === 'fulfilled' ? r.value : { status: 'error' })

  return NextResponse.json({ processed, total: leads.length, details })
}
