/**
 * Admin interface copy (NL primary, ES for partners). Outreach, Inbox and Settings are Dutch-only operator tools.
 * Short and functional — no decorative copy, no emoji.
 */
export type UiLang = 'nl' | 'es'

const nl = {
  // shell
  groupOverview: 'Overzicht', groupWork: 'Werk', groupManage: 'Beheer', groupAdmin: 'Admin',
  navOverview: 'Overzicht', navOutreach: 'Outreach', navInbox: 'Inbox', navLeads: 'Leads', navConversations: 'Gesprekken',
  navPages: "Pagina's", navAnalytics: 'Analytics', navTeam: 'Team', navSettings: 'Instellingen',
  roleSuper: 'Superadmin', roleAdmin: 'Admin', rolePartner: 'Partner',
  collapse: 'Zijbalk inklappen', expand: 'Zijbalk uitklappen', logout: 'Uitloggen', language: 'Taal',
  viewingAs: 'Je bekijkt het account van', viewingAsScope: 'Leads, gesprekken en outreach zijn gefilterd op dit account.', stopViewing: 'Stoppen',
  refresh: 'Vernieuwen', cancel: 'Annuleren', save: 'Opslaan', close: 'Sluiten', delete: 'Verwijderen', open: 'Openen', back: 'Terug',
  noAccess: 'Geen toegang', noAccessText: 'Dit onderdeel is alleen beschikbaar voor superadmins.',
  // overview
  overviewTitle: 'Overzicht', overviewSubtitle: 'Wat vandaag aandacht nodig heeft.',
  attention: 'Aandacht nodig', attentionNone: 'Niets dat op je wacht.', activeRuns: 'Actieve runs', recentLeads: 'Nieuwste leads', systemStatus: 'Systeem',
  allLeads: 'Alle leads', allRuns: 'Alle runs',
  // leads
  leadsTitle: 'Leads', leadsSubtitle: 'Gekwalificeerde kansen in het AgentMakers CRM.', invite: 'Demo-uitnodiging',
  colContact: 'Contact', colSource: 'Bron', colStatus: 'Status', colPage: 'Pagina', colLanguage: 'Taal', colConversation: 'Gesprek', colCreated: 'Aangemaakt', colEmail: 'E-mail',
  srcOutreach: 'Outreach', srcDemoLink: 'Demo-link', srcInvite: 'Uitnodiging', srcWebsite: 'Website',
  stageNew: 'Nieuw', stageContact: 'Contact', stageDemo: 'Demo gepland', stageWon: 'Gewonnen', stageLost: 'Verloren',
  allStages: 'Alle statussen', allSources: 'Alle bronnen', searchLeads: 'Zoek naam, bedrijf, e-mail…',
  exportCsv: 'Exporteer CSV', deleteSelected: 'Verwijder selectie', selected: 'geselecteerd', handled: 'Afgehandeld', markHandled: 'Markeer afgehandeld', reopen: 'Heropenen',
  sendEmail: 'E-mail sturen', viewConversation: 'Gesprek bekijken', leadsEmptyTitle: 'Nog geen leads', leadsEmptyText: 'Leads verschijnen hier zodra iemand een demo aanvraagt of je een outreach-prospect naar het CRM promoveert.',
  noResults: 'Geen resultaten', noResultsText: 'Pas de zoekterm of filters aan.',
  leadNotes: 'Notities', leadNotesHelp: 'Alleen zichtbaar in deze browser.', leadAgent: 'Kennis van de demo-agent', leadAgentHelp: 'Bedrijfsinformatie die de AI-agent gebruikt in de demo.',
  rescrape: 'Website opnieuw ophalen', saveForAgent: 'Opslaan voor agent', saved: 'Opgeslagen', outreachHistory: 'Outreach-historie', openInOutreach: 'Open in Outreach',
  deleteLeadsTitle: 'Leads verwijderen?', deleteLeadsText: 'Deze leads worden permanent verwijderd.', newBadge: 'Nieuw',
  // invite
  inviteTitle: 'Demo-uitnodiging', inviteDesc: 'De prospect ontvangt direct een gepersonaliseerde voice-demo.', inviteName: 'Naam contactpersoon', inviteCompany: 'Bedrijfsnaam',
  inviteEmail: 'E-mailadres', inviteWebsite: 'Website', inviteLanguage: 'Taal van de demo', inviteSend: 'Uitnodiging versturen', inviteSending: 'Website lezen en demo voorbereiden…',
  inviteDone: 'Uitnodiging verstuurd', inviteDoneText: 'heeft een e-mail met de demo-link ontvangen.', inviteAnother: 'Nog een uitnodiging', inviteRequired: 'Naam, e-mail en website zijn verplicht.',
  // conversations
  convTitle: 'Gesprekken', convSubtitle: 'Gesprekken die prospects met de AI-demo voerden.', convDate: 'Datum', convContact: 'Contact', convCompany: 'Bedrijf', convDuration: 'Duur', convResult: 'Resultaat', convLead: 'Lead',
  convDone: 'Afgerond', convFailed: 'Mislukt', convAudio: 'Opname', convTranscript: 'Transcript', convNoTranscript: 'Geen transcript beschikbaar.', convProspect: 'Prospect', convAgent: 'AI-agent', convCost: 'Kosten',
  convEmptyTitle: 'Nog geen gesprekken', convEmptyText: 'Gesprekken verschijnen hier zodra een prospect de demo gebruikt. Alleen gesprekken die aan jouw leads gekoppeld zijn worden getoond.',
  convUnknown: 'Onbekend', convLinked: 'Gekoppeld aan lead',
  // pages
  pagesTitle: "Pagina's", pagesSubtitle: "Landingspagina's per branche.", pagesNew: 'Nieuwe pagina', pageCol: 'Pagina', routeCol: 'Route', visitsCol: 'Bezoeken', convCol: 'Conversies', ratioCol: 'Ratio',
  pageLive: 'Live', pageDraft: 'Concept', setLive: 'Zet live', setOffline: 'Zet offline', viewPage: 'Bekijk pagina', editPage: 'Bewerken',
  pagesEmptyTitle: "Nog geen pagina's", pagesEmptyText: 'Genereer een landingspagina voor een branche.',
  deletePageTitle: 'Pagina verwijderen?', deletePageText: 'wordt permanent verwijderd. Dit kan niet ongedaan worden gemaakt.',
  newPageTitle: 'Nieuwe landingspagina', newPageDesc: 'De volledige pagina wordt automatisch geschreven (NL, EN, ES).', industry: 'Branche', slug: 'URL-slug', generate: 'Pagina genereren', generating: 'Pagina wordt gegenereerd…',
  // analytics
  analyticsTitle: 'Analytics', analyticsSubtitle: 'Bezoek, conversie en leads van je pagina’s.', visits: 'Bezoeken', conversions: 'Conversies', convRate: 'Conversieratio', leads: 'Leads', conversations: 'Gesprekken',
  leadsPerWeek: 'Leads per week', leadsByLanguage: 'Leads per taal', pagePerformance: 'Prestaties per pagina', last8Weeks: 'Laatste 8 weken', avgDuration: 'gem. duur',
  // team
  teamTitle: 'Team', teamSubtitle: 'Partneraccounts, hun resultaten en toegang.', newAccount: 'Nieuw account', account: 'Account', role: 'Rol', leadsTotal: 'Leads', thisMonth: 'Deze maand',
  demos: "Demo's", lastActive: 'Laatst actief', viewAs: 'Bekijk als', setPassword: 'Wachtwoord instellen', deleteAccount: 'Account verwijderen', notActive: 'Nog niet actief',
  partners: 'Partners', teamEmptyTitle: 'Nog geen partners', teamEmptyText: 'Maak een partneraccount aan om te beginnen.',
  displayName: 'Weergavenaam', username: 'Gebruikersnaam', password: 'Wachtwoord', passwordHelp: 'Minimaal 8 tekens.', usernameHelp: 'Letters, cijfers, _ . - (geen spaties).',
  accountCreated: 'Account aangemaakt', deleteAccountText: 'wordt permanent verwijderd. Leads en historie blijven bewaard.', passwordSet: 'Wachtwoord gewijzigd.',
  // settings
  settingsTitle: 'Instellingen', general: 'Algemeen', interfaceLanguage: 'Interfacetaal',
  // login
  loginSubtitle: 'Admin', loginUser: 'Gebruikersnaam', loginPassword: 'Wachtwoord', loginButton: 'Inloggen', loginForgot: 'Wachtwoord vergeten?',
  forgotText: 'Vul je gebruikersnaam in. We sturen een herstelkoppeling naar het bijbehorende e-mailadres.', forgotSend: 'Stuur herstelkoppeling', forgotSent: 'Als dit account bestaat, is er een herstelkoppeling verstuurd.',
  resetText: 'Kies een nieuw wachtwoord (minimaal 8 tekens).', resetNew: 'Nieuw wachtwoord', resetConfirm: 'Bevestig wachtwoord', resetButton: 'Wachtwoord instellen', resetDone: 'Wachtwoord ingesteld. Je kunt nu inloggen.',
  backToLogin: 'Terug naar inloggen', networkError: 'Netwerkfout. Probeer het opnieuw.',
}

