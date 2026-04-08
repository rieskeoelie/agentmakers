import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getUnsplashImage } from '@/lib/generate'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Fetch the stored hero_image_query for a slug (set at page generation time)
async function getStoredQuery(slug: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('landing_pages')
    .select('body_content_nl')
    .eq('slug', slug)
    .single()
  return (data?.body_content_nl as Record<string, unknown>)?._hero_image_query as string ?? null
}

// Fallback: translate common Dutch industry names to English for Unsplash
const NL_TO_EN_INDUSTRY: Record<string, string> = {
  'tandartspraktijken': 'dental clinic',
  'tandarts':           'dental clinic',
  'fysiotherapie':      'physiotherapy clinic',
  'fysiotherapeut':     'physiotherapy clinic',
  'klinieken':          'medical clinic',
  'kliniek':            'medical clinic',
  'schoonheidssalons':  'beauty salon',
  'schoonheidssalon':   'beauty salon',
  'kappers':            'hair salon',
  'kapper':             'hair salon',
  'makelaars':          'real estate agent office',
  'makelaar':           'real estate agent office',
  'makelaardij':        'real estate office',
  'loodgieters':        'plumber professional',
  'loodgieter':         'plumber professional',
  'elektriciens':       'electrician professional',
  'elektricien':        'electrician professional',
  'advocaten':          'law office',
  'advocaat':           'law office',
  'accountants':        'accounting office',
  'accountant':         'accounting office',
  'restaurants':        'restaurant interior',
  'restaurant':         'restaurant interior',
  'horeca':             'hospitality restaurant',
  'dierenartsen':       'veterinary clinic',
  'dierenarts':         'veterinary clinic',
  'apotheken':          'pharmacy',
  'apotheek':           'pharmacy',
  'autobedrijven':      'car dealership showroom',
  'autobedrijf':        'car dealership showroom',
  'autogarages':        'car garage mechanic',
  'autogarage':         'car garage mechanic',
  'schilders':          'professional painter',
  'schilder':           'professional painter',
  'schoonmaak':         'professional cleaning',
}

function translateIndustryForSearch(industry: string): string {
  const lower = industry.toLowerCase()
  for (const [nl, en] of Object.entries(NL_TO_EN_INDUSTRY)) {
    if (lower.includes(nl)) return en
  }
  return industry // already English or unknown — use as-is
}

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
  const slug     = searchParams.get('slug') || industry.toLowerCase().replace(/\s+/g, '-')

  // 1. Use the query Claude generated at page-creation time (most accurate)
  // 2. Fall back to static Dutch→English translation map
  const storedQuery = await getStoredQuery(slug)
  const query = storedQuery ?? `professional ${translateIndustryForSearch(industry)} business`

  try {
    const url = await fetchRandomHeroImage(query)
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (err) {
    console.error('hero-image error', err)
    return NextResponse.json({ error: 'Ophalen mislukt' }, { status: 500 })
  }
}
