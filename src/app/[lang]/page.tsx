import React from 'react'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { DemoForm } from '@/components/landing/DemoForm'
import { OrbPreview } from '@/components/landing/OrbPreview'
import { OrbColumn } from '@/components/landing/OrbColumn'
import { HeroDashboard } from '@/components/landing/HeroDashboard'
import type { LandingPage } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Lang = 'nl' | 'en' | 'es'

type AgentCard = {
  bg: string; border: string; iconBg: string
  chipBg: string; chipColor: string; dotColor: string
  chip: string; title: string; desc: string
  icon: React.ReactNode
}

const PHONE_IN_ICON = <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.09 9.81 19.79 19.79 0 01.06 1.18 2 2 0 012.03 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
const PHONE_OUT_ICON = <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 7 23 1 17 1"/><line x1="23" y1="1" x2="16" y2="8"/><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.09 9.81 19.79 19.79 0 01.06 1.18 2 2 0 012.03 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
const WA_ICON2 = <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.09.54 4.05 1.486 5.76L0 24l6.395-1.677A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.359-.214-3.8.996 1.013-3.695-.233-.375A9.818 9.818 0 1112 21.818z"/></svg>
const FB_ICON2 = <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
const IG_ICON2 = <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
const MAIL_ICON2 = <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>

