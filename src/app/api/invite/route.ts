import { NextRequest, NextResponse, after } from 'next/server'
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

  const { naam, bedrijfsnaam, email, website, language } = await req.json()

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
      user_id: session.userId,
    }])

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Send demo email to prospect immediately — surface errors to client
  let emailError: string | null = null
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
    emailError = err instanceof Error ? err.message : String(err)
    console.error('[invite] sendConfirmationEmail failed:', emailError)
  }

  if (emailError) {
    return NextResponse.json({ error: `Lead aangemaakt maar e-mail mislukt: ${emailError}` }, { status: 500 })
  }

  // Scrape website in background after response is returned
  after(() =>
    Promise.all([
      scrapeWebsite(website),
      fetchPlacesInfo(bedrijfsnaam || '', website),
    ]).then(([scrapedContent, placesInfo]) => {
      const business_info = buildBusinessInfo({ naam, bedrijfsnaam, website, scrapedContent, placesInfo })
      const hasContent = !!scrapedContent || !!(placesInfo?.description || placesInfo?.categories?.length)
      return supabaseAdmin
        .from('leads')
        .update({ business_info, ...(hasContent ? { scraped_at: new Date().toISOString() } : {}) })
        .eq('demo_token', demo_token)
    }).catch(() => {})
  )

  return NextResponse.json({ ok: true, demo_url, demo_token })
}
