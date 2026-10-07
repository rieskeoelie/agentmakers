import { describe, expect, it } from "vitest";
import { ScreenRouter } from "../../src/components/admin/app/AdminApp.js";
import { Shell } from "../../src/components/admin/app/Shell.js";
import { canOpen, NAV, parseRoute, routePath, visibleNav, type Route } from "../../src/components/admin/app/routes.js";
import { OutreachScreen } from "../../src/components/admin/outreach/OutreachWorkspace.js";
import { runMenuItems } from "../../src/components/admin/outreach/RunsView.js";
import { attentionItems } from "../../src/components/admin/screens/Overview.js";
import type { RunSummary } from "../../src/lib/outreach/ui/types.js";
import { count, fakeAdmin, renderWith } from "./helpers.js";

const ROUTES: Array<[string, Route]> = [
  ["/admin", { screen: "overview" }],
  ["/admin/outreach", { screen: "outreach", view: "runs" }],
  ["/admin/outreach/new", { screen: "outreach", view: "new" }],
  ["/admin/outreach/runs/r1", { screen: "outreach", view: "run", id: "r1" }],
  ["/admin/outreach/runs/r1/prospects", { screen: "outreach", view: "prospects", runId: "r1" }],
  ["/admin/outreach/runs/r1/duplicate", { screen: "outreach", view: "new", duplicateOf: "r1" }],
  ["/admin/outreach/prospects", { screen: "outreach", view: "prospects" }],
  ["/admin/outreach/prospects/p1", { screen: "outreach", view: "prospect", id: "p1" }],
  ["/admin/outreach/review", { screen: "outreach", view: "review" }],
  ["/admin/outreach/settings", { screen: "outreach", view: "settings" }],
  ["/admin/inbox", { screen: "inbox" }],
  ["/admin/inbox/s1", { screen: "inbox", id: "s1" }],
  ["/admin/leads", { screen: "leads" }],
  ["/admin/leads/l1", { screen: "leads", id: "l1" }],
  ["/admin/conversations/c1", { screen: "conversations", id: "c1" }],
  ["/admin/pages/pg1", { screen: "pages", id: "pg1" }],
  ["/admin/analytics", { screen: "analytics" }],
  ["/admin/team", { screen: "team" }],
  ["/admin/settings", { screen: "settings" }],
];

describe("routes", () => {
  it("every admin URL parses to its screen and back", () => {
    for (const [path, route] of ROUTES) {
      expect(parseRoute(path)).toEqual(route);
      expect(routePath(route)).toBe(path);
    }
  });
  it("unknown or unsafe segments fall back safely", () => {
    expect(parseRoute("/admin/nope")).toEqual({ screen: "overview" });
    expect(parseRoute("/admin/outreach/whatever")).toEqual({ screen: "outreach", view: "runs" });
    expect(parseRoute("/admin/leads/../../etc")).toEqual({ screen: "leads", id: undefined });
    expect(parseRoute("/admin/inbox/<script>")).toEqual({ screen: "inbox", id: undefined });
  });
});

