import type { Metadata } from 'next'
import type { CSSProperties } from 'react'

export const metadata: Metadata = {
  title: 'Algemene Voorwaarden – Agentmakers.io',
}

export default async function VoorwaardenLangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const l: 'nl' | 'en' | 'es' = (lang === 'en' || lang === 'es') ? lang : 'nl'

  // Styles defined inside component to avoid any module-level evaluation ordering issues
  const sub: CSSProperties = { fontFamily: "'Poppins', sans-serif", color: '#0F172A', fontSize: '1rem', fontWeight: 600, marginBottom: 8, marginTop: 20 }
  const hl: CSSProperties = { background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 10, padding: '14px 20px', color: '#0F766E', fontWeight: 700, fontSize: '.95rem', marginTop: 16 }
  const warn: CSSProperties = { background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '14px 20px', color: '#C2410C', fontWeight: 700, fontSize: '.95rem', marginTop: 16 }
  const lnk: CSSProperties = { color: '#0D9488' }

  const data = {
  nl: {
    back: '← Terug naar agentmakers.io',
    label: 'Algemene Voorwaarden',
    title: 'Algemene Voorwaarden',
    updated: 'Laatst bijgewerkt: 5 maart 2026',
    footer: 'Alle rechten voorbehouden.',
    intro: 'Welkom bij Agentmakers.io. Door gebruik te maken van onze diensten gaat u akkoord met de onderstaande voorwaarden. Lees deze zorgvuldig door voordat u onze diensten gebruikt.',
    sections: [
      { num: '1', title: 'Definities', body: <>
        <ul>
          <li><strong>Agentmakers.io:</strong> de aanbieder van de diensten</li>
          <li><strong>Klant:</strong> iedere gebruiker of organisatie die onze diensten gebruikt</li>
          <li><strong>Diensten:</strong> alle AI agents, software, automatiseringen en gerelateerde diensten</li>
          <li><strong>AI Output:</strong> alle output gegenereerd door AI-systemen</li>
          <li><strong>Platform:</strong> de website en onderliggende systemen</li>
        </ul>
      </> },
      { num: '2', title: 'Akkoord met de voorwaarden', body: <>
        <p>Door gebruik te maken van onze diensten:</p>
        <ul>
          <li>gaat u akkoord met deze voorwaarden</li>
          <li>bevestigt u dat u bevoegd bent om namens uw organisatie te handelen</li>
          <li>ontstaat een juridisch bindende overeenkomst</li>
        </ul>
        <div style={warn}>Indien u niet akkoord gaat met deze voorwaarden: maak geen gebruik van onze diensten.</div>
      </> },
      { num: '3', title: 'Scope van de dienst', body: <>
        <p>Agentmakers.io levert:</p>
        <ul>
          <li>AI agents (chat, voice, messaging)</li>
          <li>Automatisering en integraties</li>
          <li>Data-verwerking en AI-output</li>
        </ul>
        <div style={hl}>Wij verlenen toegang tot software — geen gegarandeerd resultaat. Onze diensten betreffen een inspanningsverplichting, geen resultaatsverplichting.</div>
      </> },
      { num: '4', title: 'Licentie', body: <>
        <p>Wij verlenen u een niet-exclusieve, niet-overdraagbare en herroepbare licentie voor gebruik van onze diensten binnen uw eigen organisatie.</p>
        <h3 style={sub}>Niet toegestaan</h3>
        <ul>
          <li>De software kopiëren of reverse engineeren</li>
          <li>Doorverkopen zonder schriftelijke toestemming</li>
          <li>AI gebruiken voor illegale doeleinden</li>
        </ul>
      </> },
      { num: '5', title: 'AI-specifieke voorwaarden', body: <>
        <h3 style={sub}>5.1 Geen garanties op output</h3>
        <p>AI output:</p>
        <ul>
          <li>kan onjuist, incompleet of misleidend zijn</li>
          <li>is geen juridisch, medisch of financieel advies</li>
          <li>moet altijd door u worden gecontroleerd alvorens te gebruiken</li>
        </ul>
        <h3 style={sub}>5.2 Verantwoordelijkheid ligt bij klant</h3>
        <p>De klant is volledig verantwoordelijk voor:</p>
        <ul>
          <li>Gebruik van AI output</li>
          <li>Beslissingen gebaseerd op AI</li>
          <li>Communicatie met eindgebruikers</li>
        </ul>
        <h3 style={sub}>5.3 Training en datagebruik</h3>
        <p>Tenzij contractueel anders overeengekomen, mogen wij:</p>
        <ul>
          <li>Interacties analyseren ter verbetering van het systeem</li>
          <li>Data geanonimiseerd gebruiken voor systeemverbetering</li>
        </ul>
      </> },
      { num: '6', title: 'Acceptabel gebruik', body: <>
        <p>U mag onze diensten niet gebruiken voor:</p>
        <ul>
          <li>Illegale activiteiten</li>
          <li>Spam of misleiding</li>
          <li>Schending van privacy van derden</li>
          <li>Discriminerende of schadelijke content</li>
          <li>Automatisering van fraude of oplichting</li>
        </ul>
        <div style={warn}>Bij overtreding van deze bepalingen behouden wij ons het recht voor de dienst per direct te beëindigen zonder restitutie.</div>
      </> },
      { num: '7', title: 'Betaling en abonnementen', body: <>
        <ul>
          <li>Prijzen zijn exclusief BTW tenzij anders vermeld</li>
          <li>Abonnementen worden automatisch verlengd</li>
          <li>Betaling geschiedt vooraf</li>
        </ul>
        <p>Bij uitblijven van betaling behouden wij ons het recht voor de dienst op te schorten of te beëindigen.</p>
      </> },
      { num: '8', title: 'Service levels en beschikbaarheid', body: <>
        <p>Wij streven naar een hoge beschikbaarheid van onze diensten. Echter:</p>
        <ul>
          <li>Wij geven geen garantie van 100% uptime</li>
          <li>Gepland onderhoud en storingen kunnen voorkomen</li>
          <li>Wij zijn niet aansprakelijk voor schade als gevolg van onbeschikbaarheid</li>
        </ul>
      </> },
      { num: '9', title: 'Intellectueel eigendom', body: <>
        <h3 style={sub}>9.1 Eigendom van Agentmakers.io</h3>
        <p>Alle software, modellen en automatiseringen blijven eigendom van Agentmakers.io.</p>
        <h3 style={sub}>9.2 Eigendom van klant</h3>
        <p>De klant behoudt alle rechten op eigen data en eigen content die via het platform wordt verwerkt.</p>
        <h3 style={sub}>9.3 AI output</h3>
        <p>AI output mag door de klant worden gebruikt, zonder exclusiviteit of garantie van originaliteit.</p>
      </> },
      { num: '10', title: 'Data en privacy', body: <>
        <p>Wij verwerken data conform de AVG/GDPR en onze <a href="/nl/privacy" style={lnk}>Privacy Policy</a>.</p>
        <div style={hl}>Voor zakelijke klanten is een Data Processing Agreement (DPA) vereist.</div>
      </> },
      { num: '11', title: 'Diensten van derden', body: <>
        <p>Wij maken gebruik van externe diensten zoals AI providers, cloud infrastructuur en externe tools. Wij zijn niet aansprakelijk voor:</p>
        <ul>
          <li>Fouten of uitval van diensten van derden</li>
          <li>Downtime van externe systemen</li>
          <li>Wijzigingen in diensten van derden</li>
        </ul>
      </> },
      { num: '12', title: 'Beperking van aansprakelijkheid', body: <>
        <p>Agentmakers.io is niet aansprakelijk voor:</p>
        <ul>
          <li>Indirecte schade of gevolgschade</li>
          <li>Verlies van winst of omzet</li>
          <li>Verlies van data</li>
          <li>Schade als gevolg van AI output</li>
        </ul>
        <div style={hl}>Onze maximale aansprakelijkheid is beperkt tot het bedrag dat de klant in de afgelopen 12 maanden heeft betaald.</div>
      </> },
      { num: '13', title: 'Vrijwaring', body: <>
        <p>De klant vrijwaart Agentmakers.io voor alle claims van derden die voortvloeien uit:</p>
        <ul>
          <li>Het gebruik van AI output</li>
          <li>Beslissingen gebaseerd op AI</li>
          <li>Overtreding van deze voorwaarden</li>
        </ul>
      </> },
      { num: '14', title: 'Beëindiging', body: <>
        <p>Wij mogen de dienst per direct beëindigen bij:</p>
        <ul>
          <li>Misbruik van de dienst</li>
          <li>Niet-betaling</li>
          <li>Overtreding van deze voorwaarden</li>
        </ul>
        <p>De klant mag het abonnement beëindigen conform de overeengekomen contracttermijn.</p>
      </> },
      { num: '15', title: 'Wijzigingen in de dienst', body: <>
        <p>Wij behouden ons het recht voor om:</p>
        <ul>
          <li>Functionaliteiten aan te passen of uit te breiden</li>
          <li>Diensten te stoppen, mits redelijk vooraf aangekondigd</li>
        </ul>
      </> },
      { num: '16', title: 'Disclaimer', body: <>
        <div style={warn}>Onze diensten worden geleverd "AS IS", zonder enige garantie — uitdrukkelijk noch impliciet. Dit omvat geen garantie op resultaat en geen garantie op foutloze werking.</div>
      </> },
      { num: '17', title: 'Toepasselijk recht', body: <>
        <p>Deze overeenkomst valt onder Nederlands recht. Geschillen worden voorgelegd aan de bevoegde rechter te [plaats invullen].</p>
      </> },
      { num: '18', title: 'Overmacht', body: <>
        <p>Agentmakers.io is niet aansprakelijk bij omstandigheden buiten onze redelijke controle, waaronder:</p>
        <ul>
          <li>Technische storingen of cyberaanvallen</li>
          <li>Uitval van infrastructuur van derden</li>
          <li>Overige gevallen van overmacht</li>
        </ul>
      </> },
      { num: '19', title: 'Volledige overeenkomst', body: <>
        <div style={hl}>Deze voorwaarden vormen samen met onze <a href="/nl/privacy" style={lnk}>Privacy Policy</a> de volledige overeenkomst tussen u en Agentmakers.io.</div>
        <p style={{ marginTop: 16 }}>Voor vragen: <a href="mailto:info@agentmakers.io" style={lnk}>info@agentmakers.io</a></p>
      </> },
    ],
  },
  en: {
    back: '← Back to agentmakers.io',
    label: 'Terms & Conditions',
    title: 'Terms & Conditions',
    updated: 'Last updated: 5 March 2026',
    footer: 'All rights reserved.',
    intro: 'Welcome to Agentmakers.io. By using our services, you agree to the following terms. Please read them carefully before using our services.',
    sections: [
      { num: '1', title: 'Definitions', body: <>
        <ul>
          <li><strong>Agentmakers.io:</strong> the provider of the services</li>
          <li><strong>Customer:</strong> any user or organisation using our services</li>
          <li><strong>Services:</strong> all AI agents, software, automations and related services</li>
          <li><strong>AI Output:</strong> all output generated by AI systems</li>
          <li><strong>Platform:</strong> the website and underlying systems</li>
        </ul>
      </> },
      { num: '2', title: 'Acceptance of Terms', body: <>
        <p>By using our services you:</p>
        <ul>
          <li>agree to these terms and conditions</li>
          <li>confirm that you are authorised to act on behalf of your organisation</li>
          <li>enter into a legally binding agreement</li>
        </ul>
        <div style={warn}>If you do not agree with these terms, do not use our services.</div>
      </> },
      { num: '3', title: 'Scope of Service', body: <>
        <p>Agentmakers.io provides:</p>
        <ul>
          <li>AI agents (chat, voice, messaging)</li>
          <li>Automation and integrations</li>
          <li>Data processing and AI output</li>
        </ul>
        <div style={hl}>We provide access to software — not a guaranteed result. Our services constitute a best-efforts obligation, not a results obligation.</div>
      </> },
      { num: '4', title: 'Licence', body: <>
        <p>We grant you a non-exclusive, non-transferable and revocable licence to use our services within your own organisation.</p>
        <h3 style={sub}>Not permitted</h3>
        <ul>
          <li>Copying or reverse engineering the software</li>
          <li>Reselling without written permission</li>
          <li>Using AI for illegal purposes</li>
        </ul>
      </> },
      { num: '5', title: 'AI-specific Terms', body: <>
        <h3 style={sub}>5.1 No guarantees on output</h3>
        <p>AI output:</p>
        <ul>
          <li>may be incorrect, incomplete or misleading</li>
          <li>is not legal, medical or financial advice</li>
          <li>must always be reviewed by you before use</li>
        </ul>
        <h3 style={sub}>5.2 Customer responsibility</h3>
        <p>The customer is fully responsible for:</p>
        <ul>
          <li>Use of AI output</li>
          <li>Decisions based on AI</li>
          <li>Communication with end users</li>
        </ul>
        <h3 style={sub}>5.3 Training and data use</h3>
        <p>Unless contractually excluded, we may:</p>
        <ul>
          <li>Analyse interactions to improve the system</li>
          <li>Use data in anonymised form for system improvement</li>
        </ul>
      </> },
      { num: '6', title: 'Acceptable Use', body: <>
        <p>You may not use our services for:</p>
        <ul>
          <li>Illegal activities</li>
          <li>Spam or deception</li>
          <li>Violation of third-party privacy</li>
          <li>Discriminatory or harmful content</li>
          <li>Automation of fraud or scams</li>
        </ul>
        <div style={warn}>In case of violation, we reserve the right to terminate the service immediately without refund.</div>
      </> },
      { num: '7', title: 'Payment and Subscriptions', body: <>
        <ul>
          <li>Prices are exclusive of VAT unless stated otherwise</li>
          <li>Subscriptions renew automatically</li>
          <li>Payment is due in advance</li>
        </ul>
        <p>In case of non-payment, we reserve the right to suspend or terminate the service.</p>
      </> },
      { num: '8', title: 'Service Levels and Availability', body: <>
        <p>We strive for high availability of our services. However:</p>
        <ul>
          <li>We do not guarantee 100% uptime</li>
          <li>Scheduled maintenance and outages may occur</li>
          <li>We are not liable for damages resulting from unavailability</li>
        </ul>
      </> },
      { num: '9', title: 'Intellectual Property', body: <>
        <h3 style={sub}>9.1 Agentmakers.io property</h3>
        <p>All software, models and automations remain the property of Agentmakers.io.</p>
        <h3 style={sub}>9.2 Customer property</h3>
        <p>The customer retains all rights to their own data and content processed via the platform.</p>
        <h3 style={sub}>9.3 AI output</h3>
        <p>AI output may be used by the customer, without exclusivity or guarantee of originality.</p>
      </> },
      { num: '10', title: 'Data and Privacy', body: <>
        <p>We process data in accordance with the GDPR and our <a href="/en/privacy" style={lnk}>Privacy Policy</a>.</p>
        <div style={hl}>For business customers, a Data Processing Agreement (DPA) is required.</div>
      </> },
      { num: '11', title: 'Third-party Services', body: <>
        <p>We use external services such as AI providers, cloud infrastructure and external tools. We are not liable for:</p>
        <ul>
          <li>Errors or outages of third-party services</li>
          <li>Downtime of external systems</li>
          <li>Changes to third-party services</li>
        </ul>
      </> },
      { num: '12', title: 'Limitation of Liability', body: <>
        <p>Agentmakers.io is not liable for:</p>
        <ul>
          <li>Indirect or consequential damages</li>
          <li>Loss of profit or revenue</li>
          <li>Loss of data</li>
          <li>Damages resulting from AI output</li>
        </ul>
        <div style={hl}>Our maximum liability is limited to the amount the customer has paid in the past 12 months.</div>
      </> },
      { num: '13', title: 'Indemnification', body: <>
        <p>The customer indemnifies Agentmakers.io against all third-party claims arising from:</p>
        <ul>
          <li>Use of AI output</li>
          <li>Decisions based on AI</li>
          <li>Violation of these terms</li>
        </ul>
      </> },
      { num: '14', title: 'Termination', body: <>
        <p>We may terminate the service immediately in case of:</p>
        <ul>
          <li>Misuse of the service</li>
          <li>Non-payment</li>
          <li>Violation of these terms</li>
        </ul>
        <p>The customer may cancel the subscription in accordance with the agreed contract term.</p>
      </> },
      { num: '15', title: 'Changes to Services', body: <>
        <p>We reserve the right to:</p>
        <ul>
          <li>Modify or extend functionality</li>
          <li>Discontinue services, provided reasonable prior notice is given</li>
        </ul>
      </> },
      { num: '16', title: 'Disclaimer', body: <>
        <div style={warn}>Our services are provided "AS IS", without any warranty — express or implied. This includes no guarantee of results and no guarantee of error-free operation.</div>
      </> },
      { num: '17', title: 'Governing Law', body: <>
        <p>This agreement is governed by Dutch law. Disputes shall be submitted to the competent court in [place to be filled in].</p>
      </> },
      { num: '18', title: 'Force Majeure', body: <>
        <p>Agentmakers.io is not liable in circumstances beyond our reasonable control, including:</p>
        <ul>
          <li>Technical failures or cyberattacks</li>
          <li>Outages of third-party infrastructure</li>
          <li>Other cases of force majeure</li>
        </ul>
      </> },
      { num: '19', title: 'Entire Agreement', body: <>
        <div style={hl}>These terms, together with our <a href="/en/privacy" style={lnk}>Privacy Policy</a>, constitute the entire agreement between you and Agentmakers.io.</div>
        <p style={{ marginTop: 16 }}>Questions: <a href="mailto:info@agentmakers.io" style={lnk}>info@agentmakers.io</a></p>
      </> },
    ],
  },
  es: {
    back: '← Volver a agentmakers.io',
    label: 'Términos y Condiciones',
    title: 'Términos y Condiciones',
    updated: 'Última actualización: 5 de marzo de 2026',
    footer: 'Todos los derechos reservados.',
    intro: 'Bienvenido a Agentmakers.io. Al utilizar nuestros servicios, usted acepta los siguientes términos. Por favor, léalos detenidamente antes de utilizar nuestros servicios.',
    sections: [
      { num: '1', title: 'Definiciones', body: <>
        <ul>
          <li><strong>Agentmakers.io:</strong> el proveedor de los servicios</li>
          <li><strong>Cliente:</strong> cualquier usuario u organización que utilice nuestros servicios</li>
          <li><strong>Servicios:</strong> todos los agentes de IA, software, automatizaciones y servicios relacionados</li>
          <li><strong>Salida de IA:</strong> toda la salida generada por sistemas de IA</li>
          <li><strong>Plataforma:</strong> el sitio web y los sistemas subyacentes</li>
        </ul>
      </> },
      { num: '2', title: 'Aceptación de los términos', body: <>
        <p>Al utilizar nuestros servicios usted:</p>
        <ul>
          <li>acepta estos términos y condiciones</li>
          <li>confirma que está autorizado para actuar en nombre de su organización</li>
          <li>celebra un acuerdo jurídicamente vinculante</li>
        </ul>
        <div style={warn}>Si no está de acuerdo con estos términos, no utilice nuestros servicios.</div>
      </> },
      { num: '3', title: 'Alcance del servicio', body: <>
        <p>Agentmakers.io proporciona:</p>
        <ul>
          <li>Agentes de IA (chat, voz, mensajería)</li>
          <li>Automatización e integraciones</li>
          <li>Procesamiento de datos y salida de IA</li>
        </ul>
        <div style={hl}>Proporcionamos acceso al software, no un resultado garantizado. Nuestros servicios constituyen una obligación de medios, no una obligación de resultado.</div>
      </> },
      { num: '4', title: 'Licencia', body: <>
        <p>Le otorgamos una licencia no exclusiva, intransferible y revocable para utilizar nuestros servicios dentro de su propia organización.</p>
        <h3 style={sub}>No está permitido</h3>
        <ul>
          <li>Copiar o realizar ingeniería inversa del software</li>
          <li>Revender sin permiso escrito</li>
          <li>Utilizar la IA con fines ilegales</li>
        </ul>
      </> },
      { num: '5', title: 'Términos específicos de IA', body: <>
        <h3 style={sub}>5.1 Sin garantías sobre la salida</h3>
        <p>La salida de IA:</p>
        <ul>
          <li>puede ser incorrecta, incompleta o engañosa</li>
          <li>no constituye asesoramiento jurídico, médico ni financiero</li>
          <li>debe ser siempre revisada por usted antes de su uso</li>
        </ul>
        <h3 style={sub}>5.2 Responsabilidad del cliente</h3>
        <p>El cliente es plenamente responsable de:</p>
        <ul>
          <li>El uso de la salida de IA</li>
          <li>Las decisiones basadas en IA</li>
          <li>La comunicación con los usuarios finales</li>
        </ul>
        <h3 style={sub}>5.3 Entrenamiento y uso de datos</h3>
        <p>Salvo acuerdo contractual en contrario, podemos:</p>
        <ul>
          <li>Analizar interacciones para mejorar el sistema</li>
          <li>Utilizar datos de forma anonimizada para la mejora del sistema</li>
        </ul>
      </> },
      { num: '6', title: 'Uso aceptable', body: <>
        <p>No podrá utilizar nuestros servicios para:</p>
        <ul>
          <li>Actividades ilegales</li>
          <li>Spam o engaño</li>
          <li>Violación de la privacidad de terceros</li>
          <li>Contenido discriminatorio o perjudicial</li>
          <li>Automatización de fraudes o estafas</li>
        </ul>
        <div style={warn}>En caso de infracción, nos reservamos el derecho de resolver el servicio de forma inmediata sin reembolso.</div>
      </> },
      { num: '7', title: 'Pago y suscripciones', body: <>
        <ul>
          <li>Los precios no incluyen IVA salvo que se indique lo contrario</li>
          <li>Las suscripciones se renuevan automáticamente</li>
          <li>El pago se realiza por adelantado</li>
        </ul>
        <p>En caso de impago, nos reservamos el derecho de suspender o resolver el servicio.</p>
      </> },
      { num: '8', title: 'Niveles de servicio y disponibilidad', body: <>
        <p>Nos esforzamos por mantener una alta disponibilidad de nuestros servicios. Sin embargo:</p>
        <ul>
          <li>No garantizamos un tiempo de actividad del 100%</li>
          <li>Pueden producirse mantenimientos programados e interrupciones</li>
          <li>No somos responsables de los daños derivados de la falta de disponibilidad</li>
        </ul>
      </> },
      { num: '9', title: 'Propiedad intelectual', body: <>
        <h3 style={sub}>9.1 Propiedad de Agentmakers.io</h3>
        <p>Todo el software, los modelos y las automatizaciones siguen siendo propiedad de Agentmakers.io.</p>
        <h3 style={sub}>9.2 Propiedad del cliente</h3>
        <p>El cliente conserva todos los derechos sobre sus propios datos y contenidos procesados a través de la plataforma.</p>
        <h3 style={sub}>9.3 Salida de IA</h3>
        <p>La salida de IA puede ser utilizada por el cliente, sin exclusividad ni garantía de originalidad.</p>
      </> },
      { num: '10', title: 'Datos y privacidad', body: <>
        <p>Tratamos los datos de conformidad con el RGPD y nuestra <a href="/es/privacy" style={lnk}>Política de Privacidad</a>.</p>
        <div style={hl}>Para clientes empresariales se requiere un Acuerdo de Tratamiento de Datos (DPA).</div>
      </> },
      { num: '11', title: 'Servicios de terceros', body: <>
        <p>Utilizamos servicios externos como proveedores de IA, infraestructura en la nube y herramientas externas. No somos responsables de:</p>
        <ul>
          <li>Errores o interrupciones de servicios de terceros</li>
          <li>Tiempo de inactividad de sistemas externos</li>
          <li>Cambios en los servicios de terceros</li>
        </ul>
      </> },
      { num: '12', title: 'Limitación de responsabilidad', body: <>
        <p>Agentmakers.io no es responsable de:</p>
        <ul>
          <li>Daños indirectos o consecuentes</li>
          <li>Pérdida de beneficios o ingresos</li>
          <li>Pérdida de datos</li>
          <li>Daños derivados de la salida de IA</li>
        </ul>
        <div style={hl}>Nuestra responsabilidad máxima se limita al importe pagado por el cliente en los últimos 12 meses.</div>
      </> },
      { num: '13', title: 'Indemnización', body: <>
        <p>El cliente indemnizará a Agentmakers.io frente a cualquier reclamación de terceros derivada de:</p>
        <ul>
          <li>El uso de la salida de IA</li>
          <li>Decisiones basadas en IA</li>
          <li>Infracción de estos términos</li>
        </ul>
      </> },
      { num: '14', title: 'Resolución', body: <>
        <p>Podemos resolver el servicio de forma inmediata en caso de:</p>
        <ul>
          <li>Uso indebido del servicio</li>
          <li>Impago</li>
          <li>Infracción de estos términos</li>
        </ul>
        <p>El cliente puede cancelar la suscripción de acuerdo con el plazo contractual acordado.</p>
      </> },
      { num: '15', title: 'Cambios en los servicios', body: <>
        <p>Nos reservamos el derecho de:</p>
        <ul>
          <li>Modificar o ampliar funcionalidades</li>
          <li>Interrumpir servicios, siempre que se notifique con antelación razonable</li>
        </ul>
      </> },
      { num: '16', title: 'Aviso legal', body: <>
        <div style={warn}>Nuestros servicios se prestan "TAL CUAL", sin garantía alguna, expresa o implícita. Esto incluye ninguna garantía de resultado ni de funcionamiento sin errores.</div>
      </> },
      { num: '17', title: 'Ley aplicable', body: <>
        <p>Este acuerdo se rige por la legislación neerlandesa. Las controversias se someterán al tribunal competente en [lugar a completar].</p>
      </> },
      { num: '18', title: 'Fuerza mayor', body: <>
        <p>Agentmakers.io no es responsable en circunstancias fuera de nuestro control razonable, incluyendo:</p>
        <ul>
          <li>Fallos técnicos o ciberataques</li>
          <li>Interrupciones de infraestructura de terceros</li>
          <li>Otros casos de fuerza mayor</li>
        </ul>
      </> },
      { num: '19', title: 'Acuerdo completo', body: <>
        <div style={hl}>Estos términos, junto con nuestra <a href="/es/privacy" style={lnk}>Política de Privacidad</a>, constituyen el acuerdo completo entre usted y Agentmakers.io.</div>
        <p style={{ marginTop: 16 }}>Preguntas: <a href="mailto:info@agentmakers.io" style={lnk}>info@agentmakers.io</a></p>
      </> },
    ],
  },
}

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
