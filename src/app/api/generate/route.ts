import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateLandingPageContent, getUnsplashImage } from '@/lib/generate'

// Protect this route with a secret key
function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-admin-key')
  return key === process.env.ADMIN_SECRET_KEY
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { industry, slug, status = 'draft' } = await req.json()

    if (!industry || !slug) {
      return NextResponse.json({ error: 'industry en slug zijn verplicht' }, { status: 400 })
    }

    // Slug validation: only lowercase letters, numbers, hyphens
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')

    // Check if slug already exists
    const { data: existing } = await supabaseAdmin
      .from('landing_pages')
      .select('id')
      .eq('slug', cleanSlug)
      .single()

    if (existing) {
      return NextResponse.json({ error: `Slug "${cleanSlug}" bestaat al` }, { status: 409 })
    }

    // Generate content with Claude
    const content = await generateLandingPageContent(industry)

    // Fetch industry-specific hero image from Unsplash
    const heroImageUrl = await getUnsplashImage(content.hero_image_query)

    // Insert into Supabase
    const { data, error } = await supabaseAdmin.from('landing_pages').insert([{
      slug: cleanSlug,
      industry,
      status,
      title_nl: content.nl.title,
      meta_description_nl: content.nl.meta_description,
      hero_headline_nl: content.nl.hero_headline,
      hero_subline_nl: content.nl.hero_subline,
      body_content_nl: content.nl,
      title_en: content.en.title,
      meta_description_en: content.en.meta_description,
      hero_headline_en: content.en.hero_headline,
      hero_subline_en: content.en.hero_subline,
      body_content_en: content.en,
      title_es: content.es.title,
      meta_description_es: content.es.meta_description,
      hero_headline_es: content.es.hero_headline,
      hero_subline_es: content.es.hero_subline,
      body_content_es: content.es,
      hero_image_url: heroImageUrl,
    }]).select().single()

    if (error) throw error

    return NextResponse.json({ success: true, page: data })
  } catch (err: unknown) {
    console.error('Generate error:', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
