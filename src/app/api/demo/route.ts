import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendConfirmationEmail, sendAdminNotification } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { naam, email, telefoon, website, bedrijfsnaam, slug, language } = body

    if (!naam || !email || !telefoon || !slug) {
      return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Ongeldig e-mailadres' }, { status: 400 })
    }

    const lead = { naam, email, telefoon, website, bedrijfsnaam, landing_page_slug: slug, language: language || 'nl' }

    // Store lead in Supabase
    const { error: dbError } = await supabaseAdmin.from('leads').insert([{
      naam, email, telefoon, website, bedrijfsnaam,
      landing_page_slug: slug,
      language: language || 'nl',
      ip_address: req.headers.get('x-forwarded-for') || '',
      user_agent: req.headers.get('user-agent') || '',
      referrer: req.headers.get('referer') || '',
    }])
    if (dbError) console.error('DB error:', dbError)

    // Update conversion count
    try { await supabaseAdmin.rpc('increment_conversions', { page_slug: slug }) } catch { /* ignore */ }

    // Send emails
    await Promise.allSettled([
      sendConfirmationEmail(lead),
      sendAdminNotification(lead),
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Demo API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
