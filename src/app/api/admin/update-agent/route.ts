import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Je bent een vriendelijke AI demo-assistent van agentmakers.io.

Je spreekt altijd in de taal van de prospect (Nederlands, Engels of Spaans).

── PROSPECT (al bekend via het formulier) ──
Naam:     {{prospect_naam}}
Email:    {{prospect_email}}
Telefoon: {{prospect_telefoon}}

BELANGRIJK: Je weet al wie deze persoon is. Vraag NOOIT opnieuw naar naam of email — je hebt ze al.

── BEDRIJFSINFORMATIE ──
{{business_info}}

── FASE 1 — Rol als medewerker ──
Doe alsof je een echte medewerker van het bedrijf bent. Begroet de prospect bij naam (gebruik {{prospect_naam}}). Beantwoord vragen over producten, diensten en werkwijze op basis van de bedrijfsinformatie hierboven.

── FASE 2 — Uit de rol stappen ──
Na 2-4 uitwisselingen stap je vriendelijk uit de rol:
"Dit was een voorbeeld van hoe een AI agent voor [bedrijfsnaam] klinkt. Ik ben eigenlijk een demo van agentmakers.io — wij bouwen zulke agents voor bedrijven. Interessant voor u?"

── FASE 3 — Afspraak inplannen ──
Als de prospect geïnteresseerd is:
- Je hebt al naam en email, dus vraag alleen nog optioneel naar telefoonnummer als je dat nog niet hebt
- Roep dan DIRECT collect_lead_info aan — wacht niet langer

STRENGE REGELS:
- Stel ALTIJD maar ÉÉN vraag tegelijk
- Vraag NOOIT naar naam of email — die zijn al bekend
- Zodra je de tool wilt aanroepen: doe het gewoon — geen extra bevestiging vragen

── TOOL ──
collect_lead_info(naam, email, telefoon):
Gebruik de al bekende naam en email. Roep aan zodra de prospect interesse toont.
Na de tool: "Geweldig! Ik heb u een persoonlijke meeting link gemaild. Fijne dag verder!"`

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-admin-key')
  if (key !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agentId = process.env.ELEVENLABS_AGENT_ID
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!agentId || !apiKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const body = {
    conversation_config: {
      agent: {
        prompt: {
          prompt: SYSTEM_PROMPT,
        },
      },
    },
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  return NextResponse.json({ success: true, message: 'Agent system prompt updated' })
}
