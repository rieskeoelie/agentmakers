import FirecrawlApp from '@mendable/firecrawl-js'

/**
 * Scrapes a website using Firecrawl and returns markdown content.
 * Returns empty string if Firecrawl is not configured or scraping fails.
 */
export async function scrapeWebsite(url: string): Promise<string> {
  if (!process.env.FIRECRAWL_API_KEY || !url) return ''

  try {
    const normalised = url.startsWith('http') ? url : `https://${url}`
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
    const result = await app.scrape(normalised, {
      formats: ['markdown'],
    }) as { success: boolean; markdown?: string }

    if (!result.success || !result.markdown) return ''

    // Trim to ~2 000 chars so the system prompt stays concise
    return result.markdown.substring(0, 2000).trim()
  } catch {
    return ''
  }
}

/**
 * Formats lead data + scraped content into a `business_info` string
 * that is injected into the ElevenLabs agent system prompt.
 */
export function buildBusinessInfo(params: {
  naam: string
  bedrijfsnaam?: string | null
  website?: string | null
  scrapedContent?: string | null
}): string {
  const lines: string[] = []
  if (params.bedrijfsnaam) lines.push(`Bedrijfsnaam: ${params.bedrijfsnaam}`)
  if (params.naam) lines.push(`Contactpersoon: ${params.naam}`)
  if (params.website) lines.push(`Website: ${params.website}`)
  if (params.scrapedContent) {
    lines.push(`\nWebsite inhoud:\n${params.scrapedContent}`)
  }
  return lines.length > 0
    ? lines.join('\n')
    : 'Geen bedrijfsinformatie beschikbaar.'
}
