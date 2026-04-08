import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getUnsplashImage } from '@/lib/generate'

export const dynamic = 'force-dynamic'

async function fetchRandomHeroImage(query: string): Promise<string> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (accessKey) {
    try {
      const encoded = encodeURIComponent(query)
      // Request 30 photos at once and pick randomly — maximises variety
      const res = await fetch(
        `https://api.unsplash.com/photos/random?query=${encoded}&orientation=landscape&count=30&client_id=${accessKey}`,
        { cache: 'no-store', headers: { 'Accept-Version': 'v1' } }
      )
      if (res.ok) {
        const data = await res.json()
        const photos = Array.isArray(data) ? data : [data]
        if (photos.length > 0) {
          const pick = photos[Math.floor(Math.random() * photos.length)]
          const url = pick?.urls?.regular || pick?.urls?.full
          if (url) return url.split('?')[0] + '?w=1920&q=80&auto=format&fit=crop'
        }
      }
    } catch { /* fall through to fallback */ }
  }
  // No API key or Unsplash error — delegate to shared helper
  return await getUnsplashImage(query)
}

export async function GET(req: NextRequest) {
  if (!getSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const industry = searchParams.get('industry') || ''
  const query = `professional ${industry} business`

  try {
    const url = await fetchRandomHeroImage(query)
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (err) {
    console.error('hero-image error', err)
    return NextResponse.json({ error: 'Ophalen mislukt' }, { status: 500 })
  }
}
