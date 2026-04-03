import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Translates the current NL content of a landing page to EN and ES,
 * and saves the result directly to the database.
 * Safe to call fire-and-forget (non-blocking).
 */
export async function autoTranslatePage(pageId: string): Promise<void> {
  // Fetch current NL content from DB
  const { data: page, error } = await supabaseAdmin
    .from('landing_pages')
    .select('slug, industry, hero_headline_nl, hero_subline_nl, body_content_nl, title_nl, meta_description_nl')
    .eq('id', pageId)
    .single()

  if (error || !page) {
    console.error('[translate] Page not found:', pageId, error)
    return
  }

  const nlSource = {
    title: page.title_nl,
    meta_description: page.meta_description_nl,
    hero_headline: page.hero_headline_nl,
    hero_subline: page.hero_subline_nl,
    body_content: page.body_content_nl,
  }

  const [en, es] = await Promise.all([
    translateToLang(nlSource, 'English', page.industry),
    translateToLang(nlSource, 'Spanish', page.industry),
  ])

  const { error: updateError } = await supabaseAdmin
    .from('landing_pages')
    .update({
      title_en:              en.title,
      meta_description_en:   en.meta_description,
      hero_headline_en:      en.hero_headline,
      hero_subline_en:       en.hero_subline,
      body_content_en:       en.body_content,
      title_es:              es.title,
      meta_description_es:   es.meta_description,
      hero_headline_es:      es.hero_headline,
      hero_subline_es:       es.hero_subline,
      body_content_es:       es.body_content,
    })
    .eq('id', pageId)

  if (updateError) {
    console.error('[translate] Failed to save translations:', updateError)
  } else {
    console.log(`[translate] ✅ EN+ES updated for page: ${page.slug}`)
  }
}

async function translateToLang(
  nl: { title: string; meta_description: string; hero_headline: string; hero_subline: string; body_content: Record<string, unknown> },
  targetLang: 'English' | 'Spanish',
  industry: string
): Promise<{ title: string; meta_description: string; hero_headline: string; hero_subline: string; body_content: Record<string, unknown> }> {
  const prompt = `Translate the following Dutch landing page content for the "${industry}" industry to ${targetLang}.

Rules:
- Keep the same professional, persuasive marketing tone
- Keep all numbers, percentages and prices as-is (34%, 40%, 85%, 73%, €299 etc.)
- Keep brand names unchanged: "agentmakers.io"
- Keep treatment/service names naturally adapted for ${targetLang}-speaking markets
- Return ONLY valid JSON with the exact same structure as the input

Dutch source:
${JSON.stringify(nl, null, 2)}

Return JSON with keys: title, meta_description, hero_headline, hero_subline, body_content (preserve all nested keys and structure exactly).`

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`[translate] No JSON in Claude response for ${targetLang}`)

  return JSON.parse(match[0])
}