export type CopyKey = keyof typeof nl

const es: Record<CopyKey, string> = {
  groupOverview: 'Resumen', groupWork: 'Trabajo', groupManage: 'Gestión', groupAdmin: 'Admin',
  navOverview: 'Resumen', navOutreach: 'Outreach', navInbox: 'Bandeja', navLeads: 'Leads', navConversations: 'Conversaciones',
  navPages: 'Páginas', navAnalytics: 'Analítica', navTeam: 'Equipo', navSettings: 'Ajustes',
  roleSuper: 'Superadmin', roleAdmin: 'Admin', rolePartner: 'Partner',
  collapse: 'Contraer barra lateral', expand: 'Expandir barra lateral', logout: 'Cerrar sesión', language: 'Idioma',
  viewingAs: 'Estás viendo la cuenta de', viewingAsScope: 'Leads, conversaciones y outreach están filtrados para esta cuenta.', stopViewing: 'Salir',
  refresh: 'Actualizar', cancel: 'Cancelar', save: 'Guardar', close: 'Cerrar', delete: 'Eliminar', open: 'Abrir', back: 'Volver',
  noAccess: 'Sin acceso', noAccessText: 'Esta sección solo está disponible para superadmins.',
  overviewTitle: 'Resumen', overviewSubtitle: 'Lo que requiere atención hoy.',
  attention: 'Requiere atención', attentionNone: 'No hay nada pendiente.', activeRuns: 'Runs activos', recentLeads: 'Leads recientes', systemStatus: 'Sistema',
  allLeads: 'Todos los leads', allRuns: 'Todos los runs',
  leadsTitle: 'Leads', leadsSubtitle: 'Oportunidades cualificadas en el CRM de AgentMakers.', invite: 'Invitación demo',
  colContact: 'Contacto', colSource: 'Origen', colStatus: 'Estado', colPage: 'Página', colLanguage: 'Idioma', colConversation: 'Conversación', colCreated: 'Creado', colEmail: 'Email',
  srcOutreach: 'Outreach', srcDemoLink: 'Enlace demo', srcInvite: 'Invitación', srcWebsite: 'Web',
  stageNew: 'Nuevo', stageContact: 'Contacto', stageDemo: 'Demo programada', stageWon: 'Ganado', stageLost: 'Perdido',
  allStages: 'Todos los estados', allSources: 'Todos los orígenes', searchLeads: 'Buscar nombre, empresa, email…',
  exportCsv: 'Exportar CSV', deleteSelected: 'Eliminar selección', selected: 'seleccionados', handled: 'Gestionado', markHandled: 'Marcar como gestionado', reopen: 'Reabrir',
  sendEmail: 'Enviar email', viewConversation: 'Ver conversación', leadsEmptyTitle: 'Aún no hay leads', leadsEmptyText: 'Los leads aparecen aquí cuando alguien solicita una demo.',
  noResults: 'Sin resultados', noResultsText: 'Ajusta la búsqueda o los filtros.',
  leadNotes: 'Notas', leadNotesHelp: 'Solo visibles en este navegador.', leadAgent: 'Conocimiento del agente demo', leadAgentHelp: 'Información del negocio que usa el agente IA en la demo.',
  rescrape: 'Volver a leer la web', saveForAgent: 'Guardar para el agente', saved: 'Guardado', outreachHistory: 'Historial de outreach', openInOutreach: 'Abrir en Outreach',
  deleteLeadsTitle: '¿Eliminar leads?', deleteLeadsText: 'Estos leads se eliminarán permanentemente.', newBadge: 'Nuevo',
  inviteTitle: 'Invitación demo', inviteDesc: 'El prospecto recibe al instante una demo de voz personalizada.', inviteName: 'Nombre de contacto', inviteCompany: 'Empresa',
  inviteEmail: 'Email', inviteWebsite: 'Sitio web', inviteLanguage: 'Idioma de la demo', inviteSend: 'Enviar invitación', inviteSending: 'Leyendo la web y preparando la demo…',
  inviteDone: 'Invitación enviada', inviteDoneText: 'ha recibido un email con el enlace de la demo.', inviteAnother: 'Otra invitación', inviteRequired: 'Nombre, email y sitio web son obligatorios.',
  convTitle: 'Conversaciones', convSubtitle: 'Conversaciones de prospectos con la demo IA.', convDate: 'Fecha', convContact: 'Contacto', convCompany: 'Empresa', convDuration: 'Duración', convResult: 'Resultado', convLead: 'Lead',
  convDone: 'Finalizada', convFailed: 'Fallida', convAudio: 'Grabación', convTranscript: 'Transcripción', convNoTranscript: 'No hay transcripción.', convProspect: 'Prospecto', convAgent: 'Agente IA', convCost: 'Coste',
  convEmptyTitle: 'Aún no hay conversaciones', convEmptyText: 'Las conversaciones aparecen aquí cuando un prospecto usa la demo.',
  convUnknown: 'Desconocido', convLinked: 'Vinculada a lead',
  pagesTitle: 'Páginas', pagesSubtitle: 'Landing pages por sector.', pagesNew: 'Nueva página', pageCol: 'Página', routeCol: 'Ruta', visitsCol: 'Visitas', convCol: 'Conversiones', ratioCol: 'Ratio',
  pageLive: 'Publicada', pageDraft: 'Borrador', setLive: 'Publicar', setOffline: 'Despublicar', viewPage: 'Ver página', editPage: 'Editar',
  pagesEmptyTitle: 'Aún no hay páginas', pagesEmptyText: 'Genera una landing page para un sector.',
  deletePageTitle: '¿Eliminar página?', deletePageText: 'se eliminará permanentemente.', newPageTitle: 'Nueva landing page', newPageDesc: 'La página se escribe automáticamente (NL, EN, ES).',
  industry: 'Sector', slug: 'Slug de URL', generate: 'Generar página', generating: 'Generando página…',
  analyticsTitle: 'Analítica', analyticsSubtitle: 'Visitas, conversión y leads de tus páginas.', visits: 'Visitas', conversions: 'Conversiones', convRate: 'Tasa de conversión', leads: 'Leads', conversations: 'Conversaciones',
  leadsPerWeek: 'Leads por semana', leadsByLanguage: 'Leads por idioma', pagePerformance: 'Rendimiento por página', last8Weeks: 'Últimas 8 semanas', avgDuration: 'duración media',
  teamTitle: 'Equipo', teamSubtitle: 'Cuentas de partners, resultados y acceso.', newAccount: 'Nueva cuenta', account: 'Cuenta', role: 'Rol', leadsTotal: 'Leads', thisMonth: 'Este mes',
  demos: 'Demos', lastActive: 'Última actividad', viewAs: 'Ver como', setPassword: 'Establecer contraseña', deleteAccount: 'Eliminar cuenta', notActive: 'Sin actividad',
  partners: 'Partners', teamEmptyTitle: 'Aún no hay partners', teamEmptyText: 'Crea una cuenta de partner para empezar.',
  displayName: 'Nombre visible', username: 'Usuario', password: 'Contraseña', passwordHelp: 'Mínimo 8 caracteres.', usernameHelp: 'Letras, números, _ . - (sin espacios).',
  accountCreated: 'Cuenta creada', deleteAccountText: 'se eliminará permanentemente. Los leads e historial se conservan.', passwordSet: 'Contraseña cambiada.',
  settingsTitle: 'Ajustes', general: 'General', interfaceLanguage: 'Idioma de la interfaz',
  loginSubtitle: 'Admin', loginUser: 'Usuario', loginPassword: 'Contraseña', loginButton: 'Entrar', loginForgot: '¿Olvidaste tu contraseña?',
  forgotText: 'Introduce tu usuario. Enviaremos un enlace de recuperación.', forgotSend: 'Enviar enlace', forgotSent: 'Si la cuenta existe, se ha enviado un enlace.',
  resetText: 'Elige una nueva contraseña (mínimo 8 caracteres).', resetNew: 'Nueva contraseña', resetConfirm: 'Confirmar contraseña', resetButton: 'Establecer contraseña', resetDone: 'Contraseña establecida. Ya puedes entrar.',
  backToLogin: 'Volver al inicio de sesión', networkError: 'Error de red. Inténtalo de nuevo.',
}

export const COPY: Record<UiLang, Record<CopyKey, string>> = { nl, es }

export type T = (k: CopyKey) => string
export const copyFor = (lang: UiLang): T => (k) => COPY[lang][k] ?? COPY.nl[k]
