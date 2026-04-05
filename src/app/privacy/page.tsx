import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy – Agentmakers.io',
  description: 'Lees hoe Agentmakers.io uw persoonsgegevens verzamelt, gebruikt en beschermt.',
}

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Nunito', sans-serif" }}>

      {/* Header */}
      <header style={{ background: '#0F172A', padding: '20px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <a href="/" style={{ color: '#5EEAD4', textDecoration: 'none', fontSize: '.9rem', fontWeight: 600 }}>
            ← Terug naar agentmakers.io
          </a>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: '#0F172A', padding: '56px 24px 64px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ color: '#5EEAD4', fontWeight: 700, fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>
            Privacybeleid
          </div>
          <h1 style={{ fontFamily: "'Poppins', sans-serif", color: '#fff', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.2 }}>
            Privacy Policy
          </h1>
          <p style={{ color: '#94A3B8', fontSize: '1rem', margin: 0 }}>
            Laatst bijgewerkt: 2 maart 2026
          </p>
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '56px 24px 96px' }}>

        <div style={{ background: '#fff', borderRadius: 16, padding: '48px 52px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', lineHeight: 1.8, color: '#334155', fontSize: '1rem' }}>

          <p style={{ marginTop: 0 }}>
            Welkom bij Agentmakers.io ("wij", "ons", "onze"). Wij respecteren uw privacy en zetten ons in om uw persoonsgegevens te beschermen. Deze Privacy Policy legt uit hoe wij gegevens verzamelen, gebruiken, opslaan en beschermen wanneer u onze website bezoekt of gebruik maakt van onze diensten.
          </p>

          <Section number="1" title="Wie wij zijn">
            <p>Agentmakers.io is een aanbieder van AI-oplossingen, waaronder maar niet beperkt tot:</p>
            <ul>
              <li>AI chatbots (RAG)</li>
              <li>Voice agents (inbound/outbound)</li>
              <li>Messaging agents (WhatsApp, SMS, social media)</li>
              <li>Automatiseringsoplossingen</li>
            </ul>
            <p>Voor vragen over privacy kunt u contact opnemen via:<br />
              <strong>E-mail:</strong> <a href="mailto:info@agentmakers.io" style={{ color: '#0D9488' }}>info@agentmakers.io</a><br />
              <strong>Adres:</strong> [bedrijfsadres invullen]
            </p>
          </Section>

          <Section number="2" title="Welke gegevens wij verzamelen">
            <p>Wij verzamelen alleen gegevens die noodzakelijk zijn om onze diensten te leveren en te verbeteren.</p>

            <SubSection title="2.1 Gegevens die u zelf verstrekt">
              <p>Wanneer u een formulier invult of contact met ons opneemt:</p>
              <ul>
                <li>Naam</li>
                <li>Bedrijfsnaam</li>
                <li>E-mailadres</li>
                <li>Telefoonnummer</li>
                <li>Inhoud van uw bericht</li>
                <li>Eventuele aanvullende informatie die u vrijwillig deelt</li>
              </ul>
            </SubSection>

            <SubSection title="2.2 Automatisch verzamelde gegevens">
              <p>Wanneer u onze website bezoekt:</p>
              <ul>
                <li>IP-adres</li>
                <li>Browser en apparaat type</li>
                <li>Pagina's die u bezoekt</li>
                <li>Tijd en duur van uw bezoek</li>
                <li>Referrer URL</li>
              </ul>
            </SubSection>

            <SubSection title="2.3 Gegevens via AI-interacties">
              <p>Wanneer u gebruik maakt van onze AI-systemen:</p>
              <ul>
                <li>Gespreksinhoud (chat/voice)</li>
                <li>Gebruikersinput en gegenereerde output</li>
                <li>Metadata van interacties</li>
              </ul>
            </SubSection>
          </Section>

          <Section number="3" title="Doeleinden van gegevensverwerking">
            <p>Wij gebruiken uw gegevens uitsluitend voor:</p>
            <ul>
              <li>Het leveren van onze diensten</li>
              <li>Het beantwoorden van vragen en aanvragen</li>
              <li>Het verbeteren van onze AI-systemen</li>
              <li>Klantondersteuning</li>
              <li>Analyse en optimalisatie van onze website</li>
              <li>Wettelijke verplichtingen</li>
            </ul>
            <Highlight>Wij verkopen nooit uw gegevens.</Highlight>
          </Section>

          <Section number="4" title="Rechtsgrond (AVG/GDPR)">
            <p>Wij verwerken persoonsgegevens op basis van:</p>
            <ul>
              <li>Toestemming (bijv. formulier invullen)</li>
              <li>Uitvoering van een overeenkomst</li>
              <li>Gerechtvaardigd belang (bijv. verbeteren van diensten)</li>
              <li>Wettelijke verplichting</li>
            </ul>
          </Section>

          <Section number="5" title="Opslag en beveiliging">
            <p>Wij nemen beveiliging serieus.</p>

            <SubSection title="5.1 Beveiligingsmaatregelen">
              <ul>
                <li>Encryptie van data (in transit en waar mogelijk at rest)</li>
                <li>Beperkte toegang tot systemen</li>
                <li>Monitoring en logging</li>
                <li>Bescherming tegen ongeautoriseerde toegang</li>
              </ul>
            </SubSection>

            <SubSection title="5.2 Dataretentie">
              <p>Wij bewaren gegevens niet langer dan nodig:</p>
              <ul>
                <li>Leads: max. 24 maanden (tenzij klant)</li>
                <li>Klantdata: zolang de overeenkomst loopt + wettelijke termijn</li>
                <li>AI-interacties: afhankelijk van contract/instellingen</li>
              </ul>
            </SubSection>
          </Section>

          <Section number="6" title="Delen van gegevens">
            <p>Wij delen gegevens alleen wanneer noodzakelijk.</p>

            <SubSection title="6.1 Met verwerkers">
              <p>Bijvoorbeeld:</p>
              <ul>
                <li>Hostingproviders</li>
                <li>AI-infrastructuur</li>
                <li>CRM-systemen</li>
                <li>E-maildiensten</li>
              </ul>
            </SubSection>

            <SubSection title="6.2 Internationale doorgifte">
              <p>Indien gegevens buiten de EU worden verwerkt:</p>
              <ul>
                <li>Gebeurt dit alleen met passende waarborgen (zoals SCC's)</li>
                <li>Of binnen jurisdicties met adequaatheidsbesluit</li>
              </ul>
            </SubSection>
          </Section>

          <Section number="7" title="AI en geautomatiseerde verwerking">
            <p>Onze diensten maken gebruik van AI.</p>
            <ul>
              <li>Beslissingen worden niet volledig geautomatiseerd genomen zonder menselijke controle, tenzij expliciet overeengekomen</li>
              <li>AI-output kan fouten bevatten en dient als ondersteuning, niet als definitief advies</li>
            </ul>
          </Section>

          <Section number="8" title="Cookies">
            <p>Wij gebruiken cookies om:</p>
            <ul>
              <li>Websitefunctionaliteit te garanderen</li>
              <li>Gebruikerservaring te verbeteren</li>
              <li>Analyse te doen (bijv. via analytics tools)</li>
            </ul>
            <p>U kunt cookies beheren via uw browserinstellingen.</p>
          </Section>

          <Section number="9" title="Uw rechten (AVG)">
            <p>U heeft het recht om:</p>
            <ul>
              <li>Uw gegevens in te zien</li>
              <li>Uw gegevens te laten corrigeren</li>
              <li>Uw gegevens te laten verwijderen</li>
              <li>Verwerking te beperken</li>
              <li>Bezwaar te maken</li>
              <li>Data over te dragen (dataportabiliteit)</li>
            </ul>
            <p>
              Verzoeken kunnen worden ingediend via: <a href="mailto:privacy@agentmakers.io" style={{ color: '#0D9488' }}>privacy@agentmakers.io</a><br />
              Wij reageren binnen 30 dagen.
            </p>
          </Section>

          <Section number="10" title="Derden en externe links">
            <p>Onze website kan links bevatten naar externe websites. Wij zijn niet verantwoordelijk voor het privacybeleid van deze partijen.</p>
          </Section>

          <Section number="11" title="Minderjarigen">
            <p>Onze diensten zijn niet gericht op personen onder de 16 jaar. Wij verzamelen niet bewust gegevens van minderjarigen.</p>
          </Section>

          <Section number="12" title="Wijzigingen">
            <p>Wij behouden ons het recht voor om deze Privacy Policy aan te passen. De meest recente versie is altijd beschikbaar op onze website.</p>
          </Section>

          <Section number="13" title="Contact" last>
            <p>Voor vragen of klachten:</p>
            <p>
              <strong>Agentmakers.io</strong><br />
              E-mail: <a href="mailto:info@agentmakers.io" style={{ color: '#0D9488' }}>info@agentmakers.io</a>
            </p>
            <p>U heeft ook het recht om een klacht in te dienen bij de <a href="https://www.autoriteitpersoonsgegevens.nl" target="_blank" rel="noopener noreferrer" style={{ color: '#0D9488' }}>Autoriteit Persoonsgegevens</a>.</p>
          </Section>

        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: '#0F172A', color: '#64748B', padding: '28px 24px', textAlign: 'center', fontSize: '.85rem' }}>
        <p style={{ margin: 0 }}>© 2026 agentmakers.io. Alle rechten voorbehouden.</p>
      </footer>
    </div>
  )
}

function Section({ number, title, children, last }: { number: string; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDFA', color: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.9rem', fontFamily: "'Poppins', sans-serif", flexShrink: 0 }}>
          {number}
        </div>
        <h2 style={{ fontFamily: "'Poppins', sans-serif", color: '#0F172A', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
          {title}
        </h2>
      </div>
      <div style={{ paddingLeft: 50 }}>{children}</div>
      {!last && <div style={{ borderBottom: '1px solid #F1F5F9', marginTop: 48 }} />}
    </div>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontFamily: "'Poppins', sans-serif", color: '#0F172A', fontSize: '1rem', fontWeight: 600, marginBottom: 8, marginTop: 20 }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 10, padding: '14px 20px', color: '#0F766E', fontWeight: 700, fontSize: '.95rem', marginTop: 16 }}>
      {children}
    </div>
  )
}
