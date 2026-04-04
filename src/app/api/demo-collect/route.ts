import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { NextRequest } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@agentmakers.io'
const ADMIN = process.env.ADMIN_EMAIL || 'richard@leadking.nl'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentmakers.io'
const CALENDLY_URL = 'https://calendly.com/agentmakersdemo/30min'

export async function POST(req: NextRequest) {
  try {
    const { token, naam, email, telefoon } = await req.json()

    if (!token || !email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Fetch lead to get language
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('language, bedrijfsnaam, naam')
      .eq('demo_token', token)
      .single()

    const lang = (lead?.language as 'nl' | 'en' | 'es') || 'nl'

    // 2. Update lead with collected contact info
    await supabaseAdmin
      .from('leads')
      .update({
        telefoon: telefoon || null,
        calendly_sent_at: new Date().toISOString(),
      })
      .eq('demo_token', token)

    // 3. Build pre-filled Calendly URL
    const calendlyParams = new URLSearchParams()
    if (naam) calendlyParams.set('name', naam)
    calendlyParams.set('email', email)
    if (telefoon) calendlyParams.set('a1', telefoon) // a1 = first custom question (phone)
    const calendlyLink = `${CALENDLY_URL}?${calendlyParams.toString()}`

    // 4. Send Calendly email to lead
    const subjects: Record<string, string> = {
      nl: '📅 Uw persoonlijke meeting link — agentmakers.io',
      en: '📅 Your personal meeting link — agentmakers.io',
      es: '📅 Su enlace personal de reunión — agentmakers.io',
    }

    const htmlBodies: Record<string, string> = {
      nl: `<div style="font-family:'Nunito',sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
  <p>Beste ${naam || lead?.naam},</p>
  <p>Tijdens uw demo heeft u aangegeven interesse te hebben in een eigen AI-agent. Super!</p>
  <p>Via de knop hieronder kunt u direct een afspraak inplannen met ons team. We laten zien hoe uw eigen agent eruit zou zien — en hoe u hem binnen 48 uur live kunt hebben.</p>
  <p style="margin:32px 0;">
    <a href="${calendlyLink}"
       style="background:#0D9488;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
      📅 Plan uw gratis gesprek in
    </a>
  </p>
  <p style="color:#6b7280;font-size:0.85rem;">Of kopieer deze link: <a href="${calendlyLink}" style="color:#0D9488;">${calendlyLink}</a></p>
  <p>Tot snel!<br><br>Het agentmakers.io team</p>
</div>`,

      en: `<div style="font-family:'Nunito',sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
  <p>Hi ${naam || lead?.naam},</p>
  <p>During your demo you expressed interest in your own AI agent. Great!</p>
  <p>Click the button below to schedule a call with our team. We'll show you exactly what your agent would look like — and how to go live within 48 hours.</p>
  <p style="margin:32px 0;">
    <a href="${calendlyLink}"
       style="background:#0D9488;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
      📅 Book your free call
    </a>
  </p>
  <p style="color:#6b7280;font-size:0.85rem;">Or copy this link: <a href="${calendlyLink}" style="color:#0D9488;">${calendlyLink}</a></p>
  <p>Talk soon!<br><br>The agentmakers.io team</p>
</div>`,

      es: `<div style="font-family:'Nunito',sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
  <p>Hola ${naam || lead?.naam},</p>
  <p>Durante su demo expresó interés en tener su propio agente IA. ¡Genial!</p>
  <p>Haga clic en el botón de abajo para agendar una llamada con nuestro equipo. Le mostraremos exactamente cómo sería su agente y cómo puede estar en vivo en 48 horas.</p>
  <p style="margin:32px 0;">
    <a href="${calendlyLink}"
       style="background:#0D9488;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
      📅 Reserve su llamada gratuita
    </a>
  </p>
  <p style="color:#6b7280;font-size:0.85rem;">O copie este enlace: <a href="${calendlyLink}" style="color:#0D9488;">${calendlyLink}</a></p>
  <p>¡Hasta pronto!<br><br>El equipo de agentmakers.io</p>
</div>`,
    }

    await resend.emails.send({
      from: FROM,
      to: email,
      subject: subjects[lang],
      html: htmlBodies[lang],
    })

    // 5. Notify admin
    await resend.emails.send({
      from: FROM,
      to: ADMIN,
      subject: `📞 Demo-gesprek voltooid: ${naam || 'onbekend'} — ${email}`,
      text: `Een prospect heeft de voice demo voltooid en contact info achtergelaten.\n\nNaam: ${naam}\nEmail: ${email}\nTelefoon: ${telefoon || '—'}\nBedrijf: ${lead?.bedrijfsnaam || '—'}\nCalendly: ${calendlyLink}\n\nBekijk leads: ${SITE_URL}/admin/leads`,
    })

    return Response.json({ success: true, calendly_url: calendlyLink })
  } catch (err) {
    console.error('[demo-collect]', err)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
