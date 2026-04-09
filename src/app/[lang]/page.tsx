import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { DemoForm } from '@/components/landing/DemoForm'
import { OrbPreview } from '@/components/landing/OrbPreview'
import { OrbColumn } from '@/components/landing/OrbColumn'
import { HeroDashboard } from '@/components/landing/HeroDashboard'
import type { LandingPage } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Lang = 'nl' | 'en' | 'es'

const SUPPORTED = ['nl', 'en', 'es']

// Translate Dutch industry names to EN/ES for the homepage cards
const INDUSTRY_TRANSLATIONS: Record<string, Record<Lang, string>> = {
  'tandartspraktijken':  { nl: 'Tandartspraktijken',  en: 'Dental Practices',     es: 'Clínicas Dentales' },
  'klinieken & salons':  { nl: 'Klinieken & Salons',  en: 'Clinics & Salons',      es: 'Clínicas & Salones' },
  'klinieken':           { nl: 'Klinieken',            en: 'Clinics',               es: 'Clínicas' },
  'schoonheidssalons':   { nl: 'Schoonheidssalons',   en: 'Beauty Salons',          es: 'Salones de Belleza' },
  'fysiotherapie':       { nl: 'Fysiotherapie',        en: 'Physiotherapy',          es: 'Fisioterapia' },
  'makelaardij':         { nl: 'Makelaardij',          en: 'Real Estate Agents',     es: 'Agentes Inmobiliarios' },
  'makelaars':           { nl: 'Makelaars',            en: 'Real Estate Agents',     es: 'Agentes Inmobiliarios' },
  'makelaar':            { nl: 'Makelaar',             en: 'Real Estate Agent',      es: 'Agente Inmobiliario' },
  'autogarages':         { nl: 'Autogarages',          en: 'Car Garages',            es: 'Talleres de Coches' },
  'restaurants':         { nl: 'Restaurants',          en: 'Restaurants',            es: 'Restaurantes' },
  'horeca':              { nl: 'Horeca',               en: 'Hospitality',            es: 'Hostelería' },
  'loodgieters':         { nl: 'Loodgieters',          en: 'Plumbers',              es: 'Fontaneros' },
  'advocaten':           { nl: 'Advocaten',            en: 'Law Firms',             es: 'Abogados' },
  'accountants':         { nl: 'Accountants',          en: 'Accountants',           es: 'Contables' },
}

function translateIndustry(industry: string, lang: Lang): string {
  if (lang === 'nl') return industry
  const key = industry.toLowerCase()
  return INDUSTRY_TRANSLATIONS[key]?.[lang] ?? industry
}

