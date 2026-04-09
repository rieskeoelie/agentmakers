import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getUnsplashImage } from '@/lib/generate'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Fetch the stored hero_image_query for a slug (set at page generation time)
async function getStoredQuery(slug: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('landing_pages')
    .select('body_content_nl')
    .eq('slug', slug)
    .single()
  return (data?.body_content_nl as Record<string, unknown>)?._hero_image_query as string ?? null
}

// Ask Claude for the best English Unsplash search query for any industry name.
// Result is stored in the DB so subsequent calls are instant.
async function deriveAndStoreQuery(slug: string, industry: string): Promise<string> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `Give me a 3-5 word English Unsplash search query for a professional hero photo of a "${industry}" business. Reply with ONLY the search query, nothing else. Example: "modern dental clinic interior"`,
      }],
    })
    const query = msg.content[0].type === 'text'
      ? msg.content[0].text.trim().replace(/^["']|["']$/g, '')
      : `professional ${industry} business`

    // Store in DB so next call is instant
    const { data: page } = await supabaseAdmin
      .from('landing_pages')
      .select('body_content_nl')
      .eq('slug', slug)
      .single()
    if (page) {
      const updated = { ...(page.body_content_nl as Record<string, unknown> || {}), _hero_image_query: query }
      await supabaseAdmin.from('landing_pages').update({ body_content_nl: updated }).eq('slug', slug)
    }
    return query
  } catch {
    return `professional ${industry} business`
  }
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
  'consultancy':        'business consultants meeting office',
  'consultant':         'business consultants meeting office',
  'adviesbureau':       'business consultants meeting office',
  'coaching':           'professional business coaching session',
  'coach':              'professional business coaching session',
  'marketing':          'digital marketing agency office',
  'recruitment':        'professional recruitment interview office',
  'verzekering':        'insurance broker professional office',
  'verzekeraar':        'insurance broker professional office',
  'it-bedrijf':         'modern tech office software development',
  'software':           'software development modern office',
  'logistics':          'logistics warehouse professional',
  'transport':          'transport logistics professional',
}

function translateIndustryForSearch(industry: string): string {
  const lower = industry.toLowerCase()
  for (const [nl, en] of Object.entries(NL_TO_EN_INDUSTRY)) {
    if (lower.includes(nl)) return en
  }
  return industry // already English or unknown — use as-is
}

// englishQuery → sent to Unsplash API (better results in English)
// dutchKey     → used for the static fallback map (keywords are Dutch)
async function fetchRandomHeroImage(englishQuery: string, dutchKey: string): Promise<string> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (accessKey) {
    try {
      const encoded = encodeURIComponent(englishQuery)
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
  // API unavailable — use Dutch keyword for the curated fallback map
  return await getUnsplashImage(dutchKey)
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
  // 3. If no static match, ask Claude Haiku to derive + store the query
  const storedQuery = await getStoredQuery(slug)
  let englishQuery: string
  if (storedQuery) {
    englishQuery = storedQuery
  } else {
    const translated = translateIndustryForSearch(industry)
    if (translated !== industry) {
      // Static map had a match
      englishQuery = `professional ${translated} business`
    } else {
      // Unknown industry — ask Claude and persist for next time
      englishQuery = await deriveAndStoreQuery(slug, industry)
    }
  }
  // Dutch keyword for the static fallback image map (in case Unsplash API is unavailable)
  const dutchKey = industry.toLowerCase()

  try {
    const url = await fetchRandomHeroImage(englishQuery, dutchKey)
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (err) {
    console.error('hero-image error', err)
    return NextResponse.json({ error: 'Ophalen mislukt' }, { status: 500 })
  }
}
