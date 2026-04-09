import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@agentmakers.io'
const FROM = FROM_EMAIL.includes('<') ? FROM_EMAIL : `agentmakers.io <${FROM_EMAIL}>`
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentmakers.io'
const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET not set')
  return s
}

export function createResetToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + RESET_TTL_MS, nonce: randomBytes(8).toString('hex') })
  ).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyResetToken(token: string): { userId: string } | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const payload = token.substring(0, dot)
    const sig = token.substring(dot + 1)
    const expected = createHmac('sha256', getSecret()).update(payload).digest('base64url')
    // timing-safe length check first
    if (sig.length !== expected.length) return null
    if (
      Buffer.from(sig, 'base64url').compare(Buffer.from(expected, 'base64url')) !== 0
    ) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      userId: string
      exp: number
    }
    if (data.exp < Date.now()) return null
    return { userId: data.userId }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'E-mailadres vereist' }, { status: 400 })
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, email')
      .eq('email', email.toLowerCase().trim())
      .single()

    // Always respond ok — don't leak whether email exists
    if (!user) {
      return NextResponse.json({ ok: true })
    }

    const token = createResetToken(user.id)
    const resetUrl = `${SITE_URL}/admin?reset=${token}`

    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: 'Wachtwoord resetten — agentmakers.io',
      html: `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;color:#1E293B">
          <div style="margin-bottom:32px">
            <span style="font-size:1.4rem;font-weight:700;color:#0D9488">agentmakers.io</span>
          </div>
          <h1 style="font-size:1.3rem;font-weight:700;margin:0 0 12px">Wachtwoord resetten</h1>
          <p style="color:#475569;margin:0 0 24px">Hallo ${user.display_name || user.username},<br><br>
          We ontvingen een verzoek om het wachtwoord van uw account te resetten. Klik op de knop hieronder om een nieuw wachtwoord in te stellen.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#0D9488;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:.95rem">
            Nieuw wachtwoord instellen
          </a>
          <p style="color:#94A3B8;font-size:.8rem;margin-top:32px">
            Deze link is <strong>1 uur</strong> geldig.<br>
            Heeft u dit niet aangevraagd? Dan kunt u deze e-mail negeren.
          </p>
        </div>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
