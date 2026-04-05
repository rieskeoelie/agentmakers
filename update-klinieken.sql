UPDATE landing_pages
SET
  hero_headline_nl = 'Behaal 34% meer boekingen en boost uw klanttevredenheid met intelligente AI agents voor uw kliniek of salon',
  hero_subline_nl  = 'Uw AI receptioniste werkt als u gesloten bent. Ze beantwoordt vragen, boekt behandelingen direct in uw agenda en verhoogt uw omzet. Het is alsof u vijf extra mensen aanneemt.',
  body_content_nl  = '{
    "hero_badge": "Activeer het onbenutte potentieel van uw kliniek",
    "problem_headline": "Zodra u uw dag afsluit beginnen uw potentiële klanten met zoeken",
    "problem_body": "Klinieken zijn gemiddeld 9 uur per dag open, 5 dagen per week. Dat betekent dat u 73% van het jaar onbereikbaar bent - precies wanneer uw klanten wél bellen.",
    "timeline": [
      {"time": "18:30 - Klant belt na werktijd",       "scenario": "Wil een botox-behandeling inplannen. Geen gehoor. Belt de concurrent."},
      {"time": "Zaterdag 10:00 - Weekend-oproep",      "scenario": "Klant zoekt informatie over laserbehandeling. Voicemail. Vergeet terug te bellen."},
      {"time": "Elke gemiste oproep = gemiste omzet",  "scenario": "Onderzoek toont aan: 85% van niet-beantwoorde bellers belt niet terug."}
    ],
    "features": [
      {"title": "24/7 bereikbaar",        "body": "Dag, nacht, weekend, feestdag - uw kliniek is altijd bereikbaar via telefoon."},
      {"title": "Afspraken inboeken",     "body": "Uw AI agent boekt afspraken en consults direct in uw agenda."},
      {"title": "Vragen beantwoorden",    "body": "Informatie over behandelingen, prijzen en procedures - direct en accuraat."},
      {"title": "Intake verzamelen",      "body": "Verzamel vooraf de juiste patiëntgegevens zodat uw team direct aan de slag kan."},
      {"title": "Meertalig",              "body": "Nederlands, Engels, Duits, Frans en meer. Ideaal voor klinieken met internationale clientèle."},
      {"title": "Privacy-proof",          "body": "Volledig AVG-compliant. Patiëntgegevens worden veilig en vertrouwelijk verwerkt."}
    ],
    "usecases": [
      {"title": "Behandelingen inplannen",   "body": "Botox, fillers, laserbehandelingen - automatisch ingeboekt met de juiste tijdsduur."},
      {"title": "Consultatie-aanvragen",     "body": "Verwerk aanvragen voor eerste consulten en koppel direct aan de juiste specialist."},
      {"title": "Nazorg-opvolging",          "body": "Automatische opvolgbelletjes na behandelingen om tevredenheid en herstel te checken."},
      {"title": "Wachtlijstbeheer",          "body": "Bij annuleringen wordt de volgende patiënt op de wachtlijst automatisch gecontacteerd."},
      {"title": "Herinneringen versturen",   "body": "Automatische bel- en sms-herinneringen vóór de afspraak om no-shows te voorkomen."},
      {"title": "No-show reductie",          "body": "Tot 40% minder no-shows door slimme herinneringen en eenvoudige herplanmogelijkheden."}
    ],
    "steps_title": "Beslis vandaag en ga binnen 7 dagen live",
    "steps_sub": "Geen maandenlange implementatie. Wij regelen alles.",
    "steps": [
      {"title": "Wij configureren",    "body": "We stemmen de AI af op uw kliniek: behandelingen, prijzen, tone of voice en protocollen."},
      {"title": "Agenda-koppeling",    "body": "Directe integratie met uw bestaande agendasysteem voor real-time beschikbaarheid."},
      {"title": "Binnen 48 uur live",  "body": "Uw AI receptionist neemt vanaf dag één oproepen aan - 24 uur per dag, 7 dagen per week."}
    ],
    "revenue_calls": 5,
    "revenue_per_call": 500,
    "cta_headline": "Klaar om geen oproep meer te missen?",
    "cta_sub": "Plan een gratis demo en ontdek wat agentmakers.io voor uw kliniek kan betekenen.",
    "stats_label": "Resultaten",
    "stats_title": "Wat klinieken ervaren met agentmakers.io"
  }'::jsonb
WHERE slug = 'klinieken';
