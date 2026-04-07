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
  hero_badge: string
  problem_headline: string
  problem_body: string
  closed_hours: number
  closed_percent: number
  timeline: { time: string; scenario: string }[]
  features: { icon: string; title: string; body: string }[]
  solution_headline: string
  solution_subline: string
  usecases_label: string
  usecases_headline: string
  usecases_subline: string
  usecases: { title: string; body: string }[]
  agents_label: string
  agents_headline: string
  agents_subline: string
  agents: {
    title: string
    body: string
    tag: string
    channel: 'phone-in' | 'phone-out' | 'whatsapp' | 'facebook' | 'instagram' | 'email'
  }[]
  integrations: string[]
  steps_title: string
  steps_sub: string
  steps: { title: string; body: string }[]
  stats_label: string
  stats_title: string
  stats: { value: string; label: string }[]
  revenue_calls: number
  revenue_per_call: number
  calc_calls_label: string
  calc_value_label: string
  cta_headline: string
}

// Recursively replace em-dashes (—) with a regular comma+space in all string values
function removeEmDashes<T>(obj: T): T {
  if (typeof obj === 'string') return obj.replace(/—/g, ',') as unknown as T
  if (Array.isArray(obj)) return obj.map(removeEmDashes) as unknown as T
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, removeEmDashes(v)])
    ) as unknown as T
  }
  return obj
}

