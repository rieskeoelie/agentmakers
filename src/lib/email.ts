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

// Email #2: Notification to admin (enhanced with demo link + quick actions)
export async function sendAdminNotification(lead: LeadData) {
  const subject = `🆕 Nieuwe lead: ${lead.naam}${lead.bedrijfsnaam ? ` — ${lead.bedrijfsnaam}` : ''}`
  const demoUrl = lead.demo_token ? `${SITE_URL}/demo/${lead.demo_token}` : null
  const adminUrl = `${SITE_URL}/admin`

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B;line-height:1.7">
  <h2 style="font-family:'Poppins',sans-serif;color:#0D9488;margin-bottom:4px">🆕 Nieuwe lead!</h2>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:.9rem">
    <tr><td style="padding:6px 0;color:#64748B;width:110px">Naam</td><td style="padding:6px 0;font-weight:600">${lead.naam}</td></tr>
    <tr><td style="padding:6px 0;color:#64748B">E-mail</td><td style="padding:6px 0"><a href="mailto:${lead.email}" style="color:#0D9488">${lead.email}</a></td></tr>
    <tr><td style="padding:6px 0;color:#64748B">Telefoon</td><td style="padding:6px 0"><a href="tel:${lead.telefoon}" style="color:#0D9488">${lead.telefoon}</a></td></tr>
    ${lead.bedrijfsnaam ? `<tr><td style="padding:6px 0;color:#64748B">Bedrijf</td><td style="padding:6px 0">${lead.bedrijfsnaam}</td></tr>` : ''}
    ${lead.website ? `<tr><td style="padding:6px 0;color:#64748B">Website</td><td style="padding:6px 0"><a href="${lead.website}" style="color:#0D9488">${lead.website}</a></td></tr>` : ''}
    <tr><td style="padding:6px 0;color:#64748B">Pagina</td><td style="padding:6px 0">/${lead.landing_page_slug}</td></tr>
    <tr><td style="padding:6px 0;color:#64748B">Tijdstip</td><td style="padding:6px 0">${new Date().toLocaleString('nl-NL')}</td></tr>
  </table>
  <div style="display:flex;gap:12px;margin:24px 0;flex-wrap:wrap">
    ${demoUrl ? `<a href="${demoUrl}" style="background:#0D9488;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:.9rem">🎤 Beluister demo</a>` : ''}
    <a href="${adminUrl}" style="background:#F1F5F9;color:#334155;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:.9rem;border:1px solid #E2E8F0">📊 Open admin</a>
    <a href="tel:${lead.telefoon}" style="background:#F1F5F9;color:#334155;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:.9rem;border:1px solid #E2E8F0">📞 Bel nu</a>
  </div>
</div>`.trim()

  const text = `Nieuwe lead!\n\nNaam:      ${lead.naam}\nE-mail:    ${lead.email}\nTelefoon:  ${lead.telefoon}\nBedrijf:   ${lead.bedrijfsnaam || '—'}\nWebsite:   ${lead.website || '—'}\nPagina:    /${lead.landing_page_slug}\nTijdstip:  ${new Date().toLocaleString('nl-NL')}${demoUrl ? `\n\nDemo: ${demoUrl}` : ''}\n\nAdmin: ${adminUrl}`

  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject,
    html,
    text,
  })
}

// Email #3: Cold outreach to prospect (sent manually from admin)
export async function sendOutreachEmail({
  naam,
  email,
  bedrijfsnaam,
  demo_url,
  subject: customSubject,
  body: customBody,
}: {
  naam: string
  email: string
  bedrijfsnaam: string
  demo_url: string
  subject?: string
  body?: string
}) {
  const voornaam = naam.split(' ')[0]
  const subject = customSubject || `${bedrijfsnaam} — uw persoonlijke AI receptioniste staat klaar`

  // If AI-generated body provided, use it directly
  if (customBody) {
    const bodyHtml = customBody
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
    await resend.emails.send({
      from: FROM, to: email, subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B;line-height:1.7">${bodyHtml}</div>`,
      text: customBody,
    })
    return
  }

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B;line-height:1.7">
  <p>Hallo${voornaam ? ` ${voornaam}` : ''},</p>
  <p>Ik ben Richard van <strong>Agentmakers.io</strong> — wij bouwen AI receptionistes voor Nederlandse bedrijven.</p>
  <p>Ik heb alvast een persoonlijke demo gemaakt voor <strong>${bedrijfsnaam}</strong>. Ze is getraind op jullie website en staat klaar om vragen van klanten te beantwoorden, 24/7.</p>
  <p style="margin:28px 0;">
    <a href="${demo_url}"
       style="background:#0D9488;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
      🎤 Beluister uw persoonlijke AI demo
    </a>
  </p>
  <p>Ze kan nu al uw bedrijf voorstellen, vragen over diensten en prijzen beantwoorden, en direct een afspraak inplannen.</p>
  <p>Geen verplichtingen — het is gewoon leuk om te zien wat er al mogelijk is.</p>
  <p>Met vriendelijke groet,<br><strong>Richard</strong><br>Agentmakers.io</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">
  <p style="font-size:.78rem;color:#94A3B8;">U ontvangt deze mail omdat wij een demo hebben gemaakt voor ${bedrijfsnaam}. Wilt u geen mails meer ontvangen? Laat het ons weten via dit e-mailadres.</p>
