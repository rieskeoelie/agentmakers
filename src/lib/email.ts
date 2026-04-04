import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@agentmakers.io'
const FROM = FROM_EMAIL.includes('<') ? FROM_EMAIL : `agentmakers.io <${FROM_EMAIL}>`
const ADMIN = process.env.ADMIN_EMAIL || 'richard@leadking.nl'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentmakers.io'

interface LeadData {
  naam: string
  email: string
  telefoon: string
  website?: string
  bedrijfsnaam?: string
  diensten?: string[]
  landing_page_slug: string
  language: string
  demo_token?: string
}

// Email #1: Confirmation to the lead
export async function sendConfirmationEmail(lead: LeadData) {
  const subjects: Record<string, string> = {
    nl: 'Bedankt voor uw aanvraag — agentmakers.io',
    en: 'Thank you for your request — agentmakers.io',
    es: 'Gracias por su solicitud — agentmakers.io',
  }

  const hasDiensten = lead.diensten && lead.diensten.length > 0
  const dienstenHtml = hasDiensten
    ? lead.diensten!.map(d => `<strong>${d}</strong>`).join(', ')
    : ''
  const dienstenText = hasDiensten ? lead.diensten!.join(', ') : ''

  const demoUrl = lead.demo_token ? `${SITE_URL}/demo/${lead.demo_token}` : null

  const demoButtonHtml = demoUrl
    ? `<p style="margin:32px 0;">
        <a href="${demoUrl}"
           style="background:#0D9488;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
          🎤 Start uw persoonlijke AI demo
        </a>
       </p>`
    : ''

  const demoButtonHtmlEn = demoUrl
    ? `<p style="margin:32px 0;">
        <a href="${demoUrl}"
           style="background:#0D9488;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
          🎤 Start your personal AI demo
        </a>
       </p>`
    : ''

  const demoButtonHtmlEs = demoUrl
    ? `<p style="margin:32px 0;">
        <a href="${demoUrl}"
           style="background:#0D9488;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
          🎤 Iniciar su demo de IA personal
        </a>
       </p>`
    : ''

  const demoTextLine = demoUrl
    ? `\n\nKlik hier voor uw persoonlijke AI demo: ${demoUrl}\n`
    : ''
  const demoTextLineEn = demoUrl
    ? `\n\nClick here for your personal AI demo: ${demoUrl}\n`
    : ''
  const demoTextLineEs = demoUrl
    ? `\n\nHaga clic aquí para su demo de IA personal: ${demoUrl}\n`
    : ''

  const htmlBodies: Record<string, string> = {
    nl: `<p>Beste ${lead.naam},</p>
<p>Wat leuk dat u een demo van een AI agent heeft aangevraagd.</p>
${hasDiensten ? `<p>U heeft een demo aangevraagd voor: ${dienstenHtml}.</p>` : ''}
<p>Klanten die al AI toepassen in hun bedrijf zien een toename van het aantal boekingen, meer omzet, verhoogde klanttevredenheid en minder stress.</p>
${demoButtonHtml}
<p>We nemen snel even contact met u op.</p>
<p>Met vriendelijke groet,<br><br>Het agentmakers.io team.</p>`,

    en: `<p>Dear ${lead.naam},</p>
<p>Great to see you've requested a demo of an AI agent.</p>
${hasDiensten ? `<p>You requested a demo for: ${dienstenHtml}.</p>` : ''}
<p>Customers who already apply AI in their business see an increase in bookings, more revenue, higher customer satisfaction and less stress.</p>
${demoButtonHtmlEn}
<p>We'll be in touch shortly.</p>
<p>Kind regards,<br><br>The agentmakers.io team.</p>`,

    es: `<p>Estimado/a ${lead.naam},</p>
<p>Qué bien que haya solicitado una demo de un agente IA.</p>
${hasDiensten ? `<p>Ha solicitado una demo para: ${dienstenHtml}.</p>` : ''}
<p>Los clientes que ya aplican IA en su empresa ven un aumento de reservas, más ingresos, mayor satisfacción del cliente y menos estrés.</p>
${demoButtonHtmlEs}
<p>Nos pondremos en contacto con usted en breve.</p>
<p>Saludos,<br><br>El equipo de agentmakers.io.</p>`,
  }

  const textBodies: Record<string, string> = {
    nl: `Beste ${lead.naam},\n\nWat leuk dat u een demo van een AI agent heeft aangevraagd.\n\n${hasDiensten ? `U heeft een demo aangevraagd voor: ${dienstenText}.\n\n` : ''}Klanten die al AI toepassen in hun bedrijf zien een toename van het aantal boekingen, meer omzet, verhoogde klanttevredenheid en minder stress.${demoTextLine}\nWe nemen snel even contact met u op.\n\nMet vriendelijke groet,\n\nHet agentmakers.io team.`,
    en: `Dear ${lead.naam},\n\nGreat to see you've requested a demo of an AI agent.\n\n${hasDiensten ? `You requested a demo for: ${dienstenText}.\n\n` : ''}Customers who already apply AI in their business see an increase in bookings, more revenue, higher customer satisfaction and less stress.${demoTextLineEn}\nWe'll be in touch shortly.\n\nKind regards,\n\nThe agentmakers.io team.`,
    es: `Estimado/a ${lead.naam},\n\nQué bien que haya solicitado una demo de un agente IA.\n\n${hasDiensten ? `Ha solicitado una demo para: ${dienstenText}.\n\n` : ''}Los clientes que ya aplican IA en su empresa ven un aumento de reservas, más ingresos, mayor satisfacción del cliente y menos estrés.${demoTextLineEs}\nNos pondremos en contacto con usted en breve.\n\nSaludos,\n\nEl equipo de agentmakers.io.`,
  }

  const lang = lead.language in subjects ? lead.language : 'nl'

  await resend.emails.send({
    from: FROM,
    to: lead.email,
    subject: subjects[lang],
    html: htmlBodies[lang],
    text: textBodies[lang],
  })
}

// Email #2: Notification to admin
export async function sendAdminNotification(lead: LeadData) {
  const subject = `🆕 Nieuwe demo-aanvraag: ${lead.naam} (${lead.landing_page_slug})`
  const body = `
Hoi,

Je hebt een lead ontvangen via agentmakers.io

Naam:       ${lead.naam}
E-mail:     ${lead.email}
Telefoon:   ${lead.telefoon}
Bedrijf:    ${lead.bedrijfsnaam || '—'}
Website:    ${lead.website || '—'}
Diensten:   ${lead.diensten && lead.diensten.length > 0 ? lead.diensten.join(', ') : '—'}
Pagina:     /${lead.landing_page_slug}
Taal:       ${lead.language}
Timestamp:  ${new Date().toLocaleString('nl-NL')}

Bekijk alle leads via https://agentmakers.io/admin/leads
  `.trim()

  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject,
    text: body,
  })
}
