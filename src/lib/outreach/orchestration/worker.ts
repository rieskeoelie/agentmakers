import { repo } from "./repository";
import { safeRunProspect, safeRunSetup, type WorkerContext } from "./jobs";

export interface TickResult {
  claimedSetups: number;
  claimedProspects: number;
  hasMoreWork: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One worker invocation. Claims jobs (with leases and budget reservations) while inside the claim window,
 * runs up to `maxParallel` jobs at once, and waits for all of them before returning. All state lives in the
 * database, so this can be killed at any moment: unfinished leases expire and the work is picked up again.
 *
 * `hasMoreWork` tells the caller to schedule another invocation (continuation chain).
 */
export async function runWorkerTick(ctx: WorkerContext, opts: { now?: () => number } = {}): Promise<TickResult> {
  const now = opts.now ?? Date.now;
  const s = ctx.settings;
  const started = now();
  const inflight = new Set<Promise<void>>();
  let claimedSetups = 0;
  let claimedProspects = 0;
  const launch = (p: Promise<void>) => {
    const t: Promise<void> = p.finally(() => inflight.delete(t));
    inflight.add(t);
  };

  while (now() - started < s.claimCutoffMs) {
    const capacity = s.maxParallel - inflight.size;
    if (capacity > 0) {
      const claim = await repo.claimWork(ctx.db, {
        workerId: ctx.workerId, maxProspects: capacity, leaseSeconds: s.leaseSeconds,
        reservationEur: s.reservationEur, minReservationEur: s.minReservationEur,
      });
      for (const job of claim.setups) launch(safeRunSetup(ctx, job));
      for (const job of claim.prospects) launch(safeRunProspect(ctx, job));
      claimedSetups += claim.setups.length;
      claimedProspects += claim.prospects.length;
      if (claim.setups.length || claim.prospects.length) continue;
    }
    if (inflight.size) {
      await Promise.race([...inflight, sleep(s.idlePollMs)]);
      continue;
    }
    const pw = await repo.pendingWork(ctx.db);
    const remaining = s.claimCutoffMs - (now() - started);
    const dueIn = pw.next_due_at ? Date.parse(pw.next_due_at) - Date.now() : null;
    if (pw.due_now > 0 || (dueIn !== null && dueIn < remaining)) {
      await sleep(Math.min(Math.max(dueIn ?? s.idlePollMs, 250), s.idlePollMs * 5, Math.max(remaining, 0)));
      continue;
    }
    break;
  }
  await Promise.all(inflight);
  const pw = await repo.pendingWork(ctx.db);
  return { claimedSetups, claimedProspects, hasMoreWork: pw.due_now > 0 || pw.next_due_at !== null };
}
