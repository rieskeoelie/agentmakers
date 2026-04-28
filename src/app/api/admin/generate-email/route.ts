import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionFromRequest } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bedrijfsnaam, naam, demo_url, business_info, language } = await req.json()

  if (!bedrijfsnaam || !demo_url) {
    return NextResponse.json({ error: 'bedrijfsnaam en demo_url zijn verplicht' }, { status: 400 })
  }

  const lang = language || 'nl'
  const voornaam = naam ? naam.split(' ')[0] : null
  // Gebruik de voornaam van de ingelogde gebruiker als afzender
  const afzenderVoornaam = session.displayName?.split(' ')[0] || session.username

  const langInstructions: Record<string, string> = {
    nl: 'Schrijf de e-mail VOLLEDIG in het Nederlands. Gebruik "u" (formeel). Geen Engelse woorden.',
    en: 'Write the email ENTIRELY in English. Use a professional but friendly tone. No Dutch words.',
    es: 'Escribe el correo COMPLETAMENTE en español. Usa un tono profesional pero cercano. Usa "usted". Sin palabras en holandés.',
  }

  const instruction = langInstructions[lang] || langInstructions.nl

  const prompt = `You are ${afzenderVoornaam} from Agentmakers.io. Write a short, personal cold outreach email to a prospect for whom you built an AI demo.

Company name: ${bedrijfsnaam}
${voornaam ? `Contact first name: ${voornaam}` : ''}
Demo URL: ${demo_url}
${business_info ? `\nWhat we know about this company (use this to personalise the email):\n${business_info.substring(0, 1500)}` : ''}

CRITICAL LANGUAGE RULE: ${instruction}

Additional instructions:
- Start with a personal opening that mentions something specific from the company info above
- Briefly explain that you built a demo specifically trained on their website
- Use the demo URL as the central call-to-action
- Keep it short: max 5 paragraphs
- End with "${afzenderVoornaam}" and "Agentmakers.io"
- No marketing language or buzzwords
- Sound like a real human email, not a template

Return ONLY the email in this JSON format (no markdown, just JSON):
{"subject": "...", "body": "..."}

The body may contain line breaks as \\n.`

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
