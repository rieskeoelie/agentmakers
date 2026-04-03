import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { t, SUPPORTED_LANGS, LANG_LABELS, type Lang } from '@/lib/i18n'
import { DemoForm } from '@/components/landing/DemoForm'
import { TrackView } from '@/components/landing/TrackView'
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
          <a href="/" style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', fontWeight: 700, color: '#0D9488', textDecoration: 'none' }}>
            agentmakers.io
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
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', backgroundImage: `url('${heroImg}')`, backgroundSize: 'cover', backgroundPosition: 'center', paddingTop: 80, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(15,23,42,.88) 0%, rgba(15,23,42,.75) 50%, rgba(13,148,136,.4) 100%)' }} />
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 8vw', width: '100%', position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: 620 }}>
            <div style={{ display: 'inline-block', background: 'rgba(13,148,136,.15)', color: '#CCFBF1', padding: '6px 16px', borderRadius: 100, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em', marginBottom: 24 }}>
              {t(l, 'hero_badge')}
            </div>
            <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: '#fff', lineHeight: 1.15, marginBottom: 24 }}>
              {headline}
            </h1>
            <p style={{ color: '#fff', fontSize: '1.15rem', marginBottom: 36, maxWidth: 540 }}>{subline}</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a href="#demo" style={{ background: '#0D9488', color: '#fff', padding: '16px 32px', borderRadius: 10, fontWeight: 600, fontSize: '1rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                📞 {t(l, 'cta_label')}
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
            <p style={{ color: '#0F172A', fontSize: '1.15rem', fontWeight: 600, marginBottom: 32 }}>
              {content.problem_body || subline}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(content.timeline || []).map((item: { time: string; scenario: string }, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, background: '#fff', padding: '20px 24px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: i < 2 ? '#FEE2E2' : '#FEF3C7', color: i < 2 ? '#EF4444' : '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                    {i < 2 ? '📵' : '⚠️'}
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
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {(content.features || []).map((f: { title: string; body: string }, i: number) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #F1F5F9', padding: '32px 28px', borderRadius: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F0FDFA', color: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', marginBottom: 20 }}>✓</div>
                <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.05rem', fontWeight: 600, marginBottom: 8, color: '#0F172A' }}>{f.title}</h3>
                <p style={{ fontSize: '.9rem', color: '#64748B' }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section style={{ padding: '100px 0', background: '#F0FDFA' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>
              {l === 'nl' ? `Specifiek voor ${page.industry}` : l === 'en' ? `Tailored for ${page.industry}` : `Diseñado para ${page.industry}`}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {(content.usecases || []).map((uc: { title: string; body: string }, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: '#fff', padding: 24, borderRadius: 12, border: '1px solid rgba(13,148,136,.1)' }}>
                <div style={{ color: '#0D9488', fontSize: '1.2rem', flexShrink: 0, marginTop: 2 }}>✓</div>
                <div>
                  <h4 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '.95rem', fontWeight: 600, color: '#0F172A' }}>{uc.title}</h4>
                  <p style={{ fontSize: '.85rem', color: '#64748B', marginTop: 4 }}>{uc.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OMZET */}
      <section style={{ padding: '100px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ background: 'linear-gradient(135deg, #0F172A, #1a2d42)', borderRadius: 20, padding: '56px', color: '#fff', textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', marginBottom: 16, fontSize: 'clamp(1.4rem, 2.8vw, 2rem)' }}>
              {l === 'nl' ? 'Hoeveel omzet loopt u mis?' : l === 'en' ? 'How much revenue are you missing?' : '¿Cuántos ingresos está perdiendo?'}
            </h2>
            <p style={{ color: '#CBD5E1', fontSize: '1rem', marginBottom: 40 }}>
              {l === 'nl' ? 'Een realistisch rekenvoorbeeld.' : l === 'en' ? 'A realistic calculation.' : 'Un ejemplo de cálculo realista.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 32 }}>
              {[
                [content.revenue_calls || 5, l === 'nl' ? 'gemiste oproepen per week' : l === 'en' ? 'missed calls per week' : 'llamadas perdidas por semana'],
                [`€${content.revenue_per_call || 500}`, l === 'nl' ? 'gem. behandelwaarde' : l === 'en' ? 'avg. appointment value' : 'valor medio por cita'],
                [52, l === 'nl' ? 'weken per jaar' : l === 'en' ? 'weeks per year' : 'semanas por año'],
              ].map(([num, desc], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ background: 'rgba(255,255,255,.08)', padding: '20px 28px', borderRadius: 12, textAlign: 'center', minWidth: 150 }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#CCFBF1', fontFamily: "'Nunito',sans-serif" }}>{num}</div>
                    <div style={{ fontSize: '.8rem', color: '#CBD5E1', marginTop: 4 }}>{desc}</div>
                  </div>
                  {i < 2 && <span style={{ fontSize: '1.6rem', color: '#CBD5E1', fontWeight: 300 }}>×</span>}
                </div>
              ))}
            </div>
            <div style={{ background: '#0D9488', padding: '24px 40px', borderRadius: 14, display: 'inline-block' }}>
              <div style={{ fontSize: '2.4rem', fontWeight: 700, color: '#fff', fontFamily: "'Nunito',sans-serif" }}>
                €{((content.revenue_calls || 5) * (content.revenue_per_call || 500) * 52).toLocaleString('nl-NL')}
              </div>
              <div style={{ fontSize: '.85rem', color: '#CCFBF1', marginTop: 4 }}>{t(l, 'missed_revenue')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOE HET WERKT */}
      <section id="hoe-het-werkt" style={{ padding: '100px 0', background: '#F1F5F9' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>{t(l, 'steps_title')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, marginTop: 48, marginBottom: 48 }}>
            {[
              [t(l, 'step1'), t(l, 'step1_desc')],
              [t(l, 'step2'), t(l, 'step2_desc')],
              [t(l, 'step3'), t(l, 'step3_desc')],
            ].map(([title, desc], i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>{i + 1}</div>
                <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.05rem', fontWeight: 600, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: '.9rem', color: '#64748B', maxWidth: 280, margin: '0 auto' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding: '100px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
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
            {t(l, 'cta_sub')}
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
        <p>© 2026 agentmakers.io. Alle rechten voorbehouden.</p>
      </footer>
    </div>
  )
}