describe("access and navigation", () => {
  const SUPER = { isAdmin: true, isSuperAdmin: true, viewingAs: false };
  const ADMIN = { isAdmin: true, isSuperAdmin: false, viewingAs: false };
  const PARTNER = { isAdmin: false, isSuperAdmin: false, viewingAs: false };
  const names = (a: typeof SUPER) => visibleNav(a).flatMap((g) => g.items.map((i) => i.screen));
  it("sidebar groups follow the frozen IA", () => {
    expect(NAV.map((g) => [g.key, g.items.map((i) => i.screen)])).toEqual([
      ["overview", ["overview"]], ["work", ["outreach", "inbox", "leads", "conversations"]], ["manage", ["pages", "analytics"]], ["admin", ["team", "settings"]],
    ]);
  });
  it("superadmin sees everything; view-as hides Pages and Team", () => {
    expect(names(SUPER)).toEqual(["overview", "outreach", "inbox", "leads", "conversations", "pages", "analytics", "team", "settings"]);
    expect(names({ ...SUPER, viewingAs: true })).toEqual(["overview", "outreach", "inbox", "leads", "conversations", "analytics", "settings"]);
  });
  it("admins get Settings but not Pages/Team; partners get neither", () => {
    expect(names(ADMIN)).not.toContain("pages");
    expect(names(ADMIN)).not.toContain("team");
    expect(names(ADMIN)).toContain("settings");
    expect(names(PARTNER)).toEqual(["overview", "outreach", "inbox", "leads", "conversations", "analytics"]);
    expect(canOpen("team", PARTNER)).toBe(false);
    expect(canOpen("settings", PARTNER)).toBe(false);
  });
  it("shell marks the active screen, shows badges, and the view-as banner", () => {
    const out = renderWith(fakeAdmin({ route: { screen: "outreach", view: "review" } }), <Shell><div /></Shell>);
    expect(out).toContain('data-testid="admin-sidebar"');
    expect(count(out, 'aria-current="page"')).toBe(1);
    expect(out).toMatch(/aria-current="page"[^>]*data-nav="outreach"/);
    expect(out).not.toContain('data-testid="view-as-banner"');
    const viewing = renderWith(fakeAdmin({ viewAs: { id: "p1", name: "Gerard" } }), <Shell><div /></Shell>);
    expect(viewing).toContain('data-testid="view-as-banner"');
    expect(viewing).toContain("Gerard");
    expect(viewing).not.toContain('data-nav="team"');
    expect(viewing).not.toContain('data-nav="pages"');
  });
  it("router refuses screens the user may not open (direct URL)", () => {
    const partner = fakeAdmin({ me: { userId: "p", displayName: "P", isAdmin: false, isSuperAdmin: false }, canOperate: false, route: { screen: "team" } });
    expect(renderWith(partner, <ScreenRouter />)).toContain("Geen toegang");
    const settings = renderWith({ ...partner, route: { screen: "settings" } }, <ScreenRouter />);
    expect(settings).toContain("Geen toegang");
    const viewAs = fakeAdmin({ viewAs: { id: "x", name: "X" }, route: { screen: "pages" } });
    expect(renderWith(viewAs, <ScreenRouter />)).toContain("Geen toegang");
  });
  it("every screen renders its first state without crashing", () => {
    for (const [, route] of ROUTES) {
      const out = renderWith(fakeAdmin({ route }), <ScreenRouter />);
      expect(out.length).toBeGreaterThan(50);
      expect(out).not.toContain("Geen toegang");
    }
  });
});

describe("outreach area", () => {
  it("one Outreach page with local tabs and a single primary action", () => {
    const out = renderWith(fakeAdmin(), <OutreachScreen route={{ screen: "outreach", view: "runs" }} />);
    for (const s of [">Runs<", ">Prospects<", ">Review<", ">Instellingen<"]) expect(out).toContain(s);
    expect(count(out, 'data-variant="primary"')).toBe(1);
    expect(out).toContain("Nieuwe run");
    const review = renderWith(fakeAdmin(), <OutreachScreen route={{ screen: "outreach", view: "review" }} />);
    expect(review).not.toContain("Nieuwe run");
    const partner = renderWith(fakeAdmin({ canOperate: false }), <OutreachScreen route={{ screen: "outreach", view: "runs" }} />);
    expect(partner).not.toContain("Nieuwe run");
  });
  it("run row actions follow the state machine; partners never get paid actions", () => {
    const base = { id: "r", name: "R", setup_state: "DONE" } as RunSummary;
    const labels = (status: RunSummary["status"], op = true) => runMenuItems({ ...base, status }, op, () => undefined, { open: () => undefined, duplicate: () => undefined }).map((i) => i.label);
    expect(labels("COMPLETED")).not.toEqual(expect.arrayContaining(["Pauzeer"]));
    expect(labels("COMPLETED").some((l) => ["Pauzeer", "Hervat", "Stop"].includes(l))).toBe(false);
    expect(labels("RUNNING")).toEqual(expect.arrayContaining(["Pauzeer", "Stop"]));
    expect(labels("PAUSED")).toEqual(expect.arrayContaining(["Hervat", "Stop", "Dupliceren"]));
    expect(labels("PAUSED", false)).not.toContain("Hervat");
    expect(labels("PAUSED", false)).not.toContain("Dupliceren");
    expect(labels("PAUSED", false)).toContain("Stop");
  });
});

describe("overview attention", () => {
  const go = { review: () => undefined, inbox: () => undefined, leads: () => undefined, run: () => undefined, settings: () => undefined };
  it("lists only what needs a human, most urgent first", () => {
    expect(attentionItems({ review: 0, inbox: 0, newLeads: 0, runs: [], sending: null }, go)).toEqual([]);
    const failed = { id: "f", name: "F", status: "FAILED", status_reason: null } as RunSummary;
    const items = attentionItems({ review: 2, inbox: 1, newLeads: 3, runs: [failed], sending: null }, go);
    expect(items.map((i) => i.key)).toEqual(["f-f", "inbox", "review", "leads"]);
    expect(items[0]!.tone).toBe("danger");
  });
});
