import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface GeneratedContent {
  nl: LangContent
  en: LangContent
  es: LangContent
  hero_image_query: string
}

export interface LangContent {
  title: string
  meta_description: string
  hero_headline: string
  hero_subline: string
  problem_headline: string
  problem_body: string
  closed_hours: number
  closed_percent: number
  timeline: { time: string; scenario: string }[]
  features: { icon: string; title: string; body: string }[]
  usecases: { title: string; body: string }[]
  revenue_calls: number
  revenue_per_call: number
  cta_headline: string
}

export async function generateLandingPageContent(industry: string): Promise<GeneratedContent> {
  const prompt = `You are an expert marketing copywriter for AI business automation.

Generate landing page content for the industry: "${industry}"

The product is "agentmakers.io" — an AI receptionist/agent that works 24/7, answers phone calls, books appointments, and handles customer inquiries automatically. It replaces or supplements a human receptionist.

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "nl": {
    "title": "SEO page title in Dutch (max 60 chars)",
    "meta_description": "Meta description in Dutch (max 155 chars)",
    "hero_headline": "Powerful hero headline in Dutch showing the problem (mention hours closed)",
    "hero_subline": "Supporting subtitle in Dutch (1-2 sentences)",
    "problem_headline": "Section headline about the problem in Dutch",
    "problem_body": "2-3 sentences explaining how clients call when the business is closed in Dutch",
    "closed_hours": 6420,
    "closed_percent": 73,
    "timeline": [
      {"time": "18:30", "scenario": "Industry-specific missed call scenario in Dutch"},
      {"time": "Zaterdag 10:00", "scenario": "Weekend scenario in Dutch"},
      {"time": "Elke gemiste oproep", "scenario": "Cost of missed calls in Dutch"}
    ],
    "features": [
      {"icon": "clock", "title": "Feature title", "body": "Feature description"},
      {"icon": "calendar", "title": "Feature title", "body": "Feature description"},
      {"icon": "chat", "title": "Feature title", "body": "Feature description"},
      {"icon": "clipboard", "title": "Feature title", "body": "Feature description"},
      {"icon": "globe", "title": "Feature title", "body": "Feature description"},
      {"icon": "shield", "title": "Feature title", "body": "Feature description"}
    ],
    "usecases": [
      {"title": "Use case title", "body": "Use case description"},
      {"title": "Use case title", "body": "Use case description"},
      {"title": "Use case title", "body": "Use case description"},
      {"title": "Use case title", "body": "Use case description"},
      {"title": "Use case title", "body": "Use case description"},
      {"title": "Use case title", "body": "Use case description"}
    ],
    "revenue_calls": 5,
    "revenue_per_call": 500,
    "cta_headline": "Strong closing CTA headline in Dutch"
  },
  "en": { ... same structure but in English ... },
  "es": { ... same structure but in Spanish ... },
  "hero_image_query": "Unsplash search query for a professional ${industry} photo (in English, 3-5 words)"
}

Make all content highly specific and relevant to the "${industry}" industry. Use realistic numbers for revenue_calls and revenue_per_call based on the industry's typical appointment/transaction value. Features and usecases should be tailored to this specific industry's workflows.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in Claude response')

  return JSON.parse(jsonMatch[0]) as GeneratedContent
}

// Fetch a relevant Unsplash image URL
export async function getUnsplashImage(query: string): Promise<string> {
  // Use Unsplash source (no API key needed for basic usage)
  const encoded = encodeURIComponent(query)
  return `https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1920&q=80&auto=format&fit=crop`
  // Note: For production, use the Unsplash API with a key for relevant images
  // Fallback for now — replace with: https://api.unsplash.com/photos/random?query=${encoded}&client_id=YOUR_KEY
}
