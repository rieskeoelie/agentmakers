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
  const bodies: Record<string, string> = {
    nl: `Beste ${lead.naam},\n\nBedankt voor uw interesse in agentmakers.io!\n\nWij hebben uw aanvraag ontvangen en nemen binnen 24 uur contact met u op voor een persoonlijke demo.\n\nMet vriendelijke groet,\nHet agentmakers.io team`,
    en: `Dear ${lead.naam},\n\nThank you for your interest in agentmakers.io!\n\nWe have received your request and will contact you within 24 hours for a personal demo.\n\nKind regards,\nThe agentmakers.io team`,
    es: `Estimado/a ${lead.naam},\n\n¡Gracias por su interés en agentmakers.io!\n\nHemos recibido su solicitud y nos pondremos en contacto con usted en 24 horas para una demo personalizada.\n\nSaludos,\nEl equipo de agentmakers.io`,
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
Nieuwe demo-aanvraag ontvangen via agentmakers.io

━━━━━━━━━━━━━━━━━━━━━━━━
Naam:         ${lead.naam}
E-mail:       ${lead.email}
Telefoon:     ${lead.telefoon}
Bedrijf:      ${lead.bedrijfsnaam || '—'}
Website:      ${lead.website || '—'}
Pagina:       /${lead.landing_page_slug}
Taal:         ${lead.language}
Tijdstip:     ${new Date().toLocaleString('nl-NL')}
━━━━━━━━━━━━━━━━━━━━━━━━

Bekijk alle leads: https://agentmakers.io/admin/leads
  `.trim()

  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject,
    text: body,
  })
}