const T = {
  nl: {
    badge: 'AI Agents op maat voor uw branche',
    h1a: 'Uw bedrijf verdient een',
    h1em: 'AI medewerker',
    h1b: 'die nooit slaapt',
    sub: 'Wij bouwen AI agents die uw telefoon beantwoorden, afspraken inboeken en klanten helpen — 24/7, in elke branche.',
    cta: 'Bekijk onze oplossingen ↓',
    stats: [['24/7', 'Altijd bereikbaar'], ['10+', 'Talen ondersteund'], ['48u', 'Live in 48 uur']],
    sectionLabel: 'Onze oplossingen',
    sectionH2: 'AI agents voor elke branche',
    sectionSub: 'Kies uw branche en ontdek wat onze AI agents specifiek voor u kunnen betekenen.',
    viewSolution: 'Bekijk oplossing →',
    howLabel: 'Hoe het werkt',
    howH2: 'In 4 stappen operationeel',
    howSub: 'Geen technische kennis nodig. Wij regelen alles.',
    steps: [
      ['1', 'Kies uw branche', 'Selecteer uw branche zodat wij de AI agents optimaal kunnen afstemmen.'],
      ['2', 'Wij configureren', 'We trainen de AI op uw bedrijf: diensten, prijzen, tone of voice en protocollen.'],
      ['3', 'Integratie', 'Koppeling met uw agenda, telefonie en bestaande systemen.'],
      ['4', '48 uur live', 'Uw AI agents draaien binnen 48 uur — 24/7, zonder onderbreking.'],
    ],
    demoBadge: 'Gratis demo',
    demoH2: 'Zie direct uw AI receptioniste in actie',
    demoSub: 'Per jaar bent u duizenden uren gesloten. Zie hoe uw AI receptioniste tijdens die uren uw agenda vult met afspraken.',
    orbSub: 'Vul snel het formulier in en beluister de AI voice agent in actie.',
    form: {
      cta_headline: 'Zie de Voice Agent in actie',
      cta_sub: 'Binnen enkele minuten ontvangt u een link om uw eigen AI receptioniste te beluisteren.',
      name: 'Uw naam', email: 'E-mailadres', phone: 'Telefoonnummer',
      website: 'Website (optioneel)', company: 'Bedrijfsnaam',
      submit: 'Stuur mij de demo link', sending: 'Even geduld…',
      error: 'Probeer het opnieuw', success: 'Uw demo is onderweg!',
      success_sub: 'Check uw inbox voor de persoonlijke demo-link.\n\nDe AI receptioniste is al geconfigureerd op uw bedrijf.',
      trust: 'Geen verplichtingen. Gratis. Binnen 2 minuten in uw inbox.',
      diensten_label: '',
    },
    footer: '© 2026 agentmakers.io. Alle rechten voorbehouden.',
    descField: 'meta_description_nl',
  },
  en: {
    badge: 'AI Agents tailored for your industry',
    h1a: 'Your business deserves an',
    h1em: 'AI employee',
    h1b: 'that never sleeps',
    sub: 'We build AI agents that answer your phone, book appointments and help customers — 24/7, in every industry.',
    cta: 'Discover our solutions ↓',
    stats: [['24/7', 'Always available'], ['10+', 'Languages supported'], ['48h', 'Live in 48 hours']],
    sectionLabel: 'Our solutions',
    sectionH2: 'AI agents for every industry',
    sectionSub: 'Choose your industry and discover what our AI agents can specifically do for you.',
    viewSolution: 'View solution →',
    howLabel: 'How it works',
    howH2: 'Operational in 4 steps',
    howSub: 'No technical knowledge needed. We handle everything.',
    steps: [
      ['1', 'Choose your industry', 'Select your industry so we can optimally configure the AI agents for you.'],
      ['2', 'We configure', 'We train the AI on your business: services, prices, tone of voice and protocols.'],
      ['3', 'Integration', 'Connection with your calendar, telephony and existing systems.'],
      ['4', 'Live in 48h', 'Your AI agents are running within 48 hours — 24/7, without interruption.'],
    ],
    demoBadge: 'Free demo',
    demoH2: 'See your AI receptionist in action instantly',
    demoSub: 'Your business is closed thousands of hours per year. See how your AI receptionist fills your calendar during those hours.',
    orbSub: 'Fill in the form quickly and listen to the AI voice agent in action.',
    form: {
      cta_headline: 'See the Voice Agent in action',
      cta_sub: 'Within minutes you will receive a link to listen to your own AI receptionist.',
      name: 'Your name', email: 'Email address', phone: 'Phone number',
      website: 'Website (optional)', company: 'Company name',
      submit: 'Send me the demo link', sending: 'Please wait…',
      error: 'Please try again', success: 'Your demo is on its way!',
      success_sub: 'Check your inbox for the personal demo link.\n\nThe AI receptionist is already configured for your business.',
      trust: 'No obligations. Free. In your inbox within 2 minutes.',
      diensten_label: '',
    },
    footer: '© 2026 agentmakers.io. All rights reserved.',
    descField: 'meta_description_en',
  },
  es: {
    badge: 'Agentes de IA para su sector',
    h1a: 'Su empresa merece un',
    h1em: 'empleado de IA',
    h1b: 'que nunca duerme',
    sub: 'Creamos agentes de IA que responden su teléfono, reservan citas y ayudan a clientes — 24/7, en cualquier sector.',
    cta: 'Descubra nuestras soluciones ↓',
    stats: [['24/7', 'Siempre disponible'], ['10+', 'Idiomas'], ['48h', 'En directo en 48h']],
    sectionLabel: 'Nuestras soluciones',
    sectionH2: 'Agentes de IA para cada sector',
    sectionSub: 'Elija su sector y descubra lo que nuestros agentes de IA pueden hacer por usted.',
    viewSolution: 'Ver solución →',
    howLabel: 'Cómo funciona',
    howH2: 'Operativo en 4 pasos',
    howSub: 'Sin conocimientos técnicos. Nos encargamos de todo.',
    steps: [
      ['1', 'Elija su sector', 'Seleccione su sector para que configuremos los agentes de IA de forma óptima.'],
      ['2', 'Configuramos', 'Entrenamos la IA en su empresa: servicios, precios, tono y protocolos.'],
      ['3', 'Integración', 'Conexión con su agenda, telefonía y sistemas existentes.'],
      ['4', 'En directo en 48h', 'Sus agentes de IA funcionan en 48 horas — 24/7, sin interrupciones.'],
    ],
    demoBadge: 'Demo gratuita',
    demoH2: 'Vea su recepcionista de IA en acción',
    demoSub: 'Su empresa está cerrada miles de horas al año. Vea cómo su recepcionista de IA llena su agenda durante esas horas.',
    orbSub: 'Rellene el formulario rápidamente y escuche al agente de voz de IA en acción.',
    form: {
      cta_headline: 'Vea el Agente de Voz en acción',
      cta_sub: 'En minutos recibirá un enlace para escuchar su propio recepcionista de IA.',
      name: 'Su nombre', email: 'Correo electrónico', phone: 'Número de teléfono',
      website: 'Sitio web (opcional)', company: 'Nombre de empresa',
      submit: 'Envíame el enlace de demo', sending: 'Un momento…',
      error: 'Inténtelo de nuevo', success: '¡Su demo está en camino!',
      success_sub: 'Revise su bandeja de entrada para el enlace de demo personal.\n\nEl recepcionista de IA ya está configurado para su empresa.',
      trust: 'Sin compromiso. Gratis. En su bandeja en 2 minutos.',
      diensten_label: '',
    },
    footer: '© 2026 agentmakers.io. Todos los derechos reservados.',
    descField: 'meta_description_es',
  },
}

