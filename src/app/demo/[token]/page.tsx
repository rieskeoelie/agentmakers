import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { VoiceDemo } from './VoiceDemo'

interface Props {
  params: Promise<{ token: string }>
}

function getDomain(website?: string | null): string {
  if (!website) return ''
  try {
    const url = website.startsWith('http') ? website : `https://${website}`
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return ''
  }
}

function extractDescription(businessInfo?: string | null): string {
  if (!businessInfo) return ''
  const idx = businessInfo.indexOf('Website inhoud:')
  const raw = idx !== -1 ? businessInfo.substring(idx + 15) : businessInfo
  const stripped = raw
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
  return stripped.length > 220 ? stripped.substring(0, 220).trimEnd() + '…' : stripped
}

export default async function DemoPage({ params }: Props) {
  const { token } = await params

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('naam, bedrijfsnaam, website, language, scraped_at, business_info, diensten')
    .eq('demo_token', token)
    .single()

  if (error || !lead) {
    notFound()
  }

  const lang = (lead.language as 'nl' | 'en' | 'es') || 'nl'
  const scraped = !!lead.scraped_at
  const domain = getDomain(lead.website)
  const description = extractDescription(lead.business_info)
  const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : null
  const companyName = lead.bedrijfsnaam || domain || lead.naam

  const strings = {
    nl: {
      powered: 'Demo door',
      headline: 'Zo klinkt uw eigen AI agent',
      sub: 'Speciaal geconfigureerd voor',
      scraping: 'Website wordt geanalyseerd — de agent is zo klaar.',
      start: 'Start gesprek',
      stop: 'Stop gesprek',
      status_connecting: 'Verbinden...',
      status_talking: 'AI agent spreekt...',
      status_listening: 'Luistert...',
      status_ready: 'Klik om te starten',
      scheduled_title: 'Meeting link verstuurd!',
      scheduled_sub: 'Controleer uw inbox voor de persoonlijke Calendly link',
      cta_headline: 'Wil u dit voor uw eigen bedrijf?',
      cta_sub: 'Wij bouwen uw AI agent en gaan binnen 48 uur live.',
      cta_button: 'Boek een gesprek',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
    },
    en: {
      powered: 'Demo by',
      headline: 'This is what your own AI agent sounds like',
      sub: 'Specially configured for',
      scraping: 'Website is being analysed — the agent will be ready shortly.',
      start: 'Start conversation',
      stop: 'Stop conversation',
      status_connecting: 'Connecting...',
      status_talking: 'AI agent speaking...',
      status_listening: 'Listening...',
      status_ready: 'Click to start',
      scheduled_title: 'Meeting link sent!',
      scheduled_sub: 'Check your inbox for your personal Calendly link',
      cta_headline: 'Want this for your own business?',
      cta_sub: 'We build your AI agent and go live within 48 hours.',
      cta_button: 'Book a call',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
    },
    es: {
      powered: 'Demo por',
      headline: 'Así suena su propio agente IA',
      sub: 'Configurado especialmente para',
      scraping: 'Analizando su sitio web — el agente estará listo en breve.',
      start: 'Iniciar conversación',
      stop: 'Detener conversación',
      status_connecting: 'Conectando...',
      status_talking: 'Agente IA hablando...',
      status_listening: 'Escuchando...',
      status_ready: 'Toque para empezar',
      scheduled_title: '¡Enlace de reunión enviado!',
      scheduled_sub: 'Revise su bandeja de entrada para el enlace personal de Calendly',
      cta_headline: '¿Quiere esto para su propio negocio?',
      cta_sub: 'Construimos su agente IA y lo ponemos en marcha en 48 horas.',
      cta_button: 'Reservar una llamada',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
    },
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060B14',
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '-10%',
          width: '65vw', height: '65vw', maxWidth: 750, maxHeight: 750,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(13,148,136,0.2) 0%, transparent 70%)',
          animation: 'floatA 12s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', right: '-10%',
          width: '55vw', height: '55vw', maxWidth: 650, maxHeight: 650,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.16) 0%, transparent 70%)',
          animation: 'floatB 16s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }} />
      </div>

      {/* Page content */}
      <div style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '28px 20px 72px',
      }}>

        {/* Top bar */}
        <div style={{
          width: '100%', maxWidth: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 52,
        }}>
          <span style={{
            fontFamily: "'Poppins', sans-serif",
            fontWeight: 800, fontSize: '1.1rem', color: '#fff', letterSpacing: '-0.5px',
          }}>
            agent<span style={{ color: '#2DD4BF' }}>makers</span>.io
          </span>
          <span style={{
            fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20, padding: '4px 12px',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            AI Demo
          </span>
        </div>

        {/* Hero headline */}
        <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 560, width: '100%' }}>
          <p style={{
            fontSize: '0.72rem', color: '#2DD4BF', fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            {strings[lang].powered} agentmakers.io
          </p>
          <h1 style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 'clamp(1.6rem, 5vw, 2.5rem)',
            fontWeight: 800, lineHeight: 1.15, marginBottom: 12,
            background: 'linear-gradient(135deg, #ffffff 30%, #2DD4BF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {strings[lang].headline}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.95rem' }}>
            {strings[lang].sub}{' '}
            <strong style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
              {companyName}
            </strong>
          </p>
        </div>

        {/* Company card */}
        <div style={{
          width: '100%', maxWidth: 560,
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '20px 24px',
          marginBottom: 40,
          display: 'flex', gap: 18, alignItems: 'flex-start',
        }}>
          {/* Logo box */}
          <div style={{
            flexShrink: 0,
            width: 54, height: 54,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={companyName}
                width={54} height={54}
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 7 }}
              />
            ) : (
              <span style={{
                fontSize: '1.5rem', fontWeight: 800,
                fontFamily: "'Poppins', sans-serif",
                color: '#2DD4BF',
              }}>
                {companyName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Company info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 700, fontSize: '0.97rem', color: '#fff',
              }}>
                {companyName}
              </span>
              {scraped && (
                <span style={{
                  fontSize: '0.62rem', color: '#2DD4BF', fontWeight: 700,
                  background: 'rgba(45,212,191,0.1)',
                  border: '1px solid rgba(45,212,191,0.22)',
                  borderRadius: 20, padding: '2px 8px',
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                }}>
                  ✓ AI-ready
                </span>
              )}
            </div>
            {domain && (
              <a
                href={lead.website?.startsWith('http') ? lead.website : `https://${lead.website}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)',
                  textDecoration: 'none', marginBottom: description ? 8 : 0,
                }}
              >
                🌐 {domain}
              </a>
            )}
            {description && (
              <p style={{
                fontSize: '0.8rem', color: 'rgba(255,255,255,0.48)',
                lineHeight: 1.6, margin: 0,
              }}>
                {description}
              </p>
            )}
            {!scraped && (
              <p style={{ fontSize: '0.76rem', color: '#FCD34D', margin: '6px 0 0' }}>
                ⏳ {strings[lang].scraping}
              </p>
            )}
          </div>
        </div>

        {/* Voice demo */}
        <VoiceDemo
          token={token}
          strings={strings[lang]}
          companyName={companyName}
          logoUrl={logoUrl}
        />

        {/* CTA section */}
        <div style={{ marginTop: 72, textAlign: 'center', maxWidth: 400, width: '100%' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28,
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              of
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <p style={{
            fontFamily: "'Poppins', sans-serif",
            color: '#fff', fontSize: '1.05rem', fontWeight: 700, marginBottom: 6,
          }}>
            {strings[lang].cta_headline}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginBottom: 20 }}>
            {strings[lang].cta_sub}
          </p>
          <a
            href={strings[lang].cta_url}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #0D9488 0%, #2DD4BF 100%)',
              color: '#fff', fontWeight: 700,
              padding: '13px 28px', borderRadius: 12,
              fontSize: '0.92rem', textDecoration: 'none',
              boxShadow: '0 0 28px rgba(45,212,191,0.28)',
            }}
          >
            📅 {strings[lang].cta_button}
          </a>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&family=Inter:wght@400;500;600&display=swap');
        @keyframes floatA {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(3%,5%) scale(1.06); }
        }
        @keyframes floatB {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(-4%,-3%) scale(1.08); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060B14; }
      `}</style>
    </div>
  )
}
