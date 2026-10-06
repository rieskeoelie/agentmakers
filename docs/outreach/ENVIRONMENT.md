# Outreach engine — environment variables

Configuration for the outreach engine in `src/lib/outreach/`. Names only — never commit values.
Set them in `.env.local` (local) and in Vercel → Project Settings → Environment Variables.

The engine reads them via `loadOutreachEnv()` in `src/lib/outreach/adapter.ts`; it never loads env files itself.

## Required (for real runs)

| Variable | Used for |
|---|---|
| `DATAFORSEO_LOGIN` | DataForSEO company discovery and public decision-maker search |
| `DATAFORSEO_PASSWORD` | DataForSEO company discovery and public decision-maker search |
| `HUNTER_API_KEY` | Hunter decision-maker email lookup and verification (also used by `/api/admin/hunter-lookup`) |

`ANTHROPIC_API_KEY` is also required; it is already part of the existing production configuration.

## Optional

| Variable | Used for | If unset |
|---|---|---|
| `PROSPEO_API_KEY` | Prospeo verified-email fallback after Hunter | Prospeo is never called |
| `HUNTER_EUR_PER_CREDIT` | Cost tracking for Hunter credits | Placeholder estimate is used |
| `PROSPEO_EUR_PER_CREDIT` | Cost tracking for Prospeo credits | Placeholder estimate is used |
| `USD_TO_EUR` | Converting USD provider costs to EUR for cost tracking | Placeholder rate is used |

Tests never use these: `test/outreach/setup.ts` strips credentials and blocks all network access.
