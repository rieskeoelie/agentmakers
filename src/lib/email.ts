import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@agentmakers.io'
const ADMIN = process.env.ADMIN_EMAIL || 'richard@leadking.nl'

interface LeadData {
  naam: string
  email: string
  telefoon: string
  website?: string
  bedrijfsnaam?: string
  diensten?: string[]
  landing_page_slug: string
  language: string
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

  const htmlBodies: Record<string, string> = {
    nl: `<p>Beste ${lead.naam},</p>
<p>Wat leuk dat u een demo van een AI agent heeft aangevraagd.</p>
${hasDiensten ? `<p>U heeft een demo aangevraagd voor: ${dienstenHtml}.</p>` : ''}
<p>Klanten die al AI toepassen in hun bedrijf zien een toename van het aantal boekingen, meer omzet, verhoogde klanttevredenheid en minder stress.</p>
<p>We nemen snel even contact met u op.</p>
<p>Met vriendelijke groet,<br><br>Het agentmakers.io team.</p>`,
    en: `<p>Dear ${lead.naam},</p>
<p>Great to see you've requested a demo of an AI agent.</p>
${hasDiensten ? `<p>You requested a demo for: ${dienstenHtml}.</p>` : ''}
<p>Customers who already apply AI in their business see an increase in bookings, more revenue, higher customer satisfaction and less stress.</p>
<p>We'll be in touch shortly.</p>
<p>Kind regards,<br><br>The agentmakers.io team.</p>`,
    es: `<p>Estimado/a ${lead.naam},</p>
<p>Qué bien que haya solicitado una demo de un agente IA.</p>
${hasDiensten ? `<p>Ha solicitado una demo para: ${dienstenHtml}.</p>` : ''}
<p>Los clientes que ya aplican IA en su empresa ven un aumento de reservas, más ingresos, mayor satisfacción del cliente y menos estrés.</p>
<p>Nos pondremos en contacto con usted en breve.</p>
<p>Saludos,<br><br>El equipo de agentmakers.io.</p>`,
  }

  const textBodies: Record<string, string> = {
    nl: `Beste ${lead.naam},\n\nWat leuk dat u een demo van een AI agent heeft aangevraagd.\n\n${hasDiensten ? `U heeft een demo aangevraagd voor: ${dienstenText}.\n\n` : ''}Klanten die al AI toepassen in hun bedrijf zien een toename van het aantal boekingen, meer omzet, verhoogde klanttevredenheid en minder stress.\n\nWe nemen snel even contact met u op.\n\nMet vriendelijke groet,\n\nHet agentmakers.io team.`,
    en: `Dear ${lead.naam},\n\nGreat to see you've requested a demo of an AI agent.\n\n${hasDiensten ? `You requested a demo for: ${dienstenText}.\n\n` : ''}Customers who already apply AI in their business see an increase in bookings, more revenue, higher customer satisfaction and less stress.\n\nWe'll be in touch shortly.\n\nKind regards,\n\nThe agentmakers.io team.`,
    es: `Estimado/a ${lead.naam},\n\nQué bien que haya solicitado una demo de un agente IA.\n\n${hasDiensten ? `Ha solicitado una demo para: ${dienstenText}.\n\n` : ''}Los clientes que ya aplican IA en su empresa ven un aumento de reservas, más ingresos, mayor satisfacción del cliente y menos estrés.\n\nNos pondremos en contacto con usted en breve.\n\nSaludos,\n\nEl equipo de agentmakers.io.`,
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
