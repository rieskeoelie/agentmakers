'use client'
import { DemoForm } from '@/components/landing/DemoForm'

const AGENTS = [
  {
    slug: 'voice-inbound',
    icon: '📞',
    title: 'Voice Agent (Inbound)',
    tagline: 'Maakt van elke inkomende call een gekwalificeerde lead',
    desc: 'De voice agent is getraind op sales, werkt 24/7 en voert meerdere gesprekken tegelijk.',
    bullets: ['Beantwoordt & kwalificeert elke call', 'Integreert met CRM & agenda', 'Plant afspraken automatisch in'],
    stat: '€1.500–3.000/mnd besparing',
    users: '65+ bedrijven',
    color: '#0D9488',
  },
  {
    slug: 'voice-outbound',
    icon: '🔊',
    title: 'Voice Agent (Outbound)',
    tagline: 'Belt autonoom prospects en activeert slapende leads',
    desc: 'De outbound voice agent is getraind op sales en zet slapende leads om in betalende klanten.',
    bullets: ['Belt 100+ leads/dag automatisch', 'Boekt meetings direct in je agenda', 'Herkent koopintentie'],
    stat: '€5.000–15.000/deal',
    users: '45+ bedrijven',
    color: '#7C3AED',
  },
  {
    slug: 'rag-chatbot',
    icon: '💬',
    title: 'AI Chatbot (RAG)',
    tagline: 'Beantwoordt gedetailleerd de tijdrovende vragen van klanten',
    desc: 'AI chatbot die vragen beantwoordt uit je FAQ\'s, contracten, gebruiksaanwijzingen en meer.',
    bullets: ['Beantwoordt 60–80% van klantvragen automatisch', 'Getraind op je eigen data', 'Altijd accurate antwoorden'],
    stat: '€1.000–2.500/mnd besparing',
    users: '80+ bedrijven',
    color: '#0369A1',
  },
  {
    slug: 'whatsapp-agent',
    icon: '💚',
    title: 'WhatsApp Agent',
    tagline: 'Beantwoordt zakelijke WhatsApp berichten binnen 3 seconden',
    desc: 'AI agent die 24/7 WhatsApp berichten beantwoordt, kwalificeert en afspraken boekt.',
    bullets: ['Beantwoordt elke WhatsApp direct', 'Integreert met CRM & agenda', '21x hogere conversie'],
    stat: '21x hogere conversie',
    users: '70+ bedrijven',
    color: '#16A34A',
  },
  {
    slug: 'sms-agent',
    icon: '📱',
    title: 'SMS Agent',
    tagline: 'Voert SMS-gesprekken met een open rate van 98%',
    desc: 'AI agent die sms-gesprekken verstuurt en ontvangt voor follow-up, kwalificatie en herinneringen.',
    bullets: ['Verlaagt no-shows met 30%', 'Volledige CRM-integratie', 'Besparing: 10–15 uur/mnd'],
    stat: '98% open rate',
    users: '30+ bedrijven',
    color: '#B45309',
  },
  {
    slug: 'instagram-dm',
    icon: '📸',
    title: 'Instagram DM Agent',
    tagline: 'Zet interesse via Instagram DM om in waardevolle afspraken',
    desc: 'AI agent die 24/7 DM\'s beantwoordt, leads kwalificeert en afspraken boekt.',
    bullets: ['Kwalificeert leads direct', 'Integreert met CRM', 'Besparing: 10–15 uur/mnd'],
    stat: '10–15 uur/mnd bespaard',
    users: '35+ bedrijven',
    color: '#DB2777',
  },
  {
    slug: 'facebook-messenger',
    icon: '📘',
    title: 'Facebook Messenger Agent',
    tagline: 'Zet interesse via Messenger om in klanten',
    desc: 'AI agent die elke Messenger-lead automatisch opvangt, kwalificeert en in je pipeline zet.',
    bullets: ['Vangt elke advertentielead op', 'Boekt afspraken automatisch', 'Besparing: 10–15 uur/mnd'],
    stat: '10–15 uur/mnd bespaard',
    users: '25+ bedrijven',
    color: '#1D4ED8',
  },
  {
    slug: 'email-agent',
    icon: '✉️',
    title: 'E-mailagent',
    tagline: 'Verstuurt en beantwoordt e-mails voor optimale klantervaring',
    desc: 'AI agent die e-mails leest, beantwoordt, categoriseert en follow-ups verstuurt.',
    bullets: ['Beantwoordt 60–80% automatisch', 'Stuurt follow-ups automatisch', 'Besparing: 10–20 uur/mnd'],
    stat: '10–20 uur/mnd bespaard',
    users: '50+ bedrijven',
    color: '#0D9488',
  },
  {
    slug: 'lead-nurturing',
    icon: '🎯',
    title: 'Lead Nurturing Agent',
    tagline: 'Activeert slapende leads via meerdere kanalen',
    desc: 'AI agent die koude leads opvolgt via e-mail, sms of WhatsApp en hete leads doorzet naar sales.',
    bullets: ['Reactiveert slapende pipeline', 'Detecteert koopintentie', 'Besparing: 20–30 uur/mnd'],
    stat: '20–30 uur/mnd bespaard',
    users: '40+ bedrijven',
    color: '#7C3AED',
  },
  {
    slug: 'maatwerk',
    icon: '⚙️',
    title: 'Maatwerk Agent',
    tagline: 'Volledig op maat gebouwd voor jouw specifieke toepassing',
    desc: 'Geen standaardoplossing die past? Wij bouwen precies wat jouw bedrijf nodig heeft.',
    bullets: ['Gebouwd op jouw proces', 'Onbeperkte integraties', 'Van idee tot live in 7–20 dagen'],
    stat: 'Op maat geprijsd',
    users: '20+ bedrijven',
    color: '#0F172A',
  },
]

