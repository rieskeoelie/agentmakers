# Outreach engine — environment variables

Configuration for the outreach engine in `src/lib/outreach/`. Names only — never commit values.
Set them in `.env.local` (local) and in Vercel → Project Settings → Environment Variables.

The engine reads them via `loadOutreachEnv()` in `src/lib/outreach/adapter.ts`; it never loads env files itself.

## Required (for real runs)

| Variable | Used for |
|---|---|
| `DATAFORSEO_LOGIN` | DataForSEO company discovery and public decision-maker search |
| `DATAFORSEO_PASSWORD` | DataForSEO company discovery and public decision-maker search |
| `HUNTER_API_KEY` | Hunter decision-maker email lookup and verification |

`ANTHROPIC_API_KEY` is also required; it is already part of the existing production configuration.

## Required for the background worker (Stage 2)

| Variable | Used for |
|---|---|
| `CRON_SECRET` | Authorizes `/api/outreach/worker` (`Authorization: Bearer …`). Vercel Cron sends it automatically. Must be at least 16 characters; without it the worker refuses every request and runs never start. |

The worker also needs the existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-side only).

## Sending (Stage 4 — Smartlead)

| Variable | Used for | If unset |
|---|---|---|
| `SMARTLEAD_API_KEY` | Cold sending + follow-up sequences via Smartlead (Sensitive, Production only) | Nothing is ever pushed; stop/kill-switch propagation is skipped |
| `OUTREACH_WEBHOOK_SECRET` | Token in the Smartlead webhook URL (`/api/outreach/webhooks/smartlead?token=…`), ≥ 24 characters (Sensitive) | Webhooks are rejected (401); the sync polling still ingests sends/replies |
| `OUTREACH_PUBLIC_BASE_URL` | Public https origin used in the webhook URL | Falls back to `NEXT_PUBLIC_SITE_URL` |
| `OUTREACH_SENDING_DISABLED` | Hard environment kill switch (`true` = nothing is pushed, campaigns are paused) | Database kill switch only |

Resend (`RESEND_API_KEY`) stays transactional only (confirmations, admin notifications, weekly report, inbound demo follow-up).

## Optional

| Variable | Used for | If unset |
|---|---|---|
| `PROSPEO_API_KEY` | Prospeo verified-email fallback after Hunter | Prospeo is never called |
| `HUNTER_EUR_PER_CREDIT` | Cost tracking for Hunter credits | Placeholder estimate is used |
| `PROSPEO_EUR_PER_CREDIT` | Cost tracking for Prospeo credits | Placeholder estimate is used |
| `USD_TO_EUR` | Converting USD provider costs to EUR for cost tracking | Placeholder rate is used |
| `OUTREACH_PROSPECT_RESERVATION_EUR` | Budget reserved per job before it may spend (0.05–10) | 1.00 |
| `OUTREACH_WORKER_MAX_PARALLEL` | Jobs one worker invocation runs at the same time (1–10) | 5 |

Tests never use these: `test/outreach/setup.ts` strips credentials and blocks all network access.
