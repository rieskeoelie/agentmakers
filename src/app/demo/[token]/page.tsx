import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { VoiceDemo } from './VoiceDemo'
import { HeroSection } from './HeroSection'
import { TipsCard } from './TipsCard'

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
  const lines = raw
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+[^\n]*/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\|[^\n]*/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 45 && !/^http/i.test(l))
  const joined = lines.slice(0, 4).join(' ').trim()
  return joined.length > 280 ? joined.substring(0, 280).trimEnd() + '…' : joined
}

async function checkLogoUrl(domain: string): Promise<string | null> {
  if (!domain) return null
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`https://logo.clearbit.com/${domain}`, {
      method: 'HEAD',
      signal: controller.signal,
    })
    clearTimeout(t)
    return res.ok ? `https://logo.clearbit.com/${domain}` : null
  } catch {
    return null
  }
}

export default async function DemoPage({ params }: Props) {
  const { token } = await params

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('naam, bedrijfsnaam, website, language, scraped_at, business_info')
    .eq('demo_token', token)
    .single()

  if (error || !lead) notFound()

  const lang = (lead.language as 'nl' | 'en' | 'es') || 'nl'
  const scraped = !!lead.scraped_at
  const domain = getDomain(lead.website)
  const description = extractDescription(lead.business_info)
  const logoUrl = await checkLogoUrl(domain)
  const companyName = lead.bedrijfsnaam || domain || lead.naam
  const websiteHref = lead.website?.startsWith('http') ? lead.website : `https://${lead.website}`

  const strings = {
    nl: {
      eyebrow: 'Persoonlijke AI demo',
      headline: `AI receptioniste voor\n${companyName}`,
      for: 'Deze receptioniste is voor deze demo getraind op uw website. Zodra ze is getraind met echte data en gekoppeld met uw agenda verandert ze in een volwaardige medewerkster die 24/7 vriendelijk mensen te woord staat.',
      aiReady: 'AI-ready',
      notReady: 'Wordt voorbereid…',
      start: 'Start gesprek',
      stop: 'Stop gesprek',
      status_connecting: 'Verbinden…',
      status_talking: 'Spreekt…',
      status_listening: 'Luistert…',
      status_ready: 'Tik om te starten',
      scheduled_title: 'Meeting link verstuurd!',
      scheduled_sub: 'Check uw inbox voor de persoonlijke Calendly link',
      cta: 'Wil u dit voor uw bedrijf?',
      cta_sub: 'Live binnen 48 uur.',
      cta_btn: 'Plan een gesprek',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
      cta_heading: `Bestel deze AI agent voor ${companyName}`,
      cta_disclaimer: 'U zit nergens aan vast, het gesprek is vrijblijvend.',
      tips_title: 'Wat kunt u doen?',
      tips: [
        `Vraag wat ${companyName} precies doet`,
        'Stel vragen over diensten of prijzen',
        'Vraag hoe het proces werkt',
        'Plan direct een afspraak in het gesprek',
      ],
      tips_note: 'Aan het einde stuurt de agent u een persoonlijke meeting link.',
      configured_for: 'Geconfigureerd voor',
    },
    en: {
      eyebrow: 'Personal AI demo',
      headline: `AI receptionist for\n${companyName}`,
      for: 'This receptionist has been trained on your website for this demo. Once trained with real data and connected to your calendar, she becomes a full-time team member available 24/7 to answer calls in a friendly manner.',
      aiReady: 'AI-ready',
      notReady: 'Preparing…',
      start: 'Start conversation',
      stop: 'Stop conversation',
      status_connecting: 'Connecting…',
      status_talking: 'Speaking…',
      status_listening: 'Listening…',
      status_ready: 'Tap to start',
      scheduled_title: 'Meeting link sent!',
      scheduled_sub: 'Check your inbox for your personal Calendly link',
      cta: 'Want this for your business?',
      cta_sub: 'Live within 48 hours.',
      cta_btn: 'Book a call',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
      cta_heading: `Order this AI agent for ${companyName}`,
      cta_disclaimer: 'No commitment — the call is completely free.',
      tips_title: 'What can you do?',
      tips: [
        `Ask what ${companyName} does`,
        'Ask about services or pricing',
        'Ask how the process works',
        'Book a meeting directly in the conversation',
      ],
      tips_note: 'At the end, the agent will send you a personal meeting link.',
      configured_for: 'Configured for',
    },
    es: {
      eyebrow: 'Demo de IA personal',
      headline: `IA recepcionista de\n${companyName}`,
      for: 'Esta recepcionista ha sido entrenada en su sitio web para esta demo. Una vez entrenada con datos reales y conectada a su agenda, se convierte en una empleada disponible 24/7 para atender llamadas con amabilidad.',
      aiReady: 'IA-ready',
      notReady: 'Preparando…',
      start: 'Iniciar conversación',
      stop: 'Detener conversación',
      status_connecting: 'Conectando…',
      status_talking: 'Hablando…',
      status_listening: 'Escuchando…',
      status_ready: 'Toque para empezar',
      scheduled_title: '¡Enlace de reunión enviado!',
      scheduled_sub: 'Revise su bandeja de entrada para el enlace de Calendly',
      cta: '¿Quiere esto para su empresa?',
      cta_sub: 'En marcha en 48 horas.',
      cta_btn: 'Reservar una llamada',
      cta_url: 'https://calendly.com/agentmakersdemo/30min',
      cta_heading: `Pida este agente de IA para ${companyName}`,
      cta_disclaimer: 'Sin compromiso, la llamada es completamente gratuita.',
      tips_title: '¿Qué puede hacer?',
      tips: [
        `Pregunte qué hace ${companyName}`,
        'Consulte sobre servicios o precios',
        'Pregunte cómo funciona el proceso',
        'Reserve una cita directamente en la conversación',
      ],
      tips_note: 'Al final, el agente le enviará un enlace personal de reunión.',
      configured_for: 'Configurado para',
    },
  }

  const s = strings[lang]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #07101E; }

        .demo-page {
          min-height: 100svh;
          background: #07101E;
          font-family: 'Inter', system-ui, sans-serif;
          color: #F0F4F8;
          position: relative;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* ── Background ── */
        .bg-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }
        .bg-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
        }
        .bg-blob-1 {
          width: 70vw; height: 70vw;
          max-width: 700px; max-height: 700px;
          top: -25%; left: -20%;
          background: radial-gradient(circle, rgba(13,148,136,0.22) 0%, transparent 70%);
          animation: blobDrift 18s ease-in-out infinite;
        }
        .bg-blob-2 {
          width: 60vw; height: 60vw;
          max-width: 620px; max-height: 620px;
          bottom: -20%; right: -15%;
          background: radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%);
          animation: blobDrift 22s ease-in-out 4s infinite reverse;
        }
        .bg-blob-3 {
          width: 40vw; height: 40vw;
          max-width: 480px; max-height: 480px;
          top: 45%; left: 55%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(20,184,166,0.1) 0%, transparent 70%);
          animation: blobDrift 28s ease-in-out 8s infinite;
        }
        .bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%);
        }
        @keyframes blobDrift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%  { transform: translate(3%, 5%) scale(1.06); }
          66%  { transform: translate(-2%, -3%) scale(0.97); }
        }

        /* ── Content shell ── */
        .content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 960px;
          padding: 28px 24px 80px;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0;
        }

        /* ── Top bar ── */
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 48px;
        }
        .logo-wordmark {
          font-family: 'Poppins', sans-serif;
          font-weight: 800;
          font-size: 1.05rem;
          color: #fff;
          letter-spacing: -0.03em;
        }
        .logo-wordmark span { color: #2DD4BF; }
        .demo-badge {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 100px;
          padding: 5px 13px;
        }

        /* ── Hero ── */
        .hero {
          text-align: center;
          margin-bottom: 48px;
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2DD4BF;
          margin-bottom: 18px;
        }
        .eyebrow-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #2DD4BF;
          animation: dotPulse 2.5s ease-in-out infinite;
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        .headline {
          font-family: 'Poppins', sans-serif;
          font-weight: 800;
          font-size: clamp(2rem, 5vw, 2.9rem);
          line-height: 1.1;
          letter-spacing: -0.03em;
          margin-bottom: 14px;
          background: linear-gradient(160deg, #ffffff 0%, #ffffff 50%, #7EEEDE 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          white-space: pre-line;
        }
        .hero-sub {
          font-size: 0.93rem;
          color: rgba(240,244,248,0.45);
          font-weight: 400;
          max-width: 580px;
          margin: 0 auto;
          line-height: 1.65;
        }

        /* ── Main two-column grid ── */
        .main-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 28px;
          align-items: start;
          margin-bottom: 60px;
        }
        @media (max-width: 720px) {
          .main-grid {
            grid-template-columns: 1fr;
          }
          .left-col { order: 2; }
          .right-col { order: 1; }
        }

        /* ── Left column ── */
        .left-col {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* ── Company card ── */
        .company-card {
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.08);
          border-top: 1px solid rgba(45,212,191,0.22);
          border-radius: 20px;
          padding: 24px;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.05) inset,
            0 24px 48px rgba(0,0,0,0.28);
          position: relative;
          overflow: hidden;
        }
        .company-card::before {
          content: '';
          position: absolute;
          top: 0; left: 24px; right: 24px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(45,212,191,0.35), transparent);
        }

        .company-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 16px;
        }
        .company-logo-wrap {
          flex-shrink: 0;
          width: 56px; height: 56px;
          border-radius: 14px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .company-logo-wrap img {
          width: 100%; height: 100%;
          object-fit: contain;
          padding: 8px;
        }
        .company-logo-fallback {
          font-family: 'Poppins', sans-serif;
          font-weight: 800;
          font-size: 1.5rem;
          color: #2DD4BF;
          line-height: 1;
        }

        .company-meta { flex: 1; min-width: 0; }
        .company-name {
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 1rem;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }
        .company-badges {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .ai-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.58rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #2DD4BF;
          background: rgba(45,212,191,0.1);
          border: 1px solid rgba(45,212,191,0.2);
          border-radius: 100px;
          padding: 3px 9px;
          white-space: nowrap;
        }
        .ai-badge-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #2DD4BF;
          animation: dotPulse 2.5s ease-in-out infinite;
        }
        .ai-badge-wait {
          color: #FCD34D;
          background: rgba(252,211,77,0.1);
          border-color: rgba(252,211,77,0.2);
        }

        .company-divider {
          width: 100%;
          height: 1px;
          background: rgba(255,255,255,0.06);
          margin-bottom: 14px;
        }

        .company-domain-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.72rem;
          color: rgba(240,244,248,0.32);
          text-decoration: none;
          margin-bottom: 12px;
          transition: color 0.2s;
        }
        .company-domain-link:hover { color: rgba(240,244,248,0.6); }

        .company-desc {
          font-size: 0.8rem;
          color: rgba(240,244,248,0.45);
          line-height: 1.7;
        }

        /* ── Tips card ── */
        .tips-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          padding: 22px 24px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.2);
        }
        .tips-title {
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 0.82rem;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }
        .tips-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .tip-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 0.82rem;
          color: rgba(240,244,248,0.65);
          line-height: 1.45;
        }
        .tip-icon {
          flex-shrink: 0;
          margin-top: 1px;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: rgba(45,212,191,0.1);
          border: 1px solid rgba(45,212,191,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.55rem;
          color: #2DD4BF;
          font-weight: 900;
        }
        .tips-note {
          font-size: 0.74rem;
          color: rgba(240,244,248,0.3);
          line-height: 1.55;
          border-top: 1px solid rgba(255,255,255,0.05);
          padding-top: 13px;
        }
        .tips-note-icon {
          display: inline;
          margin-right: 4px;
          font-style: normal;
        }

        /* ── Right column ── */
        .right-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding-top: 8px;
        }

        /* ── Divider ── */
        .divider {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
        }
        .divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.07);
        }
        .divider-text {
          font-size: 0.68rem;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        /* ── CTA ── */
        .cta-section {
          text-align: center;
        }
        .cta-heading {
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 1.05rem;
          color: #fff;
          margin-bottom: 6px;
        }
        .cta-sub {
          font-size: 0.83rem;
          color: rgba(240,244,248,0.38);
          margin-bottom: 20px;
        }
        .cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #0D9488 0%, #2DD4BF 100%);
          color: #fff;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 0.9rem;
          padding: 13px 30px;
          border-radius: 12px;
          text-decoration: none;
          letter-spacing: -0.01em;
          box-shadow:
            0 0 0 1px rgba(45,212,191,0.3),
            0 8px 24px rgba(13,148,136,0.35);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .cta-btn:hover {
          transform: translateY(-1px);
          box-shadow:
            0 0 0 1px rgba(45,212,191,0.4),
            0 12px 32px rgba(13,148,136,0.45);
        }
      `}</style>

      <div className="demo-page">
        {/* Background */}
        <div className="bg-layer">
          <div className="bg-blob bg-blob-1" />
          <div className="bg-blob bg-blob-2" />
          <div className="bg-blob bg-blob-3" />
          <div className="bg-grid" />
        </div>

        {/* Content */}
        <div className="content">

          {/* Top bar */}
          <div className="topbar">
            <span className="logo-wordmark">agent<span>makers</span>.io</span>
            <span className="demo-badge">AI Demo</span>
          </div>

          {/* Hero */}
          <HeroSection eyebrow={s.eyebrow} headline={s.headline} sub={s.for} />

          {/* Main two-column grid */}
          <div className="main-grid">

            {/* ── Left column: company info + tips ── */}
            <div className="left-col">

              {/* Company card */}
              <div className="company-card">
                <div className="company-header">
                  <div className="company-logo-wrap">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt={companyName} />
                    ) : (
                      <span className="company-logo-fallback">
                        {companyName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="company-meta">
                    <div className="company-name">{companyName}</div>
                    <div className="company-badges">
                      {scraped ? (
                        <span className="ai-badge">
                          <span className="ai-badge-dot" />
                          {s.aiReady}
                        </span>
                      ) : (
                        <span className="ai-badge ai-badge-wait">
                          {s.notReady}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="company-divider" />

                {domain && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="company-domain-link"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M10 2L2 10M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {domain}
                  </a>
                )}

                {description ? (
                  <p className="company-desc">{description}</p>
                ) : (
                  <p className="company-desc" style={{ color: 'rgba(240,244,248,0.2)', fontStyle: 'italic' }}>
                    {scraped ? '' : s.notReady}
                  </p>
                )}
              </div>

              {/* Tips card */}
              <TipsCard title={s.tips_title} tips={s.tips} note={s.tips_note} />

            </div>

            {/* ── Right column: voice orb ── */}
            <div className="right-col">
              <VoiceDemo
                token={token}
                strings={s}
                companyName={companyName}
                logoUrl={logoUrl}
                lang={lang}
              />
            </div>

          </div>

          {/* CTA */}
          <div className="divider">
            <div className="divider-line" />
            <span className="divider-text">{lang === 'nl' ? 'of' : lang === 'es' ? 'o' : 'or'}</span>
            <div className="divider-line" />
          </div>
          <div className="cta-section">
            <p className="cta-heading">{s.cta}</p>
            <p className="cta-sub">{s.cta_sub}</p>
            <a href={s.cta_url} target="_blank" rel="noopener noreferrer" className="cta-btn">
              📅 {s.cta_btn}
            </a>
          </div>

        </div>
      </div>
    </>
  )
}
