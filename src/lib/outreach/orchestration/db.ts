/**
 * Database access for the outreach orchestration.
 *
 * Every state change goes through a Postgres function (see supabase/migrations/*_outreach_stage2.sql),
 * so transitions, leases, budget reservations and dedupe are atomic in the database. Production uses the
 * Supabase service-role client; tests use a real Postgres (PGlite) with the same migration.
 *
 * Server-side only.
 */
export interface OutreachDb {
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T>;
}

export type OutreachErrorCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID_TRANSITION" | "VALIDATION" | "DB";

export class OutreachError extends Error {
  constructor(readonly code: OutreachErrorCode, message: string) {
    super(message);
    this.name = "OutreachError";
  }
}

/** Maps a database error message to a typed error. Functions raise 'OUTREACH_<CODE>[: detail]'. */
export function toOutreachError(message: string): OutreachError {
  const m = /OUTREACH_(NOT_FOUND|FORBIDDEN|INVALID_TRANSITION|VALIDATION)(?::\s*([^\n]*))?/.exec(message);
  if (m) return new OutreachError(m[1] as OutreachErrorCode, m[2]?.trim() || m[1]!);
  if (/violates check constraint|invalid input syntax|violates not-null constraint/i.test(message)) return new OutreachError("VALIDATION", message);
  return new OutreachError("DB", message);
}

export interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}
export interface SupabaseRpcLike {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
}

/** Wraps the Supabase service-role client. */
export function supabaseOutreachDb(client: SupabaseRpcLike): OutreachDb {
  return {
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw toOutreachError(error.message);
      return data as T;
    },
  };
}
