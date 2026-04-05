import type { Metadata } from 'next'
import type { CSSProperties } from 'react'

export const metadata: Metadata = {
  title: 'Privacy Policy – Agentmakers.io',
}

const sub: CSSProperties = { fontFamily: "'Poppins', sans-serif", color: '#0F172A', fontSize: '1rem', fontWeight: 600, marginBottom: 8, marginTop: 20 }
const highlight: CSSProperties = { background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 10, padding: '14px 20px', color: '#0F766E', fontWeight: 700, fontSize: '.95rem', marginTop: 16 }
const link: CSSProperties = { color: '#0D9488' }

const data = {
  nl: {
    back: '← Terug naar agentmakers.io',
    label: 'Privacybeleid',
    title: 'Privacy Policy',
    updated: 'Laatst bijgewerkt: 2 maart 2026',
    footer: 'Alle rechten voorbehouden.',
    intro: 'Welkom bij Agentmakers.io ("wij", "ons", "onze"). Wij respecteren uw privacy en zetten ons in om uw persoonsgegevens te beschermen. Deze Privacy Policy legt uit hoe wij gegevens verzamelen, gebruiken, opslaan en beschermen wanneer u onze website bezoekt of gebruik maakt van onze diensten.',
    sections: [
      { num: '1', title: 'Wie wij zijn', body: <>
        <p>Agentmakers.io is een aanbieder van AI-oplossingen, waaronder maar niet beperkt tot:</p>
        <ul><li>AI chatbots (RAG)</li><li>Voice agents (inbound/outbound)</li><li>Messaging agents (WhatsApp, SMS, social media)</li><li>Automatiseringsoplossingen</li></ul>
        <p>Voor vragen over privacy: <strong>E-mail:</strong> <a href="mailto:info@agentmakers.io" style={link}>info@agentmakers.io</a></p>
      </> },
      { num: '2', title: 'Welke gegevens wij verzamelen', body: <>
        <p>Wij verzamelen alleen gegevens die noodzakelijk zijn.</p>
        <h3 style={sub}>2.1 Gegevens die u zelf verstrekt</h3>
        <ul><li>Naam</li><li>Bedrijfsnaam</li><li>E-mailadres</li><li>Telefoonnummer</li><li>Inhoud van uw bericht</li></ul>
        <h3 style={sub}>2.2 Automatisch verzamelde gegevens</h3>
        <ul><li>IP-adres</li><li>Browser en apparaat type</li><li>Pagina's die u bezoekt</li><li>Tijd en duur van uw bezoek</li><li>Referrer URL</li></ul>
        <h3 style={sub}>2.3 Gegevens via AI-interacties</h3>
        <ul><li>Gespreksinhoud (chat/voice)</li><li>Gebruikersinput en gegenereerde output</li><li>Metadata van interacties</li></ul>
      </> },
      { num: '3', title: 'Doeleinden van gegevensverwerking', body: <>
        <ul><li>Het leveren van onze diensten</li><li>Het beantwoorden van vragen</li><li>Het verbeteren van onze AI-systemen</li><li>Klantondersteuning</li><li>Analyse en optimalisatie van onze website</li><li>Wettelijke verplichtingen</li></ul>
        <div style={highlight}>Wij verkopen nooit uw gegevens.</div>
      </> },
      { num: '4', title: 'Rechtsgrond (AVG/GDPR)', body: <>
        <ul><li>Toestemming (bijv. formulier invullen)</li><li>Uitvoering van een overeenkomst</li><li>Gerechtvaardigd belang</li><li>Wettelijke verplichting</li></ul>
      </> },
      { num: '5', title: 'Opslag en beveiliging', body: <>
        <h3 style={sub}>5.1 Beveiligingsmaatregelen</h3>
        <ul><li>Encryptie van data (in transit en at rest)</li><li>Beperkte toegang tot systemen</li><li>Monitoring en logging</li><li>Bescherming tegen ongeautoriseerde toegang</li></ul>
        <h3 style={sub}>5.2 Dataretentie</h3>
        <ul><li>Leads: max. 24 maanden (tenzij klant)</li><li>Klantdata: zolang de overeenkomst loopt + wettelijke termijn</li><li>AI-interacties: afhankelijk van contract/instellingen</li></ul>
      </> },
      { num: '6', title: 'Delen van gegevens', body: <>
        <h3 style={sub}>6.1 Met verwerkers</h3>
        <ul><li>Hostingproviders</li><li>AI-infrastructuur</li><li>CRM-systemen</li><li>E-maildiensten</li></ul>
        <h3 style={sub}>6.2 Internationale doorgifte</h3>
        <ul><li>Alleen met passende waarborgen (zoals SCC&apos;s)</li><li>Of binnen jurisdicties met adequaatheidsbesluit</li></ul>
      </> },
      { num: '7', title: 'AI en geautomatiseerde verwerking', body: <>
        <ul><li>Beslissingen worden niet volledig geautomatiseerd genomen zonder menselijke controle, tenzij expliciet overeengekomen</li><li>AI-output kan fouten bevatten en dient als ondersteuning, niet als definitief advies</li></ul>
      </> },
      { num: '8', title: 'Cookies', body: <>
        <ul><li>Websitefunctionaliteit garanderen</li><li>Gebruikerservaring verbeteren</li><li>Analyse doen (bijv. via analytics tools)</li></ul>
        <p>U kunt cookies beheren via uw browserinstellingen.</p>
      </> },
      { num: '9', title: 'Uw rechten (AVG)', body: <>
        <ul><li>Gegevens inzien</li><li>Gegevens corrigeren</li><li>Gegevens laten verwijderen</li><li>Verwerking beperken</li><li>Bezwaar maken</li><li>Data overdragen (dataportabiliteit)</li></ul>
        <p>Verzoeken via: <a href="mailto:privacy@agentmakers.io" style={link}>privacy@agentmakers.io</a>. Wij reageren binnen 30 dagen.</p>
      </> },
      { num: '10', title: 'Derden en externe links', body: <p>Onze website kan links bevatten naar externe websites. Wij zijn niet verantwoordelijk voor het privacybeleid van deze partijen.</p> },
      { num: '11', title: 'Minderjarigen', body: <p>Onze diensten zijn niet gericht op personen onder de 16 jaar. Wij verzamelen niet bewust gegevens van minderjarigen.</p> },
      { num: '12', title: 'Wijzigingen', body: <p>Wij behouden ons het recht voor om deze Privacy Policy aan te passen. De meest recente versie is altijd beschikbaar op onze website.</p> },
      { num: '13', title: 'Contact', body: <>
        <p><strong>Agentmakers.io</strong><br />E-mail: <a href="mailto:info@agentmakers.io" style={link}>info@agentmakers.io</a></p>
        <p>U heeft ook het recht om een klacht in te dienen bij de <a href="https://www.autoriteitpersoonsgegevens.nl" target="_blank" rel="noopener noreferrer" style={link}>Autoriteit Persoonsgegevens</a>.</p>
      </> },
    ],
  },
  en: {
    back: '← Back to agentmakers.io',
    label: 'Privacy Policy',
    title: 'Privacy Policy',
    updated: 'Last updated: 2 March 2026',
    footer: 'All rights reserved.',
    intro: 'Welcome to Agentmakers.io ("we", "us", "our"). We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, store and protect data when you visit our website or use our services.',
    sections: [
      { num: '1', title: 'Who we are', body: <>
        <p>Agentmakers.io is a provider of AI solutions, including but not limited to:</p>
        <ul><li>AI chatbots (RAG)</li><li>Voice agents (inbound/outbound)</li><li>Messaging agents (WhatsApp, SMS, social media)</li><li>Automation solutions</li></ul>
        <p>For privacy questions: <strong>Email:</strong> <a href="mailto:info@agentmakers.io" style={link}>info@agentmakers.io</a></p>
      </> },
      { num: '2', title: 'What data we collect', body: <>
        <p>We only collect data necessary to provide and improve our services.</p>
        <h3 style={sub}>2.1 Data you provide yourself</h3>
        <ul><li>Name</li><li>Company name</li><li>Email address</li><li>Phone number</li><li>Content of your message</li></ul>
        <h3 style={sub}>2.2 Automatically collected data</h3>
        <ul><li>IP address</li><li>Browser and device type</li><li>Pages you visit</li><li>Time and duration of your visit</li><li>Referrer URL</li></ul>
        <h3 style={sub}>2.3 Data via AI interactions</h3>
        <ul><li>Conversation content (chat/voice)</li><li>User input and generated output</li><li>Interaction metadata</li></ul>
      </> },
      { num: '3', title: 'Purposes of data processing', body: <>
        <ul><li>Providing our services</li><li>Responding to questions and requests</li><li>Improving our AI systems</li><li>Customer support</li><li>Website analysis and optimisation</li><li>Legal obligations</li></ul>
        <div style={highlight}>We never sell your data.</div>
      </> },
      { num: '4', title: 'Legal basis (GDPR)', body: <>
        <ul><li>Consent (e.g. filling in a form)</li><li>Performance of a contract</li><li>Legitimate interest</li><li>Legal obligation</li></ul>
      </> },
      { num: '5', title: 'Storage and security', body: <>
        <h3 style={sub}>5.1 Security measures</h3>
        <ul><li>Data encryption (in transit and at rest)</li><li>Restricted system access</li><li>Monitoring and logging</li><li>Protection against unauthorised access</li></ul>
        <h3 style={sub}>5.2 Data retention</h3>
        <ul><li>Leads: max. 24 months (unless client)</li><li>Client data: for the duration of the agreement + statutory period</li><li>AI interactions: depending on contract/settings</li></ul>
      </> },
      { num: '6', title: 'Sharing data', body: <>
        <h3 style={sub}>6.1 With processors</h3>
        <ul><li>Hosting providers</li><li>AI infrastructure</li><li>CRM systems</li><li>Email services</li></ul>
        <h3 style={sub}>6.2 International transfers</h3>
        <ul><li>Only with appropriate safeguards (such as SCCs)</li><li>Or within jurisdictions with an adequacy decision</li></ul>
      </> },
      { num: '7', title: 'AI and automated processing', body: <>
        <ul><li>Decisions are not made fully automatically without human oversight, unless explicitly agreed</li><li>AI output may contain errors and serves as support, not definitive advice</li></ul>
      </> },
      { num: '8', title: 'Cookies', body: <>
        <ul><li>Ensure website functionality</li><li>Improve user experience</li><li>Perform analysis (e.g. via analytics tools)</li></ul>
        <p>You can manage cookies via your browser settings.</p>
      </> },
      { num: '9', title: 'Your rights (GDPR)', body: <>
        <ul><li>Access your data</li><li>Correct your data</li><li>Delete your data</li><li>Restrict processing</li><li>Object to processing</li><li>Data portability</li></ul>
        <p>Requests to: <a href="mailto:privacy@agentmakers.io" style={link}>privacy@agentmakers.io</a>. We respond within 30 days.</p>
      </> },
      { num: '10', title: 'Third parties and external links', body: <p>Our website may contain links to external websites. We are not responsible for their privacy policies.</p> },
      { num: '11', title: 'Minors', body: <p>Our services are not directed at persons under 16. We do not knowingly collect data from minors.</p> },
      { num: '12', title: 'Changes', body: <p>We reserve the right to update this Privacy Policy. The most recent version is always available on our website.</p> },
      { num: '13', title: 'Contact', body: <>
        <p><strong>Agentmakers.io</strong><br />Email: <a href="mailto:info@agentmakers.io" style={link}>info@agentmakers.io</a></p>
        <p>You also have the right to lodge a complaint with your national data protection authority.</p>
      </> },
    ],
  },
  es: {
    back: '← Volver a agentmakers.io',
    label: 'Política de privacidad',
    title: 'Política de Privacidad',
    updated: 'Última actualización: 2 de marzo de 2026',
    footer: 'Todos los derechos reservados.',
    intro: 'Bienvenido a Agentmakers.io ("nosotros", "nuestro"). Respetamos su privacidad y nos comprometemos a proteger sus datos personales. Esta Política de Privacidad explica cómo recopilamos, usamos, almacenamos y protegemos los datos cuando visita nuestro sitio web o utiliza nuestros servicios.',
    sections: [
      { num: '1', title: 'Quiénes somos', body: <>
        <p>Agentmakers.io es un proveedor de soluciones de IA, incluyendo entre otras:</p>
        <ul><li>Chatbots de IA (RAG)</li><li>Agentes de voz (entrante/saliente)</li><li>Agentes de mensajería (WhatsApp, SMS, redes sociales)</li><li>Soluciones de automatización</li></ul>
        <p>Consultas de privacidad: <strong>Email:</strong> <a href="mailto:info@agentmakers.io" style={link}>info@agentmakers.io</a></p>
      </> },
      { num: '2', title: 'Qué datos recopilamos', body: <>
        <p>Solo recopilamos los datos necesarios para prestar y mejorar nuestros servicios.</p>
        <h3 style={sub}>2.1 Datos que usted proporciona</h3>
        <ul><li>Nombre</li><li>Nombre de la empresa</li><li>Correo electrónico</li><li>Número de teléfono</li><li>Contenido de su mensaje</li></ul>
        <h3 style={sub}>2.2 Datos recopilados automáticamente</h3>
        <ul><li>Dirección IP</li><li>Tipo de navegador y dispositivo</li><li>Páginas que visita</li><li>Hora y duración de su visita</li><li>URL de referencia</li></ul>
        <h3 style={sub}>2.3 Datos de interacciones con IA</h3>
        <ul><li>Contenido de conversaciones (chat/voz)</li><li>Entrada del usuario y salida generada</li><li>Metadatos de interacciones</li></ul>
      </> },
      { num: '3', title: 'Finalidades del tratamiento', body: <>
        <ul><li>Prestar nuestros servicios</li><li>Responder preguntas y solicitudes</li><li>Mejorar nuestros sistemas de IA</li><li>Atención al cliente</li><li>Análisis y optimización del sitio web</li><li>Obligaciones legales</li></ul>
        <div style={highlight}>Nunca vendemos sus datos.</div>
      </> },
      { num: '4', title: 'Base legal (RGPD)', body: <>
        <ul><li>Consentimiento (p. ej. rellenar un formulario)</li><li>Ejecución de un contrato</li><li>Interés legítimo</li><li>Obligación legal</li></ul>
      </> },
      { num: '5', title: 'Almacenamiento y seguridad', body: <>
        <h3 style={sub}>5.1 Medidas de seguridad</h3>
        <ul><li>Cifrado de datos (en tránsito y en reposo)</li><li>Acceso restringido a los sistemas</li><li>Supervisión y registro</li><li>Protección contra accesos no autorizados</li></ul>
        <h3 style={sub}>5.2 Retención de datos</h3>
        <ul><li>Leads: máx. 24 meses (salvo que sean clientes)</li><li>Datos de clientes: durante la vigencia del contrato + plazo legal</li><li>Interacciones con IA: según contrato/configuración</li></ul>
      </> },
      { num: '6', title: 'Compartir datos', body: <>
        <h3 style={sub}>6.1 Con encargados del tratamiento</h3>
        <ul><li>Proveedores de alojamiento</li><li>Infraestructura de IA</li><li>Sistemas CRM</li><li>Servicios de correo electrónico</li></ul>
        <h3 style={sub}>6.2 Transferencias internacionales</h3>
        <ul><li>Solo con garantías adecuadas (como CCT)</li><li>O dentro de jurisdicciones con decisión de adecuación</li></ul>
      </> },
      { num: '7', title: 'IA y tratamiento automatizado', body: <>
        <ul><li>Las decisiones no se toman de forma completamente automatizada sin supervisión humana, salvo acuerdo expreso</li><li>El resultado de la IA puede contener errores y sirve de apoyo, no como asesoramiento definitivo</li></ul>
      </> },
      { num: '8', title: 'Cookies', body: <>
        <ul><li>Garantizar la funcionalidad del sitio web</li><li>Mejorar la experiencia del usuario</li><li>Realizar análisis (p. ej. mediante herramientas de analítica)</li></ul>
        <p>Puede gestionar las cookies desde la configuración de su navegador.</p>
      </> },
      { num: '9', title: 'Sus derechos (RGPD)', body: <>
        <ul><li>Acceder a sus datos</li><li>Rectificar sus datos</li><li>Suprimir sus datos</li><li>Limitar el tratamiento</li><li>Oponerse al tratamiento</li><li>Portabilidad de datos</li></ul>
        <p>Solicitudes a: <a href="mailto:privacy@agentmakers.io" style={link}>privacy@agentmakers.io</a>. Respondemos en 30 días.</p>
      </> },
      { num: '10', title: 'Terceros y enlaces externos', body: <p>Nuestro sitio web puede contener enlaces a sitios externos. No somos responsables de sus políticas de privacidad.</p> },
      { num: '11', title: 'Menores', body: <p>Nuestros servicios no están dirigidos a personas menores de 16 años. No recopilamos datos de menores de forma consciente.</p> },
      { num: '12', title: 'Cambios', body: <p>Nos reservamos el derecho de actualizar esta Política de Privacidad. La versión más reciente siempre estará disponible en nuestro sitio web.</p> },
      { num: '13', title: 'Contacto', body: <>
        <p><strong>Agentmakers.io</strong><br />Email: <a href="mailto:info@agentmakers.io" style={link}>info@agentmakers.io</a></p>
        <p>También tiene derecho a presentar una reclamación ante la autoridad de protección de datos competente.</p>
      </> },
    ],
  },
}

