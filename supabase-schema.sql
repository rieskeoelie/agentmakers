-- ═══════════════════════════════════════════════════
-- AGENTBAY.NL — Supabase Database Schema
-- Voer dit uit in: Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════

-- ─── LANDING PAGES ───
CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,                    -- bijv. "klinieken"
  industry TEXT NOT NULL,                       -- bijv. "Klinieken & Salons"
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'offline')),

  -- Content NL
  title_nl TEXT,
  meta_description_nl TEXT,
  hero_headline_nl TEXT,
  hero_subline_nl TEXT,
  body_content_nl JSONB,

  -- Content EN
  title_en TEXT,
  meta_description_en TEXT,
  hero_headline_en TEXT,
  hero_subline_en TEXT,
  body_content_en JSONB,

  -- Content ES
  title_es TEXT,
  meta_description_es TEXT,
  hero_headline_es TEXT,
  hero_subline_es TEXT,
  body_content_es JSONB,

  -- Media
  hero_image_url TEXT,

  -- Stats (updated via API)
  visits INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── LEADS ───
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landing_page_slug TEXT NOT NULL,
  language TEXT DEFAULT 'nl',

  -- Contact info
  naam TEXT NOT NULL,
  email TEXT NOT NULL,
  telefoon TEXT NOT NULL,
  website TEXT,
  bedrijfsnaam TEXT,

  -- Meta
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── PAGE VIEWS (Analytics) ───
CREATE TABLE IF NOT EXISTS page_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landing_page_slug TEXT NOT NULL,
  language TEXT DEFAULT 'nl',
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  referrer TEXT,
  country TEXT
);

-- ─── INDEXES ───
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_pages_status ON landing_pages(status);
CREATE INDEX IF NOT EXISTS idx_leads_slug ON leads(landing_page_slug);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_slug ON page_views(landing_page_slug);
CREATE INDEX IF NOT EXISTS idx_page_views_viewed ON page_views(viewed_at DESC);

-- ─── AUTO UPDATE updated_at ───
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_landing_pages_updated_at
  BEFORE UPDATE ON landing_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ───
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- Public can read live pages
CREATE POLICY "Public read live pages" ON landing_pages
  FOR SELECT USING (status = 'live');

-- Public can insert leads
CREATE POLICY "Public insert leads" ON leads
  FOR INSERT WITH CHECK (true);

-- Public can insert page views
CREATE POLICY "Public insert page_views" ON page_views
  FOR INSERT WITH CHECK (true);

-- Service role has full access (used by admin API routes)
CREATE POLICY "Service role full access pages" ON landing_pages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access leads" ON leads
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access views" ON page_views
  FOR ALL USING (auth.role() = 'service_role');

-- ─── SEED: kliniek pagina (al live) ───
INSERT INTO landing_pages (
  slug, industry, status,
  title_nl, meta_description_nl, hero_headline_nl, hero_subline_nl,
  title_en, meta_description_en, hero_headline_en, hero_subline_en,
  title_es, meta_description_es, hero_headline_es, hero_subline_es,
  hero_image_url
) VALUES (
  'klinieken',
  'Klinieken & Salons',
  'live',
  'AI Receptionist voor Klinieken | agentmakers.io',
  'Uw kliniek is 6.420 uur per jaar gesloten. Onze AI receptionist boekt afspraken 24/7. Nooit meer een gemiste oproep.',
  'Uw kliniek is 6.420 uur per jaar gesloten. Uw klanten niet.',
  'Onze AI receptioniste boekt behandelingen, beantwoordt vragen en verhoogt uw omzet — dag en nacht.',
  'AI Receptionist for Clinics | agentmakers.io',
  'Your clinic is closed 6,420 hours a year. Our AI receptionist books appointments 24/7. Never miss a call again.',
  'Your clinic is closed 6,420 hours a year. Your clients are not.',
  'Our AI receptionist books treatments, answers questions and increases your revenue — day and night.',
  'Su clínica está cerrada 6.420 horas al año. Sus clientes no.',
  'Su clínica está cerrada 6.420 horas al año. Nuestra recepcionista IA reserva citas 24/7.',
  'Su clínica está cerrada 6.420 horas al año. Sus clientes no.',
  'Nuestra recepcionista IA reserva tratamientos, responde preguntas y aumenta sus ingresos, día y noche.',
  'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1920&q=80'
) ON CONFLICT (slug) DO NOTHING;
