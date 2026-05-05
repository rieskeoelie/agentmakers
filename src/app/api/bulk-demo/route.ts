import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'
import { nanoid } from 'nanoid'

// Allow up to 60 seconds so after() callbacks have time to finish scraping
export const maxDuration = 60

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

async function processLead(lead: BulkLead, userId: string): Promise<BulkResult> {
  const naam = lead.naam || ""
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
        user_id: userId,
      }])

    if (dbError) {
      return { bedrijfsnaam: lead.bedrijfsnaam, website: lead.website, naam, email, demo_token, demo_url, status: 'error', error: dbError.message }
    }

    // Do NOT scrape immediately on bulk import — that would fire 30+ concurrent scrapes at once.
    // The cron job (/api/cron/scrape-queue) handles this gradually (5 leads per run, every 10 min).
    // Scraping happens in the background; the admin dashboard shows per-lead scrape status.

    return { bedrijfsnaam: lead.bedrijfsnaam, website: lead.website, naam, email, demo_token, demo_url, status: 'ok' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { bedrijfsnaam: lead.bedrijfsnaam, website: lead.website, naam, email, demo_token, demo_url, status: 'error', error: msg }
  }
}


export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { leads, view_as_user_id }: { leads: BulkLead[]; view_as_user_id?: string } = await req.json()
    const effectiveUserId = (session.isSuperAdmin && view_as_user_id) ? view_as_user_id : session.userId

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
      const batchResults = await Promise.all(batch.map(lead => processLead(lead, effectiveUserId)))
      results.push(...batchResults)
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Bulk demo error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