const INTEGRATIONS = [
  { cat: 'CRM', items: ['GoHighLevel', 'HubSpot', 'Salesforce', 'Pipedrive', 'Reapit'] },
  { cat: 'Communicatie', items: ['Twilio', 'WhatsApp', 'Instagram', 'Facebook', 'Telnyx'] },
  { cat: 'Automatisering', items: ['n8n', 'Make', 'Zapier'] },
  { cat: 'Agenda', items: ['Google Calendar', 'Calendly'] },
  { cat: 'Data', items: ['Airtable', 'Google Sheets', 'Supabase'] },
  { cat: 'Betalingen', items: ['Stripe'] },
]

export default function AiAgentsPage() {
  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", color: '#1E293B', background: '#fff', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #F1F5F9', padding: '16px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo-transparent.png" alt="agentmakers.io" style={{ height: 36, width: 'auto', display: 'block' }} />
          </a>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            <a href="/ai-agents" style={{ fontWeight: 700, color: '#0D9488', fontSize: '.9rem', textDecoration: 'none' }}>AI Agents</a>
            <a href="/#branches" style={{ fontWeight: 500, color: '#64748B', fontSize: '.9rem', textDecoration: 'none' }}>Branches</a>
            <a href="/#contact" style={{ background: '#0D9488', color: '#fff', padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: '.85rem', textDecoration: 'none' }}>Demo aanvragen</a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 140, paddingBottom: 80, textAlign: 'center', background: 'linear-gradient(180deg, #F0FDFA 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'inline-block', background: 'rgba(13,148,136,.1)', color: '#0F766E', padding: '6px 16px', borderRadius: 100, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em', marginBottom: 20 }}>
            10 productie-klare agents
          </div>
          <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', lineHeight: 1.15, marginBottom: 16 }}>
            AI Agents die <em style={{ fontStyle: 'normal', color: '#0D9488' }}>écht werken</em>
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#64748B', maxWidth: 560, margin: '0 auto 0' }}>
            Van inkomende calls tot lead nurturing — elke agent is getraind op jouw bedrijf en live binnen 3–7 dagen.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 40, marginTop: 48, flexWrap: 'wrap' }}>
            {[['3–7 dagen', 'Live'], ['24/7', 'Actief'], ['40+ uur', 'Bespaard/mnd'], ['50+', 'Integraties']].map(([num, label]) => (
              <div key={num} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.9rem', fontWeight: 700, color: '#0F766E' }}>{num}</div>
                <div style={{ fontSize: '.82rem', color: '#64748B', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AGENTS GRID */}
      <section style={{ padding: '80px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
            {AGENTS.map(agent => (
              <a key={agent.slug} href={`/ai-agents/${agent.slug}`}
                style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 28, textDecoration: 'none', color: 'inherit', display: 'block', transition: 'box-shadow .2s, transform .2s', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,.1)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,.06)'; (e.currentTarget as HTMLElement).style.transform = 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: `${agent.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>
                    {agent.icon}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: '1rem', color: '#0F172A', marginBottom: 3 }}>{agent.title}</div>
                    <div style={{ fontSize: '.82rem', color: '#64748B', lineHeight: 1.4 }}>{agent.tagline}</div>
                  </div>
                </div>
                <p style={{ fontSize: '.88rem', color: '#475569', lineHeight: 1.6, marginBottom: 16 }}>{agent.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {agent.bullets.map(b => (
                    <li key={b} style={{ fontSize: '.82rem', color: '#334155', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ color: agent.color, fontWeight: 700 }}>✓</span>{b}
                    </li>
                  ))}
                </ul>
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '.88rem', fontWeight: 700, color: agent.color }}>{agent.stat}</div>
                    <div style={{ fontSize: '.75rem', color: '#94A3B8', marginTop: 2 }}>{agent.users}</div>
                  </div>
                  <span style={{ fontSize: '.82rem', fontWeight: 700, color: agent.color }}>Meer info →</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section style={{ padding: '80px 0', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ color: '#0D9488', fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>Naadloos verbonden</div>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.8vw, 2rem)', marginBottom: 12 }}>Werkt met je bestaande tools</h2>
          <p style={{ color: '#64748B', fontSize: '1rem', maxWidth: 500, margin: '0 auto 48px' }}>Geen systemen vervangen. Wij pluggen in op wat je al gebruikt.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
            {INTEGRATIONS.map(group => (
              <div key={group.cat} style={{ background: '#fff', borderRadius: 12, padding: '20px 20px', border: '1px solid #E2E8F0', textAlign: 'left' }}>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>{group.cat}</div>
                {group.items.map(item => (
                  <div key={item} style={{ fontSize: '.85rem', color: '#334155', padding: '4px 0', borderBottom: '1px solid #F8FAFC' }}>{item}</div>
                ))}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 24, fontSize: '.82rem', color: '#94A3B8' }}>+ Aangepaste REST API&apos;s beschikbaar op aanvraag</p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'linear-gradient(160deg, #0A1628 0%, #0F2A3A 50%, #0A1628 100%)', padding: '80px 0' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', marginBottom: 16 }}>
            Welke agent past bij jouw bedrijf?
          </h2>
          <p style={{ color: 'rgba(240,244,248,0.6)', fontSize: '1rem', marginBottom: 40 }}>
            Plan een gratis demo van 15 minuten. We bespreken je situatie en adviseren de beste aanpak.
          </p>
          <DemoForm
            slug="ai-agents"
            lang="nl"
            strings={{
              cta_headline: 'Gratis demo aanvragen',
              cta_sub: 'Binnen enkele minuten ontvangt u een link om de AI agent te beluisteren.',
              name: 'Uw naam', email: 'E-mailadres', phone: 'Telefoonnummer',
              website: 'Website (optioneel)', company: 'Bedrijfsnaam',
              submit: 'Plan gratis demo', sending: 'Even geduld…',
              error: 'Probeer het opnieuw', success: 'Demo aangevraagd!',
              success_sub: 'We nemen binnen 1 werkdag contact op om de demo in te plannen.',
              trust: 'Geen verplichtingen. Gratis. Binnen 2 minuten.',
              diensten_label: '',
            }}
          />
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0F172A', color: '#CBD5E1', padding: '40px 0', textAlign: 'center', fontSize: '.85rem' }}>
        <p>© 2026 agentmakers.io. Alle rechten voorbehouden. · <a href="/ai-agents" style={{ color: '#0D9488', textDecoration: 'none' }}>AI Agents</a> · <a href="/" style={{ color: '#64748B', textDecoration: 'none' }}>Home</a></p>
      </footer>
    </div>
  )
}
