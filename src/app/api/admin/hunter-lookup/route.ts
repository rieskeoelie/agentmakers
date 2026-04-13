import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

export interface HunterContact {
  email: string
  naam: string        // voornaam + achternaam
  confidence: number  // 0-100
  position?: string
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

    if (emails.length === 0) {
      return NextResponse.json({ contact: null })
    }

    // Prioriteer: eigenaar / directeur / CEO / hogere confidence
    const ownerRoles = ['owner', 'ceo', 'founder', 'directeur', 'director', 'eigenaar', 'managing', 'president', 'principal']
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
    }

    return NextResponse.json({ contact, domain })
  } catch (err) {
    console.error('Hunter lookup error:', err)
    return NextResponse.json({ error: 'Lookup mislukt' }, { status: 500 })
  }
}
