import { NextRequest, NextResponse } from 'next/server'
import { sendOutreachEmail } from '@/lib/email'

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_SECRET_KEY
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { naam, email, bedrijfsnaam, demo_url, subject, body } = await req.json()

    if (!email || !bedrijfsnaam || !demo_url) {
      return NextResponse.json({ error: 'email, bedrijfsnaam en demo_url zijn verplicht' }, { status: 400 })
    }

    await sendOutreachEmail({ naam: naam || bedrijfsnaam, email, bedrijfsnaam, demo_url, subject, body })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-outreach error:', err)
    return NextResponse.json({ error: 'Verzenden mislukt' }, { status: 500 })
  }
}
