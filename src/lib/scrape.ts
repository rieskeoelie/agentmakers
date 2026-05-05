import FirecrawlApp from '@mendable/firecrawl-js'

// ─── Google Places enrichment ─────────────────────────────────────────────────

export interface PlacesInfo {
  description?: string   // editorial_summary.overview
  categories?: string[]  // filtered types
  rating?: number
  reviewCount?: number
  openingHours?: string[] // weekday_text array, e.g. ["Maandag: 09:00–17:00", ...]
}

/**
 * Looks up a business on Google Places and returns useful context.
 * Returns null if API key is missing or lookup fails.
 */
export async function fetchPlacesInfo(
  bedrijfsnaam: string,
  website?: string | null,
): Promise<PlacesInfo | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || !bedrijfsnaam) return null

  try {
    // Build a query from company name + optional domain to improve match accuracy
    const domain = website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : ''
    const query = domain ? `${bedrijfsnaam} ${domain}` : bedrijfsnaam

    // Step 1: find place_id
    const findUrl = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json')
    findUrl.searchParams.set('input', query)
    findUrl.searchParams.set('inputtype', 'textquery')
    findUrl.searchParams.set('fields', 'place_id')
    findUrl.searchParams.set('language', 'nl')
    findUrl.searchParams.set('key', apiKey)

    const findRes = await fetch(findUrl.toString())
    const findData = await findRes.json()
    const placeId: string | undefined = findData.candidates?.[0]?.place_id
    if (!placeId) return null

    // Step 2: fetch details
    const detailUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json')
    detailUrl.searchParams.set('place_id', placeId)
    detailUrl.searchParams.set('fields', 'editorial_summary,types,rating,user_ratings_total,opening_hours')
    detailUrl.searchParams.set('language', 'nl')
    detailUrl.searchParams.set('key', apiKey)

    const detailRes = await fetch(detailUrl.toString())
    const detailData = await detailRes.json()
    const r = detailData.result ?? {}

    // Filter out generic/useless Google type tags
    const skipTypes = new Set([
      'point_of_interest', 'establishment', 'premise', 'political',
      'locality', 'sublocality', 'street_address', 'route', 'country',
      'administrative_area_level_1', 'administrative_area_level_2',
    ])
    const categories = (r.types as string[] | undefined)
      ?.filter((t: string) => !skipTypes.has(t))
      .slice(0, 4)

    return {
      description: r.editorial_summary?.overview || undefined,
      categories: categories?.length ? categories : undefined,
      rating: r.rating ?? undefined,
      reviewCount: r.user_ratings_total ?? undefined,
      openingHours: r.opening_hours?.weekday_text ?? undefined,
    }
  } catch {
    return null
  }
}

// ─── Firecrawl website scraping ───────────────────────────────────────────────

/**
 * Scrapes a single URL with Firecrawl. Returns markdown or empty string.
 */
async function scrapeUrl(app: FirecrawlApp, url: string): Promise<string> {
  try {
    const result = await (app.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: 20000,
    }) as Promise<{ success: boolean; markdown?: string }>)
    if (!result?.success || !result.markdown) return ''
    return result.markdown.trim()
  } catch {
    return ''
  }
}

/**
 * Fallback scraper using Jina AI Reader (r.jina.ai).
 * Works on most sites that block Firecrawl — no API key required,
 * optional JINA_API_KEY env var for higher rate limits.
 */
async function scrapeWithJina(url: string): Promise<string> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 22000)
    const headers: Record<string, string> = {
      'Accept': 'text/plain',
      'X-Return-Format': 'markdown',
      'X-Remove-Selector': 'header,nav,footer,.nav,.header,.footer,#nav,#header,#footer,script,style',
    }
    if (process.env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`
    }
    const res = await fetch(`https://r.jina.ai/${url}`, { headers, signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return ''
    const text = await res.text()
    // Jina returns some metadata lines at the top — strip them
    return text.replace(/^Title:.*\n?/m, '').replace(/^URL Source:.*\n?/m, '').replace(/^Published Time:.*\n?/m, '').trim()
  } catch {
    return ''
  }
}

/**
 * Scrapes a single URL: tries Firecrawl first, falls back to Jina AI Reader
 * if Firecrawl returns nothing useful (blocked, JS-heavy, etc.).
 */
async function scrapeUrlWithFallback(
  app: FirecrawlApp | null,
  url: string,
  jinaTimeout = 22000,
): Promise<string> {
  // 1. Try Firecrawl
  if (app) {
    const fc = await Promise.race([
      scrapeUrl(app, url),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000)),
    ]).catch(() => '')
    if ((fc as string).length > 150) return fc as string
  }

  // 2. Firecrawl returned nothing — fall back to Jina AI Reader
  const jina = await Promise.race([
    scrapeWithJina(url),
    new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), jinaTimeout)),
  ]).catch(() => '')
  return jina as string
}

/**
 * Scrapes a website and returns markdown content for the AI agent.
 * Strategy:
 *   1. Firecrawl homepage + common subpages in parallel
 *   2. For any URL where Firecrawl returns nothing, retries with Jina AI Reader
 * This means blocked / JS-heavy sites still get scraped.
 */
export async function scrapeWebsite(url: string): Promise<string> {
  if (!url) return ''

  const normalised = url.startsWith('http') ? url : `https://${url}`
  const base = normalised.replace(/\/+$/, '')
  const app = process.env.FIRECRAWL_API_KEY
    ? new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
    : null

  const subpaths = ['/diensten', '/services', '/aanbod', '/over-ons', '/about', '/over', '/prijzen', '/pricing']
  const urls = [normalised, ...subpaths.map(p => `${base}${p}`)]

  try {
    const results = await Promise.allSettled(
      urls.map(u => scrapeUrlWithFallback(app, u))
    )

    const combined = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && (r.value as string).length > 100)
      .map(r => (r.value as string))
      .join('\n\n---\n\n')

    return combined.substring(0, 6000).trim()
  } catch {
    return ''
  }
}

/**
 * Formats lead data + scraped content + Places data into a `business_info` string
 * that is injected into the ElevenLabs agent system prompt.
 */
export function buildBusinessInfo(params: {
  naam: string
  bedrijfsnaam?: string | null
  website?: string | null
  scrapedContent?: string | null
  placesInfo?: PlacesInfo | null
}): string {
  const lines: string[] = []
  if (params.bedrijfsnaam) lines.push(`Bedrijfsnaam: ${params.bedrijfsnaam}`)
  // Only add Contactpersoon when it's a real person name, not just the company name repeated
  if (params.naam && params.naam !== params.bedrijfsnaam) lines.push(`Contactpersoon: ${params.naam}`)
  if (params.website) lines.push(`Website: ${params.website}`)

  const p = params.placesInfo
  if (p) {
    if (p.description) lines.push(`Beschrijving: ${p.description}`)
    if (p.categories?.length) lines.push(`Categorie: ${p.categories.join(', ')}`)
    if (p.rating !== undefined) {
      const reviewStr = p.reviewCount !== undefined ? ` (${p.reviewCount} reviews)` : ''
      lines.push(`Google-beoordeling: ${p.rating.toFixed(1)} sterren${reviewStr}`)
    }
    if (p.openingHours?.length) {
      lines.push(`\nOpeningstijden:\n${p.openingHours.map(h => `  ${h}`).join('\n')}`)
    }
  }

  if (params.scrapedContent) {
    lines.push(`\nWebsite inhoud:\n${params.scrapedContent}`)
  }

  return lines.length > 0
    ? lines.join('\n')
    : 'Geen bedrijfsinformatie beschikbaar.'
}
