import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

export interface HunterContact {
  email: string
  naam: string        // voornaam + achternaam
  confidence: number  // 0-100
  position?: string
  source?: 'hunter' | 'website'
}

// Generieke e-mailadressen die we niet willen (contactpagina-adressen, geen eigenaar)
const GENERIC_PREFIXES = ['info', 'contact', 'hello', 'hallo', 'mail', 'post', 'office',
  'admin', 'support', 'help', 'noreply', 'no-reply', 'webmaster', 'receptie', 'praktijk']

function isGeneric(email: string): boolean {
  const prefix = email.split('@')[0].toLowerCase()
  return GENERIC_PREFIXES.some(g => prefix === g || prefix.startsWith(g + '.'))
}

/** Scrape de website op mailto:-links als Hunter niks heeft */
async function scrapeEmailFromWebsite(baseUrl: string): Promise<HunterContact | null> {
  // Probeer homepage + /contact + /over-ons + /team
  const normalised = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
  const origin = new URL(normalised).origin
  const pagesToTry = [origin, `${origin}/contact`, `${origin}/over-ons`, `${origin}/team`]

  const emailRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi
  const namePatterns = [
    // "Tandarts Jan de Vries" / "Dr. Jan de Vries"
    /(?:tandarts|huisarts|arts|drs?\.?|dr\.?|mr\.?)\s+([A-Z][a-z]+(?:\s+(?:van|de|den|der|ten|ter|van\s+de[nr]?)\s+)?[A-Z][a-z]+)/g,
    // h1/h2 met één of twee woorden (waarschijnlijk naam eigenaar op kleine sites)
    /<h[12][^>]*>([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})<\/h[12]>/g,
  ]

  const found: { email: string; naam: string }[] = []

  for (const pageUrl of pagesToTry) {
    try {
      const res = await fetch(pageUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Agentmakers/1.0)' },
      })
      if (!res.ok) continue
      const html = await res.text()

      // Extraheer alle mailto-links
      let match: RegExpExecArray | null
      const emailRegexLocal = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi
      while ((match = emailRegexLocal.exec(html)) !== null) {
        const email = match[1].toLowerCase()
        if (!found.some(f => f.email === email)) {
          // Probeer een naam te vinden in de buurt van dit e-mailadres (±500 chars)
          let naam = ''
          const ctx = html.slice(Math.max(0, match.index - 500), match.index + 200)
          for (const pattern of namePatterns) {
            pattern.lastIndex = 0
            const nameMatch = pattern.exec(ctx)
            if (nameMatch) { naam = nameMatch[1].trim(); break }
          }
          found.push({ email, naam })
        }
      }

      if (found.length > 0) break // Stop na eerste pagina met resultaten
    } catch {
      // pagina onbereikbaar, ga door met volgende
    }
  }

  if (found.length === 0) return null

  // Prioriteer: persoonlijk e-mailadres boven generiek
  const personal = found.filter(f => !isGeneric(f.email))
  const best = personal[0] ?? found[0]

  return {
    email: best.email,
    naam: best.naam,
    confidence: personal.length > 0 ? 60 : 30,
    source: 'website',
  }
}

export async function GET(req: NextRequest) {
  if (!getSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const website = searchParams.get('website')
  if (!website) {
    return NextResponse.json({ error: 'website parameter verplicht' }, { status: 400 })
  }

  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'HUNTER_API_KEY niet ingesteld' }, { status: 503 })
  }

  // Strip protocol + trailing slash, extract domain
  const domain = website
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase()

  try {
    const url = new URL('https://api.hunter.io/v2/domain-search')
    url.searchParams.set('domain', domain)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('limit', '10')

    const res = await fetch(url.toString())
    const data = await res.json()

    if (!res.ok || data.errors) {
      const msg = data.errors?.[0]?.details ?? data.errors?.[0]?.id ?? 'Hunter API fout'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const emails: Array<{
      value: string
      first_name?: string
      last_name?: string
      position?: string
      confidence?: number
      type?: string
    }> = data.data?.emails ?? []

    if (emails.length > 0) {
      // Prioriteer: eigenaar / directeur / CEO / hogere confidence
      const ownerRoles = ['owner', 'ceo', 'founder', 'directeur', 'director', 'eigenaar', 'managing', 'president', 'principal', 'tandarts', 'eigenaar']
      const sorted = [...emails].sort((a, b) => {
        const aIsOwner = ownerRoles.some(r => (a.position ?? '').toLowerCase().includes(r)) ? 1 : 0
        const bIsOwner = ownerRoles.some(r => (b.position ?? '').toLowerCase().includes(r)) ? 1 : 0
        if (bIsOwner !== aIsOwner) return bIsOwner - aIsOwner
        return (b.confidence ?? 0) - (a.confidence ?? 0)
      })

      const best = sorted[0]
      const naam = [best.first_name, best.last_name].filter(Boolean).join(' ')

      const contact: HunterContact = {
        email: best.value,
        naam,
        confidence: best.confidence ?? 0,
        position: best.position ?? undefined,
        source: 'hunter',
      }

      return NextResponse.json({ contact, domain })
    }

    // Hunter heeft niks — scrape de website zelf op mailto:-links
    const scraped = await scrapeEmailFromWebsite(website)
    return NextResponse.json({ contact: scraped, domain })

  } catch (err) {
    console.error('Hunter lookup error:', err)
    return NextResponse.json({ error: 'Lookup mislukt' }, { status: 500 })
  }
}
