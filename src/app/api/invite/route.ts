import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendConfirmationEmail } from '@/lib/email'
import { scrapeWebsite, fetchPlacesInfo, buildBusinessInfo } from '@/lib/scrape'
import { getSessionFromRequest } from '@/lib/auth'
import { nanoid } from 'nanoid'

export const maxDuration = 60

/** POST /api/invite — invite a single prospect for a personalised voice demo */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { naam, bedrijfsnaam, email, website, language, view_as_user_id } = await req.json()

  if (!naam || !email || !website) {
    return NextResponse.json({ error: 'naam, email en website zijn verplicht' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Ongeldig e-mailadres' }, { status: 400 })
  }

  const lang = language || 'nl'
  const demo_token = nanoid(24)
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentmakers.io'
  const demo_url = `${SITE_URL}/demo/${demo_token}`

  // Insert lead attributed to the inviting user
  const { error: dbError } = await supabaseAdmin
    .from('leads')
    .insert([{
      naam,
      email,
      bedrijfsnaam: bedrijfsnaam || '',
      telefoon: '',
      website,
      diensten: [],
      landing_page_slug: 'invite',
      language: lang,
      demo_token,
      ip_address: '',
      user_agent: 'partner-invite',
      referrer: '',
      // Superadmin in view-as modus: schrijf lead op naam van de bekeken partner
      user_id: (session.isSuperAdmin && view_as_user_id) ? view_as_user_id : session.userId,
    }])

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Scrape first, then send email — so the agent is fully trained when the prospect opens the link.
  // This is intentional: when demoing in real-time at a prospect's table, you need the agent
  // ready immediately. The ~20-30s wait here is worth it.
  const [scrapedContent, placesInfo] = await Promise.all([
    scrapeWebsite(website),
    fetchPlacesInfo(bedrijfsnaam || '', website),
  ])

  const business_info = buildBusinessInfo({ naam, bedrijfsnaam, website, scrapedContent, placesInfo })
  const hasContent = !!scrapedContent || !!(placesInfo?.description || placesInfo?.categories?.length)

  await supabaseAdmin
    .from('leads')
    .update({ business_info, ...(hasContent ? { scraped_at: new Date().toISOString() } : {}) })
    .eq('demo_token', demo_token)

  // Now send the email — agent is ready
  try {
    await sendConfirmationEmail({
      naam,
      email,
      telefoon: '',
      website,
      bedrijfsnaam,
      landing_page_slug: 'invite',
      language: lang,
      demo_token,
    })
  } catch (err) {
    const emailError = err instanceof Error ? err.message : String(err)
    console.error('[invite] sendConfirmationEmail failed:', emailError)
    return NextResponse.json({ error: `Lead aangemaakt maar e-mail mislukt: ${emailError}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, demo_url, demo_token })
}
