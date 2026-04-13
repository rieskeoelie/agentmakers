import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

export interface ProspectResult {
  bedrijfsnaam: string
  website: string
  adres: string
  telefoon: string
  rating?: number
  reviews?: number
}

export async function GET(req: NextRequest) {
  if (!getSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')

  if (!query) {
    return NextResponse.json({ error: 'q parameter verplicht' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY niet ingesteld in Vercel env vars' }, { status: 503 })
  }

  try {
    // Google Places Text Search — paginate up to 5 pages (max 100 results)
    const allPlaces: {
      place_id: string; name: string
      formatted_address?: string; rating?: number; user_ratings_total?: number
    }[] = []

    let pageToken: string | undefined
    const MAX_PAGES = 5

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
      url.searchParams.set('query', query)
      url.searchParams.set('region', 'nl')
      url.searchParams.set('language', 'nl')
      url.searchParams.set('key', apiKey)
      if (pageToken) url.searchParams.set('pagetoken', pageToken)

      // Google requires a short delay before a pagetoken becomes valid
      if (page > 0) await new Promise(r => setTimeout(r, 2000))

      const res = await fetch(url.toString())
      const data = await res.json()

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        if (page === 0) return NextResponse.json({ error: `Google API fout: ${data.status}` }, { status: 500 })
        break // partial results are fine
      }

      allPlaces.push(...(data.results ?? []))
      pageToken = data.next_page_token
      if (!pageToken) break
    }

    const places = allPlaces.slice(0, 100)

    // For each place, fetch details to get website + phone
    const detailed = await Promise.allSettled(
      places.map(async (place: {
        place_id: string
        name: string
        formatted_address?: string
        rating?: number
        user_ratings_total?: number
    }) => {
        const detailUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json')
        detailUrl.searchParams.set('place_id', place.place_id)
        detailUrl.searchParams.set('fields', 'name,website,formatted_phone_number,formatted_address,rating,user_ratings_total')
        detailUrl.searchParams.set('language', 'nl')
        detailUrl.searchParams.set('key', apiKey)

        const detailRes = await fetch(detailUrl.toString())
        const detailData = await detailRes.json()
        const r = detailData.result ?? {}

        return {
          bedrijfsnaam: r.name || place.name,
          website: r.website || '',
          adres: r.formatted_address || place.formatted_address || '',
          telefoon: r.formatted_phone_number || '',
          rating: r.rating ?? place.rating,
          reviews: r.user_ratings_total ?? place.user_ratings_total,
        } as ProspectResult
      })
    )

    // Domeinen die geen echte bedrijfswebsite zijn (directories, socials, review-sites)
    const BLOCKED_DOMAINS = [
      'holdetails.org', 'yelp.com', 'facebook.com', 'instagram.com', 'linkedin.com',
      'tripadvisor.com', 'tripadvisor.nl', 'foursquare.com', 'trustpilot.com',
      'google.com', 'goo.gl', 'maps.google', 'plus.google',
      'twitter.com', 'x.com', 'youtube.com', 'pinterest.com',
      'booking.com', 'thuisbezorgd.nl', 'uber.com', 'takeaway.com',
      'zorgkaart.nl', 'dokteronline.com', 'independer.nl',
      'kvk.nl', 'bedrijveninfo.nl', 'bedrijvengids.nl', 'detelefoongids.nl',
      'yellowpages', 'hotfrog', 'cylex', 'n49.', 'opendi.',
    ]

    function isBlockedWebsite(url: string): boolean {
      try {
        const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
        return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d) || hostname.includes(d))
      } catch { return false }
    }

    const results: ProspectResult[] = detailed
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<ProspectResult>).value)
      // Only include prospects with a real website (needed for demo generation)
      .filter(r => r.website && !isBlockedWebsite(r.website))

    return NextResponse.json({ results, total: results.length })
  } catch (err) {
    console.error('Prospects API error:', err)
    return NextResponse.json({ error: 'Zoeken mislukt' }, { status: 500 })
  }
}
