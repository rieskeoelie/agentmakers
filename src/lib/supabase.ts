import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client for browser / public use
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client with service role (server-side only!)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// ─── Types ───
export type LandingPage = {
  id: string
  slug: string
  industry: string
  status: 'draft' | 'live' | 'offline'
  title_nl: string
  meta_description_nl: string
  hero_headline_nl: string
  hero_subline_nl: string
  body_content_nl: Record<string, unknown>
  title_en: string
  meta_description_en: string
  hero_headline_en: string
  hero_subline_en: string
  body_content_en: Record<string, unknown>
  title_es: string
  meta_description_es: string
  hero_headline_es: string
  hero_subline_es: string
  body_content_es: Record<string, unknown>
  hero_image_url: string
  visits: number
  conversions: number
  created_at: string
  updated_at: string
}

export type Lead = {
  id: string
  landing_page_slug: string
  language: string
  naam: string
  email: string
  telefoon: string
  website?: string
  bedrijfsnaam?: string
  created_at: string
}

export type Lang = 'nl' | 'en' | 'es'
