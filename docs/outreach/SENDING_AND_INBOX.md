# Outreach — sending, replies, Inbox and CRM promotion (Stage 4)

Source of truth for everything after a prospect is READY. Code: `src/lib/outreach/sending/`, API: `src/app/api/outreach/{sending,inbox,sends,webhooks}`,
UI: `src/components/admin/outreach/{InboxView,SendingPanel}.tsx`, schema: `supabase/migrations/20261008090000_outreach_stage4_sending.sql`.

## Architecture

- AgentMakers is the source of truth. Raw prospects stay in `outreach_prospects`; only an explicit promotion writes to `leads`.
- **Smartlead** sends cold email and follow-ups. **Resend is transactional only** (the old Resend cold-outreach path is removed).
- One Smartlead campaign per run (`AgentMakers · <run> · <id8>`), created on the first push: plain text, no open/click tracking,
  `stop_lead_settings = REPLY_TO_AN_EMAIL`, mailboxes from Smartlead (all active, or `email_account_ids`), campaign webhook to AgentMakers.
- Every step's subject/body comes from per-lead custom fields (`am_s1_subject`, `am_s1_body`, `am_s2_body`, `am_s3_body`), so what Smartlead
  sends is exactly the copy stored in `outreach_sends.sequence`.

## Sequence

| Step | When | Content |
|---|---|---|
| 1 | Day 0 (within the sending window) | The stored Phase 0 email (validated / human-reviewed) + opt-out line ("Antwoord met stop") |
| 2 | +3 days (configurable) | Fixed follow-up copy, same thread, first name + company only, opt-out line |
| 3 | +4 days (= day 7) | Fixed closing note, same thread |

Follow-up copy contains no claims, numbers or links and passes the same claim guard as Phase 0 emails (tested).

## Send states (`outreach_sends.state`)

`QUEUED → PUSHING → ACTIVE → COMPLETED`, ending early in `REPLIED`, `BOUNCED`, `UNSUBSCRIBED`, `STOPPED`; `CANCELLED` (never pushed) or `FAILED`.

## Safety controls

- **Kill switch** (`outreach_sending_config.sending_enabled`, default **off**). Any admin can switch it off; only a superadmin can switch it on
  (two-click confirm in Instellingen). Off ⇒ nothing is claimed and every Smartlead campaign is paused. `OUTREACH_SENDING_DISABLED=true` overrides the database.
- **Test mode** (`test_recipients`): when non-empty, only those addresses can be pushed.
- **Rate limits**: `daily_new_leads_cap` (new leads per UTC day, also the campaign's `max_leads_per_day`), `max_pushes_per_tick`, Smartlead schedule
  (Mon–Fri 09:00–17:00 Europe/Amsterdam, ≥ 10 min between emails).
- **Final pre-send gate** (`outreach_send_gate`), evaluated when queueing AND again inside the claim transaction right before each push:
  READY + not stopped run + stored email + named decision maker + valid, non-generic, eligible address (review-approved REVIEW_ONLY allowed) +
  no suppression (global or account) + never contacted before (address or domain, **global across accounts**) + not already in the CRM (email or website domain).
  A send blocked at push time is cancelled with the reasons.
- **Reply stops the sequence immediately**: Smartlead stops on reply by itself, and AgentMakers pauses the lead as soon as the reply webhook (or the sync) arrives.
- **Bounce / unsubscribe** (provider event, or a reply classified UNSUBSCRIBE) ⇒ GLOBAL suppression + lead stopped. "Not interested" / "wrong person"
  ⇒ account-level do-not-contact. Suppressions added later stop live leads at the next tick (`outreach_stop_candidates`).
- **Run pause/stop** pauses the run's Smartlead campaign; stop also stops its live leads.
- **Autopilot**: only for runs in AUTOPILOT mode, only when both `sending_enabled` and `autopilot_enabled` are on, always through the gate.
- **AI budget**: reply classification/drafts are limited by `daily_llm_budget_eur`; when exhausted, replies are marked OTHER for a human.

## Webhooks and sync

- `POST /api/outreach/webhooks/smartlead?token=<OUTREACH_WEBHOOK_SECRET>` — constant-time token check, idempotent on `X-Request-Id`
  (or SHA-256 of the body) in `outreach_webhook_events`. Payload parsing is tolerant of both Smartlead payload styles; the lead is resolved by
  campaign + email. 2xx = processed/duplicate, 401 = bad token, 400 = not an event, 500 = Smartlead retries.
- The worker tick also replays Smartlead message history for live leads (missed-webhook safety net); duplicates are suppressed
  (provider message id, step number, or reply time ±3 min).

## Inbox

Admin → Prospects → Outreach → **Inbox**: tabs (Actie nodig / Wacht op reactie / Lopende sequences / Afgehandeld / Alles), conversation list,
thread with the full timeline, prospect/run/Company Brain context, AI classification + summary + suggested reply.

- The AI classifies (INTERESTED, QUESTION, NOT_NOW, NOT_INTERESTED, WRONG_PERSON, OOO, UNSUBSCRIBE, OTHER) and drafts. Unambiguous OOO/unsubscribe
  replies are handled by rules without an LLM call. Drafts pass the claim guard or are marked REJECTED (never offered).
- **The AI never sends.** A reply is sent only by a logged-in admin: edit → "Verstuur…" → "Bevestig". The request carries an idempotency key; the
  message is recorded PENDING first and sent in the Smartlead thread (`reply-email-thread`). Refused when sending is off, after bounce/unsubscribe/do-not-contact.
- Disposition, mark done/reopen, suppress address/domain, re-analyze, promote to CRM.

## CRM promotion

`outreach_promote_to_lead` inserts one row into the existing `leads` table (idempotent: `leads.outreach_prospect_id` is unique):
contact name, email, company, website, phone, language, landing-page slug of the run, `referrer = outreach:smartlead`, `user_id` = the owning
account (when it is a real `users.id`), and `business_info` with run, contact/title, fit, classification, reply summary, last reply and
Company Brain facts. `scraped_at` is set and there is no `demo_token`, so the scrape-queue and follow-up crons never touch promoted leads.

## Tenancy and security

All Stage 4 tables have RLS on with no policies and are service_role only; every user-facing function checks `p_actor`/`p_is_superadmin`.
Other accounts' sends/threads do not exist for you; superadmins can view all or narrow with view-as. Configuration is global (superadmin).
Secrets are never returned by the API (booleans only).

## Retired legacy outreach

Removed after the replacement shipped: `/api/admin/prospects`, `/api/admin/hunter-lookup`, `/api/admin/generate-email`, `/api/admin/send-outreach`,
`/api/admin/outreach-history`, `sendOutreachEmail` (Resend), the "Oude demo-link tool" UI and the per-lead "Verstuur mail" button.
`/api/bulk-demo` remains only as a demo-link generator API (no UI, never sends); the follow-up cron is restricted to inbound demo leads and excludes
bulk demo-link imports.