async function getLivePages(lang: Lang): Promise<Record<string, unknown>[]> {
  const descField    = `meta_description_${lang}`
  const contentField = `body_content_${lang}`
  const { data } = await supabaseAdmin
    .from('landing_pages')
    .select(`slug, industry, hero_image_url, ${descField}, ${contentField}, status`)
    .eq('status', 'live')
    .order('created_at', { ascending: true })
  return (data as unknown as Record<string, unknown>[]) || []
}

export default async function LangHomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params
  if (!SUPPORTED.includes(rawLang)) return notFound()
  const lang = rawLang as Lang
  const tx = T[lang]

  const livePages = await getLivePages(lang)

  const flags: Record<Lang, string> = { nl: '🇳🇱', en: '🇬🇧', es: '🇪🇸' }
  const flagLinks: Record<Lang, string> = { nl: '/', en: '/en', es: '/es' }

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", color: 'var(--slate-700)', background: '#fff', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #F1F5F9', padding: '16px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo-transparent.png" alt="agentmakers.io" style={{ height: 36, width: 'auto', display: 'block' }} />
          </a>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <a href="/ai-agents" style={{ fontWeight: 600, color: '#0D9488', fontSize: '.9rem', textDecoration: 'none' }}>AI Agents</a>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['nl', 'en', 'es'] as Lang[]).map(l => (
                <a key={l} href={flagLinks[l]} title={l} style={{ textDecoration: 'none', fontSize: '1.35rem', opacity: l === lang ? 1 : 0.45, lineHeight: 1 }}>
                  {flags[l]}
                </a>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 120, paddingBottom: 80, background: 'linear-gradient(180deg, #F0FDFA 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
            {/* LEFT */}
            <div>
              <div style={{ display: 'inline-block', background: 'rgba(13,148,136,.1)', color: '#0F766E', padding: '6px 16px', borderRadius: 100, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em', marginBottom: 24 }}>
                {tx.badge}
              </div>
              <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.6rem, 2.8vw, 2.3rem)', lineHeight: 1.18, marginBottom: 20 }}>
                {tx.h1a}{' '}<em style={{ fontStyle: 'normal', color: '#0D9488' }}>{tx.h1em}</em>{' '}{tx.h1b}
              </h1>
              <p style={{ fontSize: '1.05rem', color: '#64748B', marginBottom: 36, lineHeight: 1.7 }}>{tx.sub}</p>
              <a href="#branches" style={{ background: '#0D9488', color: '#fff', padding: '14px 32px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {tx.cta}
              </a>
              <div style={{ display: 'flex', gap: 36, marginTop: 48, flexWrap: 'wrap' }}>
                {tx.stats.map(([num, label]) => (
                  <div key={num}>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '2rem', fontWeight: 700, color: '#0F766E' }}>{num}</div>
                    <div style={{ fontSize: '.82rem', color: '#64748B', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* RIGHT */}
            <div>
              <HeroDashboard />
            </div>
          </div>
        </div>
        <style>{`
          @media (max-width: 860px) {
            .hero-grid { grid-template-columns: 1fr !important; }
            .hero-grid > div:last-child { max-width: 520px; margin: 0 auto; width: 100%; }
          }
          @media (max-width: 480px) {
            .hero-grid > div:last-child { max-width: 100%; }
          }
        `}</style>
      </section>

      {/* BRANCHES */}
      <section id="branches" className="sp">
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>{tx.sectionLabel}</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>{tx.sectionH2}</h2>
            <p style={{ color: '#64748B', fontSize: '1.05rem', maxWidth: 560, margin: '0 auto' }}>{tx.sectionSub}</p>
          </div>
          <div className="grid-3col">
            {livePages.map((page) => (
              <a key={page.slug as string} href={`/${lang}/${page.slug}`} style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 16, overflow: 'hidden', textDecoration: 'none', color: 'inherit', display: 'block', transition: 'all .3s' }}>
                <img src={(page.hero_image_url as string) || 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=600&q=80'} alt={page.industry as string} style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: 24 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F0FDFA', color: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', marginBottom: 16 }}>✚</div>
                  <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.1rem', fontWeight: 700, marginBottom: 8, color: '#0F172A' }}>
                    {(page[`body_content_${lang}`] as Record<string, unknown> | undefined)?._industry_label as string
                      || translateIndustry(page.industry as string, lang)}
                  </h3>
                  <p style={{ fontSize: '.9rem', color: '#64748B', lineHeight: 1.6, marginBottom: 16 }}>
                    {(page[`meta_description_${lang}`] as string) || ''}
                  </p>
                  <span style={{ fontSize: '.88rem', fontWeight: 600, color: '#0D9488', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{tx.viewSolution}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="sp" style={{ background: '#0F172A' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ color: '#CCFBF1', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>{tx.howLabel}</div>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>{tx.howH2}</h2>
          <p style={{ color: '#CBD5E1', fontSize: '1.05rem', maxWidth: 560, margin: '0 auto 56px' }}>{tx.howSub}</p>
          <div className="grid-4col">
            {tx.steps.map(([num, title, desc]) => (
              <div key={num} style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>{num}</div>
                <h3 style={{ fontFamily: "'Nunito',sans-serif", color: '#fff', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: '.88rem', color: '#CBD5E1', maxWidth: 220, margin: '0 auto' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO CTA */}
      <section id="contact" style={{ background: 'linear-gradient(160deg, #0A1628 0%, #0F2A3A 50%, #0A1628 100%)', padding: '80px 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: '50vw', height: '50vw', maxWidth: 600, maxHeight: 600, top: '-20%', left: '-10%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(13,148,136,0.18) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', width: '40vw', height: '40vw', maxWidth: 500, maxHeight: 500, bottom: '-15%', right: '-8%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.14) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        </div>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: 100, padding: '6px 16px', marginBottom: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2DD4BF', display: 'inline-block' }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2DD4BF' }}>{tx.demoBadge}</span>
            </div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', lineHeight: 1.15, marginBottom: 20, maxWidth: 700, marginLeft: 'auto', marginRight: 'auto' }}>{tx.demoH2}</h2>
            <p style={{ color: 'rgba(240,244,248,0.55)', fontSize: '1.05rem', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>{tx.demoSub}</p>
          </div>
          <div className="demo-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', maxWidth: 960, margin: '0 auto' }}>
            <OrbColumn>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <OrbPreview lang={lang} />
                <p style={{ color: 'rgba(240,244,248,0.38)', fontSize: '0.78rem', textAlign: 'center', maxWidth: 240, lineHeight: 1.6, margin: 0 }}>{tx.orbSub}</p>
              </div>
            </OrbColumn>
            <div>
              <DemoForm slug="homepage" lang={lang} strings={tx.form} />
            </div>
          </div>
        </div>
        <style>{`@media (max-width: 720px) { #contact .demo-grid { grid-template-columns: 1fr !important; } }`}</style>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0F172A', color: '#CBD5E1', padding: '40px 0', textAlign: 'center', fontSize: '.85rem' }}>
        <p>{tx.footer}</p>
      </footer>
    </div>
  )
}