</div>`.trim()

  const text = `Hallo${voornaam ? ` ${voornaam}` : ''},

Ik ben Richard van Agentmakers.io — wij bouwen AI receptionistes voor Nederlandse bedrijven.

Ik heb alvast een persoonlijke demo gemaakt voor ${bedrijfsnaam}. Ze is getraind op jullie website en staat klaar om vragen van klanten te beantwoorden, 24/7.

👉 Beluister uw persoonlijke AI demo: ${demo_url}

Ze kan nu al uw bedrijf voorstellen, vragen over diensten en prijzen beantwoorden, en direct een afspraak inplannen.

Geen verplichtingen — het is gewoon leuk om te zien wat er al mogelijk is.

Met vriendelijke groet,
Richard
Agentmakers.io`

  await resend.emails.send({
    from: FROM,
    to: email,
    subject,
    html,
    text,
  })
}

// Email #4: Follow-up (3 days after demo link, no booking yet)
export async function sendFollowUpEmail({
  naam,
  email,
  bedrijfsnaam,
  demo_url,
}: {
  naam: string
  email: string
  bedrijfsnaam: string
  demo_url: string
}) {
  const voornaam = naam.split(' ')[0]
  const subject = `Heeft u de demo al geprobeerd? — ${bedrijfsnaam}`

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B;line-height:1.7">
  <p>Hallo${voornaam ? ` ${voornaam}` : ''},</p>
  <p>Een paar dagen geleden stuurde ik u de persoonlijke AI demo voor <strong>${bedrijfsnaam}</strong>. Heeft u hem al kunnen beluisteren?</p>
  <p>De demo duurt minder dan 2 minuten en geeft een goed beeld van hoe de AI receptioniste uw klanten te woord staat.</p>
  <p style="margin:28px 0;">
    <a href="${demo_url}"
       style="background:#0D9488;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
      🎤 Open mijn persoonlijke demo
    </a>
  </p>
  <p>Heeft u vragen of wilt u direct een gesprek inplannen? Dat kan via de demo-pagina zelf.</p>
  <p>Met vriendelijke groet,<br><strong>Richard</strong><br>Agentmakers.io</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">
  <p style="font-size:.78rem;color:#94A3B8;">Wilt u geen mails meer ontvangen? Laat het ons weten via dit e-mailadres.</p>
</div>`.trim()

  const text = `Hallo${voornaam ? ` ${voornaam}` : ''},

Een paar dagen geleden stuurde ik u de persoonlijke AI demo voor ${bedrijfsnaam}. Heeft u hem al kunnen beluisteren?

De demo duurt minder dan 2 minuten en geeft een goed beeld van hoe de AI receptioniste uw klanten te woord staat.

👉 Open mijn persoonlijke demo: ${demo_url}

Heeft u vragen of wilt u direct een gesprek inplannen? Dat kan via de demo-pagina zelf.

Met vriendelijke groet,
Richard
Agentmakers.io`

  await resend.emails.send({
    from: FROM,
    to: email,
    subject,
    html,
    text,
  })
}

// Email #5: Weekly report to admin
export async function sendWeeklyReport({
  newLeads,
  totalLeads,
  conversations,
  topPage,
}: {
  newLeads: number
  totalLeads: number
  conversations: number
  topPage: string
}) {
  const weekStr = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B;line-height:1.7">
  <h2 style="font-family:'Poppins',sans-serif;color:#0D9488;margin-bottom:4px">📊 Weekoverzicht Agentmakers.io</h2>
  <p style="color:#94A3B8;margin-top:0;font-size:.88rem">Week van ${weekStr}</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0">
    ${[
      ['🆕 Nieuwe leads', newLeads],
      ['📥 Totaal leads', totalLeads],
      ['🎙 Gesprekken', conversations],
      ['🏆 Beste pagina', topPage || '—'],
    ].map(([label, val]) => `
    <div style="background:#F8FAFC;border-radius:10px;padding:16px;border:1px solid #E2E8F0">
      <div style="font-size:.78rem;color:#64748B;margin-bottom:4px">${label}</div>
      <div style="font-size:1.4rem;font-weight:700;color:#0D9488">${val}</div>
    </div>`).join('')}
  </div>
  <p><a href="https://agentmakers.io/admin" style="color:#0D9488;font-weight:700">→ Open admin panel</a></p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">
  <p style="font-size:.75rem;color:#94A3B8">Automatisch rapport van Agentmakers.io</p>
</div>`.trim()

  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: `📊 Weekoverzicht Agentmakers.io — ${weekStr}`,
    html,
    text: `Weekoverzicht Agentmakers.io\n\nNieuwe leads: ${newLeads}\nTotaal leads: ${totalLeads}\nGesprekken: ${conversations}\nBeste pagina: ${topPage || '—'}\n\nOpen admin: https://agentmakers.io/admin`,
  })
}
