import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { scrapeWebsite, buildBusinessInfo } from '@/lib/scrape'
import { nanoid } from 'nanoid'

export interface BulkLead {
  bedrijfsnaam: string
  website: string
  naam?: string
  email?: string
  telefoon?: string
  language?: string
}

export interface BulkResult {
  bedrijfsnaam: string
  website: string
  naam: string
  email: string
  demo_token: string
  demo_url: string
  status: 'ok' | 'error'
  error?: string
}

async function processLead(lead: BulkLead): Promise<BulkResult> {
  const naam = lead.naam || lead.bedrijfsnaam
  const email = lead.email || ''
  const demo_token = nanoid(24)
  const demo_url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://agentmakers.io'}/demo/${demo_token}`

  try {
    const { error: dbError } = await supabaseAdmin
      .from('leads')
      .insert([{
        naam,
        email,
        telefoon: lead.telefoon || '',
        website: lead.website,
        bedrijfsnaam: lead.bedrijfsnaam,
        diensten: [],
        landing_page_slug: 'bulk-outreach',
        language: lead.language || 'nl',
        demo_token,
        ip_address: '',
        user_agent: 'bulk-import',
        referrer: '',
      }])

    if (dbError) {
      return { bedrijfsnaam: lead.bedrijfsnaam, website: lead.website, naam, email, demo_token, demo_url, status: 'error', error: dbError.message }
    }

    // Scrape in background — don't wait, return demo_url immediately
    if (lead.website) {
      scrapeAndUpdate(lead, naam, demo_token).catch(() => {/* ignore */})
    }

    return { bedrijfsnaam: lead.bedrijfsnaam, website: lead.website, naam, email, demo_token, demo_url, status: 'ok' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { bedrijfsnaam: lead.bedrijfsnaam, website: lead.website, naam, email, demo_token, demo_url, status: 'error', error: msg }
  }
}

async function scrapeAndUpdate(lead: BulkLead, naam: string, demo_token: string) {
  const scrapedContent = await scrapeWebsite(lead.website)
  const business_info = buildBusinessInfo({
    naam,
    bedrijfsnaam: lead.bedrijfsnaam,
    website: lead.website,
    scrapedContent,
  })
  await supabaseAdmin
    .from('leads')
    .update({ business_info, scraped_at: new Date().toISOString() })
    .eq('demo_token', demo_token)
}

export async function POST(req: NextRequest) {
  try {
    const { leads }: { leads: BulkLead[] } = await req.json()

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: 'Geen leads aangeleverd' }, { status: 400 })
    }

    if (leads.length > 100) {
      return NextResponse.json({ error: 'Maximaal 100 leads per batch' }, { status: 400 })
    }

    // Validate required fields
    for (const lead of leads) {
      if (!lead.bedrijfsnaam || !lead.website) {
        return NextResponse.json({ error: 'Elk lead heeft bedrijfsnaam en website nodig' }, { status: 400 })
      }
    }

    // Process all leads in parallel (batches of 10 to avoid DB overload)
    const results: BulkResult[] = []
    const batchSize = 10
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize)
      const batchResults = await Promise.all(batch.map(processLead))
      results.push(...batchResults)
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Bulk demo error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