function makeAgents(
  chipLabels: { phone: string; messaging: string; social: string; email: string },
  titles: string[],
  descs: string[],
): AgentCard[] {
  return [
    { bg:'linear-gradient(135deg,#F0FDFA,#E6FFFC)', border:'rgba(13,148,136,.15)', iconBg:'linear-gradient(135deg,#0D9488,#14B8A6)', chipBg:'rgba(13,148,136,.12)', chipColor:'#0D9488', dotColor:'#0D9488', chip: chipLabels.phone, title: titles[0], desc: descs[0], icon: PHONE_IN_ICON },
    { bg:'linear-gradient(135deg,#ECFEFF,#E0F9FF)', border:'rgba(6,182,212,.18)',  iconBg:'linear-gradient(135deg,#0891B2,#22D3EE)', chipBg:'rgba(6,182,212,.12)',  chipColor:'#0891B2', dotColor:'#0891B2', chip: chipLabels.phone, title: titles[1], desc: descs[1], icon: PHONE_OUT_ICON },
    { bg:'linear-gradient(135deg,#F0FDF4,#DCFCE7)', border:'rgba(22,163,74,.18)',  iconBg:'linear-gradient(135deg,#16A34A,#22C55E)', chipBg:'rgba(22,163,74,.12)',  chipColor:'#16A34A', dotColor:'#16A34A', chip: chipLabels.messaging, title: titles[2], desc: descs[2], icon: WA_ICON2 },
    { bg:'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border:'rgba(29,78,216,.15)',  iconBg:'linear-gradient(135deg,#1D4ED8,#3B82F6)', chipBg:'rgba(29,78,216,.1)',   chipColor:'#1D4ED8', dotColor:'#1D4ED8', chip: chipLabels.social,   title: titles[3], desc: descs[3], icon: FB_ICON2 },
    { bg:'linear-gradient(135deg,#FFF1F9,#F5E0FF)', border:'rgba(219,39,119,.15)', iconBg:'linear-gradient(135deg,#C026D3,#DB2777,#F97316)', chipBg:'rgba(219,39,119,.1)', chipColor:'#BE185D', dotColor:'#DB2777', chip: chipLabels.social, title: titles[4], desc: descs[4], icon: IG_ICON2 },
    { bg:'linear-gradient(135deg,#F5F3FF,#EDE9FE)', border:'rgba(99,102,241,.15)', iconBg:'linear-gradient(135deg,#4F46E5,#818CF8)', chipBg:'rgba(99,102,241,.1)',  chipColor:'#4F46E5', dotColor:'#6366F1', chip: chipLabels.email,  title: titles[5], desc: descs[5], icon: MAIL_ICON2 },
  ]
}

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
    h1a: 'Elke oproep beantwoord.',
    h1em: 'Elke afspraak ingeboekt.',
    h1b: '24/7. Met uw eigen AI agents.',
    sub: 'Wij bouwen AI agents die uw telefoon beantwoorden, afspraken inboeken en klanten helpen 24/7, in elke branche.',
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
      ['4', '48 uur live', 'Uw AI agents draaien binnen 48 uur 24/7, zonder onderbreking.'],
    ],
    demoBadge: 'Gratis demo',
    demoH2: 'Zie direct uw AI receptioniste in actie',
    demoSub: 'Vul het formulier in en ontvang direct de link naar de demo via de mail. De agent neemt op met uw bedrijfsnaam, en staat u vriendelijk te woord.',
    orbSub: 'Vul snel het formulier in en beluister de AI voice agent in actie.',
    form: {
      cta_headline: '',
      cta_sub: '',
      name: 'Uw naam', email: 'E-mailadres', phone: 'Telefoonnummer',
      website: 'Website (optioneel)', company: 'Bedrijfsnaam',
      submit: 'Stuur mij de demo link', sending: 'Even geduld…',
      error: 'Probeer het opnieuw', success: 'Uw demo is onderweg!',
      success_sub: 'Check uw inbox voor de persoonlijke demo-link.\n\nDe AI receptioniste is al geconfigureerd op uw bedrijf.',
      trust: 'Geen verplichtingen. Gratis. Binnen 2 minuten in uw inbox.',
      diensten_label: '',
    },
    agentsLabel: 'Onze AI Agents',
    agentsH2: 'Eén agent voor elk kanaal',
    agentsSub: 'Elk contactmoment geautomatiseerd via telefoon, chat, e-mail en social media.',
    agents: makeAgents(
      { phone: 'Telefonie', messaging: 'Messaging', social: 'Social Media', email: 'E-mail' },
      ['AI Voice Agent: Inbound','AI Voice Agent: Outbound','WhatsApp & SMS Agent','Facebook Messenger Agent','Instagram DM Agent','E-mail Agent'],
      [
        'Beantwoordt elke inkomende oproep, beantwoordt vragen en boekt afspraken direct in uw agenda. 24/7 bereikbaar.',
        'Belt klanten terug, bevestigt afspraken en volgt no-shows op met een persoonlijk herinneringsgesprek.',
        'Beantwoordt berichten 24/7, verstuurt afspraakherinneringen en plant behandelingen in via WhatsApp of SMS.',
        'Reageert op berichten via Facebook, beantwoordt vragen en stuurt geïnteresseerden door naar een afspraak.',
        'Verwerkt DMs en reacties op Instagram automatisch en zet geïnteresseerde volgers om in ingeplande afspraken.',
        'Beantwoordt e-mails automatisch, verwerkt aanvragen en stuurt bevestigingen en herinneringen naar klanten.',
      ],
    ),
    footer: '© 2026 agentmakers.io. Alle rechten voorbehouden.',
    descField: 'meta_description_nl',
  },
  en: {
    badge: 'AI Agents tailored for your industry',
    h1a: 'Every call answered.',
    h1em: 'Every appointment booked.',
    h1b: '24/7. With your own AI agents.',
    sub: 'We build AI agents that answer your phone, book appointments and help customers 24/7, in every industry.',
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
      ['4', 'Live in 48h', 'Your AI agents are running within 48 hours 24/7, without interruption.'],
    ],
    demoBadge: 'Free demo',
    demoH2: 'See your AI receptionist in action instantly',
    demoSub: 'Your business is closed thousands of hours per year. See how your AI receptionist fills your calendar during those hours.',
    orbSub: 'Fill in the form quickly and listen to the AI voice agent in action.',
    form: {
      cta_headline: '',
      cta_sub: '',
      name: 'Your name', email: 'Email address', phone: 'Phone number',
      website: 'Website (optional)', company: 'Company name',
      submit: 'Send me the demo link', sending: 'Please wait…',
      error: 'Please try again', success: 'Your demo is on its way!',
      success_sub: 'Check your inbox for the personal demo link.\n\nThe AI receptionist is already configured for your business.',
      trust: 'No obligations. Free. In your inbox within 2 minutes.',
      diensten_label: '',
    },
    agentsLabel: 'Our AI Agents',
    agentsH2: 'One agent for every channel',
    agentsSub: 'Every customer touchpoint automated via phone, chat, email and social media.',
    agents: makeAgents(
      { phone: 'Telephony', messaging: 'Messaging', social: 'Social Media', email: 'Email' },
      ['AI Voice Agent: Inbound','AI Voice Agent: Outbound','WhatsApp & SMS Agent','Facebook Messenger Agent','Instagram DM Agent','Email Agent'],
      [
        'Answers every incoming call, answers questions and books appointments directly in your calendar. Available 24/7.',
        'Calls customers back, confirms appointments and follows up on no-shows with a personal reminder call.',
        'Answers messages 24/7, sends appointment reminders and schedules treatments via WhatsApp or SMS.',
        'Responds to messages via Facebook, answers questions and guides interested visitors to book an appointment.',
        'Automatically processes Instagram DMs and comments, turning interested followers into scheduled appointments.',
        'Automatically answers emails, processes enquiries and sends confirmations and reminders to customers.',
      ],
    ),
    footer: '© 2026 agentmakers.io. All rights reserved.',
    descField: 'meta_description_en',
  },
  es: {
    badge: 'Agentes de IA para su sector',
    h1a: 'Cada llamada atendida.',
    h1em: 'Cada cita reservada.',
    h1b: '24/7. Con sus propios agentes de IA.',
    sub: 'Creamos agentes de IA que responden su teléfono, reservan citas y ayudan a clientes 24/7, en cualquier sector.',
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
      ['4', 'En directo en 48h', 'Sus agentes de IA funcionan en 48 horas 24/7, sin interrupciones.'],
    ],
    demoBadge: 'Demo gratuita',
    demoH2: 'Vea su recepcionista de IA en acción',
    demoSub: 'Su empresa está cerrada miles de horas al año. Vea cómo su recepcionista de IA llena su agenda durante esas horas.',
    orbSub: 'Rellene el formulario rápidamente y escuche al agente de voz de IA en acción.',
    form: {
      cta_headline: '',
      cta_sub: '',
      name: 'Su nombre', email: 'Correo electrónico', phone: 'Número de teléfono',
      website: 'Sitio web (opcional)', company: 'Nombre de empresa',
      submit: 'Envíame el enlace de demo', sending: 'Un momento…',
      error: 'Inténtelo de nuevo', success: '¡Su demo está en camino!',
      success_sub: 'Revise su bandeja de entrada para el enlace de demo personal.\n\nEl recepcionista de IA ya está configurado para su empresa.',
      trust: 'Sin compromiso. Gratis. En su bandeja en 2 minutos.',
      diensten_label: '',
    },
    agentsLabel: 'Nuestros Agentes de IA',
    agentsH2: 'Un agente para cada canal',
    agentsSub: 'Cada contacto automatizado por teléfono, chat, correo y redes sociales.',
    agents: makeAgents(
      { phone: 'Telefonía', messaging: 'Mensajería', social: 'Social Media', email: 'E-mail' },
      ['Agente de Voz: Entrante','Agente de Voz: Saliente','Agente WhatsApp & SMS','Agente Facebook Messenger','Agente Instagram DM','Agente de E-mail'],
      [
        'Responde cada llamada entrante, contesta preguntas y reserva citas directamente en su agenda. Disponible 24/7.',
        'Llama a los clientes, confirma citas y hace seguimiento de ausencias con una llamada de recordatorio personalizada.',
        'Responde mensajes 24/7, envía recordatorios de citas y gestiona reservas por WhatsApp o SMS.',
        'Responde mensajes de Facebook, contesta preguntas y guía a los interesados hacia una cita.',
        'Procesa automáticamente los DMs y comentarios de Instagram y convierte seguidores en citas programadas.',
        'Responde correos automáticamente, gestiona solicitudes y envía confirmaciones y recordatorios a los clientes.',
      ],
    ),
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
            <a className="nav-link" href="/ai-agents" style={{ fontWeight: 600, color: '#0D9488', fontSize: '.9rem', textDecoration: 'none' }}>AI Agents</a>
            <div className="nav-flags" style={{ display: 'flex', gap: 8 }}>
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
          <div className="hero-grid">
            {/* LEFT */}
            <div>
              <div style={{ display: 'inline-block', background: 'rgba(13,148,136,.1)', color: '#0F766E', padding: '6px 16px', borderRadius: 100, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em', marginBottom: 24 }}>
                {tx.badge}
              </div>
              <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.6rem, 2.8vw, 2.3rem)', fontWeight: 700, lineHeight: 1.18, marginBottom: 20 }}>
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

      {/* AGENTS / CHANNELS */}
      <section className="sp" style={{ background: '#F8FAFC' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', color: '#0D9488', fontWeight: 700, fontSize: '.78rem', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 12 }}>{tx.agentsLabel}</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 14, color: '#0F172A' }}>{tx.agentsH2}</h2>
            <p style={{ color: '#64748B', fontSize: '1.05rem', maxWidth: 540, margin: '0 auto', lineHeight: 1.7 }}>{tx.agentsSub}</p>
          </div>
          <div className="grid-3col">
            {tx.agents.map(({ bg, border, iconBg, chipBg, chipColor, dotColor, chip, title, desc, icon }: AgentCard) => (
              <div key={title} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 18, padding: '28px 26px 24px', transition: 'transform .25s, box-shadow .25s' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>{icon}</div>
                <h3 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>{title}</h3>
                <p style={{ fontSize: '.9rem', color: '#475569', lineHeight: 1.65, marginBottom: 20 }}>{desc}</p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: chipBg, borderRadius: 100, padding: '5px 13px', fontSize: '.72rem', fontWeight: 700, color: chipColor, letterSpacing: '.04em' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />{chip}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="sp" style={{ background: '#fff' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>{tx.howLabel}</div>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#0F172A', fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>{tx.howH2}</h2>
          <p style={{ color: '#64748B', fontSize: '1.05rem', maxWidth: 560, margin: '0 auto 56px' }}>{tx.howSub}</p>
          <div className="grid-4col">
            {tx.steps.map(([num, title, desc]) => (
              <div key={num} style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>{num}</div>
                <h3 style={{ fontFamily: "'Nunito',sans-serif", color: '#0F172A', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: '.88rem', color: '#64748B', maxWidth: 220, margin: '0 auto' }}>{desc}</p>
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
            <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', lineHeight: 1.15, marginBottom: 20, maxWidth: 700, marginLeft: 'auto', marginRight: 'auto' }}>{tx.demoH2}</h2>
            <p style={{ color: 'rgba(240,244,248,0.55)', fontSize: '1.05rem', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>{tx.demoSub}</p>
          </div>
          <div className="demo-grid">
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
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0F172A', color: '#CBD5E1', padding: '40px 0', textAlign: 'center', fontSize: '.85rem' }}>
        <p>{tx.footer}</p>
      </footer>
    </div>
  )
}
