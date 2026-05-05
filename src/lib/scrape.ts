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
    return cleanScrapedContent(result.markdown)
  } catch {
    return ''
  }
}

/** Fetches raw markdown from Jina AI Reader — no cleaning applied. */
async function fetchJinaRaw(url: string): Promise<string> {
  const headers: Record<string, string> = {
    'Accept': 'text/plain',
    'X-Return-Format': 'markdown',
    'X-Remove-Selector': 'header,nav,footer,script,style',
    'User-Agent': 'Mozilla/5.0 (compatible; AgentBot/1.0)',
  }
  if (process.env.JINA_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (fetch as any)(`https://r.jina.ai/${url}`, { headers, cache: 'no-store' })
  if (!res.ok) return ''
  return res.text()
}

/**
 * Fallback scraper using Jina AI Reader (r.jina.ai).
 * Works on most sites that block Firecrawl — no API key required.
 */
async function scrapeWithJina(url: string): Promise<string> {
  try {
    const raw = await fetchJinaRaw(url)
    return cleanScrapedContent(raw)
  } catch {
    return ''
  }
}

/**
 * Cleans scraped markdown: removes Jina metadata headers, strips
 * repeated navigation blocks, and collapses excessive whitespace.
 */
function cleanScrapedContent(raw: string): string {
  let text = raw
    // Strip Jina metadata headers
    .replace(/^Title:.*\n?/gm, '')
    .replace(/^URL Source:.*\n?/gm, '')
    .replace(/^Published Time:.*\n?/gm, '')
    .replace(/^Markdown Content:\s*/m, '')
    .replace(/^Warning:.*\n?/gm, '')
    // Strip image tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Strip markdown links but keep link text; also strip empty links []()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, (_, t) => t.trim() || '')
    // Strip bare URLs
    .replace(/https?:\/\/\S+/g, '')
    // Strip common WordPress/CMS footer noise
    .replace(/Toggle Sliding Bar Area/gi, '')
    .replace(/Go to Top/gi, '')
    .replace(/Skip to content/gi, '')
    .replace(/\[?\]\(?\)?/g, '')  // empty link artifacts
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Deduplicate: remove lines that appear 3+ times (repeated nav items)
  const lineCounts = new Map<string, number>()
  for (const line of text.split('\n')) {
    const key = line.trim().toLowerCase()
    if (key.length > 3) lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1)
  }
  text = text
    .split('\n')
    .filter(line => {
      const key = line.trim().toLowerCase()
      return key.length <= 3 || (lineCounts.get(key) ?? 0) < 3
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

/**
 * Scrapes the homepage: runs Jina and Firecrawl in parallel, returns
 * { raw: uncleaned Jina markdown (for link extraction), clean: best cleaned text }.
 * Returns null if no usable content was found.
 */
async function scrapeHomepage(app: FirecrawlApp | null, url: string): Promise<{ raw: string; clean: string } | null> {
  // Try Jina first — it's free and bypasses most bot protection
  const jinaRaw = await fetchJinaRaw(url).catch(() => '')

  const is404 = jinaRaw.includes('returned error 404')
    || jinaRaw.includes('Page Could Not Be Found')
    || jinaRaw.includes('Oops, This Page Could Not Be Found')

  const jinaClean = (!is404 && jinaRaw.length > 100) ? cleanScrapedContent(jinaRaw) : ''

  // Only call Firecrawl (paid) if Jina returned too little content
  let fcClean = ''
  if (jinaClean.length < 300 && app) {
    fcClean = await scrapeUrl(app, url).catch(() => '')
  }

  const clean = jinaClean.length >= fcClean.length ? jinaClean : fcClean
  if (clean.length < 100) return null

  const raw = (!is404 && jinaRaw.length > 100) ? jinaRaw : clean
  return { raw, clean }
}

// Pages to always skip — these are generic/useless for agent context
const LOW_VALUE = ['contact', 'privacy', 'cookie', 'sitemap', 'login', 'logout',
  'zoek', 'search', 'nieuws', 'news', 'blog', 'post', 'artikel', 'article',
  'vacatur', 'job', 'career', 'download', 'foto', 'photo', 'gallery', 'video',
  'winkelwagen', 'cart', 'checkout', 'account', 'register', 'faq', 'terms',
  'disclaimer', 'algemene-voor', 'klachten', 'sitemap', 'tag', 'categor']

/**
 * Scores a page link for scraping priority.
 * Strategy: exclude known-useless pages, then prefer shallower URLs.
 * Shallow = main nav (sector-agnostic) — works for any business type.
 * depth 1 (/diensten)          → score 3
 * depth 2 (/diensten/airco)    → score 2
 * depth 3+ (/diensten/a/b)     → score 1
 */
function scorePath(href: string, _linkText: string): number {
  const lower = href.toLowerCase()
  if (LOW_VALUE.some(k => lower.includes(k))) return -1
  try {
    const depth = new URL(href).pathname.split('/').filter(Boolean).length
    return Math.max(1, 4 - depth)
  } catch {
    return 1
  }
}

/**
 * Extracts and prioritises internal links from scraped markdown.
 * High-value pages (services, pricing, about) are ranked first.
 * Returns up to `max` URLs.
 */
function extractInternalLinks(markdown: string, baseUrl: string, max = 5): string[] {
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  const candidates: { url: string; score: number }[] = []

  const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g
  let match
  while ((match = linkRegex.exec(markdown)) !== null) {
    const [, text, href] = match
    try {
      const u = new URL(href, base.origin)
      if (u.hostname !== base.hostname) continue
      const path = u.pathname.replace(/\/$/, '') || '/'
      if (path === '/' || seen.has(path)) continue
      seen.add(path)
      const score = scorePath(path, text)
      if (score >= 0) candidates.push({ url: u.href, score })
    } catch { /* ignore */ }
  }

  // Sort highest score first, then take top `max`
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(c => c.url)
}

/**
 * Scrapes a website and returns markdown content for the AI agent.
 * Strategy:
 *   1. Scrape homepage — Jina (raw, links intact) + Firecrawl in parallel
 *   2. Extract real subpage links from raw Jina content
 *   3. Scrape those subpages with Jina (proven, no bot-blocking issues)
 * Works even on sites that block Firecrawl.
 */
export async function scrapeWebsite(url: string): Promise<string> {
  if (!url) return ''

  const normalised = url.startsWith('http') ? url : `https://${url}`
  const app = process.env.FIRECRAWL_API_KEY
    ? new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
    : null

  try {
    // Step 1: scrape homepage — returns { raw (links intact), clean }
    const homepage = await scrapeHomepage(app, normalised)
    if (!homepage) return ''

    // Step 2: extract real internal links from raw Jina content (links not yet stripped)
    const subpageUrls = extractInternalLinks(homepage.raw, normalised, 6)

    // Step 3: scrape real subpages with Jina (simple, proven pattern)
    const subResults = subpageUrls.length > 0
      ? await Promise.allSettled(subpageUrls.map(u => scrapeWithJina(u)))
      : []

    const subContent = subResults
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value.length > 100)
      .map(r => r.value)
      .join('\n\n---\n\n')

    const combined = [homepage.clean, subContent].filter(Boolean).join('\n\n---\n\n')
    return combined.substring(0, 12000).trim()
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
