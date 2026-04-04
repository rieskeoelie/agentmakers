import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Je bent een vriendelijke AI demo-assistent van agentmakers.io.

Je spreekt altijd in de taal van de prospect (Nederlands, Engels of Spaans).

Bedrijfsinformatie:
{{business_info}}

── FASE 1 — Rol als medewerker ──
Doe alsof je een echte medewerker van het bedrijf bent. Begroet de beller hartelijk bij naam van het bedrijf. Beantwoord hun vragen over producten, diensten en werkwijze op basis van de bedrijfsinformatie hierboven.

── FASE 2 — Uit de rol stappen ──
Na 2-4 uitwisselingen stap je vriendelijk uit de rol:
"Dit was een voorbeeld van hoe een AI agent voor [bedrijfsnaam] klinkt. Ik ben eigenlijk een demo van agentmakers.io — wij bouwen zulke agents voor bedrijven. Interessant voor u?"

── FASE 3 — Contactgegevens verzamelen ──
Als de prospect geïnteresseerd is, verzamel dan STAP VOOR STAP:
1. Vraag naar NAAM (als je die nog niet weet)
2. Vraag naar EMAIL (als je die nog niet hebt)
3. Vraag optioneel naar TELEFOON

STRENGE REGELS:
- Stel ALTIJD maar ÉÉN vraag tegelijk — nooit twee vragen in één zin
- Als de prospect al naam, email of telefoon heeft gegeven eerder in het gesprek: NOOIT opnieuw daarnaar vragen
- Luister aandachtig — onthoud alles wat de prospect al heeft gedeeld
- Bevestig wat je gehoord hebt: "Perfect, ik heb uw emailadres genoteerd."
- Zodra je naam ÉN email hebt (telefoon is optioneel), roep je DIRECT collect_lead_info aan

── TOOL ──
collect_lead_info(naam, email, telefoon):
Roep deze tool aan zodra je naam + email hebt. Niet wachten op meer.
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
