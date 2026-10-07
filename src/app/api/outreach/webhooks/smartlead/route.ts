import { NextRequest, NextResponse, after } from 'next/server'
import { loadOutreachEnv } from '@/lib/outreach/adapter'
import { outreachDb } from '@/lib/outreach/orchestration/http'
import { sendRepo } from '@/lib/outreach/sending/repository'
import { replyLlmFactory, runAnalysisTick, sendContext, sendingEnvFrom } from '@/lib/outreach/sending/runtime'
import { stopAtProvider } from '@/lib/outreach/sending/sender'
import { isWebhookAuthorized, normalizeSmartleadEvent } from '@/lib/outreach/sending/webhook'

export const maxDuration = 60

/**
 * POST /api/outreach/webhooks/smartlead?token=<OUTREACH_WEBHOOK_SECRET>
 * Idempotent (X-Request-Id / body hash). A reply, bounce or unsubscribe stops the lead's sequence immediately
 * (Smartlead also stops on reply by itself). Replies are classified after the response; nothing is ever auto-sent.
 * 2xx = processed or duplicate; 401 = bad token; 400 = not a Smartlead event; 500 = retry later.
 */
export async function POST(req: NextRequest) {
  const s = sendingEnvFrom()
  if (!isWebhookAuthorized(req.nextUrl.searchParams.get('token'), s.webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const raw = await req.text()
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const event = normalizeSmartleadEvent(payload, { requestId: req.headers.get('x-request-id'), rawBody: raw })
  if (!event) return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
  const db = outreachDb()
  const ctx = sendContext(db, s, (m, d) => console.log('[outreach-webhook]', m, d ?? ''))
  try {
    const res = await sendRepo.applyEvent(db, event)
    if (res.stop) await stopAtProvider(ctx, { send_id: res.send_id, ...res.stop }, event.type)
    if (res.analyze) {
      after(async () => {
        try {
          await runAnalysisTick(ctx, replyLlmFactory(loadOutreachEnv()))
        } catch (e) {
          console.error('[outreach-webhook] analysis failed', e)
        }
      })
    }
    return NextResponse.json({ ok: true, duplicate: !!res.duplicate, matched: res.matched ?? null })
  } catch (e) {
    console.error('[outreach-webhook] apply failed', e)
    return NextResponse.json({ error: 'Temporary failure' }, { status: 500 })
  }
}
