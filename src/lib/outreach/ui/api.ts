import type { NewRunBody } from "./newRun";
import { prospectQuery, type ProspectFilters } from "./prospects";
import type {
  OutreachSettingsView, Page, ProspectDetail, ProspectListItem, ReviewAction, ReviewActionResult, ReviewQueueItem, RunOverview, RunSummary,
} from "./types";

/** Browser → admin API. Auth is the existing session cookie; no keys are ever sent or received. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
  }
}

type Fetch = typeof fetch;

async function call<T>(fetchImpl: Fetch, url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  } catch {
    throw new ApiError(0, "Geen verbinding met de server.");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>;
    const msg = typeof b.error === "string" ? b.error : res.status === 401 ? "Niet ingelogd." : res.status === 403 ? "Geen toegang." : res.status === 404 ? "Niet gevonden." : "Er ging iets mis.";
    throw new ApiError(res.status, msg, b);
  }
  return body as T;
}

const withViewAs = (path: string, viewAs?: string | null) => (viewAs ? `${path}${path.includes("?") ? "&" : "?"}view_as=${encodeURIComponent(viewAs)}` : path);

export function outreachApi(viewAs: string | null = null, fetchImpl: Fetch = (...a) => fetch(...a)) {
  return {
    listRuns: () => call<{ runs: RunSummary[] }>(fetchImpl, withViewAs("/api/outreach/runs", viewAs)).then((r) => r.runs),
    getRun: (id: string) => call<RunOverview>(fetchImpl, `/api/outreach/runs/${encodeURIComponent(id)}`),
    createRun: (body: NewRunBody) =>
      call<{ created: boolean; run: RunSummary }>(fetchImpl, "/api/outreach/runs", { method: "POST", body: JSON.stringify(viewAs ? { ...body, view_as_user_id: viewAs } : body) }),
    runAction: (id: string, action: "start" | "pause" | "resume" | "stop") =>
      call<{ run: RunSummary }>(fetchImpl, `/api/outreach/runs/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" }).then((r) => r.run),
    listProspects: (f: ProspectFilters, page: number) => call<Page<ProspectListItem>>(fetchImpl, `/api/outreach/prospects?${prospectQuery(f, page, viewAs)}`),
    getProspect: (id: string) => call<ProspectDetail>(fetchImpl, `/api/outreach/prospects/${encodeURIComponent(id)}`),
    reviewQueue: (page = 0, size = 20) => call<Page<ReviewQueueItem>>(fetchImpl, withViewAs(`/api/outreach/review?limit=${size}&offset=${page * size}`, viewAs)),
    review: (id: string, action: ReviewAction, reason?: string) =>
      call<ReviewActionResult>(fetchImpl, `/api/outreach/prospects/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ action, reason }) }),
    settings: () => call<OutreachSettingsView>(fetchImpl, "/api/outreach/settings"),
  };
}

export type OutreachApi = ReturnType<typeof outreachApi>;
