# 🚀 Deployment Gids — agentmakers.io

Volg deze stappen precies op en je website staat live.
Geschat tijdstip: **30–45 minuten**

---

## STAP 1 — Supabase instellen (database)

1. Ga naar **https://supabase.com** → klik "Start your project" → maak een gratis account aan
2. Klik "New project" → kies een naam (bijv. `agentmakers`) → kies een sterk wachtwoord → regio: **West EU (Frankfurt)** → klik "Create project"
3. Wacht 1–2 minuten tot het project klaar is
4. Ga in de linkerbalk naar **SQL Editor** → klik "New query"
5. Kopieer de volledige inhoud van `supabase-schema.sql` en plak het in de editor → klik **Run**
6. Ga naar **Project Settings → API**:
   - Kopieer `Project URL` → sla op als **SUPABASE_URL**
   - Kopieer `anon public` key → sla op als **SUPABASE_ANON_KEY**
   - Kopieer `service_role` key → sla op als **SUPABASE_SERVICE_KEY**

---

## STAP 2 — Resend instellen (email)

1. Ga naar **https://resend.com** → maak een gratis account aan
2. Ga naar **API Keys** → klik "Create API Key" → geef het een naam → kopieer de key → sla op als **RESEND_API_KEY**
3. Ga naar **Domains** → voeg je domein toe (bijv. `agentmakers.io`) → volg de DNS-instructies om je domein te verifiëren
   - (Dit zijn TXT-records die je bij TransIP instelt — het is anders dan je A-record, dus geen risico)

---

## STAP 3 — Anthropic API key

1. Ga naar **https://console.anthropic.com**
2. Maak een account aan → ga naar **API Keys** → klik "Create Key"
3. Kopieer de key → sla op als **ANTHROPIC_API_KEY**

---

## STAP 4 — GitHub (code uploaden)

1. Ga naar **https://github.com** → maak een gratis account aan
2. Klik het **+** icoontje rechtsbovenaan → "New repository"
3. Naam: `agentmakers-website` → kies **Private** → klik "Create repository"
4. Open je Terminal (Mac: Spotlight → "Terminal"):

```bash
cd ~/Desktop/newaiwebsite
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/JOUW_USERNAME/agentmakers-website.git
git push -u origin main
```

(Vervang `JOUW_USERNAME` door je eigen GitHub gebruikersnaam)

---

## STAP 5 — Vercel instellen (website live zetten)

1. Ga naar **https://vercel.com** → maak een account aan via "Continue with GitHub"
2. Klik "Add New → Project"
3. Klik "Import" naast `agentmakers-website`
4. **Framework Preset**: Next.js (automatisch herkend)
5. Klik op **"Environment Variables"** en voeg ALLE onderstaande variabelen toe:

| Naam | Waarde |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | (jouw Supabase URL van stap 1) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (jouw anon key van stap 1) |
| `SUPABASE_SERVICE_ROLE_KEY` | (jouw service role key van stap 1) |
| `ANTHROPIC_API_KEY` | (jouw Anthropic key van stap 3) |
| `RESEND_API_KEY` | (jouw Resend key van stap 2) |
| `RESEND_FROM_EMAIL` | `noreply@agentmakers.io` |
| `ADMIN_EMAIL` | `richard@leadking.nl` |
| `NEXT_PUBLIC_SITE_URL` | `https://agentmakers.io` |
| `ADMIN_SECRET_KEY` | (zelfgekozen lang wachtwoord, bijv. `Agentbay@2026!Geheim`) |

6. Klik **"Deploy"** → wacht 2–3 minuten
7. ✅ Je website draait nu op een tijdelijk Vercel-adres (bijv. `agentmakers-website.vercel.app`)

---

## STAP 6 — Jouw domein koppelen

1. In Vercel → ga naar je project → **Settings → Domains**
2. Voer in: `agentmakers.io` → klik Add
3. Vercel toont je twee DNS-records die je moet instellen bij **TransIP**

**Bij TransIP:**
1. Log in → ga naar Domeinen → agentmakers.io → DNS-instellingen
2. **Verwijder** de huidige A-record(s) die naar het Avada/WordPress wijzen
3. Voeg de twee records van Vercel toe (dat zijn een A-record en een CNAME)
4. Sla op → wacht 10–30 minuten

5. Terug in Vercel → klik "Refresh" → je ziet een groen vinkje wanneer het werkt ✅

---

## STAP 7 — Inloggen op je admin dashboard

1. Ga naar **https://agentmakers.io/admin**
2. Voer de `ADMIN_SECRET_KEY` in die je in stap 5 hebt ingesteld
3. Je ziet nu het dashboard met de kliniek-pagina die al klaar staat

---

## 🎉 Klaar!

Je website is live op:
- **Homepage**: agentmakers.io
- **Kliniek pagina**: agentmakers.io/nl/klinieken (ook /en/klinieken en /es/klinieken)
- **Admin**: agentmakers.io/admin

---

## Nieuwe branche toevoegen (later)

1. Ga naar agentmakers.io/admin
2. Klik "Nieuwe pagina"
3. Vul de branchenaam in (bijv. "Tandartspraktijken") en de URL-slug (bijv. "tandartsen")
4. Klik "Pagina genereren" → Claude AI schrijft alles automatisch in NL, EN en ES
5. Klik daarna "Live zetten" wanneer je er tevreden mee bent

---

## Hulp nodig?

Stuur een bericht naar richard@leadking.nl of open een GitHub issue.