export default async function PrivacyLangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const l: 'nl' | 'en' | 'es' = (lang === 'en' || lang === 'es') ? lang : 'nl'
  const c = data[l]

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: '#0F172A', padding: '20px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <a href={`/${l}`} style={{ color: '#5EEAD4', textDecoration: 'none', fontSize: '.9rem', fontWeight: 600 }}>
            {c.back}
          </a>
        </div>
      </header>

      <div style={{ background: '#0F172A', padding: '56px 24px 64px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ color: '#5EEAD4', fontWeight: 700, fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>
            {c.label}
          </div>
          <h1 style={{ fontFamily: "'Poppins', sans-serif", color: '#fff', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.2 }}>
            {c.title}
          </h1>
          <p style={{ color: '#94A3B8', fontSize: '1rem', margin: 0 }}>{c.updated}</p>
        </div>
      </div>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '56px 24px 96px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '48px 52px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', lineHeight: 1.8, color: '#334155', fontSize: '1rem' }}>
          <p style={{ marginTop: 0 }}>{c.intro}</p>
          {c.sections.map((s, i) => (
            <div key={s.num} style={{ marginBottom: i === c.sections.length - 1 ? 0 : 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDFA', color: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.9rem', fontFamily: "'Poppins', sans-serif", flexShrink: 0 }}>
                  {s.num}
                </div>
                <h2 style={{ fontFamily: "'Poppins', sans-serif", color: '#0F172A', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                  {s.title}
                </h2>
              </div>
              <div style={{ paddingLeft: 50 }}>{s.body}</div>
              {i < c.sections.length - 1 && <div style={{ borderBottom: '1px solid #F1F5F9', marginTop: 48 }} />}
            </div>
          ))}
        </div>
      </main>

      <footer style={{ background: '#0F172A', color: '#64748B', padding: '28px 24px', textAlign: 'center', fontSize: '.85rem' }}>
        <p style={{ margin: 0 }}>© 2026 agentmakers.io. {c.footer}</p>
      </footer>
    </div>
  )
}
