import { describe, expect, it, vi } from "vitest";
import { HARD_MAX_PROSPECTS } from "../../../src/lib/outreach/config.js";
import { planRunAction, RUN_STATUSES } from "../../../src/lib/outreach/orchestration/states.js";
import { ApiError, outreachApi } from "../../../src/lib/outreach/ui/api.js";
import { duration, eur, percent } from "../../../src/lib/outreach/ui/format.js";
import { EMPTY_NEW_RUN, inputFromRun, MAX_PROSPECTS_PER_RUN, validateNewRun } from "../../../src/lib/outreach/ui/newRun.js";
import { EMPTY_FILTERS, lifecycle, pageCount, prospectQuery, splitEvidence, themeFacts, verificationLabel } from "../../../src/lib/outreach/ui/prospects.js";
import { reasonLabel, splitReasons } from "../../../src/lib/outreach/ui/review.js";
import { funnelSteps, groupRuns, runActions, runProgress } from "../../../src/lib/outreach/ui/runs.js";
import type { RunFunnel } from "../../../src/lib/outreach/ui/types.js";

const funnel = (o: Partial<RunFunnel> = {}): RunFunnel => ({
  discovered: 15, selected: 10, total: 10, researched: 9, good_fit: 5, possible_fit: 2, decision_makers: 6, business_emails: 5, eligible_emails: 4,
  ready: 3, needs_review: 2, blocked: 1, skipped: 3, failed: 0, pending: 0, in_progress: 0, finished: 10, cancelled: 0, ...o,
});

