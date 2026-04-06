import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendConfirmationEmail, sendAdminNotification } from '@/lib/email'
import { scrapeWebsite, buildBusinessInfo } from '@/lib/scrape'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { naam, email, telefoon, website, bedrijfsnaam, diensten, slug, language } = body

    if (!naam || !email || !telefoon || !slug) {
      return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Ongeldig e-mailadres' }, { status: 400 })
    }

    // Generate a unique demo token
    const demo_token = nanoid(24)

    const lead = {
      naam,
      email,
      telefoon,
      website,
      bedrijfsnaam,
      diensten: diensten || [],
      landing_page_slug: slug,
      language: language || 'nl',
    }

    // Store lead in Supabase
    const { data: insertedLead, error: dbError } = await supabaseAdmin
      .from('leads')
      .insert([{
        naam,
        email,
        telefoon,
        website,
        bedrijfsnaam,
        diensten: diensten || [],
        landing_page_slug: slug,
        language: language || 'nl',
        demo_token,
        ip_address: req.headers.get('x-forwarded-for') || '',
        user_agent: req.headers.get('user-agent') || '',
        referrer: req.headers.get('referer') || '',
      }])
      .select('id')
      .single()

    if (dbError) console.error('DB error:', dbError)

    // Update conversion count
    try {
      await supabaseAdmin.rpc('increment_conversions', { page_slug: slug })
    } catch { /* ignore */ }

    // Scrape website first, then send email — so the agent is ready when they arrive
    if (insertedLead?.id && website && website !== 'https://') {
      try {
        const scrapedContent = await scrapeWebsite(website)
        const business_info = buildBusinessInfo({
          naam,
          bedrijfsnaam,
          website,
          scrapedContent,
        })
        await supabaseAdmin
          .from('leads')
          .update({ business_info, scraped_at: new Date().toISOString() })
          .eq('id', insertedLead.id)
      } catch {
        // Scraping failed — email still goes out, demo page shows fallback info
      }
    }

    // Send emails only after scraping is done
    await Promise.allSettled([
      sendConfirmationEmail({ ...lead, demo_token }),
      sendAdminNotification({ ...lead, demo_token }),
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Demo API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
