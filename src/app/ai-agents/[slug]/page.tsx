import { notFound } from 'next/navigation'
import { DemoForm } from '@/components/landing/DemoForm'

const AGENTS: Record<string, {
  icon: string; title: string; tagline: string; color: string
  intro: string; bullets: string[]; stat: string; users: string
  howItWorks: { step: string; title: string; desc: string }[]
  usecases: { title: string; desc: string }[]
  results: { value: string; label: string }[]
}> = {
  'voice-inbound': {
    icon: '📞', title: 'Voice Agent (Inbound)', tagline: 'Maakt van elke inkomende call een gekwalificeerde lead', color: '#0D9488',
    intro: 'Nooit meer een gemiste oproep. De inbound voice agent neemt 24/7 je telefoon aan, beantwoordt vragen, kwalificeert leads en plant afspraken direct in je agenda — terwijl jij je focust op je werk.',
    bullets: ['Beantwoordt & kwalificeert elke inkomende call', 'Integreert met jouw CRM & agenda', 'Plant afspraken automatisch in', 'Getraind op jouw producten, diensten en tone of voice', 'Werkt in meerdere talen'],
    stat: '€1.500–3.000/mnd', users: '65+ bedrijven',
    howItWorks: [
      { step: '01', title: 'Onboarding & training', desc: 'Wij trainen de agent op jouw bedrijf: diensten, prijzen, veelgestelde vragen en tone of voice.' },
      { step: '02', title: 'Integratie', desc: 'De agent koppelt aan je telefoonlijn, CRM en agenda. Geen technische kennis nodig.' },
      { step: '03', title: 'Live & automatisch', desc: 'Elke inkomende call wordt automatisch beantwoord, gekwalificeerd en ingepland.' },
    ],
    usecases: [
      { title: 'Tandartspraktijken & klinieken', desc: 'Patiënten bellen voor spoedafspraken, herinneringen en vragen over behandelingen.' },
      { title: 'Makelaars', desc: 'Geïnteresseerden bellen voor bezichtigingen — de agent plant ze direct in.' },
      { title: 'Loodgieters & installateurs', desc: 'Spoedreparaties worden 24/7 aangenomen en ingepland, ook buiten kantoortijd.' },
      { title: 'Autogarages', desc: 'APK-afspraken en reparatieverzoeken automatisch verwerkt, dag en nacht.' },
    ],
    results: [{ value: '€1.500–3.000', label: 'besparing per maand' }, { value: '0', label: 'gemiste oproepen' }, { value: '24/7', label: 'bereikbaar' }, { value: '65+', label: 'bedrijven gebruiken dit' }],
  },
  'voice-outbound': {
    icon: '🔊', title: 'Voice Agent (Outbound)', tagline: 'Belt autonoom prospects en activeert slapende leads', color: '#7C3AED',
    intro: 'Je pipeline staat vol leads die nooit zijn nagekomen. De outbound voice agent belt ze automatisch op, kwalificeert ze en boekt meetings direct in je agenda — zonder dat je er naar om hoeft te kijken.',
    bullets: ['Belt 100+ leads per dag automatisch', 'Boekt meetings direct in je agenda', 'Herkent koopintentie en escaleert naar sales', 'Reactiveert slapende CRM-leads', 'Volledig instelbare scripts'],
    stat: '€5.000–15.000/deal', users: '45+ bedrijven',
    howItWorks: [
      { step: '01', title: 'Leads uploaden', desc: 'Upload je lijst met prospects of koppel je CRM. De agent selecteert automatisch de juiste leads.' },
      { step: '02', title: 'Script & training', desc: 'Wij schrijven het belscript op basis van jouw aanbod en trainen de agent op bezwaren.' },
      { step: '03', title: 'Automatisch bellen', desc: 'De agent belt, kwalificeert en boekt meetings. Warme leads gaan direct naar sales.' },
    ],
    usecases: [
      { title: 'Sales teams', desc: 'Laat de agent koude en lauw leads opwarmen — sales focust alleen op gekwalificeerde afspraken.' },
      { title: 'Vastgoed', desc: 'Potentiële kopers en verkopers worden automatisch gebeld en gekwalificeerd.' },
      { title: 'Financiële diensten', desc: 'Follow-up op offertes en slapende klanten volledig geautomatiseerd.' },
      { title: 'B2B dienstverlening', desc: 'Prospectiebellen op schaal — 100+ calls per dag zonder extra personeel.' },
    ],
    results: [{ value: '100+', label: 'calls per dag' }, { value: '€5.000–15.000', label: 'per gewonnen deal' }, { value: '3x', label: 'meer afspraken' }, { value: '45+', label: 'bedrijven gebruiken dit' }],
  },
  'rag-chatbot': {
    icon: '💬', title: 'AI Chatbot (RAG)', tagline: 'Beantwoordt gedetailleerd de tijdrovende vragen van klanten', color: '#0369A1',
    intro: 'Klanten stellen steeds dezelfde vragen. De RAG chatbot wordt getraind op jouw eigen documenten, FAQ\'s en kennisbank — en beantwoordt 60–80% van alle vragen direct, accuraat en 24/7.',
    bullets: ['Beantwoordt 60–80% van klantvragen automatisch', 'Getraind op jouw eigen data en documenten', 'Altijd accurate, up-to-date antwoorden', 'Integreert op je website, app of portaal', 'Escaleert complexe vragen naar een medewerker'],
    stat: '€1.000–2.500/mnd', users: '80+ bedrijven',
    howItWorks: [
      { step: '01', title: 'Kennisbase uploaden', desc: 'Deel je FAQ\'s, handleidingen, contracten en website-content. Wij verwerken alles.' },
      { step: '02', title: 'Chatbot configureren', desc: 'De chatbot wordt ingesteld op jouw huisstijl, tone of voice en escalatieregels.' },
      { step: '03', title: 'Live op je platform', desc: 'Embed op je website of portaal. Klanten worden direct en accuraat geholpen.' },
    ],
    usecases: [
      { title: 'Klantenservice', desc: 'Standaardvragen over bestellingen, retouren en productinfo volledig geautomatiseerd.' },
      { title: 'HR & intern gebruik', desc: 'Medewerkers vinden zelf antwoorden in contracten, handleidingen en policies.' },
      { title: 'Juridische diensten', desc: 'Cliënten worden geholpen met veelgestelde juridische vragen op basis van jouw kennisbank.' },
      { title: 'SaaS & tech', desc: 'Technische support en onboarding vragen direct beantwoord vanuit je documentatie.' },
    ],
    results: [{ value: '60–80%', label: 'vragen automatisch' }, { value: '€1.000–2.500', label: 'besparing per maand' }, { value: '24/7', label: 'beschikbaar' }, { value: '80+', label: 'bedrijven gebruiken dit' }],
  },
  'whatsapp-agent': {
    icon: '💚', title: 'WhatsApp Agent', tagline: 'Beantwoordt zakelijke WhatsApp berichten binnen 3 seconden', color: '#16A34A',
    intro: 'WhatsApp heeft een open rate van 98%. De WhatsApp agent beantwoordt berichten binnen 3 seconden, kwalificeert leads en boekt afspraken — op het kanaal waar je klanten al zijn.',
    bullets: ['Reactie binnen 3 seconden, 24/7', 'Kwalificeert en converteert leads', 'Boekt afspraken direct', 'Integreert met CRM & agenda', '21x hogere conversie dan e-mail'],
    stat: '21x hogere conversie', users: '70+ bedrijven',
    howItWorks: [
      { step: '01', title: 'WhatsApp Business koppelen', desc: 'Wij verbinden de agent met je bestaande WhatsApp Business nummer.' },
      { step: '02', title: 'Flows instellen', desc: 'We configureren de gespreksflows op basis van jouw diensten en kwalificatiecriteria.' },
      { step: '03', title: 'Automatisch actief', desc: 'Elk inkomend bericht wordt direct beantwoord, 24/7.' },
    ],
    usecases: [
      { title: 'E-commerce', desc: 'Vragen over bestellingen, levertijden en retouren automatisch beantwoord.' },
      { title: 'Zorg & gezondheid', desc: 'Patiënten maken afspraken via WhatsApp zonder te hoeven bellen.' },
      { title: 'Horeca', desc: 'Reserveringen, menukaart en bezorgvragen direct via WhatsApp afgehandeld.' },
      { title: 'Dienstverlening', desc: 'Offerteaanvragen en intake via WhatsApp — leads direct in je CRM.' },
    ],
    results: [{ value: '3 sec', label: 'gemiddelde reactietijd' }, { value: '21x', label: 'hogere conversie' }, { value: '98%', label: 'open rate WhatsApp' }, { value: '70+', label: 'bedrijven gebruiken dit' }],
  },
  'sms-agent': {
    icon: '📱', title: 'SMS Agent', tagline: 'Voert SMS-gesprekken met een open rate van 98%', color: '#B45309',
    intro: 'SMS wordt direct gelezen. De SMS agent verstuurt en ontvangt berichten voor follow-up, herinneringen en kwalificatie — volledig geautomatiseerd en met CRM-integratie.',
    bullets: ['98% open rate', 'Verlaagt no-shows met 30%', 'Volledige CRM-integratie', 'Automatische follow-up reeksen', 'Besparing: 10–15 uur/mnd'],
    stat: '30% minder no-shows', users: '30+ bedrijven',
    howItWorks: [
      { step: '01', title: 'SMS nummer koppelen', desc: 'We koppelen een zakelijk SMS-nummer aan de agent en jouw CRM.' },
      { step: '02', title: 'Campagnes instellen', desc: 'Configureer herinneringen, follow-ups en kwalificatieflows.' },
      { step: '03', title: 'Automatisch verzenden', desc: 'De agent verstuurt en ontvangt berichten op basis van triggers vanuit je CRM.' },
    ],
    usecases: [
      { title: 'Afsprakenherinneringen', desc: 'Automatische SMS-herinneringen reduceren no-shows met 30%.' },
      { title: 'Lead follow-up', desc: 'Inkomende leads krijgen binnen seconden een SMS en worden gekwalificeerd.' },
      { title: 'Betalingsherinneringen', desc: 'Openstaande facturen automatisch opgevolgd via SMS.' },
      { title: 'Post-service feedback', desc: 'Na een dienst automatisch om feedback vragen via SMS.' },
    ],
    results: [{ value: '98%', label: 'open rate' }, { value: '30%', label: 'minder no-shows' }, { value: '10–15 uur', label: 'bespaard per maand' }, { value: '30+', label: 'bedrijven gebruiken dit' }],
  },
  'instagram-dm': {
    icon: '📸', title: 'Instagram DM Agent', tagline: 'Zet interesse via Instagram DM om in waardevolle afspraken', color: '#DB2777',
    intro: 'Elk hartje, reactie en DM op Instagram is een potentiële lead. De Instagram DM agent reageert direct op berichten, kwalificeert geïnteresseerden en boekt afspraken — 24/7.',
    bullets: ['Reageert direct op DM\'s, 24/7', 'Kwalificeert leads automatisch', 'Boekt afspraken direct in je agenda', 'Integreert met CRM', 'Besparing: 10–15 uur/mnd'],
    stat: '10–15 uur/mnd bespaard', users: '35+ bedrijven',
    howItWorks: [
      { step: '01', title: 'Instagram koppelen', desc: 'We verbinden de agent met je Instagram Business account.' },
      { step: '02', title: 'Gespreksflows instellen', desc: 'Configureer hoe de agent reageert op DM\'s en wat de kwalificatiecriteria zijn.' },
      { step: '03', title: 'Automatisch actief', desc: 'Elke DM wordt direct beantwoord — ook midden in de nacht.' },
    ],
    usecases: [
      { title: 'Coaches & trainers', desc: 'Geïnteresseerden na een post direct converteren naar een intake gesprek.' },
      { title: 'Beauty & wellness', desc: 'Afspraakboekingen direct via Instagram DM, geen app of bellen nodig.' },
      { title: 'Mode & retail', desc: 'Vragen over producten direct beantwoord, klanten doorgeleid naar de shop.' },
      { title: 'Evenementen', desc: 'Interesse omzetten in ticketverkoop of registraties.' },
    ],
    results: [{ value: '< 5 sec', label: 'reactietijd' }, { value: '24/7', label: 'actief' }, { value: '10–15 uur', label: 'bespaard per maand' }, { value: '35+', label: 'bedrijven gebruiken dit' }],
  },
  'facebook-messenger': {
    icon: '📘', title: 'Facebook Messenger Agent', tagline: 'Zet interesse via Messenger om in klanten', color: '#1D4ED8',
    intro: 'Facebook advertenties genereren leads — maar wie antwoordt er als je slapt? De Messenger agent vangt elke lead op, kwalificeert automatisch en zet berichten om in afspraken.',
    bullets: ['Vangt elke advertentielead automatisch op', 'Boekt afspraken direct', 'Integreert met CRM & pipeline', 'Reageert binnen seconden', 'Besparing: 10–15 uur/mnd'],
    stat: '10–15 uur/mnd bespaard', users: '25+ bedrijven',
    howItWorks: [
      { step: '01', title: 'Facebook pagina koppelen', desc: 'We verbinden de agent met je Facebook Business pagina en eventuele advertentiecampagnes.' },
      { step: '02', title: 'Flows configureren', desc: 'De agent wordt geconfigureerd op jouw aanbod en kwalificatieregels.' },
      { step: '03', title: 'Elke lead opgevangen', desc: 'Berichten vanuit advertenties en organisch verkeer worden direct beantwoord.' },
    ],
    usecases: [
      { title: 'Lokale bedrijven', desc: 'Facebook-advertenties converteren direct naar afspraken zonder handmatige opvolging.' },
      { title: 'Vastgoed', desc: 'Geïnteresseerden uit Facebook-advertenties direct kwalificeren en inplannen.' },
      { title: 'Opleidingen & cursussen', desc: 'Inschrijvingen en informatievragen automatisch afgehandeld.' },
      { title: 'Autohandel', desc: 'Proefritaanvragen en prijsvragen direct verwerkt.' },
    ],
    results: [{ value: '100%', label: 'leads opgevangen' }, { value: '< 5 sec', label: 'reactietijd' }, { value: '10–15 uur', label: 'bespaard per maand' }, { value: '25+', label: 'bedrijven gebruiken dit' }],
  },
  'email-agent': {
    icon: '✉️', title: 'E-mailagent', tagline: 'Verstuurt en beantwoordt e-mails voor optimale klantervaring', color: '#0D9488',
    intro: 'E-mail is nog steeds het drukste kanaal. De e-mailagent leest, categoriseert, beantwoordt en stuurt follow-ups — volledig automatisch, zodat je inbox nooit meer overloopt.',
    bullets: ['Beantwoordt 60–80% van e-mails automatisch', 'Categoriseert en prioriteert berichten', 'Stuurt follow-ups op het juiste moment', 'Integreert met je mailbox en CRM', 'Besparing: 10–20 uur/mnd'],
    stat: '10–20 uur/mnd bespaard', users: '50+ bedrijven',
    howItWorks: [
      { step: '01', title: 'Mailbox koppelen', desc: 'We verbinden de agent met je zakelijke e-mailaccount (Gmail, Outlook, etc.).' },
      { step: '02', title: 'Trainen & configureren', desc: 'De agent leert jouw tone of voice en de meest voorkomende e-mailtypen.' },
      { step: '03', title: 'Automatisch verwerken', desc: 'Inkomende mail wordt gelezen, gecategoriseerd en beantwoord of doorgezet.' },
    ],
    usecases: [
      { title: 'Klantenservice', desc: 'Standaard vragen direct beantwoord, complexe zaken doorgestuurd naar de juiste medewerker.' },
      { title: 'Sales', desc: 'Opvolging van offertes en koude leads volledig geautomatiseerd.' },
      { title: 'Recruitment', desc: 'Sollicitaties automatisch bevestigd, gecategoriseerd en ingepland.' },
      { title: 'Finance', desc: 'Factuurvragen en betalingsherinneringen automatisch verwerkt.' },
    ],
    results: [{ value: '60–80%', label: 'automatisch beantwoord' }, { value: '10–20 uur', label: 'bespaard per maand' }, { value: '24/7', label: 'reactief' }, { value: '50+', label: 'bedrijven gebruiken dit' }],
  },
  'lead-nurturing': {
    icon: '🎯', title: 'Lead Nurturing Agent', tagline: 'Activeert slapende leads via meerdere kanalen', color: '#7C3AED',
    intro: 'De meeste leads kopen niet direct. De lead nurturing agent volgt ze op via e-mail, SMS of WhatsApp op het juiste moment — en stuurt hete leads automatisch door naar sales.',
    bullets: ['Reactiveert slapende pipeline', 'Multi-channel: e-mail, SMS, WhatsApp', 'Detecteert koopintentie automatisch', 'Stuurt hete leads door naar sales', 'Besparing: 20–30 uur/mnd'],
    stat: '20–30 uur/mnd bespaard', users: '40+ bedrijven',
    howItWorks: [
      { step: '01', title: 'CRM koppelen', desc: 'We verbinden de agent met je CRM en importeren je bestaande leads.' },
      { step: '02', title: 'Sequenties instellen', desc: 'Configureer de opvolgsequenties per fase in de funnel en per kanaal.' },
      { step: '03', title: 'Automatisch opvolgen', desc: 'De agent volgt op, detecteert interesse en escaleert naar sales op het juiste moment.' },
    ],
    usecases: [
      { title: 'B2B sales', desc: 'Langere salescycli worden geautomatiseerd begeleid van interesse naar beslissing.' },
      { title: 'Vastgoed', desc: 'Potentiële kopers periodiek geïnformeerd totdat ze klaar zijn om te kopen.' },
      { title: 'SaaS', desc: 'Trial-gebruikers worden automatisch begeleid naar conversie.' },
      { title: 'Opleidingen', desc: 'Geïnteresseerden worden warm gehouden tot ze zich inschrijven.' },
    ],
    results: [{ value: '20–30 uur', label: 'bespaard per maand' }, { value: '3x', label: 'meer conversies uit bestaande leads' }, { value: 'Multi-channel', label: 'e-mail, SMS, WhatsApp' }, { value: '40+', label: 'bedrijven gebruiken dit' }],
  },
  'maatwerk': {
    icon: '⚙️', title: 'Maatwerk Agent', tagline: 'Volledig op maat gebouwd voor jouw specifieke toepassing', color: '#0F172A',
    intro: 'Geen standaardoplossing die past bij jouw proces? Wij bouwen precies wat jouw bedrijf nodig heeft — van complexe workflows tot unieke integraties, van idee tot live in 7–20 dagen.',
    bullets: ['Volledig gebouwd op jouw proces', 'Onbeperkte integraties mogelijk', 'Van idee tot live in 7–20 dagen', 'Schaalbaar en aanpasbaar', 'Dedicated support tijdens en na bouw'],
    stat: 'Op maat geprijsd', users: '20+ bedrijven',
    howItWorks: [
      { step: '01', title: 'Intake gesprek', desc: 'We brengen jouw proces, tools en doelen in kaart. Geen technische kennis nodig.' },
      { step: '02', title: 'Bouwen & testen', desc: 'Ons team bouwt de agent op maat en test uitgebreid voordat hij live gaat.' },
      { step: '03', title: 'Live & doorontwikkelen', desc: 'De agent gaat live. We monitoren, optimaliseren en breiden uit waar nodig.' },
    ],
    usecases: [
      { title: 'Complexe workflows', desc: 'Meerdere systemen, stappen en uitzonderingen — wij automatiseren het volledig.' },
      { title: 'Unieke integraties', desc: 'Legacy systemen, maatwerk software of specifieke API\'s? Geen probleem.' },
      { title: 'Interne processen', desc: 'HR, finance, operations — interne workflows volledig geautomatiseerd.' },
      { title: 'Industrie-specifiek', desc: 'Zorg, logistiek, productie — elk domein heeft zijn eigen vereisten.' },
    ],
    results: [{ value: '7–20 dagen', label: 'van idee tot live' }, { value: '∞', label: 'integratiemogelijkheden' }, { value: '100%', label: 'op maat gebouwd' }, { value: '20+', label: 'bedrijven gebruiken dit' }],
  },
}

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const agent = AGENTS[slug]
  if (!agent) return notFound()

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", color: '#1E293B', background: '#fff', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #F1F5F9', padding: '16px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo-transparent.png" alt="agentmakers.io" style={{ height: 36, width: 'auto', display: 'block' }} />
          </a>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            <a href="/ai-agents" style={{ fontWeight: 600, color: '#64748B', fontSize: '.9rem', textDecoration: 'none' }}>← Alle agents</a>
            <a href="#demo" style={{ background: '#0D9488', color: '#fff', padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: '.85rem', textDecoration: 'none' }}>Demo aanvragen</a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 140, paddingBottom: 80, background: 'linear-gradient(180deg, #F0FDFA 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: `${agent.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 20px' }}>
            {agent.icon}
          </div>
          <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', lineHeight: 1.15, marginBottom: 14 }}>
            {agent.title}
          </h1>
          <p style={{ fontSize: '1.15rem', color: '#64748B', maxWidth: 560, margin: '0 auto 40px' }}>{agent.intro}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
            {agent.results.map(r => (
              <div key={r.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.8rem', fontWeight: 700, color: agent.color }}>{r.value}</div>
                <div style={{ fontSize: '.78rem', color: '#64748B', marginTop: 2 }}>{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '72px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <div>
            <div style={{ color: agent.color, fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>Wat de agent doet</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)', marginBottom: 24 }}>{agent.tagline}</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {agent.bullets.map(b => (
                <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.95rem', color: '#334155' }}>
                  <span style={{ color: agent.color, fontWeight: 700, marginTop: 1, flexShrink: 0 }}>✓</span>{b}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {agent.howItWorks.map(step => (
              <div key={step.step} style={{ background: '#F8FAFC', borderRadius: 12, padding: '20px 24px', display: 'flex', gap: 16 }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', fontWeight: 700, color: agent.color, flexShrink: 0, minWidth: 32 }}>{step.step}</div>
                <div>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontSize: '.88rem', color: '#64748B', lineHeight: 1.5 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section style={{ padding: '72px 0', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ color: agent.color, fontWeight: 600, fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>Toepassingen</div>
            <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)' }}>Wie gebruikt deze agent?</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {agent.usecases.map(uc => (
              <div key={uc.title} style={{ background: '#fff', borderRadius: 12, padding: '24px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>{uc.title}</div>
                <div style={{ fontSize: '.88rem', color: '#64748B', lineHeight: 1.5 }}>{uc.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO */}
      <section id="demo" style={{ background: 'linear-gradient(160deg, #0A1628 0%, #0F2A3A 50%, #0A1628 100%)', padding: '80px 0' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', marginBottom: 12 }}>
            Zie de {agent.title} in actie
          </h2>
          <p style={{ color: 'rgba(240,244,248,0.6)', fontSize: '1rem', marginBottom: 40 }}>
            Plan een gratis demo van 15 minuten. We bouwen live een voorbeeld voor jouw situatie.
          </p>
          <DemoForm
            slug={`ai-agent-${slug}`}
            lang="nl"
            strings={{
              cta_headline: `Demo: ${agent.title}`,
              cta_sub: 'Binnen enkele minuten ontvangt u een persoonlijke demo-link.',
              name: 'Uw naam', email: 'E-mailadres', phone: 'Telefoonnummer',
              website: 'Website (optioneel)', company: 'Bedrijfsnaam',
              submit: 'Plan gratis demo', sending: 'Even geduld…',
              error: 'Probeer het opnieuw', success: 'Demo aangevraagd!',
              success_sub: 'We nemen binnen 1 werkdag contact op.',
              trust: 'Geen verplichtingen. Gratis.',
              diensten_label: '',
            }}
          />
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0F172A', color: '#CBD5E1', padding: '40px 0', textAlign: 'center', fontSize: '.85rem' }}>
        <p>© 2026 agentmakers.io · <a href="/ai-agents" style={{ color: '#0D9488', textDecoration: 'none' }}>Alle AI Agents</a> · <a href="/" style={{ color: '#64748B', textDecoration: 'none' }}>Home</a></p>
      </footer>
    </div>
  )
}
