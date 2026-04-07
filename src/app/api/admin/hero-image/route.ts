import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function fetchNewHeroImage(query: string): Promise<string> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (accessKey) {
    try {
      const encoded = encodeURIComponent(query)
      const res = await fetch(
        `https://api.unsplash.com/photos/random?query=${encoded}&orientation=landscape&client_id=${accessKey}`,
        { cache: 'no-store', headers: { 'Accept-Version': 'v1' } }
      )
      if (res.ok) {
        const data = await res.json()
        const url = data?.urls?.regular || data?.urls?.full
        if (url) return url.split('?')[0] + '?w=1920&q=80&auto=format&fit=crop'
      }
    } catch { /* fall through */ }
  }
  // Fallback: return empty so UI keeps current image
  return ''
}

export async function GET(req: NextRequest) {
  if (!getSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const industry = searchParams.get('industry') || ''
  const query = `professional ${industry} office interior`

  try {
    const url = await fetchNewHeroImage(query)
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('hero-image error', err)
    return NextResponse.json({ error: 'Ophalen mislukt' }, { status: 500 })
  }
}