export async function generateLandingPageContent(industry: string): Promise<GeneratedContent> {
  const prompt = `You are an expert marketing copywriter for AI business automation.

Generate landing page content for the industry: "${industry}"

The product is "agentmakers.io" — an AI receptionist/agent that works 24/7, answers phone calls, books appointments, and handles customer inquiries automatically. It replaces or supplements a human receptionist.

CRITICAL: All content must use industry-specific terminology. For example:
- Clinics/medical: "consult", "behandeling", "patiënt", "intake", "nazorg"
- Real estate: "bezichtiging", "woning", "koper", "verkoper", "taxatie"
- Automotive/garages: "afspraak", "APK", "reparatie", "werkplaats"
- Legal: "dossier", "cliënt", "zaak", "consult", "intake"
- Restaurants: "reservering", "tafel", "gast", "menu"
- Salons/beauty: "behandeling", "cliënt", "afspraak"
Adapt ALL text to use the natural vocabulary of "${industry}". Never use generic placeholder text.

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "nl": {
    "title": "SEO page title in Dutch (max 60 chars)",
    "meta_description": "Meta description in Dutch (max 155 chars)",
    "hero_headline": "Powerful hero headline in Dutch showing the problem (mention hours closed). Use <em>emphasis</em> for key phrase.",
    "hero_subline": "Supporting subtitle in Dutch (1-2 sentences) using industry-specific terms",
    "hero_badge": "Short badge text like 'AI Receptioniste voor [industry]' in Dutch",
    "problem_headline": "Section headline about the problem in Dutch, industry-specific",
    "problem_body": "2-3 sentences explaining how clients/customers call when the business is closed, using industry terminology",
    "closed_hours": 6420,
    "closed_percent": 73,
    "timeline": [
      {"time": "18:30", "scenario": "Industry-specific missed call scenario in Dutch"},
      {"time": "Zaterdag 10:00", "scenario": "Weekend scenario in Dutch using industry terms"},
      {"time": "Elke gemiste oproep", "scenario": "Cost of missed calls using industry revenue terms"}
    ],
    "solution_headline": "Headline for the features/solution section in Dutch, industry-specific (e.g. 'Uw AI Receptioniste die nooit slaapt')",
    "solution_subline": "Subline for solution section in Dutch, referencing how the AI handles this industry's specific tasks",
    "features": [
      {"icon": "clock", "title": "Feature title", "body": "Feature description using industry terms"},
      {"icon": "calendar", "title": "Feature title", "body": "Feature description using industry terms"},
      {"icon": "chat", "title": "Feature title", "body": "Feature description using industry terms"},
      {"icon": "clipboard", "title": "Feature title", "body": "Feature description using industry terms"},
      {"icon": "globe", "title": "Feature title", "body": "Feature description using industry terms"},
      {"icon": "shield", "title": "Feature title", "body": "Feature description using industry terms"}
    ],
    "agents_label": "Short uppercase label for agents section, e.g. 'Onze AI Agents'",
    "agents_headline": "Headline about multiple agents working together for this SPECIFIC industry in Dutch (NOT 'kliniek' unless it IS a clinic)",
    "agents_subline": "Subline about every touchpoint being automated, industry-specific",
    "agents": [
      {"title": "AI Voice Agent - Inbound", "body": "Description of inbound voice agent tailored to this industry's specific use case", "tag": "Telefonie", "channel": "phone-in"},
      {"title": "AI Voice Agent - Outbound", "body": "Description of outbound calling tailored to this industry (e.g. appointment reminders, follow-ups)", "tag": "Telefonie", "channel": "phone-out"},
      {"title": "WhatsApp & SMS Agent", "body": "Description tailored to how this industry uses messaging", "tag": "Messaging", "channel": "whatsapp"},
      {"title": "Facebook Messenger Agent", "body": "Description tailored to this industry's Facebook usage", "tag": "Social Media", "channel": "facebook"},
      {"title": "Instagram DM Agent", "body": "Description tailored to this industry's Instagram presence", "tag": "Social Media", "channel": "instagram"},
      {"title": "E-mail Agent", "body": "Description of email automation for this industry", "tag": "E-mail", "channel": "email"}
    ],
    "usecases_label": "Short uppercase label, industry-specific (e.g. 'Specifiek voor klinieken')",
    "usecases_headline": "Headline mentioning the AI is specifically trained for this industry",
    "usecases_subline": "Subline using industry workflow terms (e.g. 'Van intake tot nazorg' for clinics, 'Van bezichtiging tot overdracht' for real estate)",
    "usecases": [
      {"title": "Use case title", "body": "Description using industry terms"},
      {"title": "Use case title", "body": "Description using industry terms"},
      {"title": "Use case title", "body": "Description using industry terms"},
      {"title": "Use case title", "body": "Description using industry terms"},
      {"title": "Use case title", "body": "Description using industry terms"},
      {"title": "Use case title", "body": "Description using industry terms"}
    ],
    "integrations": ["List of 5-7 software/tools commonly used in this industry, e.g. for clinics: Google Calendar, Clinicminds, Timify etc. For real estate: Realworks, Funda, Google Calendar etc."],
    "steps_title": "Title for 'how it works' section, industry-specific (e.g. 'De AI Voice Agent wordt getraind met kennis over uw [industry term].')",
    "steps_sub": "Subline for steps section",
    "steps": [
      {"title": "Step 1 title", "body": "Step 1 description using industry context"},
      {"title": "Step 2 title", "body": "Step 2 description using industry context"},
      {"title": "Step 3 title", "body": "Step 3 description using industry context"}
    ],
    "stats_label": "Short label like 'Resultaten'",
    "stats_title": "Headline about results with agentmakers.io, industry-specific",
    "stats": [
      {"value": "98%", "label": "of all calls answered — phrased for this industry"},
      {"value": "+34%", "label": "more bookings/appointments outside hours — phrased for this industry"},
      {"value": "-40%", "label": "reduction in no-shows/missed appointments — phrased for this industry"}
    ],
    "revenue_calls": 5,
    "revenue_per_call": 500,
    "calc_calls_label": "Industry-specific term for missed appointments/bookings per week, e.g. 'Gemiste consulten / week' for dentists, 'Gemiste bezichtigingen / week' for real estate — short, max 4 words",
    "calc_value_label": "Industry-specific term for average order/appointment value, e.g. 'Gem. behandelwaarde' for dentists, 'Gem. transactiewaarde' for real estate — short, max 4 words",
    "cta_headline": "Strong closing CTA headline in Dutch"
  },
  "en": { ... same structure but in English, with industry-specific English terminology ... },
  "es": { ... same structure but in Spanish, with industry-specific Spanish terminology ... },
  "hero_image_query": "Unsplash search query for a professional ${industry} photo (in English, 3-5 words, e.g. 'modern dental clinic interior' or 'real estate luxury home')"
}

Make ALL content highly specific and relevant to the "${industry}" industry. Use realistic numbers for revenue_calls and revenue_per_call based on the industry's typical appointment/transaction value. Every single text string must use the natural vocabulary and jargon of this industry — never use generic business terms when an industry-specific term exists.

FORMATTING RULE: Never use em-dashes (—) anywhere in the output. Use a comma, colon, or rewrite the sentence instead.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in Claude response')

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedContent
  return removeEmDashes(parsed)
}

// Curated fallback images per industry keyword (Unsplash photo IDs)
const FALLBACK_IMAGES: Record<string, string> = {
  dental:      'photo-1606811841689-23dfddce3e95', // dental clinic
  tandarts:    'photo-1606811841689-23dfddce3e95',
  dentist:     'photo-1606811841689-23dfddce3e95',
  hair:        'photo-1560066984-138dadb4c035', // hair salon
  kapper:      'photo-1560066984-138dadb4c035',
  salon:       'photo-1560066984-138dadb4c035',
  fitness:     'photo-1534438327276-14e5300c3a48', // gym
  gym:         'photo-1534438327276-14e5300c3a48',
  sport:       'photo-1534438327276-14e5300c3a48',
  restaurant:  'photo-1414235077428-338989a2e8c0',
  food:        'photo-1414235077428-338989a2e8c0',
  real:        'photo-1560518883-ce09059eeffa', // real estate
  estate:      'photo-1560518883-ce09059eeffa',
  makelaar:    'photo-1560518883-ce09059eeffa',
  clinic:      'photo-1519494026892-80bbd2d6fd0d', // medical clinic
  medical:     'photo-1519494026892-80bbd2d6fd0d',
  zorg:        'photo-1519494026892-80bbd2d6fd0d',
  lawyer:      'photo-1589829545856-d10d557cf95f', // law office
  legal:       'photo-1589829545856-d10d557cf95f',
  advocaat:    'photo-1589829545856-d10d557cf95f',
  accountant:  'photo-1554224155-6726b3ff858f',
  finance:     'photo-1554224155-6726b3ff858f',
  cleaning:    'photo-1581578731548-c64695cc6952', // cleaning
  schoonmaak:  'photo-1581578731548-c64695cc6952',
  painting:    'photo-1562259949-e8e7689d7828', // painting
  schilder:    'photo-1562259949-e8e7689d7828',
  plumber:     'photo-1585771724684-38269d6639fd', // plumber
  loodgieter:  'photo-1585771724684-38269d6639fd',
  electrician: 'photo-1621905251189-08b45249a5b0',
  elektricien: 'photo-1621905251189-08b45249a5b0',
  vet:         'photo-1548767797-d8c844163c4a', // veterinarian
  dierenarts:  'photo-1548767797-d8c844163c4a',
  pharmacy:    'photo-1587854692152-cbe660dbde88',
  apotheek:    'photo-1587854692152-cbe660dbde88',
  default:     'photo-1497366216548-37526070297c', // professional office
}

function getFallbackImage(query: string): string {
  const lower = query.toLowerCase()
  for (const [keyword, photoId] of Object.entries(FALLBACK_IMAGES)) {
    if (lower.includes(keyword)) {
      return `https://images.unsplash.com/${photoId}?w=1920&q=80&auto=format&fit=crop`
    }
  }
  return `https://images.unsplash.com/${FALLBACK_IMAGES.default}?w=1920&q=80&auto=format&fit=crop`
}

// Fetch a relevant Unsplash image URL.
// Uses the official Unsplash API when UNSPLASH_ACCESS_KEY is set,
// otherwise falls back to a curated map of industry-specific photos.
export async function getUnsplashImage(query: string): Promise<string> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY

  if (accessKey) {
    try {
      const encoded = encodeURIComponent(query)
      const res = await fetch(
        `https://api.unsplash.com/photos/random?query=${encoded}&orientation=landscape&client_id=${accessKey}`,
        { headers: { 'Accept-Version': 'v1' } }
      )
      if (res.ok) {
        const data = await res.json()
        const url = data?.urls?.regular || data?.urls?.full
        if (url) return url.split('?')[0] + '?w=1920&q=80&auto=format&fit=crop'
      }
    } catch {
      // Fall through to curated fallback
    }
  }

  return getFallbackImage(query)
}
