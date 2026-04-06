import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'crypto'
import { promisify } from 'util'
import type { NextRequest } from 'next/server'

const scryptAsync = promisify(scrypt)

export const SESSION_COOKIE = 'am_session'
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface SessionPayload {
  userId: string
  username: string
  displayName: string
  isAdmin: boolean
  expiresAt: number
}

// ─── Password hashing ────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, storedHex] = stored.split(':')
  if (!salt || !storedHex) return false
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  const storedBuf = Buffer.from(storedHex, 'hex')
  if (derived.length !== storedBuf.length) return false
  return timingSafeEqual(derived, storedBuf)
}

// ─── Session tokens (HMAC-signed, no external deps) ─────────────────────────

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET env var not set')
  return s
}

export function createSessionToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const dotIdx = token.lastIndexOf('.')
    if (dotIdx === -1) return null
    const data = token.substring(0, dotIdx)
    const sig  = token.substring(dotIdx + 1)
    const expected = createHmac('sha256', getSecret()).update(data).digest('base64url')
    // timing-safe compare
    const sigBuf = Buffer.from(sig, 'base64url')
    const expBuf = Buffer.from(expected, 'base64url')
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as SessionPayload
    if (payload.expiresAt < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function createSession(payload: Omit<SessionPayload, 'expiresAt'>): string {
  return createSessionToken({ ...payload, expiresAt: Date.now() + SESSION_DURATION_MS })
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────

export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  }
}