describe("new run validation", () => {
  const ok = { ...EMPTY_NEW_RUN, name: "Tandartsen Hoorn", niche: "tandarts", region: "Hoorn", landingUrl: "https://agentmakers.io/nl/tandartspraktijken" };
  it("accepts a valid form and builds the API body (mode, start flag, budget with comma)", () => {
    const r = validateNewRun({ ...ok, budget: "7,5", mode: "AUTOPILOT", limit: "20" }, false);
    expect(r).toEqual({ ok: true, body: { name: "Tandartsen Hoorn", sending_mode: "AUTOPILOT", start: false,
      campaign: { niche: "tandarts", country: "Netherlands", region: "Hoorn", agentmakers_url: "https://agentmakers.io/nl/tandartspraktijken", limit: 20, max_api_budget_eur: 7.5, language: "nl" } } });
  });
  it("keeps the 20-prospect maximum (same as the Phase 0 hard cap)", () => {
    expect(MAX_PROSPECTS_PER_RUN).toBe(HARD_MAX_PROSPECTS);
    const r = validateNewRun({ ...ok, limit: "21" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.limit).toMatch(/20/);
    expect(validateNewRun({ ...ok, limit: "0" }).ok).toBe(false);
    expect(validateNewRun({ ...ok, limit: "2.5" }).ok).toBe(false);
  });
  it("reports every missing/invalid field", () => {
    const r = validateNewRun({ ...EMPTY_NEW_RUN, country: "", budget: "0", landingUrl: "https://evil.example/x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["budget", "country", "landingUrl", "name", "niche"]);
    expect(validateNewRun({ ...ok, budget: "101" }).ok).toBe(false);
    expect(validateNewRun({ ...ok, landingUrl: "http://agentmakers.io/nl/x" }).ok).toBe(false);
  });
  it("duplicate prefill copies the settings and never exceeds the cap", () => {
    const i = inputFromRun({ name: "A", sending_mode: "AUTOPILOT", campaign: { niche: "tandarts", country: "NL", agentmakers_url: "https://agentmakers.io/nl/x", limit: 30 }, budget_cap_eur: 4 });
    expect(i).toMatchObject({ name: "A (kopie)", limit: "20", budget: "4", mode: "AUTOPILOT", landingUrl: "https://agentmakers.io/nl/x" });
  });
});

describe("runs view logic", () => {
  it("groups runs into active / paused / completed / failed-stopped", () => {
    const g = groupRuns(RUN_STATUSES.map((status) => ({ status })));
    expect(g.active.map((r) => r.status)).toEqual(["CREATED", "QUEUED", "RUNNING"]);
    expect(g.paused.map((r) => r.status)).toEqual(["PAUSED"]);
    expect(g.completed.map((r) => r.status)).toEqual(["COMPLETED"]);
    expect(g.ended.map((r) => r.status)).toEqual(["STOPPED", "FAILED"]);
  });
  it("offers exactly the actions the shared state machine allows (no frontend state logic)", () => {
    for (const status of RUN_STATUSES) for (const setup of ["PENDING", "DONE"]) {
      const offered = runActions({ status, setup_state: setup }).map((a) => a.action);
      const allowed = (["start", "pause", "resume", "stop"] as const).filter((a) => planRunAction(status, a, setup === "DONE").to !== null);
      expect(offered).toEqual(allowed);
    }
    expect(runActions({ status: "RUNNING", setup_state: "DONE" }).map((a) => a.action)).toEqual(["pause", "stop"]);
    expect(runActions({ status: "COMPLETED", setup_state: "DONE" })).toEqual([]);
  });
  it("progress", () => {
    expect(runProgress({ status: "RUNNING", setup_state: "IN_PROGRESS", funnel: funnel() })).toMatchObject({ pct: null, label: "Bedrijven zoeken…" });
    expect(runProgress({ status: "CREATED", setup_state: "PENDING", funnel: funnel() }).label).toBe("Niet gestart");
    expect(runProgress({ status: "RUNNING", setup_state: "DONE", funnel: funnel({ finished: 4, total: 10 }) })).toMatchObject({ pct: 40, label: "4 / 10 verwerkt" });
    expect(runProgress({ status: "COMPLETED", setup_state: "DONE", funnel: funnel({ finished: 0, total: 0 }) }).pct).toBe(100);
    expect(runProgress({ status: "FAILED", setup_state: "FAILED", funnel: funnel() }).label).toBe("Opzetten mislukt");
  });
  it("funnel steps in the required order", () => {
    expect(funnelSteps(funnel()).map((s) => s.key)).toEqual(["discovered", "researched", "good_fit", "decision_makers", "business_emails", "ready", "needs_review"]);
  });
});

describe("prospects view logic", () => {
  it("builds a server-side query with only the active filters, paging and view-as", () => {
    expect(prospectQuery(EMPTY_FILTERS, 0)).toBe("limit=25&offset=0");
    expect(prospectQuery({ ...EMPTY_FILTERS, fit: "GOOD_FIT", q: "  mond " }, 2, "u-1")).toBe("fit=GOOD_FIT&q=mond&limit=25&offset=50&view_as=u-1");
    expect(pageCount(0)).toBe(1);
    expect(pageCount(51)).toBe(3);
  });
  it("lifecycle and verification labels", () => {
    expect(lifecycle({ outcome: null, queue_state: "IN_PROGRESS" })).toBe("IN_PROGRESS");
    expect(lifecycle({ outcome: "READY", queue_state: "DONE" })).toBe("READY");
    expect(verificationLabel("valid", "ELIGIBLE").tone).toBe("good");
    expect(verificationLabel("accept_all", "REVIEW_ONLY").tone).toBe("warn");
    expect(verificationLabel("invalid", "NOT_ELIGIBLE").tone).toBe("bad");
    expect(verificationLabel(null).tone).toBe("none");
  });
  it("FACT and INFERENCE are separated and themed; inferences never become brain facts", () => {
    const ev = [
      { kind: "FACT" as const, signal: "PHONE_HOURS", ref: "F1" }, { kind: "FACT" as const, signal: "EMERGENCY_ROUTING", ref: "F2" },
      { kind: "FACT" as const, signal: "SOMETHING_NEW", ref: "F3" }, { kind: "INFERENCE" as const, signal: null, ref: "I1" },
    ];
    const { facts, inferences } = splitEvidence(ev);
    expect(facts.map((f) => f.ref)).toEqual(["F1", "F2", "F3"]);
    expect(inferences.map((f) => f.ref)).toEqual(["I1"]);
    const themes = Object.fromEntries(themeFacts(ev).map((t) => [t.key, t.facts.map((f) => f.ref)]));
    expect(themes).toEqual({ phone: [], hours: ["F1"], booking: [], emergency: ["F2"], other: ["F3"] });
  });
});

describe("review logic", () => {
  it("splits resolvable review reasons from hard prohibitions (unknown codes are hard)", () => {
    expect(splitReasons(["EMAIL_NOT_ELIGIBLE:REVIEW_ONLY", "FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL", "GENERIC_ADDRESS_NOT_A_RECIPIENT", "COPY:X:y", "NEW_CODE"]))
      .toEqual({ resolvable: ["EMAIL_NOT_ELIGIBLE:REVIEW_ONLY", "FIT_POSSIBLE_FIT_REQUIRES_MANUAL_APPROVAL"], hard: ["GENERIC_ADDRESS_NOT_A_RECIPIENT", "COPY:X:y", "NEW_CODE"] });
  });
  it("explains codes in plain language", () => {
    expect(reasonLabel("GENERIC_ADDRESS_NOT_A_RECIPIENT")).toMatch(/nooit een ontvanger/);
    expect(reasonLabel("SUPPRESSED_EMAIL:unsubscribe")).toMatch(/email: unsubscribe/);
    expect(reasonLabel("CTA_COUNT_2")).toMatch(/één vraag/);
    expect(reasonLabel("UNKNOWN_THING")).toBe("UNKNOWN_THING");
  });
});

describe("format", () => {
  it("money, percent, duration", () => {
    expect(eur(1.5)).toBe("€1,50");
    expect(eur(0.00184)).toBe("€0,0018");
    expect(eur("3")).toBe("€3,00");
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
    expect(duration("2026-10-07T10:00:00Z", "2026-10-07T10:02:05Z")).toBe("2m 5s");
    expect(duration(null, null)).toBe("—");
  });
});

describe("API client (browser → admin API)", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  it("adds view-as for superadmin view-as and never sends keys", async () => {
    const f = vi.fn(async () => json(200, { runs: [] }));
    await outreachApi("partner-1", f as typeof fetch).listRuns();
    expect(f).toHaveBeenCalledWith("/api/outreach/runs?view_as=partner-1", expect.objectContaining({ cache: "no-store" }));
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization|apikey|secret/i);
    const g = vi.fn(async () => json(201, { created: true, run: { id: "r" } }));
    await outreachApi("partner-1", g as typeof fetch).createRun({ name: "x" } as never);
    const [, init2] = g.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init2.body))).toMatchObject({ view_as_user_id: "partner-1" });
  });
  it("maps API errors (401/403/404/409 with blockers) and network failures", async () => {
    const api = (status: number, body: unknown) => outreachApi(null, (async () => json(status, body)) as typeof fetch);
    await expect(api(401, {}).listRuns()).rejects.toMatchObject({ status: 401, message: "Niet ingelogd." });
    await expect(api(403, { error: "Only admins can start paid outreach runs" }).createRun({} as never)).rejects.toMatchObject({ status: 403, message: "Only admins can start paid outreach runs" });
    await expect(api(404, { error: "Not found" }).getRun("x")).rejects.toMatchObject({ status: 404 });
    const e = await api(409, { error: "Goedkeuren niet toegestaan", ok: false, blockers: ["GENERIC_ADDRESS_NOT_A_RECIPIENT"] }).review("p", "APPROVE").catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).details?.blockers).toEqual(["GENERIC_ADDRESS_NOT_A_RECIPIENT"]);
    await expect(outreachApi(null, (async () => { throw new Error("offline"); }) as typeof fetch).listRuns()).rejects.toMatchObject({ status: 0 });
    await expect(outreachApi(null, (async () => new Response("<html>", { status: 500 })) as typeof fetch).listRuns()).rejects.toMatchObject({ status: 500, message: "Er ging iets mis." });
  });
});
