import { supabaseAdmin } from '@/lib/supabase'
import type { LandingPage } from '@/lib/supabase'

async function getLivePages(): Promise<LandingPage[]> {
  const { data } = await supabaseAdmin
    .from('landing_pages')
    .select('slug, industry, hero_image_url, meta_description_nl, status, visits, conversions')
    .eq('status', 'live')
    .order('created_at', { ascending: true })
  return (data as LandingPage[]) || []
}

const COMING_SOON = [
  { industry: 'Tandartspraktijken', icon: '🦷', img: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=600&q=80', desc: 'Afspraken, spoedgevallen en herinneringen — uw AI assistent regelt het.' },
  { industry: 'Restaurants & Horeca', icon: '🍽️', img: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=80', desc: 'Reserveringen aannemen, menukaart delen en wachtlijst beheren via AI.' },
  { industry: 'Fysiotherapie', icon: '💪', img: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&q=80', desc: 'Intake, afspraken en oefenschema-opvolging — volledig geautomatiseerd.' },
  { industry: 'Makelaardij', icon: '🏠', img: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&q=80', desc: 'Bezichtigingen plannen, vragen beantwoorden en leads opvolgen.' },
  { industry: 'Autogarages', icon: '🔧', img: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=600&q=80', desc: 'APK-afspraken, onderhoudsherinneringen en statusupdates — automatisch.' },
]

export default async function HomePage() {
  const livePages = await getLivePages()

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", color: 'var(--slate-700)', background: '#fff', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #F1F5F9', padding: '16px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <img src="/logo-transparent.png" alt="agentmakers.io" style={{ height: 36, width: 'auto', display: 'block' }} />
          </a>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: '1.35rem', opacity: 1, lineHeight: 1 }} title="Nederlands">🇳🇱</span>
            <span style={{ fontSize: '1.35rem', opacity: 0.45, lineHeight: 1 }} title="English">🇬🇧</span>
            <span style={{ fontSize: '1.35rem', opacity: 0.45, lineHeight: 1 }} title="Español">🇪🇸</span>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 160, paddingBottom: 100, textAlign: 'center', background: 'linear-gradient(180deg, #F0FDFA 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'inline-block', background: 'rgba(13,148,136,.1)', color: '#0F766E', padding: '6px 16px', borderRadius: 100, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em', marginBottom: 24 }}>
            AI Agents op maat voor uw branche
          </div>
          <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', lineHeight: 1.15, marginBottom: 20, maxWidth: 700, marginLeft: 'auto', marginRight: 'auto' }}>
            Uw bedrijf verdient een{' '}
            <em style={{ fontStyle: 'normal', color: '#0D9488' }}>AI medewerker</em>{' '}
            die nooit slaapt
          </h1>
          <p style={{ fontSize: '1.15rem', color: '#64748B', maxWidth: 560, margin: '0 auto 40px' }}>
            Wij bouwen AI agents die uw telefoon beantwoorden, afspraken inboeken en klanten helpen — 24/7, in elke branche.
          </p>
          <a href="#branches" style={{ background: '#0D9488', color: '#fff', padding: '16px 36px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Bekijk onze oplossingen ↓
          </a>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 48, marginTop: 56, flexWrap: 'wrap' }}>
            {[['24/7', 'Altijd bereikbaar'], ['10+', 'Talen ondersteund'], ['48u', 'Live in 48 uur']].map(([num, label]) => (
              <div key={num} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '2.2rem', fontWeight: 700, color: '#0F766E' }}>{num}</div>
                <div style={{ fontSize: '.85rem', color: '#64748B', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BRANCHES */}
      <section id="branches" className="sp">
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>Onze oplossingen</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>AI agents voor elke branche</h2>
            <p style={{ color: '#64748B', fontSize: '1.05rem', maxWidth: 560, margin: '0 auto' }}>Kies uw branche en ontdek wat onze AI agents specifiek voor u kunnen betekenen.</p>
          </div>

          <div className="grid-3col">
            {/* Live pages */}
            {livePages.map((page) => (
              <a key={page.slug} href={`/nl/${page.slug}`} style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 16, overflow: 'hidden', textDecoration: 'none', color: 'inherit', display: 'block', transition: 'all .3s' }}>
                <img src={page.hero_image_url || 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=600&q=80'} alt={page.industry} style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: 24 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F0FDFA', color: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', marginBottom: 16 }}>✚</div>
                  <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.1rem', fontWeight: 700, marginBottom: 8, color: '#0F172A' }}>{page.industry}</h3>
                  <p style={{ fontSize: '.9rem', color: '#64748B', lineHeight: 1.6, marginBottom: 16 }}>{page.meta_description_nl}</p>
                  <span style={{ fontSize: '.88rem', fontWeight: 600, color: '#0D9488', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Bekijk oplossing →</span>
                </div>
              </a>
            ))}

            {/* Coming soon pages */}
            {COMING_SOON.map((item) => (
              <div key={item.industry} style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 16, overflow: 'hidden', opacity: .55 }}>
                <img src={item.img} alt={item.industry} style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: 24 }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: 16 }}>{item.icon}</div>
                  <h3 style={{ fontFamily: "'Nunito',sans-serif", fontSize: '1.1rem', fontWeight: 700, marginBottom: 8, color: '#0F172A' }}>{item.industry}</h3>
                  <p style={{ fontSize: '.9rem', color: '#64748B', lineHeight: 1.6, marginBottom: 16 }}>{item.desc}</p>
                  <span style={{ display: 'inline-block', background: '#F1F5F9', color: '#64748B', padding: '4px 12px', borderRadius: 6, fontSize: '.75rem', fontWeight: 600 }}>Binnenkort beschikbaar</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="sp" style={{ background: '#0F172A' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ color: '#CCFBF1', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>Hoe het werkt</div>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>In 4 stappen operationeel</h2>
          <p style={{ color: '#CBD5E1', fontSize: '1.05rem', maxWidth: 560, margin: '0 auto 56px' }}>Geen technische kennis nodig. Wij regelen alles.</p>
          <div className="grid-4col">
            {[
              ['1', 'Kies uw branche', 'Selecteer uw branche zodat wij de AI agents optimaal kunnen afstemmen.'],
              ['2', 'Wij configureren', 'We trainen de AI op uw bedrijf: diensten, prijzen, tone of voice en protocollen.'],
              ['3', 'Integratie', 'Koppeling met uw agenda, telefonie en bestaande systemen.'],
              ['4', '48 uur live', 'Uw AI agents draaien binnen 48 uur — 24/7, zonder onderbreking.'],
            ].map(([num, title, desc]) => (
              <div key={num} style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>{num}</div>
                <h3 style={{ fontFamily: "'Nunito',sans-serif", color: '#fff', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: '.88rem', color: '#CBD5E1', maxWidth: 220, margin: '0 auto' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" style={{ background: 'linear-gradient(160deg, #0F766E, #0D9488)', padding: '80px 0', textAlign: 'center' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 16 }}>Klaar om uw branche te automatiseren?</h2>
          <p style={{ color: '#CCFBF1', fontSize: '1.05rem', marginBottom: 40, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
            Neem contact op voor een vrijblijvend gesprek over wat AI agents voor uw bedrijf kunnen betekenen.
          </p>
          <a href="mailto:richard@leadking.nl" style={{ background: '#fff', color: '#0F766E', padding: '16px 36px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            📧 Neem contact op
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0F172A', color: '#CBD5E1', padding: '40px 0', textAlign: 'center', fontSize: '.85rem' }}>
        <p>© 2026 agentmakers.io. Alle rechten voorbehouden.</p>
      </footer>
    </div>
  )
}
