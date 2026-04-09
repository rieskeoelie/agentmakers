import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { Resend } from 'resend'

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@agentmakers.io'
  const adminEmail = process.env.ADMIN_EMAIL || 'richard@leadking.nl'

  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not set', apiKey: null, fromEmail, adminEmail }, { status: 500 })
  }

  const resend = new Resend(apiKey)

  try {
    const result = await resend.emails.send({
      from: `agentmakers.io <${fromEmail}>`,
      to: adminEmail,
      subject: '✅ Test e-mail van agentmakers.io',
      html: '<p>Dit is een testmail om te bevestigen dat e-mail correct is geconfigureerd.</p>',
      text: 'Dit is een testmail om te bevestigen dat e-mail correct is geconfigureerd.',
    })

    return NextResponse.json({
      ok: true,
      apiKey: apiKey.slice(0, 10) + '...',
      fromEmail,
      adminEmail,
      resendResult: result,
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      apiKey: apiKey.slice(0, 10) + '...',
      fromEmail,
      adminEmail,
    }, { status: 500 })
  }
}
