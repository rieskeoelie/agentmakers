import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunFunnelChart } from "../../src/components/admin/outreach/RunDetailView.js";
import { activeFunnelIndex, funnelRowState } from "../../src/lib/outreach/ui/runs.js";
import type { RunFunnel } from "../../src/lib/outreach/ui/types.js";
import { count } from "./helpers.js";

const funnel: RunFunnel = {
  discovered: 12, selected: 5, total: 5, researched: 3, good_fit: 2, possible_fit: 0, decision_makers: 1, business_emails: 1, eligible_emails: 1,
  ready: 0, needs_review: 0, blocked: 0, skipped: 0, failed: 0, pending: 2, in_progress: 1, finished: 2, cancelled: 0,
};
const p = (queue_state: "PENDING" | "IN_PROGRESS" | "DONE" | "FAILED" | "CANCELLED", current_step: "RESEARCH" | "COMPANY_BRAIN" | "FIT" | "DECISION_MAKER" | "EMAIL" | "ELIGIBILITY" | "PERSONALIZATION" | "DONE") => ({ queue_state, current_step });

describe("active funnel step", () => {
  it("setup still running → Gevonden is active", () => {
    expect(activeFunnelIndex({ status: "RUNNING", setup_state: "IN_PROGRESS" }, null)).toBe(0);
    expect(activeFunnelIndex({ status: "QUEUED", setup_state: "PENDING" }, null)).toBe(0);
  });
  it("follows the earliest open prospect and moves on as steps complete", () => {
    const run = { status: "RUNNING" as const, setup_state: "DONE" as const };
    expect(activeFunnelIndex(run, [p("DONE", "DONE"), p("IN_PROGRESS", "RESEARCH"), p("PENDING", "RESEARCH")])).toBe(1);
    expect(activeFunnelIndex(run, [p("DONE", "DONE"), p("IN_PROGRESS", "FIT"), p("IN_PROGRESS", "EMAIL")])).toBe(2);
    expect(activeFunnelIndex(run, [p("IN_PROGRESS", "ELIGIBILITY"), p("FAILED", "RESEARCH")])).toBe(4);
    expect(activeFunnelIndex(run, [p("IN_PROGRESS", "PERSONALIZATION")])).toBe(5);
  });
  it("nothing pulses when nothing is processing", () => {
    expect(activeFunnelIndex({ status: "COMPLETED", setup_state: "DONE" }, [p("PENDING", "RESEARCH")])).toBeNull();
    expect(activeFunnelIndex({ status: "PAUSED", setup_state: "DONE" }, [p("PENDING", "RESEARCH")])).toBeNull();
    expect(activeFunnelIndex({ status: "FAILED", setup_state: "FAILED" }, null)).toBeNull();
    expect(activeFunnelIndex({ status: "RUNNING", setup_state: "DONE" }, [p("DONE", "DONE"), p("FAILED", "FIT")])).toBeNull();
    expect(activeFunnelIndex({ status: "RUNNING", setup_state: "DONE" }, null)).toBeNull();
  });
  it("row states: complete before, exactly one active, future after", () => {
    expect([0, 1, 2, 3].map((i) => funnelRowState(i, 1))).toEqual(["complete", "active", "future", "future"]);
    expect(funnelRowState(3, null)).toBe("idle");
  });
});

describe("funnel chart", () => {
  it("running: one pulsing track, earlier rows keep colour, later rows grey", () => {
    const out = renderToStaticMarkup(<RunFunnelChart funnel={funnel} activeIndex={1} />);
    expect(count(out, 'data-state="active"')).toBe(2); // the row and its track
    expect(count(out, 'class="am-bar" data-state="active"')).toBe(1);
    expect(count(out, 'aria-current="step"')).toBe(1);
    expect(out.match(/data-state="future"/g)).toHaveLength(5);
    expect(out.match(/data-state="complete"/g)).toHaveLength(1);
    expect(count(out, 'data-tone="muted"')).toBe(5);
  });
  it("completed / failed run: nothing pulses, existing colours", () => {
    const out = renderToStaticMarkup(<RunFunnelChart funnel={funnel} activeIndex={null} />);
    expect(out).not.toContain('class="am-bar" data-state="active"');
    expect(out).not.toContain('data-tone="muted"');
    expect(out).toContain('data-tone="success"');
    expect(out).toContain('data-tone="warning"');
  });
});
