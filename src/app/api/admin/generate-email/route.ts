import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionFromRequest } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  if (!getSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bedrijfsnaam, naam, demo_url, business_info, language } = await req.json()

  if (!bedrijfsnaam || !demo_url) {
    return NextResponse.json({ error: 'bedrijfsnaam en demo_url zijn verplicht' }, { status: 400 })
  }

  const lang = language || 'nl'
  const voornaam = naam ? naam.split(' ')[0] : null

  const langInstructions: Record<string, string> = {
    nl: 'Schrijf de e-mail in het Nederlands. Gebruik "u" (formeel).',
    en: 'Write the email in English. Use a professional but friendly tone.',
    es: 'Escribe el correo en español. Usa un tono profesional pero cercano. Usa "usted".',
  }

  const prompt = `Je bent Richard van Agentmakers.io. Schrijf een korte, persoonlijke cold outreach e-mail aan een prospect voor wie je een AI demo hebt gemaakt.

Bedrijfsnaam: ${bedrijfsnaam}
${voornaam ? `Contactpersoon voornaam: ${voornaam}` : ''}
Demo URL: ${demo_url}
${business_info ? `\nWat we weten over dit bedrijf (gebruik dit om de mail te personaliseren):\n${business_info.substring(0, 1500)}` : ''}

Instructies:
- ${langInstructions[lang] || langInstructions.nl}
- Begin met een persoonlijke opening die iets specifieks noemt uit de bedrijfsinformatie hierboven
- Leg kort uit dat je een demo hebt gemaakt die specifiek getraind is op hun website
- Gebruik de demo URL als centrale call-to-action
- Houd het kort: max 5 alinea's
- Eindig met "Richard" en "Agentmakers.io"
- Geen marketingtaal of buzzwords
- Klink als een echte e-mail van een mens, niet als een template
- Gebruik zuiver Nederlands: geen anglicismen of code-switching (bijv. schrijf "spreekt voor zich" en NIET "spreekt voor itself")

Geef alleen de e-mail terug in dit JSON-formaat (geen markdown, alleen JSON):
{"subject": "...", "body": "..."}

De body mag regeleinden bevatten als \\n.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()

    // Parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Geen JSON in response')
    const { subject, body } = JSON.parse(jsonMatch[0])

    return NextResponse.json({ subject, body })
  } catch (err) {
    console.error('generate-email error:', err)
    return NextResponse.json({ error: 'Genereren mislukt' }, { status: 500 })
  }
}
