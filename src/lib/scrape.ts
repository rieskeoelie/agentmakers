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
 * Scrapes a website using Firecrawl and returns markdown content.
 * Returns empty string if Firecrawl is not configured or scraping fails.
 */
export async function scrapeWebsite(url: string): Promise<string> {
  if (!process.env.FIRECRAWL_API_KEY || !url) return ''

  try {
    const normalised = url.startsWith('http') ? url : `https://${url}`
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })

    // Race the Firecrawl call against a 30s timeout so we never hang indefinitely
    const scrapePromise = app.scrape(normalised, {
      formats: ['markdown'],
      timeout: 25000, // 25s request timeout to Firecrawl
    }) as Promise<{ success: boolean; markdown?: string }>

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Firecrawl timeout')), 30000)
    )

    const result = await Promise.race([scrapePromise, timeoutPromise]) as { success: boolean; markdown?: string } | null
    if (!result || !result.success || !result.markdown) return ''

    // Trim to ~2 000 chars so the system prompt stays concise
    return result.markdown.substring(0, 2000).trim()
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
