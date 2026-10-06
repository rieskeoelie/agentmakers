import { timingSafeEqual } from "node:crypto";

/** Minimum CRON_SECRET length accepted for the worker endpoint. */
export const MIN_WORKER_SECRET_LENGTH = 16;

/**
 * Worker endpoint auth: `Authorization: Bearer <CRON_SECRET>` (the header Vercel Cron sends).
 * A missing or short secret never authorizes — unlike `bearer === process.env.CRON_SECRET`, which is
 * true when both are undefined.
 */
export function isWorkerAuthorized(authorization: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || secret.length < MIN_WORKER_SECRET_LENGTH) return false;
  if (!authorization?.startsWith("Bearer ")) return false;
  const a = Buffer.from(authorization.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Starts a worker invocation (continuation chain / after start-resume). Never throws.
 * The worker answers 202 immediately and does its work after the response.
 */
export async function kickWorker(o: { origin: string; secret: string | undefined; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<boolean> {
  if (!o.secret || o.secret.length < MIN_WORKER_SECRET_LENGTH) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 10_000);
  try {
    const res = await (o.fetchImpl ?? fetch)(new URL("/api/outreach/worker", o.origin).toString(), {
      method: "POST",
      headers: { authorization: `Bearer ${o.secret}` },
      signal: controller.signal,
    });
    return res.status === 202 || res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
