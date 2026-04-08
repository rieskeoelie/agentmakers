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

// Curated fallback images per industry keyword (multiple Unsplash photo IDs for variety)
const FALLBACK_IMAGES: Record<string, string[]> = {
  dental:      ['photo-1606811841689-23dfddce3e95', 'photo-1588776814546-1ffbb172c4e4', 'photo-1629909613654-28e377c37b09', 'photo-1598256989800-fe5f95da9787'],
  tandarts:    ['photo-1606811841689-23dfddce3e95', 'photo-1588776814546-1ffbb172c4e4', 'photo-1629909613654-28e377c37b09', 'photo-1598256989800-fe5f95da9787'],
  dentist:     ['photo-1606811841689-23dfddce3e95', 'photo-1588776814546-1ffbb172c4e4', 'photo-1629909613654-28e377c37b09', 'photo-1598256989800-fe5f95da9787'],
  hair:        ['photo-1560066984-138dadb4c035', 'photo-1522337360788-8b13dee7a37e', 'photo-1521590832167-7bcbfaa6381f', 'photo-1562322994-1c2742c0e6f6'],
  kapper:      ['photo-1560066984-138dadb4c035', 'photo-1522337360788-8b13dee7a37e', 'photo-1521590832167-7bcbfaa6381f', 'photo-1562322994-1c2742c0e6f6'],
  salon:       ['photo-1560066984-138dadb4c035', 'photo-1522337360788-8b13dee7a37e', 'photo-1521590832167-7bcbfaa6381f', 'photo-1562322994-1c2742c0e6f6'],
  fitness:     ['photo-1534438327276-14e5300c3a48', 'photo-1571019613454-1cb2f99b2d8b', 'photo-1517836357463-d25dfeac3438', 'photo-1605296867304-46d5465a13f1'],
  gym:         ['photo-1534438327276-14e5300c3a48', 'photo-1571019613454-1cb2f99b2d8b', 'photo-1517836357463-d25dfeac3438', 'photo-1605296867304-46d5465a13f1'],
  sport:       ['photo-1534438327276-14e5300c3a48', 'photo-1571019613454-1cb2f99b2d8b', 'photo-1517836357463-d25dfeac3438', 'photo-1605296867304-46d5465a13f1'],
  restaurant:  ['photo-1414235077428-338989a2e8c0', 'photo-1517248135467-4c7edcad34c4', 'photo-1555396273-367ea4eb4db5', 'photo-1466978913421-dad2ebd01d17'],
  food:        ['photo-1414235077428-338989a2e8c0', 'photo-1517248135467-4c7edcad34c4', 'photo-1555396273-367ea4eb4db5', 'photo-1466978913421-dad2ebd01d17'],
  real:        ['photo-1560518883-ce09059eeffa', 'photo-1570129477492-45c003edd2be', 'photo-1512917774080-9991f1c4c750', 'photo-1582407947304-fd86f28320c7'],
  estate:      ['photo-1560518883-ce09059eeffa', 'photo-1570129477492-45c003edd2be', 'photo-1512917774080-9991f1c4c750', 'photo-1582407947304-fd86f28320c7'],
  makelaar:    ['photo-1560518883-ce09059eeffa', 'photo-1570129477492-45c003edd2be', 'photo-1512917774080-9991f1c4c750', 'photo-1582407947304-fd86f28320c7'],
  clinic:      ['photo-1519494026892-80bbd2d6fd0d', 'photo-1576091160399-112ba8d25d1d', 'photo-1532938911079-1b06ac7ceec7', 'photo-1579684385127-1ef15d508118'],
  medical:     ['photo-1519494026892-80bbd2d6fd0d', 'photo-1576091160399-112ba8d25d1d', 'photo-1532938911079-1b06ac7ceec7', 'photo-1579684385127-1ef15d508118'],
  zorg:        ['photo-1519494026892-80bbd2d6fd0d', 'photo-1576091160399-112ba8d25d1d', 'photo-1532938911079-1b06ac7ceec7', 'photo-1579684385127-1ef15d508118'],
  lawyer:      ['photo-1589829545856-d10d557cf95f', 'photo-1453728013993-6d66e9c9123a', 'photo-1507679799987-c73779587ccf', 'photo-1568992687947-868a62a9f521'],
  legal:       ['photo-1589829545856-d10d557cf95f', 'photo-1453728013993-6d66e9c9123a', 'photo-1507679799987-c73779587ccf', 'photo-1568992687947-868a62a9f521'],
  advocaat:    ['photo-1589829545856-d10d557cf95f', 'photo-1453728013993-6d66e9c9123a', 'photo-1507679799987-c73779587ccf', 'photo-1568992687947-868a62a9f521'],
  accountant:  ['photo-1554224155-6726b3ff858f', 'photo-1460925895917-afdab827c52f', 'photo-1611974789855-9c2a0a7236a3', 'photo-1450101499163-c8848c66ca85'],
  finance:     ['photo-1554224155-6726b3ff858f', 'photo-1460925895917-afdab827c52f', 'photo-1611974789855-9c2a0a7236a3', 'photo-1450101499163-c8848c66ca85'],
  cleaning:    ['photo-1581578731548-c64695cc6952', 'photo-1527515637462-cff94ebb57f9', 'photo-1563453392212-326f5e854473', 'photo-1558618666-fcd25c85cd64'],
  schoonmaak:  ['photo-1581578731548-c64695cc6952', 'photo-1527515637462-cff94ebb57f9', 'photo-1563453392212-326f5e854473', 'photo-1558618666-fcd25c85cd64'],
  painting:    ['photo-1562259949-e8e7689d7828', 'photo-1589939705384-5185137a7f0f', 'photo-1558618047-f32e61e7d0f3', 'photo-1504307651254-35680f356dfd'],
  schilder:    ['photo-1562259949-e8e7689d7828', 'photo-1589939705384-5185137a7f0f', 'photo-1558618047-f32e61e7d0f3', 'photo-1504307651254-35680f356dfd'],
  plumber:     ['photo-1585771724684-38269d6639fd', 'photo-1607472586893-edb57bdc0e39', 'photo-1558618048-f32e61e7d0f3', 'photo-1504307651254-35680f356dfd'],
  loodgieter:  ['photo-1585771724684-38269d6639fd', 'photo-1607472586893-edb57bdc0e39', 'photo-1558618048-f32e61e7d0f3', 'photo-1504307651254-35680f356dfd'],
  electrician: ['photo-1621905251189-08b45249a5b0', 'photo-1473341304170-971dccb5ac1e', 'photo-1497435334941-8c899ee9e8e9', 'photo-1530124566582-a618bc2615dc'],
  elektricien: ['photo-1621905251189-08b45249a5b0', 'photo-1473341304170-971dccb5ac1e', 'photo-1497435334941-8c899ee9e8e9', 'photo-1530124566582-a618bc2615dc'],
  vet:         ['photo-1548767797-d8c844163c4a', 'photo-1516734212186-a967f81ad0d7', 'photo-1587300003388-59208cc962cb', 'photo-1602584427168-cc01c63e895a'],
  dierenarts:  ['photo-1548767797-d8c844163c4a', 'photo-1516734212186-a967f81ad0d7', 'photo-1587300003388-59208cc962cb', 'photo-1602584427168-cc01c63e895a'],
  pharmacy:    ['photo-1587854692152-cbe660dbde88', 'photo-1584308666744-24d5c474f2ae', 'photo-1550572017-a9b7e28d9b93', 'photo-1563213126-a4273aed2016'],
  apotheek:    ['photo-1587854692152-cbe660dbde88', 'photo-1584308666744-24d5c474f2ae', 'photo-1550572017-a9b7e28d9b93', 'photo-1563213126-a4273aed2016'],
  default:     ['photo-1497366216548-37526070297c', 'photo-1486406146926-c627a92ad1ab', 'photo-1497215842964-222b430dc094', 'photo-1504384308090-c894fdcc538d', 'photo-1522202176988-66273c2fd55f'],
}

function getFallbackImage(query: string): string {
  const lower = query.toLowerCase()
  for (const [keyword, photoIds] of Object.entries(FALLBACK_IMAGES)) {
    if (lower.includes(keyword)) {
      const pick = photoIds[Math.floor(Math.random() * photoIds.length)]
      return `https://images.unsplash.com/${pick}?w=1920&q=80&auto=format&fit=crop`
    }
  }
  const defaults = FALLBACK_IMAGES.default
  const pick = defaults[Math.floor(Math.random() * defaults.length)]
  return `https://images.unsplash.com/${pick}?w=1920&q=80&auto=format&fit=crop`
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
