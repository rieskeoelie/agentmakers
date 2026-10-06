import { z } from "zod";

/**
 * Worker tuning. Defaults are sized for a Vercel Function with maxDuration = 300 s:
 * - a lease (900 s) outlives any single invocation, so a crashed/timed-out worker's job is reclaimed;
 * - new jobs are only claimed during the first 120 s of a tick, so in-flight prospects (typically 10–30 s,
 *   worst case ~2 min with slow websites) finish before the 300 s limit;
 * - each job reserves at most 1.00 EUR of the run budget up front (Phase 0 prospects cost far less).
 */
export interface WorkerSettings {
  leaseSeconds: number;
  reservationEur: number;
  minReservationEur: number;
  maxParallel: number;
  tickBudgetMs: number;
  claimCutoffMs: number;
  idlePollMs: number;
}

export const DEFAULT_WORKER_SETTINGS: WorkerSettings = {
  leaseSeconds: 900,
  reservationEur: 1,
  minReservationEur: 0.05,
  maxParallel: 5,
  tickBudgetMs: 240_000,
  claimCutoffMs: 120_000,
  idlePollMs: 2_000,
};

const optNum = (min: number, max: number) =>
  z.string().optional().transform((v) => (v === undefined || v.trim() === "" ? undefined : Number(v))).pipe(z.number().min(min).max(max).optional());

/** Optional overrides: OUTREACH_PROSPECT_RESERVATION_EUR (0.05–10) and OUTREACH_WORKER_MAX_PARALLEL (1–10). */
export function workerSettingsFromEnv(env: Record<string, string | undefined> = process.env): WorkerSettings {
  const o = z.object({ OUTREACH_PROSPECT_RESERVATION_EUR: optNum(0.05, 10), OUTREACH_WORKER_MAX_PARALLEL: optNum(1, 10) }).parse(env);
  return {
    ...DEFAULT_WORKER_SETTINGS,
    reservationEur: o.OUTREACH_PROSPECT_RESERVATION_EUR ?? DEFAULT_WORKER_SETTINGS.reservationEur,
    maxParallel: Math.floor(o.OUTREACH_WORKER_MAX_PARALLEL ?? DEFAULT_WORKER_SETTINGS.maxParallel),
  };
}
