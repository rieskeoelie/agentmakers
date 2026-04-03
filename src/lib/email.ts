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
  const dienstenStr = lead.diensten && lead.diensten.length > 0
    ? `U heeft een demo aangevraagd voor: ${lead.diensten.join(', ')}.`
    : ''
  const bodies: Record<string, string> = {
    nl: `Beste ${lead.naam},\n\nWat leuk dat u een demo van een AI agent heeft aangevraagd.\n\n${dienstenStr}\n\nKlanten die al AI toepassen in hun bedrijf zien een toename van het aantal boekingen, meer omzet, verhoogde klanttevredenheid en minder stress.\n\nWe nemen snel even contact met u op.\n\nMet vriendelijke groet,\n\nHet agentmakers.io team.`.replace('\n\n\n', '\n\n'),
    en: `Dear ${lead.naam},\n\nGreat to see you've requested a demo of an AI agent.\n\n${lead.diensten && lead.diensten.length > 0 ? `You requested a demo for: ${lead.diensten.join(', ')}.` : ''}\n\nCustomers who already apply AI in their business see an increase in bookings, more revenue, higher customer satisfaction and less stress.\n\nWe'll be in touch shortly.\n\nKind regards,\n\nThe agentmakers.io team.`.replace('\n\n\n', '\n\n'),
    es: `Estimado/a ${lead.naam},\n\nQué bien que haya solicitado una demo de un agente IA.\n\n${lead.diensten && lead.diensten.length > 0 ? `Ha solicitado una demo para: ${lead.diensten.join(', ')}.` : ''}\n\nLos clientes que ya aplican IA en su empresa ven un aumento de reservas, más ingresos, mayor satisfacción del cliente y menos estrés.\n\nNos pondremos en contacto con usted en breve.\n\nSaludos,\n\nEl equipo de agentmakers.io.`.replace('\n\n\n', '\n\n'),
  }

  const lang = lead.language in subjects ? lead.language : 'nl'

  await resend.emails.send({
    from: FROM,
    to: lead.email,
    subject: subjects[lang],
    text: bodies[lang],
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
