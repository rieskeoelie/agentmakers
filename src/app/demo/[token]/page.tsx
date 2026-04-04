import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { VoiceDemo } from './VoiceDemo'

interface Props {
  params: Promise<{ token: string }>
}

export default async function DemoPage({ params }: Props) {
  const { token } = await params

  // Fetch lead by token
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('naam, bedrijfsnaam, website, language, scraped_at')
    .eq('demo_token', token)
    .single()

  if (error || !lead) {
    notFound()
  }

  const lang = (lead.language as 'nl' | 'en' | 'es') || 'nl'
  const scraped = !!lead.scraped_at

  const strings = {
    nl: {
      headline: `Uw persoonlijke AI demo`,
      sub: `Hallo ${lead.naam}! Uw AI agent is klaar. Klik op de knop om een gesprek te starten.`,
      scraping: 'Uw website wordt geanalyseerd — de agent weet straks alles over uw bedrijf.',
      start: '🎤 Start gesprek',
      stop: '⏹ Stop gesprek',
      status_connecting: 'Verbinden...',
      status_talking: 'AI agent praat...',
      status_listening: 'Luisteren...',
      status_ready: 'Klaar om te starten',
      cta_headline: 'Klaar om te beginnen?',
      cta_sub: 'Boek een persoonlijk gesprek met ons team en ga binnen 48 uur live.',
      cta_button: '📅 Boek een demo gesprek',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
    },
    en: {
      headline: `Your personal AI demo`,
      sub: `Hello ${lead.naam}! Your AI agent is ready. Click the button to start a conversation.`,
      scraping: 'Your website is being analysed — the agent will soon know all about your business.',
      start: '🎤 Start conversation',
      stop: '⏹ Stop conversation',
      status_connecting: 'Connecting...',
      status_talking: 'AI agent speaking...',
      status_listening: 'Listening...',
      status_ready: 'Ready to start',
      cta_headline: 'Ready to get started?',
      cta_sub: 'Book a personal call with our team and go live within 48 hours.',
      cta_button: '📅 Book a demo call',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
    },
    es: {
      headline: `Su demo de IA personal`,
      sub: `¡Hola ${lead.naam}! Su agente IA está listo. Haga clic para iniciar una conversación.`,
      scraping: 'Se está analizando su sitio web — el agente pronto sabrá todo sobre su empresa.',
      start: '🎤 Iniciar conversación',
      stop: '⏹ Detener conversación',
      status_connecting: 'Conectando...',
      status_talking: 'Agente IA hablando...',
      status_listening: 'Escuchando...',
      status_ready: 'Listo para empezar',
      cta_headline: '¿Listo para empezar?',
      cta_sub: 'Reserve una llamada personal con nuestro equipo y comience en 48 horas.',
      cta_button: '📅 Reservar una llamada',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
    },
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0F172A 0%, #134E4A 50%, #0D9488 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'Nunito', 'Inter', sans-serif",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 40, opacity: 0.9 }}>
        <span
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontWeight: 800,
            fontSize: '1.4rem',
            color: '#fff',
            letterSpacing: '-0.5px',
          }}
        >
          agent<span style={{ color: '#2DD4BF' }}>makers</span>.io
        </span>
      </div>

      {/* Main card */}
      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 24,
          padding: '48px 40px',
          maxWidth: 560,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
        }}
      >
        <h1
          style={{
            fontFamily: "'Poppins', sans-serif",
            color: '#fff',
            fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
            fontWeight: 700,
            marginBottom: 16,
            lineHeight: 1.2,
          }}
        >
          {strings[lang].headline}
        </h1>

        <p style={{ color: '#CCFBF1', fontSize: '1.05rem', marginBottom: 40, lineHeight: 1.6 }}>
          {strings[lang].sub}
        </p>

        {!scraped && (
          <div
            style={{
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 32,
              color: '#FCD34D',
              fontSize: '0.85rem',
            }}
          >
            ⏳ {strings[lang].scraping}
          </div>
        )}

        <VoiceDemo token={token} strings={strings[lang]} />
      </div>

      {/* CTA below card */}
      <div style={{ marginTop: 48, textAlign: 'center', maxWidth: 480 }}>
        <h3
          style={{
            fontFamily: "'Poppins', sans-serif",
            color: '#fff',
            fontSize: '1.3rem',
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          {strings[lang].cta_headline}
        </h3>
        <p style={{ color: '#CCFBF1', marginBottom: 24, fontSize: '0.95rem' }}>
          {strings[lang].cta_sub}
        </p>
        <a
          href={strings[lang].cta_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            background: '#fff',
            color: '#0D9488',
            fontWeight: 800,
            padding: '16px 36px',
            borderRadius: 12,
            fontSize: '1rem',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            transition: 'transform 0.15s',
          }}
        >
          {strings[lang].cta_button}
        </a>
      </div>
    </div>
  )
}
