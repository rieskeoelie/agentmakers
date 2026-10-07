import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActiveFilters, Button, Callout, DataTable, Dialog, Drawer, EmptyState, ErrorState, Metrics, Pagination, Status, TableSkeleton, Timeline } from "../../src/components/admin/ds/index.js";
import { leadSource, leadsPerWeek, stageOf, visibleLeadsFor, type Lead } from "../../src/components/admin/app/model.js";
import { Configured } from "../../src/components/admin/outreach/SendingPanel.js";
import { count } from "./helpers.js";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => undefined;

describe("design system", () => {
  it("buttons carry exactly one variant; loading disables", () => {
    for (const v of ["primary", "secondary", "ghost", "danger"] as const) expect(html(<Button variant={v}>x</Button>)).toContain(`data-variant="${v}"`);
    expect(html(<Button loading>x</Button>)).toContain("disabled");
  });
  it("one Status component with semantic tones", () => {
    expect(html(<Status tone="danger">Mislukt</Status>)).toBe('<span class="am-status" data-tone="danger">Mislukt</span>');
  });
  it("table sorts by the default sort and renders group rows", () => {
    const rows = [{ id: "a", n: 2 }, { id: "b", n: 1 }, { id: "c", n: 3 }];
    const out = html(<DataTable rows={rows} rowKey={(r) => r.id} rowTestId="r" defaultSort={{ key: "n", dir: "asc" }}
      columns={[{ key: "n", header: "N", sort: (r) => r.n, render: (r) => <i>{r.id}</i> }]} />);
    expect(out.indexOf("<i>b</i>")).toBeLessThan(out.indexOf("<i>a</i>"));
    expect(out.indexOf("<i>a</i>")).toBeLessThan(out.indexOf("<i>c</i>"));
    expect(out).toContain('aria-sort="ascending"');
    const grouped = html(<DataTable rows={rows} rowKey={(r) => r.id} columns={[{ key: "n", header: "N", render: (r) => r.id }]} groups={[{ key: "g1", label: "G1", rows: rows.slice(0, 1) }, { key: "empty", label: "E", rows: [] }]} />);
    expect(grouped).toContain('data-testid="group-g1"');
    expect(grouped).not.toContain('data-testid="group-empty"');
  });
  it("feedback states: empty, skeleton loading, local actionable error", () => {
    expect(html(<EmptyState title="Leeg" />)).toContain('data-testid="empty-state"');
    expect(html(<TableSkeleton />)).toContain('aria-busy="true"');
    const err = html(<ErrorState message="Kapot" onRetry={noop} />);
    expect(err).toContain('role="alert"');
    expect(err).toContain(">Opnieuw<");
    expect(html(<Callout tone="warning">Let op</Callout>)).toContain('data-tone="warning"');
  });
  it("active filter chips are individually removable and clearable", () => {
    const out = html(<ActiveFilters items={[{ key: "a", label: "Fit: GOOD_FIT", onRemove: noop }, { key: "b", label: "Run: X", onRemove: noop }]} onClearAll={noop} />);
    expect(count(out, 'aria-label="Verwijder filter')).toBe(2);
    expect(out).toContain("Alles wissen");
    expect(html(<ActiveFilters items={[]} onClearAll={noop} />)).toBe("");
  });
  it("overlays render only when open; dialog is modal and labelled", () => {
    expect(html(<Dialog open={false} title="T" onClose={noop} />)).toBe("");
    const d = html(<Dialog open title="Titel" onClose={noop} />);
    expect(d).toContain('aria-modal="true"');
    expect(d).toContain('aria-labelledby=');
    expect(html(<Drawer open={false} title="T" onClose={noop}>x</Drawer>)).toBe("");
  });
  it("metrics, pagination and timeline", () => {
    expect(html(<Metrics items={[{ label: "Leads", value: 4, onClick: noop }]} />)).toContain('role="button"');
    const p = html(<Pagination page={0} pages={3} total={60} label="items" onPage={noop} />);
    expect(p).toContain("pagina 1 van 3");
    expect(html(<Timeline items={[]} />)).toContain("Nog geen activiteit.");
  });
  it("secrets are only ever shown as configured / not configured", () => {
    expect(html(<Configured ok />)).toContain("Geconfigureerd");
    expect(html(<Configured ok={false} />)).toContain("Niet geconfigureerd");
  });
});

describe("CRM model", () => {
  const lead = (o: Partial<Lead>): Lead => ({ id: "1", naam: "A", email: "a@a.nl", telefoon: "", landing_page_slug: "tandarts", language: "nl", created_at: "2026-10-01T10:00:00Z", ...o });
  it("outreach-origin leads are flagged, not split off", () => {
    expect(leadSource(lead({ outreach_prospect_id: "p1" }))).toBe("outreach");
    expect(leadSource(lead({ referrer: "outreach:inbox" }))).toBe("outreach");
    expect(leadSource(lead({ landing_page_slug: "bulk-outreach" }))).toBe("demo_link");
    expect(leadSource(lead({ landing_page_slug: "invite" }))).toBe("invite");
    expect(leadSource(lead({}))).toBe("website");
  });
  it("account isolation: only the viewed account's leads are visible", () => {
    const leads = [lead({ id: "1", user_id: "u1" }), lead({ id: "2", user_id: "u2" })];
    expect(visibleLeadsFor(leads, "u1").map((l) => l.id)).toEqual(["1"]);
  });
  it("pipeline stage defaults to new; weekly buckets cover the window", () => {
    expect(stageOf({}, "x")).toBe("nieuw");
    expect(stageOf({ x: "demo" }, "x")).toBe("demo");
    const w = leadsPerWeek([lead({ created_at: "2026-10-06T09:00:00Z" })], 4, new Date("2026-10-07T12:00:00Z"));
    expect(w).toHaveLength(4);
    expect(w.at(-1)!.count).toBe(1);
  });
});
