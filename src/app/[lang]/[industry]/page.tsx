import { notFound } from 'next/navigation'
import Image from 'next/image'
import { supabaseAdmin } from '@/lib/supabase'
import { t, SUPPORTED_LANGS, LANG_LABELS, type Lang } from '@/lib/i18n'
import { DemoForm } from '@/components/landing/DemoForm'
import { TrackView } from '@/components/landing/TrackView'
import { RevenueCalculator } from '@/components/landing/RevenueCalculator'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ lang: string; industry: string }>
}

async function getPage(slug: string) {
  const { data } = await supabaseAdmin
    .from('landing_pages')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'live')
    .single()
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, industry } = await params
  const page = await getPage(industry)
  if (!page) return { title: 'agentmakers.io' }
  const l = (lang as Lang) in SUPPORTED_LANGS ? (lang as Lang) : 'nl'
  return {
    title: page[`title_${l}`] || page.title_nl,
    description: page[`meta_description_${l}`] || page.meta_description_nl,
    alternates: {
      languages: {
        nl: `/nl/${industry}`,
        en: `/en/${industry}`,
        es: `/es/${industry}`,
      },
    },
  }
}

export default async function LandingPage({ params }: Props) {
  const { lang, industry } = await params

  if (!SUPPORTED_LANGS.includes(lang as Lang)) notFound()
  const l = lang as Lang

  const page = await getPage(industry)
  if (!page) notFound()

  const content = page[`body_content_${l}`] || page.body_content_nl || {}
  const headline = page[`hero_headline_${l}`] || page.hero_headline_nl
  const subline = page[`hero_subline_${l}`] || page.hero_subline_nl
  const heroImg = page.hero_image_url

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", color: '#334155', background: '#fff' }}>
      <TrackView slug={industry} lang={l} />

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #F1F5F9', padding: '16px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <Image src="/logo-transparent.png" alt="agentmakers.io" width={686} height={108} style={{ height: 36, width: 'auto' }} priority />
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Language switcher */}
            <div style={{ display: 'flex', gap: 6 }}>
              {SUPPORTED_LANGS.map((lng) => (
                <a key={lng} href={`/${lng}/${industry}`}
                  style={{ fontSize: '1.2rem', opacity: lng === l ? 1 : .5, textDecoration: 'none', transition: 'opacity .2s' }}
                  title={LANG_LABELS[lng]}>
                  {lng === 'nl' ? '🇳🇱' : lng === 'en' ? '🇬🇧' : '🇪🇸'}
                </a>
              ))}
            </div>
            <a href="#demo" style={{ background: '#0D9488', color: '#fff', padding: '10px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '.9rem' }}>
              {t(l, 'nav_demo')}
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'flex-start', backgroundImage: `url('${heroImg}')`, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(15,23,42,.88) 0%, rgba(15,23,42,.75) 50%, rgba(13,148,136,.4) 100%)' }} />
        <div style={{ maxWidth: 'none', padding: '0 8vw', paddingTop: 'clamp(120px, 18vh, 180px)', width: '100%', position: 'relative', zIndex: 2, display: 'block' }}>
          <div style={{ maxWidth: 620 }}>
            <div style={{ display: 'inline-block', background: 'rgba(13,148,136,.15)', color: '#CCFBF1', padding: '6px 16px', borderRadius: 100, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em', marginBottom: 24 }}>
              {content.hero_badge || t(l, 'hero_badge')}
            </div>
            <h1
              style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: '#fff', lineHeight: 1.15, marginBottom: 24, fontWeight: 700 }}
              dangerouslySetInnerHTML={{ __html: (headline || '').replace(/<em>/g, '<em style="font-style:normal;color:#CCFBF1;">') }}
            />
            <p style={{ color: '#fff', fontSize: '1.15rem', marginBottom: 36, maxWidth: 540 }}>{subline}</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a href="#demo" style={{ background: '#0D9488', color: '#fff', padding: '16px 32px', borderRadius: 10, fontWeight: 600, fontSize: '1rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {t(l, 'cta_label')}
              </a>
              <a href="#hoe-het-werkt" style={{ color: '#fff', padding: '16px 32px', border: '1.5px solid rgba(255,255,255,.25)', borderRadius: 10, fontWeight: 600, fontSize: '1rem', textDecoration: 'none' }}>
                {l === 'nl' ? 'Bekijk hoe het werkt' : l === 'en' ? 'See how it works' : 'Ver cómo funciona'}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEEM */}
      <section style={{ padding: '100px 0', background: '#F1F5F9' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
          <div>
            <div style={{ color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>{t(l, 'problem_label')}</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 20, lineHeight: 1.2 }}>
              {content.problem_headline || headline}
            </h2>
            <p style={{ color: '#0F172A', fontSize: '1.15rem', marginBottom: 32 }}>
              {content.problem_body || subline}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(content.timeline || []).map((item: { time: string; scenario: string }, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, background: '#fff', padding: '20px 24px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: i < 2 ? '#FEE2E2' : '#FEF3C7', color: i < 2 ? '#EF4444' : '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {i === 0 && <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>}
                    {i === 1 && <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
                    {i === 2 && <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                  </div>
                  <div>
                    <h4 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.08rem', fontWeight: 600, color: '#0F172A' }}>{item.time}</h4>
                    <p style={{ fontSize: '1rem', color: '#64748B', marginTop: 2 }}>{item.scenario}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RING STAT */}
          <div>
            <div style={{ width: 260, height: 260, margin: '0 auto', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 260 260" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <circle cx="130" cy="130" r="110" fill="none" stroke="#0D9488" strokeWidth="16" />
                <circle cx="130" cy="130" r="110" fill="none" stroke="#DC5858" strokeWidth="16" strokeDasharray="691.15" strokeDashoffset="186.6" strokeLinecap="round" transform="rotate(-90 130 130)" />
              </svg>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '3.6rem', fontWeight: 700, color: '#0F172A' }}>73%</div>
                <div style={{ fontSize: '.95rem', color: '#64748B' }}>{t(l, 'percent_closed')}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 32, padding: 24, background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize: '1.15rem', color: '#0F172A', marginBottom: 8, fontWeight: 700 }}>
                {l === 'nl' ? 'Open: ma–vr 9:00–18:00' : l === 'en' ? 'Open: Mon–Fri 9am–6pm' : 'Abierto: Lun–Vie 9:00–18:00'}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                {(l === 'nl' ? ['MA','DI','WO','DO','VR','ZA','ZO'] : l === 'en' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']).map((day, i) => (
                  <span key={day} style={{ background: i < 5 ? '#E2E8F0' : '#FEE2E2', padding: '6px 10px', borderRadius: 6, fontSize: '.9rem', color: i < 5 ? '#64748B' : '#EF4444', fontWeight: i < 5 ? 400 : 600 }}>{day}</span>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: '1.15rem', color: '#EF4444', fontWeight: 700 }}>
                6.420 {t(l, 'hours_closed')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OPLOSSING / FEATURES */}
      <section style={{ padding: '100px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>{t(l, 'solution_label')}</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>
              {l === 'nl' ? 'Uw AI Receptioniste die nooit slaapt' : l === 'en' ? 'Your AI Receptionist that never sleeps' : 'Su recepcionista IA que nunca duerme'}
            </h2>
            <p style={{ color: '#64748B', fontSize: '1.05rem', maxWidth: 600, margin: '0 auto' }}>
              {l === 'nl' ? 'Ze beantwoordt elke oproep - dag en nacht - met een natuurlijke, warme stem. Alsof uw beste receptioniste 24/7 aan het werk is.' : l === 'en' ? 'She answers every call - day and night - with a natural, warm voice. As if your best receptionist works 24/7.' : 'Responde cada llamada, de día y de noche, con una voz natural y cálida.'}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {(content.features || []).map((f: { title: string; body: string }, i: number) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #F1F5F9', padding: '32px 28px', borderRadius: 14, transition: 'box-shadow .25s, transform .25s' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F0FDFA', color: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  {i === 0 && <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                  {i === 1 && <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
                  {i === 2 && <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
                  {i === 3 && <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>}
                  {i === 4 && <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                  {i === 5 && <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                </div>
                <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.05rem', fontWeight: 600, marginBottom: 8, color: '#0F172A' }}>{f.title}</h3>
                <p style={{ fontSize: '.9rem', color: '#64748B' }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AGENTS SECTIE */}
      <section style={{ padding: '100px 0', background: '#0F172A' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ color: '#CCFBF1', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>Onze AI Agents</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16, color: '#fff' }}>
              {l === 'nl' ? 'Laat meerdere agenten samenwerken voor een complete 360 graden upgrade van uw kliniek.' : l === 'en' ? 'Let multiple agents work together for a complete 360-degree upgrade of your clinic.' : 'Deje que varios agentes trabajen juntos para una mejora completa de 360 grados de su clínica.'}
            </h2>
            <p style={{ color: '#CBD5E1', fontSize: '1.05rem', maxWidth: 800, margin: '0 auto', whiteSpace: 'nowrap' }}>
              {l === 'nl' ? 'Elk contactmoment geautomatiseerd - via telefoon, chat, e-mail en social media.' : l === 'en' ? 'Every touchpoint automated - phone, chat, email and social media.' : 'Cada punto de contacto automatizado - teléfono, chat, correo y redes sociales.'}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {[
              { icon: <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/><path d="M14.05 2a9 9 0 0 1 8 7.94"/><path d="M14.05 6A5 5 0 0 1 18 10"/></svg>, title: 'AI Voice Agent - Inbound', body: l === 'nl' ? 'Beantwoordt inkomende telefoongesprekken 24/7. Beantwoordt vragen over behandelingen, prijzen en beschikbaarheid en boekt direct afspraken in uw agenda.' : 'Answers incoming calls 24/7. Answers questions about treatments, prices and availability and books appointments directly.', tag: l === 'nl' ? 'Telefonie' : 'Phone' },
              { icon: <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>, title: 'AI Voice Agent - Outbound', body: l === 'nl' ? 'Belt proactief klanten voor afspraakbevestigingen, no-show opvolging, nazorg na behandelingen en herinneringen. Vermindert no-shows met tot 40%.' : 'Proactively calls customers for appointment confirmations, no-show follow-up and reminders. Reduces no-shows by up to 40%.', tag: l === 'nl' ? 'Telefonie' : 'Phone' },
              { icon: <svg width="26" height="26" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.122 1.525 5.857L.06 23.487a.5.5 0 00.608.608l5.63-1.464A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.94 9.94 0 01-5.38-1.567l-.386-.232-3.338.868.886-3.262-.254-.403A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>, title: 'WhatsApp & SMS Agent', body: l === 'nl' ? "Reageert direct op WhatsApp-berichten en sms'jes. Beantwoordt vragen, stuurt afspraakbevestigingen en behandelinformatie. Altijd beschikbaar op het favoriete kanaal van uw klant." : 'Responds instantly to WhatsApp messages and SMS. Answers questions, sends appointment confirmations and treatment information.', tag: 'Messaging' },
              { icon: <svg width="26" height="26" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.24.19 2.24.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 008.44-9.9c0-5.53-4.5-10.02-10-10.02z"/></svg>, title: 'Facebook Messenger Agent', body: l === 'nl' ? 'Vangt leads op via uw Facebook-pagina. Beantwoordt vragen over behandelingen, deelt prijsinformatie en plant afspraken in - rechtstreeks vanuit Messenger.' : 'Captures leads via your Facebook page. Answers questions about treatments, shares pricing and schedules appointments.', tag: 'Social Media' },
              { icon: <svg width="26" height="26" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>, title: 'Instagram DM Agent', body: l === 'nl' ? "Reageert automatisch op Instagram DM's. Ideaal voor klinieken en salons die leads binnenkrijgen via Instagram. Converteert volgers naar betalende klanten." : 'Automatically responds to Instagram DMs. Ideal for clinics getting leads via Instagram. Converts followers to paying customers.', tag: 'Social Media' },
              { icon: <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, title: l === 'nl' ? 'E-mail Agent' : 'Email Agent', body: l === 'nl' ? 'Verwerkt inkomende e-mails automatisch. Beantwoordt veelgestelde vragen, stuurt offertes voor behandelingen en routeert complexe vragen naar het juiste teamlid.' : 'Automatically processes incoming emails. Answers FAQs, sends treatment quotes and routes complex questions to the right team member.', tag: 'E-mail' },
            ].map((agent, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', padding: '32px 28px', borderRadius: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(13,148,136,.2)', color: '#CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>{agent.icon}</div>
                <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>{agent.title}</h3>
                <p style={{ fontSize: '.88rem', color: '#CBD5E1', lineHeight: 1.6 }}>{agent.body}</p>
                <span style={{ display: 'inline-block', marginTop: 14, padding: '4px 12px', background: 'rgba(13,148,136,.15)', color: '#CCFBF1', borderRadius: 6, fontSize: '.75rem', fontWeight: 600 }}>{agent.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section style={{ padding: '100px 0', background: '#F0FDFA' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              {l === 'nl' ? 'Specifiek voor klinieken' : l === 'en' ? 'Specific for clinics' : 'Específico para clínicas'}
            </div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>
              {l === 'nl' ? 'Uw AI agents zijn specifiek getraind op klinieken en salons' : l === 'en' ? 'Your AI agents are specifically trained for clinics and salons' : 'Sus agentes IA están específicamente entrenados para clínicas'}
            </h2>
            <p style={{ color: '#64748B', fontSize: '1.05rem', maxWidth: 600, margin: '0 auto' }}>
              {l === 'nl' ? 'Van intake tot nazorg - Uw cliënten zijn u dankbaar.' : l === 'en' ? 'From intake to aftercare - your clients will thank you.' : 'Desde la admisión hasta el seguimiento.'}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {(content.usecases || []).map((uc: { title: string; body: string }, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: '#fff', padding: 24, borderRadius: 12, border: '1px solid rgba(13,148,136,.1)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#F0FDFA', color: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                <div>
                  <h4 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '.95rem', fontWeight: 600, color: '#0F172A' }}>{uc.title}</h4>
                  <p style={{ fontSize: '.85rem', color: '#64748B', marginTop: 4 }}>{uc.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OMZET - interactive calculator */}
      <RevenueCalculator
        lang={l}
        defaultCalls={content.revenue_calls || 5}
        defaultValue={content.revenue_per_call || 500}
      />

      {/* HOE HET WERKT */}
      <section id="hoe-het-werkt" style={{ padding: '100px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            {l === 'nl' ? 'Hoe het werkt' : l === 'en' ? 'How it works' : 'Cómo funciona'}
          </div>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>
            {content.steps_title || t(l, 'steps_title')}
          </h2>
          <p style={{ color: '#64748B', fontSize: '1.05rem', maxWidth: 600, margin: '0 auto 48px' }}>
            {content.steps_sub || (l === 'nl' ? 'Geen maandenlange implementatie. Wij regelen alles.' : l === 'en' ? 'No months of implementation. We handle everything.' : 'Sin meses de implementación. Nosotros nos encargamos de todo.')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, marginBottom: 48 }}>
            {(content.steps || [
              {title: t(l, 'step1'), body: t(l, 'step1_desc')},
              {title: t(l, 'step2'), body: t(l, 'step2_desc')},
              {title: t(l, 'step3'), body: t(l, 'step3_desc')},
            ]).map((step: {title: string; body: string}, i: number) => {
              const title = step.title; const desc = step.body; return (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>{i + 1}</div>
                <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.05rem', fontWeight: 600, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: '.9rem', color: '#64748B', maxWidth: 280, margin: '0 auto' }}>{desc}</p>
              </div>
            )})}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', padding: 32, background: '#F1F5F9', borderRadius: 14 }}>
            {['Google Calendar', 'Clinicminds', 'Timify', 'Calendly', 'Microsoft 365', 'VoIP / SIP', 'Custom API'].map((badge) => (
              <span key={badge} style={{ background: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: '.88rem', fontWeight: 500, color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>{badge}</span>
            ))}
          </div>
        </div>
      </section>

      {/* VERGELIJKING */}
      <section style={{ padding: '100px 0', background: '#F1F5F9' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              {l === 'nl' ? 'Vergelijking' : l === 'en' ? 'Comparison' : 'Comparación'}
            </div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)' }}>
              {l === 'nl' ? 'Traditioneel vs. agentmakers.io Receptioniste' : l === 'en' ? 'Traditional vs. agentmakers.io Receptionist' : 'Tradicional vs. Recepcionista agentmakers.io'}
            </h2>
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
              <thead>
                <tr>
                  <th style={{ padding: '20px 28px', textAlign: 'left', fontFamily: "'Nunito',sans-serif", fontSize: '.85rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em', width: '30%' }}></th>
                  <th style={{ padding: '20px 28px', textAlign: 'left', fontFamily: "'Nunito',sans-serif", fontSize: '.85rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {l === 'nl' ? 'Traditionele receptie' : l === 'en' ? 'Traditional reception' : 'Recepción tradicional'}
                  </th>
                  <th style={{ padding: '20px 28px', textAlign: 'left', fontFamily: "'Nunito',sans-serif", fontSize: '.85rem', fontWeight: 600, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '.04em', background: '#F0FDFA' }}>
                    agentmakers.io
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  [l === 'nl' ? 'Beschikbaarheid' : 'Availability', l === 'nl' ? 'Ma–vr, 9:00–18:00' : 'Mon–Fri, 9am–6pm', '24/7/365'],
                  [l === 'nl' ? 'Kosten per maand' : 'Monthly costs', '€2.500 – €4.000+', l === 'nl' ? 'Vanaf €299' : 'From €299'],
                  [l === 'nl' ? 'Schaalbaarheid' : 'Scalability', l === 'nl' ? 'Beperkt (1 lijn tegelijk)' : 'Limited (1 line at a time)', l === 'nl' ? 'Onbeperkt gelijktijdige oproepen' : 'Unlimited simultaneous calls'],
                  [l === 'nl' ? 'Taalondersteuning' : 'Language support', '1–2 talen', '10+ talen'],
                  [l === 'nl' ? 'Ziekteverzuim' : 'Sick leave', l === 'nl' ? 'Vervanging nodig' : 'Replacement needed', l === 'nl' ? 'Altijd beschikbaar' : 'Always available'],
                  [l === 'nl' ? 'Consistentie' : 'Consistency', l === 'nl' ? 'Varieert per medewerker' : 'Varies per employee', l === 'nl' ? 'Altijd dezelfde kwaliteit' : 'Always same quality'],
                  [l === 'nl' ? 'Opschalen bij drukte' : 'Scale during peak', l === 'nl' ? 'Extra personeel inhuren' : 'Hire extra staff', l === 'nl' ? 'Automatisch, direct' : 'Automatic, instant'],
                ].map(([feature, traditional, ai], i) => (
                  <tr key={i}>
                    <td style={{ padding: '18px 28px', borderTop: '1px solid #F1F5F9', fontSize: '.92rem', fontWeight: 600, color: '#0F172A' }}>{feature}</td>
                    <td style={{ padding: '18px 28px', borderTop: '1px solid #F1F5F9', fontSize: '.92rem', color: '#334155' }}>{traditional}</td>
                    <td style={{ padding: '18px 28px', borderTop: '1px solid #F1F5F9', fontSize: '.92rem', fontWeight: 500, color: '#0F766E', background: '#F0FDFA' }}>{ai}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding: '100px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              {content.stats_label || (l === 'nl' ? 'Resultaten' : l === 'en' ? 'Results' : 'Resultados')}
            </div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)' }}>
              {content.stats_title || (l === 'nl' ? 'Wat klanten ervaren met agentmakers.io' : l === 'en' ? 'What clients experience with agentmakers.io' : 'Lo que los clientes experimentan con agentmakers.io')}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
            {[['98%', l === 'nl' ? 'van alle oproepen beantwoord' : l === 'en' ? 'of all calls answered' : 'de todas las llamadas atendidas'], ['+34%', l === 'nl' ? 'meer boekingen buiten openingstijden' : l === 'en' ? 'more bookings outside opening hours' : 'más reservas fuera del horario'], ['-40%', l === 'nl' ? 'reductie in no-shows' : l === 'en' ? 'reduction in no-shows' : 'reducción de no-shows']].map(([num, desc]) => (
              <div key={num} style={{ textAlign: 'center', padding: '40px 24px', background: '#F0FDFA', borderRadius: 14 }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '2.8rem', fontWeight: 700, color: '#0F766E' }}>{num}</div>
                <div style={{ fontSize: '.9rem', color: '#64748B', marginTop: 8 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO FORM */}
      <section id="demo" style={{ padding: '80px 0', background: 'linear-gradient(160deg, #0F766E, #0D9488)', textAlign: 'center' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>
            {content.cta_headline || t(l, 'cta_label')}
          </h2>
          <p style={{ color: '#CCFBF1', fontSize: '1.05rem', marginBottom: 40, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
            {content.cta_sub || t(l, 'cta_sub')}
          </p>
          <DemoForm slug={industry} lang={l} strings={{
            name: t(l, 'form_name'),
            email: t(l, 'form_email'),
            phone: t(l, 'form_phone'),
            website: t(l, 'form_website'),
            company: t(l, 'form_company'),
            submit: t(l, 'form_submit'),
            sending: t(l, 'form_sending'),
            success: t(l, 'form_success'),
            error: t(l, 'form_error'),
            trust: t(l, 'form_trust'),
          }} />
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0F172A', color: '#CBD5E1', padding: '40px 0', textAlign: 'center', fontSize: '.85rem' }}>
        <p>© 2026 agentmakers.io. Alle rechten voorbehouden. &nbsp;|&nbsp; <a href="/privacy" style={{ color: '#CBD5E1', textDecoration: 'none' }}>Privacy</a> &nbsp;|&nbsp; <a href="/voorwaarden" style={{ color: '#CBD5E1', textDecoration: 'none' }}>Voorwaarden</a></p>
      </footer>
    </div>
  )
}
