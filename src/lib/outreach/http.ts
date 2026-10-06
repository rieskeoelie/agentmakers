/**
 * JSON HTTP helper for FIXED provider hosts (DataForSEO, Hunter, Anthropic).
 * Website (untrusted) URLs must NEVER go through this — use safeFetch.ts.
 */
export interface JsonResponse {
  status: number;
  body: unknown;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Max retries on 429/5xx/network errors. Hard-capped at 3. */
  maxRetries?: number;
  /** Status codes that should be retried in addition to 429/5xx (e.g. Hunter 202). */
  retryOn?: number[];
  baseDelayMs?: number;
  fetchImpl?: FetchLike;
}

export const ALLOWED_PROVIDER_HOSTS = new Set(["api.dataforseo.com", "api.hunter.io", "api.anthropic.com", "api.prospeo.io"]);

export class ProviderHttpError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message: string) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function requestJson(url: string, opts: RequestOptions = {}): Promise<JsonResponse> {
  const host = new URL(url).hostname;
  if (!ALLOWED_PROVIDER_HOSTS.has(host)) throw new Error(`Provider host not allowlisted: ${host}`);
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const maxRetries = Math.min(opts.maxRetries ?? 2, 3);
  const retryOn = new Set([429, 500, 502, 503, 504, ...(opts.retryOn ?? [])]);
  const baseDelay = opts.baseDelayMs ?? 500;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: opts.method ?? "GET",
        headers: { accept: "application/json", ...(opts.body ? { "content-type": "application/json" } : {}), ...opts.headers },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        redirect: "error",
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { non_json: text.slice(0, 500) };
      }
      if (retryOn.has(res.status) && attempt < maxRetries) {
        await sleep(baseDelay * 2 ** attempt);
        continue;
      }
      return { status: res.status, body };
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(baseDelay * 2 ** attempt);
        continue;
      }
    }
  }
  throw new Error(`Request failed after ${maxRetries + 1} attempts: ${String((lastErr as Error)?.message ?? lastErr)}`);
}
