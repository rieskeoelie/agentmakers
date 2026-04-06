import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendFollowUpEmail } from '@/lib/email'

// Runs daily at 09:00 via Vercel Cron
// Finds leads created 3 days ago (±12h window) that have an email
// and haven't received a follow-up yet, then sends follow-up email.
// Tracks sent follow-ups via user_agent field suffix "|fu" to avoid
// schema changes.

function isAuthorized(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const adminKey = req.headers.get('x-admin-key')
  return (
    bearer === process.env.CRON_SECRET ||
    adminKey === process.env.ADMIN_SECRET_KEY
  )
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentmakers.io'

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const from = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
  const to   = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) // 3 days ago

  // Fetch leads created 3-4 days ago, with email, not yet followed up
  // We mark follow-up sent by appending "|fu" to the referrer field
  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('id, naam, email, bedrijfsnaam, demo_token, referrer')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .not('email', 'is', null)
    .neq('email', '')
    .not('demo_token', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ message: 'Geen leads voor follow-up', sent: 0 })
  }

  // Filter out leads already followed up (referrer ends with |fu)
  const eligible = leads.filter(l => !String(l.referrer || '').endsWith('|fu'))

  if (eligible.length === 0) {
    return NextResponse.json({ message: 'Alle leads al opgevolgd', sent: 0 })
  }

  const results = await Promise.allSettled(
    eligible.map(async (lead) => {
      const demo_url = `${SITE_URL}/demo/${lead.demo_token}`
      await sendFollowUpEmail({
        naam: lead.naam || lead.bedrijfsnaam || '',
        email: lead.email,
        bedrijfsnaam: lead.bedrijfsnaam || '',
        demo_url,
      })
      // Mark as followed up
      await supabaseAdmin
        .from('leads')
        .update({ referrer: (lead.referrer ? lead.referrer + '|fu' : '|fu') })
        .eq('id', lead.id)
      return lead.bedrijfsnaam
    })
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({ sent, failed, total: eligible.length })
}
