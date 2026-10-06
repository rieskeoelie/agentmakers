import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { getSessionFromRequest } from './auth'

/**
 * Constant-time secret check. Succeeds ONLY when the configured secret is a non-empty value AND the
 * supplied value matches it exactly. A missing/empty secret never authorizes — unlike
 * `supplied === process.env.SECRET`, which is true when both are undefined.
 */
export function secretMatches(supplied: string | null | undefined, configured: string | null | undefined): boolean {
  if (typeof configured !== 'string' || configured.trim() === '') return false
  if (typeof supplied !== 'string' || supplied === '') return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(configured)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Token from `Authorization: Bearer <token>` — same extraction the cron routes always used. */
export function bearerFrom(req: NextRequest): string | undefined {
  return req.headers.get('authorization')?.replace('Bearer ', '')
}

/** Vercel Cron / manual trigger with CRON_SECRET. */
export function hasValidCronSecret(req: NextRequest, secret = process.env.CRON_SECRET): boolean {
  return secretMatches(bearerFrom(req), secret)
}

/** Manual trigger with the `x-admin-key` header. */
export function hasValidAdminKey(req: NextRequest, key = process.env.ADMIN_SECRET_KEY): boolean {
  return secretMatches(req.headers.get('x-admin-key'), key)
}

/** /api/cron/scrape-queue: CRON_SECRET, or any logged-in user (the admin dashboard triggers it). */
export function isScrapeQueueAuthorized(req: NextRequest): boolean {
  return hasValidCronSecret(req) || !!getSessionFromRequest(req)
}

/** /api/cron/follow-up and /api/cron/weekly-report: CRON_SECRET or ADMIN_SECRET_KEY. */
export function isCronOrAdminKeyAuthorized(req: NextRequest): boolean {
  return hasValidCronSecret(req) || hasValidAdminKey(req)
}

/** /api/scrape: `x-internal-secret` header = ADMIN_SECRET_KEY (the route's only auth path). */
export function hasValidInternalSecret(req: NextRequest, key = process.env.ADMIN_SECRET_KEY): boolean {
  return secretMatches(req.headers.get('x-internal-secret'), key)
}
