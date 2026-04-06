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
